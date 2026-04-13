import React, { useState, useMemo, useEffect } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  Platform,
  Dimensions,
  ActivityIndicator,
  Modal
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; 
import Svg, { Path } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { WithdrawView, RightSlideModal, DepositView } from './wallet';
import { Colors } from '../../theme/colors'; 
import BtcIcon from '../../assets/Images/btc.svg';
import { TokenIcon } from '../../components/TokenIcon';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Components & Logic ---
import { SmartPriceText } from '../../components/SmartPriceText';
import useMarketViewModel from '../../logic/useMarketViewModel';
import useWalletViewModel from '../../logic/useWalletViewModel';

enum HomeFilter {
  Favorites = "Favorites",
  All = "All",
  Trending = "Trending",
  Gainers = "Gainers",
  Losers = "Losers",
}

// --- HELPER FUNCTIONS ---
const formatSmartValue = (value: number) => {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ScannerOverlayView component completely to this:
const ScannerOverlayView = ({ visible, onClose, onScan }: { visible: boolean, onClose: () => void, onScan: (data: string) => void }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false); // Reset so it can scan again next time
      if (!permission?.granted) requestPermission();
    }
  }, [visible]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
  
    const cleanAddress = data.replace(/^.*:/, ''); 
    const isEVM = /^0x[a-fA-F0-9]{40}$/.test(cleanAddress);
    const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanAddress);

    if (!isEVM && !isSolana) {
      return; 
    }

    setScanned(true);
    onScan(cleanAddress);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={{ flex: 1, backgroundColor: '#0A0A0C' }}>
        <StatusBar style="light" />
        
        {/* LIVE CAMERA RENDER */}
        {permission?.granted && (
          <CameraView 
            style={StyleSheet.absoluteFillObject} 
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
        )}

        {/* UI OVERLAY (Wraps your existing UI to sit on top of the camera) */}
        <View style={{ flex: 1, justifyContent: 'space-between', zIndex: 10 }}>
          {/* Top Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 30, paddingBottom: 15 }}>
            <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={20} color="#FFF" />
            </TouchableOpacity>
            <Text style={{ color: '#FFF', fontSize: 18, fontFamily: 'Inter-SemiBold' }}>Scan</Text>
            <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Central Frame & Text */}
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            {/* Target Brackets */}
            <View style={{ width: 260, height: 260, position: 'relative', marginBottom: 50 }}>
              <View style={{ position: 'absolute', top: 0, left: 0, width: 45, height: 45, borderColor: '#FFF', borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 16 }} />
              <View style={{ position: 'absolute', top: 0, right: 0, width: 45, height: 45, borderColor: '#FFF', borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 16 }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, width: 45, height: 45, borderColor: '#FFF', borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 16 }} />
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 45, height: 45, borderColor: '#FFF', borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 16 }} />
            </View>
            <Text style={{ color: '#FFF', fontSize: 20, fontFamily: 'Inter-SemiBold', marginBottom: 12 }}>Scan an Address</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, fontFamily: 'Inter-Regular' }}>Position the QR code within the frame</Text>
          </View>

          {/* Bottom Close Button */}
          <View style={{ paddingBottom: Platform.OS === 'ios' ? 50 : 30, alignItems: 'center' }}>
            <TouchableOpacity onPress={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 14, paddingHorizontal: 36, borderRadius: 25 }}>
              <Text style={{ color: '#FFF', fontSize: 16, fontFamily: 'Inter-SemiBold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// 1. Fear & Greed Card
const FearAndGreedCard = ({ score }: { score: number }) => {
  const { theme: scheme } = useTheme();
  const segmentColors = ['#FF3B30', '#FF8F00', '#FFCC00', 'rgba(50, 215, 75, 0.8)', '#28CD41']; 
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 18 - 8) / 1.97; 
  const w = cardWidth - 30; 
  const h = 97; 
  const radius = (w / 2) - 10; 
  const centerX = w / 2.06;
  const centerY = h - 20;

  const createArc = (startAngle: number, endAngle: number) => {
    const startRad = (Math.PI / 180) * startAngle;
    const endRad = (Math.PI / 180) * endAngle;
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);
    return `M${x1},${y1} A${radius},${radius} 0 0,1 ${x2},${y2}`;
  };

  const getSentimentLabel = (s: number) => {
    if (s < 25) return "Extreme Fear";
    if (s < 45) return "Fear";
    if (s < 55) return "Neutral";
    if (s < 75) return "Greed";
    return "Extreme Greed";
  };

  const clampedScore = Math.min(Math.max(score, 0), 100);
  const indicatorAngle = 180 + (clampedScore / 100) * 180;
  const rad = (indicatorAngle * Math.PI) / 180;
  const thumbX = centerX + radius * Math.cos(rad);
  const thumbY = centerY + radius * Math.sin(rad);

  return (
    <View style={[styles.card, { backgroundColor: Colors.CardBackground[scheme], flex: 1, overflow: 'visible' }]}>
      <Text style={{ fontSize: 16, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme], marginBottom: 12 }}>Fear & Greed</Text>
      <View style={{ height: h, width: w }}>
        <Svg height={h} width={w} style={{ position: 'absolute' }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const gap = 6; 
            const segmentArc = (180 - 4 * gap) / 5;
            const start = 180 + i * (segmentArc + gap);
            const end = start + segmentArc;
            return (
              <Path key={i} d={createArc(start, end)} stroke={segmentColors[i]} strokeWidth="10" strokeLinecap="round" fill="none" />
            );
          })}
        </Svg>
        <View style={{ position: 'absolute', left: thumbX - 9, top: thumbY - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 }} />
        <View style={{ position: 'absolute', top: centerY - (radius * 0.25) - 22, width: '100%', alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontFamily: 'Inter-Bold', color: Colors.TextPrimary[scheme] }}>{Math.floor(score)}</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: Colors.TextSecondary[scheme] }}>{getSentimentLabel(score)}</Text>
        </View>
      </View>
    </View>
  );
};

// 2. Dominance Card
const DominanceCardView = ({ btc, eth }: { btc: number, eth: number }) => {
  const { theme: scheme } = useTheme();

  return (
    <View style={[
      styles.card, 
      { 
        backgroundColor: Colors.CardBackground[scheme], 
        flex: 1,
        padding: 14, 
      }
    ]}>
      <View style={{ flexDirection: 'column', gap: 12 }}>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BtcIcon width={20} height={20} />
          <Text style={{ fontSize: 16.5, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>Dominance</Text>
        </View>
        
        <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: Colors.TextPrimary[scheme] }}>{btc.toFixed(2)}%</Text>
        
        <View style={{ 
          height: StyleSheet.hairlineWidth, 
          backgroundColor: Colors.DividerColor?.[scheme] || '#2C2C35'
        }} />
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../assets/Images/eth.png')} style={{ width: 20, height: 20 }} resizeMode="contain" />
          <Text style={{ fontSize: 16.5, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>Dominance</Text>
        </View>
        
        <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: Colors.TextPrimary[scheme] }}>{eth.toFixed(2)}%</Text>
        
      </View>
    </View>
  );
};

// 3. Balance Card
const BalanceCardView = ({ onSendPress, onReceivePress }: { onSendPress: () => void, onReceivePress: () => void }) => {
  const { theme: scheme } = useTheme();
  const isDark = scheme === 'dark';
  const defaultBorder = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
  
  // --- NEW: Fetch real wallet data ---
  const { assets } = useWalletViewModel();
  const totalBalance = assets.reduce((sum, a) => sum + a.value, 0);
  const todayPNL = assets.reduce((sum, a) => sum + a.dayChangeUSD, 0);
  const todayPNLPercent = totalBalance - todayPNL > 0 ? (todayPNL / (totalBalance - todayPNL)) * 100 : 0;

  const isPositive = todayPNL >= 0;
  const pnlColor = isPositive ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30');

  return (
    <View style={[styles.card, styles.balanceCard, { backgroundColor: Colors.CardBackground[scheme] }]}>
      <Text style={[styles.balanceLabel, { color: Colors.TextSecondary[scheme] }]}>Total Balance (USD)</Text>
      <Text style={[styles.balanceValue, { color: Colors.TextPrimary[scheme] }]}>${formatSmartValue(totalBalance)}</Text>
      <View style={[styles.row, { justifyContent: 'center', marginTop: 5 }]}>
        <Text style={[styles.pnlLabel, { color: Colors.TextSecondary[scheme] }]}>Today's PnL </Text>
        <Text style={{ color: pnlColor, fontSize: 15, fontFamily: 'Inter-Medium' }}>{isPositive ? '+' : ''}${formatSmartValue(todayPNL)} ({isPositive ? '+' : ''}{todayPNLPercent.toFixed(2)}%)</Text>
      </View>
      <View style={styles.actionButtonsContainer}>
        
        {/* Send Button */}
        <TouchableOpacity 
          style={[styles.actionButton, { borderWidth: 1, borderColor: defaultBorder }]}
          onPress={onSendPress} 
        >
          <Image 
            source={require('../../assets/Buttons/Send.png')} 
            style={{ width: 28, height: 28, marginLeft: -7, tintColor: Colors.TextPrimary[scheme] }} 
            resizeMode="contain" 
          />
          <Text style={[styles.actionButtonText, { color: Colors.TextPrimary[scheme] }]}>Send</Text>
        </TouchableOpacity>

        {/* Receive Button - UPDATE THIS onPress */}
        <TouchableOpacity 
          style={[styles.actionButton, { borderWidth: 1, borderColor: defaultBorder }]}
          onPress={onReceivePress} // <--- Call the new prop here
        >
          <Image 
            source={require('../../assets/Buttons/Receive.png')} 
            style={{ width: 28, height: 28, marginLeft: -4, tintColor: Colors.TextPrimary[scheme] }} 
            resizeMode="contain" 
          />
          <Text style={[styles.actionButtonText, { color: Colors.TextPrimary[scheme] }]}>Receive</Text>
        </TouchableOpacity>
        
      </View>
    </View>
  );
};

// --- MAIN SCREEN ---
export default function HomeScreen() {
  const router = useRouter();
  const { theme: scheme } = useTheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const [profileImg, setProfileImg] = useState<string | null>(null);
  const [isShowingScanner, setIsShowingScanner] = useState(false);

  const [isShowingWithdraw, setIsShowingWithdraw] = useState(false);
  const [isShowingDeposit, setIsShowingDeposit] = useState(false);
  const { assets } = useWalletViewModel();

  const [scannedAddress, setScannedAddress] = useState("");

  const handleScanSuccess = (address: string) => {
    setIsShowingScanner(false);
    setScannedAddress(address);     
    setIsShowingWithdraw(true);    
  };

  useFocusEffect(
    React.useCallback(() => {
      const loadProfileImage = async () => {
        try {
          const savedImage = await AsyncStorage.getItem('userProfileImage');
          setProfileImg(savedImage);
        } catch (e) {
          console.error("Failed to load profile image", e);
        }
      };
      loadProfileImage();
    }, [])
  );

  const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', AUD: 'A$', INR: '₹', CAD: 'C$', JPY: '¥', CNY: '¥', GBP: '£', SGD: 'S$'
  };

  const [selectedCurrency, setSelectedCurrency] = useState<string>('None'); 
  
  const {
    allTokens,
    searchedTokens,
    setSearchedTokens,
    isLoading,
    fearAndGreedScore,
    btcDominance,
    ethDominance,
    getTokensForTab,
    searchTokenByAddress,
    fiatRates
  } = useMarketViewModel();

  useFocusEffect(
    React.useCallback(() => {
     const loadCurrency = async () => {
       const storedCurrency = await AsyncStorage.getItem('selectedCurrency');
       if (storedCurrency) setSelectedCurrency(storedCurrency);
     };
     loadCurrency();
   }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      setSearchText('');
      setSearchedTokens([]);
      return () => {
      };
    }, [])
  );

  const [searchText, setSearchText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<HomeFilter>(HomeFilter.All);
  
  useEffect(() => {
    const needle = searchText.trim();
    if (needle.length === 0) {
      setSearchedTokens([]);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      searchTokenByAddress(needle);
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [searchText]);
  
  const filteredTokens = useMemo(() => {
    let list = getTokensForTab(selectedFilter as any);
    const needle = searchText.trim().toLowerCase();

    if (needle.length > 0) {
      list = list.filter(t => 
        t.name?.toLowerCase().includes(needle) || 
        t.symbol?.toLowerCase().includes(needle) ||
        t.id?.toLowerCase().includes(needle) ||
        (t as any).contractAddress?.toLowerCase().includes(needle) || 
        (t as any).address?.toLowerCase().includes(needle) ||         
        t.deployments?.some(d => d.address?.toLowerCase().includes(needle))
      );

      list.sort((a, b) => {
        const aExact = a.symbol.toLowerCase() === needle || a.name.toLowerCase() === needle;
        const bExact = b.symbol.toLowerCase() === needle || b.name.toLowerCase() === needle;
        if (aExact !== bExact) return aExact ? -1 : 1;
        const liquidityA = Math.max(...(a.deployments?.map(d => d.liquidityUsd ?? 0) ?? [0]));
        const liquidityB = Math.max(...(b.deployments?.map(d => d.liquidityUsd ?? 0) ?? [0]));
        return liquidityB - liquidityA;
    });

      for (const st of searchedTokens) {
    if (!list.find(t => 
        t.id === st.id || 
        t.symbol.toLowerCase() === st.symbol.toLowerCase()
    )) {
        list.push(st);
    }
}
    }
    
    return list;
  }, [searchText, selectedFilter, getTokensForTab, searchedTokens, allTokens]);

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent={true} />
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={[
          styles.contentContainer, 
          { 
            // Fixed dynamic padding logic:
            paddingTop: Platform.OS === 'android' ? Math.max(insets.top + 5, 45) : Math.max(insets.top + 0, 20),
            paddingBottom: 0 // Kept scrollable breathing room at bottom
          }
        ]}
      >
        
        <View style={styles.topBar}>
          <TouchableOpacity 
            onPress={() => router.push('/settings')} 
            activeOpacity={0.8}
          >
            <Image 
              source={require('../../assets/Fluxor.png')} 
              style={styles.profileCircle} 
            />
          </TouchableOpacity>

          <View style={[styles.searchContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.055)' }]}>
            <TextInput 
              style={[styles.searchInput, { color: Colors.TextPrimary[scheme] }]} 
              placeholder="Search Token or Address" 
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)'}
              value={searchText} 
              onChangeText={setSearchText} 
              autoCapitalize="none" 
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Ionicons name="close-circle" size={18} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity 
            style={[styles.iconButton, { backgroundColor: Colors.CardBackground[scheme] }]}
            onPress={() => setIsShowingScanner(true)}
          >
            <Image 
              source={require('../../assets/Buttons/ScanIcon.png')} 
              style={{ width: 30, height: 30, tintColor: Colors.TextPrimary[scheme] }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      
        <BalanceCardView 
        onSendPress={() => setIsShowingWithdraw(true)}
        onReceivePress={() => setIsShowingDeposit(true)}
        />
        
        <View style={styles.metricsRow}>
          <View style={{ flex: 1 }}>
            <FearAndGreedCard score={fearAndGreedScore} />
          </View>
          <View style={{ flex: 1 }}>
            <DominanceCardView btc={btcDominance} eth={ethDominance} />
          </View>
        </View>
        
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 15 }}>
              {Object.values(HomeFilter).map((filter) => {
                const isSelected = selectedFilter === filter;
                return (
                  <TouchableOpacity key={filter} onPress={() => setSelectedFilter(filter)} activeOpacity={0.7}>
                    <View style={{ alignItems: 'center', gap: 2 }}>
                      <Text style={[styles.filterText, { color: isSelected ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }]}>{filter}</Text>
                      <View style={[styles.activeIndicator, { backgroundColor: Colors.TextPrimary[scheme], opacity: isSelected ? 1 : 0 }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.dividerLine} />
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, { color: Colors.TextSecondary[scheme], fontFamily: 'Inter-SemiBold' }]}>Name</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.headerText, { color: Colors.TextSecondary[scheme], fontFamily: 'Inter-Medium' }]}>Price</Text>
            <View style={{ width: 31 }} />
            <Text style={[styles.headerText, { color: Colors.TextSecondary[scheme], fontFamily: 'Inter-Medium' }]}>24h chg%</Text>
          </View>
        </View>
        
        <View>
          {filteredTokens.map((token) => {
            const change = token.changePercent ?? 0;

            const priceUsd = token.price ?? 0;
            const localRate = fiatRates?.[selectedCurrency] || 1; 
            const localSymbol = CURRENCY_SYMBOLS[selectedCurrency] || '$';
            const convertedPrice = priceUsd * localRate;

            return (
              <TouchableOpacity key={token.id} style={styles.tokenRow} activeOpacity={0.7}>
                <View style={[styles.row, { flex: 1 }]}>
                  <View style={{ marginRight: 8 }}>
                    <TokenIcon 
                      symbol={token.symbol} 
                      logoUrl={token.logo} 
                      size={38} 
                    />
                  </View>

                  <View style={{ flex: 1, justifyContent: 'center', gap: 2.5, paddingRight: 10 }}>
                    <Text 
                      style={[styles.tokenName, { color: Colors.TextPrimary[scheme], marginBottom: 0 }]} 
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.75}
                    >
                      {token.name}
                    </Text>
                    <Text 
                      style={[styles.tokenSymbol, { color: Colors.TextSecondary[scheme] }]}
                      numberOfLines={1}
                    >
                      {token.symbol.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      
                  <View style={{ alignItems: 'flex-end', marginRight: 16.8, justifyContent: 'center', gap: selectedCurrency === 'None' ? 0 : 2.5 }}>
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

                <View style={[styles.badge, { backgroundColor: change >= 0 ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30') }]}>
                    <Text style={styles.badgeText} adjustsFontSizeToFit={true} numberOfLines={1} minimumFontScale={0.5}>
                      {change > 0 ? '+' : ''}{change.toFixed(2)}%
                    </Text>
                </View>
                </View>
              </TouchableOpacity>
            );
          })}
          
          {filteredTokens.length === 0 && (
             <View style={{ alignItems: 'center', marginTop: 30 }}>
               {isLoading ? (
                 <ActivityIndicator size="small" color={Colors.TextPrimary[scheme]} />
               ) : (
                 <Text style={[styles.emptyText, { color: Colors.TextSecondary[scheme] }]}>
                   No tokens found for "{searchText}"
                 </Text>
               )}
             </View>
          )}
        </View>
      </ScrollView>
      <ScannerOverlayView 
        visible={isShowingScanner} 
        onClose={() => setIsShowingScanner(false)} 
        onScan={handleScanSuccess}
      />
      <RightSlideModal 
        visible={isShowingWithdraw} 
        onClose={() => { 
          setIsShowingWithdraw(false); 
          setScannedAddress(""); 
        }}
      >
        <WithdrawView 
          assets={assets} 
          onClose={() => { 
            setIsShowingWithdraw(false); 
            setScannedAddress(""); 
          }} 
          scheme={scheme} 
          prefilledAddress={scannedAddress} 
        />
      </RightSlideModal>

      <RightSlideModal 
        visible={isShowingDeposit} 
        onClose={() => setIsShowingDeposit(false)}
      >
        <DepositView 
          onClose={() => setIsShowingDeposit(false)} 
          scheme={scheme} 
        />
      </RightSlideModal>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 15,
  },
  profileCircle: {
    width: 45,
    height: 45,
    borderRadius: 21,
    overflow: 'hidden',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 0.5 },
    shadowOpacity: 0.09,
    shadowRadius: 6,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15.5,
    fontFamily: 'Inter-Medium',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 6,
    elevation: 2,
  },
  card: { 
    borderRadius: 22,
    padding: 15,
    paddingBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.09,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,           
        shadowColor: '#000000', 
      }
    }),
  },
  balanceCard: {
    paddingVertical: 15,
    marginBottom: 8,
    marginTop: -7,
  },
  balanceLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 10,
  },
  balanceValue: {
    fontSize: 33,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  pnlLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 25,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(90, 90, 100, 0.08)',
    borderRadius: 30,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionButtonText: { 
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 0,
  },
  filterSection: {
    marginTop: 12,
    gap: 10, 
  },
  filterText: {
    fontSize: 16.5,
    fontFamily: 'Inter-SemiBold',
  },
  activeIndicator: {
    width: 20,
    height: 2, 
    borderRadius: 2,
    marginTop: 5,
  },
  dividerLine: {
    height: 1,
    backgroundColor: 'rgba(142, 142, 147, 0.3)', 
    marginTop: -12, 
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0, 
    marginBottom: 2,
  },
  headerText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        paddingVertical: 8,
      },
      android: {
        paddingVertical: 3.5, 
      }
    }),
  },
  tokenIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 8,
  },
  tokenName: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  tokenSymbol: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  badge: {
    width: 75,
    height: 33.5,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { 
    color: 'white',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: 'Inter-Regular',
  }
});