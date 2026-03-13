import { View, Text, StyleSheet, Image, TouchableOpacity, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';

export default function LoginScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'dark';

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <View style={styles.content}>
        
        <Image
          source={require('../../assets/Fluxor.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={[styles.title, { color: Colors.TextPrimary[scheme] }]}>
          Welcome to Fluxor
        </Text>

        <Text style={[styles.subtitle, { color: Colors.TextSecondary[scheme] }]}>
          The First Chain-agnostic DEX with an intuitive experience. Trade, Invest,
          and Earn without the complexity of bridges, chains, or gas.
        </Text>

        <View style={{ flex: 1 }} />

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.signupBtn, { backgroundColor: Colors.CardBackground[scheme] }]}
            activeOpacity={0.85}
            onPress={() => console.log("Sign Up pressed")} // Placeholder
          >
            <Text style={[styles.signupText, { color: Colors.TextPrimary[scheme] }]}>
              Sign Up
            </Text>
          </TouchableOpacity>

          {/* 👇 THIS IS THE FIX 👇 */}
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: Colors.FluxorPurple[scheme] }]}
            activeOpacity={0.85}
            onPress={() => router.replace('/(tabs)/home')} 
          >
            <Text style={styles.loginText}>Log In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 120,
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.85,
  },
  buttons: {
    paddingBottom: 80,
    gap: 14,
  },
  signupBtn: {
    height: 56,
    borderRadius: 20, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  loginBtn: {
    height: 56,
    borderRadius: 20, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});