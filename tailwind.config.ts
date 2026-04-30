import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: { panel: '6px', chip: '4px' },
      transitionTimingFunction: { ui: 'cubic-bezier(0.2, 0, 0, 1)' },
    },
  },
  plugins: [],
} satisfies Config;
