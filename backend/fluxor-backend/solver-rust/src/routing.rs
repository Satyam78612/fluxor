use crate::aggregator::lifi::NormalizedQuote;
use std::collections::HashSet;
use std::cmp::Ordering;

/// A route candidate represents a single swap route
#[derive(Debug, Clone)]
pub struct RouteCandidate {
    pub aggregator: String,
    pub from_chain_id: i64,
    pub to_chain_id: i64,
    pub from_token: String,
    pub to_token: String,
    pub input_amount: f64,
    pub output_amount: f64,
    pub fee_usd: Option<f64>,
    pub gas_estimate_usd: Option<f64>,
    pub time_seconds: Option<f64>,
    pub price_impact_pct: Option<f64>,
    pub steps: Vec<crate::types::RouteStep>,
    pub score: f64,
}

pub struct RouteCollection {
    pub same_chain: Vec<RouteCandidate>,
    pub cross_chain: Vec<RouteCandidate>,
}

/// Build route candidates from normalized quotes
pub fn build_routes(quotes: Vec<NormalizedQuote>, user_chain_id: i64) -> RouteCollection {
    let mut same_chain = Vec::new();
    let mut cross_chain = Vec::new();

    // Deduplicate by signature
    let mut seen = HashSet::new();

    for quote in quotes {
        let signature = format!(
            "{}-{}-{}-{}-{}-{}",
            quote.aggregator,
            quote.from_token,
            quote.to_token,
            quote.chain_id,
            quote.input_amount.to_bits(),
            quote.output_amount.to_bits()
        );

        if seen.insert(signature) {
            // compute initial score from the NormalizedQuote before moving fields
            let initial_score = crate::aggregator::merge::score_route(&quote);

            let candidate = RouteCandidate {
                aggregator: quote.aggregator.clone(),
                from_chain_id: user_chain_id,
                to_chain_id: quote.chain_id,
                from_token: quote.from_token.clone(),
                to_token: quote.to_token.clone(),
                input_amount: quote.input_amount,
                output_amount: quote.output_amount,
                fee_usd: quote.fee_usd,
                gas_estimate_usd: quote.gas_estimate_usd,
                time_seconds: quote.estimate_time_seconds,
                price_impact_pct: quote.price_impact_pct,
                steps: quote.steps,
                score: initial_score, // initial score from normalized quote
            };

            // Classify as same-chain or cross-chain
            if quote.chain_id == user_chain_id {
                same_chain.push(candidate);
            } else {
                cross_chain.push(candidate);
            }
        }
    }

    RouteCollection { same_chain, cross_chain }
}

/// Compare best cross-chain vs best same-chain and return ordered routes
pub fn compare_and_order_routes(
    same_chain: &mut Vec<RouteCandidate>,
    cross_chain: &mut Vec<RouteCandidate>,
) -> Vec<RouteCandidate> {
    // Compute score using comprehensive scoring function
    for r in same_chain.iter_mut().chain(cross_chain.iter_mut()) {
        r.score = score_route_candidate(r);
    }

    // Find best-by-score in each bucket
    let same_best_opt = same_chain.iter().max_by(|a, b| {
        a.score.partial_cmp(&b.score).unwrap_or(Ordering::Equal)
    }).cloned();

    let cross_best_opt = cross_chain.iter().max_by(|a, b| {
        a.score.partial_cmp(&b.score).unwrap_or(Ordering::Equal)
    }).cloned();

    // If none exist return empty
    if same_best_opt.is_none() && cross_best_opt.is_none() {
        return vec![];
    }

    // Determine anchor (primary best) according to 0.1% rule
    let anchor: RouteCandidate = match (same_best_opt.clone(), cross_best_opt.clone()) {
        (Some(same_best), Some(cross_best)) => {
            let threshold = same_best.output_amount * 1.001; // 0.1% rule
            if cross_best.output_amount >= threshold {
                cross_best
            } else {
                same_best
            }
        }
        (Some(same_best), None) => same_best,
        (None, Some(cross_best)) => cross_best,
        _ => unreachable!(),
    };

    // Combine all routes and sort by score desc (for ordering the remainder)
    let mut combined: Vec<RouteCandidate> = Vec::new();
    combined.extend(same_chain.iter().cloned());
    combined.extend(cross_chain.iter().cloned());

    combined.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));

    // Deduplicate & build final list with anchor first
    let mut seen_keys: HashSet<String> = HashSet::new();
    let mut final_routes: Vec<RouteCandidate> = Vec::new();

    // Helper to build dedupe key
    let key_of = |r: &RouteCandidate| {
        let out_norm = normalize_number(r.output_amount);
        format!("{}-{}-{}-{:.8}", r.aggregator, r.from_chain_id, r.to_chain_id, out_norm)
    };

    // Insert anchor first
    let anchor_key = key_of(&anchor);
    seen_keys.insert(anchor_key.clone());
    final_routes.push(anchor.clone());

    // Append rest preserving score ordering, skip duplicates and the anchor itself
    for r in combined.into_iter() {
        if final_routes.len() >= 12 {
            break;
        }
        let k = key_of(&r);
        if k == anchor_key {
            continue;
        }
        if seen_keys.insert(k) {
            final_routes.push(r);
        }
    }

    // Ensure result sorted by score DESC (anchor remains at front)
    final_routes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
    final_routes.truncate(12);

    final_routes
}

/// Normalize number to 8 decimals for stable deduplication.
fn normalize_number(n: f64) -> f64 {
    (n * 1e8).round() / 1e8
}

/// Compute score for a RouteCandidate using same factors as for NormalizedQuote
pub fn score_route_candidate(r: &RouteCandidate) -> f64 {
    let output = r.output_amount;
    let gas = r.gas_estimate_usd.unwrap_or(0.5);
    let fee = r.fee_usd.unwrap_or(0.0);
    let price_impact = r.price_impact_pct.unwrap_or(0.0) / 100.0 * output;
    let steps_penalty = (r.steps.len() as f64) * 0.1;
    let score = output - gas - fee - price_impact - steps_penalty;
    tracing::debug!("route score: agg={} output={} gas_usd={:?} fee_usd={:?} steps={} score={}", r.aggregator, output, r.gas_estimate_usd, r.fee_usd, r.steps.len(), score);
    score
}
