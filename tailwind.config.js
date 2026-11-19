/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdede5',
          100: '#fbeae3',
          200: '#f6d0c0',
          500: '#ff6b35',
          600: '#ba3f16',
          700: '#9f3412',
        },
        fiscal: {
          DEFAULT: '#1a2b5c',
          soft: '#e5eaf6',
          deep: '#0d1838',
          raise: '#1c2b57',
          on: '#eef1f9',
          muted: '#98a4c4',
        },
        ink: {
          700: '#1e2a3b',
          800: '#152033',
          900: '#0f1a36',
        },
        canvas: '#f3f4f8',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex)', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-bricolage)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,26,54,.06),0 1px 1px rgba(15,26,54,.04)',
        lift: '0 8px 20px -8px rgba(15,26,54,.14),0 2px 4px rgba(15,26,54,.05)',
      },
      backgroundImage: {
        'app-grid':
          'linear-gradient(to right, rgba(26,43,92,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,43,92,0.07) 1px, transparent 1px)',
      },
      backgroundSize: {
        'app-grid': '24px 24px',
      },
    },
  },
  plugins: [],
};
