/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark charcoal base, tuned for legibility at night during a show
        // without the glare of a pure-black panel.
        panel: {
          950: '#0a0c10',
          900: '#0f1217',
          850: '#141820',
          800: '#1a1f29',
          750: '#222836',
          700: '#2b3242',
          600: '#3a4356',
        },
        status: {
          ok: '#22c55e',
          warn: '#f59e0b',
          fault: '#ef4444',
          idle: '#64748b',
          busy: '#38bdf8',
          unknown: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
}
