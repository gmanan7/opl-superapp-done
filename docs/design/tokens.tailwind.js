/**
 * Fulcrum Design Tokens — v1.1  (signed off 2026-06-10)
 * ----------------------------------------------------------------------------
 * Single source of visual truth. Committed to docs/design/.
 * Companion files (commit together):
 *   - fonts.css           → all @font-face declarations (the "Fulcrum Sans" family)
 *   - shadcn-bridge.css   → the CSS-variable values shadcn/ui consumes
 *
 * This file declares TWO color layers in one config:
 *   1. Fulcrum raw scale  → surface / ink / line / brand / status
 *      For hand-built screens (KPI cards, rosters, capture forms, charts).
 *   2. shadcn/ui bridge   → background, foreground, primary, secondary, muted,
 *      accent, destructive, border, input, ring, card, popover, sidebar.
 *      These map to hsl(var(--…)); the actual values live in shadcn-bridge.css,
 *      so shadcn components render in-system with ZERO per-component overrides.
 *
 * IMPORTANT NAMING NOTE
 *   The brand accent is exposed as `brand.*` — NOT `accent.*` — because shadcn
 *   reserves `accent` for its neutral hover/active background (used by menus,
 *   ghost buttons, etc.). In prose it is still "the accent"; in Tailwind it is
 *   `brand`. shadcn's `accent` maps to surface-hover, never to brand amber.
 *
 * RULINGS folded in (no longer open):
 *   Q1 dark mode  → deferred; class strategy + semantics reserved (see darkMode).
 *   Q2 numerals   → Latin for ALL system-rendered numbers; submitted text verbatim.
 *   Weight budget → Indic 400/500/600 · Latin 400/500/600/700 · 700 reserved to
 *                   the numeric/display tokens only (`data`, `data-lg`, `5xl`).
 *                   Never apply font-bold (700) to Indic text — no synthesized bold.
 */
const fulcrumTokens = {
    darkMode: ["class"], // Q1: deferred. Strategy reserved so a later theme is a token-flip, not a repaint.
    theme: {
        extend: {
            colors: {
                /* ─────────── Fulcrum raw scale ─────────── */
                surface: {
                    base: "#FAFAF9", // app background
                    raised: "#FFFFFF", // cards, sheets, inputs
                    sunken: "#F5F5F4", // table headers, insets, disabled tracks
                    hover: "#F0EFEE", // row / control hover
                    inverse: "#1A1714", // sidebar / dark rail / command surfaces
                    "inverse-hover": "#292420", // hover within the dark rail
                },
                ink: {
                    strong: "#1C1917", // headings, KPI numbers
                    DEFAULT: "#292524", // body  (13.6:1 on surface-base)
                    muted: "#57534E", // secondary, captions (6.9:1)
                    subtle: "#A8A29E", // placeholder, disabled text
                    inverse: "#FAFAF9", // text on inverse surfaces
                    "inverse-muted": "#A8A29E", // secondary text on inverse surfaces
                },
                line: {
                    DEFAULT: "#E7E5E4", // borders, dividers
                    strong: "#D6D3D1", // input borders, emphasis rules
                    subtle: "#F0EFEE", // hairlines on white
                },
                // Brand accent — blue. White text on `brand.DEFAULT` = 5.2:1 (AA).
                brand: {
                    subtle: "#DBEAFE", // tints, selected rows, focus halo
                    bright: "#3B82F6", // large fills & chart marks (AA-large only)
                    DEFAULT: "#2563EB", // primary buttons, links, focus ring base
                    strong: "#1D4ED8", // hover / active / accent text on light
                    ring: "rgba(37,99,235,.35)", // focus ring color
                    on: "#FFFFFF", // text/icon on brand fills
                },
                /* status — ALWAYS rendered as color + symbol + label (never color alone) */
                info: { fg: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" }, // ⓘ
                success: { fg: "#047857", bg: "#ECFDF5", border: "#A7F3D0" }, // ✓
                warning: { fg: "#A16207", bg: "#FEFCE8", border: "#FDE68A" }, // ▲  (ochre — split from brand)
                danger: { fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" }, // ✕
                neutral: { fg: "#57534E", bg: "#F5F5F4", border: "#E7E5E4" }, // ●
                /* ─────────── shadcn/ui bridge (values → shadcn-bridge.css) ─────────── */
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
                secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
                muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
                accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" }, // neutral hover — NOT brand
                destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
                card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
                popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
                sidebar: {
                    DEFAULT: "hsl(var(--sidebar))",
                    foreground: "hsl(var(--sidebar-foreground))",
                    primary: "hsl(var(--sidebar-primary))",
                    "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
                    accent: "hsl(var(--sidebar-accent))",
                    "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
                    border: "hsl(var(--sidebar-border))",
                    ring: "hsl(var(--sidebar-ring))",
                },
            },
            fontFamily: {
                // Latin → Devanagari/Gujarati/Tamil all resolve from "Fulcrum Sans" by codepoint.
                sans: ['"Fulcrum Sans"', '"Nirmala UI"', "system-ui", "-apple-system", '"Segoe UI"', "Roboto", '"Noto Sans"', "sans-serif"],
                mono: ['"Fulcrum Mono"', "ui-monospace", '"SF Mono"', "Menlo", "Consolas", "monospace"],
            },
            // Indic-safe line-heights baked in (matras/loops clip below ~1.5).
            fontSize: {
                "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11 — Latin meta only
                xs: ["0.75rem", { lineHeight: "1.125rem" }], // 12 — Latin meta only
                sm: ["0.875rem", { lineHeight: "1.375rem" }], // 14 — analysis floor
                base: ["1rem", { lineHeight: "1.6rem" }], // 16 — body & capture floor
                lg: ["1.125rem", { lineHeight: "1.75rem" }], // 18 — capture labels
                xl: ["1.25rem", { lineHeight: "1.875rem" }], // 20
                "2xl": ["1.5rem", { lineHeight: "1.95rem" }], // 24
                "3xl": ["1.875rem", { lineHeight: "2.35rem" }], // 30
                "4xl": ["2.25rem", { lineHeight: "2.7rem" }], // 36
                "5xl": ["3rem", { lineHeight: "3.3rem", fontWeight: "700" }], // 48 — display (700 OK: Latin)
                data: ["2rem", { lineHeight: "2.25rem", fontWeight: "700" }], // KPI figure (Latin numerals)
                "data-lg": ["2.75rem", { lineHeight: "3rem", fontWeight: "700" }], // hero KPI figure
            },
            // Indic max weight is 600. 700 belongs to the display/numeric tokens above.
            fontWeight: { normal: "400", medium: "500", semibold: "600", bold: "700" },
            spacing: {
                touch: "2.75rem", // 44px — minimum capture target
                "touch-lg": "3.5rem", // 56px — primary capture buttons
                field: "3rem", // 48px — input height (mobile)
                gutter: "1rem", // screen padding (mobile)
                "gutter-lg": "2rem", // screen padding (desktop)
            },
            borderRadius: {
                sm: "0.375rem",
                DEFAULT: "0.5rem",
                md: "0.5rem", // shadcn Button etc.
                lg: "0.75rem", // shadcn Card etc.
                xl: "1rem",
                "2xl": "1.25rem",
                full: "9999px",
            },
            boxShadow: {
                xs: "0 1px 2px rgba(28,25,23,.06)",
                sm: "0 1px 3px rgba(28,25,23,.08), 0 1px 2px rgba(28,25,23,.06)",
                md: "0 4px 12px rgba(28,25,23,.08), 0 2px 4px rgba(28,25,23,.06)",
                lg: "0 12px 28px rgba(28,25,23,.12), 0 4px 8px rgba(28,25,23,.06)",
                focus: "0 0 0 3px rgba(180,83,9,.35)",
            },
            transitionDuration: { instant: "50ms", fast: "120ms", DEFAULT: "200ms", slow: "320ms" },
            transitionTimingFunction: {
                DEFAULT: "cubic-bezier(0.2,0,0,1)", // decelerate (enter)
                exit: "cubic-bezier(0.4,0,1,1)", // accelerate (exit)
            },
        },
    },
};
export default fulcrumTokens;
