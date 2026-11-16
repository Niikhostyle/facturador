/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf6f3',
          100: '#fbeae3',
          500: '#c45a2c',
          600: '#b24a21',
          700: '#943c1a',
        },
        ink: {
          700: '#1e2a3b',
          800: '#152033',
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-sora)', 'Segoe UI', 'sans-serif'],
      },
      backgroundImage: {
        'app-grid': 'linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px)',
      },
      backgroundSize: {
        'app-grid': '24px 24px',
      },
    },
  },
  plugins: [],
};
