// Jupiter aggregator client stub for Solana
use serde::{Deserialize, Serialize};

pub async fn get_quotes(_request: &str) -> anyhow::Result<Vec<NormalizedQuote>> {
    Ok(vec![])
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NormalizedQuote {
    pub aggregator: String,
    pub chain: String,
    pub from_token: String,
    pub to_token: String,
    pub input_amount: rust_decimal::Decimal,
    pub output_amount: rust_decimal::Decimal,
    pub price_impact_pct: rust_decimal::Decimal,
    pub gas_estimate_native: rust_decimal::Decimal,
    pub gas_estimate_usd: rust_decimal::Decimal,
    pub fee_usd: rust_decimal::Decimal,
    pub timestamp: i64,
}
