# Fulcrum — Design System Brief

**Status:** Living brief. This is the working document for **Claude Design**: the constraints, identity, and deliverables for Fulcrum's visual system. Claude Design's outputs (tokens, component specs) are committed back into this file / `docs/design/` and become the single source of visual truth that Claude Code builds from. Subordinate to `FULCRUM_VISION.md` (especially §5.1 faster-than-paper, §5.2 multilingual, §5.3 mobile-first).

---

## 1. Who this is for (design north star)

Two very different users share one app:

- **The shop-floor operator** (apprentice/on_roll): a phone, often one-handed, gloves sometimes, ambient noise, brief windows of time, reading in Hindi/Gujarati/Tamil. Their flows are *capture*: enter a KPI, snap an abnormality photo, mark training done. **Every capture flow must feel faster than the paper format it replaces** — this is the product's survival condition, and therefore design's first constraint.
- **The leader/reviewer** (jh_leader → admin): phone *and* desktop, scanning lists, approving, reviewing trends, running meetings from the screen. Their flows are *judgment*: density, comparison, and trust in the numbers matter.

When the two conflict, the capture experience wins (Vision §5.3).

## 2. Current visual identity (the starting point, not a cage)

The prototype established: **DM Sans**, stone-900 sidebar (220px desktop), **amber-600/700 accent**, stone-50 surface, white cards, status colors (red/blue/green/amber for states and result areas), shadcn/ui components. This identity is serviceable but visually thin — the design pass should **evolve it into something with intention** (hierarchy, rhythm, distinctiveness) rather than restart from zero. Keep: the dark-sidebar + warm-accent character, shadcn/ui as the component base, Tailwind tokens as the delivery mechanism. Open to change: everything else, with rationale.

## 3. Hard constraints (non-negotiable)

1. **Four languages on every surface** — en/hi/gu/ta. Design for **text expansion** (Hindi/Gujarati/Tamil labels run 20–60% longer than English; Tamil words can be very long with no break points): no fixed-width labels, no truncation of action text, buttons and tabs must wrap or scale gracefully. Test every component spec against its longest-language string.
2. **Scripts render beautifully or the app feels broken** to 80% of its users. Font stack must cover Latin + Devanagari + Gujarati + Tamil with consistent visual weight — **Noto Sans (+ Noto Sans Devanagari / Gujarati / Tamil)** is the proven family; pairing DM Sans (Latin display) with Noto for Indic scripts is acceptable if baseline/weight harmony is demonstrated. Define the stack precisely, including numerals (use Latin numerals throughout for KPI legibility).
3. **Touch targets ≥ 44px** on capture flows; primary actions reachable one-handed (bottom-anchored on mobile); number entry uses large numeric keypads; date entry never requires typing.
4. **The language toggle is a permanent fixture**: login page (footer, Facebook-style: `English · हिंदी · ગુજરાતી · தமிழ்`) and every authenticated surface (sidebar footer on desktop, profile/settings on mobile).
5. **The translate control** on user-submitted content (OPL remarks, Kaizen descriptions, abnormality notes) is a first-class component: visible affordance, source-language aware, shows translated text without destroying the original (toggle back). Design it once, reuse everywhere.
6. **Status is color + symbol + label, never color alone** (color-blind safety on a factory floor).
7. **Print views are real deliverables** (OPL one-pagers, Kaizen sheets match factory PPT formats) — A4, clean, photo-forward.
8. **Performance is design**: photo-heavy lists must skeleton gracefully (signed URLs load async ~1s); never layout-shift a capture form.

## 4. Component inventory (what needs specifying)

Priority order, matching the roadmap:

**Phase 1–2 (MDM + shell):** app shell (sidebar/nav driven by module enablement, role-aware), data tables with filters/search (People roster is the stress test), tree view (Org Structure), forms (create/edit, both identity types), bulk-import flow (template → upload → validation preview with per-row errors → confirm → report), modal + confirmation patterns (deactivation, PIN reveal), status badges, the Sync Health panel, language toggles.

**Phase 3–4 (modules):** capture forms (KPI numeric entry with yesterday-default date, photo capture with compression states), card lists with filter tabs + chips (OPL/Kaizen pattern), detail views with before/after image pairs, approval panels with scoring (1/3/9 radio cards), the translate control, FAB pattern, trend charts (month pills, missing-day prompts, target lines), print stylesheets.

**Phase 5:** dashboard tiles, leaderboard, meeting-runner view.

## 5. Deliverables from Claude Design (committed to the repo)

> **Delivery status (2026-06, D-018):** deliverables 1–2 DELIVERED and 3 partial — committed as Design Foundations v1.1 in `docs/design/` (`FOUNDATIONS.md`, `tokens.tailwind.ts`, `fonts.css`, `shadcn-bridge.css`, `FOUNDATIONS_preview.html`). Reference screens (4) pending. Not yet wired into the build — integration is a Step 3b/Phase 2 task (vite/tailwind config + procuring the 15 Noto woff2 subset files referenced by fonts.css).

1. **Design tokens** — Tailwind config extension: full color scale (semantic: surface/ink/accent/status), type scale per script, spacing, radii, shadows, motion durations. One file, the single source. ✅ `docs/design/tokens.tailwind.ts`
2. **Font implementation spec** — exact families, weights, subsets, loading strategy (self-hosted, font-display swap), fallback chain per script. ✅ `docs/design/fonts.css` + FOUNDATIONS.md
3. **Component specs** — per §4, each with: anatomy, states (default/hover/active/disabled/loading/error), mobile + desktop behavior, longest-language behavior, and a code-ready description Claude Code can implement against shadcn/ui without ambiguity. ◐ partial — foundations + shadcn bridge delivered (`shadcn-bridge.css`); per-component specs continue
4. **Three reference screens fully designed** to set the bar: People roster (data density), KPI entry (capture speed), Kaizen detail with approval + translate (richness). These become the canonical examples every other screen follows. ✅ DELIVERED (D-020): `docs/design/screens/PEOPLE_ROSTER.md`, `KPI_ENTRY.md`, `KAIZEN_DETAIL.md` v1.1 + `PATTERNS.md` v1.0 (17 reusable patterns). **All future MDM screens consume patterns from PATTERNS.md going forward** — the Step 3b `mdmUi.tsx` helpers stay, but new components come from PATTERNS.
5. **A one-page "feel" statement** — the adjectives and rules that keep a hundred future screens coherent (e.g., calm surfaces, confident accents, generous capture targets, zero decoration that slows a task).

## 6. Working agreement

- Claude Design proposes; tokens/components land in `docs/design/` via the owner; Claude Code treats them as law and raises (not improvises) when a spec is missing.
- Any token or pattern change after Phase 3 = `DECISIONS.md` entry (visual churn is expensive once modules multiply).
- Accessibility floor: WCAG AA contrast, visible focus states, screen-reader labels on icon-only controls — in all four languages.
