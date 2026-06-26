import type { Config } from 'tailwindcss';
import hlmPreset from '@spartan-ng/brain/hlm-tailwind-preset';

export default {
  presets: [hlmPreset],
  content: ['./src/**/*.{ts,html}'],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#0a0e17',
        },
        earth: {
          accent: '#38bdf8',
          orange: '#ff5722',
          yellow: '#fbbf24',
          green: '#10b981',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
} satisfies Config;
