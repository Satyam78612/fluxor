use std::collections::{HashMap, HashSet};
use crate::aggregator::lifi::NormalizedQuote;
use crate::types::RouteStep;
use tracing;

/// Compute a numeric score for a normalized quote.
/// score = output_amount
///  - gas_estimate_usd.unwrap_or(0.5)
///  - fee_usd.unwrap_or(0.0)
///  - (price_impact_pct.unwrap_or(0.0) / 100.0 * output_amount)
///  - (steps.len() as f64 * 0.1)
pub fn score_route(q: &NormalizedQuote) -> f64 {
    let output = q.output_amount;
    let gas = q.gas_estimate_usd.unwrap_or(0.5);
    let fee = q.fee_usd.unwrap_or(0.0);
    let price_impact = q.price_impact_pct.unwrap_or(0.0) / 100.0 * output;
    let steps_penalty = (q.steps.len() as f64) * 0.1;
    let score = output - gas - fee - price_impact - steps_penalty;
    tracing::debug!("score_route: agg={} output={} gas_usd={:?} fee_usd={:?} steps={} score={}", q.aggregator, output, q.gas_estimate_usd, q.fee_usd, q.steps.len(), score);
    score
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct RouteCandidate {
    pub aggregator: String,
    pub chain: String,
    pub chain_id: i64,
    pub from_token: String,
    pub to_token: String,
    pub input_amount: f64,
    pub output_amount: f64,
    pub fee_usd: Option<f64>,
    pub gas_estimate_native: Option<f64>,
    pub gas_estimate_usd: Option<f64>,
    pub estimate_time_seconds: Option<f64>,
    pub steps: Vec<RouteStep>,
}

impl RouteCandidate {
    pub fn from_quote(q: &NormalizedQuote) -> Self {
        RouteCandidate {
            aggregator: q.aggregator.clone(),
            chain: q.chain.clone(),
            chain_id: q.chain_id,
            from_token: q.from_token.clone(),
            to_token: q.to_token.clone(),
            input_amount: q.input_amount,
            output_amount: q.output_amount,
            fee_usd: q.fee_usd,
            gas_estimate_native: q.gas_estimate_native,
            gas_estimate_usd: q.gas_estimate_usd,
            estimate_time_seconds: q.estimate_time_seconds,
            steps: q.steps.clone(),
        }
    }
}

/// Merge normalized quotes into route candidates.
/// Rules:
/// - Group by (from_chain, to_chain, from_address, to_address).
/// - Within each group: sort by output_amount desc, keep quotes within 0.01% of best,
///   then pick the lowest fee (or fastest if fee ties).
pub fn merge_quotes(quotes: Vec<NormalizedQuote>) -> Vec<RouteCandidate> {
    // grouping key
    let mut groups: HashMap<(String, String, String, String), Vec<NormalizedQuote>> = HashMap::new();

    // simple dedupe: skip identical signatures across quotes
    let mut seen: HashSet<String> = HashSet::new();
    for q in quotes.into_iter() {
        let sig = format!("{}-{}-{}-{}", q.from_token, q.to_token, q.chain_id, q.output_amount);
        if seen.contains(&sig) {
            continue;
        }
        seen.insert(sig);
        let key = (q.chain.clone(), q.chain.clone(), q.from_token.clone(), q.to_token.clone());
        groups.entry(key).or_default().push(q);
    }

    let mut out: Vec<RouteCandidate> = Vec::new();

    for (_k, mut group) in groups.into_iter() {
        // sort by score desc (use score_route)
        group.sort_by(|a, b| {
            let sa = score_route(a);
            let sb = score_route(b);
            sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
        });
        if group.is_empty() { continue; }

        let best = &group[0];
        let best_amt = best.output_amount;

        // keep within 0.01% relative diff
        let mut close: Vec<&NormalizedQuote> = group.iter()
            .filter(|g| {
                if best_amt == 0.0 { return false; }
                let rel = (best_amt - g.output_amount).abs() / best_amt;
                rel <= 0.0001
            })
            .collect();

        if close.is_empty() {
            // fall back to best only
            out.push(RouteCandidate::from_quote(best));
            continue;
        }

        // choose by lowest fee_usd when present, otherwise by fastest estimate_time_seconds
        close.sort_by(|a, b| {
            let af = a.fee_usd.unwrap_or(f64::INFINITY);
            let bf = b.fee_usd.unwrap_or(f64::INFINITY);
            if (af - bf).abs() > std::f64::EPSILON {
                af.partial_cmp(&bf).unwrap_or(std::cmp::Ordering::Equal)
            } else {
                let at = a.estimate_time_seconds.unwrap_or(f64::INFINITY);
                let bt = b.estimate_time_seconds.unwrap_or(f64::INFINITY);
                at.partial_cmp(&bt).unwrap_or(std::cmp::Ordering::Equal)
            }
        });

        // pick first
        if let Some(chosen) = close.first() {
            out.push(RouteCandidate::from_quote(chosen));
        }
    }

    out
}
