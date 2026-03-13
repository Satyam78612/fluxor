use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenContract {
    #[serde(rename = "chainId")]
    pub chain_id: i64,
    pub address: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub name: String,
    pub symbol: String,
    pub contracts: HashMap<String, TokenContract>,
}

/// TokenRegistry holds the loaded Contract.json data
/// Maps (symbol, chainId) -> (address, decimals)
#[allow(dead_code)]
pub struct TokenRegistry {
    // Map: (symbol, chainId) -> address
    symbol_chain_to_address: HashMap<(String, i64), String>,
    // Map: symbol -> Vec<chainId>
    symbol_to_chains: HashMap<String, Vec<i64>>,
}

impl TokenRegistry {
    /// Load Contract.json from the given path
    pub async fn load(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let content = tokio::fs::read_to_string(path).await?;
        let tokens: Vec<Token> = serde_json::from_str(&content)?;

        let mut symbol_chain_to_address: HashMap<(String, i64), String> = HashMap::new();
        let mut symbol_to_chains: HashMap<String, Vec<i64>> = HashMap::new();

        for token in tokens {
            let symbol = token.symbol.clone();
            let mut chains = Vec::new();

            for (_chain_name, contract) in &token.contracts {
                let chain_id = contract.chain_id;
                let address = contract.address.clone();

                symbol_chain_to_address.insert((symbol.clone(), chain_id), address);
                chains.push(chain_id);
            }

            // Sort and deduplicate chains
            chains.sort();
            chains.dedup();
            symbol_to_chains.insert(symbol, chains);
        }

        tracing::info!("Loaded {} tokens from Contract.json", symbol_chain_to_address.len());

        Ok(TokenRegistry {
            symbol_chain_to_address,
            symbol_to_chains,
        })
    }

    /// Get all chains where a token exists
    pub fn find_token_chains(&self, symbol: &str) -> Vec<i64> {
        self.symbol_to_chains
            .get(symbol)
            .cloned()
            .unwrap_or_default()
    }

    /// Get token address on a specific chain
    pub fn get_token_address(&self, symbol: &str, chain_id: i64) -> Option<String> {
        self.symbol_chain_to_address
            .get(&(symbol.to_string(), chain_id))
            .cloned()
    }

    /// Get token decimals (hardcoded per chain standards; can be extended)
    pub fn get_token_decimals(&self, symbol: &str, _chain_id: i64) -> u8 {
        // Most tokens use 18 decimals on EVM chains, except some stablecoins
        match symbol.to_uppercase().as_str() {
            "USDC" | "USDT" | "PYUSD" | "USDE" | "USDS" => 6,
            "USD1" | "USDTB" => 18,
            _ => 18,
        }
    }

    /// Check if a token exists on a specific chain
    pub fn token_exists(&self, symbol: &str, chain_id: i64) -> bool {
        self.symbol_chain_to_address.contains_key(&(symbol.to_string(), chain_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_load_token_registry() {
        let registry = TokenRegistry::load("../../Contract.json/Contract.json").await;
        assert!(registry.is_ok());
    }
}
