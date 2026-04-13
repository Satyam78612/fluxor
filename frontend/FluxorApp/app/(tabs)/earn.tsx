import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  useColorScheme,
  Platform,
  Share 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

interface LeaderboardUser {
  id: string;
  rank: number;
  name: string;
  points: string;
}

const leaderboardData: LeaderboardUser[] = [
  { id: '1', rank: 1, name: 'Crypto Whale', points: '100,020' },
  { id: '2', rank: 2, name: 'DeFi Master', points: '81,202' },
  { id: '3', rank: 3, name: 'Yield Farmer', points: '67,239' },
  { id: '4', rank: 4, name: 'Bull Trader', points: '45,032' },
  { id: '5', rank: 5, name: 'Token Hunter', points: '31,343' },
  { id: '6', rank: 6, name: 'Swap Ninja', points: '21,232' },
  { id: '7', rank: 7, name: 'Monster', points: '18,239' },
  { id: '8', rank: 8, name: 'Swap Legend', points: '13,453' },
  { id: '9', rank: 9, name: 'Intern', points: '11,323' },
  { id: '10', rank: 10, name: 'Pro Trader', points: '9,033' },
  { id: '11', rank: 11, name: 'Aplpha Hunter', points: '7,332' },
  { id: '12', rank: 12, name: 'TraderZero', points: '5,434' },
];

// --- Sub-Components (MOVED OUTSIDE) ---

const RankIcon = ({ rank, scheme }: { rank: number, scheme: 'light' | 'dark' }) => {
  if (rank === 1) {
    return <Image source={require('../../assets/Buttons/Gold badge.png')} style={styles.rankBadge} />;
  }
  if (rank === 2) {
    return <Image source={require('../../assets/Buttons/Silver badge.png')} style={styles.rankBadge} />;
  }
  if (rank === 3) {
    // Used your exact spelling from assets folder (Bronze bedge.png)
    return <Image source={require('../../assets/Buttons/Bronze bedge.png')} style={styles.rankBadge} />;
  }
  return (
    <View style={styles.rankBadgePlaceholder}>
      <Text style={[styles.rankBadgeText, { color: Colors.TextSecondary[scheme] }]}>
        #{rank}
      </Text>
    </View>
  );
};

const StatRow = ({ title, value, scheme }: { title: string; value: string; scheme: 'light' | 'dark' }) => (
  <View style={styles.statRow}>
    <Text style={[styles.statRowTitle, { color: Colors.TextSecondary[scheme] }]}>{title}</Text>
    <View style={{ flex: 1 }} />
    <Text style={[styles.statRowValue, { color: Colors.TextPrimary[scheme] }]}>{value}</Text>
  </View>
);

// --- Main Screen ---
export default function EarnScreen() {
  const { theme: scheme } = useTheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<'Points' | 'Leaderboard'>('Points');
  const tabs: ('Points' | 'Leaderboard')[] = ['Points', 'Leaderboard'];
  const referralLink = 'https://fluxor.fi/ref/FLUX2025';

  const handleShareLink = async () => {
    try {
      await Share.share({
        message: referralLink,
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent={true} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[
          styles.contentContainer, 
          { 
            paddingTop: Platform.OS === 'android' ? Math.max(insets.top + 25, 10) : Math.max(insets.top + 15, 20)
          }
        ]}>
          
          {/* Custom Segmented Control */}
          <View style={{ alignItems: 'center' }}>
            <View style={[styles.tabWrapper, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E' }]}>
              {tabs.map((tab) => {
                const isSelected = selectedTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setSelectedTab(tab)}
                    activeOpacity={0.8}
                    style={styles.tabButton}
                  >
                    <View style={[
                      styles.tabBackground,
                      isSelected && { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }
                    ]}>
                      <Text style={[
                        styles.tabText,
                        { color: isSelected ? Colors.TextPrimary[scheme] : Colors.TextSecondary[scheme] }
                      ]}>
                        {tab}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Dynamic Content */}
          {selectedTab === 'Points' ? (
            <View style={styles.pointsContainer}>
              
              {/* Top Points Card */}
              <View style={[
                styles.pointsCard, 
                // Fallback for EarnCard color if it's not in colors.ts yet
                { backgroundColor: Colors.EarnCard?.[scheme] || (isDark ? '#26262F' : '#F2F2F7') }
              ]}>
                <Text style={[styles.yourPointsLabel, { color: Colors.TextSecondary[scheme] }]}>
                  Your Points
                </Text>
                <Text style={[styles.pointsValue, { color: Colors.TextPrimary[scheme] }]}>
                  6,452
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={[styles.rankValue, { color: Colors.TextPrimary[scheme] }]}>
                  Rank: 1,343
                </Text>

                {/* Fluxor Watermark Overlay */}
                <Image 
                  source={require('../../assets/Images/Fluxor.png')} 
                  style={styles.cardWatermark} 
                  resizeMode="contain"
                />
              </View>

              {/* Stats Rows */}
              <View style={styles.statsContainer}>
                <StatRow title="Referrals" value="129 Users" scheme={scheme} />
                <StatRow title="Referral Points" value="3,427 Points" scheme={scheme} />
                <StatRow title="Weekly Distribution" value="100,000 Points" scheme={scheme} />
              </View>

              {/* Referral Section */}
              <View style={styles.referralSection}>
                <View style={styles.referralHeader}>
                  <Text style={[styles.referralTitle, { color: Colors.TextPrimary[scheme] }]}>
                    Share and earn
                  </Text>
                  <Text style={[styles.referralSubtitle, { color: Colors.TextSecondary[scheme] }]}>
                    Share your referral link and earn 10% of your referral's points (up to 20k).
                  </Text>
                </View>

              {/* Share Link Input */}
                <View style={[styles.copyBox, { backgroundColor: Colors.SwapCardBackground?.[scheme] || '#1C1C1E', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                  <Text style={[styles.referralLinkText, { color: Colors.TextPrimary[scheme] }]} numberOfLines={1}>
                    {referralLink}
                  </Text>
                  <View style={{ flex: 1 }} />
                  
                  <TouchableOpacity onPress={handleShareLink} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="share-outline" size={20} color={Colors.TextSecondary[scheme]} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ height: 50 }} />
            </View>
          ) : (
            <View style={styles.leaderboardContainer}>
              <Text style={[styles.lbTitle, { color: Colors.TextPrimary[scheme] }]}>
                Top Traders
              </Text>

              <View style={styles.lbListWrapper}>
                {/* Header Row */}
                <View style={styles.lbHeaderRow}>
                  <Text style={[styles.lbHeaderRank, { color: Colors.TextSecondary[scheme] }]}>Rank</Text>
                  <Text style={[styles.lbHeaderName, { color: Colors.TextSecondary[scheme] }]}>Name</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.lbHeaderPoints, { color: Colors.TextSecondary[scheme] }]}>Points</Text>
                </View>

                <View style={[styles.lbDivider, { backgroundColor: Colors.DividerColor?.[scheme] || 'rgba(150,150,150,0.3)' }]} />

                {/* List Items */}
                {leaderboardData.map((user, index) => (
                  <View key={user.id}>
                    <View style={[styles.lbUserRow, { backgroundColor: Colors.AppBackground[scheme] }]}>
                      <View style={styles.lbUserLeft}>
                        <View style={styles.lbRankIconWrapper}>
                          <RankIcon rank={user.rank} scheme={scheme} />
                        </View>
                        <Text style={[styles.lbUserName, { color: Colors.TextPrimary[scheme] }]}>
                          {user.name}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }} />

                      <Text style={[styles.lbUserPoints, { color: Colors.AppGreen?.[scheme] || '#28CD41' }]}>
                        {user.points}
                      </Text>
                    </View>

                    {/* Faded Divider */}
                    <View style={[styles.lbDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} />
                  </View>
                ))}
              </View>
            </View>
          )}

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    gap: 20,
    paddingBottom: 10,
  },
  
  tabWrapper: {
    flexDirection: 'row',
    width: 260,
    borderRadius: 15,
    padding: 4,
    marginTop: -8, 
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
  },
  tabBackground: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    overflow: 'hidden',
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },

  // Points View
  pointsContainer: {
    gap: 20,
  },
  pointsCard: {
    height: 200,
    borderRadius: 23,
    padding: 24,
    marginHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  yourPointsLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    paddingTop: -8,
    paddingBottom: 7,
  },
  pointsValue: {
    fontSize: 35,
    fontFamily: 'Inter-Bold',
  },
  rankValue: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  cardWatermark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 80,
    height: 80,
    opacity: 0.8,
  },
  statsContainer: {
    gap: 12,
    paddingHorizontal: 20,
    marginVertical: -2,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statRowTitle: {
    fontSize: 17.5,
    fontFamily: 'Inter-Medium',
  },
  statRowValue: {
    fontSize: 17.5,
    fontFamily: 'Inter-SemiBold',
  },
  referralSection: {
    marginTop: 10,
    gap: 15,
  },
  referralHeader: {
    paddingHorizontal: 20,
    gap: 8,
  },
  referralTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  referralSubtitle: {
    fontSize: 14.5,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  copyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 20,
    borderRadius: 15,
    borderWidth: 0.5,
  },
  referralLinkText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },

  // Leaderboard View
  leaderboardContainer: {
    gap: 0,
    paddingTop: 0,
  },
  lbTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  lbListWrapper: {
    paddingTop: 16,
  },
  lbHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  lbHeaderRank: {
    width: 44.2,
    marginLeft: 0, 
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
  },
  lbHeaderName: {
    marginLeft: 5.5,
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
  },
  lbHeaderPoints: {
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
  },
  lbDivider: {
    height: 1,
  },
  lbUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  lbUserLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15.3,
  },
  lbRankIconWrapper: {
    marginLeft: -5, // Matches .padding(.leading, -5)
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  rankBadgePlaceholder: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  lbUserName: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  lbUserPoints: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});