/** @format */

// t16-roster-theme.js
// Page-specific Tailwind theme for t16-roster-builder.html ONLY.
// Shop Titans-inspired: parchment background, ivory cards, gold-tan frames,
// royal-blue "gem" accent. Uses the SAME token names as the shared
// tailwind-theme.js so existing utility classes re-skin with no markup changes.
tailwind.config = {
  theme: {
    extend: {
      colors: {
        /* Base theme — parchment page, purple "gem" cards w/ white text */
        background: "#251A21", // dark plum page backdrop
        surface: "#5C2F46",    // purple card
        accent: "#1F4E8C",     // royal-blue gem (primary actions)
        accentLight: "#2E6FB0",
        textPrimary: "#FFFFFF", // white text on purple cards
        textSecondary: "#D9C2CE", // light mauve

        /* Extra palette */
        cobalt: "#1F4E8C",
        mint: "#2E7D46",
        ink: "#2B2113",
        borderc: "#C49415", // gold card frame
        textc: "#FFFFFF",
        mutedc: "#D9C2CE",
        hoverBg: "#814463",  // lighter purple (inset rows / inputs)
        gold: "#C8901F",     // accent gold (frames/flourishes)
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },

      boxShadow: {
        soft: "0 10px 30px rgba(60,42,20,.25)",
      },

      borderRadius: {
        pill: "999px",
      },
    },
  },
  plugins: [
    function ({ addComponents, theme }) {
      addComponents({
        ".btn-primary": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem 1rem",
          borderRadius: "9999px",
          fontSize: "13px",
          fontWeight: "600",
          color: "#FFFFFF",
          backgroundColor: theme("colors.accent"),
          border: "1px solid",
          borderColor: theme("colors.borderc"),
          transitionProperty: "background-color, color",
          transitionDuration: "150ms",
          "&:hover": {
            backgroundColor: theme("colors.accentLight"),
          },
        },
        ".btn-white": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem 1rem",
          borderRadius: "9999px",
          fontSize: "13px",
          fontWeight: "600",
          color: "#2B2113",          // dark ink — stays a light, readable button on purple
          backgroundColor: "#F0E7CF", // parchment
          border: "1px solid",
          borderColor: theme("colors.borderc"),
          transitionProperty: "background-color, color, border-color",
          transitionDuration: "150ms",
          "&:hover": {
            backgroundColor: "#E2D4B0",
          },
        },
        ".btn-red": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem 1rem",
          borderRadius: "9999px",
          fontSize: "13px",
          fontWeight: "600",
          color: "#FFFFFF",
          backgroundColor: "#9B2C2C",
          border: "1px solid",
          borderColor: theme("colors.borderc"),
          transitionProperty: "background-color, color, border-color",
          transitionDuration: "150ms",
          "&:hover": {
            backgroundColor: "#7A2222",
          },
        },
      });
    },
  ],
};
