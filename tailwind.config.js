/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './src/**/*.{html,js,jsx,ts,tsx}',  // This includes all React files and other relevant files
      './public/index.html',  // This includes the index.html file in your public directory
    ],
    theme: {
      extend: {
        animation: {
          'fadeIn': 'fadeIn 0.5s ease-out forwards',
          'slideIn': 'slideIn 0.5s ease-out forwards',
          'scaleIn': 'scaleIn 0.5s ease-out forwards',
        },
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0' },
            '100%': { opacity: '1' },
          },
          slideIn: {
            '0%': { opacity: '0', transform: 'translateY(10px)' },
            '100%': { opacity: '1', transform: 'translateY(0)' },
          },
          scaleIn: {
            '0%': { opacity: '0', transform: 'scale(0.95)' },
            '100%': { opacity: '1', transform: 'scale(1)' },
          },
        },
      },
    },
    plugins: [],
  };
  