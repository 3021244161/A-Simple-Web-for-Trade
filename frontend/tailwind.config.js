/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fluent: {
          blue: '#3b82f6',
          hover: '#2563eb',
          pressed: '#1d4ed8',
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          text: {
            primary: '#f8fafc',
            secondary: '#cbd5e1',
            tertiary: '#94a3b8',
          }
        },
        crown: {
          dark: '#020617',
          light: '#0f172a',
          accent: '#3b82f6', 
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'fluent-gradient': 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
        'city-skyline': "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')",
      },
      boxShadow: {
        'fluent-card': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'fluent-flyout': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
        'fluent-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'fluent-enter': 'fluentEnter 300ms cubic-bezier(0.1, 0.9, 0.2, 1) forwards',
      },
      keyframes: {
        fluentEnter: {
          '0%': { opacity: 0, transform: 'translateY(10px) scale(0.98)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        }
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
