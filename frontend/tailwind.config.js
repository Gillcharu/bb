/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          50: "#F3F8FD",
          100: "#E4EEF9",
          600: "#1B5A9E",
          700: "#144272",
          900: "#0B2447",
          DEFAULT: "#0B2447",
        },
        neutral: {
          0: "#FFFFFF",
          100: "#F2F4F7",
          300: "#D0D5DD",
          500: "#667085",
          700: "#344054",
          900: "#101828",
        },
        success: {
          100: "#D6F0E6",
          600: "#12805C",
          DEFAULT: "#12805C",
        },
        warning: {
          100: "#FCE9D2",
          600: "#B54708",
          DEFAULT: "#B54708",
        },
        danger: {
          100: "#FBDAD7",
          600: "#B42318",
          DEFAULT: "#B42318",
        },
        info: {
          100: "#DCE7FA",
          600: "#175CD3",
          DEFAULT: "#175CD3",
        },
        rank1: {
          100: "#EDE7FE",
          600: "#7A5AF8",
          DEFAULT: "#7A5AF8",
        }
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}
