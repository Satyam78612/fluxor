use crate::config::Config;
use crate::db::Db;
use crate::token_registry::TokenRegistry;
use crate::aggregator::lifi;
use crate::aggregator::jupiter;
use crate::routing::{build_routes, compare_and_order_routes};
use chrono::Utc;
use futures::StreamExt;
use std::sync::Arc;
use tokio::time::sleep;
use std::time::Duration;

pub async fn run(cfg: Config) -> anyhow::Result<()> {
    tracing::info!("Starting worker with config: {:?}", cfg);

    // Load token registry from Contract.json
    let token_registry = Arc::new(
        TokenRegistry::load("/home/nawtfound404/Projects/Fluxor/Contract.json/Contract.json")
            .await?,
    );
    tracing::info!("Token registry loaded");

    let db = Db::connect(&cfg.mongo_uri).await?;

    // Connect to NATS
    let nats_url = cfg.nats_url.clone();
    let nc = async_nats::connect(&nats_url).await?;
    tracing::info!("Connected to NATS at {}", nats_url);

    let mut sub = nc.subscribe("intent.created").await?;
    tracing::info!("Subscribed to intent.created");

    while let Some(msg_result) = sub.next().await {
        let msg = msg_result;
        let payload_bytes = msg.payload.to_vec();

        let payload = match String::from_utf8(payload_bytes.clone()) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("intent.created payload not utf8: err={}", e);
                continue;
            }
        };

        let v: serde_json::Value = match serde_json::from_str(&payload) {
            Ok(val) => val,
            Err(e) => {
                tracing::error!("Failed to parse intent.created JSON: err={}", e);
                continue;
            }
        };

        if let Some(intent_id) = v.get("intentId").and_then(|x| x.as_str()) {
            let db_clone = db.client.clone();
            let nc_clone = nc.clone();
            let intent_id = intent_id.to_string();
            let registry = Arc::clone(&token_registry);

            tokio::spawn(async move {
                let our_db = Db { client: db_clone };
                tracing::info!("Processing intent {}", intent_id);

                match our_db.get_intent(&intent_id).await {
                    Ok(Some(intent)) => {
                        if let Err(e) = process_intent(&intent, &our_db, &nc_clone, &registry).await {
                            tracing::error!("Error processing intent {}: {}", intent_id, e);
                        }
                    }
                    Ok(None) => tracing::error!("Intent not found: {}", intent_id),
                    Err(e) => tracing::error!("Error fetching intent {}: {}", intent_id, e),
                }
            });
        }
    }

    Ok(())
}

async fn process_intent(
    intent: &crate::db::Intent,
    db: &Db,
    nc: &async_nats::Client,
    registry: &Arc<TokenRegistry>,
) -> anyhow::Result<()> {
    // Create a friendly string id for logging/publishing but keep the ObjectId for DB ops
    let intent_id_str = intent.id.as_ref().map(|o| o.to_string()).unwrap_or_else(|| "unknown".to_string());
    
    tracing::info!(
        "Processing intent: {} -> {} on chain {}",
        intent.fromToken, intent.toToken, intent.chainId
    );

    // Step 1: Find all chains where fromToken and toToken exist
    let from_chains = registry.find_token_chains(&intent.fromToken);
    let to_chains = registry.find_token_chains(&intent.toToken);

    tracing::info!(
        "fromToken '{}' exists on chains: {:?}",
        intent.fromToken, from_chains
    );
    tracing::info!(
        "toToken '{}' exists on chains: {:?}",
        intent.toToken, to_chains
    );

    if from_chains.is_empty() || to_chains.is_empty() {
        tracing::warn!("Token not found on any supported chain");
        return Ok(());
    }

    // Step 2: Generate chain pairs limited to user's chain and top-2 other chains
    // a) (user_chain -> user_chain)
    // b) (user_chain -> top 2 other chains)
    let user_chain = intent.chainId;
    let mut other_chains: Vec<i64> = Vec::new();
    // collect union of from_chains and to_chains excluding user's chain
    for c in from_chains.iter().chain(to_chains.iter()) {
        if *c != user_chain && !other_chains.contains(c) {
            other_chains.push(*c);
        }
    }
    // take up to top 2
    other_chains.truncate(2);

    let mut chain_pairs: Vec<(i64, i64)> = Vec::new();
    // same-chain pair
    chain_pairs.push((user_chain, user_chain));
    // user_chain -> top 2 others
    for oc in &other_chains {
        chain_pairs.push((user_chain, *oc));
    }

    tracing::info!("Generated {} chain pairs (user-centric)", chain_pairs.len());

    // Re-quote control via environment
    let requote_seconds = std::env::var("REQUOTE_SECONDS").ok().and_then(|s| s.parse::<u64>().ok());
    let requote_iter = std::env::var("REQUOTE_ITER").ok().and_then(|s| s.parse::<u32>().ok()).unwrap_or(3);
    let iterations = if requote_seconds.is_some() { requote_iter } else { 1 };

    for iter in 0..iterations {
        tracing::info!("Quote iteration {}/{}", iter + 1, iterations);

        // Step 3: Fetch quotes for each chain pair
        let mut all_routes: Vec<crate::aggregator::Route> = Vec::new();
        // Track failure modes to set intent status appropriately
        let mut saw_rate_limited = false;
        let mut saw_unsupported = false;

        for (from_chain, to_chain) in chain_pairs.clone() {
            tracing::info!("Fetching quotes for {} -> {}", from_chain, to_chain);

        // Get token addresses and decimals. Normalize native ETH representation per requirement:
        // - For same-chain quotes, use symbol "ETH"
        // - For cross-chain routes, use zero address for native ETH
        let zero_addr = "0x0000000000000000000000000000000000000000";

        let is_same_chain = from_chain == to_chain && from_chain == intent.chainId;

        // from token param for LiFi: either symbol ("ETH") or an address
        let from_addr = if intent.fromToken.to_uppercase() == "ETH" {
            if is_same_chain {
                "ETH".to_string()
            } else {
                zero_addr.to_string()
            }
        } else {
            match registry.get_token_address(&intent.fromToken, from_chain) {
                Some(addr) => addr,
                None => {
                        tracing::warn!(
                            "fromToken {} not found on chain {}",
                            intent.fromToken, from_chain
                        );
                        saw_unsupported = true;
                        continue;
                }
            }
        };

        // to token param for LiFi
        let to_addr = if intent.toToken.to_uppercase() == "ETH" {
            if is_same_chain {
                "ETH".to_string()
            } else {
                zero_addr.to_string()
            }
        } else {
            match registry.get_token_address(&intent.toToken, to_chain) {
                Some(addr) => addr,
                None => {
                        tracing::warn!(
                            "toToken {} not found on chain {}",
                            intent.toToken, to_chain
                        );
                        saw_unsupported = true;
                        continue;
                }
            }
        };

        let from_dec = registry.get_token_decimals(&intent.fromToken, from_chain);
        let to_dec = registry.get_token_decimals(&intent.toToken, to_chain);

        // Convert amount to smallest units
        let amount_decimal = rust_decimal::Decimal::from_f64_retain(intent.amount)
            .unwrap_or(rust_decimal::Decimal::ZERO);
        let amount_raw = crate::aggregator::token_map::to_smallest_units(amount_decimal, from_dec);

        // determine slippage for LiFi in basis points. Prefer intent.slippage (percent), then env override, else default 0.5%
        let slippage_bps: u32 = if let Some(slip_pct) = intent.slippage {
            // convert percent to bps (e.g. 0.5 -> 50)
            (slip_pct * 100.0) as u32
        } else if let Ok(env_bps) = std::env::var("LIFI_SLIPPAGE_BPS") {
            env_bps.parse::<u32>().unwrap_or(50u32)
        } else {
            50u32
        };

        // Skip LiFi entirely for any Solana chain
        if from_chain == 101 || to_chain == 101 {
            // LiFi does not support Solana, skip
        } else {
            // Fetch from LiFi only when BOTH chains are supported EVM chains
            // Skip LiFi entirely if the token pair is known to be unsupported
                if !lifi::is_token_supported(&from_addr, from_chain)
                || !lifi::is_token_supported(&to_addr, to_chain)
            {
                tracing::warn!("Skipping LiFi: token pair unsupported");
                saw_unsupported = true;
            } else if is_evm_chain(from_chain) && is_evm_chain(to_chain) {
                // Build a list of aggregators for EVM pairs
                let aggregators: Vec<Box<dyn crate::aggregator::AggregatorQuoteProvider + Send + Sync>> = vec![
                    Box::new(crate::aggregator::lifi::LiFiAggregator {}),
                    Box::new(crate::aggregator::mayan::MayanAggregator {}),
                    Box::new(crate::aggregator::bungee::BungeeAggregator {}),
                    Box::new(crate::aggregator::relay::RelayAggregator {}),
                ];

                for agg in aggregators.into_iter() {
                    tracing::debug!("Fetching from aggregator {} for {} -> {} (same_chain={})", agg.name(), from_chain, to_chain, is_same_chain);
                    match agg.get_quotes(&intent).await {
                        Ok(mut routes) => {
                            tracing::info!("[{}] returned {} routes for {} -> {}", agg.name(), routes.len(), from_chain, to_chain);
                            all_routes.append(&mut routes);
                        }
                        Err(e) => {
                            tracing::warn!("[{}] error for {} -> {}: {:?}", agg.name(), from_chain, to_chain, e);
                            if let crate::aggregator::lifi::AggregatorError::RateLimited = e {
                                saw_rate_limited = true;
                            }
                        }
                    }
                }
            }
        }
        // Fetch from Jupiter if either chain is Solana (101) or tokens resolve to Solana
        if from_chain == 101 || to_chain == 101 {
            tracing::debug!("Fetching from Jupiter for Solana-involved pair {}->{}", from_chain, to_chain);
            let j_agg: Box<dyn crate::aggregator::AggregatorQuoteProvider + Send + Sync> = Box::new(crate::aggregator::jupiter::JupiterAggregator {});
            match j_agg.get_quotes(&intent).await {
                Ok(mut routes) => {
                    tracing::info!("[jupiter] returned {} routes for {}->{}", routes.len(), from_chain, to_chain);
                    all_routes.append(&mut routes);
                }
                Err(e) => {
                    tracing::warn!("[jupiter] error for {}->{}: {:?}", from_chain, to_chain, e);
                }
            }
        }
    }
    // If any aggregator reported rate limiting, mark the intent as RATE_LIMITED
    if saw_rate_limited {
        tracing::warn!("Rate limited while fetching quotes for intent {}", intent_id_str);
        if let Err(e) = db.update_intent_status(&intent.id, "RATE_LIMITED", Some("rate_limit")).await {
            tracing::error!("Failed to update intent status to RATE_LIMITED: {:?}", e);
        }
        return Ok(());
    }

    if all_routes.is_empty() {
        // No routes available — record NO_ROUTE_FOUND with a reason
        let reason = if saw_unsupported { "unsupported" } else { "empty" };
        tracing::warn!("No routes fetched for intent {} (reason={})", intent_id_str, reason);
        if let Err(e) = db.update_intent_status(&intent.id, "NO_ROUTE_FOUND", Some(reason)).await {
            tracing::error!("Failed to update intent status to NO_ROUTE_FOUND: {:?}", e);
        }
        return Ok(());
    }

    tracing::info!("total_routes_collected = {}", all_routes.len());

    // Convert aggregator::Route -> lifi::NormalizedQuote for existing routing pipeline
    let mut normalized_quotes: Vec<lifi::NormalizedQuote> = Vec::new();
    for r in all_routes.into_iter() {
        let nq = lifi::NormalizedQuote {
            aggregator: r.aggregator.clone(),
            chain: r.to_chain.to_string(),
            chain_id: r.to_chain,
            from_token: r.from_token.clone(),
            to_token: r.to_token.clone(),
            input_amount: r.input_amount,
            output_amount: r.output_amount,
            price_impact_pct: None,
            gas_estimate_native: None,
            gas_estimate_usd: r.gas_cost_usd,
            fee_usd: r.bridge_fee_usd,
            estimate_time_seconds: r.execution_time_sec,
            timestamp: Utc::now().timestamp(),
            steps: r.steps.clone(),
        };
        normalized_quotes.push(nq);
    }

    // Step 4: Build route collection and separate same-chain vs cross-chain
    let mut routes = build_routes(normalized_quotes, intent.chainId);

    tracing::info!(
        "Built routes: {} same-chain, {} cross-chain",
        routes.same_chain.len(),
        routes.cross_chain.len()
    );

    // Step 5: Score routes
    score_routes(&mut routes.same_chain);
    score_routes(&mut routes.cross_chain);

    // Step 6: Compare and order routes
    let mut final_routes = compare_and_order_routes(&mut routes.same_chain, &mut routes.cross_chain);

    // Ensure final routes are sorted by score DESC and log top-3
    final_routes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    tracing::info!("Final top {} routes after scoring and ordering", final_routes.len());

    // Log top 3 routes with scores
    for (i, r) in final_routes.iter().take(3).enumerate() {
        tracing::info!("Top {}: agg={} from_chain={} to_chain={} output={} score={}", i + 1, r.aggregator, r.from_chain_id, r.to_chain_id, r.output_amount, r.score);
    }

    if let Some(best) = final_routes.first() {
        // Invariant: bestRoute must have a positive output_amount before we consider
        // the intent successfully quoted/completed. If this fails, log loudly and
        // mark the intent as NO_ROUTE_FOUND with reason "invalid_best".
        if !(best.output_amount > 0.0) {
            tracing::error!("Invariant failure: bestRoute has non-positive output_amount={} for intent {}", best.output_amount, intent_id_str);
            if let Err(e) = db.update_intent_status(&intent.id, "NO_ROUTE_FOUND", Some("invalid_best")).await {
                tracing::error!("Failed to update intent status after invariant failure: {:?}", e);
            }
            return Ok(());
        }
        // Build bestRoute JSON
        let best_route_json = serde_json::json!({
            "aggregator": best.aggregator,
            "from_token": best.from_token,
            "to_token": best.to_token,
            "from_chain": best.from_chain_id,
            "to_chain": best.to_chain_id,
            "amount_from": best.input_amount,
            "amount_to": best.output_amount,
            "fee_usd": best.fee_usd,
            "gas_usd": best.gas_estimate_usd,
            "time_seconds": best.time_seconds,
            "score": best.score,
            "steps": best.steps,
        });

        // Build all routes array (top 12)
        let all_routes_json: Vec<serde_json::Value> = final_routes
            .iter()
            .take(12)
            .map(|r| {
                serde_json::json!({
                    "aggregator": r.aggregator,
                    "from_chain": r.from_chain_id,
                    "to_chain": r.to_chain_id,
                    "amount_to": r.output_amount,
                    "fee_usd": r.fee_usd,
                    "gas_usd": r.gas_estimate_usd,
                    "time_seconds": r.time_seconds,
                    "score": r.score,
                })
            })
            .collect();

        // Update intent with results
        if let Err(e) = db
            .update_intent_best_route(&intent.id, best_route_json.clone())
            .await
        {
            tracing::error!("Failed to update intent bestRoute: {:?}", e);
        } else {
            tracing::info!(
                "Updated intent {} with best route from {} aggregator",
                intent_id_str, best.aggregator
            );

            // Publish intent.quoted event
            let msg = serde_json::json!({
                "intentId": intent_id_str,
                "bestRoute": best_route_json,
                "allRoutes": all_routes_json,
            });

            if let Err(e) = nc.publish("intent.quoted", msg.to_string().into()).await {
                tracing::error!("Failed to publish intent.quoted: {}", e);
            }
        }
    } else {
        tracing::warn!("No final routes available for intent {}", intent_id_str);
    }

        // If re-quote loop is enabled, wait and repeat
        if iter < iterations - 1 {
            if let Some(sec) = requote_seconds {
                tracing::info!("Sleeping {}s before next re-quote iteration", sec);
                sleep(Duration::from_secs(sec)).await;
                // continue to next iteration of the outer loop
                continue;
            }
        }
    }

    Ok(())
}

fn is_evm_chain(chain_id: i64) -> bool {
    matches!(
        chain_id,
        1 | 10 | 42161 | 137 | 56 | 43114 | 250 | 8453 | 59144 | 196 | 999 | 9745 | 80094 | 4200 | 146
    )
}

fn score_routes(routes: &mut Vec<crate::routing::RouteCandidate>) {
    for route in routes.iter_mut() {
        // Compute score using routing helper
        let s = crate::routing::score_route_candidate(route);
        tracing::debug!("scored route: agg={} output={} gas_usd={:?} fee_usd={:?} steps={} final_score={}",
            route.aggregator, route.output_amount, route.gas_estimate_usd, route.fee_usd, route.steps.len(), s);
        route.score = s;
    }
}
