/** @type {import('tailwindcss').Config} */
// Design tokens — see specs/design/ui-ux-design-system.md. Warm clinical illustration aesthetic
// drawn from the reviewed images. Status is NEVER color-only (constitution IX) — pair text+icon.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F1E7',
        surface: { DEFAULT: '#FCFAF4', sunken: '#F1EADB' },
        border: '#E3D9C6',
        ink: { DEFAULT: '#3A3A32', soft: '#6B6557' },
        primary: { DEFAULT: '#6F7D58', deep: '#3F4A33', tint: '#E8EBDD' },
        accent: { DEFAULT: '#B5524A', deep: '#8F3B34', tint: '#F4E4E1' },
        wood: '#C9A66B',
        warn: { DEFAULT: '#ECDB7E', deep: '#8A6D12', tint: '#FBF3D6' },
        // legacy alias kept so any old `risk` usage still resolves
        risk: '#B5524A',
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', 'system-ui', '-apple-system', 'sans-serif'],
        brand: ['"LXGW WenKai TC"', '"Noto Sans TC"', 'sans-serif'],
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
      boxShadow: {
        soft: '0 1px 2px rgba(63,74,51,.06), 0 6px 16px rgba(63,74,51,.05)',
        'soft-lg': '0 2px 4px rgba(63,74,51,.07), 0 12px 28px rgba(63,74,51,.07)',
      },
    },
  },
  plugins: [],
};
