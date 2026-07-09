/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand greens
        agro: {
          50:  '#f0faf4',
          100: '#d8f3e2',
          200: '#b0e6c5',
          300: '#7dd0a3',
          400: '#4ab57f',
          500: '#2d6a4f', // Main brand green
          600: '#1b4332', // Deep forest green
          700: '#153827',
          800: '#0e2519',
          900: '#07120c',
          accent: '#52d68a',
          accentHover: '#38c47a',
        },
        // Accent: agricultural wheat/gold yellows
        gold: {
          50:  '#fefbf0',
          100: '#fdf2d0',
          200: '#fae69f',
          300: '#f5d265',
          400: '#e9bd31',
          500: '#d4a217', // Primary gold accent
          600: '#b08010',
          700: '#8c5e0b',
          800: '#6b4208',
          900: '#3f2505',
        },
        // Mono scale
        dark: {
          50:  '#f5f5f5',
          100: '#e8e8e8',
          200: '#d0d0d0',
          300: '#b0b0b0',
          400: '#808080',
          500: '#555555',
          600: '#3a3a3a',
          700: '#252525',
          800: '#141414',
          900: '#0a0a0a',
          950: '#050505',
        },
        // Status colors
        success: '#22c55e',
        warning: '#f59e0b',
        danger:  '#ef4444',
        info:    '#3b82f6',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-agro':    'linear-gradient(135deg, #1b4332 0%, #2d6a4f 50%, #4ab57f 100%)',
        'gradient-agro-v':  'linear-gradient(180deg, #1b4332 0%, #2d6a4f 100%)',
        'gradient-dark':    'linear-gradient(135deg, #0a0a0a 0%, #1b4332 100%)',
        'gradient-gold':    'linear-gradient(135deg, #d4a217 0%, #f5d265 100%)',
        'gradient-gold-r':  'linear-gradient(135deg, #f5d265 0%, #d4a217 100%)',
        'gradient-card':    'linear-gradient(135deg, #1b4332 0%, #153827 100%)',
        'gradient-hero':    'linear-gradient(160deg, #050505 0%, #0e2519 40%, #1b4332 75%, #2d6a4f 100%)',
        'gradient-glass':   'linear-gradient(135deg, rgba(27,67,50,0.85) 0%, rgba(45,106,79,0.6) 100%)',
        'gradient-surface': 'linear-gradient(180deg, #0e2519 0%, #07120c 100%)',
        'gradient-radial':  'radial-gradient(ellipse at center, #1b4332 0%, #07120c 70%)',
        'noise':            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-in':          'fadeIn 0.5s ease-out both',
        'fade-in-up':       'fadeInUp 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in-down':     'fadeInDown 0.5s ease-out both',
        'fade-in-left':     'fadeInLeft 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in-right':    'fadeInRight 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right':   'slideInRight 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-left':    'slideInLeft 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'bounce-soft':      'bounceSoft 2.5s ease-in-out infinite',
        'pulse-glow':       'pulseGlow 2.5s ease-in-out infinite',
        'pulse-glow-gold':  'pulseGlowGold 2.5s ease-in-out infinite',
        'shimmer':          'shimmer 2s linear infinite',
        'spin-slow':        'spin 6s linear infinite',
        'spin-reverse':     'spinReverse 8s linear infinite',
        'float':            'float 4s ease-in-out infinite',
        'float-delay':      'float 4s ease-in-out 2s infinite',
        'sway':             'sway 4s ease-in-out infinite',
        'scale-in':         'scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
        'scale-in-center':  'scaleInCenter 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both',
        'count-up':         'countUp 1s ease-out both',
        'border-glow':      'borderGlow 3s ease-in-out infinite',
        'gradient-shift':   'gradientShift 6s ease infinite',
        'ticker':           'ticker 20s linear infinite',
        'ripple':           'ripple 0.6s ease-out both',
        'swing':            'swing 3s ease-in-out infinite',
        'heartbeat':        'heartbeat 1.5s ease-in-out infinite',
        'slide-up-fade':    'slideUpFade 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'particle':         'particle 6s ease-in-out infinite',
        'morph':            'morph 8s ease-in-out infinite',
        'text-shimmer':     'textShimmer 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%':   { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeInRight: {
          '0%':   { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(50px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-50px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(45,106,79,0.3), 0 0 30px rgba(45,106,79,0.1)' },
          '50%':      { boxShadow: '0 0 40px rgba(45,106,79,0.7), 0 0 80px rgba(45,106,79,0.3)' },
        },
        pulseGlowGold: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(212,162,23,0.3)' },
          '50%':      { boxShadow: '0 0 50px rgba(212,162,23,0.8), 0 0 100px rgba(212,162,23,0.3)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '33%':      { transform: 'translateY(-15px) rotate(2deg)' },
          '66%':      { transform: 'translateY(-8px) rotate(-1deg)' },
        },
        sway: {
          '0%, 100%': { transform: 'rotate(-3deg) scale(1)' },
          '50%':      { transform: 'rotate(3deg) scale(1.05)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.7)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        scaleInCenter: {
          '0%':   { opacity: '0', transform: 'scale(0.5)' },
          '80%':  { transform: 'scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        countUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px) scale(0.8)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(45,106,79,0.3)' },
          '50%':      { borderColor: 'rgba(212,162,23,0.8)' },
        },
        gradientShift: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        ripple: {
          '0%':   { transform: 'scale(0)', opacity: '0.6' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
        swing: {
          '0%, 100%': { transform: 'rotate(-5deg)' },
          '50%':      { transform: 'rotate(5deg)' },
        },
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '14%':      { transform: 'scale(1.15)' },
          '28%':      { transform: 'scale(1)' },
          '42%':      { transform: 'scale(1.1)' },
          '56%':      { transform: 'scale(1)' },
        },
        slideUpFade: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        particle: {
          '0%':   { transform: 'translate(0, 0) scale(1)', opacity: '0.4' },
          '50%':  { transform: 'translate(20px, -30px) scale(1.2)', opacity: '0.8' },
          '100%': { transform: 'translate(-10px, 0) scale(1)', opacity: '0.4' },
        },
        morph: {
          '0%, 100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
          '50%':      { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' },
        },
        textShimmer: {
          '0%':   { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        spinReverse: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(-360deg)' },
        },
      },
      boxShadow: {
        'agro':     '0 4px 30px rgba(27,67,50,0.3)',
        'agro-lg':  '0 10px 50px rgba(27,67,50,0.5)',
        'agro-xl':  '0 20px 80px rgba(27,67,50,0.6)',
        'gold':     '0 4px 20px rgba(212,162,23,0.3)',
        'gold-lg':  '0 8px 40px rgba(212,162,23,0.4)',
        'gold-xl':  '0 15px 60px rgba(212,162,23,0.6)',
        'dark':     '0 4px 20px rgba(0,0,0,0.5)',
        'dark-lg':  '0 15px 50px rgba(0,0,0,0.7)',
        'glass':    '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        'glow-sm':  '0 0 15px rgba(45,106,79,0.4)',
        'glow':     '0 0 30px rgba(45,106,79,0.5)',
        'glow-lg':  '0 0 60px rgba(45,106,79,0.6)',
        'inner-green': 'inset 0 2px 8px rgba(45,106,79,0.3)',
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
      transitionTimingFunction: {
        'spring':       'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'smooth':       'cubic-bezier(0.22, 1, 0.36, 1)',
        'bounce-in':    'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
    },
  },
  plugins: [],
}
