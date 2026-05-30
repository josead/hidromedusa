/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./client/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        ocean: {
          950: "#020b18",
          900: "#040e1f",
          800: "#071529",
          700: "#0a1e3a",
          600: "#0d2650",
          500: "#0e3166",
          400: "#1a4a8a",
          300: "#2563a8",
          200: "#3b82c4",
          100: "#60aee0",
        },
        jelly: {
          900: "#1a0533",
          800: "#2d0a5c",
          700: "#3f1080",
          600: "#5b17b8",
          500: "#7c2fd6",
          400: "#9b4eea",
          300: "#b87cf7",
          200: "#d4a8ff",
          100: "#edd4ff",
        },
        biolum: {
          cyan: "#00f5ff",
          teal: "#00e5d4",
          violet: "#bf5aff",
          pink: "#ff2d9e",
          gold: "#ffd700",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      backgroundImage: {
        "deep-ocean": "linear-gradient(180deg, #020b18 0%, #040e1f 40%, #071529 100%)",
        "jelly-glow": "radial-gradient(ellipse at center, rgba(124,47,214,0.3) 0%, transparent 70%)",
        "biolum-glow": "radial-gradient(ellipse at center, rgba(0,245,255,0.15) 0%, transparent 60%)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
        drift: "drift 8s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        drift: {
          "0%, 100%": { transform: "translateX(0px) rotate(0deg)" },
          "33%": { transform: "translateX(10px) rotate(2deg)" },
          "66%": { transform: "translateX(-8px) rotate(-1deg)" },
        },
      },
    },
  },
  plugins: [],
};
