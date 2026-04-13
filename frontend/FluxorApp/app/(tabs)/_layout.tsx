import { Tabs } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Colors } from '../../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function TabLayout() {
  const { theme: scheme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        
        tabBarActiveTintColor: Colors.TextPrimary[scheme], 
        tabBarInactiveTintColor: Colors.TextSecondary[scheme],
        
        tabBarStyle: {
          backgroundColor: Colors.CardBackground[scheme], 
          borderTopWidth: 0, 
          height: Platform.OS === 'ios' ? 79 : 60,
          paddingTop: 0,
          paddingBottom: Platform.OS === 'ios' ? 0 : 0,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -5 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter-SemiBold',
          fontSize: 11, 
          marginTop: 0,
          fontWeight: '500',
        }
      }}
    >
    <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            Platform.OS === 'ios' ? (
              <SymbolView 
                name="house.fill" 
                size={27} 
                tintColor={color} 
                resizeMode="scaleAspectFit" 
                style={{ width: 27, height: 27 }} 
              />
            ) : (
              <Ionicons name="home" size={24} color={color} />
            )
          ),
        }}
      />
      
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color }) => (
            Platform.OS === 'ios' ? (
              <SymbolView 
                name="chart.bar.xaxis" 
                size={28} 
                tintColor={color} 
                resizeMode="scaleAspectFit" 
                style={{ width: 28, height: 28 }} 
              />
            ) : (
              <Ionicons name="bar-chart" size={24} color={color} />
            )
          ),
        }}
      />
      
      <Tabs.Screen
        name="trade"
        options={{
          title: 'Trade',
          tabBarIcon: ({ color }) => (
            Platform.OS === 'ios' ? (
              <SymbolView 
                name="rectangle.2.swap" 
                size={29} 
                tintColor={color} 
                resizeMode="scaleAspectFit" 
                style={{ width: 29, height: 29 }} 
              />
            ) : (
              <Ionicons name="swap-horizontal" size={24} color={color} />
            )
          ),
        }}
      />

      <Tabs.Screen
        name="earn"
        options={{
          title: 'Earn',
          tabBarIcon: ({ color }) => (
            Platform.OS === 'ios' ? (
              <SymbolView 
                name="gift.fill" 
                size={24.5} 
                tintColor={color} 
                resizeMode="scaleAspectFit" 
                style={{ width: 24.5, height: 24.5 }} 
              />
            ) : (
              <Ionicons name="gift" size={24} color={color} />
            )
          ),
        }}
      />

      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color }) => (
            Platform.OS === 'ios' ? (
              <SymbolView 
                name="wallet.bifold.fill" 
                size={27.5} 
                tintColor={color} 
                resizeMode="scaleAspectFit" 
                style={{ width: 27.5, height: 27.5 }} 
              />
            ) : (
              <Ionicons name="wallet" size={24} color={color} />
            )
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}