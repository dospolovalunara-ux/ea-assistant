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
        brand: {
          50:  '#f0f4ff',
          100: '#dde6ff',
          200: '#c3d0ff',
          300: '#9ab1ff',
          400: '#6b88ff',
          500: '#4361ee',
          600: '#2d47d4',
          700: '#2537b0',
          800: '#222f8c',
          900: '#1e296e',
        }
      }
    }
  },
  plugins: [],
}
export default config
