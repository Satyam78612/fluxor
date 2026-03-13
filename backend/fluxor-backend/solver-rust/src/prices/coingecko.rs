use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use reqwest::Client;
use std::time::Duration;
use redis::AsyncCommands;

#[allow(dead_code)]
fn chain_id_to_coin_id(chain_id: i64) -> Option<&'static str> {
    match chain_id {
        1 => Some("ethereum"),
        137 => Some("polygon-pos"),
        56 => Some("binancecoin"),
        43114 => Some("avalanche-2"),
        250 => Some("fantom"),
        101 => Some("solana"),
        _ => None,
    }
}

/// Fetch native token USD price from CoinGecko (with simple/price) and cache in Redis for 60s.
#[allow(dead_code)]
pub async fn get_native_token_price_usd(chain_id: i64) -> Option<Decimal> {
    let coin = chain_id_to_coin_id(chain_id)?;

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());

    // try redis cache
    if let Ok(client) = redis::Client::open(redis_url.as_str()) {
        if let Ok(mut conn) = client.get_async_connection().await {
            let key = format!("coingecko:price:{}:usd", coin);
            let val_res: Result<String, _> = conn.get(&key).await;
            if let Ok(val) = val_res {
                if let Ok(f) = val.parse::<f64>() {
                    return Decimal::from_f64(f);
                }
            }
        }
    }

    // call CoinGecko
    let client = Client::builder().timeout(Duration::from_secs(5)).build().ok()?;
    let url = format!("https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd", coin);
    let api_key = "CG-HfK51pf81RaB2JRccC5ysSJF";

    let resp = client.get(&url).header("x-cg-pro-api-key", api_key).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let parsed: serde_json::Value = resp.json().await.ok()?;
    let price = parsed.get(coin)?.get("usd")?.as_f64()?;

    // store in redis (best-effort)
    if let Ok(client) = redis::Client::open(redis_url.as_str()) {
        if let Ok(mut conn) = client.get_async_connection().await {
            let key = format!("coingecko:price:{}:usd", coin);
            let _ : Result<(), _> = conn.set_ex(key, price.to_string(), 60).await;
        }
    }

    Decimal::from_f64(price)
}
