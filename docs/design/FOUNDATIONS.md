# Fulcrum — Design Foundations

**Version:** v1.1 · **Status:** Signed off (2026-06-10) · **Owner:** Marut Shukla
**Scope:** Feel statement · Identity evolution · Design tokens · Font implementation
**Subordinate to:** `FULCRUM_VISION.md` (§5.1 faster-than-paper, §5.2 multilingual, §5.3 mobile-first)

**Companion files (commit together, treat as law):**
- [`tokens.tailwind.ts`](./tokens.tailwind.ts) — the `theme.extend` block (single source of token values)
- [`fonts.css`](./fonts.css) — every `@font-face` for the unified "Fulcrum Sans" family
- [`shadcn-bridge.css`](./shadcn-bridge.css) — shadcn/ui CSS-variable values + dark-rail scope
- [`FOUNDATIONS_preview.html`](./FOUNDATIONS_preview.html) — rendered reference artifact (live specimens)

> Claude Code implements these verbatim and **raises** (does not improvise) when a spec is missing.

---

## 1. The feel statement

**A calm instrument for people who have no time to spare.**

Fulcrum is held one-handed over a running machine, and it is also projected in a leadership review. The same surface must feel **quiet under pressure** and **trustworthy under scrutiny**. It is an instrument, not a website.

If you remember one thing: **the task is the interface.** An operator entering yesterday's production should look *through* the design at the number they came to enter — never *at* it. Decoration that slows a capture by even a second is a defect, because the only competitor we have is paper, and paper is instant.

### Six adjectives — and what each forbids

| Adjective | What it means | What it forbids |
|---|---|---|
| **Calm** | Warm-neutral surfaces, one accent, generous whitespace. The screen rests until you act. | Gradient fills, decorative color, busy borders. |
| **Direct** | The next action is obvious and within thumb's reach. One primary per screen. | Two brand-amber buttons competing on one view. |
| **Legible** | Big where read in motion; dense only where studied at a desk. | Body text below 14px; capture text below 16px. |
| **Equal** | Tamil looks as deliberate as English. No script is an afterthought. | A Latin-only display face; truncated translated labels. |
| **Sturdy** | Sober weight, real contrast, factory-floor durable — reads in glare and gloves. | Thin hairline type; low-contrast grays as text. |
| **Honest** | Skeletons not spinners; missing data is named, not hidden behind a blank chart. | Layout shift on load; fake-empty states. |

### The eight laws

1. **Faster than paper, or it doesn't ship.** Every capture flow is timed against the format it replaces. If it loses, it is redesigned — not decorated.
2. **Amber is a scalpel, not a highlighter.** The accent marks exactly one thing per view: the action you came to take. Surfaces stay warm-neutral; the accent earns attention by being rare.
3. **Every glyph is first-class.** A screen in Tamil reads as composed as the same screen in English — same rhythm, same weight, no clipped matras, no overflowing buttons. Design to the longest language.
4. **Status is felt in three channels.** Color + symbol + label, always together. A colour-blind leader on a glare-lit floor reads a state from its shape and its word alone.
5. **Big where the thumb lands.** Capture targets are ≥44px and bottom-anchored for one-handed reach. Analysis surfaces may be dense — generosity and density are both correct, in their own place.
6. **Numbers hold still.** KPI figures are tabular, lining, Latin-numeral, right-aligned. A form never reflows mid-entry; a chart never jumps when its data arrives.
7. **The original is never destroyed.** Translation is a toggle laid over submitted content, not a replacement. A worker's Gujarati words are always one tap away, intact.
8. **Earn every pixel of chrome.** If an element doesn't help capture or judgment, it's removed. No filler tiles, no vanity stats, no decoration masquerading as polish.

---

## 2. Identity evolution — keep the character, sharpen everything else

The prototype's instinct was right — warm, dark-sidebar, amber-accented, shadcn-based — it was just **thin**. We deepen it; we don't restart.

| ● Keep | ◑ Sharpen | ✕ Change out |
|---|---|---|
| **Dark warm sidebar** — distinctive, orients leaders. Retuned to `#1A1714`. | **Amber → burnt amber** — `#D97706` deepens to `#B45309` so white text passes AA. | **DM Sans as the type voice** — Latin-only = two-tier identity. Replaced by one Noto family across all scripts. |
| **Warm accent** — amber is the brand's warmth. Stays as the single accent hue. | **One surface → four** — base / raised / sunken / inverse give real depth. | **Color-only states** — fails the colour-blind floor test. Retired. |
| **shadcn/ui + Tailwind** — delivery mechanism. Tokens map onto it, never fight it. | **Accent vs warning split** — brand = burnt-orange; warning = ochre `#A16207`. | **Flat elevation** — borderless white-on-white. Replaced by warm-tinted shadow + line system. |
| **Stone neutral family** — warm grays beat cool grays for an on-floor tool. | **Status → 3-channel** — every state gets a symbol + label, not just a color. | **Hot-orange CTA on white** — fails contrast at body size. Retired. |

**The evolution in one line:** the same warm, sober, amber-and-stone character the prototype reached for — now given a real surface hierarchy, an accessible accent, a colour-blind-safe status system, and a type stack that treats all four scripts as one voice.

---

## 3. Font implementation

**Decision: pure Noto Sans across all four scripts**, bound into a single CSS family, `"Fulcrum Sans"`. We do **not** pair DM Sans for Latin.

**Why not DM Sans (Latin) + Noto (Indic)?** The baseline/weight harmony the brief requires isn't there. DM Sans is a geometric display face; Noto's Indic faces are humanist, drawn by the same team that made Noto Sans Latin to **share vertical metrics and weight axis**. Pairing means a geometric Latin beside a humanist Devanagari — two voices — and worse, it makes *the language you ship in* change the typeface you see. For an app whose 80% read Indic scripts, that is a two-tier identity by construction. **Distinctiveness comes from the system** (burnt amber, surface depth, scale rhythm, the dark rail), not from a display face that abandons three of four scripts.

### Implementation spec

| Decision | Specification |
|---|---|
| **Family** | Noto Sans (Latin) · Noto Sans Devanagari · Noto Sans Gujarati · Noto Sans Tamil, bound as one family `"Fulcrum Sans"`. Noto Sans Mono = `"Fulcrum Mono"` for data/codes. |
| **Weights (ruled)** | **Latin** 400/500/600/700 · **Indic** 400/500/600 (500 stays — `lg` capture labels carry Indic constantly). **Weight 700 is reserved to the numeric/display tokens** (`data`, `data-lg`, `5xl`). **Never synthesize bold on Indic.** |
| **Numerals (ruled, Q2)** | Latin / Western-Arabic for **all system-rendered numbers** (`21,480`, never `२१,४८०`). Enforce `font-variant-numeric: lining-nums tabular-nums` on KPI & table figures. **Workers' submitted text stays verbatim** in its own script per Law 7 — we never transliterate what a person wrote. |
| **Subsets** | Per script: `latin` + `latin-ext` (merged), `devanagari`, `gujarati`, `tamil`. Self-host woff2, one file per script × weight. No CJK, no unused subsets. |
| **unicode-range (redline 2)** | Latin range includes **U+20A0–20BF** (₹ and other currency). **U+200C–200D** (ZWNJ/ZWJ) present in **Devanagari, Gujarati *and* Tamil** ranges. Danda `U+0964–0965`, dotted-circle `U+25CC`, and ₹/₨ added to each Indic range so prices and conjuncts render correctly. |
| **Loading** | Self-hosted woff2, `font-display: swap`. `<link rel="preload">` only Noto Latin 400 + 600 and the **active** locale's 400 + 600 (injected by locale). Everything else lazy-loads. |
| **Binding** | One `@font-face` per script scoped by `unicode-range`, all named `"Fulcrum Sans"`. The browser selects the right script per codepoint; app code only ever writes `font-family: "Fulcrum Sans"`. |
| **Line-height** | Body ≥ 1.6, headings ≥ 1.25 — baked into the type scale (§5). Indic stacking marks clip below ~1.5. Never set a fixed pixel line-height on multilingual text. |
| **Fallback chain** | `"Fulcrum Sans", "Nirmala UI", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`. Nirmala UI covers Devanagari/Gujarati/Tamil during swap; system-ui/Roboto cover Latin. No tofu mid-swap. |
| **Print (ruled, Q4)** | Print stylesheets (OPL/Kaizen A4) stay on **Fulcrum Sans** for brand coherence. |

Full declarations: [`fonts.css`](./fonts.css).

---

## 4. Color tokens

Semantic, not literal — components reference `surface-raised` and `brand`, never `amber-700`. A re-tune touches one file.

> **Naming:** the brand accent is exposed in Tailwind as **`brand.*`** (not `accent.*`) so it doesn't collide with shadcn's neutral `accent` (hover/active background). In prose it's still "the accent."

### Surfaces & ink

| Token | Hex | Use |
|---|---|---|
| `surface.base` | `#FAFAF9` | App background |
| `surface.raised` | `#FFFFFF` | Cards, sheets, inputs |
| `surface.sunken` | `#F5F5F4` | Table heads, insets |
| `surface.hover` | `#F0EFEE` | Row / control hover |
| `surface.inverse` | `#1A1714` | Sidebar / dark rail |
| `surface.inverse-hover` | `#292420` | Hover within the rail |
| `ink.strong` | `#1C1917` | Headings, KPI numbers |
| `ink.DEFAULT` | `#292524` | Body · 13.6:1 |
| `ink.muted` | `#57534E` | Secondary · 6.9:1 |
| `ink.subtle` | `#A8A29E` | Placeholder / disabled |
| `ink.inverse` | `#FAFAF9` | Text on inverse |
| `line.DEFAULT` | `#E7E5E4` | Borders, dividers |
| `line.strong` | `#D6D3D1` | Input borders |
| `line.subtle` | `#F0EFEE` | Hairlines on white |

### Brand — burnt amber

Deepened from the prototype's hot orange so **white text clears WCAG AA at body size** (5.0:1 on `brand.DEFAULT`). `brand.bright` is reserved for large fills and chart marks where AA-large (3:1) applies.

| Token | Hex | Use |
|---|---|---|
| `brand.subtle` | `#FEF3C7` | Tints, selected rows, focus halo |
| `brand.bright` | `#D97706` | Large fills, chart marks (AA-large) |
| `brand.DEFAULT` | `#B45309` | Primary buttons, links, focus — white text 5.0:1 |
| `brand.strong` | `#92400E` | Hover / active / accent text on light |
| `brand.ring` | `rgba(180,83,9,.35)` | Focus ring |
| `brand.on` | `#FFFFFF` | Text/icon on brand fills |

---

## 5. Status system — color + symbol + label, never color alone

A colour-blind reviewer under factory glare decodes a state from its **shape** and its **word**, not its hue. Every status ships as a triple. Warning is **ochre**, deliberately split from the burnt-amber brand so the two never read as the same signal.

| Token | Symbol | Foreground | Background | Border | Maps to |
|---|---|---|---|---|---|
| `info` | ⓘ | `#1D4ED8` | `#EFF6FF` | `#BFDBFE` | Hints, sync notices, translate active |
| `success` | ✓ | `#047857` | `#ECFDF5` | `#A7F3D0` | Approved, closed, on-target, synced |
| `warning` | ▲ | `#A16207` | `#FEFCE8` | `#FDE68A` | Pending, retraining due, missing days |
| `danger` | ✕ | `#B91C1C` | `#FEF2F2` | `#FECACA` | Overdue, rejected, off-target, sync fail |
| `neutral` | ● | `#57534E` | `#F5F5F4` | `#E7E5E4` | Draft, archived, inactive, deactivated |

**Implementation rule:** a `<StatusBadge>` takes `status` + a translated `label` and **always** renders symbol + label together. There is no color-only variant in the API — it cannot be misused.

---

## 6. Type scale · spacing · radii · elevation · motion

### Type scale (root 16px; Indic-safe line-heights baked in)

| Token | px / weight | Line-height | Use |
|---|---|---|---|
| `data-lg` | 44 / 700 | 3rem | Hero KPI figure (Latin numerals) |
| `data` | 32 / 700 | 2.25rem | KPI figure |
| `5xl` | 48 / 700 | 3.3rem | Display |
| `4xl` | 36 / — | 2.7rem | Page title |
| `3xl` | 30 / 600 | 2.35rem | Section heading |
| `2xl` | 24 / 600 | 1.95rem | Card title |
| `xl` | 20 / 600 | 1.875rem | Subsection |
| `lg` | 18 / 500 | 1.75rem | Capture label / large input |
| `base` | 16 / 400 | 1.6rem | Body & **capture minimum** |
| `sm` | 14 / 400 | 1.375rem | Secondary, table cells (desktop) |
| `xs` | 12 / 500 | 1.125rem | Meta, timestamp — **Latin only** |
| `2xs` | 11 / — | 1rem | Legal/meta — Latin only |

> **Floor rules:** capture surfaces never below `base` (16px); analysis never below `sm` (14px). `xs`/`2xs` are Latin-meta only — at 12px Indic matras clip. **700-weight only via `data`/`data-lg`/`5xl`** (all Latin/numeric).

### Spacing (4px grid)

`1`=4 · `2`=8 · `3`=12 · `4`=16 · `5`=20 · `6`=24 · `8`=32 · `10`=40 · `12`=48 · `16`=64
Semantic: **`touch`=44px** (min capture target) · `touch-lg`=56px (primary capture buttons) · `field`=48px (mobile input height) · `gutter`=16 / `gutter-lg`=32 (screen padding).

### Radii

`sm`=6 · `DEFAULT`/`md`=8 (buttons, inputs) · `lg`=12 (cards) · `xl`=16 · `2xl`=20 · `full`=9999.

### Elevation (warm-tinted, low & calm)

| Token | Value | Use |
|---|---|---|
| `xs` | `0 1px 2px rgba(28,25,23,.06)` | Subtle lift |
| `sm` | `0 1px 3px rgba(28,25,23,.08), 0 1px 2px rgba(28,25,23,.06)` | Cards |
| `md` | `0 4px 12px rgba(28,25,23,.08), 0 2px 4px rgba(28,25,23,.06)` | Popovers, dropdowns |
| `lg` | `0 12px 28px rgba(28,25,23,.12), 0 4px 8px rgba(28,25,23,.06)` | Modals, sheets |
| `focus` | `0 0 0 3px rgba(180,83,9,.35)` | Focus ring (always visible) |

### Motion

| Token | Duration | Use |
|---|---|---|
| `instant` | 50ms | Press feedback on capture controls — paper-instant |
| `fast` | 120ms | Hover, tabs, toggles, chip selection |
| `DEFAULT` | 200ms | Most enter/exit, accordion, dropdown |
| `slow` | 320ms | Bottom sheets, modals, page transitions |

Easing: `cubic-bezier(0.2,0,0,1)` (enter) · `cubic-bezier(0.4,0,1,1)` (exit). All motion wrapped in `@media (prefers-reduced-motion: no-preference)` — capture flows must work with zero animation.

---

## 7. shadcn/ui bridge

[`shadcn-bridge.css`](./shadcn-bridge.css) maps **every** shadcn semantic variable to the Fulcrum palette (HSL triplets consumed via `hsl(var(--…))`) so components render in-system with **zero per-component overrides**:

- `--background --foreground --card --popover --primary --secondary --muted --accent --destructive --border --input --ring --radius` + chart `--chart-1..5`.
- **Status extensions** `--success --warning --info` (+ foregrounds) for Badge/Alert variants.
- **Sidebar / dark rail:** `--sidebar* ` mapped to the inverse ramp, plus a **`.dark-rail` scope** that remaps the core vars so a shadcn Button/Select/Input placed *inside* the rail is in-context automatically.

Two critical mappings:
- `--primary` = brand `#B45309` (white foreground = AA). `--ring` = brand.
- `--accent` = **neutral hover** `#F0EFEE` — shadcn's `accent` is a hover background, **not** the brand. (This is why the brand token is named `brand`, not `accent`, in Tailwind.)

---

## 8. Resolved tensions

Recorded so they are not silently re-litigated. Any change after Phase 3 → `DECISIONS.md` entry.

**Amber-as-brand vs amber-as-warning.** Brand accent is *burnt orange* (`#B45309`); warning status is *ochre* (`#A16207`) on its own tint, always with the ▲ symbol + label. Brand lives on interactive controls; warning lives in badges. Distinct hue + distinct role → no collision.

**Faster-than-paper vs WCAG AA.** The bright orange CTA (`#D97706` + white) fails AA at body size (3.2:1). Resolved by deepening the brand to `#B45309` (white = 5.0:1) and keeping `#D97706` as `brand.bright` for large fills/chart marks only (AA-large 3:1). A findable CTA *and* a compliant one.

**Distinctive type vs four-script harmony.** Keeping DM Sans for Latin would add character but break harmony for 80% of users. Resolved in favour of harmony: one Noto family across all scripts. Distinctiveness carried by the system, not a single-script display face.

**Capture generosity vs leader density.** The system is dual-mode *by surface*, not one compromise. Capture surfaces use `touch` spacing + `base`↑ type; analysis surfaces may use `sm` type and tighter rows. Same tokens, two density profiles — a deliberate choice, not a drift.

---

## 9. Rulings folded in (formerly open questions)

| # | Question | Ruling |
|---|---|---|
| Q1 | Dark mode in Phase 1–2? | **Deferred.** Semantics reserved (`darkMode: ["class"]`, semantic surfaces) so a later theme is a token-flip, not a repaint. |
| Q2 | Numerals in translated prose? | **Latin for all system-rendered numbers.** Workers' submitted text stays verbatim in its own script (Law 7). |
| Q3 | Brand wordmark / logo? | **Text wordmark only.** No logo work this phase. |
| Q4 | Print typeface? | **Fulcrum Sans** for print views (OPL/Kaizen A4). |
| Q5 | Self-hosting weight budget? | **Superseded by the weight ruling:** Indic 400/500/600 · Latin 400/500/600/700 · 700 reserved to numeric/display tokens. No synthesized Indic bold. |

---

## 10. Next

The three reference screens — **People roster** (data density), **KPI entry** (capture speed), **Kaizen detail with approval + translate** (richness) — are built next session against these committed tokens. They become the canonical examples every other screen follows.
