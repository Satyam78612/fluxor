// Route building and classification utilities
use crate::aggregator::RouteCandidate;

#[derive(Debug, Clone)]
pub struct Route {}

#[derive(Debug, Clone)]
pub struct RouteCollection {
    pub same_chain: Vec<RouteCandidate>,
    pub cross_chain: Vec<RouteCandidate>,
}

/// Classify route candidates into same-chain and cross-chain buckets.
/// - same-chain: candidate.chain == source_chain
/// - cross-chain: otherwise
pub fn build_routes(source_chain: &str, routes: Vec<RouteCandidate>) -> RouteCollection {
    let mut same: Vec<RouteCandidate> = Vec::new();
    let mut cross: Vec<RouteCandidate> = Vec::new();

    for r in routes.into_iter() {
        if r.chain == source_chain {
            same.push(r);
        } else {
            cross.push(r);
        }
    }

    RouteCollection { same_chain: same, cross_chain: cross }
}
