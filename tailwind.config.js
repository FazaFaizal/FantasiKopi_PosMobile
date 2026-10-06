/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#D1001F",
        "primary-dark": "#8F0016",
        "primary-soft": "#FEE2E2",
        secondary: "#F59E0B",
        "secondary-dark": "#B45309",
        "secondary-soft": "#FEF3C7",
        background: "#FFF7F5",
        surface: "#FFFFFF",
        text: "#1F2937",
        muted: "#6B7280",
        line: "#E5E7EB",
        success: "#166534",
        "success-soft": "#DCFCE7",
        danger: "#991B1B",
        "danger-soft": "#FEE2E2",
        warning: "#B45309",
        "warning-soft": "#FEF3C7",
      },
      fontFamily: {
        heading: ["Poppins-Bold", "sans-serif"],
        "heading-semibold": ["Poppins-SemiBold", "sans-serif"],
        "heading-regular": ["Poppins-Regular", "sans-serif"],
        body: ["Inter-Regular", "sans-serif"],
        "body-medium": ["Inter-Medium", "sans-serif"],
        "body-semibold": ["Inter-SemiBold", "sans-serif"],
      },
      borderRadius: {
        card: "24px",
        button: "16px",
        input: "16px",
        chip: "12px",
      },
    },
  },
  plugins: [],
};

