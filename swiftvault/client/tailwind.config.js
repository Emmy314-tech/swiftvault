/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#F5F1FE",
          100: "#EBE4FD",
          200: "#D6C9FB",
          300: "#B79EF7",
          400: "#9570F5",
          500: "#7C4FF4",
          600: "#6C3EF4", // Royal Purple - brand primary
          700: "#5A2FD1",
          800: "#4A26AA",
          900: "#3B1F86",
        },
        success: { DEFAULT: "#22C55E", light: "#DCFCE7", dark: "#15803D" },
        error: { DEFAULT: "#EF4444", light: "#FEE2E2", dark: "#B91C1C" },
        warning: { DEFAULT: "#F59E0B", light: "#FEF3C7", dark: "#B45309" },
        info: { DEFAULT: "#3B82F6", light: "#DBEAFE", dark: "#1D4ED8" },
        surface: "#F8FAFC",     // app background
        card: "#FFFFFF",
        "text-primary": "#111827",
        "text-secondary": "#6B7280",
        borderc: "#E5E7EB",
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
        "slide-in-right": "slideInRight 0.25s ease-out",
        shimmer: "shimmer 1.5s infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideUp: {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: 0, transform: "translateX(16px)" },
          "100%": { opacity: 1, transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
    },
  },
  plugins: [],
}
