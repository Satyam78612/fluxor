import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  useColorScheme,
  Keyboard,
  Platform,
  Image,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useTheme } from '../context/ThemeContext';

// --- Imports from our Logic & Components ---
import useMarketViewModel from '../../logic/useMarketViewModel';
import { Token } from '../../logic/Token';
import { SmartPriceText } from '../../components/SmartPriceText';
import { TokenIcon } from '../../components/TokenIcon';

const MARKET_TABS = [
  'Favorites', 'All', 'Trending', 'Stocks', 'Gainers', 'Losers', 
  'RWA', 'AI', 'DeFi', 'L1', 'L2', 'CEX Token', 'Meme', 'DePIN', 'Oracle'
];

type SortField = 'none' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';

export default function MarketScreen() {
  const { theme: scheme } = useTheme();
  const isDark = scheme === 'dark';

  // --- ViewModel Integration ---
  const {
    allTokens,
    searchedToken,
    setSearchedToken,
    isLoading,
    getTokensForTab,
    searchTokenByAddress
  } = useMarketViewModel();

  const [searchText, setSearchText] = useState('');
  const [selectedTab, setSelectedTab] = useState('All');
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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

// --- Sorting & Filtering Logic ---
  const filteredAndSortedTokens = useMemo(() => {
    let list: Token[] = [];
    const needle = searchText.trim().toLowerCase();

    if (needle.length > 0) {
      // Safely checks JSON contract addresses without angering TypeScript
      list = allTokens.filter(t => 
        t.name?.toLowerCase().includes(needle) || 
        t.symbol?.toLowerCase().includes(needle) ||
        t.id?.toLowerCase().includes(needle) ||
        (t as any).contractAddress?.toLowerCase().includes(needle) ||
        (t as any).address?.toLowerCase().includes(needle) ||
        t.deployments?.some(d => d.address?.toLowerCase().includes(needle))
      );

      // Prevents duplicates if the searched API token is already in your JSON
      if (searchedToken && !list.find(t => t.id === searchedToken.id || t.symbol?.toLowerCase() === searchedToken.symbol?.toLowerCase())) {
        list.unshift(searchedToken);
      }
    } else {
      // Use tab filtering
      list = getTokensForTab(selectedTab);
    }

    // Sorting
    if (sortField !== 'none') {
      list = [...list].sort((a, b) => {
        const valA = sortField === 'price' ? (a.price ?? 0) : (a.changePercent ?? 0);
        const valB = sortField === 'price' ? (b.price ?? 0) : (b.changePercent ?? 0);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      });
    }

    return list;
  }, [searchText, selectedTab, sortField, sortDirection, allTokens, getTokensForTab, searchedToken]);

  const handleSortTap = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  // --- Components ---
  const SortButton = ({ isActive, direction, onPress }: { isActive: boolean, direction: SortDirection, onPress: () => void }) => {
    const colorUp = isActive && direction === 'asc' ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)';
    const colorDown = isActive && direction === 'desc' ? Colors.TextPrimary[scheme] : 'rgba(150,150,150,0.5)';
    
    return (
      <TouchableOpacity style={styles.sortButtonBox} onPress={onPress} activeOpacity={0.7}>
        <Ionicons name="caret-up" size={10.5} color={colorUp} style={{ marginBottom: -4 }} />
        <Ionicons name="caret-down" size={10.5} color={colorDown} />
      </TouchableOpacity>
    );
  };

  const renderToken = ({ item }: { item: Token }) => {
    const change = item.changePercent ?? 0;
    const isPositive = change >= 0;
    const badgeColor = isPositive ? (Colors.AppGreen?.[scheme] || '#28CD41') : (Colors.AppRed?.[scheme] || '#FF3B30');

    // Handle token images properly (Network vs Local fallback)
    const imageSource = item.logo && item.logo.startsWith('http') 
        ? { uri: item.logo } 
        : require('../../assets/icon.png'); // Fallback

    return (
      <View style={styles.rowContainer}>
        <TouchableOpacity style={styles.row} activeOpacity={0.7}>
          
          {/* Left Side: Icon & Name */}
          <View style={styles.rowLeft}>
            
            {/* --- REPLACED IMAGE WITH TOKENICON --- */}
            <View style={{ marginLeft: 1, marginRight: 2.5 }}>
              <TokenIcon 
                symbol={item.symbol} 
                logoUrl={item.logo} 
                size={38} 
              />
            </View>

            <View style={{ justifyContent: 'center', gap: 2, flex: 1, paddingRight: 10 }}>
              <Text 
                style={[styles.tokenName, { color: Colors.TextPrimary[scheme] }]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.75}
              >
                {item.name}
              </Text>
              <Text style={[styles.tokenSymbol, { color: Colors.TextSecondary[scheme] }]}>
                {item.symbol.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Right Side: Smart Price & Change */}
          <View style={styles.rowRight}>
            
            {/* Using your new SmartPriceText component! */}
            <View style={{ paddingRight: 10 }}>
              <SmartPriceText 
                value={item.price ?? 0} 
                fontSize={16} 
                fontFamily="Inter-SemiBold" 
                color={Colors.TextPrimary[scheme]} 
              />
            </View>

            <View style={[styles.percentBadge, { backgroundColor: badgeColor }]}>
              <Text 
                style={styles.percentText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.5}
              >
                {formatPercent(change)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      
      {/* 1. Search Bar */}
      <View style={styles.searchSection}>
        <View style={[styles.searchContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
          <Ionicons name="search" size={16} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'} />
          <TextInput
            style={[styles.searchInput, { color: Colors.TextPrimary[scheme] }]}
            placeholder="Search assets"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)'}
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="close-circle" size={18} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 2. Horizontal Tabs */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
          {MARKET_TABS.map(tab => {
            const isSelected = selectedTab === tab;
            return (
              <TouchableOpacity 
                key={tab} 
                onPress={() => setSelectedTab(tab)}
                activeOpacity={0.7}
              >
                <View style={styles.tabItem}>
                  <Text style={[
                    styles.tabText, 
                    { color: isSelected ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }
                  ]}>
                    {tab}
                  </Text>
                  <View style={[
                    styles.activeTabIndicator, 
                    { 
                      backgroundColor: Colors.TextPrimary[scheme],
                      opacity: isSelected ? 1 : 0 
                    }
                  ]} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.divider} />

      {/* 3. Sorting Headers */}
      <View style={styles.sortHeader}>
        <Text style={[styles.sortTextLeft, { color: Colors.TextSecondary[scheme] }]}>Name</Text>
        
        <View style={{ flex: 1 }} />
        
        <View style={styles.sortGroupPrice}>
          <Text style={[styles.sortText, { color: Colors.TextSecondary[scheme] }]}>Price</Text>
          <SortButton isActive={sortField === 'price'} direction={sortDirection} onPress={() => handleSortTap('price')} />
        </View>

        <View style={styles.sortGroupChange}>
          <Text style={[styles.sortText, { color: Colors.TextSecondary[scheme] }]}>24h %</Text>
          <SortButton isActive={sortField === 'change'} direction={sortDirection} onPress={() => handleSortTap('change')} />
        </View>
      </View>

      {/* 4. Token List */}
      <View style={{ flex: 1, marginTop: -6 }}>
        <FlatList
          data={filteredAndSortedTokens}
          keyExtractor={item => item.id}
          renderItem={renderToken}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 50 }}
          onScrollBeginDrag={() => Keyboard.dismiss()}
          ListEmptyComponent={() => (
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.TextPrimary[scheme]} />
              ) : (
                <Text style={[styles.emptyText, { color: Colors.TextSecondary[scheme] }]}>
                  No tokens found
                </Text>
              )}
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 11,
  },
  searchSection: {
    paddingBottom: -1,
    paddingTop: 7,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    fontFamily: 'Inter-Regular', 
  },
  tabsContainer: {
    paddingVertical: 4,
    gap: 15,
  },
  tabItem: {
    alignItems: 'center',
    gap: 2,
  },
  tabText: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  activeTabIndicator: {
    height: 2,
    width: 20,
    borderRadius: 2,
    marginTop: 5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.3)',
    marginTop: -6,
    marginBottom: 14,
  },
  sortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -4, 
    marginBottom: 8, 
    paddingLeft: 0.6,
    zIndex: 10,
  },
  sortTextLeft: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  sortGroupPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
    justifyContent: 'flex-end',
    gap: 1,
  },
  sortGroupChange: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 88,
    justifyContent: 'flex-end',
    gap: 1,
  },
  sortText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  sortButtonBox: {
    width: 15,
    height: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContainer: {
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 2,
    gap: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  tokenIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginHorizontal: 2.5,
  },
  tokenName: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  tokenSymbol: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  percentBadge: {
    width: 80,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    paddingHorizontal: 4,
  },
  percentText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 20,
  }
});