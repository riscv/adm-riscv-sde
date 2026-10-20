// Design tokens shared with the RISC-V Spec Plan Editor (tech.riscv.org/plan/)
// and the Specification Dashboard. The same values live as CSS variables in
// src/styles/main.css so component classes and utilities stay in step.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        line: "var(--border)",
        "line-strong": "var(--border-strong)",
        ink: "var(--text)",
        muted: "var(--muted)",
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          soft: "var(--brand-soft)"
        },
        gold: "var(--gold)",
        phase: {
          inception: "#8b5cf6",
          planning: "#3b82f6",
          development: "#10b981",
          stabilization: "#ec4899",
          freeze: "#f59e0b",
          "ratification-ready": "#ef4444",
          publication: "#6366f1"
        }
      },
      borderRadius: {
        card: "14px",
        control: "10px",
        pill: "999px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"]
      }
    }
  },
  plugins: []
};
