import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  useColorScheme,
  Platform,
  Modal,
  TextInput,
  Animated,
  Keyboard,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../theme/colors';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../context/ThemeContext';
import { TokenIcon } from '../../components/TokenIcon';
import { SmartPriceText } from '../../components/SmartPriceText';

// Define the exact type for our theme to fix the TS(7053) errors
type Theme = 'light' | 'dark';

// MARK: - 1. CHAIN REGISTRY (Single Source of Truth)
interface ChainConfig {
  id: number;
  name: string;
  icon: string;
  explorerBaseUrl: string;
}

const ChainRegistryData: Record<number, ChainConfig> = {
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
  196: { id: 196, name: "X Layer", icon: "xlayerchain", explorerBaseUrl: "https://www.oklink.com/x-layer/tx/" },
  4200: { id: 4200, name: "Merlin", icon: "merlin", explorerBaseUrl: "https://scan.merlinchain.io/tx/" },
  9745: { id: 9745, name: "Plasma", icon: "plasma", explorerBaseUrl: "https://plasmascan.to/tx/" },
  59144: { id: 59144, name: "Linea", icon: "lineachain", explorerBaseUrl: "https://lineascan.build/tx/" },
  146: { id: 146, name: "Sonic", icon: "sonic", explorerBaseUrl: "https://sonicscan.org/tx/" },
  80094: { id: 80094, name: "Berachain", icon: "berachain", explorerBaseUrl: "https://berascan.com/tx/" },
  0: { id: 0, name: "Particle Chain", icon: "", explorerBaseUrl: "https://scan-mainnet-alpha.particle.network/tx/" }
};

const ChainRegistry = {
  get: (id: number): ChainConfig => ChainRegistryData[id] || { id, name: "Unknown", icon: "circle.slash", explorerBaseUrl: "" },
  findByName: (name: string): ChainConfig | undefined => Object.values(ChainRegistryData).find(c => c.name.toLowerCase() === name.trim().toLowerCase())
};

// MARK: - Fee Estimation Helper
const FeeEstimator = {
  getEstimatedNetworkFeeUSD: (chainId: number): number => {
    switch (chainId) {
      case 1: return 4.50; // Ethereum
      case 56: return 0.05; // BNB
      case 101: return 0.002; // Solana
      case 137: return 0.01; // Polygon
      case 42161: return 0.02; // Arbitrum
      case 10: return 0.02; // Optimism
      case 8453: return 0.01; // Base
      case 59144: return 0.03; // Linea
      case 80094: return 0.15; // Berachain
      default: return 0.01;
    }
  }
};

const formatFee = (fee: number): string => {
  if (fee === 0) return "$0.00 USD";
  if (fee < 0.01) return `$${fee.toFixed(3)} USD`;
  return `$${fee.toFixed(2)} USD`;
};

// MARK: - 2. GLOBAL HELPERS
const formatSmartValue = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatSmartAmount = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8, useGrouping: true }).format(value);
const getExplorerURL = (chainId: number, hash: string) => {
    const config = ChainRegistry.get(chainId);
    return config.explorerBaseUrl ? `${config.explorerBaseUrl}${hash}` : null;
};

// MARK: - 3. MODELS
interface CryptoNetwork {
  id: number;
  name: string;
  chainId: number;
  icon: string;
  depositAddress: string;
}

interface WalletTxInfo {
  id: string;
  chainId: number;
  txHash: string;
}

interface WalletTransaction {
  id: string;
  type: 'sent' | 'received' | 'converted';
  symbol: string;
  status: string;
  date: string;
  mainAmount: string;
  price?: string;
  buyAmount?: string;
  sellAmount?: string;
  gasFee: string;
  networkChainId?: number;
  appFee: string;
  address: string;
  targetTx?: WalletTxInfo;
  settlementTx?: WalletTxInfo;
  sourceTxs: WalletTxInfo[];
}

interface WalletAsset {
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

// MARK: - 4. MOCK DATA INITIALIZATION
const evmAddress = "0x59714dE56e030071Bf96c7f7Ce500c05476f2C88";
const solanaAddress = "AoD9S5nuShfM5vgh9XvbR6mG1CxmkP3DNhiQX2izV4Ze";

const getAddress = (chainId: number) => chainId === 101 ? solanaAddress : evmAddress;
const makeNetworks = (ids: number[]): CryptoNetwork[] => ids.map(id => {
  const config = ChainRegistry.get(id);
  return { id: config.id, name: config.name, chainId: config.id, icon: config.icon, depositAddress: getAddress(id) };
});

const mockAssets: WalletAsset[] = [
  { id: "USDCUSDC", icon: "usdc", name: "USDC", symbol: "USDC", amount: 25000, value: 25004, dayChangeUSD: 2, isStock: false, networks: makeNetworks([1, 101, 56, 137, 42161, 10, 8453]), chainSpecificBalances: { 1: 10000, 101: 5000, 56: 5000, 137: 2000, 42161: 1500, 10: 1000, 8453: 503 } },
  { id: "SolanaSOL", icon: "sol", name: "Solana", symbol: "SOL", amount: 150.04, value: 30000, dayChangeUSD: 400, isStock: false, networks: makeNetworks([101]), chainSpecificBalances: { 101: 150.04 } },
  { id: "BitcoinBTC", icon: "btc", name: "Bitcoin", symbol: "BTC", amount: 1.323, value: 39530.24, dayChangeUSD: 800, isStock: false, networks: makeNetworks([101]), chainSpecificBalances: {} },
  { id: "EthereumETH", icon: "eth", name: "Ethereum", symbol: "ETH", amount: 12.532, value: 37500, dayChangeUSD: 650, isStock: false, networks: makeNetworks([1, 42161, 10, 8453, 59144]), chainSpecificBalances: {} },
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
  { id: "LineaLINEA", icon: "linea", name: "Linea", symbol: "LINEA", amount: 32.234, value: 15040, dayChangeUSD: 10, isStock: false, networks: makeNetworks([59144]), chainSpecificBalances: {} },
  { id: "SonicS", icon: "s", name: "Sonic", symbol: "S", amount: 1323130, value: 200, dayChangeUSD: 20, isStock: false, networks: makeNetworks([146]), chainSpecificBalances: {} },
  { id: "BerachainBERA", icon: "bera", name: "Berachain", symbol: "BERA", amount: 586855, value: 2500, dayChangeUSD: 100, isStock: false, networks: makeNetworks([80094]), chainSpecificBalances: {} },
  { id: "XLayerOKB", icon: "okb", name: "X Layer", symbol: "OKB", amount: 2320, value: 1000, dayChangeUSD: 5, isStock: false, networks: makeNetworks([196]), chainSpecificBalances: {} },
  { id: "MerlinMERL", icon: "merl", name: "Merlin", symbol: "MERL", amount: 2000, value: 1200, dayChangeUSD: 15, isStock: false, networks: makeNetworks([4200]), chainSpecificBalances: {} },
  { id: "PlasmaPLASMA", icon: "xpl", name: "Plasma", symbol: "PLASMA", amount: 5000, value: 100, dayChangeUSD: 0, isStock: false, networks: makeNetworks([9745]), chainSpecificBalances: {} },
  { id: "TeslaTSLA", icon: "tslax", name: "Tesla", symbol: "TSLA", amount: 586855, value: 22200, dayChangeUSD: 100, isStock: true, networks: makeNetworks([80094]), chainSpecificBalances: {} },
  { id: "RobinhoodHOOD", icon: "hoodx", name: "Robinhood", symbol: "HOOD", amount: 2950, value: 12300, dayChangeUSD: 5, isStock: true, networks: makeNetworks([196]), chainSpecificBalances: {} },
  { id: "MicroStrategyMSTR", icon: "mstrx", name: "MicroStrategy", symbol: "MSTR", amount: 2000, value: 12000, dayChangeUSD: 15, isStock: true, networks: makeNetworks([4200]), chainSpecificBalances: {} },
  { id: "CircleCRCL", icon: "crclx", name: "Circle", symbol: "CRCL", amount: 5000, value: 10000, dayChangeUSD: 0, isStock: true, networks: makeNetworks([9745]), chainSpecificBalances: {} }
];

const mockTransactions: WalletTransaction[] = [
  { id: '1', type: 'sent', symbol: 'SOL', status: 'Success', date: '8/12/25, 9:09 PM', mainAmount: '-0.01473 SOL', sellAmount: '-0.01473 SOL', gasFee: '$0.0005', networkChainId: 101, appFee: '', address: '0x59714dE56e030071Bf96c7f7Ce500c05476f2C88', targetTx: { id: 't1', chainId: 101, txHash: 'E1PsV6X4ntLR7Vxg8rHEXevZ3rVqgy1zvSViCXf7MdjJj2WmnZ5QdBZwXs532RFc2KMbezTtfh8zHbLuKXNVHNN' }, settlementTx: { id: 's1', chainId: 0, txHash: '0xf0c200811eb068de3a6adcd9d0bc3c66650ac50403f2c1931002c391d14ad56a' }, sourceTxs: [] },
  { id: '2', type: 'received', symbol: 'SOL', status: 'Success', date: '8/12/25, 7:30 PM', mainAmount: '+0.01474 SOL', buyAmount: '+0.01474 SOL', gasFee: '$0.0005', networkChainId: 101, appFee: '', address: '0x59714dE56e030071Bf96c7f7Ce500c05476f2C88', sourceTxs: [{ id: 'src1', chainId: 101, txHash: 'E1PsV6X4ntLR7Vxg8rHEXevZ3rVqgy1zvSViCXf7MdjJj2WmnZ5QdBZwXs532RFc2KMbezTtfh8zHbLuKXNVHNN' }] },
  { id: '3', type: 'converted', symbol: 'USDT', status: 'Success', date: '6/02/25, 11:10 AM', mainAmount: '500 USDC', buyAmount: '+500 USDT', sellAmount: '-500 USDC', gasFee: '$0.10', networkChainId: 10, appFee: '$0.03', address: '', targetTx: { id: 't2', chainId: 10, txHash: '0x4ea4aee4e22d7b1aba7bf63136aba80322c4a417b944b622cc23c2fbe4248880' }, settlementTx: { id: 's2', chainId: 0, txHash: '0xf0c200811eb068de3a6adcd9d0bc3c66650ac50403f2c1931002c391d14ad56a' }, sourceTxs: [{ id: 'src2', chainId: 56, txHash: '0xa09074a6787ec48a404ef79a53b76559f69d34577f0a8aa97c14d99d7d67033c' }, { id: 'src3', chainId: 42161, txHash: '0x9a2210416f1cc853f9f9842728f2aaa57d1578bec58f9472f33fbbd4e8e9c805' }] },
  { id: '4', type: 'received', symbol: 'ETH', status: 'Success', date: '8/10/25, 7:23 PM', mainAmount: '+2 ETH', buyAmount: '+2 ETH', gasFee: '$0.59', networkChainId: 1, appFee: '', address: '0x59714dE56e030071Bf96c7f7Ce500c05476f2C88', settlementTx: { id: 's3', chainId: 0, txHash: '0xf0c200811eb068de3a6adcd9d0bc3c66650ac50403f2c1931002c391d14ad56a' }, sourceTxs: [{ id: 'src4', chainId: 1, txHash: '0x9a2210416f1cc853f9f9842728f2aaa57d1578bec58f9472f33fbbd4e8e9c805' }] }
];


// MARK: - 5. MAIN WALLET VIEW
export default function WalletScreen() {
  const { theme: scheme } = useTheme();
  const isDark = scheme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState("Overview");
  const [isShowingSearch, setIsShowingSearch] = useState(false);
  const [isShowingHistory, setIsShowingHistory] = useState(false);
  const [isShowingDeposit, setIsShowingDeposit] = useState(false);
  const [isShowingWithdraw, setIsShowingWithdraw] = useState(false);
  const [isShowingConvert, setIsShowingConvert] = useState(false);
  const [hideSmallAssets, setHideSmallAssets] = useState(false);
  const [showFilterCard, setShowFilterCard] = useState(false);
  const [selectedAssetForDetail, setSelectedAssetForDetail] = useState<WalletAsset | null>(null);

  const totalBalance = mockAssets.reduce((sum, a) => sum + a.value, 0);
  const todayPNL = mockAssets.reduce((sum, a) => sum + a.dayChangeUSD, 0);
  const todayPNLPercent = totalBalance - todayPNL > 0 ? (todayPNL / (totalBalance - todayPNL)) * 100 : 0;

  const sortedAssets = useMemo(() => {
    let filtered = hideSmallAssets ? mockAssets.filter(a => a.value >= 1.0) : mockAssets;
    if (selectedCategory === "Crypto") {
        filtered = filtered.filter(a => !a.isStock);
    } else if (selectedCategory === "Stocks") {
        filtered = filtered.filter(a => a.isStock);
    }
    return filtered.sort((a, b) => b.value - a.value);
  }, [hideSmallAssets, selectedCategory]);

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity activeOpacity={1} onPress={() => showFilterCard && setShowFilterCard(false)}>
          <View style={{ gap: 10, paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingHorizontal: 4, paddingBottom: 40, marginTop: -10 }}>
            <WalletBalanceCard 
              totalBalance={totalBalance} todayPNL={todayPNL} todayPNLPercent={todayPNLPercent} 
              onHistoryTap={() => setIsShowingHistory(true)} scheme={scheme} 
            />
            <WalletActionButtons 
              onDepositTap={() => setIsShowingDeposit(true)} 
              onWithdrawTap={() => setIsShowingWithdraw(true)} 
              onConvertTap={() => setIsShowingConvert(true)} 
              scheme={scheme} 
            />

            <View style={{ zIndex: 100 }}>
              {/* Category Headers */}
              <View style={[styles.categoryHeader, { zIndex: 100 }]}>
                <View style={{ flexDirection: 'row', gap: 15 }}>
                  {["Overview", "Crypto", "Stocks"].map(cat => (
                    <TouchableOpacity key={cat} onPress={() => setSelectedCategory(cat)} activeOpacity={1}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.catText, { color: selectedCategory === cat ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }]}>{cat}</Text>
                        <View style={[styles.catIndicator, { backgroundColor: selectedCategory === cat ? Colors.TextPrimary[scheme] : 'transparent' }]} />
                        </View>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setIsShowingSearch(true)} hitSlop={{top:0, bottom:0, left:0, right:0}}>
                  <Ionicons name="search" size={19} color={Colors.TextSecondary[scheme]} style={{ paddingBottom: 7, fontWeight: '500' as any }} />
                </TouchableOpacity>
                
                <TouchableOpacity onPress={() => setShowFilterCard(!showFilterCard)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Image 
                      source={require('../../assets/Buttons/Hexagon.png')} 
                      style={{ 
                        width: 38, 
                        height: 38, 
                        marginLeft: 6, 
                        marginBottom: 8, 
                        marginHorizontal: -12,
                        tintColor: Colors.TextPrimary[scheme]
                      }} 
                      resizeMode="contain"
                    />
                 </TouchableOpacity>

                {/* Filter Popup Overlay */}
                {showFilterCard && (
                  <View style={[styles.filterPopup, { backgroundColor: Colors.AppBackground[scheme], borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }]}>
                    <TouchableOpacity onPress={() => setHideSmallAssets(!hideSmallAssets)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontFamily: 'Inter-Medium', fontSize: 14, color: Colors.TextPrimary[scheme], flex: 1 }}>Hide assets {"<"}1 USD</Text>
                      <Ionicons name={hideSmallAssets ? "checkbox" : "square-outline"} size={16} color={hideSmallAssets ? "#FFD60A" : Colors.TextSecondary[scheme]} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', marginHorizontal: 13, marginTop: -7.5, marginBottom: 1 }} />

              <View style={{ gap: 0 }}>
                {sortedAssets.map(asset => (
                  <TouchableOpacity key={asset.id} onPress={() => setSelectedAssetForDetail(asset)} activeOpacity={0.7}>
                    <WalletAssetRow asset={asset} scheme={scheme} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* FULL SCREEN MODALS */}
      <Modal visible={isShowingDeposit} animationType="slide"><DepositView assets={mockAssets} onClose={() => setIsShowingDeposit(false)} scheme={scheme} /></Modal>
      <Modal visible={isShowingWithdraw} animationType="slide"><WithdrawView assets={mockAssets} onClose={() => setIsShowingWithdraw(false)} scheme={scheme} /></Modal>
      <Modal visible={isShowingConvert} animationType="slide"><ConvertView assets={mockAssets} onClose={() => setIsShowingConvert(false)} scheme={scheme} /></Modal>
      <Modal visible={isShowingSearch} animationType="slide"><TokenSearchPage assets={mockAssets} transactions={mockTransactions} onClose={() => setIsShowingSearch(false)} onSelectAsset={setSelectedAssetForDetail} scheme={scheme} /></Modal>
      <Modal visible={isShowingHistory} animationType="slide"><HistoryView transactions={mockTransactions} onClose={() => setIsShowingHistory(false)} scheme={scheme} /></Modal>
      <Modal visible={!!selectedAssetForDetail} animationType="slide">
        {selectedAssetForDetail && (
          <TokenDetailView 
            asset={selectedAssetForDetail} 
            allTransactions={mockTransactions} 
            onClose={() => setSelectedAssetForDetail(null)} 
            scheme={scheme} 
          />
        )}
      </Modal>
    </View>
  );
}

// MARK: - SUB VIEWS

const WalletBalanceCard = ({ totalBalance, todayPNL, todayPNLPercent, onHistoryTap, scheme }: { totalBalance: number, todayPNL: number, todayPNLPercent: number, onHistoryTap: () => void, scheme: Theme }) => {
  const isPos = todayPNL >= 0;
  const pnlColor = isPos ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30');
  const pnlSign = isPos ? "+" : "";
  return (
    <View style={styles.wbCard}>
      <VStack spacing={18}>
        <Text style={[styles.wbTitle, { color: Colors.TextSecondary[scheme] }]}>Total Balance</Text>
        <Text style={[styles.wbBalance, { color: Colors.TextPrimary[scheme] }]}>${formatSmartValue(totalBalance)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: -10, marginBottom: 8 }}>
          <Text style={[styles.wbPnlLabel, { color: Colors.TextSecondary[scheme] }]}>Today's PnL</Text>
          <TouchableOpacity onPress={() => console.log("PnL Value Tapped!")}>
            <Text style={[styles.wbPnlValue, { color: pnlColor }]}>{pnlSign}${formatSmartValue(todayPNL)} ({pnlSign}{todayPNLPercent.toFixed(2)}%)</Text>
          </TouchableOpacity>
        </View>
      </VStack>
      <TouchableOpacity onPress={onHistoryTap} style={{ position: 'absolute', top: 20, right: 13 }}>
        <Image source={require('../../assets/Buttons/HistoryCard.png')} style={{ width: 20, height: 20, tintColor: Colors.TextPrimary[scheme] }} />
      </TouchableOpacity>
    </View>
  );
};

const WalletActionButtons = ({ onDepositTap, onWithdrawTap, onConvertTap, scheme }: { onDepositTap: () => void, onWithdrawTap: () => void, onConvertTap: () => void, scheme: Theme }) => (
  <View style={styles.actionRow}>
    <TouchableOpacity onPress={onDepositTap} style={[styles.actionBtn, { backgroundColor: Colors.FluxorPurple?.[scheme] || '#6B4EFF' }]}><Text style={[styles.actionBtnText, { color: Colors.CardBackground?.[scheme] || '#1C1C1E' }]}>Deposit</Text></TouchableOpacity>
    <TouchableOpacity onPress={onWithdrawTap} style={[styles.actionBtn, { backgroundColor: Colors.TextPrimary[scheme] }]}><Text style={[styles.actionBtnText, { color: Colors.CardBackground?.[scheme] || '#1C1C1E' }]}>Withdraw</Text></TouchableOpacity>
    <TouchableOpacity onPress={onConvertTap} style={[styles.actionBtn, { backgroundColor: Colors.TextPrimary[scheme] }]}><Text style={[styles.actionBtnText, { color: Colors.CardBackground?.[scheme] || '#1C1C1E' }]}>Convert</Text></TouchableOpacity>
  </View>
);

const WalletAssetRow = ({ asset, scheme }: { asset: WalletAsset, scheme: Theme }) => (
  <View style={styles.assetRow}>
    <TokenIcon symbol={asset.symbol} size={38} /> 
    <View style={{ flex: 1, marginLeft: 8, gap: 2 }}>
      <Text style={[styles.assetName, { color: Colors.TextPrimary[scheme] }]}>{asset.name}</Text>
      <Text style={[styles.assetSymbol, { color: Colors.TextSecondary[scheme] }]}>{asset.symbol}</Text>
    </View>
    <View style={{ alignItems: 'flex-end', gap: 2.2 }}>
      {/* 1. This uses the updated helper to show 25,000 */}
      <Text style={[styles.assetAmount, { color: Colors.TextPrimary[scheme] }]}>
        {formatSmartAmount(asset.amount)}
      </Text>
      
      {/* 2. This uses YOUR custom SmartPriceText for the $ value! */}
      <SmartPriceText 
        value={asset.value} 
        fontSize={15} 
        fontFamily="Inter-Medium" 
        color={Colors.TextSecondary[scheme]} 
      />
    </View>
  </View>
);

const WalletTransactionRow = ({ transaction, onSelect, scheme }: { transaction: WalletTransaction, onSelect?: () => void, scheme: Theme }) => {
  const isPos = transaction.type === 'received';
  const amountColor = isPos ? (Colors.AppGreen?.[scheme] || '#28CD41') : (transaction.type === 'converted' ? Colors.TextPrimary[scheme] : (Colors.AppRed?.[scheme] || '#FF3B30'));
  const title = transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1);
  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.7} style={[styles.txRow, { backgroundColor: Colors.HistoryCard?.[scheme] || '#1C1C1E' }]}>
      <TokenIcon symbol={transaction.symbol} size={40} />
      <View style={{ flex: 1, marginLeft: 10, gap: 4 }}>
        <Text style={[styles.txTitle, { color: Colors.TextPrimary[scheme] }]}>{title}</Text>
        <Text style={[styles.txDate, { color: Colors.TextSecondary[scheme] }]}>{transaction.date}</Text>
      </View>
      <Text style={[styles.txAmount, { color: amountColor }]}>{transaction.mainAmount}</Text>
    </TouchableOpacity>
  );
};

// MARK: - FULL SCREEN MODALS

const HistoryView = ({ transactions, onClose, scheme }: { transactions: WalletTransaction[], onClose: () => void, scheme: Theme }) => {
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);
  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="History" onClose={onClose} scheme={scheme} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {transactions.map((tx: WalletTransaction) => (
            <WalletTransactionRow key={tx.id} transaction={tx} onSelect={() => setSelectedTx(tx)} scheme={scheme} />
          ))}
        </View>
      </ScrollView>
      <Modal visible={!!selectedTx} transparent animationType="slide">
        {selectedTx && (
          <TransactionDetailSheet 
            item={selectedTx} 
            onClose={() => setSelectedTx(null)} 
            scheme={scheme} 
          />
        )}
      </Modal>
    </View>
  );
};

const TokenDetailView = ({ asset, allTransactions, onClose, scheme }: { asset: WalletAsset, allTransactions: WalletTransaction[], onClose: () => void, scheme: Theme }) => {
  const [selectedTab, setSelectedTab] = useState("Chains");
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);
  const [isShowingReceive, setIsShowingReceive] = useState(false);
  const [isShowingSend, setIsShowingSend] = useState(false);

  const specificHistory = allTransactions.filter((tx: WalletTransaction) => {
    if (tx.symbol === asset.symbol) return true;
    if (tx.type === 'converted') {
        if (tx.mainAmount.includes(asset.symbol)) return true;
        if (tx.buyAmount?.includes(asset.symbol)) return true;
        if (tx.sellAmount?.includes(asset.symbol)) return true;
    }
    return false;
  });

  const chainBalances = asset.networks.map((n: CryptoNetwork) => ({
      network: n,
      amount: formatSmartAmount(asset.chainSpecificBalances[n.chainId] || 0)
  }));
  
  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="" titleView={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TokenIcon symbol={asset.symbol} size={26} />
          <Text style={[styles.headerTitle, { color: Colors.TextPrimary[scheme] }]}>{asset.name}</Text>
        </View>
      } onClose={onClose} scheme={scheme} />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 25 }}>
          <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: 'Inter-Medium', fontSize: 16, color: Colors.TextSecondary[scheme] }}>Balance</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 32, color: Colors.TextPrimary[scheme] }}>{formatSmartAmount(asset.amount)}</Text>
                <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: Colors.TextSecondary[scheme], paddingBottom: 4 }}>${formatSmartValue(asset.value)}</Text>
              </View>
              
              <View style={{ flexDirection: 'row', gap: 40, marginTop: 10 }}>
                <VStack spacing={4}>
                  <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, color: Colors.TextSecondary[scheme] }}>Available</Text>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 16, color: Colors.TextPrimary[scheme] }}>{formatSmartAmount(asset.amount)}</Text>
                </VStack>
                <VStack spacing={4}>
                  <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, color: Colors.TextSecondary[scheme] }}>Unavailable</Text>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 16, color: Colors.TextPrimary[scheme] }}>0.00</Text>
                </VStack>
              </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: -4 }}>
            <TokenActionButton icon={require('../../assets/Buttons/Send.png')} text="Send" action={() => setIsShowingSend(true)} scheme={scheme} />
            <TokenActionButton icon={require('../../assets/Buttons/Receive.png')} text="Receive" action={() => setIsShowingReceive(true)} scheme={scheme} />
          </View>

          <View style={{ marginTop: -5 }}>
            {/* The Tabs */}
            <View style={{ flexDirection: 'row', gap: 25 }}>
              <TabButton title="Chains" selectedTab={selectedTab} onSelect={setSelectedTab} scheme={scheme} />
              <TabButton title="History" selectedTab={selectedTab} onSelect={setSelectedTab} scheme={scheme} />
            </View>
  
            {/* The Full-Width Divider Line */}
            <View 
              style={{ 
                height: 1, 
                backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
                marginTop: -2, // Pulls the divider up slightly so the tab indicator overlaps it
                marginBottom: 10 
              }} 
            />
          </View>

          <View style={{ paddingBottom: 40, marginTop: -8 }}>
            {selectedTab === "Chains" ? (
              chainBalances.length === 0 ? (
                <View style={{ paddingTop: 20 }}>
                    <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>No networks available</Text>
                </View>
              ) : (
                <View style={{ gap: 22 }}>
                    {chainBalances.map((item) => (
                        <View key={item.network.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                           <TokenIcon symbol={item.network.icon} size={30} />
                            <Text style={{ fontFamily: 'Inter-Medium', fontSize: 19, color: Colors.TextPrimary[scheme], marginLeft: 10 }}>{item.network.name}</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={{ fontFamily: 'Inter-Medium', fontSize: 19, color: Colors.TextPrimary[scheme] }}>{item.amount}</Text>
                        </View>
                    ))}
                </View>
              )
            ) : (
              specificHistory.length === 0 ? (
                <View style={{ alignItems: 'center', gap: 20, paddingTop: 40 }}>
                    <Ionicons name="time-outline" size={40} color={Colors.TextSecondary[scheme]} />
                    <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>No recent {asset.symbol} history</Text>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                    {specificHistory.map((tx: WalletTransaction) => (
                        <WalletTransactionRow key={tx.id} transaction={tx} onSelect={() => setSelectedTx(tx)} scheme={scheme} />
                    ))}
                </View>
              )
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={isShowingReceive} animationType="slide"><DepositDetailsView asset={asset} onClose={() => setIsShowingReceive(false)} scheme={scheme} /></Modal>
      <Modal visible={isShowingSend} animationType="slide"><WithdrawDetailsView asset={asset} onClose={() => setIsShowingSend(false)} scheme={scheme} /></Modal>
      <Modal visible={!!selectedTx} transparent animationType="slide">
        {selectedTx && (
          <TransactionDetailSheet 
            item={selectedTx} 
            onClose={() => setSelectedTx(null)} 
            scheme={scheme} 
          />
        )}
      </Modal>
    </View>
  );
};

const DepositView = ({ assets, onClose, scheme }: { assets: WalletAsset[], onClose: () => void, scheme: Theme }) => {
  const [search, setSearch] = useState("");
  const list = search ? assets.filter((a:WalletAsset) => a.name.toLowerCase().includes(search.toLowerCase()) || a.symbol.toLowerCase().includes(search.toLowerCase())) : assets;
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);

  if (selectedAsset) return <DepositDetailsView asset={selectedAsset} onClose={() => setSelectedAsset(null)} scheme={scheme} />;

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="Select Asset" onClose={onClose} scheme={scheme} />
         
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
      <UnifiedSearchBar searchText={search} setSearchText={setSearch} placeholder="Search Coins" scheme={scheme} />
    </View>
      <ScrollView style={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 0 }}>
            {list.map((asset:WalletAsset) => (
            <View key={asset.id}>
                <TouchableOpacity onPress={() => setSelectedAsset(asset)}>
                    <DepositAssetRow asset={asset} scheme={scheme} />
                </TouchableOpacity>
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 16, marginRight: 20 }} />
            </View>
            ))}
        </View>
      </ScrollView>
    </View>
  );
};

const DepositDetailsView = ({ asset, onClose, scheme }: { asset: WalletAsset, onClose: () => void, scheme: Theme }) => {
  const [network, setNetwork] = useState(asset.networks[0]);
  const address = network?.depositAddress || "";
  
  const [showCopied, setShowCopied] = useState(false);
  const animValue = useState(new Animated.Value(0))[0];

  const copyToClipboard = async () => {
    if (showCopied) return;
    
    await Clipboard.setStringAsync(address);

    setShowCopied(true);
    Animated.spring(animValue, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 150
    }).start();

    setTimeout(() => {
        Animated.timing(animValue, {
            toValue: 0,
            duration: 200, 
            useNativeDriver: true,
        }).start(() => {
            setShowCopied(false); 
        });
    }, 700);
};

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title={`Receive ${asset.symbol}`} onClose={onClose} scheme={scheme} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ gap: 20, paddingBottom: 40 }}>
            <View style={{ alignItems: 'center', paddingTop: 10 }}>
                 <View style={styles.qrWrapper}>
                     {address ? (
                         <QRCode value={address} size={200} color="#000000" backgroundColor="#FFFFFF" />
                     ) : (
                         <View style={{ width: 200, height: 200, justifyContent: 'center', alignItems: 'center' }}>
                             <Text style={{ color: Colors.TextSecondary[scheme] }}>Loading...</Text>
                         </View>
                     )}
                 </View>
             </View>

            <View style={{ paddingHorizontal: 16, zIndex: 10 }}>
                <NetworkSelectorView networks={asset.networks} selectedNetwork={network} onSelect={setNetwork} scheme={scheme} />
            </View>

            <View style={{ paddingHorizontal: 16, zIndex: 5, gap: 10 }}>
                <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>Deposit Address</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: Colors.TextSecondary[scheme] + '1A', borderRadius: 12 }}>
                    <Text style={{ flex: 1, fontFamily: 'Inter-Medium', fontSize: 16, color: Colors.TextPrimary[scheme], lineHeight: 22 }}>
                        {address}
                    </Text>
                    
                    {/* ALIGNED TO MATCH SWIFT UI'S ZSTACK EXACTLY */}
                    <View style={{ position: 'relative', zIndex: 100, marginLeft: 12, marginTop: -4, marginBottom: -10, marginRight: -4 }}>
                        <TouchableOpacity onPress={copyToClipboard} style={{ width: 42, height: 42, justifyContent: 'center', alignItems: 'center' }} activeOpacity={1}>
                            {showCopied ? (
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: scheme === 'dark' ? 'rgba(40,205,65,0.2)' : 'rgba(40,205,65,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                                    <Ionicons name="checkmark" size={15} color={Colors.AppGreen?.[scheme] || '#28CD41'} style={{ fontWeight: 'bold' as any }} />
                                </View>
                            ) : (
                                <Image source={require('../../assets/Buttons/CopyButton.png')} style={{ width: 42, height: 42, tintColor: Colors.TextSecondary[scheme] }} />
                            )}
                        </TouchableOpacity>
                        
                        {showCopied && (
                            <Animated.View style={{ 
                                position: 'absolute', 
                                top: -38, 
                                left: '50%', 
                                marginLeft: -35, // Centers the 70px wide tooltip
                                width: 70,  
                                alignItems: 'center', 
                                opacity: animValue, 
                                transform: [{ scale: animValue }, { translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], 
                                zIndex: 1000 
                            }}>
                                <View style={{ backgroundColor: Colors.TextPrimary[scheme], paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, width: '100%', alignItems: 'center' }}>
                                    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: Colors.AppBackground[scheme], fontSize: 12, fontFamily: 'Inter-Bold' }}>Copied!</Text>
                                </View>
                                <Ionicons name="caret-down" size={12} color={Colors.TextPrimary[scheme]} style={{ marginTop: -4 }} />
                            </Animated.View>
                        )}
                    </View>

                </View>
            </View>
            
        </View>
      </ScrollView>
    </View>
  );
};

const WithdrawView = ({ assets, onClose, scheme }: { assets: WalletAsset[], onClose: () => void, scheme: Theme }) => {
  const [search, setSearch] = useState("");
  const list = search ? assets.filter((a:WalletAsset) => a.name.toLowerCase().includes(search.toLowerCase()) || a.symbol.toLowerCase().includes(search.toLowerCase())) : assets;
  const sortedList = list.sort((a:WalletAsset, b:WalletAsset) => b.value - a.value);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);

  if (selectedAsset) return <WithdrawDetailsView asset={selectedAsset} onClose={() => setSelectedAsset(null)} scheme={scheme} />;

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="Select Asset" onClose={onClose} scheme={scheme} />
    <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
      <UnifiedSearchBar searchText={search} setSearchText={setSearch} placeholder="Search Coins" scheme={scheme} />
    </View>
      <ScrollView style={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 0, paddingHorizontal: 4.5 }}>
            {sortedList.map((asset:WalletAsset) => (
            <TouchableOpacity key={asset.id} onPress={() => setSelectedAsset(asset)}>
                <WalletAssetRow asset={asset} scheme={scheme} />
            </TouchableOpacity>
            ))}
        </View>
      </ScrollView>
    </View>
  );
};

const WithdrawDetailsView = ({ asset, onClose, scheme }: { asset: WalletAsset, onClose: () => void, scheme: Theme }) => {
  const [network, setNetwork] = useState(asset.networks[0]);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  
  const fee = FeeEstimator.getEstimatedNetworkFeeUSD(network?.chainId || 1);
  const receiveAmount = Number(amount) > 0 ? Number(amount) : 0;
  
  // This perfectly matches your Swift Color.TextSecondary.opacity(0.10)
  const inputBgColor = scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title={`Send ${asset.symbol}`} onClose={onClose} scheme={scheme} />
      
      {/* 1. flex: 1 pushes the bottom section completely to the bottom of the screen */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, zIndex: 1 }}>
        <View style={{ paddingHorizontal: 16, gap: 24, paddingTop: 10, paddingBottom: 20 }}>
          
          {/* Address Section */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>Address</Text>
            <TextInput 
              style={{ 
                paddingHorizontal: 16, 
                height: 56, // Matches the height of the Network dropdown
                backgroundColor: inputBgColor, 
                borderRadius: 12, 
                color: Colors.TextPrimary[scheme],
                fontFamily: 'Inter-Regular',
                fontSize: 16
              }} 
              placeholder="Enter Wallet Address" 
              placeholderTextColor={Colors.TextSecondary[scheme]}
              value={address} 
              onChangeText={setAddress}
              returnKeyType="next"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Network Section */}
          <View style={{ zIndex: 100 }}>
            <NetworkSelectorView networks={asset.networks} selectedNetwork={network} onSelect={setNetwork} scheme={scheme} />
          </View>

          {/* Withdrawal Amount Section */}
          <View style={{ gap: 10, zIndex: 0 }}>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>Withdrawal Amount</Text>
            
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              backgroundColor: inputBgColor, 
              height: 56, 
              borderRadius: 12, 
              paddingLeft: 16, // Matches the text input padding perfectly
              paddingRight: 12
            }}>
              <StrictDecimalInput 
                value={amount} 
                onChange={setAmount} 
                maxAmount={asset.amount} 
                placeholder={`${asset.symbol} Amount`} 
                scheme={scheme} 
              />
              <TouchableOpacity 
                   onPress={() => { setAmount(formatSmartAmount(asset.amount).replace(/,/g, '')); }}
                   hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                  >
                <Text style={{ fontFamily: 'Inter-Bold', fontSize: 16, color: Colors.TextPrimary[scheme], paddingVertical: 6 }}>Max</Text>
              </TouchableOpacity>
            </View>
            
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <Text style={{ fontFamily: 'Inter-Medium', fontSize: 14, color: Colors.TextSecondary[scheme] }}>Available</Text>
              <Spacer />
              <Text style={{ fontFamily: 'Inter-Medium', fontSize: 14, color: Colors.TextPrimary[scheme] }}>{formatSmartAmount(asset.amount)} {asset.symbol}</Text>
            </View>
          </View>
          
        </View>
      </ScrollView>
      
      {/* 2. Pinned Bottom Section exactly like the Swift Screenshot */}
      <View style={{ 
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20, 
        backgroundColor: Colors.AppBackground[scheme] 
      }}>
        <View style={{ gap: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 15, fontFamily: 'Inter-Medium' }}>Receive amount</Text>
              <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 15, fontFamily: 'Inter-SemiBold' }}>{formatSmartAmount(receiveAmount)} {asset.symbol}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 15, fontFamily: 'Inter-Medium' }}>Network fee</Text>
              <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 15, fontFamily: 'Inter-SemiBold' }}>{formatFee(fee)}</Text>
            </View>
        </View>
        
        <TouchableOpacity style={{ 
          backgroundColor: Colors.FluxorPurple?.[scheme] || '#A020F0', // Vibrant purple from screenshot
          height: 54, 
          borderRadius: 16,
          justifyContent: 'center',
          alignItems: 'center'
        }} onPress={() => console.log("Withdraw Tapped")}>
          <Text style={{ color: '#FFF', fontSize: 18, fontFamily: 'Inter-Bold' }}>Withdraw</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface ConvertViewProps {
  assets: WalletAsset[];
  onClose: () => void;
  scheme: Theme;
}

const ConvertView: React.FC<ConvertViewProps> = ({ assets, onClose, scheme }) => {
  // Strongly typed state using your WalletAsset interface
  const [source, setSource] = useState<WalletAsset>(
    assets.find((a) => a.symbol === 'USDC') || assets[0]
  );
  const [target, setTarget] = useState<WalletAsset>(
    assets.find((a) => a.symbol === 'USDT') || assets.find((a) => a.symbol === 'ETH') || assets[1]
  );
  const [amount, setAmount] = useState<string>("");

  const outAmountStr: string = useMemo(() => {
    const input = parseFloat(amount.replace(/,/g, '.')) || 0;
    if (input <= 0) return "0.00";
    
    const sourceRate = source.amount > 0 ? source.value / source.amount : 0;
    const targetRate = target.amount > 0 ? target.value / target.amount : 0;
    
    if (targetRate <= 0) return "0";
    
    const result = input * (sourceRate / targetRate);
    return new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 8, 
        useGrouping: false 
    }).format(result);
  }, [amount, source, target]);

  const TotalCostUSD: number = FeeEstimator.getEstimatedNetworkFeeUSD(source.networks[0]?.chainId || 1);

  // Strongly typed helper function
  const getFontSize = (text: string): number => {
      const count = text.length;
      if (count < 9) return 36;
      if (count < 13) return 28;
      if (count < 17) return 22;
      return 18;
  };

  const isDark = scheme === 'dark';
  const cardBgColor = Colors.SwapCardBackground?.[scheme] || (isDark ? '#1C1C1E' : '#F4F5F7');
  const pillBgColor = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="Convert" onClose={onClose} scheme={scheme} />
      
      <View style={{ flex: 1 }} onStartShouldSetResponder={() => { Keyboard.dismiss(); return false; }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            
            {/* Cards Container */}
            <View style={{ position: 'relative', zIndex: 1 }}>
                <View style={{ gap: 6 }}>
                    
                    {/* Source Card */}
                    <View style={[styles.convertCard, { backgroundColor: cardBgColor }]}>
                        <View style={{ flexDirection: 'row', marginTop: -3, marginBottom: 10 }}>
                            <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 15, fontFamily: 'Inter-Medium' }}>From</Text>
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                            <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                                <StrictDecimalInput 
                                    value={amount} 
                                    onChange={setAmount} 
                                    maxAmount={source.amount} 
                                    placeholder="0.00" 
                                    fontSize={getFontSize(amount)}
                                    scheme={scheme} 
                                />
                            </View>
                            <View style={[styles.convertTokenPill, { backgroundColor: pillBgColor }]}>
                               <TokenIcon symbol={source.symbol} size={32} />
                                <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 20, fontFamily: 'Inter-SemiBold', marginLeft: 8 }}>{source.symbol}</Text>
                            </View>
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 14, fontFamily: 'Inter-Regular' }}>
                                ${parseFloat(amount) > 0 ? formatSmartValue(parseFloat(amount) * (source.value/source.amount)) : "0.00"}
                            </Text>
                            <Spacer />
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="wallet" size={13} color={Colors.TextSecondary[scheme]} />
                                <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 14, fontFamily: 'Inter-Medium' }}>
                                    {formatSmartAmount(source.amount)} {source.symbol}
                                </Text>
                            </View>
                            <TouchableOpacity 
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                onPress={() => { setAmount(formatSmartAmount(source.amount).replace(/,/g, '')); }}>
                                <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 14, fontFamily: 'Inter-SemiBold', paddingLeft: 8 }}>Max</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Target Card */}
                    <View style={[styles.convertCard, { backgroundColor: cardBgColor }]}>
                        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                            <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 15, fontFamily: 'Inter-Medium' }}>To</Text>
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ 
                                flex: 1, 
                                fontSize: getFontSize(outAmountStr), 
                                color: outAmountStr !== "0.00" && outAmountStr !== "0" ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme], 
                                fontFamily: 'Inter-Medium' 
                            }}>
                                {outAmountStr}
                            </Text>
                            <View style={[styles.convertTokenPill, { backgroundColor: pillBgColor }]}>
                               <TokenIcon symbol={target.symbol} size={32} />
                                <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 20, fontFamily: 'Inter-SemiBold', marginLeft: 8 }}>{target.symbol}</Text>
                            </View>
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                            <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 14, fontFamily: 'Inter-Regular' }}>
                                ${parseFloat(outAmountStr) > 0 ? formatSmartValue(parseFloat(outAmountStr) * (target.value/target.amount)) : "0.00"}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Floating Swap Button */}
                <TouchableOpacity 
                    activeOpacity={0.8}
                    onPress={() => {
                        const temp = source; 
                        setSource(target); 
                        setTarget(temp); 
                        setAmount(""); 
                    }} 
                    style={{ position: 'absolute', top: '50%', alignSelf: 'center', marginTop: -24, zIndex: 10 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.AppBackground[scheme], justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: cardBgColor, justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="arrow-down" size={18} color={Colors.TextPrimary[scheme]} style={{ fontWeight: 'bold' as any }} />
                        </View>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Total Cost Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 16 }}>
                <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 16, fontFamily: 'Inter-Medium' }}>Total Cost</Text>
                <Spacer />
                <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 16, fontFamily: 'Inter-Medium' }}>{formatFee(TotalCostUSD)}</Text>
            </View>

            {/* Convert Action Button */}
            <TouchableOpacity style={{ backgroundColor: Colors.FluxorPurple?.[scheme] || '#A020F0', height: 56, marginTop: 16, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }} onPress={() => {console.log("Convert Tapped");}}>
                <Text style={{ color: '#FFF', fontSize: 18, fontFamily: 'Inter-Bold' }}>Convert</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const TokenSearchPage = ({ assets, transactions, onClose, onSelectAsset, scheme }: { assets: WalletAsset[], transactions: WalletTransaction[], onClose: () => void, onSelectAsset: (a: WalletAsset) => void, scheme: Theme }) => {
  const [search, setSearch] = useState("");
  const list = search ? assets.filter((a:WalletAsset) => a.name.toLowerCase().includes(search.toLowerCase()) || a.symbol.toLowerCase().includes(search.toLowerCase())) : assets;
  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingTop: Platform.OS==='ios'?60:20, paddingBottom: 10 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{top:10, bottom:10, left:10, right:10}}>
            <Ionicons name="chevron-back" size={26} color={Colors.TextPrimary[scheme]} style={{ marginRight: 2 }} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}> {/* We add flex: 1 here instead! */}
            <UnifiedSearchBar searchText={search} setSearchText={setSearch} placeholder="Token name" scheme={scheme} />
        </View>
       </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ gap: 0 }}>
            {list.map((asset:WalletAsset) => (
            <TouchableOpacity key={asset.id} onPress={() => { onSelectAsset(asset); onClose(); }}>
                <WalletAssetRow asset={asset} scheme={scheme} />
            </TouchableOpacity>
            ))}
        </View>
      </ScrollView>
    </View>
  );
};

// MARK: - UTILITY COMPONENTS

const Header = ({ title, titleView, onClose, scheme }: { title: string, titleView?: React.ReactNode, onClose: () => void, scheme: Theme }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 65 : 20, paddingBottom: 15 }}>
    <TouchableOpacity onPress={onClose}><Ionicons name="arrow-back" size={20} color={Colors.TextPrimary[scheme]} style={{ fontWeight: '500' as any }} /></TouchableOpacity>
    {titleView ? titleView : <Text style={[styles.headerTitle, { color: Colors.TextPrimary[scheme] }]}>{title}</Text>}
    <Ionicons name="arrow-back" size={20} color="transparent" />
  </View>
);

const UnifiedSearchBar = ({ searchText, setSearchText, placeholder, scheme }: { searchText: string, setSearchText: (t: string) => void, placeholder: string, scheme: Theme }) => {
  const [focused, setFocused] = useState(false);
  const isDark = scheme === 'dark';

  return (
    <View style={[
      styles.searchBox,
      { 
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.35 : 0.06,
        shadowRadius: focused ? 8 : 4,
        shadowOffset: { width: 0, height: focused ? 4 : 2 },
        elevation: focused ? 4 : 2 // Added for Android support
      }
    ]}>
      <Ionicons name="search" size={16} color={Colors.TextSecondary[scheme]} />
      <TextInput 
        style={[styles.searchInput, { color: Colors.TextPrimary[scheme] }]} 
        placeholder={placeholder} 
        placeholderTextColor={Colors.TextSecondary[scheme]} 
        value={searchText} 
        onChangeText={setSearchText} 
        autoCapitalize="none" 
        autoCorrect={false} 
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {searchText.length > 0 && (
        <TouchableOpacity onPress={() => setSearchText("")}>
          <Ionicons name="close-circle" size={18} color={Colors.TextSecondary[scheme]} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const StrictDecimalInput = ({ value, onChange, maxAmount, placeholder, fontSize = 17.5, scheme }: { value: string, onChange: (t: string) => void, maxAmount?: number, placeholder: string, fontSize?: number, scheme: Theme }) => {
    const handleChange = (text: string) => {
        let clean = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const parts = clean.split('.');
        if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
        if (maxAmount !== undefined) {
            const num = parseFloat(clean);
            if (num > maxAmount) {
                return;
            }
        }
        onChange(clean);
    };
    return (
        <TextInput 
            style={{ flex: 1, color: Colors.TextPrimary[scheme], fontFamily: 'Inter-Medium', fontSize: fontSize }}
            keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor={Colors.TextSecondary[scheme]}
            value={value} onChangeText={handleChange}
        />
    );
};

const CopyableAddressView = ({ fullAddress, scheme }: { fullAddress: string, scheme: Theme }) => {
    const [showCopied, setShowCopied] = useState(false);
    const shortAddress = fullAddress.length > 8 ? `${fullAddress.substring(0,4)}...${fullAddress.substring(fullAddress.length-4)}` : fullAddress;
    const animValue = useState(new Animated.Value(0))[0];

    const copyToClipboard = async () => {
      if (showCopied) return;

    await Clipboard.setStringAsync(fullAddress);
    
    setShowCopied(true);
    Animated.spring(animValue, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 150
    }).start();

    setTimeout(() => {
        Animated.timing(animValue, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            setShowCopied(false); 
        });
    }, 700);
};

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 10 }}>
            <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 18, fontFamily: 'Inter-Regular' }}>{shortAddress}</Text>
            
            <View style={{ width: 20, height: 20, zIndex: 100 }}>
                <TouchableOpacity onPress={copyToClipboard} style={{ width: 43, height: 43, justifyContent: 'center', alignItems: 'center', marginLeft: -11, marginTop: -11 }} activeOpacity={1}>
                    {showCopied ? (
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: scheme === 'dark' ? 'rgba(40,205,65,0.2)' : 'rgba(40,205,65,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="checkmark" size={15} color={Colors.AppGreen?.[scheme] || '#28CD41'} style={{ fontWeight: 'bold' as any }} />
                        </View>
                    ) : (
                        <Image source={require('../../assets/Buttons/CopyButton.png')} style={{ width: 43, height: 43, tintColor: Colors.TextSecondary[scheme] }} />
                    )}
                </TouchableOpacity>
                
                {showCopied && (
                     <Animated.View style={{ 
                         position: 'absolute', 
                         top: -40, 
                         left: '50%', 
                         marginLeft: -45, 
                         width: 90,  
                         alignItems: 'center', 
                         opacity: animValue, 
                         transform: [{ scale: animValue }, { translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], 
                         zIndex: 1000 
                     }}>
                         <View style={{ backgroundColor: Colors.TextPrimary[scheme], paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, width: '100%', alignItems: 'center' }}>
                             <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: Colors.AppBackground[scheme], fontSize: 13, fontFamily: 'Inter-Bold' }}>Copied!</Text>
                         </View>
                         <Ionicons name="caret-down" size={12} color={Colors.TextPrimary[scheme]} style={{ marginTop: -4 }} />
                     </Animated.View>
                 )}
            </View>
        </View>
    );
};

const NetworkSelectorView = ({ networks, selectedNetwork, onSelect, scheme }: { networks: CryptoNetwork[], selectedNetwork?: CryptoNetwork, onSelect: (n: CryptoNetwork) => void, scheme: Theme }) => {
  const [isOpen, setIsOpen] = useState(false);
  const active = selectedNetwork || networks[0];
  const isDark = scheme === 'dark';

  return (
    <View style={{ zIndex: 100 }}>
      <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme], marginBottom: 10 }}>Network</Text>
      
      {/* Wrapper for the combined shadow */}
      <View style={{ 
        shadowColor: '#000', 
        shadowOpacity: isOpen ? (isDark ? 0.4 : 0.12) : 0, 
        shadowRadius: isOpen ? 20 : 0, 
        shadowOffset: { width: 0, height: isOpen ? 8 : 0 },
        elevation: isOpen ? 10 : 0,
        zIndex: 100 
      }}>
        
        {/* The Header */}
        <TouchableOpacity 
          onPress={() => setIsOpen(!isOpen)} 
          activeOpacity={1} 
          style={[
            styles.dropdownHeader, 
            { 
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              borderBottomLeftRadius: isOpen ? 0 : 12,
              borderBottomRightRadius: isOpen ? 0 : 12,
              height: 56
            }
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TokenIcon symbol={active?.icon || ""} size={24} />
            <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.TextPrimary[scheme] }}>{active?.name}</Text>
          </View>
          <Ionicons 
            name="chevron-down" 
            size={18} 
            color={Colors.TextSecondary[scheme]} 
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} 
          />
        </TouchableOpacity>

        {/* The Dropdown List */}
        {isOpen && (
          <View style={[
            styles.dropdownList, 
            { 
              backgroundColor: Colors.CardBackground?.[scheme] || (isDark ? '#1C1C1E' : '#FFFFFF'), 
              position: 'absolute',
              top: 56, // Sits exactly flush under the header
              left: 0,
              right: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
              shadowOpacity: 0 // Shadow handled by the parent wrapper now
            }
          ]}>
            <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 300 }}>
              {networks.map((n:CryptoNetwork, i:number) => (
                <View key={n.id}>
                  <TouchableOpacity 
                    onPress={() => { onSelect(n); setIsOpen(false); }} 
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 }}
                  >
                    <TokenIcon symbol={n.icon} size={24} />
                    <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.TextPrimary[scheme], marginLeft: 12, flex: 1 }}>{n.name}</Text>
                    {active.id === n.id && <Ionicons name="checkmark" size={18} color={Colors.TextPrimary[scheme]} style={{ fontWeight: 'bold' as any }} />}
                  </TouchableOpacity>
                  
                  {/* Apple-style thin divider between items */}
                  {i < networks.length - 1 && (
                    <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', marginHorizontal: 16 }} />
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
};

const TabButton = ({ title, selectedTab, onSelect, scheme }: { title: string, selectedTab: string, onSelect: (t: string) => void, scheme: Theme }) => {
  const isSelected = selectedTab === title;
  return (
    <TouchableOpacity onPress={() => onSelect(title)} activeOpacity={1}>
      {}
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: isSelected ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }}>{title}</Text>
        <View style={{ height: 2, width: isSelected ? 15 : 40, backgroundColor: isSelected ? Colors.TextPrimary[scheme] : 'transparent', borderRadius: 10 }} />
      </View>
    </TouchableOpacity>
  );
};

const DepositAssetRow = ({ asset, scheme }: { asset: WalletAsset, scheme: Theme }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 10 }}>
    <TokenIcon symbol={asset.symbol} size={38} />
    <View style={{ marginLeft: 10, gap: 2 }}>
      <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 17, color: Colors.TextPrimary[scheme] }}>{asset.name}</Text>
      <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: Colors.TextSecondary[scheme] }}>{asset.symbol}</Text>
    </View>
  </View>
);

const AddressRow = ({ label, address, scheme }: { label: string, address: string, scheme: Theme }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, zIndex: 10 }}>
    <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.TextSecondary[scheme] }}>{label}</Text>
    <CopyableAddressView fullAddress={address} scheme={scheme} />
  </View>
);

const TransactionDetailSheet = ({ item, onClose, scheme }: { item: WalletTransaction, onClose: () => void, scheme: Theme }) => {
  const isDarkTheme = scheme === 'dark';
  const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
  
  // Replicates Swift's DateFormatter for the exact iOS string output
  const formattedDate = useMemo(() => {
      try {
          const [datePart, timePart] = item.date.split(', ');
          const [d, m, yy] = datePart.split('/');
          const [time, ampm] = timePart.split(' ');
          let [hr, min] = time.split(':');
          
          let h = parseInt(hr, 10);
          if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
          if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
          
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `${d} ${months[parseInt(m, 10) - 1]} 20${yy}, ${h.toString().padStart(2, '0')}:${min}`;
      } catch {
          return item.date;
      }
  }, [item.date]);

  return (
    <View style={styles.sheetOverlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      
      <View style={[styles.sheetContent, { backgroundColor: Colors.AppBackground[scheme] }]}>
        
        {/* iOS Drag Indicator Pill */}
        <View style={{ width: 36, height: 5, backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)', borderRadius: 3, alignSelf: 'center', marginTop: 8, marginBottom: 8 }} />
        
        <View style={[styles.sheetHeader, { paddingTop: 4 }]}>
          <Text style={[styles.sheetTitle, { color: Colors.TextPrimary[scheme] }]}>Transaction Details</Text>
          <TouchableOpacity onPress={onClose} style={{ position: 'absolute', right: 20 }} hitSlop={{top:10, bottom:10, left:10, right:10}}>
              {/* Matches iOS xmark.circle.fill */}
              <Ionicons name="close-circle" size={24} color={isDarkTheme ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'} />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
          <View style={{ padding: 5, paddingBottom: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <TokenIcon symbol={item.symbol} size={27} />
                <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 20, color: Colors.TextPrimary[scheme], marginLeft: 6 }}>{item.symbol}</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.TextPrimary[scheme], marginRight: 10 }}>{typeLabel}</Text>
                
                {/* overflow: 'hidden' is required in RN for Text border radius! */}
                <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 15, color: Colors.AppGreen?.[scheme] || '#28CD41', backgroundColor: isDarkTheme ? 'rgba(40,205,65,0.2)' : 'rgba(40,205,65,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15, overflow: 'hidden' }}>
                    {item.status}
                </Text>
              </View>
              
              <View style={{ height: 1, backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', marginBottom: 15 }} />
              
              <DetailRow label="Time" value={formattedDate} scheme={scheme} />
              {item.price && <DetailRow label="Price" value={item.price} scheme={scheme} />}
              
              {item.type === 'sent' && item.sellAmount && <DetailRow label="Token" value={item.sellAmount} color={Colors.AppRed?.[scheme] || '#FF3B30'} scheme={scheme} />}
              {item.type === 'sent' && item.address && <AddressRow label="To" address={item.address} scheme={scheme} />}
              
              {item.type === 'received' && item.buyAmount && <DetailRow label="Token" value={item.buyAmount} color={Colors.AppGreen?.[scheme] || '#28CD41'} scheme={scheme} />}
              {item.type === 'received' && item.address && <AddressRow label="From" address={item.address} scheme={scheme} />}
              
              {item.type === 'converted' && item.buyAmount && <DetailRow label="Buy" value={item.buyAmount} color={Colors.AppGreen?.[scheme] || '#28CD41'} scheme={scheme} />}
              {item.type === 'converted' && item.sellAmount && <DetailRow label="Using" value={item.sellAmount} color={Colors.AppRed?.[scheme] || '#FF3B30'} scheme={scheme} />}
              
              {/* THIS IS THE ONLY CHANGE: Hides Gas Fee if type is received */}
              {item.type !== 'received' && <DetailRow label="Gas Fee" value={item.gasFee} scheme={scheme} />}
              
              {item.networkChainId && <NetworkRow label="Network" network={ChainRegistry.get(item.networkChainId).name} icon={ChainRegistry.get(item.networkChainId).icon} scheme={scheme} />}
          </View>

          <View style={{ paddingHorizontal: 4 }}>
              {item.targetTx && (
                  <View>
                      <HashBlock title="Target Tx Hash on" hash={item.targetTx.txHash} chainId={item.targetTx.chainId} scheme={scheme} />
                      {(item.settlementTx || item.sourceTxs.length > 0) && <View style={{ height: 1, backgroundColor: isDarkTheme?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)' }} />}
                  </View>
              )}
              {item.settlementTx && (
                  <View>
                      <HashBlock title="Settlement Tx Hash on" hash={item.settlementTx.txHash} chainId={item.settlementTx.chainId} scheme={scheme} />
                      {(item.sourceTxs.length > 0) && <View style={{ height: 1, backgroundColor: isDarkTheme?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)' }} />}
                  </View>
              )}
              {item.sourceTxs.map((s:WalletTxInfo, i:number) => (
                  <View key={s.id}>
                      <HashBlock title="From Tx Hash on" hash={s.txHash} chainId={s.chainId} scheme={scheme} />
                      {i < item.sourceTxs.length - 1 && <View style={{ height: 1, backgroundColor: isDarkTheme?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)' }} />}
                  </View>
              ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const HashBlock = ({ title, hash, chainId, scheme }: { title: string, hash: string, chainId: number, scheme: Theme }) => {
  const config = ChainRegistry.get(chainId);
  const shortHash = hash.length > 12 ? `${hash.substring(0, 5)}...${hash.substring(hash.length - 4)}` : hash;
  const url = getExplorerURL(chainId, hash);
  
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>{shortHash}</Text>
        {/* Adjusted icon to perfectly match SwiftUI arrow.up.right.square feel */}
        <Ionicons name="open-outline" size={16} color={Colors.TextSecondary[scheme]} style={{ marginBottom: 2 }} />
    </View>
  );

  return (
    <View style={{ paddingVertical: 18 }}>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
        <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 17, color: Colors.TextPrimary[scheme] }}>{title}</Text>
        <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 17, color: Colors.TextPrimary[scheme] }}>{config.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>Tx Hash</Text>
        {url ? <TouchableOpacity onPress={() => Linking.openURL(url)}>{content}</TouchableOpacity> : content}
      </View>
    </View>
  );
};

const DetailRow = ({ label, value, color, scheme }: { label: string, value: string, color?: string, scheme: Theme }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
    <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.TextSecondary[scheme] }}>{label}</Text>
    <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: color || Colors.TextPrimary[scheme] }}>{value}</Text>
  </View>
);

const NetworkRow = ({ label, network, icon, scheme }: { label: string, network: string, icon: string, scheme: Theme }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
    <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.TextSecondary[scheme] }}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* If the network name matches a symbol in LOCAL_ASSETS, this will work perfectly */}
        <TokenIcon symbol={icon} size={22} />
        <Text style={{ fontFamily: 'Inter-Medium', fontSize: 18, color: Colors.TextPrimary[scheme] }}>{network}</Text>
    </View>
  </View>
);

const TokenActionButton = ({ icon, text, action, scheme }: { icon: any, text: string, action: () => void, scheme: Theme }) => {
    const isDark = scheme === 'dark';
    
    return (
        <TouchableOpacity 
            onPress={action} 
            style={[
                styles.tokenActionBtn, 
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)' } 
            ]}
        >
            <Image source={icon} style={{ width: 26, height: 26, tintColor: Colors.TextPrimary[scheme] }} />
            <Text style={[styles.tokenActionText, { color: Colors.TextPrimary[scheme] }]}>{text}</Text>
        </TouchableOpacity>
    );
};
const VStack = ({ spacing, style, children }: { spacing: number, style?: any, children: React.ReactNode }) => <View style={[{ gap: spacing }, style]}>{children}</View>;
const Spacer = () => <View style={{ flex: 1 }} />;

// MARK: - STYLES
const styles = StyleSheet.create({
  container: { flex: 1 },
  wbCard: { paddingHorizontal: 13, paddingVertical: 16, paddingBottom: 5 },
  wbTitle: { fontFamily: 'Inter-Medium', fontSize: 17, textAlign: 'center', marginTop: 8 },
  wbBalance: { fontFamily: 'Inter-Bold', fontSize: 32, textAlign: 'center' },
  wbPnlLabel: { fontFamily: 'Inter-Medium', fontSize: 16 },
  wbPnlValue: { fontFamily: 'Inter-Medium', fontSize: 16 },
  actionRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  actionBtn: { flex: 1, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingBottom: -1, paddingTop: 10, marginTop: -12 },
  catText: { fontFamily: 'Inter-SemiBold', fontSize: 17.5 },
  catIndicator: { height: 2, width: 20, borderRadius: 2, marginTop: 11.5 },
  hexIcon: { width: 42.5, height: 42.5, resizeMode: 'contain', marginLeft: 6, marginBottom: 8, marginHorizontal: -12 },
  filterPopup: { position: 'absolute', top: 45, right: 13, width: 200, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: {width:0, height:5} },
  assetRow: { flexDirection: 'row', paddingHorizontal: 13, paddingVertical: 10, alignItems: 'center' },
  assetName: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  assetSymbol: { fontFamily: 'Inter-Medium', fontSize: 15 },
  assetAmount: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  assetValue: { fontFamily: 'Inter-Medium', fontSize: 15 },
  txRow: { flexDirection: 'row', padding: 16, borderRadius: 20, alignItems: 'center' },
  txTitle: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  txDate: { fontFamily: 'Inter-Medium', fontSize: 14 }, 
  txAmount: { fontFamily: 'Inter-Medium', fontSize: 16 },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 12, borderRadius: 18, marginBottom: -5 },
  searchInput: { flex: 1, marginLeft: 10, fontFamily: 'Inter-Regular', fontSize: 16, paddingVertical: 0 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12 },
  dropdownList: { position: 'absolute', top: 85, left: 0, right: 0, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: {width:0, height:10} },
  addressBox: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12 },
  qrWrapper: { width: 230, height: 230, backgroundColor: '#FFF', borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: {width:0, height:4} },
  inputField: { padding: 16, borderRadius: 12, fontFamily: 'Inter-Regular', fontSize: 16 },
  convertCard: { padding: 20, borderRadius: 20 },
  convertTokenPill: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24 },
  tokenActionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 11, borderRadius: 12},
  tokenActionText: { fontFamily: 'Inter-SemiBold', fontSize: 19, marginLeft: 1 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetContent: { backgroundColor: '#000', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, marginBottom: 10 },
  sheetTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18 }
});