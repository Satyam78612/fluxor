import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  useColorScheme,
  Switch,
  Modal,
  TextInput,
  Linking,
  Alert,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// MARK: - TYPES & INTERFACES
export type Theme = 'light' | 'dark';

interface ColorTheme {
  light: string;
  dark: string;
}

// Adjust this to match your actual theme/colors.ts if you have one exported
const Colors: Record<string, ColorTheme> = {
  AppBackground: { light: '#F2F2F7', dark: '#000000' },
  CardBackground: { light: '#FFFFFF', dark: '#1C1C1E' },
  TextPrimary: { light: '#000000', dark: '#FFFFFF' },
  TextSecondary: { light: '#8E8E93', dark: '#EBEBF5' },
  FluxorPurple: { light: '#A020F0', dark: '#A020F0' },
  AppGreen: { light: '#34C759', dark: '#30D158' },
  AppRed: { light: '#FF3B30', dark: '#FF453A' },
};

const Keys = {
  userProfileImage: 'userProfileImage',
  userName: 'userName',
  selectedTheme: 'selectedTheme',
  isLoggedIn: 'isLoggedIn',
  faceIDEnabled: 'faceIDEnabled',
  selectedLockTime: 'selectedLockTime',
};

// Props Interfaces for Sub-Components
interface AccountProfileViewProps {
  scheme: Theme;
  userName: string;
  profileImage: string | null;
  setProfileImage: (uri: string) => void;
  onBack: () => void;
  onEditName: () => void;
}

interface EditNameViewProps {
  scheme: Theme;
  currentName: string;
  onSave: (newName: string) => void;
  onBack: () => void;
}

interface ResetAppViewProps {
  scheme: Theme;
  onBack: () => void;
  faceIDEnabled: boolean;
}

interface BottomSheetWrapperProps {
  children: React.ReactNode;
  onClose: () => void;
  scheme: Theme;
}

interface SheetProps {
  scheme: Theme;
  selected: string;
  onSelect: (val: string) => void;
  onClose: () => void;
}

// MARK: - MAIN SETTINGS VIEW
export default function SettingsScreen() {
  const router = useRouter();
  
  // 1. Pull scheme and toggleTheme from Context instead of useColorScheme
  const { theme: scheme, toggleTheme } = useTheme();
  const isDark = scheme === 'dark';
  
  // 2. Format the display name based on the current context theme
  const displayThemeName = scheme === 'dark' ? 'Dark' : 'Light';

  // States
  const [userName, setUserName] = useState<string>('Satyam Singh');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [faceIDEnabled, setFaceIDEnabled] = useState<boolean>(false);
  const [selectedLockTime, setSelectedLockTime] = useState<string>('Immediately');
  // Modal States
  const [activePage, setActivePage] = useState<'Main' | 'Account' | 'EditName' | 'Reset'>('Main');
  const [showAutoLockSheet, setShowAutoLockSheet] = useState<boolean>(false);
  const [showThemeSheet, setShowThemeSheet] = useState<boolean>(false);

  // Load Data on Mount
  useEffect(() => {
    const loadSettings = async () => {
      const storedName = await AsyncStorage.getItem(Keys.userName);
      const storedImage = await AsyncStorage.getItem(Keys.userProfileImage);
      const storedFaceID = await AsyncStorage.getItem(Keys.faceIDEnabled);
      const storedLockTime = await AsyncStorage.getItem(Keys.selectedLockTime);

      if (storedName) setUserName(storedName);
      if (storedImage) setProfileImage(storedImage);
      if (storedFaceID) setFaceIDEnabled(storedFaceID === 'true');
      if (storedLockTime) setSelectedLockTime(storedLockTime);
    };
    loadSettings();
  }, []);

  // Biometrics Toggle Logic
  const handleFaceIDToggle = async (newValue: boolean) => {
    if (newValue) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert('Unavailable', 'Biometrics are not set up on this device.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable App Lock',
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        setFaceIDEnabled(true);
        AsyncStorage.setItem(Keys.faceIDEnabled, 'true');
      }
    } else {
      setFaceIDEnabled(false);
      AsyncStorage.setItem(Keys.faceIDEnabled, 'false');
    }
  };

  // RENDER ROUTER
  if (activePage === 'Account') {
    return (
      <AccountProfileView
        scheme={scheme}
        userName={userName}
        profileImage={profileImage}
        setProfileImage={setProfileImage}
        onBack={() => setActivePage('Main')}
        onEditName={() => setActivePage('EditName')}
      />
    );
  }

  if (activePage === 'EditName') {
    return (
      <EditNameView
        scheme={scheme}
        currentName={userName}
        onSave={(newName: string) => {
          setUserName(newName);
          AsyncStorage.setItem(Keys.userName, newName);
          setActivePage('Account');
        }}
        onBack={() => setActivePage('Account')}
      />
    );
  }

  if (activePage === 'Reset') {
    return <ResetAppView scheme={scheme} onBack={() => setActivePage('Main')} faceIDEnabled={faceIDEnabled} />;
  }

  // MAIN VIEW RENDER
  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.TextPrimary[scheme]} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.TextPrimary[scheme] }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 16, gap: 15 }}>
          
          {/* Profile Card */}
          <TouchableOpacity
            style={[styles.cardGroup, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}
            onPress={() => setActivePage('Account')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileAvatar} />
              ) : (
                <View style={[styles.profileAvatar, { backgroundColor: '#F7931A', justifyContent: 'center', alignItems: 'center' }]}>
                   <Ionicons name="logo-bitcoin" size={28} color="#FFF" />
                </View>
              )}
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 22, color: Colors.TextPrimary[scheme] }}>
                  {userName}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.TextSecondary[scheme]} />
            </View>
          </TouchableOpacity>

          {/* Preferences Group */}
          <View style={[styles.cardGroup, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}>
            
            {/* Face ID Row */}
            <View style={styles.rowItem}>
              <View style={styles.rowLeft}>
                <Ionicons name={Platform.OS === 'ios' ? "scan-outline" : "finger-print-outline"} size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>
                  {Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'App Lock'}
                </Text>
              </View>
              <Switch
                value={faceIDEnabled}
                onValueChange={handleFaceIDToggle}
                trackColor={{ false: '#767577', true: Colors.AppGreen?.[scheme] || '#34C759' }}
                ios_backgroundColor="#3e3e3e"
                style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }], marginTop: 17 }}
              />
            </View>

            {/* Auto Lock */}
            <TouchableOpacity 
              style={[styles.rowItem, { opacity: faceIDEnabled ? 1 : 0.5 }]} 
              disabled={!faceIDEnabled}
              onPress={() => setShowAutoLockSheet(true)}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="lock-closed-outline" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Auto lock</Text>
              </View>
              <View style={styles.rowRight}>
                {faceIDEnabled && <Text style={styles.rowValue}>{selectedLockTime}</Text>}
                <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.rowItem} onPress={() => setShowThemeSheet(true)}>
              <View style={styles.rowLeft}>
                <Ionicons name="sunny-outline" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Theme</Text>
              </View>
              <View style={styles.rowRight}>
                {/* Changed to displayThemeName */}
                <Text style={styles.rowValue}>{displayThemeName}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
              </View>
            </TouchableOpacity>

            {/* Reset App */}
            <TouchableOpacity style={styles.rowItem} onPress={() => setActivePage('Reset')}>
              <View style={styles.rowLeft}>
                <Ionicons name="trash-outline" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
                <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Reset App</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
            </TouchableOpacity>
          </View>

          {/* About Us Group */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 17, color: Colors.TextSecondary[scheme], marginLeft: 5 }}>
              About Us
            </Text>
            
            <View style={[styles.cardGroup, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}>
              
              <TouchableOpacity style={styles.rowItem} onPress={() => Linking.openURL('https://twitter.com')}>
                <View style={styles.rowLeft}>
                  <Ionicons name="logo-twitter" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
                  <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Follow Us</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.rowItem} onPress={() => Linking.openURL('https://t.me/')}>
                <View style={styles.rowLeft}>
                  <Ionicons name="chatbubble-outline" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
                  <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Feedback</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.rowItem}>
                <View style={styles.rowLeft}>
                  <Ionicons name="hand-left-outline" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
                  <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Privacy Policy</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
              </TouchableOpacity>

            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sheets */}
      <Modal visible={showAutoLockSheet} transparent animationType="slide">
        <AutoLockSheet scheme={scheme} selected={selectedLockTime} onSelect={(val: string) => { setSelectedLockTime(val); AsyncStorage.setItem(Keys.selectedLockTime, val); setShowAutoLockSheet(false); }} onClose={() => setShowAutoLockSheet(false)} />
      </Modal>

      <Modal visible={showThemeSheet} transparent animationType="slide">
        <ThemeSheet 
          scheme={scheme} 
          selected={displayThemeName} 
          onSelect={(val: string) => { 
            toggleTheme(val.toLowerCase() as Theme); 
            setShowThemeSheet(false); 
          }} 
          onClose={() => setShowThemeSheet(false)} 
        />
      </Modal>
    </View>
  );
}

// MARK: - ACCOUNT PROFILE VIEW
function AccountProfileView({ scheme, userName, profileImage, setProfileImage, onBack, onEditName }: AccountProfileViewProps) {
  const isDark = scheme === 'dark';

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
      AsyncStorage.setItem(Keys.userProfileImage, result.assets[0].uri);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.TextPrimary[scheme]} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.TextPrimary[scheme] }]}>Account</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ paddingHorizontal: 16, alignItems: 'center', marginTop: 20 }}>
        
        {/* Avatar Picker */}
        <View style={{ position: 'relative', marginBottom: 20 }}>
          {profileImage ? (
             <Image source={{ uri: profileImage }} style={styles.largeAvatar} />
          ) : (
             <View style={[styles.largeAvatar, { backgroundColor: '#F7931A', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="logo-bitcoin" size={60} color="#FFF" />
             </View>
          )}
          <TouchableOpacity style={[styles.editBadge, { backgroundColor: isDark ? '#333' : '#E5E5EA', borderColor: Colors.AppBackground[scheme] }]} onPress={pickImage}>
            <Ionicons name="pencil" size={16} color={Colors.TextPrimary[scheme]} />
          </TouchableOpacity>
        </View>

        {/* Name Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 30 }} onPress={onEditName}>
          <Text style={{ fontFamily: 'Inter-Bold', fontSize: 26, color: Colors.TextPrimary[scheme] }}>{userName}</Text>
          <Ionicons name="create-outline" size={20} color={Colors.TextSecondary[scheme]} />
        </TouchableOpacity>

        {/* Action Group */}
        <View style={[styles.cardGroup, { width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}>
          <TouchableOpacity style={styles.rowItem}>
            <View style={styles.rowLeft}>
              <Ionicons name="shield-checkmark" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
              <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Account & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem}>
            <View style={styles.rowLeft}>
              <Ionicons name="key" size={22} color={Colors.TextPrimary[scheme]} style={styles.rowIcon} />
              <Text style={[styles.rowText, { color: Colors.TextPrimary[scheme] }]}>Master Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.TextSecondary[scheme]} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// MARK: - EDIT NAME VIEW
function EditNameView({ scheme, currentName, onSave, onBack }: EditNameViewProps) {
  const [tempName, setTempName] = useState<string>(currentName);
  const isDark = scheme === 'dark';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={24} color={Colors.TextPrimary[scheme]} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: Colors.TextPrimary[scheme] }]}>Change Name</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 20, flex: 1 }}>
            <Text style={{ fontFamily: 'Inter-Medium', fontSize: 14, color: Colors.TextSecondary[scheme], marginBottom: 8, marginLeft: 4 }}>
              Full Name
            </Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                color: Colors.TextPrimary[scheme],
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
              }]}
              value={tempName}
              onChangeText={setTempName}
              autoFocus
            />

            <Spacer />

            <TouchableOpacity 
              style={[
                styles.primaryButton, 
              { 
              opacity: tempName.trim().length === 0 ? 0.6 : 1,
              marginBottom: 10, 
              flex: 0, 
              height: 56 
            }
              ]}
               disabled={tempName.trim().length === 0}
               onPress={() => onSave(tempName.trim())}
               >
                <Text style={styles.primaryButtonText}>Confirm</Text>
               </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// MARK: - RESET APP VIEW
function ResetAppView({ scheme, onBack, faceIDEnabled }: ResetAppViewProps) {
  const handleReset = async () => {
    if (faceIDEnabled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm authentication to reset the app.',
        fallbackLabel: 'Use Passcode',
      });
      if (!result.success) return;
    }
    
    // Perform Reset
    console.log("Resetting app data...");
    await AsyncStorage.clear();
    Alert.alert("Reset Complete", "The app has been reset.");
    onBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <View style={[styles.header, { justifyContent: 'flex-start' }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={Colors.TextPrimary[scheme]} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 26, marginTop: -40 }}>
        <View style={styles.trashCircle}>
          <Ionicons name="trash" size={32} color={Colors.FluxorPurple[scheme]} />
        </View>
        <Text style={{ fontFamily: 'Inter-Bold', fontSize: 26, color: Colors.TextPrimary[scheme], marginTop: 20, marginBottom: 12 }}>
          Reset App
        </Text>
        <Text style={{ fontFamily: 'Inter-Regular', fontSize: 16, color: Colors.TextSecondary[scheme], textAlign: 'center', lineHeight: 22 }}>
          Resetting your account deletes app data. Funds remain accessible by signing in again with the same email or social account.
        </Text>
      </View>

         <View style={{ 
           paddingHorizontal: 20, 
           paddingBottom: 20, 
           flexDirection: 'row', 
           gap: 12 
         }}>
           <TouchableOpacity 
             style={[
              styles.resetSecondaryButton, 
               { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#E5E5EA' }
             ]} 
             onPress={onBack}
           >
             <Text style={[styles.primaryButtonText, { color: Colors.TextPrimary[scheme] }]}>Cancel</Text>
           </TouchableOpacity>
  
           <TouchableOpacity 
             style={styles.resetPrimaryButton} 
             onPress={handleReset}
           >
             <Text style={styles.primaryButtonText}>Continue</Text>
           </TouchableOpacity>
       </View>
    </View>
  );
}

// MARK: - BOTTOM SHEETS
const BottomSheetWrapper = ({ children, onClose, scheme }: BottomSheetWrapperProps) => (
  <View style={styles.sheetOverlay}>
    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
    <View style={[styles.sheetContent, { backgroundColor: Colors.AppBackground[scheme] }]}>
      <View style={styles.sheetDragIndicator} />
      {children}
    </View>
  </View>
);

function AutoLockSheet({ scheme, selected, onSelect, onClose }: SheetProps) {
  const options = ["Immediately", "5 mins", "15 mins", "1 hour", "4 hours"];
  const isDark = scheme === 'dark';

  return (
    <BottomSheetWrapper scheme={scheme} onClose={onClose}>
      <Text style={[styles.sheetTitle, { color: Colors.TextPrimary[scheme] }]}>Auto lock time</Text>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {options.map((opt: string) => (
          <TouchableOpacity 
            key={opt} 
            style={[styles.sheetRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}
            onPress={() => onSelect(opt)}
          >
            <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.TextPrimary[scheme] }}>{opt}</Text>
            {selected === opt && <Ionicons name="checkmark" size={20} color={Colors.AppGreen?.[scheme] || '#34C759'} style={{ fontWeight: 'bold' as any }} />}
          </TouchableOpacity>
        ))}
      </View>
      <Spacer />
    </BottomSheetWrapper>
  );
}

function ThemeSheet({ scheme, selected, onSelect, onClose }: SheetProps) {
  const themes = [
    { code: "Light", icon: "sunny-outline" },
    { code: "Dark", icon: "moon-outline" }
  ];
  const isDark = scheme === 'dark';

  return (
    <BottomSheetWrapper scheme={scheme} onClose={onClose}>
      <Text style={[styles.sheetTitle, { color: Colors.TextPrimary[scheme] }]}>Theme mode</Text>
      <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 40 }}>
        {themes.map(t => (
          <TouchableOpacity 
            key={t.code} 
            style={[styles.sheetRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}
            onPress={() => onSelect(t.code)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
              <Ionicons name={t.icon as any} size={22} color={Colors.TextPrimary[scheme]} />
              <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 19, color: Colors.TextPrimary[scheme] }}>{t.code}</Text>
            </View>
            {selected === t.code && <Ionicons name="checkmark" size={20} color={Colors.AppGreen?.[scheme] || '#34C759'} style={{ fontWeight: 'bold' as any }} />}
          </TouchableOpacity>
        ))}
      </View>
    </BottomSheetWrapper>
  );
}

// MARK: - HELPERS
const Spacer = () => <View style={{ flex: 1 }} />;

// MARK: - STYLES
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingTop: Platform.OS === 'ios' ? 65 : 20, 
    paddingBottom: 20, 
  },
  headerTitle: { 
    fontFamily: 'Inter-Bold', 
    fontSize: 20, 
    textAlign: 'center' 
  },
  
  cardGroup: { 
    borderRadius: 20, 
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  
  rowItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    height: 60, // Slightly taller for better touch targets
    paddingHorizontal: 16 
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, },
  rowIcon: { width: 32, marginRight: 12 }, // Fixed width and margin for alignment
  rowText: { 
    fontFamily: 'Inter-SemiBold', 
    fontSize: 18 
  },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { 
    fontFamily: 'Inter-Medium', 
    fontSize: 16, 
    color: '#8E8E93',
    marginRight: 4 
  },

  profileAvatar: { 
    width: 56, // Larger avatar to match screenshot
    height: 56, 
    borderRadius: 28 
  },

  sectionHeader: { 
    fontFamily: 'Inter-SemiBold', 
    fontSize: 16, 
    color: '#8E8E93', // Matches the grey "About Us" text
    marginLeft: 4,
    marginBottom: 8,
    marginTop: 10
  },

  largeAvatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(150,150,150,0.1)' },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },

  textInput: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },

  resetPrimaryButton: { 
    flex: 1, 
    height: 56, 
    borderRadius: 16, 
    backgroundColor: '#A020F0', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  resetSecondaryButton: { 
    flex: 1, 
    height: 56, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  trashCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: 'rgba(160, 32, 240, 0.1)', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 20
  },

  primaryButton: { height: 52, borderRadius: 16, backgroundColor: '#A020F0', justifyContent: 'center', alignItems: 'center' },
  secondaryButton: { flex: 1, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFF' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300, maxHeight: '80%' },
  sheetDragIndicator: { width: 36, height: 5, backgroundColor: 'rgba(150,150,150,0.4)', borderRadius: 3, alignSelf: 'center', marginTop: 10, marginBottom: 15 },
  sheetTitle: { fontFamily: 'Inter-Bold', fontSize: 22, textAlign: 'center', marginBottom: 20 },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 15 },
});