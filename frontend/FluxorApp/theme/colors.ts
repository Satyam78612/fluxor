export const Colors = {
  FluxorPurple: {
    light: '#C05CFF',
    dark:  '#C05CFF',
  },
  TextSecondary: {
    light: '#6C6C6D',
    dark:  '#9A9A9E',
  },
  CardBackground: {
    light: '#FFFFFF',
    dark:  '#141414',
  },
  EarnCard: {
    light: '#E8ECEF',
    dark:  '#1C1C1E',
  },
  TextPrimary: {
    light: '#000000',
    dark:  '#FFFFFF',
  },
  AppBackground: {
    light: '#FFFFFF',
    dark:  '#121212',
  },
  SwapCardBackground: {
    light: '#EFF2F2',
    dark:  '#1F2024',
  },
  HistoryCard: {
    light: '#E5E8EB',
    dark:  '#1C1E21',
  },
  AppRed: {
    light: '#F23645',
    dark:  '#F23645',
  },
  AppGreen: {
    light: '#2CD73C',
    dark:  '#2CD73C',
  },
  DividerColor: {
    light: '#E5E5E7',
    dark:  '#2A2B30',
  },
} as const;

export type ColorKey = keyof typeof Colors;
