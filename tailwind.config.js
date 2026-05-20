/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy:   '#0A0E1A',
        card:   '#0F1629',
        teal:   '#00D4AA',
        danger: '#FF3B30',
        amber:  '#FFB300',
        muted:  '#888888',
      },
    },
  },
  plugins: [],
}
