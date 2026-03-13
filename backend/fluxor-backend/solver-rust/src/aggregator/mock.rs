use crate::types::Quote;
use crate::db::Intent;
use anyhow::Result;

#[allow(dead_code)]
pub async fn get_quotes(_intent: &Intent) -> Result<Vec<Quote>> {
    // create a synthetic quote
    let amount = _intent.amount;
    let cost = amount * 0.01;
    let q = Quote {
        aggregator: "mock".to_string(),
        from_token: _intent.fromToken.clone(),
        to_token: _intent.toToken.clone(),
        amount_from: amount,
        amount_to: amount - cost,
        estimated_gas: 21000,
        steps: vec![],
        cost,
    };
    Ok(vec![q])
}
