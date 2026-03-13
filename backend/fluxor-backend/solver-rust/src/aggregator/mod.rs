pub mod relay;
pub mod mayan;
pub mod bungee;
pub mod mock;
pub mod lifi;
pub mod jupiter;
pub mod merge;
pub mod token_map;

pub use merge::RouteCandidate;

use async_trait::async_trait;
use crate::aggregator::lifi::AggregatorError;
use crate::db::Intent;

/// Uniform route type returned by aggregators
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Route {
	pub aggregator: String,
	pub from_chain: i64,
	pub to_chain: i64,
	pub from_token: String,
	pub to_token: String,
	pub input_amount: f64,
	pub output_amount: f64,
	pub gas_cost_usd: Option<f64>,
	pub bridge_fee_usd: Option<f64>,
	pub execution_time_sec: Option<f64>,
	pub raw_tx: Option<String>,
	pub steps: Vec<crate::types::RouteStep>,
}

/// AggregatorQuoteProvider defines a uniform interface for all aggregators.
#[async_trait]
pub trait AggregatorQuoteProvider: Send + Sync {
	fn name(&self) -> &'static str;
	async fn get_quotes(&self, intent: &Intent) -> Result<Vec<Route>, AggregatorError>;
}
