use once_cell::sync::Lazy;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenInfo {
    pub name: String,
    pub symbol: String,
    pub chain: String,
    pub chain_id: i64,
    pub address: String,
    pub decimals: u8,
}

#[derive(Deserialize)]
struct ContractEntry {
    name: Option<String>,
    symbol: String,
    contracts: HashMap<String, ContractDetail>,
}

#[derive(Deserialize)]
struct ContractDetail {
    chainId: i64,
    address: String,
}

static CONTRACTS_JSON: &str = include_str!("../../../../Contract.json/Contract.json");

static KNOWN_DECIMALS: Lazy<HashMap<&'static str, u8>> = Lazy::new(|| {
    let mut m = HashMap::new();
    m.insert("USDC", 6);
    m.insert("USDT", 6);
    m.insert("DAI", 18);
    m.insert("WETH", 18);
    m.insert("ETH", 18);
    m.insert("WBTC", 8);
    m.insert("BTC", 8);
    m.insert("SOL", 9);
    m.insert("MATIC", 18);
    m
});

/// Keyed by (symbol_uppercase, chainId)
pub static TOKEN_MAP: Lazy<HashMap<(String, i64), TokenInfo>> = Lazy::new(|| {
    let mut map = HashMap::new();

    let parsed: Vec<ContractEntry> = match serde_json::from_str(CONTRACTS_JSON) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("token_map: failed to parse Contract.json: {}", e);
            return map;
        }
    };

    for entry in parsed.into_iter() {
        let symbol_up = entry.symbol.to_uppercase();
        let name = entry.name.unwrap_or_else(|| symbol_up.clone());
        for (chain_name, detail) in entry.contracts.into_iter() {
            let chain_id = detail.chainId;
            let address = detail.address.clone();
            let decimals = KNOWN_DECIMALS.get(symbol_up.as_str()).copied().unwrap_or(18u8);

            let info = TokenInfo {
                name: name.clone(),
                symbol: symbol_up.clone(),
                chain: chain_name.clone(),
                chain_id,
                address: address.clone(),
                decimals,
            };

            map.insert((symbol_up.clone(), chain_id), info);
        }
    }

    map
});

/// Resolve token address for a symbol or address on a chain.
pub fn resolve_token_address(symbol_or_address: &str, chain_id: i64) -> Option<String> {
    let key = symbol_or_address.trim();

    // If looks like an address, normalize and return
    if key.starts_with("0x") && key.len() == 42 {
        return Some(key.to_lowercase());
    }

    let sym = key.to_uppercase();
    TOKEN_MAP.get(&(sym, chain_id)).map(|t| t.address.to_lowercase())
}

/// Resolve token decimals for a symbol or address on a chain.
pub fn resolve_token_decimals(symbol_or_address: &str, chain_id: i64) -> Option<u8> {
    let key = symbol_or_address.trim();

    if key.starts_with("0x") && key.len() == 42 {
        // search by address for given chain
        let low = key.to_lowercase();
        for ((_sym, cid), info) in TOKEN_MAP.iter() {
            if *cid == chain_id && info.address.eq_ignore_ascii_case(&low) {
                return Some(info.decimals);
            }
        }
        return None;
    }

    let sym = key.to_uppercase();
    TOKEN_MAP.get(&(sym, chain_id)).map(|t| t.decimals)
}

/// Convert a Decimal amount to smallest unit integer string using decimals.
pub fn to_smallest_units(amount: Decimal, decimals: u8) -> String {
    let factor = Decimal::from_i128_with_scale(10i128.pow(decimals as u32), 0);
    let smallest = (amount * factor).round();
    // to_i128 should be safe for typical token amounts; fallback to zero string
    smallest.to_i128().map(|i| i.to_string()).unwrap_or_else(|| "0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    #[test]
    fn test_resolve_address_symbol() {
        // USDC on Ethereum (chainId 1)
        let addr = resolve_token_address("USDC", 1).expect("USDC should exist on chain 1");
        assert!(addr.starts_with("0x"));
        assert_eq!(addr, addr.to_lowercase());
    }

    #[test]
    fn test_resolve_decimals() {
        let dec = resolve_token_decimals("USDC", 1).expect("decimals for USDC should exist");
        assert_eq!(dec, 6);
    }

    #[test]
    fn test_to_smallest_units() {
        // 1.5 with 6 decimals -> 1500000
        let amount = Decimal::new(15, 1); // 1.5
        let s = to_smallest_units(amount, 6);
        assert_eq!(s, "1500000");
    }
}


