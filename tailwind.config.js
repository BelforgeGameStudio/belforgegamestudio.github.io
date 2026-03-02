/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.html",
    "./partials/**/*.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        // Core dark theme
        'dark': {
          DEFAULT: '#0d0d0f',
          'card': '#161619',
          'hover': '#1c1c20',
        },
        // Accent orange
        'accent': {
          DEFAULT: '#e85d04',
          'glow': 'rgba(232, 93, 4, 0.15)',
          'hover': '#ff6a0a',
        },
        // Text colors
        'text': {
          DEFAULT: '#f0f0f0',
          'muted': '#888888',
          'dim': '#666666',
        },
        // Border
        'border': {
          DEFAULT: '#2a2a2e',
          'light': '#3a3a3e',
        },
        // Semantic
        'error': '#f72585',
        'warning': '#f39c12',
      },
      fontFamily: {
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'display': ['Space Grotesk', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        'xs': ['11px', '16px'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '100': '25rem',
      },
      borderRadius: {
        'DEFAULT': '6px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(232, 93, 4, 0.15)',
        'card': '0 20px 40px rgba(0, 0, 0, 0.3)',
      },
      backdropBlur: {
        'nav': '12px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease',
        'slide-up': 'slideUp 0.3s ease',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
