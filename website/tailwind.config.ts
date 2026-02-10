import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#407076',
        secondary: '#698996',
        background: '#FFEEDD',
        accent: '#FFD8BE',
        surface: '#F8F7FF',
      },
    },
  },
  plugins: [],
}
export default config
