import type { ThemeName, ThemeTokens } from '@/types';

export const THEMES: Record<ThemeName, ThemeTokens> = {
  spec: {
    name: 'Spec (neutral)',
    chrome: '#FAFAFA',
    sidebar: '#F4F4F5',
    mapBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    popupBg: '#FFFFFF',
    border: '#E4E4E7',
    hoverBg: '#F0F0F1',
    textPrimary: '#18181B',
    textSecondary: '#71717A',
    textTertiary: '#A1A1AA',
    accent: '#2563EB',
  },
  warm: {
    name: 'Warm off-white',
    chrome: '#FAF8F5',
    sidebar: '#F3F0EB',
    mapBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    popupBg: '#FEFCF9',
    border: '#E6E0D6',
    hoverBg: '#EDE8E1',
    textPrimary: '#1C1917',
    textSecondary: '#78716C',
    textTertiary: '#A8A29E',
    accent: '#C2410C',
  },
  dark: {
    name: 'Dark',
    chrome: '#18181B',
    sidebar: '#1C1C1F',
    mapBg: '#09090B',
    inputBg: '#27272A',
    popupBg: '#27272A',
    border: '#3F3F46',
    hoverBg: '#27272A',
    textPrimary: '#FAFAFA',
    textSecondary: '#A1A1AA',
    textTertiary: '#71717A',
    accent: '#3B82F6',
  },
};

export const ROUTE_PALETTE = [
  '#2563EB',
  '#16A34A',
  '#EA580C',
  '#7C3AED',
  '#0891B2',
  '#E11D48',
  '#CA8A04',
  '#DB2777',
  '#475569',
  '#854D0E',
];

export const DEFAULT_THEME: ThemeName = 'warm';
