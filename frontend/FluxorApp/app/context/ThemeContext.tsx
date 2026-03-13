import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (newTheme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemTheme = useColorScheme() as Theme;
  const [theme, setTheme] = useState<Theme>(systemTheme);

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem('selectedTheme');
      if (savedTheme) setTheme(savedTheme.toLowerCase() as Theme);
    };
    loadTheme();
  }, []);

  const toggleTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    AsyncStorage.setItem('selectedTheme', newTheme.toUpperCase());
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

export default function ThemeContextRoute() {
  return null;
}