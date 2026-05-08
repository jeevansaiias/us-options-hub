import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'rgb(15 18 26)',
          elev: 'rgb(22 26 36)',
          subtle: 'rgb(28 33 45)',
        },
        border: {
          DEFAULT: 'rgb(46 53 70)',
          subtle: 'rgb(36 42 56)',
        },
        text: {
          primary: 'rgb(229 233 245)',
          secondary: 'rgb(165 174 195)',
          muted: 'rgb(126 137 161)',
          dim: 'rgb(94 104 128)',
        },
        brand: {
          green: 'rgb(46 196 142)',
          red: 'rgb(225 95 95)',
          amber: 'rgb(238 184 88)',
          blue: 'rgb(99 162 232)',
          cyan: 'rgb(34 211 238)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
