use async_trait::async_trait;
use crate::aggregator::Route;
use crate::db::Intent;
use crate::aggregator::lifi::AggregatorError;
use reqwest::Client;
use rust_decimal::Decimal;
use rust_decimal::prelude::{ToPrimitive, FromPrimitive};
use std::time::Duration;
use std::str::FromStr;

/// Relay aggregator adapter — calls a Relay quote endpoint to fetch cross-chain bridge quotes.
/// The endpoint URL can be overridden with the `RELAY_API_URL` env var. If not present,
/// the adapter will log and return an empty list (non-fatal).
pub struct RelayAggregator;

#[async_trait]
impl crate::aggregator::AggregatorQuoteProvider for RelayAggregator {
    fn name(&self) -> &'static str { "relay" }

    async fn get_quotes(&self, intent: &crate::db::Intent) -> Result<Vec<crate::aggregator::Route>, crate::aggregator::lifi::AggregatorError> {
        tracing::info!("RelayAggregator: fetching quotes for {} -> {} on chain {}", intent.fromToken, intent.toToken, intent.chainId);

        let base = std::env::var("RELAY_API_URL").unwrap_or_else(|_| "https://api.relay.link/quote".to_string());

        let client = Client::builder().timeout(Duration::from_secs(6)).build().map_err(|e| AggregatorError::Http(e))?;
        let api_key = std::env::var("RELAY_API_KEY").ok();

        use crate::aggregator::token_map::TOKEN_MAP;

        // determine candidate chains for tokens
        let mut from_chains: Vec<i64> = Vec::new();
        let mut to_chains: Vec<i64> = Vec::new();
        for ((_sym, cid), _info) in TOKEN_MAP.iter() {
            if _sym == &intent.fromToken.to_uppercase() { from_chains.push(*cid); }
            if _sym == &intent.toToken.to_uppercase() { to_chains.push(*cid); }
        }
        if from_chains.is_empty() { from_chains.push(intent.chainId); }
        if to_chains.is_empty() { to_chains.push(intent.chainId); }

        // Build user-centric pairs; Relay is primarily cross-chain so prefer cross-chain pairs
        let user_chain = intent.chainId;
        let mut other_chains: Vec<i64> = Vec::new();
        for c in from_chains.iter().chain(to_chains.iter()) {
            if *c != user_chain && !other_chains.contains(c) { other_chains.push(*c); }
        }
        other_chains.truncate(3);

        let mut pairs: Vec<(i64,i64)> = Vec::new();
        for oc in &other_chains { pairs.push((user_chain,*oc)); }
        // also include reverse cross-chains (others -> user) if applicable
        for oc in &other_chains { pairs.push((*oc, user_chain)); }

        let amt_dec = FromPrimitive::from_f64(intent.amount).unwrap_or(Decimal::ZERO);

        let mut out: Vec<crate::aggregator::Route> = Vec::new();

        for (from_chain, to_chain) in pairs.into_iter() {
            if from_chain == to_chain { continue; }

            // resolve addresses
            let from_addr = match crate::aggregator::token_map::resolve_token_address(&intent.fromToken, from_chain) {
                Some(a) => a,
                None => { tracing::debug!("Relay: from token {} not on chain {}", intent.fromToken, from_chain); continue; }
            };
            let to_addr = match crate::aggregator::token_map::resolve_token_address(&intent.toToken, to_chain) {
                Some(a) => a,
                None => { tracing::debug!("Relay: to token {} not on chain {}", intent.toToken, to_chain); continue; }
            };

            let from_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.fromToken, from_chain).unwrap_or(18u8);
            let to_dec = crate::aggregator::token_map::resolve_token_decimals(&intent.toToken, to_chain).unwrap_or(18u8);

            let amount_raw = crate::aggregator::token_map::to_smallest_units(amt_dec, from_dec);

            let slippage_bps: u32 = intent.slippage.map(|s| (s * 100.0) as u32).unwrap_or(50u32);
            // Build Relay request body per spec: include user wrapper and origin/destination fields
            let user_addr = std::env::var("INTENT_USER_WALLET").unwrap_or_else(|_| "0x1111111111111111111111111111111111111111".to_string());
            let body = serde_json::json!({
                "user": { "address": user_addr, "chainId": from_chain },
                "originChainId": from_chain,
                "destinationChainId": to_chain,
                "originCurrency": from_addr,
                "destinationCurrency": to_addr,
                "amount": amount_raw,
                "slippage": (slippage_bps as f64) / 10000.0
            });

            tracing::debug!("Relay request {} -> {} body: {}", from_chain, to_chain, serde_json::to_string(&body).unwrap_or_default());

            let mut req = client.post(&base).json(&body);
            if let Some(k) = api_key.as_ref() { req = req.header("Authorization", format!("Bearer {}", k)); }

            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => { tracing::warn!("Relay HTTP error for {}->{}: {}", from_chain, to_chain, e); continue; }
            };

            if resp.status() == reqwest::StatusCode::BAD_REQUEST {
                tracing::warn!("[relay] returned 400 for {}->{}; skipping relay and returning no routes", from_chain, to_chain);
                return Ok(vec![]);
            }

            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let body_text = resp.text().await.unwrap_or_else(|_| "<no body>".to_string());
                tracing::warn!("Relay non-success {}: {}", status, body_text);
                // On error return empty list for this pair
                continue;
            }

            let parsed: serde_json::Value = match resp.json().await {
                Ok(v) => v,
                Err(e) => { tracing::warn!("Relay parse error for {}->{}: {}", from_chain, to_chain, e); continue; }
            };

            tracing::debug!("Relay response: {}", serde_json::to_string(&parsed).unwrap_or_default());

            // parse possible quote entries
            let items = if parsed.is_array() { parsed.as_array().cloned().unwrap_or_default() } else if parsed.get("quotes").and_then(|q| q.as_array()).is_some() { parsed.get("quotes").and_then(|q| q.as_array()).cloned().unwrap_or_default() } else { vec![parsed] };

            for item in items.into_iter().take(4) {
                // extract output
                let out_amt = item.get("toAmount").and_then(|v| v.as_str()).and_then(|s| Decimal::from_str(s).ok()).or_else(|| item.get("amountOut").and_then(|v| v.as_str()).and_then(|s| Decimal::from_str(s).ok()));
                let output_amount = if let Some(d) = out_amt {
                    let denom_f = 10f64.powi(to_dec as i32);
                    d.to_f64().unwrap_or(0.0) / denom_f
                } else {
                    item.get("toAmountNum").and_then(|v| v.as_f64()).unwrap_or(0.0)
                };

                let fee_usd = item.get("feeUsd").and_then(|v| v.as_f64()).or_else(|| item.get("bridgeFeeUsd").and_then(|v| v.as_f64())).unwrap_or(0.0);
                let gas_usd = item.get("gasUsd").and_then(|v| v.as_f64()).or_else(|| item.get("estimatedGasUsd").and_then(|v| v.as_f64())).unwrap_or(0.0);
                let est_time = item.get("estimatedTimeSec").and_then(|v| v.as_f64()).or_else(|| item.get("estimateTime").and_then(|v| v.as_f64()));

                if !(output_amount > 0.0) {
                    tracing::debug!("Relay quote had zero output for {}->{}", from_chain, to_chain);
                    continue;
                }

                let mut steps: Vec<crate::types::RouteStep> = Vec::new();
                if let Some(s) = item.get("routeSummary").and_then(|v| v.as_str()) {
                    steps.push(crate::types::RouteStep { description: s.to_string() });
                } else if let Some(b) = item.get("bridge").and_then(|v| v.as_str()) {
                    steps.push(crate::types::RouteStep { description: format!("relay bridge: {}", b) });
                } else {
                    steps.push(crate::types::RouteStep { description: format!("relay {}->{}", from_chain, to_chain) });
                }

                out.push(crate::aggregator::Route {
                    aggregator: "relay".to_string(),
                    from_chain,
                    to_chain,
                    from_token: from_addr.clone(),
                    to_token: to_addr.clone(),
                    input_amount: intent.amount,
                    output_amount,
                    gas_cost_usd: Some(gas_usd),
                    bridge_fee_usd: Some(fee_usd),
                    execution_time_sec: est_time,
                    raw_tx: None,
                    steps,
                });

                    tracing::info!("[relay] returned quote for {}->{} output={} fee_usd={:?} gas_usd={:?}", from_chain, to_chain, output_amount, fee_usd, gas_usd);
            }
        }

            tracing::info!("[relay] returned {} routes", out.len());
            Ok(out)
    }
}
