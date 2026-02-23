/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{ts,tsx}'],
    darkMode: 'class', // Enable class-based dark mode (controlled by extension theme setting)
    theme: {
        extend: {
            colors: {
                'ln-sky-400': '#38bdf8',
                'ln-sky-500': '#0ea5e9',
                'ln-sky-600': '#0284c7',
            },
        },
    },
    plugins: [],
};
