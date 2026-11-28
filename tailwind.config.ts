import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          soft: 'rgb(var(--fg-soft) / <alpha-value>)',
          mute: 'rgb(var(--fg-mute) / <alpha-value>)',
        },
        spark: {
          cyan: '#38e1e6',
          blue: '#4f9dff',
          violet: '#a479ff',
          amber: '#ffc266',
          green: '#46e6a0',
          coral: '#ff7d6b',
          pink: '#ff79c6',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(56, 225, 230, 0.18), 0 0 32px -6px rgba(56, 225, 230, 0.35)',
        'glow-sm': '0 0 18px -4px rgba(56, 225, 230, 0.45)',
        panel: '0 24px 60px -28px rgba(0, 0, 0, 0.85)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(120,170,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,.055) 1px, transparent 1px)',
        'grid-lg':
          'linear-gradient(rgba(120,170,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,.06) 1px, transparent 1px)',
        radial:
          'radial-gradient(60% 50% at 50% 0%, rgba(56,225,230,.10), transparent 70%)',
      },
      backgroundSize: {
        grid: '24px 24px',
        'grid-lg': '96px 96px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(56,225,230,.35)' },
          '70%': { boxShadow: '0 0 0 12px rgba(56,225,230,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(56,225,230,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        dash: {
          to: { strokeDashoffset: '-24' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .6s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .5s ease both',
        float: 'float 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(.2,.7,.2,1) infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        dash: 'dash 1s linear infinite',
        'spin-slow': 'spin-slow 14s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
