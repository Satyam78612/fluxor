import { Tabs } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function TabLayout() {
  const { theme: scheme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        
        // Applying your custom theme colors mapped to the active scheme
        tabBarActiveTintColor: Colors.TextPrimary[scheme], 
        tabBarInactiveTintColor: Colors.TextSecondary[scheme],
        
        tabBarStyle: {
          backgroundColor: Colors.CardBackground[scheme], 
          borderTopWidth: 0, 
          height: Platform.OS === 'ios' ? 80 : 60,
          paddingTop: -5,
          paddingBottom: Platform.OS === 'ios' ? 0 : 0,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -5 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
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
            <Ionicons name="home" size={24} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color }) => (
            <Ionicons name="bar-chart" size={24} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="trade"
        options={{
          title: 'Trade',
          tabBarIcon: ({ color }) => (
            <Ionicons name="swap-horizontal" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="earn"
        options={{
          title: 'Earn',
          tabBarIcon: ({ color }) => (
            <Ionicons name="gift" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color }) => (
            <Ionicons name="wallet" size={24} color={color} />
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