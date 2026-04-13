import React, { useState, useMemo, useEffect } from 'react';
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
  Linking,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../theme/colors';
import QRCode from 'react-native-qrcode-svg';
import { SymbolView } from 'expo-symbols';
import { useTheme } from '../context/ThemeContext';
import { useLocalSearchParams } from 'expo-router';
import { TokenIcon } from '../../components/TokenIcon';
import { SmartPriceText } from '../../components/SmartPriceText';
import useWalletViewModel, { WalletAsset, CryptoNetwork, ChainRegistry } from '../../logic/useWalletViewModel';

import TokenSearchManager from '../../logic/TokenSearchManager';
import { Token } from '../../logic/Token';
import ContractData from '../../assets/Contract for frontend.json';

type Theme = 'light' | 'dark';

const evmAddress = "0x59714dE56e030071Bf96c7f7Ce500c05476f2C88";
const solanaAddress = "AoD9S5nuShfM5vgh9XvbR6mG1CxmkP3DNhiQX2izV4Ze";

// Add this helper right above getNetworksForToken
const resolveChainId = (idOrName: any): number => {
    // If it's already a number, return it
    if (typeof idOrName === 'number') return idOrName;
    if (!idOrName) return 1; // Default to ETH
    
    const str = String(idOrName).toLowerCase();
    
    // If it's a numeric string like "101", parse it
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;

    // Map DexScreener string IDs to our internal numeric IDs
    const dexMap: Record<string, number> = {
        "ethereum": 1, "eth": 1,
        "bsc": 56, "bnbchain": 56, "binance": 56,
        "solana": 101, "sol": 101,
        "polygon": 137, "matic": 137,
        "optimism": 10, "op": 10,
        "arbitrum": 42161, "arb": 42161,
        "avalanche": 43114, "avax": 43114,
        "base": 8453,
        "mantle": 5000,
        "monad": 143,
        "hyperevm": 999,
        "plasma": 9745,
        "sonic": 146,
        "berachain": 80094
    };
    
    return dexMap[str] || 1; // Fallback to Ethereum if completely unmapped
};

const nativeChainMap: Record<string, number> = {
    "ethereum": 1,
    "binancecoin": 56,
    "solana": 101,
    "avalanche-2": 43114,
    "polygon-ecosystem-token": 137,
    "plasma": 9745,
    "monad": 143,
    "hyperliquid": 999,
    "sonic-3": 146,
    "berachain-bera": 80094
};

const getNetworksForToken = (token: Token): CryptoNetwork[] => {
    let networks: CryptoNetwork[] = [];
    
    if (token.deployments && token.deployments.length > 0) {
        networks = token.deployments.map(d => {
            // Safely resolve the Chain ID whether it's a number (JSON) or string (DexScreener)
            const resolvedId = resolveChainId(d.chainId);
            const config = ChainRegistry.get(resolvedId);
            
            // If ChainRegistry misses, fallback cleanly to the JSON's chainName instead of "Unknown"
            const finalName = config.name !== "Unknown" ? config.name : (d.chainName || "Unknown");
            
            return {
                id: resolvedId,
                name: finalName,
                chainId: resolvedId,
                icon: config.icon !== "circle.slash" ? config.icon : "circle.slash", 
                depositAddress: resolvedId === 101 ? solanaAddress : evmAddress
            };
        });
    } else if (nativeChainMap[token.id]) {
        const chainId = nativeChainMap[token.id];
        const config = ChainRegistry.get(chainId);
        networks = [{
            id: chainId,
            name: config.name,
            chainId: chainId,
            icon: config.icon,
            depositAddress: chainId === 101 ? solanaAddress : evmAddress
        }];
    } else {
         const config = ChainRegistry.get(1);
         networks = [{
             id: 1,
             name: config.name,
             chainId: 1,
             icon: config.icon,
             depositAddress: evmAddress
         }];
    }
    
    // Deduplicate identical chains safely
    const unique: CryptoNetwork[] = [];
    const seen = new Set();
    for (const n of networks) {
        if (!seen.has(n.chainId)) {
            seen.add(n.chainId);
            unique.push(n);
        }
    }
    return unique;
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

interface WalletTxInfo {
  id: string;
  chainId: number;
  txHash: string;
}

interface WalletTransaction {
  id: string;
  type: 'sent' | 'received';
  symbol: string;
  status: string;
  date: string;
  mainAmount: string;
  price?: string;
  buyAmount?: string;
  sellAmount?: string;
  gasFee: string;
  networkChainId?: number;
  lpFee?: string;
  address: string;
  targetTx?: WalletTxInfo;
  sourceTxs: WalletTxInfo[];
}

const mockTransactions: WalletTransaction[] = [
  { id: '1', type: 'sent', symbol: 'SOL', status: 'Success', date: '8/12/25, 9:09 PM', mainAmount: '-0.01473 SOL', sellAmount: '-0.01473 SOL', gasFee: '$0.0005', lpFee: '$0.43', networkChainId: 101, address: '0x59714dE56e030071Bf96c7f7Ce500c05476f2C88', targetTx: { id: 't1', chainId: 101, txHash: 'E1PsV6X4ntLR7Vxg8rHEXevZ3rVqgy1zvSViCXf7MdjJj2WmnZ5QdBZwXs532RFc2KMbezTtfh8zHbLuKXNVHNN' }, sourceTxs: [] },
  { id: '2', type: 'received', symbol: 'SOL', status: 'Success', date: '8/12/25, 7:30 PM', mainAmount: '+0.01474 SOL', buyAmount: '+0.01474 SOL', gasFee: '$0.0005', networkChainId: 101, address: '0x59714dE56e030071Bf96c7f7Ce500c05476f2C88', sourceTxs: [{ id: 'src1', chainId: 101, txHash: 'E1PsV6X4ntLR7Vxg8rHEXevZ3rVqgy1zvSViCXf7MdjJj2WmnZ5QdBZwXs532RFc2KMbezTtfh8zHbLuKXNVHNN' }] },
  { id: '4', type: 'received', symbol: 'ETH', status: 'Success', date: '8/10/25, 7:23 PM', mainAmount: '+2 ETH', buyAmount: '+2 ETH', gasFee: '$0.59', networkChainId: 1, address: '0x59714dE56e030071Bf96c7f7Ce500c05476f2C88', sourceTxs: [{ id: 'src4', chainId: 1, txHash: '0x9a2210416f1cc853f9f9842728f2aaa57d1578bec58f9472f33fbbd4e8e9c805' }] }
];

// MARK: - 5. MAIN WALLET VIEW
export default function WalletScreen() {
  const { theme: scheme } = useTheme();
  const isDark = scheme === 'dark';
  const { assets: mockAssets } = useWalletViewModel();

  const [selectedCategory, setSelectedCategory] = useState("Overview");
  const [isShowingSearch, setIsShowingSearch] = useState(false);
  const [isShowingHistory, setIsShowingHistory] = useState(false);
  const [isShowingDeposit, setIsShowingDeposit] = useState(false);
  const [isShowingWithdraw, setIsShowingWithdraw] = useState(false);
  const [hideSmallAssets, setHideSmallAssets] = useState(false);
  const [showFilterCard, setShowFilterCard] = useState(false);
  const [selectedAssetForDetail, setSelectedAssetForDetail] = useState<WalletAsset | null>(null);

  const params = useLocalSearchParams();
  const [prefilledAddress, setPrefilledAddress] = useState("");

  useEffect(() => {
    if (params?.scannedAddress) {
      setPrefilledAddress(params.scannedAddress as string);
      setIsShowingWithdraw(true); 
    }

    if (params?.action === 'send') {
      setIsShowingWithdraw(true);
    }
    
  }, [params?.scannedAddress, params?.action]);

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
          <View style={{ gap: 10, paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingHorizontal: 4, paddingBottom: 0, marginTop: -10 }}>
            <WalletBalanceCard 
              totalBalance={totalBalance} todayPNL={todayPNL} todayPNLPercent={todayPNLPercent} 
              onHistoryTap={() => setIsShowingHistory(true)} scheme={scheme} 
            />
            <WalletActionButtons 
              onDepositTap={() => setIsShowingDeposit(true)} 
              onWithdrawTap={() => setIsShowingWithdraw(true)} 
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
                  <Ionicons name="search" size={19} color={Colors.TextPrimary[scheme]} style={{ paddingBottom: 7, fontWeight: '500' as any }} />
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

              <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', marginHorizontal: 12.5, marginTop: -7.5, marginBottom: 1 }} />

              <View style={{ gap: 0 }}>
                {sortedAssets.map((asset, index) => (
                  <React.Fragment key={asset.id}>
                    <TouchableOpacity onPress={() => setSelectedAssetForDetail(asset)} activeOpacity={0.7}>
                      <WalletAssetRow asset={asset} scheme={scheme} />
                    </TouchableOpacity>
                    
                    {index !== sortedAssets.length - 1 && (
                      <View 
                        style={{ 
                          height: 1, 
                          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', 
                          marginLeft: 12, marginRight: 12,
                        }} 
                      />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <RightSlideModal visible={isShowingDeposit} onClose={() => setIsShowingDeposit(false)}>
        <DepositView onClose={() => setIsShowingDeposit(false)} scheme={scheme} />
      </RightSlideModal>

      <RightSlideModal visible={isShowingWithdraw} onClose={() => { setIsShowingWithdraw(false); setPrefilledAddress(""); }}>
        <WithdrawView assets={mockAssets} onClose={() => { setIsShowingWithdraw(false); setPrefilledAddress(""); }} scheme={scheme} prefilledAddress={prefilledAddress} />
      </RightSlideModal>

      <RightSlideModal visible={isShowingSearch} onClose={() => setIsShowingSearch(false)}>
        <TokenSearchPage assets={mockAssets} transactions={mockTransactions} onClose={() => setIsShowingSearch(false)} onSelectAsset={setSelectedAssetForDetail} scheme={scheme} />
      </RightSlideModal>

      <RightSlideModal visible={isShowingHistory} onClose={() => setIsShowingHistory(false)}>
        <HistoryView transactions={mockTransactions} onClose={() => setIsShowingHistory(false)} scheme={scheme} />
      </RightSlideModal>

      <RightSlideModal visible={!!selectedAssetForDetail} onClose={() => setSelectedAssetForDetail(null)}>
        {selectedAssetForDetail && (
          <TokenDetailView 
            asset={selectedAssetForDetail} 
            allTransactions={mockTransactions} 
            onClose={() => setSelectedAssetForDetail(null)} 
            scheme={scheme} 
          />
        )}
      </RightSlideModal>
    </View>
  );
}

const WalletBalanceCard = ({ totalBalance, todayPNL, todayPNLPercent, onHistoryTap, scheme }: { totalBalance: number, todayPNL: number, todayPNLPercent: number, onHistoryTap: () => void, scheme: Theme }) => {
  const isPos = todayPNL >= 0;
  const pnlColor = isPos ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30');
  const pnlBgColor = isPos ? 'rgba(40, 205, 65, 0.12)' : 'rgba(255, 59, 48, 0.12)'; 
  const pnlSign = isPos ? "+" : "-";
  const absPNL = Math.abs(todayPNL);

  return (
    <View style={{ 
      paddingVertical: 30,
      alignItems: 'center',
      marginHorizontal: 12,
      marginBottom: 10,
      marginTop: 0,
    }}>
      {/* 1. Header Title */}
      <Text style={{ 
        fontFamily: 'Inter-SemiBold', 
        fontSize: 13, 
        letterSpacing: 1, 
        color: Colors.TextSecondary[scheme], 
        textTransform: 'uppercase', 
        marginBottom: 25, 
      }}>
        Total Portfolio
      </Text>

      {/* 2. Large Balance */}
      <Text style={{ 
        fontFamily: 'Inter-Bold', 
        fontSize: 35, 
        color: Colors.TextPrimary[scheme], 
        marginBottom: 10
      }}>
        ${formatSmartValue(totalBalance)}
      </Text>

      {/* 3. PnL Pill */}
      <View style={{ 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: pnlBgColor, 
        paddingHorizontal: 16, 
        paddingVertical: 8, 
        borderRadius: 20, 
        marginBottom: -30,
        marginTop: 10,
        gap: 6 
      }}>
        <Ionicons name={isPos ? "trending-up" : "trending-down"} size={16} color={pnlColor} />
        <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 15, color: pnlColor }}>
          {pnlSign}${formatSmartValue(absPNL)}
        </Text>
        <Text style={{ fontFamily: 'Inter-Regular', fontSize: 15, color: pnlColor, opacity: 0.4 }}>|</Text>
        <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 15, color: pnlColor }}>
          {pnlSign}{Math.abs(todayPNLPercent).toFixed(2)}%
        </Text>
      </View>

      {/* 4. History Action Button (Top Right) */}
      <TouchableOpacity 
        onPress={onHistoryTap} 
        style={{ 
          position: 'absolute', 
          top: 20, 
          right: -8,
          width: 40,
          height: 40,
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Image 
          source={require('../../assets/Buttons/HistoryCard.png')} 
          style={{ width: 20, height: 20, tintColor: Colors.TextPrimary[scheme] }} 
        />
      </TouchableOpacity>
    </View>
  );
};

const WalletActionButtons = ({ onDepositTap, onWithdrawTap, scheme }: { onDepositTap: () => void, onWithdrawTap: () => void, scheme: Theme }) => {
  const isDark = scheme === 'dark';
  const depositBg = Colors.FluxorPurple?.[scheme] || '#7D5FFF'; 
  const defaultBg = isDark ? '#1C1C1E' : '#F4F5F7'; 
  const defaultBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const iconCircleBg = 'rgba(255,255,255,0.25)';
  const defaultIconCircleBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap:10, marginTop: -3, marginBottom: -2 }}>
      {/* Deposit Button */}
      <TouchableOpacity onPress={onDepositTap} style={[styles.actionBtnPill, { backgroundColor: depositBg, borderColor: depositBg }]}>
        <View style={[styles.actionIconCircle, { backgroundColor: iconCircleBg }]}>
          <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
        </View>
        <Text style={[styles.actionBtnTextPill, { color: '#FFFFFF' }]}>Deposit</Text>
      </TouchableOpacity>

      {/* Withdraw Button */}
      <TouchableOpacity onPress={onWithdrawTap} style={[styles.actionBtnPill, { backgroundColor: defaultBg, borderColor: defaultBorder }]}>
        <View style={[styles.actionIconCircle, { backgroundColor: defaultIconCircleBg }]}>
          <Ionicons name="arrow-up" size={16} color={Colors.TextPrimary[scheme]} />
        </View>
        <Text style={[styles.actionBtnTextPill, { color: Colors.TextPrimary[scheme] }]}>Withdraw</Text>
      </TouchableOpacity>
    </View>
  );
};

const WalletAssetRow = ({ asset, scheme }: { asset: WalletAsset, scheme: Theme }) => (
  <View style={styles.assetRow}>
    <TokenIcon symbol={asset.symbol} size={40} /> 
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
  const amountColor = isPos ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30');
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

const HistoryView = ({ transactions, onClose, scheme }: { transactions: WalletTransaction[], onClose: () => void, scheme: Theme }) => {
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);
  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="History" onClose={onClose} scheme={scheme} />
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 12 }}>
        
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

          <View style={{ flexDirection: 'row', gap: 12, marginTop: -8 }}>
            <TokenActionButton icon={require('../../assets/Buttons/Send.png')} text="Send" action={() => setIsShowingSend(true)} scheme={scheme} />
            <TokenActionButton icon={require('../../assets/Buttons/Receive.png')} text="Receive" action={() => setIsShowingReceive(true)} scheme={scheme} />
          </View>

          <View style={{ marginTop: -8 }}>
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
                marginTop: -2,
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

      <RightSlideModal visible={isShowingReceive} onClose={() => setIsShowingReceive(false)}>
        <DepositDetailsView asset={asset} onClose={() => setIsShowingReceive(false)} scheme={scheme} />
      </RightSlideModal>

      <RightSlideModal visible={isShowingSend} onClose={() => setIsShowingSend(false)}>
        <WithdrawDetailsView asset={asset} onClose={() => setIsShowingSend(false)} scheme={scheme} />
      </RightSlideModal>
      
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

export const DepositView = ({ onClose, scheme }: { onClose: () => void, scheme: Theme }) => {
  const [search, setSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<{symbol: string, name: string, logo?: string, networks: CryptoNetwork[]} | null>(null);
  const [dexTokens, setDexTokens] = useState<Token[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const defaultTokens = ContractData as Token[];

  // ─── 1. Filter JSON tokens by name, symbol, id, OR contract address ───────
  const filteredDefault = useMemo(() => {
    if (!search.trim()) return defaultTokens;
    const needle = search.trim().toLowerCase();
    return defaultTokens.filter(t =>
      t.name?.toLowerCase().includes(needle) ||
      t.symbol?.toLowerCase().includes(needle) ||
      t.id?.toLowerCase().includes(needle) ||
      t.deployments?.some(d => d.address?.toLowerCase().includes(needle))
    );
  }, [search, defaultTokens]);

  // ─── 2. DexScreener fallback — only fires when JSON yields nothing ─────────
  useEffect(() => {
    const needle = search.trim();
    if (!needle) {
      setDexTokens([]);
      return;
    }

    // If JSON already has matches, skip DexScreener entirely
    if (filteredDefault.length > 0) {
      setDexTokens([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Detect address type:
        //   EVM  → starts with 0x and is 42 chars
        //   Solana → base58, 32–44 chars, no 0x prefix
        const isEvmAddr = /^0x[a-fA-F0-9]{40}$/.test(needle);
        const isSolanaAddr = !needle.startsWith('0x') && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(needle);

        if (isEvmAddr || isSolanaAddr) {
          const token = await TokenSearchManager.shared.searchByContract(needle);
          setDexTokens(token ? [token] : []);
        } else {
          const tokens = await TokenSearchManager.shared.searchByName(needle);
          setDexTokens(tokens);
        }
      } catch {
        setDexTokens([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [search, filteredDefault.length]);

  // ─── 3. Merge JSON + DexScreener without duplicates ───────────────────────
  const combined = useMemo(() => {
    const result = [...filteredDefault];
    const existingKeys = new Set([
      ...result.map(t => t.symbol.toLowerCase()),
      ...result.map(t => t.id?.toLowerCase()).filter(Boolean),
    ]);
    for (const dt of dexTokens) {
      if (
        !existingKeys.has(dt.symbol.toLowerCase()) &&
        !existingKeys.has(dt.id?.toLowerCase())
      ) {
        result.push(dt);
      }
    }
    return result;
  }, [filteredDefault, dexTokens]);

  if (selectedAsset) return <DepositDetailsView asset={selectedAsset} onClose={() => setSelectedAsset(null)} scheme={scheme} />;

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="Select Asset" onClose={onClose} scheme={scheme} />

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <UnifiedSearchBar
          searchText={search}
          setSearchText={setSearch}
          placeholder="Search name or contract address"
          scheme={scheme}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ gap: 0 }}>
          {combined.map((token: Token, idx) => {
            const depositInfo = {
              symbol: token.symbol,
              name: token.name,
              logo: token.logo,
              networks: getNetworksForToken(token),
            };
            return (
              <View key={token.id || `dex-${idx}`}>
                <TouchableOpacity onPress={() => setSelectedAsset(depositInfo)} activeOpacity={0.7}>
                  <DepositAssetRow asset={token} scheme={scheme} />
                </TouchableOpacity>
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 17, marginRight: 18 }} />
              </View>
            );
          })}

          {/* Loading spinner (DexScreener fetch in progress) */}
          {isSearching && (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={Colors.TextSecondary[scheme]} />
            </View>
          )}

          {/* Empty state */}
          {!isSearching && search.trim().length > 0 && combined.length === 0 && (
            <View style={{ paddingVertical: 60, alignItems: 'center', gap: 8 }}>
              <Ionicons name="search-outline" size={32} color={Colors.TextSecondary[scheme]} />
              <Text style={{ fontFamily: 'Inter-Regular', fontSize: 15, color: Colors.TextSecondary[scheme] }}>
                No tokens found
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const DepositDetailsView = ({ asset, onClose, scheme }: { asset: { symbol: string, name: string, logo?: string, networks: CryptoNetwork[] }, onClose: () => void, scheme: Theme }) => {
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
                
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 13, backgroundColor: Colors.TextSecondary[scheme] + '1A', borderRadius: 12 }}>
                    <Text style={{ flex: 1, fontFamily: 'Inter-Medium', fontSize: 16, color: Colors.TextPrimary[scheme], lineHeight: 22 }}>
                        {address}
                    </Text>
                    
                    {/* ALIGNED TO MATCH SWIFT UI'S ZSTACK EXACTLY */}
                    <View style={{ position: 'relative', zIndex: 100, marginLeft: 12, marginTop: -4, marginBottom: -10, marginRight: -4 }}>
                        <TouchableOpacity onPress={copyToClipboard} style={{ width: 42, height: 42, justifyContent: 'center', alignItems: 'center' }} activeOpacity={1}>
                            {showCopied ? (
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: scheme === 'dark' ? 'rgba(40,205,65,0.2)' : 'rgba(40,205,65,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                                    
                                    {Platform.OS === 'ios' ? (
                                        <SymbolView name="checkmark" size={15} tintColor={Colors.AppGreen?.[scheme] || '#28CD41'} weight="bold" />
                                    ) : (
                                        <Ionicons name="checkmark" size={15} color={Colors.AppGreen?.[scheme] || '#28CD41'} style={{ fontWeight: 'bold' as any }} />
                                    )}
                                </View>
                            ) : (
                                <Image source={require('../../assets/Buttons/CopyButton.png')} style={{ width: 42, height: 42, tintColor: Colors.TextSecondary[scheme] }} />
                            )}
                        </TouchableOpacity>
                        
                        {showCopied && (
                            <Animated.View style={{ 
                                position: 'absolute', 
                                top: -28, 
                                left: '50%', 
                                marginLeft: -30, 
                                width: 60,  
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

export const WithdrawView = ({ assets, onClose, scheme, prefilledAddress }: { assets: WalletAsset[], onClose: () => void, scheme: Theme, prefilledAddress?: string }) => {
  const [search, setSearch] = useState("");
  const list = search ? assets.filter((a:WalletAsset) => a.name.toLowerCase().includes(search.toLowerCase()) || a.symbol.toLowerCase().includes(search.toLowerCase())) : assets;
  const sortedList = list.sort((a:WalletAsset, b:WalletAsset) => b.value - a.value);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);

  if (selectedAsset) return <WithdrawDetailsView asset={selectedAsset} onClose={() => setSelectedAsset(null)} scheme={scheme} prefilledAddress={prefilledAddress} />;

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title="Select Asset" onClose={onClose} scheme={scheme} />
    <View style={{ paddingHorizontal: 15.5, paddingBottom: 10 }}>
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

const WithdrawDetailsView = ({ asset, onClose, scheme, prefilledAddress }: { asset: WalletAsset, onClose: () => void, scheme: Theme, prefilledAddress?: string }) => {
  const [network, setNetwork] = useState(asset.networks[0]);
  const [address, setAddress] = useState(prefilledAddress || "");
  const [amount, setAmount] = useState("");
  
  const fee = FeeEstimator.getEstimatedNetworkFeeUSD(network?.chainId || 1);
  const receiveAmount = Number(amount) > 0 ? Number(amount) : 0;

  const inputBgColor = scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  const addressError = useMemo(() => {
    if (!address) return null; // No error if the field is empty

    const isSolanaChain = network?.chainId === 101;
    const startsWith0x = address.startsWith('0x');

    if (isSolanaChain && startsWith0x) {
      return `This is not a valid Solana address.`;
    }

    if (!isSolanaChain && !startsWith0x) {
      return `This is not a valid ${network?.name} address.`;
    }

    if (!isSolanaChain && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return `This is not a valid ${network?.name} address.`;
    }
    if (isSolanaChain && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return `This is not a valid Solana address.`;
    }

    return null; 
  }, [address, network]);

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <Header title={`Send ${asset.symbol}`} onClose={onClose} scheme={scheme} />
      
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, zIndex: 1 }}>
        <View style={{ paddingHorizontal: 16, gap: 24, paddingTop: 10, paddingBottom: 20 }}>
          
          {/* Address Section */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme] }}>Address</Text>
            
            {/* Wrapper added to support red error borders */}
            <View style={{ 
              backgroundColor: inputBgColor, 
              borderRadius: 12,
              borderWidth: addressError ? 1 : 0,
              borderColor: addressError ? (Colors.AppRed?.[scheme] || '#FF3B30') : 'transparent'
            }}>
              <TextInput 
                style={{ 
                  paddingHorizontal: 16, 
                  height: 50, 
                  color: addressError ? (Colors.AppRed?.[scheme] || '#FF3B30') : Colors.TextPrimary[scheme],
                  fontFamily: 'Inter-Regular',
                  fontSize: 17
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

            {/* Error Message Display */}
            {addressError && (
              <Text style={{ 
                color: Colors.AppRed?.[scheme] || '#FF3B30', 
                fontSize: 14, 
                fontFamily: 'Inter-Regular',
                marginTop: -4,
                paddingLeft: 4
              }}>
                {addressError}
              </Text>
            )}
          </View>

          {/* Network Section */}
          <View style={{ zIndex: 100 }}>
            <NetworkSelectorView networks={asset.networks} selectedNetwork={network} onSelect={setNetwork} scheme={scheme} />
          </View>

          {/* Withdrawal Amount Section */}
          <View style={{ gap: 10, zIndex: 0 }}>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 15.5, color: Colors.TextSecondary[scheme] }}>Withdrawal Amount</Text>
            
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              backgroundColor: inputBgColor, 
              height: 50, 
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
      
      <View style={{ 
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20, 
        backgroundColor: Colors.AppBackground[scheme] 
      }}>
        <View style={{ gap: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 15, fontFamily: 'Inter-Medium' }}>Network Fee</Text>
              <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 15, fontFamily: 'Inter-SemiBold' }}>{formatFee(fee)}</Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: Colors.TextSecondary[scheme], fontSize: 15, fontFamily: 'Inter-Medium' }}>Receive Amount</Text>
              <Text style={{ color: Colors.TextPrimary[scheme], fontSize: 15, fontFamily: 'Inter-SemiBold' }}>{formatSmartAmount(receiveAmount)} {asset.symbol}</Text>
            </View>
        </View>
        
        <TouchableOpacity 
          disabled={!!addressError || address.length === 0 || !amount || Number(amount) <= 0}
          style={{ 
            backgroundColor: Colors.FluxorPurple?.[scheme] || '#A020F0', 
            height: 52, 
            borderRadius: 14,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: (!!addressError || address.length === 0 || !amount || Number(amount) <= 0) ? 0.5 : 1 
          }} 
          onPress={() => console.log("Withdraw Tapped")}
        >
          <Text style={{ color: '#FFF', fontSize: 18, fontFamily: 'Inter-Bold' }}>Withdraw</Text>
        </TouchableOpacity>

      </View>
    </View>
  );
};

const TokenSearchPage = ({ assets, transactions, onClose, onSelectAsset, scheme }: { assets: WalletAsset[], transactions: WalletTransaction[], onClose: () => void, onSelectAsset: (a: WalletAsset) => void, scheme: Theme }) => {
  const [search, setSearch] = useState("");
  const list = search ? assets.filter((a:WalletAsset) => a.name.toLowerCase().includes(search.toLowerCase()) || a.symbol.toLowerCase().includes(search.toLowerCase())) : assets;
  
  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: Platform.OS==='ios'?70:20, paddingBottom: 12 }}>
        
        <TouchableOpacity onPress={onClose} hitSlop={{top:10, bottom:10, left:10, right:10}}>
            <Ionicons name="chevron-back" size={26} color={Colors.TextPrimary[scheme]} style={{ marginRight: 20 }} />
        </TouchableOpacity>
        
        <View style={{ flex: 1 }}>
            <UnifiedSearchBar searchText={search} setSearchText={setSearch} placeholder="Token name" scheme={scheme} />
        </View>

       </View>
       
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ gap: 0, paddingHorizontal: 5 }}>
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

// MARK: - Custom Animated Modal
export const RightSlideModal = ({ visible, onClose, children }: { visible: boolean, onClose: () => void, children: React.ReactNode }) => {
  const [show, setShow] = useState(visible);
  const { width } = Dimensions.get('window');
  const slideAnim = React.useRef(new Animated.Value(width)).current;

  useEffect(() => {
    if (visible) {
      setShow(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        stiffness: 250,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: width,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setShow(false));
    }
  }, [visible]);

  if (!show) return null;

  return (
    <Modal visible={show} transparent={true} animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
        {children}
      </Animated.View>
    </Modal>
  );
};

const Header = ({ title, titleView, onClose, scheme }: { title: string, titleView?: React.ReactNode, onClose: () => void, scheme: Theme }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 65 : 20, paddingBottom: 15 }}>
    
    <TouchableOpacity 
      onPress={onClose}
      style={{
        width: 36,
        height: 36,
        borderRadius: 21, 
        backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <Ionicons name="arrow-back" size={22} color={Colors.TextPrimary[scheme]} />
    </TouchableOpacity>

    {titleView ? titleView : <Text style={[styles.headerTitle, { color: Colors.TextPrimary[scheme] }]}>{title}</Text>}

    <View style={{ width: 35 }} />
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
        elevation: 0 
      }
    ]}>
      <Ionicons name="search" size={16} color={Colors.TextSecondary[scheme]} />
      <TextInput 
        style={[styles.searchInput, { color: Colors.TextPrimary[scheme], includeFontPadding: false, textAlignVertical: 'center' }]} 
        placeholder={placeholder} 
        placeholderTextColor={Colors.TextSecondary[scheme]} 
        value={searchText} 
        onChangeText={setSearchText} 
        autoCapitalize="none" 
        autoCorrect={false} 
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        underlineColorAndroid="transparent" 
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
            style={{ flex: 1, color: Colors.TextPrimary[scheme], fontFamily: 'Inter-Medium', fontSize: fontSize, includeFontPadding: false, padding: 0, textAlignVertical: 'center' }}
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
        damping: 10,
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
                            {Platform.OS === 'ios' ? (
                                <SymbolView name="checkmark" size={15} tintColor={Colors.AppGreen?.[scheme] || '#28CD41'} weight="bold" />
                            ) : (
                                <Ionicons name="checkmark" size={15} color={Colors.AppGreen?.[scheme] || '#28CD41'} style={{ fontWeight: 'bold' as any }} />
                            )}
                        </View>
                    ) : (
                        <Image source={require('../../assets/Buttons/CopyButton.png')} style={{ width: 43, height: 43, tintColor: Colors.TextSecondary[scheme] }} />
                    )}
                </TouchableOpacity>
                
                {showCopied && (
                     <Animated.View style={{ 
                         position: 'absolute', 
                         top: -35, 
                         left: '50%', 
                         marginLeft: -30, 
                         width: 60,  
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
              height: 54
            }
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TokenIcon symbol={active?.icon || ""} size={24} />
            <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 17, color: Colors.TextPrimary[scheme] }}>{active?.name}</Text>
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
              top: 56, 
              left: 0,
              right: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
              shadowOpacity: 0
            }
          ]}>
            <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 285 }}>
              {networks.map((n:CryptoNetwork, i:number) => (
                <View key={n.id}>
                  <TouchableOpacity 
                    onPress={() => { onSelect(n); setIsOpen(false); }} 
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 }}
                  >
                    <TokenIcon symbol={n.icon} size={24} />
                    <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 17, color: Colors.TextPrimary[scheme], marginLeft: 12, flex: 1 }}>{n.name}</Text>
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

const DepositAssetRow = ({ asset, scheme }: { asset: { symbol: string, name: string, logo?: string }, scheme: Theme }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13 }}>
    
    <TokenIcon 
      symbol={asset.symbol} 
      logoUrl={asset.logo} 
      size={40} 
    />
    
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
              
              {item.type !== 'received' && <DetailRow label="Gas Fee" value={item.gasFee} scheme={scheme} />}
              
              {item.type === 'sent' && item.lpFee !== undefined ? (
                  <DetailRow label="LP Fee" value={item.lpFee} scheme={scheme} />
              ) : null}
              
              {item.networkChainId && <NetworkRow label="Network" network={ChainRegistry.get(item.networkChainId).name} icon={ChainRegistry.get(item.networkChainId).icon} scheme={scheme} />}
          </View>

          <View style={{ paddingHorizontal: 4 }}>
              {item.targetTx && (
                  <View>
                      <HashBlock title="Target Tx Hash on" hash={item.targetTx.txHash} chainId={item.targetTx.chainId} scheme={scheme} />
                      {( item.sourceTxs.length > 0) && <View style={{ height: 1, backgroundColor: isDarkTheme?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)' }} />}
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
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
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

const styles = StyleSheet.create({
  container: { flex: 1 },

  actionBtnPill: {
    flex: 1,
    flexDirection: 'row',
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  actionIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 5
  },
  actionBtnTextPill: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17.5
  },

  wbCard: { paddingHorizontal: 13, paddingVertical: 16, paddingBottom: 5 },
  wbTitle: { fontFamily: 'Inter-Medium', fontSize: 17, textAlign: 'center', marginTop: 8 },
  wbBalance: { fontFamily: 'Inter-Bold', fontSize: 32, textAlign: 'center' },
  wbPnlLabel: { fontFamily: 'Inter-Medium', fontSize: 16 },
  wbPnlValue: { fontFamily: 'Inter-Medium', fontSize: 16 },
  actionRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  actionBtn: { flex: 1, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11.5, marginTop: 0 },
  catText: { fontFamily: 'Inter-SemiBold', fontSize: 18 },
  catIndicator: { height: 2, width: 20, borderRadius: 2, marginTop: 8 },
  hexIcon: { width: 42.5, height: 42.5, resizeMode: 'contain', marginLeft: 6, marginBottom: 8, marginHorizontal: -12 },
  filterPopup: { position: 'absolute', top: 45, right: 13, width: 200, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: {width:0, height:5} },
  assetRow: { 
  flexDirection: 'row', 
  paddingHorizontal: 12, 
  paddingVertical: Platform.select({
    android: 7,
    ios: 13,
  }),
  alignItems: 'center' 
},
  assetName: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  assetSymbol: { fontFamily: 'Inter-Medium', fontSize: 15 },
  assetAmount: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  assetValue: { fontFamily: 'Inter-Medium', fontSize: 15 },
  txRow: { flexDirection: 'row', padding: 16, borderRadius: 20, alignItems: 'center' },
  txTitle: { fontFamily: 'Inter-SemiBold', fontSize: 17 },
  txDate: { fontFamily: 'Inter-Medium', fontSize: 14 }, 
  txAmount: { fontFamily: 'Inter-Medium', fontSize: 16 },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 12, borderRadius: 18, marginBottom: -5, minHeight: 44 },
  searchInput: { flex: 1, marginLeft: 10, fontFamily: 'Inter-Regular', fontSize: 16, paddingVertical: 0 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12 },
  dropdownList: { position: 'absolute', top: 85, left: 0, right: 0, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: {width:0, height:10} },
  addressBox: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12 },
  qrWrapper: { width: 230, height: 230, backgroundColor: '#FFF', borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: {width:0, height:4} },
  inputField: { padding: 16, borderRadius: 12, fontFamily: 'Inter-Regular', fontSize: 16 },
  tokenActionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 11, borderRadius: 12},
  tokenActionText: { fontFamily: 'Inter-SemiBold', fontSize: 19, marginLeft: 1 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetContent: { backgroundColor: '#000', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, marginBottom: 10 },
  sheetTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18 }
});

