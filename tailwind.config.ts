import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep navy scale, retints every existing gray-* class into the TCG theme.
        gray: {
          50: '#f4f6ff', 100: '#e6eafb', 200: '#cdd5f3', 300: '#a9b5e0', 400: '#8190bf',
          500: '#7885b5', 600: '#5f6c9c', 700: '#394472', 800: '#1f2848', 900: '#141b36', 950: '#0a0f21',
        },
        // Electric trading-card yellow.
        yellow: {
          50: '#fffbe0', 100: '#fff4b3', 200: '#ffec80', 300: '#ffe14d', 400: '#ffd726',
          500: '#ffcb05', 600: '#e0b000', 700: '#b88a00', 800: '#8a6700', 900: '#5c4500', 950: '#332600',
        },
        poke: {
          blue: '#3b4cca',
          'blue-light': '#6b7cff',
          red: '#ee3b3b',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 24px -8px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(255,203,5,0.35), 0 0 24px -4px rgba(255,203,5,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
