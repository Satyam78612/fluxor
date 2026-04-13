import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  useColorScheme,
  Modal,
  PanResponder,
  Keyboard,
  Platform,
  FlatList,
  ActivityIndicator,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from 'expo-router';

// --- Imports from our Logic & Components ---
import useMarketViewModel from '../../logic/useMarketViewModel';
import useWalletViewModel from '../../logic/useWalletViewModel';
import { Token } from '../../logic/Token';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SmartPriceText } from '../../components/SmartPriceText';
import { TokenIcon } from '../../components/TokenIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';

const formatSmartValue = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatSmartAmount = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8, useGrouping: true }).format(value);

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', AUD: 'A$', INR: '₹', CAD: 'C$', JPY: '¥', CNY: '¥', GBP: '£', SGD: 'S$'
};

// --- Helper: Hex to RGBA for Swift-like Opacity Modifiers ---
const withAlpha = (hexColor: string, alpha: number) => {
  const hex = hexColor?.replace('#', '') || 'FFFFFF';
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hexColor; // Fallback
};

// --- Helper: Dynamic Block Explorer Links ---
const getExplorerURL = (network: string, hash: string) => {
  const lower = network.toLowerCase();
  if (lower.includes('solana')) return `https://solscan.io/tx/${hash}`;
  if (lower.includes('bnb') || lower.includes('bsc')) return `https://bscscan.com/tx/${hash}`;
  if (lower.includes('arbitrum')) return `https://arbiscan.io/tx/${hash}`;
  if (lower.includes('optimism')) return `https://optimistic.etherscan.io/tx/${hash}`;
  if (lower.includes('base')) return `https://basescan.org/tx/${hash}`;
  if (lower.includes('polygon') || lower.includes('matic')) return `https://polygonscan.com/tx/${hash}`;
  return `https://etherscan.io/tx/${hash}`; // Default Ethereum
};

// --- Layout Constants ---
const Layout = {
  horizontalPadding: 13,
  verticalPadding: 12,
  columnSpacing: 8,
  cornerRadius: 10,
  pillHeight: 45,
  formSpacing: 11,
};

// --- Types ---
type TradeSide = 'buy' | 'sell';
type PortfolioSortField = 'none' | 'balance';
type PortfolioSortDirection = 'asc' | 'desc';

interface AssetItem {
  id: string;
  name: string;
  symbol: string;
  price: string;
  rawPrice?: number;
  change: string;
  isPositive: boolean;
  balanceValue: string;
  balanceAmount: string;
  iconName: string;
}

const MOCK_HISTORY: any[] = [
  {
    id: 'h1', symbol: 'AAVE', type: 'Buy', time: '14 Sep 2025, 11:57 AM', price: '$0.12', buyAmount: '+1.2 AAVE', sellAmount: '-$150 USD', gasFee: '$0.10', appFee: '$0.03', lpFee: '$0.05', status: 'Success',
    targetTx: { id: 't1', type: 'Target', networkName: 'Base', txHash: '0x92...5ab8' },
    sourceTxs: [
      { id: 'src1', type: 'From', networkName: 'BNB Chain', txHash: '0x31...5460' },
      { id: 'src2', type: 'From', networkName: 'Arbitrum', txHash: '0xd8...4578' },
      { id: 'src5', type: 'From', networkName: 'Solana', txHash: '0xd8...4578' },
      { id: 'src6', type: 'From', networkName: 'Optimism', txHash: '0xd8...4578' }
    ]
  },
  {
    id: 'h2', symbol: 'EIGEN', type: 'Sell', time: '12 Aug 2025, 10:49 PM', price: '$0.50', buyAmount: '+$150 USD', sellAmount: '-300 EIGEN', gasFee: '$0.03', appFee: '$0.30', lpFee: '$0.15', status: 'Success',
    targetTx: { id: 't2', type: 'Target', networkName: 'Base', txHash: '0x92...5ab8' },
    sourceTxs: [
      { id: 'src3', type: 'From', networkName: 'BNB Chain', txHash: '0x31...5460' }
    ]
  }
];

const ORDERBOOK_DATA = [
  { price: "91,735.50", amount: "0.4500", isSell: false },
  { price: "91,730.00", amount: "0.0028", isSell: true },
  { price: "91,728.50", amount: "0.1500", isSell: true },
  { price: "91,725.20", amount: "0.0450", isSell: true },
  { price: "91,736.00", amount: "0.2100", isSell: false },
  { price: "91,737.50", amount: "0.0550", isSell: false },
  { price: "91,720.00", amount: "1.0200", isSell: true },
  { price: "91,718.50", amount: "0.0010", isSell: true },
  { price: "91,739.20", amount: "0.5000", isSell: false },
  { price: "91,740.00", amount: "0.1200", isSell: false },
  { price: "91,742.00", amount: "0.1230", isSell: true }
];

// --- Helper Functions ---
const formatWithCommas = (v: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
const formatAmount = (v: number) => {
  if (v === 0) return '0';
  const str = v >= 1 ? v.toFixed(4) : v.toFixed(6);
  return str.replace(/\.?0+$/, ''); 
};

const formatLargeNumber = (v: number) => {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  return formatAmount(v);
};

const formatPrice = (v: number) => v.toFixed(2);
const cleanDecimalInput = (text: string) => {
  let cleaned = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if ((cleaned.match(/\./g) || []).length > 1) {
    const parts = cleaned.split('.');
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  return cleaned;
};

export default function TradeScreen() {
  const { theme: scheme } = useTheme();
  const marketVM = useMarketViewModel();
  const walletVM = useWalletViewModel();

  const insets = useSafeAreaInsets();

  const [selectedCurrency, setSelectedCurrency] = useState<string>('None');

  useFocusEffect(
    React.useCallback(() => {
      const loadCurrency = async () => {
        const storedCurrency = await AsyncStorage.getItem('selectedCurrency');
        if (storedCurrency) setSelectedCurrency(storedCurrency);
      };
      loadCurrency();
    }, [])
  );
  
  // State
  const [currentSide, setCurrentSide] = useState<TradeSide>('buy');
  const [amountInput, setAmountInput] = useState('');
  const [totalInput, setTotalInput] = useState('');
  const [sliderValue, setSliderValue] = useState(0);
  const [activeInput, setActiveInput] = useState<'amount' | 'total' | 'slider' | null>(null);

  // Modals & Selections
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [showingInsufficientFundsAlert, setShowingInsufficientFundsAlert] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any | null>(null);
  const [isSliderActive, setIsSliderActive] = useState(false);
  
  // Tab State
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [portfolioSortField, setPortfolioSortField] = useState<PortfolioSortField>('none');
  const [portfolioSortDirection, setPortfolioSortDirection] = useState<PortfolioSortDirection>('desc');

  const [selectedAsset, setSelectedAsset] = useState<AssetItem>({
    id: 'init', name: 'Bitcoin', symbol: 'BTC', price: '$91,700', rawPrice: 91700, change: '+4.02%', isPositive: true, balanceValue: '$250', balanceAmount: '0.0034', iconName: 'BTC'
  });
  
  useEffect(() => {
    if (!marketVM.allTokens || marketVM.allTokens.length === 0) return;
    
    const liveToken = marketVM.allTokens.find((t: Token) => t.symbol.toUpperCase() === selectedAsset.symbol.toUpperCase());
    
    if (liveToken && liveToken.price && liveToken.price !== selectedAsset.rawPrice) {
      const change = liveToken.changePercent ?? 0;
      const priceVal = liveToken.price;
      const maxDecimals = priceVal >= 1000 ? 2 : (priceVal >= 1 ? 4 : 8);
      const priceStr = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: maxDecimals,
      }).format(priceVal);

      setSelectedAsset(prev => ({
        ...prev,
        price: priceStr,
        rawPrice: priceVal,
        change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        isPositive: change >= 0,
        iconName: liveToken.logo || prev.iconName 
      }));
    }
  }, [marketVM.allTokens, selectedAsset.symbol]);

  // Slippage State
  const [slippage, setSlippage] = useState<number | null>(null);
  const [customSlippage, setCustomSlippage] = useState('');
  const [solanaTxMode, setSolanaTxMode] = useState('Auto');

  const availableUSD = 22000;
  
  // Base theme colors for Buy/Sell
  const themeColor = currentSide === 'buy' ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30');
  const tokenPrice = selectedAsset.rawPrice !== undefined ? selectedAsset.rawPrice : (parseFloat(selectedAsset.price.replace(/[^0-9.-]+/g, '')) || 0);
  const matchedWalletAsset = walletVM.assets.find(a => a.symbol === selectedAsset.symbol);
  const availableTokenBalance = matchedWalletAsset ? matchedWalletAsset.amount : 0;

  const isOverBalance = currentSide === 'buy' 
    ? (parseFloat(totalInput) || 0) > availableUSD 
    : (parseFloat(amountInput) || 0) > availableTokenBalance;

  const isTradeValid = useMemo(() => {
    if (isOverBalance) return false;
    if (currentSide === 'buy') {
      return (parseFloat(totalInput) || 0) >= 1.0;
    } else {
      const amt = parseFloat(amountInput) || 0;
      return (amt * tokenPrice) >= 1.0;
    }
  }, [isOverBalance, currentSide, totalInput, amountInput, tokenPrice]);

  const simulateBackendQuote = (inputAmount: number, side: TradeSide) => {
    if (side === 'buy') return inputAmount / Math.max(0.000001, tokenPrice);
    return inputAmount * tokenPrice;
  };

  // Sync Logic
  useEffect(() => {
    if (activeInput !== 'slider') return;
    const pct = Math.max(0, Math.min(100, sliderValue)) / 100;
    
    if (currentSide === 'buy') {
      const usdVal = pct * availableUSD;
      const estimatedBTC = simulateBackendQuote(usdVal, 'buy');
      setTotalInput(formatPrice(usdVal));
      setAmountInput(formatAmount(estimatedBTC));
    } else {
      const tokenAmt = pct * availableTokenBalance;
      const estimatedUSD = simulateBackendQuote(tokenAmt, 'sell');
      setAmountInput(formatAmount(tokenAmt));
      setTotalInput(formatPrice(estimatedUSD));
    }
  }, [sliderValue]);

  const handleTotalChange = (text: string) => {
    const cleaned = cleanDecimalInput(text);
    setTotalInput(cleaned);
    setActiveInput('total');

    const usdVal = parseFloat(cleaned) || 0;
    const effectiveUSD = Math.min(usdVal, availableUSD);
    const estimatedBTC = simulateBackendQuote(effectiveUSD, 'buy');
    
    setAmountInput(formatAmount(estimatedBTC));
    
    const newSliderVal = availableUSD > 0 ? (usdVal / availableUSD) * 100 : 0;
    setSliderValue(Math.min(newSliderVal, 100));
  };

  const handleAmountChange = (text: string) => {
    const cleaned = cleanDecimalInput(text);
    setAmountInput(cleaned);
    setActiveInput('amount');

    const amtVal = parseFloat(cleaned) || 0;
    const effectiveAmt = Math.min(amtVal, availableTokenBalance);
    const estimatedUSD = simulateBackendQuote(effectiveAmt, 'sell');

    setTotalInput(formatPrice(estimatedUSD));

    const newSliderVal = availableTokenBalance > 0 ? (amtVal / availableTokenBalance) * 100 : 0;
    setSliderValue(Math.min(newSliderVal, 100));
  };

const sortedPortfolio = useMemo(() => {
  let list = [...walletVM.assets]; 

  if (portfolioSortField === 'balance') {
    list.sort((a, b) => {
      return portfolioSortDirection === 'asc' ? a.value - b.value : b.value - a.value;
    });
  }

  return list.map(asset => {
    const startValue = asset.value - asset.dayChangeUSD;
    const percentChange = startValue > 0 ? (asset.dayChangeUSD / startValue) * 100 : 0.0;

    return {
      id: asset.id,
      name: asset.name,
      symbol: asset.symbol,
      price: `$${formatWithCommas(asset.amount > 0 ? (asset.value / asset.amount) : 0.0)}`,
      change: `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`,
      isPositive: percentChange >= 0,
      balanceValue: `$${formatSmartValue(asset.value)}`,
      balanceAmount: formatSmartAmount(asset.amount),
      iconName: asset.icon 
    };
  });
}, [portfolioSortField, portfolioSortDirection, walletVM.assets]);

  // --- Components ---
  const renderTabButton = (title: string, index: number) => {
    const isActive = selectedTabIndex === index;
    return (
      <TouchableOpacity onPress={() => setSelectedTabIndex(index)} style={styles.tabBtn} activeOpacity={0.7}>
        <Text style={[styles.tabBtnText, { color: isActive ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }]}>
          {title}
        </Text>
        <View style={[styles.tabIndicator, { backgroundColor: isActive ? Colors.TextPrimary[scheme] : 'transparent' }]} />
      </TouchableOpacity>
    );
  };

 return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: Colors.AppBackground[scheme],
        // Dynamically calculate the top padding for Android & iOS
        paddingTop: Platform.OS === 'android' ? Math.max(insets.top + 5, 10) : Math.max(insets.top + -6, 0),
      }
    ]}>
      
      {/* Make the Android status bar translucent */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent={true} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.AppBackground[scheme] }]}>
        <TouchableOpacity style={styles.tokenSelectBtn} onPress={() => setShowTokenSelector(true)} activeOpacity={0.7}>
          
          <TokenIcon symbol={selectedAsset.symbol} logoUrl={selectedAsset.iconName} size={37} />
          <View style={styles.tokenSelectTextWrap}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.tokenSelectSymbol, { color: Colors.TextPrimary[scheme] }]}>{selectedAsset.symbol}/USD</Text>
              <Ionicons name="chevron-down" size={12} color={Colors.TextSecondary[scheme]} style={{ marginTop: 2 }} />
            </View>
            <Text style={[styles.tokenSelectChange, { color: selectedAsset.isPositive ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30') }]}>
              {selectedAsset.change}
            </Text>
          </View>
        </TouchableOpacity>
        
        <View style={{ flex: 1 }} />
        
        <View style={styles.headerRightIcons}>
          <TouchableOpacity onPress={() => setShowSlippageSettings(true)} style={styles.iconBtn}>
             <Image source={require('../../assets/Buttons/Slippage.png')} style={[styles.customIcon, { tintColor: Colors.TextPrimary[scheme] }]} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
             <Image source={require('../../assets/Buttons/Candle.png')} style={[styles.customIcon, { tintColor: Colors.TextPrimary[scheme] }]} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
             <Ionicons name="ellipsis-horizontal" size={20} color={Colors.TextPrimary[scheme]} style={{ transform: [{ rotate: '90deg' }] }} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
  showsVerticalScrollIndicator={false} 
  keyboardShouldPersistTaps="handled"
  scrollEnabled={!isSliderActive} 
>
        
        {/* Top Section: Form + Orderbook */}
        <View style={styles.topSection}>
          
          {/* LEFT FORM */}
          <View style={styles.formColumn}>
            <View style={[styles.segmentControl, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
              <TouchableOpacity style={[styles.segmentBtn, { backgroundColor: currentSide === 'buy' ? themeColor : 'transparent' }]} onPress={() => { setCurrentSide('buy'); setAmountInput(''); setTotalInput(''); setSliderValue(0); }} activeOpacity={0.8}>
                <Text style={[styles.segmentBtnText, { color: currentSide === 'buy' ? '#FFF' : Colors.TextSecondary[scheme] }]}>Buy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segmentBtn, { backgroundColor: currentSide === 'sell' ? themeColor : 'transparent' }]} onPress={() => { setCurrentSide('sell'); setAmountInput(''); setTotalInput(''); setSliderValue(0); }} activeOpacity={0.8}>
                <Text style={[styles.segmentBtnText, { color: currentSide === 'sell' ? '#FFF' : Colors.TextSecondary[scheme] }]}>Sell</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.marketPill, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
              <Text style={[styles.marketPillText, { color: Colors.TextPrimary[scheme] }]}>Market</Text>
            </View>

            {currentSide === 'buy' ? (
              <>
                <View style={[styles.inputPill, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
                   <Text style={[styles.inputText, { color: amountInput ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }]}>{amountInput ? formatLargeNumber(parseFloat(amountInput)) : `Amount (${selectedAsset.symbol})`}</Text>
                </View>
                <ThinSlider 
                    value={sliderValue} 
                    onValueChange={(v) => { setSliderValue(v); setActiveInput('slider'); }} 
                    onDragStart={() => setIsSliderActive(true)} 
                    onDragEnd={() => setIsSliderActive(false)} 
                  />
                <View style={[styles.inputPill, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
                   <TextInput style={[styles.actualInput, { color: Colors.TextPrimary[scheme] }]} keyboardType="decimal-pad" returnKeyType="done" placeholder="Total (USD)" placeholderTextColor={Colors.TextSecondary[scheme]} value={totalInput} onChangeText={handleTotalChange} />
                </View>
              </>
            ) : (
              <>
                <View style={[styles.inputPill, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
                   <Text style={[styles.inputText, { color: totalInput ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }]}>{totalInput || `Total (USD)`}</Text>
                </View>
                <ThinSlider 
                    value={sliderValue} 
                    onValueChange={(v) => { setSliderValue(v); setActiveInput('slider'); }} 
                    onDragStart={() => setIsSliderActive(true)} 
                    onDragEnd={() => setIsSliderActive(false)} 
                  />
                <View style={[styles.inputPill, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
                   <TextInput style={[styles.actualInput, { color: Colors.TextPrimary[scheme] }]} keyboardType="decimal-pad" returnKeyType="done" placeholder={`Amount (${selectedAsset.symbol})`} placeholderTextColor={Colors.TextSecondary[scheme]} value={amountInput} onChangeText={handleAmountChange} />
                </View>
              </>
            )}

            <View style={styles.infoBox}>
              {/* Avbl Row (Protected against massive numbers) */}
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: Colors.TextSecondary[scheme] }]}>Avbl</Text>
                <Text style={[styles.infoVal, { color: Colors.TextPrimary[scheme] }]}>
                  {currentSide === 'buy' ? `${formatLargeNumber(availableUSD)} USD` : `${formatLargeNumber(availableTokenBalance)} ${selectedAsset.symbol}`}
                </Text>
              </View>
  
              {/* NEW Min received Row (fixing the massive number overlap) */}
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: Colors.TextSecondary[scheme] }]}>Min received</Text>
                <Text style={[styles.infoVal, { color: Colors.TextPrimary[scheme] }]}>
                  {currentSide === 'buy' ? `${formatLargeNumber(parseFloat(amountInput)||0)} ${selectedAsset.symbol}` : `${formatPrice(parseFloat(totalInput)||0)} USD`}
                </Text>
              </View>
  
              {/* Gas cost Row */}
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: Colors.TextSecondary[scheme] }]}>Gas cost</Text>
                <Text style={[styles.infoVal, { color: Colors.TextPrimary[scheme] }]}>0.10 USD</Text>
              </View>
            </View>

            {/* FLAWLESS SOLID BUTTON */}
            <TouchableOpacity 
              style={[
                styles.actionBtn, 
                { backgroundColor: isOverBalance ? '#808080' : themeColor } // Pure Red/Green unless over balance
              ]}
              disabled={!isTradeValid && !isOverBalance}
              activeOpacity={0.8}
              onPress={() => {
                if (isOverBalance) setShowingInsufficientFundsAlert(true);
                else console.log("Trade Executed");
              }}
            >
              <Text style={styles.actionBtnText}>
                {currentSide === 'buy' ? `Buy ${selectedAsset.symbol}` : `Sell ${selectedAsset.symbol}`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* RIGHT ORDERBOOK */}
          <View style={styles.orderbookColumn}>
            <View style={styles.orderbookContainer}>
               <View style={[styles.obHeader, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
                 <SmartPriceText value={tokenPrice} fontSize={18} fontFamily="Inter-SemiBold" color={Colors.TextPrimary[scheme]} />
               </View>
               <View style={[styles.obDivider, { backgroundColor: Colors.DividerColor?.[scheme] || '#2C2C35' }]} />
               <View style={styles.obLabels}>
                 <Text style={[styles.obLabelLeft, { color: Colors.TextSecondary[scheme] }]}>Price ($)</Text>
                 <Text style={[styles.obLabelRight, { color: Colors.TextSecondary[scheme] }]}>Amount</Text>
               </View>
               
               {ORDERBOOK_DATA.map((o, i) => (
                 <View key={i} style={styles.obRow}>
                   <Text style={[styles.obPrice, { color: o.isSell ? (Colors.AppRed?.[scheme] || '#FF3B30') : (Colors.AppGreen?.[scheme] || '#28CD41') }]} numberOfLines={1}>{o.price}</Text>
                   <Text style={[styles.obAmt, { color: Colors.TextPrimary[scheme] }]} numberOfLines={1}>{o.amount}</Text>
                 </View>
               ))}
            </View>
          </View>

        </View>

        {/* BOTTOM TABS */}
        <View style={styles.bottomTabs}>
          {[ {title: 'Portfolio', i: 0}, {title: 'History', i: 1} ].map((tab) => (
             <TouchableOpacity key={tab.i} onPress={() => setSelectedTabIndex(tab.i)} style={styles.tabBtn} activeOpacity={0.7}>
               <Text style={[styles.tabBtnText, { color: selectedTabIndex === tab.i ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }]}>{tab.title}</Text>
               <View style={[styles.tabIndicator, { backgroundColor: selectedTabIndex === tab.i ? Colors.TextPrimary[scheme] : 'transparent' }]} />
             </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
        </View>
        <View style={[styles.fullDivider, { backgroundColor: 'rgba(150, 150, 150, 0.3)', marginTop: -2, marginBottom: 2 }]} />

        {/* TAB CONTENT */}
        {selectedTabIndex === 0 ? (
          <View style={styles.portfolioContent}>
            <View style={styles.portHeader}>
              <Text style={[styles.portLabel, { color: Colors.TextSecondary[scheme] }]}>Name</Text>
              <View style={styles.portBalWrap}>
                <Text style={[styles.portLabel, { color: Colors.TextSecondary[scheme] }]}>Balance</Text>
                <View style={styles.sortArrows}>
                  <TouchableOpacity onPress={() => { setPortfolioSortField('balance'); setPortfolioSortDirection('asc'); }}>
                    <Ionicons name="caret-up" size={10} color={(portfolioSortField === 'balance' && portfolioSortDirection === 'asc') ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)'} style={{ marginBottom: -3 }} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setPortfolioSortField('balance'); setPortfolioSortDirection('desc'); }}>
                    <Ionicons name="caret-down" size={10} color={(portfolioSortField === 'balance' && portfolioSortDirection === 'desc') ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)'} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
            {sortedPortfolio.map((asset) => (
              <View key={asset.id} style={styles.portRow}>
                <View style={styles.portRowLeft}>
                  <TokenIcon symbol={asset.symbol} logoUrl={asset.iconName} size={36} />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={[styles.portName, { color: Colors.TextPrimary[scheme] }]}>{asset.name}</Text>
                    <Text style={[styles.portSym, { color: Colors.TextSecondary[scheme] }]}>{asset.symbol}</Text>
                  </View>
                </View>
                <View style={styles.portRowRight}>
                  <Text style={[styles.portVal, { color: Colors.TextPrimary[scheme] }]}>{asset.balanceValue}</Text>
                  <Text style={[styles.portAmt, { color: Colors.TextSecondary[scheme] }]}>{asset.balanceAmount}</Text>
                </View>
              </View>
            ))}
            <View style={{ height: 0 }} />
          </View>
        ) : (
          <View style={styles.historyContent}>
            {MOCK_HISTORY.length === 0 ? (
              <Text style={[styles.emptyHist, { color: Colors.TextSecondary[scheme] }]}>No History</Text>
            ) : (
              MOCK_HISTORY.map((item) => (
                <TouchableOpacity key={item.id} activeOpacity={0.8} onPress={() => setSelectedHistoryItem(item)}>
                  <View style={[styles.histCard, { backgroundColor: Colors.HistoryCard?.[scheme] || '#1C1C1E', borderColor: 'rgba(255,255,255,0.05)' }]}>
                    <View style={styles.histCardTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TokenIcon symbol={item.symbol} size={25} />
                        <Text style={[styles.histSym, { color: Colors.TextPrimary[scheme] }]}>{item.symbol}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      <Text style={[styles.histType, { color: Colors.TextPrimary[scheme] }]}>{item.type}</Text>
                      <Text style={styles.histStatus}>{item.status}</Text>
                    </View>
                    <View style={[styles.obDivider, { backgroundColor: 'rgba(150, 150, 150, 0.3)', marginVertical: 10 }]} />
                    
                    <View style={styles.histDetailRow}><Text style={[styles.histDetailL, { color: Colors.TextPrimary[scheme] }]}>Time</Text><Text style={[styles.histDetailR, { color: Colors.TextPrimary[scheme] }]}>{item.time}</Text></View>
                    <View style={styles.histDetailRow}><Text style={[styles.histDetailL, { color: Colors.TextPrimary[scheme] }]}>Price</Text><Text style={[styles.histDetailR, { color: Colors.TextPrimary[scheme] }]}>{item.price}</Text></View>
                    
                    {item.type.toLowerCase() === 'sell' ? (
                      <View style={styles.histDetailRow}><Text style={[styles.histDetailL, { color: Colors.TextPrimary[scheme] }]}>Sell</Text><Text style={[styles.histDetailR, { color: Colors.AppRed?.[scheme] || '#FF3B30' }]}>{item.sellAmount}</Text></View>
                    ) : (
                      <View style={styles.histDetailRow}><Text style={[styles.histDetailL, { color: Colors.TextPrimary[scheme] }]}>Buy</Text><Text style={[styles.histDetailR, { color: Colors.AppGreen?.[scheme] || '#28CD41' }]}>{item.buyAmount}</Text></View>
                    )}
                    
                    <View style={styles.histDetailRow}>
                      <Text style={[styles.histDetailL, { color: Colors.TextPrimary[scheme] }]}>Gas Fee</Text>
                      <Text style={[styles.histDetailR, { color: Colors.TextPrimary[scheme] }]}>{item.gasFee}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
            <View style={{ height: 40 }} />
          </View>
        )}
      </ScrollView>

      {/* --- OVERLAYS & MODALS --- */}
      {showingInsufficientFundsAlert && (
        <View style={styles.alertOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowingInsufficientFundsAlert(false)} />
          <View style={[styles.alertBox, { backgroundColor: Colors.AppBackground[scheme] }]}>
             <Text style={[styles.alertTitle, { color: Colors.TextPrimary[scheme] }]}>Insufficient Balance</Text>
             <Text style={[styles.alertMsg, { color: Colors.TextPrimary[scheme] }]}>
               {currentSide === 'buy' ? `Your Available Balance is $${formatWithCommas(availableUSD)}.` : `Your Available Balance is ${selectedAsset.balanceAmount} ${selectedAsset.symbol}.`}
             </Text>
             <View style={{ height: 1, backgroundColor: 'rgba(150, 150, 150, 0.3)', width: '100%' }} />
             <TouchableOpacity style={styles.alertBtn} onPress={() => setShowingInsufficientFundsAlert(false)}>
               <Text style={[styles.alertBtnText, { color: Colors.TextPrimary[scheme] }]}>OK</Text>
             </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={showTokenSelector} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTokenSelector(false)}>
        <TokenSelectionModal marketVM={marketVM} selectedCurrency={selectedCurrency} onClose={() => setShowTokenSelector(false)} onSelect={(asset: AssetItem) => {
          setSelectedAsset(asset);
          setShowTokenSelector(false);
          setAmountInput(''); setTotalInput(''); setSliderValue(0);
        }} />
      </Modal>

      <Modal visible={showSlippageSettings} transparent={true} animationType="fade" onRequestClose={() => setShowSlippageSettings(false)}>
        <SlippageSettingsModal 
           onClose={() => setShowSlippageSettings(false)} 
           slippage={slippage} setSlippage={setSlippage}
           customSlippage={customSlippage} setCustomSlippage={setCustomSlippage}
           solanaTxMode={solanaTxMode} setSolanaTxMode={setSolanaTxMode}
        />
      </Modal>

      <Modal visible={!!selectedHistoryItem} transparent={true} animationType="slide" onRequestClose={() => setSelectedHistoryItem(null)}>
        <TransactionDetailModal item={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} />
      </Modal>

    </View>
    
  );
}

// 1. Refined Fluid Slider
const ThinSlider = ({ value, onValueChange, onDragStart, onDragEnd }: { value: number, onValueChange: (v:number)=>void, onDragStart?: () => void, onDragEnd?: () => void }) => {
  const [width, setWidth] = useState(1);
  const dots = [0.0, 0.25, 0.5, 0.75, 1.0];
  const pct = Math.min(Math.max(value / 100, 0), 1);
  const knobX = pct * width;

  const handleTouch = (evt: any) => {
    let localX = Math.max(0, Math.min(evt.nativeEvent.locationX, width));
    onValueChange((localX / width) * 100);
  };

  return (
    <View 
      style={styles.sliderContainer} 
      onLayout={(e) => setWidth(Math.max(e.nativeEvent.layout.width, 1))}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        handleTouch(e);
        if (onDragStart) onDragStart();
      }}
      onResponderMove={handleTouch}
      onResponderRelease={() => {
        if (onDragEnd) onDragEnd();
      }}
      onResponderTerminate={() => {
         if (onDragEnd) onDragEnd(); 
      }}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.sliderTrack, { backgroundColor: 'rgba(150,150,150,0.2)', top: 8 }]} />
        <View style={[styles.sliderTrack, { width: knobX, backgroundColor: 'rgba(150,150,150,0.6)', position: 'absolute', top: 8 }]} />
        {dots.map((d, i) => (
          <View key={i} style={[styles.sliderDotWrapper, { left: d * width - 2.5 }]}>
             <View style={[styles.sliderDot, { 
               backgroundColor: 'rgba(150,150,150,0.5)',
               borderColor: pct >= d ? 'rgba(150,150,150,0.6)' : 'rgba(150,150,150,0.5)' 
             }]} />
          </View>
        ))}
        <View style={[styles.sliderKnob, { left: knobX - 4.6 }]} />
      </View>
    </View>
  );
};

// 2. Market Style Token Selection Modal
const TokenSelectionModal = ({ marketVM, selectedCurrency, onClose, onSelect }: any) => {
  const { theme: scheme } = useTheme();
  const { allTokens, searchedTokens, getTokensForTab, searchTokenByAddress, isLoading, fiatRates } = marketVM;
  const [searchText, setSearchText] = useState('');
  const [selectedTab, setSelectedTab] = useState('All');
  const [sortField, setSortField] = useState<'none' | 'price' | 'change'>('none');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  const TABS = ['Favorites', 'All', 'Trending', 'Stocks', 'Gainers', 'Losers', 'RWA', 'AI', 'DeFi'];

useEffect(() => {
    const needle = searchText.trim();
    if (needle.length === 0) return;
    
    const delay = setTimeout(() => { searchTokenByAddress(needle); }, 600);
    return () => clearTimeout(delay);
  }, [searchText]);

  const handleSortTap = (field: 'price' | 'change') => {
    if (sortField === field) setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'));
    else { setSortField(field); setSortDirection('desc'); }
  };

  const list = useMemo(() => {
    // Ensure "All" tab directly maps to allTokens (including backend JSON) like iOS
    let result = selectedTab === 'All' ? allTokens : getTokensForTab(selectedTab);
    const needle = searchText.trim().toLowerCase();

    if (needle) {
      // Include contractAddress & address safely to catch JSON tokens without TS errors
      result = allTokens.filter((t:Token) => 
        t.name?.toLowerCase().includes(needle) || 
        t.symbol?.toLowerCase().includes(needle) ||
        t.id?.toLowerCase().includes(needle) ||
        (t as any).contractAddress?.toLowerCase().includes(needle) ||
        (t as any).address?.toLowerCase().includes(needle) ||
        t.deployments?.some(d => d.address?.toLowerCase().includes(needle))
      );

      result.sort((a: Token, b: Token) => {
        const aExact = a.symbol.toLowerCase() === needle || a.name.toLowerCase() === needle;
        const bExact = b.symbol.toLowerCase() === needle || b.name.toLowerCase() === needle;
        if (aExact !== bExact) return aExact ? -1 : 1;
        const liquidityA = Math.max(...(a.deployments?.map(d => d.liquidityUsd ?? 0) ?? [0]));
        const liquidityB = Math.max(...(b.deployments?.map(d => d.liquidityUsd ?? 0) ?? [0]));
        return liquidityB - liquidityA;
    });
      
      // Prevents duplicates if the searched API token is already in your JSON
      for (const st of searchedTokens) {
    if (!result.find((t: Token) => 
        t.id === st.id || 
        t.symbol.toLowerCase() === st.symbol.toLowerCase()
    )) {
        result.push(st);
    }
}
    }
    
    if (sortField !== 'none') {
      result = [...result].sort((a, b) => {
        const valA = sortField === 'price' ? (a.price ?? 0) : (a.changePercent ?? 0);
        const valB = sortField === 'price' ? (b.price ?? 0) : (b.changePercent ?? 0);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      });
    }
    return result;
  }, [searchText, selectedTab, sortField, sortDirection, getTokensForTab, allTokens, searchedTokens]);

  return (
    <View style={[styles.modalContainer, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <View style={styles.modalHeaderClose}>
        <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={24} color={Colors.TextSecondary[scheme]} /></TouchableOpacity>
      </View>
      
      <View style={[styles.tsSearchBox, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
        <Ionicons name="search" size={16} color={Colors.TextSecondary[scheme]} />
        <TextInput style={[styles.tsSearchInput, { color: Colors.TextPrimary[scheme] }]} placeholder="Search assets" placeholderTextColor={Colors.TextSecondary[scheme]} value={searchText} onChangeText={setSearchText} autoCapitalize="none" />
      </View>

      <View style={{ marginTop: 10, paddingHorizontal: 11 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 15, paddingBottom: 0, paddingTop: 4 }}>
           {TABS.map(t => {
             const isSelected = selectedTab === t;
             return (
               <TouchableOpacity key={t} onPress={() => setSelectedTab(t)} style={{ alignItems: 'center', gap: 2 }}>
                 <Text style={[styles.tsTabText, { color: isSelected ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }]}>{t}</Text>
                 <View style={[styles.tsTabIndicator, { backgroundColor: isSelected ? Colors.TextPrimary[scheme] : 'transparent' }]} />
               </TouchableOpacity>
             )
           })}
        </ScrollView>
      </View>
      <View style={[styles.fullDivider, { backgroundColor: 'rgba(150, 150, 150, 0.3)', marginTop: -1.5, marginBottom: 10 }]} />

      <View style={styles.tsSortHeader}>
        <Text style={[styles.tsSortLabelLeft, { color: Colors.TextSecondary[scheme] }]}>Name</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => handleSortTap('price')} style={{ width: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
          <Text style={[styles.tsSortLabelRight, { color: Colors.TextSecondary[scheme] }]}>Price</Text>
          <View style={{ alignItems: 'center' }}>
             <Ionicons name="caret-up" size={10} color={sortField === 'price' && sortDirection === 'asc' ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)'} style={{ marginBottom: -4 }} />
             <Ionicons name="caret-down" size={10} color={sortField === 'price' && sortDirection === 'desc' ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)'} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleSortTap('change')} style={{ width: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
          <Text style={[styles.tsSortLabelRight, { color: Colors.TextSecondary[scheme] }]}>24h %</Text>
          <View style={{ alignItems: 'center' }}>
             <Ionicons name="caret-up" size={10} color={sortField === 'change' && sortDirection === 'asc' ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)'} style={{ marginBottom: -4 }} />
             <Ionicons name="caret-down" size={10} color={sortField === 'change' && sortDirection === 'desc' ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)'} />
          </View>
        </TouchableOpacity>
      </View>

      <FlatList 
        data={list}
        keyExtractor={(item:Token) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        initialNumToRender={20}      
          maxToRenderPerBatch={10}    
          windowSize={10}
        ListEmptyComponent={() => (
           <View style={{ alignItems: 'center', marginTop: 30 }}>
             {isLoading ? <ActivityIndicator size="small" color={Colors.TextPrimary[scheme]} /> : <Text style={{ fontSize: 16, color: Colors.TextSecondary[scheme] }}>No tokens found</Text>}
           </View>
        )}
        renderItem={({item}) => {
          const change = item.changePercent ?? 0;
          
          const priceUsd = item.price ?? 0;
          const localRate = fiatRates?.[selectedCurrency] || 1; 
          const localSymbol = CURRENCY_SYMBOLS[selectedCurrency] || '$';
          const convertedPrice = priceUsd * localRate;
          const maxDecimals = priceUsd >= 1000 ? 2 : (priceUsd >= 1 ? 4 : 8);
          const priceStr = new Intl.NumberFormat('en-US', {
              style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: maxDecimals,
          }).format(priceUsd);

          return (
            <TouchableOpacity style={styles.tsTokenRow} onPress={() => {
              onSelect({
                id: item.id, name: item.name, symbol: item.symbol, 
                price: priceStr, 
                rawPrice: priceUsd,
                change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, 
                isPositive: change >= 0, 
                balanceValue: '$0.00', balanceAmount: '0.00', iconName: item.logo
              });
            }}>
              <TokenIcon symbol={item.symbol} logoUrl={item.logo} size={38} />
              <View style={{ justifyContent: 'center', gap: 2, flex: 1, paddingRight: 10, marginLeft: 8 }}>
                <Text 
                  style={[styles.tsTokenName, { color: Colors.TextPrimary[scheme] }]} 
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.75}
                >
                  {item.name}
                </Text>
                <Text style={[styles.tsTokenSym, { color: Colors.TextSecondary[scheme] }]}>
                  {item.symbol.toUpperCase()}
                </Text>
              </View>
              
              <View style={{ 
                alignItems: 'flex-end', 
                paddingRight: 15, 
                justifyContent: 'center', 
                gap: selectedCurrency === 'None' ? 0 : 2.5
              }}>
                <SmartPriceText 
                  value={priceUsd} 
                  fontSize={16} 
                  fontFamily="Inter-SemiBold" 
                  color={Colors.TextPrimary[scheme]} 
                  symbol="$"
                />
              
                {selectedCurrency !== 'None' && (
                  <SmartPriceText 
                    value={convertedPrice} 
                    fontSize={13} 
                    fontFamily="Inter-Medium" 
                    color={Colors.TextSecondary[scheme]}
                    symbol={localSymbol} 
                  />
                )}
              </View>
              <View style={[styles.tsPercentBadge, { backgroundColor: change >= 0 ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30') }]}>
                <Text 
                  style={styles.tsPercentText} 
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.5}
                >
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                </Text>
            </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  );
};

// 3. Transaction Detail Modal with Functional Links
const TransactionDetailModal = ({ item, onClose }: any) => {
  const { theme: scheme } = useTheme();
  const isDark = scheme === 'dark';
  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(150,150,150,0.2)';

  if (!item) return null;

  // Exact 16pt Medium font from Swift detailRow
  const detailRow = (label: string, value: string, color?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text style={{ fontSize: 16, fontFamily: 'Inter-SemiBold', color: 'gray' }}>{label}</Text>
      <Text style={{ fontSize: 16, fontFamily: 'Inter-SemiBold', color: color || Colors.TextPrimary[scheme] }}>{value}</Text>
    </View>
  );

  // Exact 16pt Regular font from Swift hashRow
  const hashRow = (label: string, network: string, hash: string) => {
    const short = hash.length > 10 ? `${hash.substring(0,6)}...${hash.substring(hash.length-4)}` : hash;
    const url = getExplorerURL(network, hash);

    const content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 16, fontFamily: 'Inter-Regular', color: 'gray' }}>{short}</Text>
        <Ionicons name="open-outline" size={15} color="gray" />
      </View>
    );

    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: 'gray' }}>{label}</Text>
        {url ? (
          <TouchableOpacity onPress={() => Linking.openURL(url)} activeOpacity={0.7}>
            {content}
          </TouchableOpacity>
        ) : (
          content
        )}
      </View>
    );
  };

  const CustomDivider = ({ marginTop }: { marginTop?: number }) => (
    <View style={{ 
      height: 1, 
      backgroundColor: dividerColor, 
      marginBottom: 18, 
      marginTop: marginTop !== undefined ? marginTop : 14
    }} />
  );

  return (
    <View style={styles.sheetOverlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      <View style={[styles.sheetContent, { backgroundColor: Colors.AppBackground[scheme] }]}>
        <View style={styles.sheetHandle} />
        
        <View style={styles.sheetHeader}>
           <Text style={[styles.sheetTitle, { color: Colors.TextPrimary[scheme] }]}>Transaction Details</Text>
           <TouchableOpacity onPress={onClose} style={{ position: 'absolute', right: 20 }}>
              <Ionicons name="close-circle" size={24} color={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"} />
           </TouchableOpacity>
        </View>

        <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
           <View style={{ paddingBottom: 50, paddingTop: 5 }}>
             
             {/* TOP CARD DETAILS */}
             <View style={{ backgroundColor: Colors.AppBackground[scheme] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                   <TokenIcon symbol={item.symbol} size={27} />
                   <Text style={{ fontSize: 20, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme], marginLeft: 8 }}>{item.symbol}</Text>
                   
                   <View style={{ flex: 1 }} />
                   
                   <Text style={{ fontSize: 18, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme], marginRight: 10 }}>{item.type}</Text>
                   <Text style={{ fontSize: 15, fontFamily: 'Inter-SemiBold', color: (Colors.AppGreen?.[scheme] || '#28CD41'), paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(40,205,65,0.2)', borderRadius: 15 }}>
                      {item.status}
                   </Text>
                </View>
                
                <View style={{ height: 1, backgroundColor: dividerColor, marginBottom: 15 }} />
                
                {detailRow('Time', item.time)}
                {detailRow('Price', item.price)}
                
                {item.type.toLowerCase() === 'sell' ? (
                  <>
                    {detailRow('Sell', item.sellAmount, Colors.AppRed?.[scheme] || '#FF3B30')}
                    {detailRow('Received', item.buyAmount, Colors.AppGreen?.[scheme] || '#28CD41')}
                  </>
                ) : (
                  <>
                    {detailRow('Buy', item.buyAmount, Colors.AppGreen?.[scheme] || '#28CD41')}
                    {item.sellAmount.trim() !== '' && detailRow('Using', item.sellAmount, Colors.AppRed?.[scheme] || '#FF3B30')}
                  </>
                )}
                <View style={{ marginBottom: 25 }}> 
                  {detailRow('Gas Fee', item.gasFee)}
                  {item.appFee ? detailRow('App Fee', item.appFee) : null}
                  {item.lpFee ? detailRow('LP Fee', item.lpFee) : null}
                </View>
             </View>

             {/* HASHES LIST WITH PROPER DIVIDERS */}
             <View style={{ flexDirection: 'column' }}>
                 {item.targetTx && (
                   <View>
                     <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
                       <Text style={{ fontSize: 17, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>Target Tx Hash on</Text>
                       <Text style={{ fontSize: 17, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>{item.targetTx.networkName}</Text>
                     </View>
                     {hashRow('Tx Hash', item.targetTx.networkName, item.targetTx.txHash)}
                     {(item.sourceTxs?.length > 0) && <CustomDivider />}
                   </View>
                 )}

                 {item.sourceTxs?.map((source: any, idx: number) => (
                   <View key={source.id}>
                     <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
                       <Text style={{ fontSize: 17, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>From Tx Hash on</Text>
                       <Text style={{ fontSize: 17, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>{source.networkName}</Text>
                     </View>
                     {hashRow('Tx Hash', source.networkName, source.txHash)}
                     
                     {idx !== item.sourceTxs.length - 1 && <CustomDivider />}
                   </View>
                 ))}
             </View>

           </View>
        </ScrollView>
      </View>
    </View>
  );
};

// 4. Perfected Slippage Settings Modal
const SlippageSettingsModal = ({ onClose, slippage, setSlippage, customSlippage, setCustomSlippage, solanaTxMode, setSolanaTxMode }: any) => {
  const { theme: scheme } = useTheme();
  const primaryColor = Colors.TextPrimary[scheme] || '#FFFFFF';

  const CustomBtn = ({ title, isSelected, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={[styles.slBtn, { 
      backgroundColor: isSelected ? withAlpha(primaryColor, 0.1) : 'transparent',
      borderColor: withAlpha(primaryColor, 0.15), // Border is always active
      borderWidth: 1
    }]}>
      <Text style={[styles.slBtnText, { color: isSelected ? primaryColor : 'gray' }]}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.modalContainerFull}>
      <View style={[styles.modalBg, { backgroundColor: Colors.AppBackground[scheme] }]}>
        <View style={styles.slHeader}>
          <TouchableOpacity onPress={onClose}><Ionicons name="arrow-back" size={24} color={primaryColor} /></TouchableOpacity>
          <Text style={[styles.slTitle, { color: primaryColor }]}>Slippage Settings</Text>
        </View>

        <View style={styles.slSection}>
          <Text style={[styles.slSecTitle, { color: primaryColor }]}>Slippage Tolerance</Text>
          <Text style={styles.slSecSub}>Sets the allowed price difference during execution.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}><CustomBtn title="Auto" isSelected={slippage === null && !customSlippage} onPress={()=>{setSlippage(null); setCustomSlippage('');}} /></View>
            <View style={{ flex: 1 }}><CustomBtn title="0.5%" isSelected={slippage === 0.5} onPress={()=>{setSlippage(0.5); setCustomSlippage('');}} /></View>
            <View style={{ flex: 1 }}><CustomBtn title="1%" isSelected={slippage === 1.0} onPress={()=>{setSlippage(1.0); setCustomSlippage('');}} /></View>
            <View style={[styles.slCustomWrap, { 
              backgroundColor: customSlippage ? withAlpha(primaryColor, 0.1) : 'transparent', 
              borderColor: withAlpha(primaryColor, 0.15), // Border is always active
              borderWidth: 1
            }]}>
               <TextInput style={[styles.slCustomInput, { color: primaryColor }]} keyboardType="decimal-pad" value={customSlippage} onChangeText={t => {
                 let clean = cleanDecimalInput(t);
                 if(parseFloat(clean) > 100) clean = '100';
                 setCustomSlippage(clean);
                 setSlippage(parseFloat(clean) || null);
               }} />
               <Text style={styles.slCustomPct}> %</Text>
            </View>
          </View>
        </View>

        <View style={styles.slSection}>
          <Text style={[styles.slSecTitle, { color: primaryColor }]}>Solana TX mode</Text>
          <Text style={styles.slSecSub}>How your swap is sent to the network.</Text>
          <View style={[styles.slTxWrap, { backgroundColor: withAlpha(primaryColor, 0.05) }]}>
            {['Auto', 'Jito', 'Classic'].map(m => (
              <TouchableOpacity key={m} onPress={()=>setSolanaTxMode(m)} style={[styles.slTxBtn, { backgroundColor: solanaTxMode === m ? withAlpha(primaryColor, 0.15) : 'transparent' }]}>
                <Text style={[styles.slTxBtnText, { color: solanaTxMode === m ? primaryColor : 'gray' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ flex: 1 }} />
        
        <View style={{ flexDirection: 'row', gap: 12, paddingBottom: 50 }}>
          <TouchableOpacity style={[styles.slActionBtn, { backgroundColor: withAlpha(primaryColor, 0.15) }]} onPress={()=>{setSlippage(null); setCustomSlippage(''); setSolanaTxMode('Auto');}}>
            <Text style={[styles.slActionText, { color: Colors.TextSecondary[scheme] }]}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.slActionBtn, { backgroundColor: primaryColor }]} onPress={onClose}>
            <Text style={[styles.slActionText, { color: Colors.AppBackground[scheme] }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};


// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Layout.horizontalPadding, paddingTop: 10, paddingBottom: 9, zIndex: 1 },
  tokenSelectBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenSelectTextWrap: { flexDirection: 'column' },
  tokenSelectSymbol: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  tokenSelectChange: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  headerRightIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { padding: 8 },
  customIcon: { width: 25, height: 25, resizeMode: 'contain' },
  
  topSection: { 
    flexDirection: 'row', 
    paddingHorizontal: Layout.horizontalPadding, 
    paddingTop: 0, 
    ...Platform.select({
      ios: { height: 350 },
      android: { height: 365 } 
    })
  },
  formColumn: { flex: 0.60, marginRight: Layout.columnSpacing, justifyContent: 'flex-start', gap: Layout.formSpacing },
  orderbookColumn: { flex: 0.40 },
  
  segmentControl: { flexDirection: 'row', borderRadius: Layout.cornerRadius, overflow: 'hidden' },
  segmentBtn: { flex: 1, paddingVertical: 9.5, alignItems: 'center', borderRadius: Layout.cornerRadius },
  segmentBtnText: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  
  marketPill: { height: Layout.pillHeight, borderRadius: Layout.cornerRadius, justifyContent: 'center', alignItems: 'center' },
  marketPillText: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  
  inputPill: { height: Layout.pillHeight, borderRadius: Layout.cornerRadius, justifyContent: 'center', alignItems: 'center' },
  inputText: { fontSize: 17, fontFamily: 'Inter-Regular' },
  actualInput: { fontSize: 17, fontFamily: 'Inter-Regular', width: '100%', textAlign: 'center', padding: 0 },
  
  infoBox: { paddingHorizontal: 3, gap: 3 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 14, fontFamily: 'Inter-Medium' },
  infoVal: { fontSize: 14, fontFamily: 'Inter-Medium' },
  
  actionBtn: { height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: -4 },
  actionBtnText: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Inter-SemiBold', includeFontPadding: false, textAlignVertical: 'center' },
  
  orderbookContainer: { flex: 1, backgroundColor: 'transparent' },
  obHeader: { paddingVertical: 7, borderRadius: 8, alignItems: 'center', marginHorizontal: 2.8, marginTop: 0 },
  obDivider: { height: 1, opacity: 0.25, marginVertical: 6 },
  obLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 },
  obLabelLeft: { fontSize: 11, fontFamily: 'Inter-SemiBold' },
  obLabelRight: { fontSize: 11, fontFamily: 'Inter-SemiBold' },
  obRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 4, 
    ...Platform.select({
      ios: { paddingVertical: 4.5 },
      android: { paddingVertical: 3.4 } 
    })
  },
  obPrice: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  obAmt: { fontSize: 13, fontFamily: 'Inter-Regular' },
  
  bottomTabs: { flexDirection: 'row', paddingHorizontal: Layout.horizontalPadding, paddingLeft: Layout.horizontalPadding - 0.84, marginTop: 4, gap: 20 },
  tabBtn: { alignItems: 'center', paddingHorizontal: 0.5, gap: 3 },
  tabBtnText: { fontSize: 18, fontFamily: 'Inter-SemiBold', includeFontPadding: false, textAlignVertical: 'center',},
  tabIndicator: { height: 2, width: 15, borderRadius: 100, marginTop: 3 },
  fullDivider: { height: 1 },
  
  portfolioContent: { paddingBottom: 0 },
  portHeader: { flexDirection: 'row', paddingHorizontal: Layout.horizontalPadding - 0, paddingTop: 8, paddingBottom: 4 }, 
  portLabel: { fontSize: 13.2, fontFamily: 'Inter-Regular', marginLeft: -0.6 },
  portBalWrap: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4 },
  sortArrows: { flexDirection: 'column' },
  portRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 13.2, paddingVertical: 8 },
  portRowLeft: { flexDirection: 'row', alignItems: 'center' },
  portName: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  portSym: { fontSize: 14.5, fontFamily: 'Inter-Medium' },
  portRowRight: { alignItems: 'flex-end' },
  portVal: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  portAmt: { fontSize: 14.5, fontFamily: 'Inter-Medium' },
  
  historyContent: { paddingHorizontal: Layout.horizontalPadding, paddingTop: 14, gap: 12 },
  emptyHist: { fontSize: 16, textAlign: 'center', marginTop: 50 },
  histCard: { padding: 14, borderRadius: 10, borderWidth: 1 },
  histCardTop: { flexDirection: 'row', alignItems: 'center' },
  histSym: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  histType: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginRight: 10 },
  histStatus: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#28CD41', backgroundColor: 'rgba(40,205,65,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15 },
  histDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  histDetailL: { fontSize: 16, fontFamily: 'Inter-Medium' },
  histDetailR: { fontSize: 16, fontFamily: 'Inter-Medium' },
  
  alertOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  alertBox: { width: 270, borderRadius: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 15, shadowOffset: {width:0, height:5} },
  alertTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold', marginTop: 20 },
  alertMsg: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center', marginHorizontal: 15, marginTop: 8, marginBottom: 15 },
  alertBtn: { height: 44, width: '100%', justifyContent: 'center', alignItems: 'center' },
  alertBtnText: { fontSize: 17, fontFamily: 'Inter-Bold' },
  
  sliderContainer: { height: 20, justifyContent: 'center', marginHorizontal: 5, marginVertical: -8 },
  sliderTrack: { height: 4, borderRadius: 2 },
  sliderDotWrapper: { position: 'absolute', width: 5, height: 5, justifyContent: 'center', alignItems: 'center', top: 7.5 },
  sliderDot: { width: 5, height: 5, borderRadius: 2.5, borderWidth: 0.7 },
  sliderKnob: { position: 'absolute', top: 5.4, width: 9.2, height: 9.2, borderRadius: 4.6, backgroundColor: 'rgba(150,150,150,0.55)', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 1, shadowOffset: {width:0, height:1} },
  
  // Modals
  modalContainer: { flex: 1 },
  modalContainerFull: { flex: 1 },
  modalBg: { flex: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 30 },
  modalHeaderClose: { alignItems: 'flex-end', padding: 15 },
  tsSearchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 11, borderRadius: 11, paddingHorizontal: 12, height: 42 },
  tsSearchInput: { flex: 1, marginLeft: 10, fontSize: 16, fontFamily: 'Inter-Medium' },
  tsTabText: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  tsTabIndicator: { height: 2, width: 20, borderRadius: 2, marginTop: 5 },
  tsSortHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingBottom: 4, paddingTop: 4 },
  tsSortLabelLeft: { fontSize: 13, fontFamily: 'Inter-SemiBold', paddingLeft: 0.65 },
  tsSortLabelRight: { fontSize: 13, fontFamily: 'Inter-Medium' },
  tsTokenRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8 },
  tsTokenName: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  tsTokenSym: { fontSize: 14, fontFamily: 'Inter-Medium' },
  tsPercentBadge: { width: 75, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tsPercentText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter-SemiBold' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', minHeight: 400 },
  sheetHandle: { width: 40, height: 4, backgroundColor: 'gray', borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 15 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  tdCard: { padding: 5, marginTop: 10 },
  tdMainSym: { fontSize: 20, fontFamily: 'Inter-SemiBold', marginLeft: 8 },
  tdMainType: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginRight: 10 },
  tdRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  tdLabel: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  tdVal: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  tdNetworkTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold' },

  slHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  slTitle: { fontSize: 20, fontFamily: 'Inter-Bold', position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: -1 },
  slSection: { marginBottom: 30 },
  slSecTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  slSecSub: { fontSize: 14, color: 'gray' },
  slBtn: { height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginHorizontal: 2 },
  slBtnText: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  slCustomWrap: { flex: 1.5, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, marginHorizontal: 2 },
  slCustomInput: { flex: 1, textAlign: 'right', fontSize: 15, fontFamily: 'Inter-SemiBold', padding: 0 },
  slCustomPct: { fontSize: 15, fontFamily: 'Inter-SemiBold', color: 'gray' },
  slTxWrap: { flexDirection: 'row', borderRadius: 16, padding: 4, marginTop: 12 },
  slTxBtn: { flex: 1, height: 45, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  slTxBtnText: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  slActionBtn: { flex: 1, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  slActionText: { fontSize: 17, fontFamily: 'Inter-Bold' }
});