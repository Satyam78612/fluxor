import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  useColorScheme,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors'; 
import BtcIcon from '../../assets/Images/btc.svg';
import { TokenIcon } from '../../components/TokenIcon';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Components & Logic ---
import { SmartPriceText } from '../../components/SmartPriceText';
import useMarketViewModel from '../../logic/useMarketViewModel';
import { Token } from '../../logic/Token';

// Removed 'Favorites' to match native logic
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

// --- COMPONENTS ---

// 1. Fear & Greed Card
const FearAndGreedCard = ({ score }: { score: number }) => {
  const { theme: scheme } = useTheme();
  const segmentColors = ['#FF3B30', '#FF8F00', '#FFCC00', 'rgba(50, 215, 75, 0.8)', '#28CD41']; 
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 22 - 8) / 2; 
  const w = cardWidth - 28; 
  const h = 96; 
  const radius = (w / 2) - 10; 
  const centerX = w / 2;
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
    <View style={[styles.card, { backgroundColor: Colors.CardBackground[scheme], flex: 1 }]}>
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
          <Text style={{ fontSize: 22, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>{Math.floor(score)}</Text>
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
    <View style={[styles.card, { backgroundColor: Colors.CardBackground[scheme], flex: 1 }]}>
      <View style={{ flexDirection: 'column', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BtcIcon width={21} height={21} />
          <Text style={{ fontSize: 16, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>Dominance</Text>
        </View>
        <Text style={{ fontSize: 15, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>{btc.toFixed(2)}%</Text>
        
        {/* DIVIDER - Added marginVertical here to increase the gap! */}
        <View style={{ 
          height: 1, 
          backgroundColor: Colors.DividerColor?.[scheme] || '#2C2C35', 
          marginVertical: 4 
        }} />
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../assets/Images/eth.png')} style={{ width: 21, height: 21 }} resizeMode="contain" />
          <Text style={{ fontSize: 16, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>Dominance</Text>
        </View>
        <Text style={{ fontSize: 15, fontFamily: 'Inter-SemiBold', color: Colors.TextPrimary[scheme] }}>{eth.toFixed(2)}%</Text>
      </View>
    </View>
  );
};

// 3. Balance Card
const BalanceCardView = () => {
  const { theme: scheme } = useTheme();
  const totalBalance = 12450.00; // Will hook up to wallet logic later
  const todayPNL = 450.20;
  const todayPNLPercent = 3.45;
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
        <TouchableOpacity style={styles.actionButton}>
          <Image 
            source={require('../../assets/Buttons/Send.png')} 
            style={{ width: 30, height: 30, marginRight: 4, tintColor: Colors.TextPrimary[scheme] }} 
            resizeMode="contain" 
          />
          <Text style={[styles.actionButtonText, { color: Colors.TextPrimary[scheme] }]}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Image 
            source={require('../../assets/Buttons/Receive.png')} 
            style={{ width: 30, height: 30, marginRight: 5, tintColor: Colors.TextPrimary[scheme] }} 
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
  const [profileImg, setProfileImg] = useState<string | null>(null);

  // 4. This hook runs every time you return to the Home Screen
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
  
  // --- ViewModel Integration ---
  const {
    allTokens,
    searchedToken,
    setSearchedToken,
    isLoading,
    fearAndGreedScore,
    btcDominance,
    ethDominance,
    getTokensForTab,
    searchTokenByAddress
  } = useMarketViewModel();

  const [searchText, setSearchText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<HomeFilter>(HomeFilter.All);
  
// --- Auto-Search Effect ---
  useEffect(() => {
    const needle = searchText.trim();
    if (needle.length === 0) {
      setSearchedToken(null);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      // 🚀 REMOVED the > 20 length restriction!
      // Now it will ask your backend for ANY symbol, name, or contract you type.
      searchTokenByAddress(needle);
    }, 600); // 600ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchText]);
  
  // --- Filtering Logic ---
  const filteredTokens = useMemo(() => {
    let list = getTokensForTab(selectedFilter as any);
    const needle = searchText.trim().toLowerCase();

    if (needle.length > 0) {
      list = list.filter(t => 
        t.name?.toLowerCase().includes(needle) || 
        t.symbol?.toLowerCase().includes(needle) ||
        t.id?.toLowerCase().includes(needle) ||
        (t as any).contractAddress?.toLowerCase().includes(needle) || // <-- MUST HAVE THIS FOR JSON SYNC
        (t as any).address?.toLowerCase().includes(needle) ||         // <-- MUST HAVE THIS FOR JSON SYNC
        t.deployments?.some(d => d.address?.toLowerCase().includes(needle))
      );

      // Append found API token to top if search matched (PREVENTS DUPLICATES)
      if (searchedToken && !list.find(t => t.id === searchedToken.id || t.symbol?.toLowerCase() === searchedToken.symbol?.toLowerCase())) {
        list.unshift(searchedToken);
      }
    }
    
    return list;
  }, [searchText, selectedFilter, getTokensForTab, searchedToken, allTokens]);

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.contentContainer}>
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

            <View style={[styles.searchContainer, { backgroundColor: Colors.CardBackground[scheme] }]}>
              <TextInput 
                style={[styles.searchInput, { color: Colors.TextPrimary[scheme] }]} 
                placeholder="Search Token or Address" 
                placeholderTextColor={Colors.TextSecondary[scheme]} 
                value={searchText} 
                onChangeText={setSearchText} 
                autoCapitalize="none" 
              />
            </View>
            <TouchableOpacity style={[styles.iconButton, { backgroundColor: Colors.CardBackground[scheme] }]}>
              <Ionicons name="mail" size={20} color={Colors.TextPrimary[scheme]} />
            </TouchableOpacity>
          </View>
          
          <BalanceCardView />
          
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
              <View style={{ flexDirection: 'row', gap: 13 }}>
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

              return (
                <TouchableOpacity key={token.id} style={styles.tokenRow} activeOpacity={0.7}>
                  <View style={styles.row}>
                    
                    {/* Replaced standard Image with your new TokenIcon */}
                    <View style={{ marginRight: 8 }}>
                      <TokenIcon 
                        symbol={token.symbol} 
                        logoUrl={token.logo} 
                        size={38} 
                      />
                    </View>

                    <View>
                      <Text style={[styles.tokenName, { color: Colors.TextPrimary[scheme] }]}>{token.name}</Text>
                      <Text style={[styles.tokenSymbol, { color: Colors.TextSecondary[scheme] }]}>{token.symbol.toUpperCase()}</Text>
                    </View>
                  </View>

                  <View style={{ flex: 1 }} />
                  <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
                    <SmartPriceText 
                      value={token.price ?? 0} 
                      fontSize={16} 
                      fontFamily="Inter-SemiBold" 
                      color={Colors.TextPrimary[scheme]} 
                    />
                  </View>

                  <View style={[styles.badge, { backgroundColor: change >= 0 ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30') }]}>
                      <Text style={styles.badgeText} adjustsFontSizeToFit={true} numberOfLines={1} minimumFontScale={0.5}>
                        {change > 0 ? '+' : ''}{change.toFixed(2)}%
                      </Text>
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
        </View>
      </ScrollView>
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
    paddingTop: 64,
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
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    fontSize: 15.5,
    fontFamily: 'Inter-Regular',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    borderRadius: 22,
    padding: 14,
    paddingBottom: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  balanceCard: {
    paddingVertical: 15,
    marginBottom: 8,
    marginTop: -8,
  },
  balanceLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 31,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  pnlLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 15,
    paddingHorizontal: 30,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(143, 144, 166, 0.08)',
    borderRadius: 30,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionButtonText: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
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
    fontSize: 17,
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
    paddingVertical: 8,
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
    width: 80,
    height: 33,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: 'Inter-Regular',
  }
});