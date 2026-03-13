use async_trait::async_trait;
use crate::aggregator::Route;
use crate::db::Intent;
use crate::aggregator::lifi::AggregatorError;
use reqwest::Client;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use std::time::Duration;
use std::str::FromStr;

const BUNGEE_API: &str = "https://dedicated-backend.bungee.exchange/api/v1/bungee/quote";
const BUNGEE_USER_ADDRESS: &str = "0x1111111111111111111111111111111111111111";

pub struct BungeeAggregator;

#[async_trait]
impl crate::aggregator::AggregatorQuoteProvider for BungeeAggregator {
    fn name(&self) -> &'static str { "socket" }

    async fn get_quotes(&self, intent: &crate::db::Intent) -> Result<Vec<crate::aggregator::Route>, crate::aggregator::lifi::AggregatorError> {
        tracing::info!("BungeeAggregator: fetching quotes for {} -> {} on chain {}", intent.fromToken, intent.toToken, intent.chainId);

        // Only consider EVM <-> EVM pairs for Bungee/Socket
        fn is_evm(chain_id: i64) -> bool {
            matches!(chain_id, 1 | 10 | 42161 | 137 | 56 | 43114 | 250 | 8453 | 59144 | 196 | 999 | 9745 | 80094 | 4200 | 146)
        }

        use crate::aggregator::token_map::TOKEN_MAP;

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
        if from_chains.is_empty() { from_chains.push(intent.chainId); }
        if to_chains.is_empty() { to_chains.push(intent.chainId); }

        // Build user-centric pairs
        let user_chain = intent.chainId;
        let mut other_chains: Vec<i64> = Vec::new();
        for c in from_chains.iter().chain(to_chains.iter()) {
            if *c != user_chain && !other_chains.contains(c) {
                other_chains.push(*c);
            }
        }
        other_chains.truncate(2);

        let mut chain_pairs: Vec<(i64,i64)> = Vec::new();
        for oc in &other_chains { chain_pairs.push((user_chain,*oc)); }

        // Build HTTP client with optional API key
        let client = reqwest::Client::builder().timeout(Duration::from_secs(6)).build().map_err(|e| AggregatorError::Http(e))?;

        // prefer SOCKET_API_KEY, fallback to BUNGEE_API_KEY
        let api_key = std::env::var("SOCKET_API_KEY").ok().or_else(|| std::env::var("BUNGEE_API_KEY").ok());

        let mut out: Vec<crate::aggregator::Route> = Vec::new();

        let amt_dec = Decimal::from_f64_retain(intent.amount).unwrap_or(Decimal::ZERO);

        for (from_chain, to_chain) in chain_pairs.into_iter() {
            // Only EVM->EVM cross-chain/quote
            if !(is_evm(from_chain) && is_evm(to_chain)) {
                continue;
            }

            // Skip same-chain for Bungee if desired (Bungee focuses on cross-chain), but we allow same-chain too
            // Resolve token addresses
            let from_addr = match crate::aggregator::token_map::resolve_token_address(&intent.fromToken, from_chain) {
                Some(a) => a,
                None => { tracing::debug!("Bungee: from token {} not on chain {}", intent.fromToken, from_chain); continue; }
            };
            let to_addr = match crate::aggregator::token_map::resolve_token_address(&intent.toToken, to_chain) {
                Some(a) => a,
                None => { tracing::debug!("Bungee: to token {} not on chain {}", intent.toToken, to_chain); continue; }
            };

            let from_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.fromToken, from_chain).unwrap_or(18u8);
            let to_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.toToken, to_chain).unwrap_or(18u8);

            // amount in smallest units string
            let amount_raw = crate::aggregator::token_map::to_smallest_units(amt_dec, from_dec);

                // Build query parameters for GET request to dedicated Bungee endpoint
                let slippage_bps: u32 = intent.slippage.map(|s| (s * 100.0) as u32).unwrap_or(50u32);
                let query = [
                    ("fromChainId", from_chain.to_string()),
                    ("toChainId", to_chain.to_string()),
                    ("fromTokenAddress", from_addr.clone()),
                    ("toTokenAddress", to_addr.clone()),
                    ("amount", amount_raw.clone()),
                    ("userAddress", BUNGEE_USER_ADDRESS.to_string()),
                    ("slippage", slippage_bps.to_string()),
                ];

                tracing::debug!("Bungee GET {}?fromChainId={} toChainId={} amount={}", BUNGEE_API, from_chain, to_chain, amount_raw);

                let mut req = client.get(BUNGEE_API).query(&query);
                // prefer BUNGEE_API_KEY, fallback to SOCKET_API_KEY
                if let Some(key) = std::env::var("BUNGEE_API_KEY").ok().or_else(|| std::env::var("SOCKET_API_KEY").ok()) {
                    req = req.header("x-api-key", key);
                }
                if let Some(aff) = std::env::var("BUNGEE_AFFILIATE_ID").ok() {
                    req = req.header("affiliate", aff);
                }

                let resp = match req.send().await {
                    Ok(r) => r,
                    Err(e) => { tracing::warn!("Bungee HTTP error for {}->{}: {}", from_chain, to_chain, e); continue; }
                };

                // capture server-req-id for debugging
                let server_req_id = resp.headers().get("server-req-id").and_then(|v| v.to_str().ok()).map(|s| s.to_string()).unwrap_or_else(|| "<none>".to_string());

                if !resp.status().is_success() {
                    let status = resp.status().as_u16();
                    let body_text = resp.text().await.unwrap_or_else(|_| "<no body>".to_string());
                    tracing::warn!("Bungee non-success {}: {} server-req-id={}", status, body_text, server_req_id);
                    // Per spec: on API fail return empty list (do not propagate error)
                    continue;
                }

                let parsed: serde_json::Value = match resp.json().await {
                    Ok(v) => v,
                    Err(e) => { tracing::warn!("bungee parse error: {} server-req-id={}", e, server_req_id); continue; }
                };

                tracing::debug!("bungee response (server-req-id={}): {}", server_req_id, serde_json::to_string(&parsed).unwrap_or_default());

                // Try to find an array of quote items in common response shapes
                let mut items: Vec<serde_json::Value> = Vec::new();
                if parsed.is_array() {
                    items = parsed.as_array().cloned().unwrap_or_default();
                } else if let Some(arr) = parsed.get("quotes").and_then(|q| q.as_array()) {
                    items = arr.clone();
                } else if let Some(arr) = parsed.get("data").and_then(|d| d.as_array()) {
                    items = arr.clone();
                } else if let Some(obj) = parsed.get("data") {
                    // sometimes data is object with `result` or `quote`
                    if let Some(arr) = obj.get("result").and_then(|r| r.as_array()) { items = arr.clone(); }
                    else if let Some(arr) = obj.get("quotes").and_then(|r| r.as_array()) { items = arr.clone(); }
                } else if let Some(arr) = parsed.get("result").and_then(|r| r.as_array()) {
                    items = arr.clone();
                }

                // input amount human
                let input_human = intent.amount;

                // pick best route (max output_amount)
                let mut best_item: Option<(serde_json::Value, f64)> = None;
                for item in items.into_iter().take(8) {
                    // Common fields: toAmount (string), amountOut, toAmountNum
                    let to_amount_raw_opt = item.get("toAmount").and_then(|v| v.as_str()).map(|s| s.to_string())
                        .or_else(|| item.get("amountOut").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .or_else(|| item.get("toAmountRaw").and_then(|v| v.as_str()).map(|s| s.to_string()));

                    let mut output_amount = 0.0f64;
                    if let Some(s) = to_amount_raw_opt {
                        if let Ok(big) = Decimal::from_str(&s) {
                            let human = (big / Decimal::from_i128_with_scale(10i128.pow(to_dec as u32), 0)).to_f64().unwrap_or(0.0);
                            output_amount = human;
                        } else if let Ok(f) = s.parse::<f64>() { output_amount = f; }
                    } else if let Some(n) = item.get("toAmountNum").and_then(|v| v.as_f64()) { output_amount = n; }

                    if !(output_amount > 0.0) { continue; }

                    if best_item.is_none() || output_amount > best_item.as_ref().unwrap().1 {
                        best_item = Some((item.clone(), output_amount));
                    }
                }

                if let Some((best, _score)) = best_item {
                    // parse normalized fields
                    let to_amount_raw_opt = best.get("toAmount").and_then(|v| v.as_str()).map(|s| s.to_string())
                        .or_else(|| best.get("amountOut").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .or_else(|| best.get("toAmountRaw").and_then(|v| v.as_str()).map(|s| s.to_string()));

                    let mut output_amount = 0.0f64;
                    if let Some(s) = to_amount_raw_opt {
                        if let Ok(big) = Decimal::from_str(&s) {
                            output_amount = (big / Decimal::from_i128_with_scale(10i128.pow(to_dec as u32), 0)).to_f64().unwrap_or(0.0);
                        } else if let Ok(f) = s.parse::<f64>() { output_amount = f; }
                    } else if let Some(n) = best.get("toAmountNum").and_then(|v| v.as_f64()) { output_amount = n; }

                    let fee_usd = best.get("feeUsd").and_then(|v| v.as_f64()).or_else(|| best.get("feeUSD").and_then(|v| v.as_f64())).unwrap_or(0.0);
                    let gas_usd = best.get("estimatedGasUsd").and_then(|v| v.as_f64()).or_else(|| best.get("gasUsd").and_then(|v| v.as_f64())).unwrap_or(0.0);

                    // steps
                    let mut steps: Vec<crate::types::RouteStep> = Vec::new();
                    if let Some(arr) = best.get("steps").and_then(|s| s.as_array()) {
                        for s in arr.iter() {
                            if let Some(desc) = s.get("description").and_then(|d| d.as_str()) { steps.push(crate::types::RouteStep { description: desc.to_string() }); }
                            else if let Some(d) = s.as_str() { steps.push(crate::types::RouteStep { description: d.to_string() }); }
                        }
                    } else if let Some(desc) = best.get("routeSummary").and_then(|v| v.as_str()) {
                        steps.push(crate::types::RouteStep { description: desc.to_string() });
                    } else {
                        steps.push(crate::types::RouteStep { description: format!("bungee: {}->{}", from_chain, to_chain) });
                    }

                    out.push(crate::aggregator::Route {
                        aggregator: "socket".to_string(),
                        from_chain,
                        to_chain,
                        from_token: from_addr.clone(),
                        to_token: to_addr.clone(),
                        input_amount: input_human,
                        output_amount,
                        gas_cost_usd: Some(gas_usd),
                        bridge_fee_usd: Some(fee_usd),
                        execution_time_sec: best.get("estimateTimeSec").and_then(|v| v.as_f64()).or_else(|| best.get("estimatedTime").and_then(|v| v.as_f64())),
                        raw_tx: None,
                        steps,
                    });
                }
        }

        tracing::info!("[socket] returned {} routes", out.len());
        Ok(out)
    }
}
