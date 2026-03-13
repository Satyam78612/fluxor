use crate::aggregator::lifi::NormalizedQuote;
use crate::types::RouteStep;
use reqwest::Client;
use std::time::Duration;
use thiserror::Error;
use chrono::Utc;
use rust_decimal::prelude::ToPrimitive;

#[derive(Debug, Error)]
pub enum JupiterError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("invalid response: {0}")]
    InvalidResponse(String),
}

const JUPITER_API_HOST: &str = "https://quote-api.jup.ag/v6/quote";

const JUPITER_FALLBACKS: [&str; 3] = [
    "https://172.67.196.149/v6/quote",
    "https://104.26.8.96/v6/quote",
    "https://104.26.9.96/v6/quote",
];

/// Try primary endpoint then fallbacks until one returns JSON
async fn try_endpoints(client: &Client, body: &serde_json::Value) -> Result<serde_json::Value, JupiterError> {
    let mut last_err: Option<JupiterError> = None;

    let mut endpoints: Vec<&str> = Vec::new();
    endpoints.push(JUPITER_API_HOST);
    endpoints.extend(JUPITER_FALLBACKS.iter().copied());

    for ep in endpoints {
        let resp = match client.post(ep).json(body).send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("jupiter request failed on {}: {}", ep, e);
                last_err = Some(JupiterError::Http(e));
                continue;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_else(|_| "<failed body>".to_string());
            tracing::warn!("jupiter status {} body {}", status, body_text);
            last_err = Some(JupiterError::InvalidResponse(format!("status {} body {}", status, body_text)));
            continue;
        }

        match resp.json::<serde_json::Value>().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                tracing::warn!("jupiter json parse error on {}: {}", ep, e);
                last_err = Some(JupiterError::Http(e));
                continue;
            }
        }
    }

    Err(last_err.unwrap_or_else(|| JupiterError::InvalidResponse("no response from jupiter".to_string())))
}

/// Convert Jupiter route into NormalizedQuote
async fn normalize_route_item(
    item: &serde_json::Value,
    from_mint: &str,
    to_mint: &str,
    input_amount_raw: &str,
    now_ts: i64,
) -> Option<NormalizedQuote> {
    let out_amount_str = item.get("outAmount").and_then(|v| v.as_str()).unwrap_or("0");
    let in_amount_str = item.get("inAmount").and_then(|v| v.as_str()).unwrap_or(input_amount_raw);

    let out_raw = out_amount_str.parse::<f64>().unwrap_or(0.0);
    let in_raw = in_amount_str.parse::<f64>().unwrap_or(0.0);

    // Resolve decimals via token_map (Solana default 9)
    let to_dec = crate::aggregator::token_map::resolve_token_decimals(&to_mint, 101).unwrap_or(9u8);
    let from_dec = crate::aggregator::token_map::resolve_token_decimals(&from_mint, 101).unwrap_or(9u8);

    let denom_in = 10f64.powi(from_dec as i32);
    let denom_out = 10f64.powi(to_dec as i32);

    let input_amount_human = in_raw / denom_in;
    let mut output_amount_human = out_raw / denom_out;

    // integrator fee small adjustment
    output_amount_human *= 0.999;

    // fetch sol price
    let sol_price_dec = crate::prices::coingecko::get_native_token_price_usd(101).await;
    let sol_price = sol_price_dec.and_then(|d| d.to_f64()).unwrap_or(0.0);

    // fee usd estimate (0.1% fallback)
    let fee_usd = item
        .get("feeUsd")
        .and_then(|v| v.as_f64())
        .or_else(|| Some(input_amount_human * 0.001 * sol_price));

    // compute units → USD gas
    let compute_units = item
        .get("computeUnits")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let gas_estimate_usd = if compute_units > 0.0 {
        Some(compute_units * sol_price / 1e9)
    } else {
        None
    };

    // routePlan -> steps
    let mut steps: Vec<RouteStep> = Vec::new();
    if let Some(rp) = item.get("routePlan") {
        if let Some(arr) = rp.as_array() {
            for step in arr.iter() {
                let desc = if let Some(p) = step.get("programId").and_then(|v| v.as_str()) {
                    format!("jupiter program {}", p)
                } else if let Some(s) = step.get("label").and_then(|v| v.as_str()) {
                    s.to_string()
                } else {
                    format!("jupiter step: {}", serde_json::to_string(step).unwrap_or_default())
                };
                steps.push(RouteStep { description: desc });
            }
        }
    }

    if steps.is_empty() {
        steps.push(RouteStep { description: "jupiter-swap".to_string() });
    }

    Some(NormalizedQuote {
        aggregator: "jupiter".to_string(),
        chain: "solana".to_string(),
        chain_id: 101,
        from_token: from_mint.to_string(),
        to_token: to_mint.to_string(),
        input_amount: input_amount_human,
        output_amount: output_amount_human,
        price_impact_pct: item.get("priceImpactPct").and_then(|v| v.as_f64()),
        gas_estimate_native: None,
        gas_estimate_usd,
        fee_usd,
        estimate_time_seconds: item.get("estimateTimeSec").and_then(|v| v.as_f64()).or(Some(2.0)),
        timestamp: now_ts,
        steps,
    })
}

/// Public: return up to 3 quotes (standard, higher slippage, direct-only)
pub async fn get_multiple_quotes_for_pair(
    from_mint: &str,
    to_mint: &str,
    amount_raw: &str,
) -> Result<Vec<NormalizedQuote>, JupiterError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(6))
        .build()?;

    let now_ts = Utc::now().timestamp();

    let variants = vec![
        serde_json::json!({
            "inputMint": from_mint,
            "outputMint": to_mint,
            "amount": amount_raw,
            "slippageBps": 50,
            "onlyDirectRoutes": false
        }),
        serde_json::json!({
            "inputMint": from_mint,
            "outputMint": to_mint,
            "amount": amount_raw,
            "slippageBps": 200,
            "onlyDirectRoutes": false
        }),
        serde_json::json!({
            "inputMint": from_mint,
            "outputMint": to_mint,
            "amount": amount_raw,
            "slippageBps": 50,
            "onlyDirectRoutes": true
        }),
    ];

    let mut out: Vec<NormalizedQuote> = Vec::new();

    for body in variants {
        match try_endpoints(&client, &body).await {
            Ok(parsed) => {
                if let Some(routes) = parsed.get("data").and_then(|d| d.as_array()) {
                    if let Some(first) = routes.get(0) {
                        if let Some(nq) =
                            normalize_route_item(first, from_mint, to_mint, amount_raw, now_ts).await
                        {
                            out.push(nq);
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!("jupiter endpoint failed: {:?}", e);
                continue;
            }
        }
    }

    // dedupe by output amount
    let mut seen = std::collections::HashSet::new();
    out.retain(|q| {
        let key = (q.output_amount * 1e8).round() as i128;
        seen.insert(key)
    });

    Ok(out)
}

pub struct JupiterAggregator;

#[async_trait::async_trait]
impl crate::aggregator::AggregatorQuoteProvider for JupiterAggregator {
    fn name(&self) -> &'static str { "jupiter" }

    async fn get_quotes(&self, intent: &crate::db::Intent) -> Result<Vec<crate::aggregator::Route>, crate::aggregator::lifi::AggregatorError> {
        // Only operate when either the intent chain is Solana **or** either token resolves to a Solana mint
        let is_solana_intent = intent.chainId == 101;
        let from_on_solana = crate::aggregator::token_map::resolve_token_address(&intent.fromToken, 101).is_some();
        let to_on_solana = crate::aggregator::token_map::resolve_token_address(&intent.toToken, 101).is_some();

        if !(is_solana_intent || from_on_solana || to_on_solana) {
            return Ok(Vec::new());
        }

        // Resolve Solana mint addresses via token_map or expect user to pass mint addresses
        let from_mint = crate::aggregator::token_map::resolve_token_address(&intent.fromToken, 101).unwrap_or_else(|| intent.fromToken.clone());
        let to_mint = crate::aggregator::token_map::resolve_token_address(&intent.toToken, 101).unwrap_or_else(|| intent.toToken.clone());

        let amount_raw = (intent.amount * 1e9) as i64; // sol decimals
        let amount_raw_s = amount_raw.to_string();

        match get_multiple_quotes_for_pair(&from_mint, &to_mint, &amount_raw_s).await {
            Ok(nqs) => {
                let mut out: Vec<crate::aggregator::Route> = Vec::new();
                for q in nqs.into_iter() {
                    out.push(crate::aggregator::Route {
                        aggregator: q.aggregator.clone(),
                        from_chain: q.chain_id,
                        to_chain: q.chain_id,
                        from_token: q.from_token.clone(),
                        to_token: q.to_token.clone(),
                        input_amount: q.input_amount,
                        output_amount: q.output_amount,
                        gas_cost_usd: q.gas_estimate_usd,
                        bridge_fee_usd: q.fee_usd,
                        execution_time_sec: q.estimate_time_seconds,
                        raw_tx: None,
                        steps: q.steps.clone(),
                    });
                }
                Ok(out)
            }
            Err(e) => {
                tracing::warn!("Jupiter aggregator error: {:?}", e);
                Err(crate::aggregator::lifi::AggregatorError::InvalidResponse("jupiter error".to_string()))
            }
        }
    }
}
