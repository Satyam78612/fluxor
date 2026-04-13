import { useState } from 'react';

export interface ChainConfig {
  id: number;
  name: string;
  icon: string;
  explorerBaseUrl: string;
}

export const ChainRegistryData: Record<number, ChainConfig> = {
  1: { id: 1, name: "Ethereum", icon: "ethereum", explorerBaseUrl: "https://etherscan.io/tx/" },
  56: { id: 56, name: "BNB Chain", icon: "bnbchain", explorerBaseUrl: "https://bscscan.com/tx/" },
  101: { id: 101, name: "Solana", icon: "solana", explorerBaseUrl: "https://solscan.io/tx/" },
  137: { id: 137, name: "Polygon", icon: "polygon", explorerBaseUrl: "https://polygonscan.com/tx/" },
  10: { id: 10, name: "Optimism", icon: "optimism", explorerBaseUrl: "https://optimistic.etherscan.io/tx/" },
  42161: { id: 42161, name: "Arbitrum", icon: "arbitrum", explorerBaseUrl: "https://arbiscan.io/tx/" },
  43114: { id: 43114, name: "Avalanche", icon: "avalanche", explorerBaseUrl: "https://snowtrace.io/tx/" },
  8453: { id: 8453, name: "Base", icon: "base", explorerBaseUrl: "https://basescan.org/tx/" },
  5000: { id: 5000, name: "Mantle", icon: "mantle", explorerBaseUrl: "https://mantlescan.xyz/tx/" },
  143: { id: 143, name: "Monad", icon: "monad", explorerBaseUrl: "https://monadscan.com/tx/" },
  999: { id: 999, name: "HyperEVM", icon: "hyperevm", explorerBaseUrl: "https://hyperevmscan.io/tx/" },
  9745: { id: 9745, name: "Plasma", icon: "plasma", explorerBaseUrl: "https://plasmascan.to/tx/" },
  146: { id: 146, name: "Sonic", icon: "sonic", explorerBaseUrl: "https://sonicscan.org/tx/" },
  80094: { id: 80094, name: "Berachain", icon: "berachain", explorerBaseUrl: "https://berascan.com/tx/" }
};

export const ChainRegistry = {
  get: (id: number): ChainConfig => ChainRegistryData[id] || { id, name: "Unknown", icon: "circle.slash", explorerBaseUrl: "" },
  findByName: (name: string): ChainConfig | undefined => Object.values(ChainRegistryData).find(c => c.name.toLowerCase() === name.trim().toLowerCase())
};

export interface CryptoNetwork {
  id: number;
  name: string;
  chainId: number;
  icon: string;
  depositAddress: string;
}

export interface WalletAsset {
  id: string;
  icon: string;
  name: string;
  symbol: string;
  amount: number;
  value: number;
  dayChangeUSD: number;
  isStock: boolean;
  networks: CryptoNetwork[];
  chainSpecificBalances: Record<number, number>;
}

const evmAddress = "0x59714dE56e030071Bf96c7f7Ce500c05476f2C88";
const solanaAddress = "AoD9S5nuShfM5vgh9XvbR6mG1CxmkP3DNhiQX2izV4Ze";

const getAddress = (chainId: number) => chainId === 101 ? solanaAddress : evmAddress;
const makeNetworks = (ids: number[]): CryptoNetwork[] => ids.map(id => {
  const config = ChainRegistry.get(id);
  return { id: config.id, name: config.name, chainId: config.id, icon: config.icon, depositAddress: getAddress(id) };
});

// --- 2. VIEW MODEL HOOK ---
export default function useWalletViewModel() {
  const [assets, setAssets] = useState<WalletAsset[]>([
    { id: "USDCUSDC", icon: "usdc", name: "USDC", symbol: "USDC", amount: 25000, value: 250004, dayChangeUSD: 2, isStock: false, networks: makeNetworks([1, 101, 56, 137, 42161, 10, 8453]), chainSpecificBalances: { 1: 10000, 101: 5000, 56: 5000, 137: 2000, 42161: 1500, 10: 1000, 8453: 503 } },
    { id: "SolanaSOL", icon: "sol", name: "Solana", symbol: "SOL", amount: 150.04, value: 30000, dayChangeUSD: 400, isStock: false, networks: makeNetworks([101]), chainSpecificBalances: { 101: 150.04 } },
    { id: "BitcoinBTC", icon: "btc", name: "Bitcoin", symbol: "BTC", amount: 1.323, value: 39530.24, dayChangeUSD: 800, isStock: false, networks: makeNetworks([101]), chainSpecificBalances: {} },
    { id: "EthereumETH", icon: "eth", name: "Ethereum", symbol: "ETH", amount: 12.532, value: 37500, dayChangeUSD: 650, isStock: false, networks: makeNetworks([1, 42161, 10, 8453, 101]), chainSpecificBalances: {} },
    { id: "BNBBNB", icon: "bnb", name: "BNB", symbol: "BNB", amount: 2221, value: 8800, dayChangeUSD: 120, isStock: false, networks: makeNetworks([56]), chainSpecificBalances: {} },
    { id: "HyperliquidHYPE", icon: "hype", name: "Hyperliquid", symbol: "HYPE", amount: 1205, value: 4200, dayChangeUSD: 38, isStock: false, networks: makeNetworks([999]), chainSpecificBalances: {} },
    { id: "AvalancheAVAX", icon: "avax", name: "Avalanche", symbol: "AVAX", amount: 12012, value: 3000, dayChangeUSD: 25, isStock: false, networks: makeNetworks([43114]), chainSpecificBalances: {} },
    { id: "PolkadotDOT", icon: "dot", name: "Polkadot", symbol: "DOT", amount: 3503, value: 2800, dayChangeUSD: 15, isStock: false, networks: makeNetworks([1]), chainSpecificBalances: {} },
    { id: "UniswapUNI", icon: "uni", name: "Uniswap", symbol: "UNI", amount: 25043, value: 2000, dayChangeUSD: -50, isStock: false, networks: makeNetworks([1]), chainSpecificBalances: {} },
    { id: "AaveAAVE", icon: "aave", name: "Aave", symbol: "AAVE", amount: 22343, value: 2440, dayChangeUSD: -521, isStock: false, networks: makeNetworks([1]), chainSpecificBalances: {} },
    { id: "TetherUSDT", icon: "usdt", name: "Tether", symbol: "USDT", amount: 0.5, value: 0.50, dayChangeUSD: 0, isStock: false, networks: makeNetworks([1, 56, 137, 42161]), chainSpecificBalances: {} },
    { id: "ArbitrumARB", icon: "arb", name: "Arbitrum", symbol: "ARB", amount: 5000, value: 5000, dayChangeUSD: 50, isStock: false, networks: makeNetworks([42161]), chainSpecificBalances: {} },
    { id: "OptimismOP", icon: "op", name: "Optimism", symbol: "OP", amount: 2000, value: 3000, dayChangeUSD: 30, isStock: false, networks: makeNetworks([10]), chainSpecificBalances: {} },
    { id: "PolygonPOL", icon: "matic", name: "Polygon", symbol: "POL", amount: 1000, value: 400, dayChangeUSD: 10, isStock: false, networks: makeNetworks([137]), chainSpecificBalances: {} },
    { id: "MonadMON", icon: "mon", name: "Monad", symbol: "MON", amount: 1000, value: 500, dayChangeUSD: 5, isStock: false, networks: makeNetworks([143]), chainSpecificBalances: {} },
    { id: "MantleMNT", icon: "mnt", name: "Mantle", symbol: "MNT", amount: 594.55, value: 300, dayChangeUSD: 2, isStock: false, networks: makeNetworks([5000]), chainSpecificBalances: {} },
    { id: "LineaLINEA", icon: "linea", name: "Linea", symbol: "LINEA", amount: 32.234, value: 15040, dayChangeUSD: 10, isStock: false, networks: makeNetworks([1]), chainSpecificBalances: {} },
    { id: "SonicS", icon: "s", name: "Sonic", symbol: "S", amount: 1323130, value: 200, dayChangeUSD: 20, isStock: false, networks: makeNetworks([146]), chainSpecificBalances: {} },
    { id: "BerachainBERA", icon: "bera", name: "Berachain", symbol: "BERA", amount: 586855, value: 2500, dayChangeUSD: 100, isStock: false, networks: makeNetworks([80094]), chainSpecificBalances: {} },
    { id: "XLayerOKB", icon: "okb", name: "X Layer", symbol: "OKB", amount: 2320, value: 1000, dayChangeUSD: 5, isStock: false, networks: makeNetworks([1]), chainSpecificBalances: {} },
    { id: "MerlinMERL", icon: "merl", name: "Merlin", symbol: "MERL", amount: 2000, value: 1200, dayChangeUSD: 15, isStock: false, networks: makeNetworks([1]), chainSpecificBalances: {} },
    { id: "PlasmaPLASMA", icon: "xpl", name: "Plasma", symbol: "PLASMA", amount: 5000, value: 100, dayChangeUSD: 0, isStock: false, networks: makeNetworks([9745]), chainSpecificBalances: {} },
    { id: "TeslaTSLA", icon: "tslax", name: "Tesla", symbol: "TSLA", amount: 586855, value: 22200, dayChangeUSD: 100, isStock: true, networks: makeNetworks([80094]), chainSpecificBalances: {} },
    { id: "RobinhoodHOOD", icon: "hoodx", name: "Robinhood", symbol: "HOOD", amount: 2950, value: 12300, dayChangeUSD: 5, isStock: true, networks: makeNetworks([1]), chainSpecificBalances: {} },
    { id: "MicroStrategyMSTR", icon: "mstrx", name: "MicroStrategy", symbol: "MSTR", amount: 2000, value: 12000, dayChangeUSD: 15, isStock: true, networks: makeNetworks([101]), chainSpecificBalances: {} },
    { id: "CircleCRCL", icon: "crclx", name: "Circle", symbol: "CRCLX", amount: 5000, value: 10000, dayChangeUSD: 0, isStock: true, networks: makeNetworks([9745]), chainSpecificBalances: {} }
  ]);

  return {
    assets,
    setAssets
  };
}