/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        kern: {
          surface: '#faf9f5',
          'surface-low': '#f4f4ef',
          'surface-container': '#edeee8',
          'surface-highest': '#e0e4db',
          ink: '#2f342e',
          muted: '#5c605a',
          primary: '#496360',
          'primary-container': '#cbe8e3',
          danger: '#9f403d',
        }
      },
      fontFamily: {
        heading: ['Newsreader_600SemiBold', 'serif'],
        body: ['Newsreader_400Regular', 'serif'],
        label: ['Inter_400Regular', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
