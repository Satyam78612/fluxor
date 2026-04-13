import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Asset } from 'expo-asset';
import { ThemeProvider } from './context/ThemeContext';

SplashScreen.preventAutoHideAsync();

const ASSETS_TO_PRELOAD = [
  // Wallet
  require('../assets/Buttons/CopyButton.png'),
  require('../assets/Buttons/Hexagon.png'),
  require('../assets/Buttons/HistoryCard.png'),

  // Shared (Home + Wallet)
  require('../assets/Buttons/Send.png'),
  require('../assets/Buttons/Receive.png'),

  // Home only
  require('../assets/Buttons/ScanIcon.png'),
  require('../assets/Fluxor.png'),           

  // Trade only
  require('../assets/Buttons/Slippage.png'),
  require('../assets/Buttons/Candle.png'),

  // Earn only
  require('../assets/Buttons/Gold badge.png'),
  require('../assets/Buttons/Silver badge.png'),
  require('../assets/Buttons/Bronze bedge.png'),
  require('../assets/Images/Fluxor.png'),  
  
  // Settings only
  require('../assets/Buttons/X.png'),
];

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
  });

  useEffect(() => {
    // Fonts and assets load in parallel — neither waits on the other
    Asset.loadAsync(ASSETS_TO_PRELOAD);
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}