use async_trait::async_trait;
use crate::aggregator::Route;
use crate::db::Intent;
use crate::aggregator::lifi::AggregatorError;
use reqwest::Client;
use rust_decimal::Decimal;
use rust_decimal::prelude::{FromPrimitive, ToPrimitive};
use std::str::FromStr;
use std::time::Duration;

const MAYAN_API: &str = "https://explorer-api.mayan.finance/v1/quote";

fn is_evm_chain(chain_id: i64) -> bool {
    matches!(chain_id, 1 | 10 | 42161 | 137 | 56 | 43114 | 250 | 8453 | 59144 | 196 | 999 | 9745 | 80094 | 4200 | 146)
}

pub struct MayanAggregator;

#[async_trait]
impl crate::aggregator::AggregatorQuoteProvider for MayanAggregator {
    fn name(&self) -> &'static str { "mayan" }

    async fn get_quotes(&self, intent: &crate::db::Intent) -> Result<Vec<crate::aggregator::Route>, crate::aggregator::lifi::AggregatorError> {
        use crate::aggregator::token_map::TOKEN_MAP;

        tracing::info!("MayanAggregator: getting quotes for intent {} -> {} on chain {}", intent.fromToken, intent.toToken, intent.chainId);

        // find available chains for tokens
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

        // build user-centric pairs (user_chain -> user_chain) and up to top-2 others
        let user_chain = intent.chainId;
        let mut other_chains: Vec<i64> = Vec::new();
        for c in from_chains.iter().chain(to_chains.iter()) {
            if *c != user_chain && !other_chains.contains(c) {
                other_chains.push(*c);
            }
        }
        other_chains.truncate(2);

        // Only cross-chain pairs (user_chain -> other) for Mayan
        let mut chain_pairs: Vec<(i64,i64)> = Vec::new();
        for oc in &other_chains { chain_pairs.push((user_chain,*oc)); }
        for oc in &other_chains { chain_pairs.push((*oc, user_chain)); }

        // If there are no cross-chain pairs (i.e. only same-chain), skip Mayan
        if chain_pairs.is_empty() {
            tracing::info!("[mayan] returned 0 routes");
            return Ok(vec![]);
        }

        let client = Client::builder().timeout(Duration::from_secs(6)).build().map_err(|e| AggregatorError::Http(e))?;

        let mut out_routes: Vec<crate::aggregator::Route> = Vec::new();

        // amount in smallest units for from token
        let from_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.fromToken, intent.chainId).unwrap_or(18u8);
        let amount_decimal = Decimal::from_f64_retain(intent.amount).unwrap_or(Decimal::ZERO);
        let amount_raw = crate::aggregator::token_map::to_smallest_units(amount_decimal, from_dec);

        // slippage bps (default 0.5% -> 50 bps)
        let slippage_bps: u32 = intent.slippage.map(|s| (s * 100.0) as u32).unwrap_or(50u32);

        for (from_chain, to_chain) in chain_pairs.into_iter() {
            // Support EVM <-> Solana, and EVM <-> EVM cross-chain pairs
            if !(
                (is_evm_chain(from_chain) && to_chain == 101) ||
                (is_evm_chain(to_chain) && from_chain == 101) ||
                (is_evm_chain(from_chain) && is_evm_chain(to_chain) && from_chain != to_chain)
            ) {
                continue;
            }

            // Resolve token identifiers for each chain
            let from_addr = crate::aggregator::token_map::resolve_token_address(&intent.fromToken, from_chain).unwrap_or_else(|| intent.fromToken.clone());
            let to_addr = crate::aggregator::token_map::resolve_token_address(&intent.toToken, to_chain).unwrap_or_else(|| intent.toToken.clone());

            // Compute per-pair amount_raw using from_decimals for that chain
            let from_dec_pair = crate::aggregator::token_map::resolve_token_decimals(&intent.fromToken, from_chain).unwrap_or(18u8);
            let amount_raw_pair = crate::aggregator::token_map::to_smallest_units(amount_decimal, from_dec_pair);

            // Build request body
            let body = serde_json::json!({
                "fromChainId": from_chain,
                "toChainId": to_chain,
                "fromToken": from_addr,
                "toToken": to_addr,
                "amount": amount_raw_pair,
                "slippageBps": slippage_bps
            });

            tracing::debug!("Mayan request body: {}", serde_json::to_string(&body).unwrap_or_default());

            let resp = match client.post(MAYAN_API).json(&body).send().await {
                Ok(r) => r,
                Err(e) => {
                    tracing::warn!("Mayan HTTP error for {}->{}: {}", from_chain, to_chain, e);
                    continue;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let body_text = resp.text().await.unwrap_or_else(|_| "<no body>".to_string());
                tracing::warn!("Mayan non-success {}: {}", status, body_text);
                // On API failure or unsupported pair return empty set for this pair
                continue;
            }

            let parsed: serde_json::Value = match resp.json().await {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!("Mayan parse error for {}->{}: {}", from_chain, to_chain, e);
                    continue;
                }
            };

            tracing::debug!("Mayan response: {}", serde_json::to_string(&parsed).unwrap_or_default());

            // Mayan may return an array of quotes or an object with `quotes`
            let candidates = if parsed.is_array() {
                parsed.as_array().cloned().unwrap_or_default()
            } else if parsed.get("quotes").and_then(|q| q.as_array()).is_some() {
                parsed.get("quotes").and_then(|q| q.as_array()).cloned().unwrap_or_default()
            } else {
                vec![parsed]
            };

            for item in candidates.into_iter().take(4) {
                // try extracting output amount
                let output_opt = item.get("toAmount")
                    .and_then(|v| v.as_str())
                    .or_else(|| item.get("outputAmount").and_then(|v| v.as_str()))
                    .or_else(|| item.get("amountOut").and_then(|v| v.as_str()));

                let output_amount = if let Some(s) = output_opt {
                    Decimal::from_str(s).ok().and_then(|d| d.to_f64()).unwrap_or(0.0)
                } else if let Some(n) = item.get("toAmountNum").and_then(|v| v.as_f64()) {
                    n
                } else {
                    // fallback: try a nested `estimate.toAmount`
                    item.get("estimate").and_then(|est| est.get("toAmount")).and_then(|v| v.as_str()).and_then(|s| Decimal::from_str(s).ok().and_then(|d| d.to_f64())).unwrap_or(0.0)
                };

                // Parse fees (default to 0.0 when unknown)
                let fee_usd = item.get("feeUsd").and_then(|v| v.as_f64())
                    .or_else(|| item.get("feeUSD").and_then(|v| v.as_f64()))
                    .or_else(|| item.get("fee").and_then(|v| v.as_f64()))
                    .unwrap_or(0.0);

                let gas_usd = item.get("gasUsd").and_then(|v| v.as_f64())
                    .or_else(|| item.get("gasUSD").and_then(|v| v.as_f64()))
                    .unwrap_or(0.0);

                let est_time = item.get("estimateTime").and_then(|v| v.as_f64())
                    .or_else(|| item.get("estimate_time").and_then(|v| v.as_f64()));

                // convert input/output human amounts: response toAmount may be in smallest units depending on API
                // Try to normalize: if output_amount seems large (>1e12) assume raw integer and divide by decimals
                let to_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.toToken, to_chain).unwrap_or(18u8);

                let output_human = if output_amount > 1e12 {
                    // treat as raw int
                    let denom = Decimal::new(1, 0) * Decimal::from_i128_with_scale(10i128.pow(to_dec as u32), 0);
                    // but simpler: divide by 10^dec
                    let d = Decimal::from_f64(output_amount).unwrap_or(Decimal::ZERO);
                    let div = Decimal::from_i128_with_scale(10i128.pow(to_dec as u32), 0);
                    (d / div).to_f64().unwrap_or(output_amount)
                } else {
                    output_amount
                };

                // input amount human
                let input_human = intent.amount;

                // steps: include bridge step and destination swap if available
                let mut steps: Vec<crate::types::RouteStep> = Vec::new();
                if let Some(bridge) = item.get("bridge").and_then(|v| v.as_str()) {
                    steps.push(crate::types::RouteStep { description: format!("mayan bridge: {}", bridge) });
                }
                if let Some(route_desc) = item.get("route").and_then(|r| r.as_str()) {
                    steps.push(crate::types::RouteStep { description: route_desc.to_string() });
                }
                // ensure at least one step
                if steps.is_empty() {
                    steps.push(crate::types::RouteStep { description: format!("mayan: {}->{}", from_chain, to_chain) });
                }

                let r = crate::aggregator::Route {
                    aggregator: "mayan".to_string(),
                    from_chain,
                    to_chain,
                    from_token: from_addr.clone(),
                    to_token: to_addr.clone(),
                    input_amount: input_human,
                    output_amount: output_human,
                    gas_cost_usd: Some(gas_usd),
                    bridge_fee_usd: Some(fee_usd),
                    execution_time_sec: est_time,
                    raw_tx: None,
                    steps: steps,
                };

                out_routes.push(r);
            }
        }

        tracing::info!("[mayan] returned {} routes", out_routes.len());
        Ok(out_routes)
    }
}
