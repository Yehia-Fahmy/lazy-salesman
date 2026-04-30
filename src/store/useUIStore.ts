import { create } from 'zustand';
import { DEFAULT_THEME } from '@/theme';
import type { ThemeName } from '@/types';

const TOKEN_KEY = 'lazysalesman.mapbox_token';
const THEME_KEY = 'lazysalesman.theme';

const readToken = (): string => {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

const readTheme = (): ThemeName => {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === 'spec' || v === 'warm' || v === 'dark') return v;
  } catch {
    /* noop */
  }
  return DEFAULT_THEME;
};

interface UIState {
  mapboxToken: string;
  theme: ThemeName;
  showSettings: boolean;
  showWizard: boolean;
  activeRouteId: string | null;
  openPopupStopId: string | null;
  visibleRoutes: Set<string>;

  setMapboxToken: (token: string) => void;
  setTheme: (theme: ThemeName) => void;
  setShowSettings: (open: boolean) => void;
  setShowWizard: (open: boolean) => void;
  setActiveRouteId: (id: string | null) => void;
  setOpenPopupStopId: (id: string | null) => void;
  toggleRouteVisibility: (id: string) => void;
  setVisibleRoutes: (set: Set<string>) => void;
}

export const useUIStore = create<UIState>((set) => ({
  mapboxToken: readToken(),
  theme: readTheme(),
  showSettings: false,
  showWizard: false,
  activeRouteId: null,
  openPopupStopId: null,
  visibleRoutes: new Set<string>(['unassigned']),

  setMapboxToken: (token) => {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
    set({ mapboxToken: token });
  },
  setTheme: (theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* noop */
    }
    set({ theme });
  },
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowWizard: (showWizard) => set({ showWizard }),
  setActiveRouteId: (activeRouteId) => set({ activeRouteId }),
  setOpenPopupStopId: (openPopupStopId) => set({ openPopupStopId }),
  toggleRouteVisibility: (id) =>
    set((s) => {
      const next = new Set(s.visibleRoutes);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { visibleRoutes: next };
    }),
  setVisibleRoutes: (visibleRoutes) => set({ visibleRoutes }),
}));
