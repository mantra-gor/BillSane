/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Tabular figures for money columns, totals and counters so digits
        // never jitter as values change.
        numeric: [
          "SF Mono",
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        prussian_blue: {
          DEFAULT: "#053247",
          5: "#ECF8FE",
          25: "#B1E2FB",
          50: "#8BD4F9",
          100: "#64C6F7",
          200: "#54C0F2",
          300: "#3DB8F5",
          400: "#16A9F3",
          500: "#0B92D5",
          600: "#0977AE",
          700: "#075D88",
          800: "#054261",
          900: "#03283A",
          950: "#010D13",
        },
        munsell_blue: {
          DEFAULT: "#298E9E",
          5: "#DEF5F7",
          25: "#DEF5F7",
          50: "#BDEBEF",
          100: "#F5F9F9",
          200: "#E9F3F4",
          300: "#5BCDD7",
          400: "#3AC3CF",
          500: "#2CA9B5",
          600: "#248A94",
          700: "#1C6C73",
          800: "#144D52",
          900: "#0C2E31",
          950: "#040F10",
        },
        primary: {
          DEFAULT: "#F7F7F7",
          5: "#EBEBEB",
          25: "#E0E0E0",
          50: "#D6D6D6",
          100: "#C2C2C2",
          200: "#ADADAD",
          300: "#999999",
          400: "#858585",
          500: "#707070",
          600: "#5C5C5C",
          700: "#474747",
          800: "#333333",
          900: "#1F1F1F",
          950: "#141414",
        },

        // --- Semantic layer -------------------------------------------------
        // Everything new should reach for these rather than raw brand ramps.
        // `shell` is the dark navy chrome (sidebar / auth panel); `surface`
        // covers the light content planes stacked on top of `canvas`.
        shell: {
          DEFAULT: "#062639",
          raised: "#0B3A54",
          hover: "#0E4763",
          border: "#14536F",
        },
        canvas: "#F1F5F9",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#F8FAFC",
          muted: "#F1F5F9",
          sunken: "#E9EFF5",
        },
        line: {
          DEFAULT: "#E3EAF1",
          strong: "#CBD8E3",
          faint: "#EEF3F8",
        },
        ink: {
          DEFAULT: "#0C2231",
          soft: "#3F5769",
          muted: "#64798B",
          faint: "#93A5B4",
          invert: "#FFFFFF",
        },
        success: {
          DEFAULT: "#0E9F6E",
          soft: "#E6F6F0",
          border: "#A7E3CD",
          ink: "#07603F",
        },
        warning: {
          DEFAULT: "#C77700",
          soft: "#FDF4E3",
          border: "#F2D8A0",
          ink: "#7A4A00",
        },
        danger: {
          DEFAULT: "#DC2B2B",
          soft: "#FDECEC",
          border: "#F5B9B9",
          ink: "#8E1616",
        },
        info: {
          DEFAULT: "#2A78D6",
          soft: "#EAF2FD",
          border: "#B7D3F5",
          ink: "#17457F",
        },
      },
      borderColor: {
        // Bare `border` across the app picks up the design-system hairline
        // instead of Tailwind's default gray-200.
        DEFAULT: "#E3EAF1",
      },
      borderRadius: {
        "4xl": "1.75rem",
      },
      boxShadow: {
        // A short, deliberate elevation scale — low-spread ambient shadows that
        // read as depth on the near-white canvas without looking smudged.
        xs: "0 1px 2px 0 rgba(12, 34, 49, 0.05)",
        card: "0 1px 2px 0 rgba(12, 34, 49, 0.04), 0 1px 3px 0 rgba(12, 34, 49, 0.06)",
        raised:
          "0 2px 4px -1px rgba(12, 34, 49, 0.06), 0 8px 16px -4px rgba(12, 34, 49, 0.08)",
        pop: "0 8px 12px -4px rgba(12, 34, 49, 0.08), 0 20px 32px -8px rgba(12, 34, 49, 0.14)",
        overlay:
          "0 16px 24px -8px rgba(12, 34, 49, 0.12), 0 32px 64px -16px rgba(12, 34, 49, 0.24)",
        inset: "inset 0 1px 2px 0 rgba(12, 34, 49, 0.06)",
        brand: "0 4px 12px -2px rgba(5, 50, 71, 0.28)",
        accent: "0 4px 12px -2px rgba(41, 142, 158, 0.32)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out both",
        "fade-in-up": "fade-in-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 160ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right":
          "slide-in-right 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.6s linear infinite",
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
