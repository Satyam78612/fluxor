use crate::aggregator::RouteCandidate;
use crate::prices::coingecko::get_native_token_price_usd;
use rust_decimal::prelude::ToPrimitive;

#[derive(Debug, Clone)]
pub struct ScoredRoute {
    pub candidate: RouteCandidate,
    pub score: f64,
}

/// Score an array of RouteCandidate using weighted metrics.
/// Metrics:
/// - output_human (higher better) weight 3.5
/// - price_impact (lower better) weight 3.5
/// - gas_cost_usd (lower better) weight 2.0
/// - time_seconds (lower better) weight 1.0
pub async fn score_routes(routes: &[RouteCandidate]) -> Vec<ScoredRoute> {
    if routes.is_empty() {
        return vec![];
    }
    // New cost-based scoring model:
    // score = output_usd - fee_usd - gas_usd
    // We'll compute output_usd using native token price for the chain (CoinGecko), fee_usd from candidate.fee_usd or estimate, and gas_usd from gas_estimate_usd or computed from gas_estimate_native.
    let mut scored: Vec<ScoredRoute> = Vec::with_capacity(routes.len());

    for r in routes.iter() {
        // output_usd = output_amount * native_price
        let mut output_usd = 0.0f64;
        if let Some(price_dec) = get_native_token_price_usd(r.chain_id).await {
            if let Some(price_f) = price_dec.to_f64() {
                output_usd = r.output_amount * price_f;
            }
        }

        // fee_usd: prefer candidate.fee_usd
        let fee = r.fee_usd.unwrap_or(0.0);

        // gas_usd: prefer gas_estimate_usd, else compute from gas_estimate_native * price
        let gas = if let Some(gusd) = r.gas_estimate_usd {
            gusd
        } else if let Some(g_native) = r.gas_estimate_native {
            if let Some(price_dec) = get_native_token_price_usd(r.chain_id).await {
                if let Some(price_f) = price_dec.to_f64() {
                    g_native * price_f
                } else { 0.0 }
            } else { 0.0 }
        } else { 0.0 };

        let score_val = (output_usd - fee - gas) as f64;

        scored.push(ScoredRoute { candidate: r.clone(), score: score_val });
    }

    // sort by score desc
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    scored
}

/// Choose best route between same-chain and cross-chain according to rule:
/// if best_cross.output >= best_same.output * 1.001 then choose cross else same.
pub fn choose_best_route(same: &[RouteCandidate], cross: &[RouteCandidate]) -> Option<RouteCandidate> {
    let best_same = same.iter().max_by(|a, b| a.output_amount.partial_cmp(&b.output_amount).unwrap_or(std::cmp::Ordering::Equal));
    let best_cross = cross.iter().max_by(|a, b| a.output_amount.partial_cmp(&b.output_amount).unwrap_or(std::cmp::Ordering::Equal));

    match (best_same, best_cross) {
        (Some(s), Some(c)) => {
            if c.output_amount >= s.output_amount * 1.001 {
                Some(c.clone())
            } else {
                Some(s.clone())
            }
        }
        (Some(s), None) => Some(s.clone()),
        (None, Some(c)) => Some(c.clone()),
        (None, None) => None,
    }
}
