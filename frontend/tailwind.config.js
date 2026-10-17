/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral charcoal surfaces, tuned for a dim control room: dark
        // enough not to light up the booth, never pure black, and with
        // only a trace of blue so status colours read true against it.
        // 950 is the page, 900 a panel, 850/800 insets and controls,
        // 750-600 borders, pressed states and scrollbars.
        panel: {
          950: '#0b0d10',
          900: '#111418',
          850: '#161a1f',
          800: '#1b2026',
          750: '#232930',
          700: '#2d343c',
          600: '#3c444e',
        },
        // Equipment status. One meaning per colour, everywhere:
        // ok = operational, warn = needs attention, fault = critical,
        // idle = offline / unavailable, busy = transitioning or pending.
        status: {
          ok: '#22c55e',
          warn: '#eab308',
          fault: '#ef4444',
          idle: '#6b7280',
          busy: '#38bdf8',
          unknown: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(0,0,0,0.35)',
        overlay: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // A slow breathing dot for warm-up / cool-down. Deliberately calmer
        // than animate-ping: it marks a state, it is not an alarm.
        breathe: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
        breathe: 'breathe 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
