/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // status colors always paired with text/icon (constitution IX — never color-only).
        risk: '#b91c1c',
      },
    },
  },
  plugins: [],
};
