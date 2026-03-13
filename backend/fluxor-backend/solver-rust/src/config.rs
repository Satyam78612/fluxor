use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct Config {
    pub quicknode_urls: Vec<String>,
    pub mongo_uri: String,
    pub redis_url: String,
    pub nats_url: String,
    pub aggregator_keys: Option<AggregatorKeys>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct AggregatorKeys {
    pub relay_key: Option<String>,
    pub mayan_key: Option<String>,
    pub lifi_key: Option<String>,
    pub bungee_key: Option<String>,
    pub jupiter_key: Option<String>
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        use std::env;

        let quicknode_urls = env::var("QUICKNODE_URLS").unwrap_or_default();
        let quicknode_urls = quicknode_urls
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();

        let mongo_uri = env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://127.0.0.1:27017".to_string());
        let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://127.0.0.1:4222".to_string());

        // Optional aggregator keys
        let aggregator_keys = {
            let relay_key = env::var("RELAY_KEY").ok();
            let mayan_key = env::var("MAYAN_KEY").ok();
            let lifi_key = env::var("LIFI_KEY").ok();
            let bungee_key = env::var("BUNGEE_KEY").ok();
            let jupiter_key = env::var("JUPITER_KEY").ok();

            if relay_key.is_none() && mayan_key.is_none() && lifi_key.is_none() && bungee_key.is_none() && jupiter_key.is_none() {
                None
            } else {
                Some(AggregatorKeys { relay_key, mayan_key, lifi_key, bungee_key, jupiter_key })
            }
        };

        Ok(Config { quicknode_urls, mongo_uri, redis_url, nats_url, aggregator_keys })
    }
}
