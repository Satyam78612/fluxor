use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Quote {
    pub aggregator: String,
    pub from_token: String,
    pub to_token: String,
    pub amount_from: f64,
    pub amount_to: f64,
    pub estimated_gas: u64,
    pub steps: Vec<RouteStep>,
    pub cost: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RouteStep {
    pub description: String,
}
