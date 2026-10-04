import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
