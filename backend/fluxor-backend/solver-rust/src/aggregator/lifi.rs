use crate::types::{Quote, RouteStep};
use crate::db::Intent;
use crate::aggregator::token_map::{resolve_token_address, resolve_token_decimals, to_smallest_units};
use reqwest::{Client, StatusCode, Url};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use chrono::Utc;
use rust_decimal::Decimal;
use rust_decimal::prelude::{FromPrimitive, ToPrimitive};
use std::str::FromStr;
use tokio::time::sleep;

// Some enum variants and helpers are intentionally unused in some builds/tests.
#[allow(dead_code)]
#[derive(Debug, Error)]
pub enum AggregatorError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("invalid response: {0}")]
    InvalidResponse(String),
    #[error("timeout")]
    Timeout,
    #[error("invalid token: {0}")]
    InvalidToken(String),
    #[error("rate limited")]
    RateLimited,
    #[error("http status: {0}")]
    HttpStatus(u16),
    #[error("parse error: {0}")]
    Parse(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NormalizedQuote {
    pub aggregator: String,
    pub chain: String,
    pub chain_id: i64,
    pub from_token: String,
    pub to_token: String,
    pub input_amount: f64,
    pub output_amount: f64,
    pub price_impact_pct: Option<f64>,
    pub gas_estimate_native: Option<f64>,
    pub gas_estimate_usd: Option<f64>,
    pub fee_usd: Option<f64>,
    pub estimate_time_seconds: Option<f64>,
    pub timestamp: i64,
    pub steps: Vec<RouteStep>,
}

const LIFI_BASE: &str = "https://li.quest";

fn build_lifi_client() -> reqwest::Client {
    let timeout = Duration::from_secs(8);
    let mut builder = reqwest::Client::builder().timeout(timeout);

    match std::env::var("LIFI_API_KEY") {
        Ok(key) if !key.is_empty() => {
            let header_value = format!("Bearer {}", key);
            match HeaderValue::from_str(&header_value) {
                Ok(hv) => {
                    let mut headers = HeaderMap::new();
                    headers.insert(AUTHORIZATION, hv);
                    builder = builder.default_headers(headers);
                }
                Err(e) => {
                    tracing::warn!("Invalid LIFI_API_KEY value for header: {}. Continuing without Authorization header", e);
                }
            }
        }
        Ok(_) => {
            tracing::warn!("LIFI_API_KEY is empty; proceeding without Authorization header");
        }
        Err(_) => {
            tracing::warn!("LIFI_API_KEY not set; LiFi requests will be unauthenticated");
        }
    }

    builder.build().unwrap_or_else(|e| {
        tracing::warn!("Failed to build LiFi reqwest client: {}. Falling back to default client", e);
        reqwest::Client::new()
    })
}

fn chain_id_to_lifi_name(chain_id: i64) -> Option<&'static str> {
    match chain_id {
        1 => Some("ethereum"),
        10 => Some("optimism"),
        56 => Some("bsc"),
        137 => Some("polygon"),
        250 => Some("fantom"),
        324 => Some("zksync"),
        42161 => Some("arbitrum"),
        43114 => Some("avalanche"),
        8453 => Some("base"),
        59144 => Some("linea"),
        _ => None,
    }
}

/// Check whether a token address is supported on a given chain by Li.Fi.
/// Currently a stub that returns `true` for all tokens. TODO: integrate LiFi
/// token metadata API to dynamically validate supported token lists per chain.
pub fn is_token_supported(_address: &str, _chain_id: i64) -> bool {
    // Hardcoded allow-all for now; replace with real metadata lookup later.
    true
}

/// Thin Aggregator implementation delegating to the existing LiFi helper.
pub struct LiFiAggregator;

#[async_trait::async_trait]
impl crate::aggregator::AggregatorQuoteProvider for LiFiAggregator {
    fn name(&self) -> &'static str {
        "lifi"
    }

    async fn get_quotes(&self, intent: &crate::db::Intent) -> Result<Vec<crate::aggregator::Route>, AggregatorError> {
        // Reuse token_map to find available chains for tokens
        use crate::aggregator::token_map::TOKEN_MAP;
        use std::collections::HashSet;

        let mut from_chains: Vec<i64> = Vec::new();
        let mut to_chains: Vec<i64> = Vec::new();

        for ((_sym, cid), _info) in TOKEN_MAP.iter() {
            if _sym == &intent.fromToken.to_uppercase() {
                from_chains.push(*cid);
            }
            if _sym == &intent.toToken.to_uppercase() {
                to_chains.push(*cid);
            }
        }

        // fallback: if token map has none, include user's chain
        if from_chains.is_empty() { from_chains.push(intent.chainId); }
        if to_chains.is_empty() { to_chains.push(intent.chainId); }

        // Build user-centric pairs (user_chain -> user_chain) and up to top-2 others
        let user_chain = intent.chainId;
        let mut other_chains: Vec<i64> = Vec::new();
        for c in from_chains.iter().chain(to_chains.iter()) {
            if *c != user_chain && !other_chains.contains(c) {
                other_chains.push(*c);
            }
        }
        other_chains.truncate(2);

        let mut chain_pairs: Vec<(i64, i64)> = vec![(user_chain, user_chain)];
        for oc in &other_chains { chain_pairs.push((user_chain, *oc)); }

        let mut out_routes: Vec<crate::aggregator::Route> = Vec::new();

        for (from_chain, to_chain) in chain_pairs.into_iter() {
            // Resolve addresses/decimals
            let from_addr = crate::aggregator::token_map::resolve_token_address(&intent.fromToken, from_chain);
            let to_addr = crate::aggregator::token_map::resolve_token_address(&intent.toToken, to_chain);
            let from_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.fromToken, from_chain).unwrap_or(18u8);
            let to_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.toToken, to_chain).unwrap_or(18u8);

            // build amount_raw
            let amount_decimal = rust_decimal::Decimal::from_f64_retain(intent.amount).unwrap_or(rust_decimal::Decimal::ZERO);
            let amount_raw = crate::aggregator::token_map::to_smallest_units(amount_decimal, from_dec);

            // slippage
            let slippage_bps: u32 = intent.slippage.map(|s| (s * 100.0) as u32).unwrap_or(50u32);

            // Skip unsupported Solana paths
            if from_chain == 101 || to_chain == 101 {
                continue;
            }

            if from_addr.is_none() || to_addr.is_none() {
                continue;
            }

            let from_addr = from_addr.unwrap();
            let to_addr = to_addr.unwrap();

            let is_same_chain = from_chain == to_chain && from_chain == intent.chainId;

            match get_multiple_quotes_for_pair(
                &from_addr,
                &to_addr,
                &amount_raw,
                from_chain,
                to_chain,
                from_dec,
                to_dec,
                slippage_bps,
                is_same_chain,
            ).await {
                Ok(quotes) => {
                    // Map NormalizedQuote -> Route
                    for q in quotes.into_iter() {
                        let r = crate::aggregator::Route {
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
                        };
                        out_routes.push(r);
                    }
                }
                Err(e) => {
                    tracing::warn!("LiFi aggregator error for pairs {}->{}: {:?}", from_chain, to_chain, e);
                    continue;
                }
            }
        }

        Ok(out_routes)
    }
}

/// Public token-based Li.Fi query. Returns normalized quotes.
pub async fn get_quotes_for_tokens(
    from_token: &str,
    to_token: &str,
    amount_raw: &str,
    chain_id: i64,
) -> Result<Vec<NormalizedQuote>, AggregatorError> {
    let from_chain = chain_id_to_lifi_name(chain_id).ok_or_else(|| AggregatorError::InvalidResponse("unsupported chain".to_string()))?;

    // resolve addresses and decimals
    let from_addr = resolve_token_address(from_token, chain_id).ok_or_else(|| AggregatorError::InvalidResponse(format!("unknown from token {} on chain {}", from_token, chain_id)))?;
    let to_addr = resolve_token_address(to_token, chain_id).ok_or_else(|| AggregatorError::InvalidResponse(format!("unknown to token {} on chain {}", to_token, chain_id)))?;
    let from_dec = resolve_token_decimals(from_token, chain_id).ok_or_else(|| AggregatorError::InvalidResponse(format!("unknown decimals for {} on {}", from_token, chain_id)))?;
    let to_dec = resolve_token_decimals(to_token, chain_id).unwrap_or(18u8);

    // amount_raw is already a smallest-unit integer string provided by caller

    let client = build_lifi_client();

    // Build request URL
    // Li.Fi expects numeric chain ids and a non-zero fromAddress for some quotes.
    // Use the numeric chain id and include a placeholder fromAddress if caller did not provide one.
    let placeholder_from_address = "0x1111111111111111111111111111111111111111";
    let url = format!("{}/v1/quote?fromChain={}&toChain={}&fromToken={}&toToken={}&fromAmount={}&fromAddress={}&slippage=0.5&integrator=Fluxor",
        LIFI_BASE, chain_id, chain_id, from_addr, to_addr, amount_raw, placeholder_from_address);

    tracing::debug!("lifi request url={}", url.as_str());

    // retries + timeout
    let mut last_err: Option<AggregatorError> = None;
    let mut parsed: Option<serde_json::Value> = None;
    for attempt in 0..3 {
        if attempt > 0 {
            let backoff_ms = 100u64 * 2u64.pow((attempt - 1) as u32);
            sleep(Duration::from_millis(backoff_ms)).await;
        }
        let resp = match client.get(url.clone()).send().await {
            Ok(r) => r,
            Err(e) => { last_err = Some(AggregatorError::Http(e)); continue; }
        };
        if !resp.status().is_success() {
            // try to capture response body for debugging
            let status = resp.status();
            let body = match resp.text().await {
                Ok(b) => b,
                Err(_) => "<failed to read body>".to_string(),
            };
            last_err = Some(AggregatorError::InvalidResponse(format!("status {} body {}", status, body)));
            continue;
        }
        match resp.json::<serde_json::Value>().await {
            Ok(v) => { parsed = Some(v); break; }
            Err(e) => { last_err = Some(AggregatorError::Http(e)); continue; }
        }
    }

    let parsed = parsed.ok_or_else(|| last_err.unwrap_or_else(|| AggregatorError::InvalidResponse("no response".to_string())))?;

    tracing::debug!("lifi response json = {}", serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| "<json err>".to_string()));

    let mut out: Vec<NormalizedQuote> = Vec::new();
    let now_ts = Utc::now().timestamp();

    // Li.Fi may return an array or object — take the first item and normalize into a single route
    let item_opt = if parsed.is_array() {
        parsed.as_array().and_then(|a| a.get(0)).cloned()
    } else if parsed.is_object() {
        Some(parsed)
    } else { None };

    if let Some(item) = item_opt {
        if let Some(mut nq) = normalize_lifi_item(&item, from_chain, chain_id, &from_addr, &to_addr, amount_raw, from_dec, to_dec, now_ts) {
            // if gas_estimate_usd missing but gas_estimate_native present, fetch native price and compute USD
            if nq.gas_estimate_usd.is_none() {
                if let Some(native) = nq.gas_estimate_native {
                    if let Some(price_dec) = crate::prices::coingecko::get_native_token_price_usd(chain_id).await {
                        if let Some(native_dec) = Decimal::from_f64(native) {
                            let gas_usd_dec = native_dec * price_dec;
                            nq.gas_estimate_usd = Some(gas_usd_dec.to_f64().unwrap_or(0.0));
                        }
                    }
                }
            }
            out.push(nq);
        }
    }

    Ok(out)
}

/// Get multiple quotes (best, mid, min) from Li.Fi for a chain pair
pub async fn get_multiple_quotes_for_pair(
    from_token_addr: &str,
    to_token_addr: &str,
    amount_raw: &str,
    from_chain_id: i64,
    to_chain_id: i64,
    from_decimals: u8,
    to_decimals: u8,
    slippage_bps: u32,
    is_same_chain: bool,
) -> Result<Vec<NormalizedQuote>, AggregatorError> {
    // return a uniform error if either chain is unsupported by LiFi
    let from_chain_name_opt = chain_id_to_lifi_name(from_chain_id);
    let to_chain_name_opt = chain_id_to_lifi_name(to_chain_id);
    if from_chain_name_opt.is_none() || to_chain_name_opt.is_none() {
        return Err(AggregatorError::InvalidResponse("unsupported chain".to_string()));
    }
    let from_chain_name = from_chain_name_opt.unwrap();
    let to_chain_name = to_chain_name_opt.unwrap();

    let client = build_lifi_client();

    let placeholder_from_address = "0x1111111111111111111111111111111111111111";

    // Normalize token identifiers for LiFi according to same-vs-cross-chain rules.
    let lifi_from = lifi_token_id(from_token_addr, from_token_addr, is_same_chain);
    let lifi_to = lifi_token_id(to_token_addr, to_token_addr, is_same_chain);
    tracing::info!("lifi normalized tokens: fromToken={} toToken={}", lifi_from, lifi_to);
    // Decide which endpoint to call: same-chain -> /v1/quote, cross-chain -> /v1/routes
    if is_same_chain {
        // Call /v1/quote and return up to one NormalizedQuote (single best quote)
        // Convert bps -> percent (e.g. 50 -> 0.5)
        let slippage = (slippage_bps as f64) / 100.0;
        let base = format!("{}/v1/quote", LIFI_BASE);
        // Include fromAddress for /v1/quote requests — LiFi requires fromAddress when a
        // token address is used. Using a placeholder address is acceptable for quote
        // preview requests when we don't have a specific user wallet address.
        // LiFi /v1/quote expects numeric chain IDs for fromChain/toChain
        // Build owned (String, String) pairs to avoid mixed reference/lifetime issues,
        // then pass (&str, &str) pairs to Url::parse_with_params.
        let mut params_vec: Vec<(String, String)> = Vec::new();
        params_vec.push(("fromChain".to_string(), format!("{}", from_chain_id)));
        params_vec.push(("toChain".to_string(), format!("{}", to_chain_id)));
        params_vec.push(("fromToken".to_string(), lifi_from.clone()));
        params_vec.push(("toToken".to_string(), lifi_to.clone()));
        params_vec.push(("fromAmount".to_string(), amount_raw.to_string()));
        params_vec.push(("fromAddress".to_string(), placeholder_from_address.to_string()));
        params_vec.push(("slippage".to_string(), format!("{}", slippage)));
        params_vec.push(("integrator".to_string(), "Fluxor".to_string()));

        let url = Url::parse_with_params(&base, params_vec.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .map_err(|e| AggregatorError::InvalidResponse(format!("failed to construct LiFi URL: {}", e)))?;

        tracing::info!("lifi quote request url={}", url.as_str());

        let mut last_err: Option<AggregatorError> = None;
        let mut parsed: Option<serde_json::Value> = None;

        for attempt in 0..3 {
            if attempt > 0 {
                let backoff_ms = 100u64 * 2u64.pow((attempt - 1) as u32);
                sleep(Duration::from_millis(backoff_ms)).await;
            }
            let resp = match client.get(url.as_str()).send().await {
                Ok(r) => r,
                Err(e) => {
                    last_err = Some(AggregatorError::Http(e));
                    continue;
                }
            };
            if !resp.status().is_success() {
                let status = resp.status();
                let body = match resp.text().await {
                    Ok(b) => b,
                    Err(_) => "<failed to read body>".to_string(),
                };
                last_err = Some(AggregatorError::InvalidResponse(format!("status {} body {}", status, body)));
                continue;
            }
            match resp.json::<serde_json::Value>().await {
                Ok(v) => { parsed = Some(v); break; }
                Err(e) => { last_err = Some(AggregatorError::Http(e)); continue; }
            }
        }

        let parsed = parsed.ok_or_else(|| last_err.unwrap_or_else(|| AggregatorError::InvalidResponse("no response".to_string())))?;
        tracing::info!("lifi quote response json = {}", serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| "<json err>".to_string()));

        // Normalize single-quote response into NormalizedQuote
        let now_ts = Utc::now().timestamp();
        let mut out: Vec<NormalizedQuote> = Vec::new();

        // LiFi quote may be object or array; choose first object
        let item = if parsed.is_array() { parsed.as_array().and_then(|a| a.get(0)).cloned().unwrap_or(parsed) } else { parsed };

        // Extract toAmount from top-level or estimate.toAmount
        let to_amount_str = item.get("toAmount").and_then(|v| v.as_str())
            .or_else(|| item.get("estimate").and_then(|est| est.get("toAmount")).and_then(|v| v.as_str()))
            .unwrap_or("0");

        let to_amount_raw = Decimal::from_str(to_amount_str).unwrap_or(Decimal::ZERO);
        let denom_str = format!("1{}", "0".repeat(to_decimals as usize));
        let denom = Decimal::from_str(&denom_str).unwrap_or(Decimal::ONE);
        let output_amount_dec = if denom.is_zero() { Decimal::ZERO } else { to_amount_raw / denom };
        let output_amount = output_amount_dec.to_f64().unwrap_or(0.0);

        // gasUSD
        let mut gas_est_usd_total: Option<f64> = None;
        if let Some(est) = item.get("estimate") {
            if let Some(gas_costs) = est.get("gasCosts").and_then(|g| g.as_array()) {
                let mut sum = 0.0f64;
                for g in gas_costs.iter() {
                    if let Some(ausd) = g.get("amountUSD").and_then(|x| x.as_f64()) {
                        sum += ausd;
                    }
                }
                gas_est_usd_total = Some(sum);
            }
        }

        // fee
        let fee_usd = item.get("estimate").and_then(|est| est.get("totalFeeUSD")).and_then(|v| v.as_f64());

        // estimate time
        let estimate_time = item.get("estimate").and_then(|est| est.get("approximateTime")).and_then(|v| v.as_f64());

        // steps
        let mut steps_vec: Vec<RouteStep> = Vec::new();
        if let Some(steps) = item.get("steps").and_then(|s| s.as_array()) {
            for st in steps.iter().take(20) {
                let mut desc = String::new();
                if let Some(typ) = st.get("type").and_then(|t| t.as_str()) {
                    desc.push_str(typ);
                }
                if let Some(inc) = st.get("includedSteps").and_then(|i| i.as_array()) {
                    for inc_st in inc.iter() {
                        let sdesc = inc_st.get("description").and_then(|d| d.as_str()).unwrap_or("");
                        if !sdesc.is_empty() {
                            if !desc.is_empty() { desc.push_str(" | "); }
                            desc.push_str(sdesc);
                        }
                    }
                }
                if desc.is_empty() {
                    desc = st.get("description").and_then(|d| d.as_str()).unwrap_or("lifi step").to_string();
                }
                steps_vec.push(RouteStep { description: desc });
            }
        }

        // build NormalizedQuote
        let nq = NormalizedQuote {
            aggregator: "lifi".to_string(),
            chain: to_chain_name.to_string(),
            chain_id: to_chain_id,
            from_token: from_token_addr.to_string(),
            to_token: to_token_addr.to_string(),
            input_amount: Decimal::from_str(amount_raw).ok().and_then(|d| d.to_f64()).unwrap_or(0.0),
            output_amount,
            price_impact_pct: item.get("priceImpact").and_then(|v| v.as_f64()),
            gas_estimate_native: None,
            gas_estimate_usd: gas_est_usd_total,
            fee_usd,
            estimate_time_seconds: estimate_time,
            timestamp: now_ts,
            steps: steps_vec,
        };

        out.push(nq);
        return Ok(out);
    } else {
        // Cross-chain: use existing /v1/routes behavior (multi-route). Keep previous logic.
        // Convert bps -> percent value expected by LiFi (e.g. 50 bps -> 0.5)
        let slippage = (slippage_bps as f64) / 100.0;
        let slippage_str = format!("{}", slippage);

        // Build /v1/routes URL with params and proper percent-encoding
        let base = format!("{}/v1/routes", LIFI_BASE);
        // Use normalized token ids for LiFi; ensure toAddress is a wallet address (use placeholder here)
        let mut params_vec: Vec<(String, String)> = Vec::new();
        params_vec.push(("fromChain".to_string(), from_chain_name.to_string()));
        params_vec.push(("toChain".to_string(), to_chain_name.to_string()));
        params_vec.push(("fromToken".to_string(), lifi_from.clone()));
        params_vec.push(("toToken".to_string(), lifi_to.clone()));
        params_vec.push(("fromAmount".to_string(), amount_raw.to_string()));
        params_vec.push(("fromAddress".to_string(), placeholder_from_address.to_string()));
        // toAddress must be a wallet destination, not the token address
        params_vec.push(("toAddress".to_string(), placeholder_from_address.to_string()));
        params_vec.push(("slippage".to_string(), slippage_str.clone()));
        params_vec.push(("integrator".to_string(), "Fluxor".to_string()));

        let url = Url::parse_with_params(&base, params_vec.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .map_err(|e| AggregatorError::InvalidResponse(format!("failed to construct LiFi URL: {}", e)))?;

        tracing::debug!("lifi multi-route request url={}", url.as_str());

        let mut last_err: Option<AggregatorError> = None;
        let mut parsed: Option<serde_json::Value> = None;

        for attempt in 0..3 {
            if attempt > 0 {
                let backoff_ms = 100u64 * 2u64.pow((attempt - 1) as u32);
                sleep(Duration::from_millis(backoff_ms)).await;
            }
            let resp = match client.get(url.as_str()).send().await {
                Ok(r) => r,
                Err(e) => {
                    last_err = Some(AggregatorError::Http(e));
                    continue;
                }
            };
            if !resp.status().is_success() {
                let status = resp.status();
                let body = match resp.text().await {
                    Ok(b) => b,
                    Err(_) => "<failed to read body>".to_string(),
                };
                last_err = Some(AggregatorError::InvalidResponse(format!(
                    "status {} body {}",
                    status, body
                )));
                continue;
            }
            match resp.json::<serde_json::Value>().await {
                Ok(v) => {
                    parsed = Some(v);
                    break;
                }
                Err(e) => {
                    last_err = Some(AggregatorError::Http(e));
                    continue;
                }
            }
        }

        let parsed = parsed.ok_or_else(|| {
            last_err.unwrap_or_else(|| AggregatorError::InvalidResponse("no response".to_string()))
        })?;

        tracing::debug!(
            "lifi multi-route response json = {}",
            serde_json::to_string_pretty(&parsed)
                .unwrap_or_else(|_| "<json err>".to_string())
        );

        let mut out: Vec<NormalizedQuote> = Vec::new();
        let now_ts = Utc::now().timestamp();

        // Parse routes array if present
        if let Some(routes_array) = parsed.get("routes").and_then(|r| r.as_array()) {
            for route in routes_array.iter().take(3) {
                if let Some(mut nq) = normalize_lifi_item(
                    route,
                    to_chain_name,
                    to_chain_id,
                    from_token_addr,
                    to_token_addr,
                    amount_raw,
                    from_decimals,
                    to_decimals,
                    now_ts,
                ) {
                    // Apply integrator fee
                    nq.output_amount *= 0.999;

                    // Compute gas USD if missing
                    if nq.gas_estimate_usd.is_none() {
                        if let Some(native) = nq.gas_estimate_native {
                            if let Some(price_dec) = crate::prices::coingecko::get_native_token_price_usd(to_chain_id).await {
                                if let Some(native_dec) = Decimal::from_f64(native) {
                                    let gas_usd_dec = native_dec * price_dec;
                                    nq.gas_estimate_usd = Some(gas_usd_dec.to_f64().unwrap_or(0.0));
                                }
                            }
                        }
                    }

                    out.push(nq);
                }
            }
        } else if let Some(route) = parsed.get("route") {
            // Single route fallback
            if let Some(mut nq) = normalize_lifi_item(
                route,
                to_chain_name,
                to_chain_id,
                from_token_addr,
                to_token_addr,
                amount_raw,
                from_decimals,
                to_decimals,
                now_ts,
            ) {
                // Apply integrator fee
                nq.output_amount *= 0.999;

                // Compute gas USD if missing
                if nq.gas_estimate_usd.is_none() {
                    if let Some(native) = nq.gas_estimate_native {
                        if let Some(price_dec) = crate::prices::coingecko::get_native_token_price_usd(to_chain_id).await {
                            if let Some(native_dec) = Decimal::from_f64(native) {
                                let gas_usd_dec = native_dec * price_dec;
                                nq.gas_estimate_usd = Some(gas_usd_dec.to_f64().unwrap_or(0.0));
                            }
                        }
                    }
                }

                out.push(nq);
            }
        }

        Ok(out)
    }
}

fn normalize_lifi_item(
    val: &serde_json::Value,
    chain: &str,
    chain_id: i64,
    from_token_addr: &str,
    to_token_addr: &str,
    input_amount_raw: &str,
    from_dec: u8,
    to_dec: u8,
    now_ts: i64,
) -> Option<NormalizedQuote> {
    // toAmount is located under estimate.toAmount in LiFi responses
    let to_amount_str = val
        .get("estimate")
        .and_then(|est| est.get("toAmount"))
        .and_then(|v| v.as_str())
        .unwrap_or("0");

    let to_amount_raw = Decimal::from_str(to_amount_str).unwrap_or(Decimal::ZERO);

    // SAFE denominator: construct 10^dec as a decimal via string to avoid overflow
    let denom_str = format!("1{}", "0".repeat(to_dec as usize));
    let denom = Decimal::from_str(&denom_str).unwrap_or(Decimal::ONE);
    let output_amount_dec = if denom.is_zero() { Decimal::ZERO } else { to_amount_raw / denom };
    let output_amount = output_amount_dec.to_f64().unwrap_or(0.0);

    let price_impact = val.get("priceImpact").and_then(|v| v.as_f64());

    // parse gasCosts if present (estimate.gasCosts[] may contain amount (raw), nativeAmount or amountUSD)
    let mut gas_estimate_native: Option<f64> = None;
    let mut gas_estimate_usd: Option<f64> = None;
    if let Some(est) = val.get("estimate") {
        if let Some(gas_costs) = est.get("gasCosts").and_then(|g| g.as_array()) {
            let mut sum_usd = 0.0f64;
            let mut native_sum = Decimal::ZERO;
            for g in gas_costs.iter() {
                // prefer amountUSD when present
                if let Some(ausd) = g.get("amountUSD").and_then(|x| x.as_f64()) {
                    sum_usd += ausd;
                }

                // try to extract native amount: 'nativeAmount' (float) or 'amount' (raw integer string)
                if let Some(native_f) = g.get("nativeAmount").and_then(|x| x.as_f64()) {
                    if let Some(d) = Decimal::from_f64(native_f) {
                        native_sum += d;
                    }
                } else if let Some(amount_str) = g.get("amount").and_then(|x| x.as_str()) {
                    // amount is an integer string, convert by token.decimals if present
                    if let Ok(amount_dec) = Decimal::from_str(amount_str) {
                        // token decimals may be provided under g.token.decimals
                        let token_decimals = g
                            .get("token")
                            .and_then(|t| t.get("decimals"))
                            .and_then(|d| d.as_u64())
                            .unwrap_or(18) as u8;
                        // safe denom construction via string to avoid pow overflow
                        let denom_str = format!("1{}", "0".repeat(token_decimals as usize));
                        if let Ok(denom) = Decimal::from_str(&denom_str) {
                            if !denom.is_zero() {
                                let native_dec = amount_dec / denom;
                                native_sum += native_dec;
                            }
                        }
                    }
                }
            }
            if sum_usd > 0.0 {
                gas_estimate_usd = Some(sum_usd);
            }
            if !native_sum.is_zero() {
                gas_estimate_native = native_sum.to_f64();
            }
        }
    }

    // fee parsing: prefer estimate.totalFeeUSD, otherwise sum estimate.feeCosts[].amountUSD
    let mut fee_usd: Option<f64> = None;
    if let Some(f) = val.get("totalFeeUSD").and_then(|v| v.as_f64()) {
        fee_usd = Some(f);
    } else if let Some(est) = val.get("estimate") {
        if let Some(tf) = est.get("totalFeeUSD").and_then(|v| v.as_f64()) {
            fee_usd = Some(tf);
        } else if let Some(fees) = est.get("feeCosts").and_then(|f| f.as_array()) {
            let mut sum = 0.0f64;
            for fc in fees.iter() {
                if let Some(ausd) = fc.get("amountUSD").and_then(|x| x.as_f64()) {
                    sum += ausd;
                }
            }
            if sum > 0.0 { fee_usd = Some(sum); }
        }
    }

    // estimate.executionDuration
    let estimate_time = if let Some(est) = val.get("estimate") {
        if let Some(dur) = est.get("executionDuration").and_then(|v| v.as_f64()) {
            tracing::debug!("lifi estimate.executionDuration = {}", dur);
            Some(dur)
        } else if let Some(dur2) = est.get("approximateTime").and_then(|v| v.as_f64()) {
            tracing::debug!("lifi estimate.approximateTime = {}", dur2);
            Some(dur2)
        } else {
            None
        }
    } else { None };

    let mut steps: Vec<RouteStep> = Vec::new();
    if let Some(s) = val.get("steps") {
        if let Some(arr) = s.as_array() {
            for st in arr.iter().take(20) {
                // combine step.type and includedSteps[].description if present
                let mut desc_parts: Vec<String> = Vec::new();
                if let Some(typ) = st.get("type").and_then(|t| t.as_str()) {
                    desc_parts.push(typ.to_string());
                }
                if let Some(inc) = st.get("includedSteps").and_then(|i| i.as_array()) {
                    for inc_st in inc.iter() {
                        if let Some(sdesc) = inc_st.get("description").and_then(|d| d.as_str()) {
                            desc_parts.push(sdesc.to_string());
                        }
                    }
                }
                let desc = if desc_parts.is_empty() {
                    st.get("description").and_then(|d| d.as_str()).unwrap_or("lifi step").to_string()
                } else {
                    desc_parts.join(" | ")
                };
                steps.push(RouteStep { description: desc });
            }
        }
    }

    // convert input_amount_raw (smallest units string) back to human for logging/normalization
    let input_amount_human = if let Ok(i) = input_amount_raw.parse::<i128>() {
        let dec = Decimal::from_i128_with_scale(i, 0);
        let factor = Decimal::from_i128_with_scale(10i128.pow(from_dec as u32), 0);
        (dec / factor).to_f64().unwrap_or(0.0)
    } else { 0.0 };

    Some(NormalizedQuote {
        aggregator: "lifi".to_string(),
        chain: chain.to_string(),
        chain_id,
        from_token: from_token_addr.to_string(),
        to_token: to_token_addr.to_string(),
        input_amount: input_amount_human,
        output_amount,
        price_impact_pct: price_impact,
        gas_estimate_native,
        gas_estimate_usd,
        fee_usd,
        estimate_time_seconds: estimate_time,
        timestamp: now_ts,
        steps,
    })
}

/// Normalize a token identifier for LiFi requests.
/// - `symbol`: the caller-provided token identifier (may be a symbol like "ETH" or an address)
/// - `addr`: the token contract address (if available)
/// - `is_same_chain`: true for same-chain `/v1/quote` calls
///
/// Rules:
/// - If `symbol` appears to be an address (starts with "0x"), return the address (ERC20)
/// - If `symbol` is a known native symbol and `is_same_chain` is true, return the symbol (e.g. "ETH")
/// - If `symbol` is a known native symbol and `is_same_chain` is false, return the zero address (cross-chain native)
/// - Otherwise return the provided `addr` (ERC20 fallback)
fn lifi_token_id(symbol: &str, addr: &str, is_same_chain: bool) -> String {
    // quick heuristic: if it looks like an address, return it
    let s = symbol.trim();
    if s.len() > 1 && s.starts_with("0x") {
        return s.to_string();
    }

    // known native token symbols (common subset)
    let native_symbols = ["ETH", "MATIC", "AVAX", "FTM", "BNB", "ONE", "MOVR", "XDAI", "NEAR", "SOL"];
    let up = s.to_uppercase();
    if native_symbols.contains(&up.as_str()) {
        if is_same_chain {
            return up; // return symbol string for same-chain
        } else {
            return "0x0000000000000000000000000000000000000000".to_string(); // zero address for cross-chain native
        }
    }

    // fallback: return provided token address if available, otherwise the original string
    if addr.len() > 0 { addr.to_string() } else { s.to_string() }
}

/// Backwards-compatible intent-based function that maps NormalizedQuote -> internal Quote
pub async fn get_quotes(intent: &Intent) -> Result<Vec<Quote>, AggregatorError> {
    // Resolve token addresses
    let from_address = resolve_token_address(&intent.fromToken, intent.chainId)
        .ok_or_else(|| AggregatorError::InvalidToken(intent.fromToken.clone()))?;
    let to_address = resolve_token_address(&intent.toToken, intent.chainId)
        .ok_or_else(|| AggregatorError::InvalidToken(intent.toToken.clone()))?;

    // Decimals and amount conversion
    let from_dec = resolve_token_decimals(&intent.fromToken, intent.chainId)
        .ok_or_else(|| AggregatorError::InvalidToken(intent.fromToken.clone()))?;
    let to_dec = resolve_token_decimals(&intent.toToken, intent.chainId).unwrap_or(18u8);

    let amount_decimal = Decimal::from_f64(intent.amount).ok_or_else(|| AggregatorError::Parse("invalid amount".to_string()))?;
    let amount_raw = to_smallest_units(amount_decimal, from_dec);

    // build client with 5s timeout
    let client = build_lifi_client();

    let chain_name = chain_id_to_lifi_name(intent.chainId).ok_or_else(|| AggregatorError::InvalidResponse("unsupported chain".to_string()))?;

    // Use intent.slippage if available; otherwise default to 0.5
    let slippage = 0.5f64;

    let url = format!("{}/v1/quote?fromChain={}&toChain={}&fromToken={}&toToken={}&fromAmount={}&slippage={}",
        LIFI_BASE, chain_name, chain_name, from_address, to_address, amount_raw, slippage);

    tracing::debug!("lifi request url={}", url);

    let resp = client.get(&url).send().await?;

    if resp.status() == StatusCode::TOO_MANY_REQUESTS {
        return Err(AggregatorError::RateLimited);
    }
    if !resp.status().is_success() {
        return Err(AggregatorError::HttpStatus(resp.status().as_u16()));
    }

    let parsed: serde_json::Value = resp.json().await.map_err(|e| AggregatorError::Parse(e.to_string()))?;

    tracing::debug!("lifi response json = {}", serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| "<json err>".to_string()));

    // Extract fields
    let item = if parsed.is_array() {
        parsed.as_array().and_then(|a| a.get(0)).cloned().unwrap_or(parsed)
    } else { parsed };

    // toAmount (raw integer string)
    let to_amount_raw = item.get("toAmount").and_then(|v| v.as_str()).unwrap_or("0");
    let to_amount_int = to_amount_raw.parse::<i128>().ok();
    let output_amount = to_amount_int.map(|i| {
        let dec = Decimal::from_i128_with_scale(i, 0);
        let factor = Decimal::from_i128_with_scale(10i128.pow(to_dec as u32), 0);
        let human = dec / factor;
        human.to_f64().unwrap_or(0.0)
    }).unwrap_or(0.0);

    // estimate.gasCosts[].amountUSD
    let mut gas_est_usd_total: Option<f64> = None;
    if let Some(est) = item.get("estimate") {
        if let Some(gas_costs) = est.get("gasCosts").and_then(|g| g.as_array()) {
            let mut sum = 0.0f64;
            for g in gas_costs.iter() {
                if let Some(ausd) = g.get("amountUSD").and_then(|x| x.as_f64()) {
                    sum += ausd;
                }
            }
            gas_est_usd_total = Some(sum);
        }
    }

    // estimate.totalFeeUSD
    let fee_usd = item.get("estimate").and_then(|est| est.get("totalFeeUSD")).and_then(|v| v.as_f64());

    // estimate.approximateTime
    let estimate_time = item.get("estimate").and_then(|est| est.get("approximateTime")).and_then(|v| v.as_f64());

    // steps[].type and includedSteps[]
    let mut steps_vec: Vec<RouteStep> = Vec::new();
    if let Some(steps) = item.get("steps").and_then(|s| s.as_array()) {
        for st in steps.iter().take(20) {
            let mut desc = String::new();
            if let Some(typ) = st.get("type").and_then(|t| t.as_str()) {
                desc.push_str(typ);
            }
            if let Some(inc) = st.get("includedSteps").and_then(|i| i.as_array()) {
                for inc_st in inc.iter() {
                    let sdesc = inc_st.get("description").and_then(|d| d.as_str()).unwrap_or("");
                    if !sdesc.is_empty() {
                        if !desc.is_empty() { desc.push_str(" | "); }
                        desc.push_str(sdesc);
                    }
                }
            }
            if desc.is_empty() {
                desc = st.get("description").and_then(|d| d.as_str()).unwrap_or("lifi step").to_string();
            }
            steps_vec.push(RouteStep { description: desc });
        }
    }

    let now_ts = Utc::now().timestamp();

    let nq = NormalizedQuote {
        aggregator: "lifi".to_string(),
        chain: chain_name.to_string(),
        chain_id: intent.chainId,
        from_token: from_address.to_string(),
        to_token: to_address.to_string(),
        input_amount: intent.amount,
        output_amount,
        price_impact_pct: item.get("priceImpact").and_then(|v| v.as_f64()),
        gas_estimate_native: None,
        gas_estimate_usd: gas_est_usd_total,
        fee_usd,
        estimate_time_seconds: estimate_time,
        timestamp: now_ts,
        steps: steps_vec,
    };

    // Return exactly one element for now
    let mut out_q: Vec<Quote> = Vec::new();
    out_q.push(Quote {
        aggregator: nq.aggregator.clone(),
        from_token: nq.from_token.clone(),
        to_token: nq.to_token.clone(),
        amount_from: nq.input_amount,
        amount_to: nq.output_amount,
        estimated_gas: nq.gas_estimate_native.unwrap_or(0.0) as u64,
        steps: nq.steps.clone(),
        cost: (nq.input_amount - nq.output_amount).abs(),
    });

    Ok(out_q)
}


#[cfg(test)]
mod tests {
    use super::*;

    // Integration-style test: ETH -> USDC on chain 1 should yield a positive output amount
    #[tokio::test]
    #[ignore = "integration"]
    async fn eth_to_usdc_best_output_positive() {
        // 1 ETH in wei
        let amount_raw = "1000000000000000000";
        // USDC contract on Ethereum mainnet
        let usdc = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

        let quotes = get_multiple_quotes_for_pair(
            "ETH",
            usdc,
            amount_raw,
            1,
            1,
            18u8,
            6u8,
            50u32,
            true,
        )
        .await
        .expect("LiFi call failed");

        assert!(!quotes.is_empty(), "expected at least one quote from LiFi");
        let best = &quotes[0];
        assert!(best.output_amount > 0.0, "expected bestRoute.output_amount > 0");
    }
}

