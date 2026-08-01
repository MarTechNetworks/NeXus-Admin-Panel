/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--surface)',
          muted: 'var(--surface-muted)',
        },
        border: 'var(--border)',
        ring: 'var(--ring)',
        accent: {
          DEFAULT: 'var(--accent)',
          secondary: 'var(--accent-secondary)',
          success: 'var(--accent-success)',
          warning: 'var(--accent-warning)',
          error: 'var(--accent-error)',
        },
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-hover': 'var(--bg-hover)',
        'border-primary': 'var(--border-primary)',
        'border-secondary': 'var(--border-secondary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
      },
      spacing: {
        sidebar: '16rem',
        'sidebar-collapsed': '4rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '0' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '0' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '0' }],
        display: ['2.75rem', { lineHeight: '1.05', letterSpacing: '0' }],
      },
      boxShadow: {
        card: '0 18px 50px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
        'card-dark': '0 24px 70px rgba(0, 0, 0, 0.38)',
        glow: '0 0 0 1px rgba(56, 189, 248, 0.18), 0 18px 40px rgba(56, 189, 248, 0.12)',
        'glow-lg': '0 0 0 1px rgba(56, 189, 248, 0.24), 0 24px 70px rgba(124, 58, 237, 0.16)',
      },
    },
  },
  plugins: [],
}
