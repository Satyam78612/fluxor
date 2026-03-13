import { useState, useEffect, useCallback } from 'react';
import { Token } from './Token';
import TokenSearchManager from './TokenSearchManager';

const priceBackendURL = "https://fluxor-backend-ouwq.onrender.com/api/portfolio/prices";

const aiSymbols = ["TAO", "RENDER", "FET", "OCEAN", "AGIX"];
const defiSymbols = ["AAVE", "UNI", "ENA", "MKR", "CRV", "PENDLE", "JUP"];
const l1Symbols = ["BTC", "ETH", "SOL", "BNB", "ADA", "DOT", "AVAX", "SUI", "SEI", "APT"];
const memeSymbols = ["DOGE", "PEPE", "SHIB", "WIF", "BONK", "FLOKI", "MEME"];
const rwaSymbols = ["LINK", "ONDO", "RWA", "TRU", "MPL"];

// Excluded "Favorites" from the tabs
export type MarketTab = 'All' | 'Trending' | 'Stocks' | 'Gainers' | 'Losers' | 'RWA' | 'AI' | 'DeFi' | 'L1' | 'L2' | 'CEX Token' | 'Meme' | 'DePIN' | 'Oracle';

export default function useMarketViewModel() {
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [searchedToken, setSearchedToken] = useState<Token | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [trending, setTrending] = useState<Token[]>([]);
  const [gainers, setGainers] = useState<Token[]>([]);
  const [losers, setLosers] = useState<Token[]>([]);
  
  const [fearAndGreedScore, setFearAndGreedScore] = useState<number>(50);
  const [btcDominance, setBtcDominance] = useState<number>(0);
  const [ethDominance, setEthDominance] = useState<number>(0);

  // --- Initial Load ---
  useEffect(() => {
    loadLocalTokens();
    loadData();
  }, []);

  // --- Reactive Derived Lists (Updates automatically when allTokens changes) ---
  useEffect(() => {
    const sortedByChange = [...allTokens].sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0));
    setTrending(sortedByChange.slice(0, 10));
    
    const positive = allTokens.filter(t => (t.changePercent ?? 0) > 0).sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
    setGainers(positive);
    
    const negative = allTokens.filter(t => (t.changePercent ?? 0) < 0).sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
    setLosers(negative);
  }, [allTokens]);

  // --- Timer for Prices ---
  useEffect(() => {
    if (allTokens.length === 0) return;
    
    fetchPrices(allTokens); // Initial fetch when tokens load
    
    const interval = setInterval(() => {
      fetchPrices(allTokens);
    }, 60000); // 60 seconds
    
    return () => clearInterval(interval);
  }, [allTokens.length]);

  // --- Core Functions ---
  const loadLocalTokens = () => {
    try {
      // NOTE: Ensure your JSON file is accessible at this path in your Expo project
      const decodedTokens: Token[] = require('../assets/Contract for frontend.json');
      
      setAllTokens(decodedTokens);
      console.log(`✅ Successfully loaded ${decodedTokens.length} tokens from local JSON.`);
    } catch (error) {
      console.error("❌ JSON Decoding Error:", error);
    }
  };

  const fetchPrices = async (tokensToFetch: Token[]) => {
    if (tokensToFetch.length === 0) return;

    const ids = tokensToFetch.map(t => t.id).join(",");
    const url = `${priceBackendURL}?ids=${ids}`;
    
    console.log(`📡 Fetching prices for ${tokensToFetch.length} tokens...`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`❌ Price Server Error: Status Code ${response.status}`);
        return;
      }

      const priceData: Record<string, { usd?: number; usd_24h_change?: number }> = await response.json();
      
      if (Object.keys(priceData).length > 0) {
        let updatedCount = 0;
        
        setAllTokens(prevTokens => {
          const newTokens = [...prevTokens];
          for (let i = 0; i < newTokens.length; i++) {
            const tokenID = newTokens[i].id;
            const info = priceData[tokenID];
            
            if (info) {
              const newPrice = info.usd ?? newTokens[i].price ?? 0;
              const newChange = info.usd_24h_change ?? newTokens[i].changePercent ?? 0;
              
              if (newTokens[i].price !== newPrice || newTokens[i].changePercent !== newChange) {
                newTokens[i] = { ...newTokens[i], price: newPrice, changePercent: newChange };
                updatedCount += 1;
              }
            }
          }
          return newTokens;
        });

        if (updatedCount > 0) {
          console.log(`✅ Updated prices for ${updatedCount} tokens.`);
        } else {
          // console.log("⚠️ Price data received but no values changed.");
        }
      }
    } catch (error) {
      console.error("❌ Price Fetch Failed:", error);
    }
  };

  const loadData = async () => {
    await fetchFearAndGreed();
    await fetchDominance();
  };

  const fetchFearAndGreed = async () => {
    try {
      const response = await fetch("https://api.alternative.me/fng/?limit=1");
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        setFearAndGreedScore(Number(data.data[0].value) || 50);
      }
    } catch (error) {
      console.error("⚠️ Fear/Greed Error:", error);
    }
  };

  const fetchDominance = async () => {
    try {
      const response = await fetch("https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest", {
        headers: { "X-CMC_PRO_API_KEY": "4b380165876b4ec18e100af29717b1e4" }
      });
      const json = await response.json();
      if (json.data) {
        setBtcDominance(json.data.btc_dominance);
        setEthDominance(json.data.eth_dominance);
      }
    } catch (error) {
      console.error("⚠️ Dominance Error:", error);
    }
  };

  // --- Helpers ---
  const getTokensForTab = useCallback((tab: string): Token[] => {
    switch (tab) {
      case 'All': return allTokens;
      case 'Gainers': return gainers;
      case 'Losers': return losers;
      case 'Trending': return trending;
      case 'AI': return allTokens.filter(t => aiSymbols.includes(t.symbol.toUpperCase()));
      case 'DeFi': return allTokens.filter(t => defiSymbols.includes(t.symbol.toUpperCase()));
      case 'L1': return allTokens.filter(t => l1Symbols.includes(t.symbol.toUpperCase()));
      case 'Meme': return allTokens.filter(t => memeSymbols.includes(t.symbol.toUpperCase()));
      case 'RWA': return allTokens.filter(t => rwaSymbols.includes(t.symbol.toUpperCase()));
      default: return allTokens;
    }
  }, [allTokens, gainers, losers, trending]);

  const searchTokenByAddress = async (address: string) => {
    const cleanAddress = address.trim();
    if (cleanAddress.length <= 1) return;

    setIsLoading(true);
    setSearchedToken(null);

    const foundToken = await TokenSearchManager.shared.searchToken(cleanAddress);
    
    if (foundToken) {
      setSearchedToken(foundToken);
      
      setAllTokens(prev => {
        const idx = prev.findIndex(t => t.id === foundToken.id);
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], price: foundToken.price, changePercent: foundToken.changePercent };
          return copy;
        }
        return prev;
      });
    } else {
      console.log("⚠️ [ViewModel] Search failed or returned 404. Clearing result.");
      setSearchedToken(null);
    }
    
    setIsLoading(false);
  };

  return {
    allTokens,
    searchedToken,
    setSearchedToken,
    isLoading,
    fearAndGreedScore,
    btcDominance,
    ethDominance,
    getTokensForTab,
    searchTokenByAddress,
    trending,
    gainers,
    losers
  };
}