# Fulcrum — KPI_ENTRY.md

**Version:** v1.1 · **Companion to:** FOUNDATIONS.md v1.1 (D‑018) · **References:** PATTERNS.md
**Purpose:** **The capture‑speed proof.** Law 1 made physical. If a supervisor on the floor can enter yesterday's KPIs faster than they would write them on the daily log sheet, this design ships. If not, it is redesigned — not decorated.

### v1.1 changes

- **R1 acknowledged** — this screen does not surface role codes in chrome; the natural‑language phrase in §8.6 ("Only the F&G DMT can enter Novafold KPIs") is unchanged. Access is enforced by RLS using the canonical `user_role` enum at the API; this screen does not gate on roles in client code.
- **R2 acknowledged** — the machine identity arrives via route data; `MachineContextHeader` already pulls the path from `useOrgStructure()` rather than constructing it from hardcoded JH/DMT literals. The illustrative examples (`SFM · F&G · Folding & Gluing`, `RFM · D1`) in §2/§3/§4 are sample data, not enum literals.
- Confirmed primitives list updated in §12.

---

## 1. The faster‑than‑paper rationale

**Paper baseline** (timed against an observed F&G supervisor entering Novafold KPIs on the OPL sheet):

| Step | Paper | Fulcrum L1 target |
|---|---|---|
| Find machine row in the sheet | 6–10 s (scan column) | 0 s — machine is the screen |
| Confirm date | 0 s (header) | 0 s — yesterday is default; ▶ steps to today |
| Locate Production cell | 3 s | 0 s — first row, primary visual weight |
| Write Production figure | 4 s | 4–5 s (4 taps + Save) |
| Locate Wastage % cell | 2 s | 0 s — next row, no scroll for ≤ 4 KPIs |
| Write Wastage % | 4 s | 4–5 s |
| Locate Make Ready Time | 2 s | 0 s |
| Write Make Ready | 4 s | 4–5 s |
| Locate Downtime | 2 s | 0 s |
| Write Downtime | 4 s | 4–5 s |
| Sign + close book | 6 s | 1 s — Save |
| **Total (4 KPIs)** | **~ 37–43 s** | **~ 17–22 s** |

The win comes from: (1) **machine is the screen** — zero context‑setting taps; (2) **yesterday is default** — zero date taps in the common case; (3) **6 KPIs visible at once** — zero scrolling on the median machine; (4) **bottom‑anchored Save** with one‑handed reach. Decoration that costs a second loses to paper; we don't ship it.

This rationale is also the **acceptance criterion** for the implementation. Code measures one round on a real machine and reports the timing.

---

## 2. Layout — mobile (< 768px, the primary surface)

This is the **first‑class** layout. Capture happens on the floor, on a phone, often one‑handed under glare. Desktop is the secondary view (analyst seat).

```
┌────────────────────────────────────────┐
│ ◀  KPI entry                           │ ← page chrome 56h
│ ────────────────────────────────────── │
│  Novafold                              │ ← MachineContextHeader §12
│  SFM · F&G · Folding & Gluing          │
│ ────────────────────────────────────── │
│  ◀   Tuesday, 9 June 2026   ▶   [📅]    │ ← DateStepper §10
│       yesterday                        │
│ ──────────────────────────────────────  │
│ Production                  L Cartons  │
│ target ≥ 4.20                          │
│ ┌────────────────────────────────────┐ │
│ │                            4 . 1 8 │ │ ← KpiCaptureRow §11 — input data 32
│ └────────────────────────────────────┘ │
│ ▼ below target                         │ ← micro‑hint, does NOT block save
│ ──────────────────────────────────────  │
│ Wastage %                          %   │
│ target ≤ 0.80                          │
│ ┌────────────────────────────────────┐ │
│ │                            0 . 6 5 │ │
│ └────────────────────────────────────┘ │
│ ──────────────────────────────────────  │
│ Make Ready Time              Minutes   │
│ target ≤ 75                            │
│ ┌────────────────────────────────────┐ │
│ │                              7 2   │ │
│ └────────────────────────────────────┘ │
│ ──────────────────────────────────────  │
│ Downtime                       Hours   │
│ target ≤ 30   (cumulative MTD)         │
│ ┌────────────────────────────────────┐ │
│ │                              1 2   │ │
│ └────────────────────────────────────┘ │
│                                        │
│ ──────────────────────────────────────  │
│ ┌────────────────────────────────────┐ │
│ │            Save 4 KPIs            │ │ ← bottom‑anchored, touch-lg (56)
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

- **MachineContextHeader** is sticky‑to‑top. The single name + path takes precedence; nothing competes for ink.
- **DateStepper** sits directly below the header — it is the second most important fact after the machine. Bracketed by ◀ / ▶ tap targets ≥ `touch` (44).
- Each **KpiCaptureRow** has: label · unit chip (right‑aligned in caption row) · target hint · input. Padding `space.4 / space.5`. Dividers `line.subtle`.
- **Input field** uses `CaptureNumberPad §3`. The native numeric keyboard handles input on mobile; the custom keypad is the alternative view (toggleable via long‑press on the input — rare‑path).
- **Save** is **bottom‑anchored**. Always full‑width minus `space.gutter`, height `space.touch-lg` (56). When the keyboard is up, Save remains visible immediately above the keyboard (CSS env safe‑area + `position: sticky`).
- "Save **N** KPIs" — the count updates as values become valid. This is the single CTA per Law 2.

### One‑handed reach test

The thumb of an average right hand on a 6.1" device reaches comfortably to ~60% of the screen height from the bottom. **Every interactive target on this screen is in that zone:** Date steppers, KPI inputs, Save. The page header and machine context are read‑mostly; they're allowed in the harder‑to‑reach top zone.

---

## 3. Layout — desktop (≥ 1024px)

Desktop is the same flow at a wider gutter — not a new surface. A supervisor at a desk uses the same screen; nothing renames or reorders.

```
┌──────────────┬────────────────────────────────────────────────────────────────┐
│              │  KPI entry                                                     │
│  dark‑rail   │  ──────────────────────────────────────────────────────────────│
│              │  Novafold                                                      │
│              │  SFM · F&G · Folding & Gluing                                  │
│              │                                                                │
│              │  ◀   Tuesday, 9 June 2026   ▶   [📅]    Folder Gluer · 4 KPIs   │
│              │  ──────────────────────────────────────────────────────────────│
│              │  ┌──────────────────────────────────────────────────────────┐  │
│              │  │ Production           L Cartons     target ≥ 4.20   [4.18]│  │
│              │  │ ▼ below target                                          │  │
│              │  ├──────────────────────────────────────────────────────────┤  │
│              │  │ Wastage %                  %       target ≤ 0.80   [0.65]│  │
│              │  ├──────────────────────────────────────────────────────────┤  │
│              │  │ Make Ready Time         Minutes    target ≤ 75     [ 72]│  │
│              │  ├──────────────────────────────────────────────────────────┤  │
│              │  │ Downtime                  Hours    target ≤ 30     [ 12]│  │
│              │  │ cumulative MTD                                          │  │
│              │  └──────────────────────────────────────────────────────────┘  │
│              │                                                                │
│              │            [   Save 4 KPIs   ]    (right‑aligned)              │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

- Card `surface.raised`, radius `radius.lg`, shadow `shadow.sm`, max‑width 720px (centered). Wider gutters; otherwise identical content.
- Save is bottom‑right‑aligned at desktop. Width fits its content (not full‑width). Height `touch-lg` (56).
- Native numeric input. No keypad surface unless explicitly toggled.

---

## 4. The KPI list is machine‑driven

The list is **queried per machine** from `kpi_definition` rows. **Do not** hard‑code rows in the screen. Per the org+machines fixture:

| Machine | Typical KPIs (English) | Hindi/Gujarati translations | Surface implication |
|---|---|---|---|
| Novafold (Folder Gluer, F&G) | Production (L Sheets), Wastage %, Make Ready Time (Minutes), Downtime (Hours) | NULL → English fallback | 4 rows, no scroll |
| Heidelberg 1 (Offset Press, PRINT) | Production (L Sheets), Wastage %, Make Ready Time, Downtime, Reels Pending SR | NULL | 5 rows, no scroll |
| Delta 1 (Rotogravure, RFM · D1) | Production (Mn HLP), Wastage %, Make Ready Time (Hours), Downtime, Reels Pending SR, Unbundled Pallets | NULL | 6 rows, **first scroll case** |
| Chiller (UTIL, no DMT) | Chiller Efficiency (KW/TR), Downtime, Production (none) | NULL | 2 rows |
| Foil Stamping (VA) | Production (L Cartons), Wastage %, Make Ready Time (Minutes), Downtime | NULL | 4 rows |

**Design floor:** 1–6 KPIs visible at once. **At 6 KPIs on a 6.1" device, all rows are visible without scroll** (the screen budget is row 56h × 6 + chrome ≈ 540px of the ~650px viewport content area). 7+ KPIs are out of scope for v1; if any machine grows past 6 we either split the screen or grow the device viewport — we do **not** silently introduce scroll.

If a machine has **0 KPIs defined**, render the **empty state** §8.

---

## 5. KPI row spec

Each row is a `KpiCaptureRow §11`. Per‑row anatomy:

- **Label** (top‑left): `lg` (18/500) `ink.strong`. Translated; English fallback if Indic NULL. `lang={locale}`.
- **Unit chip** (top‑right): `sm` weight 500 `ink.muted`. **Prose units** (`L Cartons`, `Hours`, `Minutes`) in sans; **code units** (`KW/TR`, `%`) in sans too — keep one voice on this row; mono looks like a code listing. (Exception: machine codes elsewhere may be mono.)
- **Target hint** (below label): `sm` weight 400 `ink.muted`, prefix `target ≥` or `target ≤`. Sub‑hint (e.g. `cumulative MTD`) in `xs` `ink.muted` on a second line. **Latin numerals.**
- **Input** (full row width on mobile; right‑aligned column on desktop): height `space.field` (48). Border `line.strong`, focus ring `shadow.focus`. Type `data` (32/700 tabular). Right‑aligned text.
- **Micro‑hint** (below input, only when value is out of target band): `▼ below target` / `▲ above target` in `warning.fg` `sm` weight 500. **Does not block save.** Out‑of‑target data is real data.
- **Validation error** (replaces the micro‑hint when present): `✕ {message}` in `danger.fg`. **Blocks save** for this row.

### Numeric semantics

- All KPI figures are **Latin / Western‑Arabic, tabular, lining numerals** (Law Q2 + Law 6).
- Decimal separator is `.` internally and on display in v1 (Indian-English convention is `.` for decimal, `,` for thousands grouping). KPI capture v1 does not render thousand separators on the **input**; rendered analysis views do.
- Negative values are accepted for KPIs that allow them (e.g. variance fields, none in v1's set); for any KPI where direction is set, negative is a validation error.
- Decimals: KPI definition row carries `precision` (default 2). Input enforces at most `precision` digits after the dot.

---

## 6. The Save flow

```
   form has ≥ 1 valid row  → Save enabled (brand.DEFAULT)
   pressing Save           → button → "Saving…" (transition.fast opacity)
   server 200              → row checkmark micro‑animation per saved KPI
                             (transition.fast; reduced‑motion: no animation)
                             → toast "4 KPIs saved · Novafold · 9 June"
                             → DateStepper steps back to current (stays on yesterday by default for next entry)
   server 4xx (validation) → row(s) with error message in‑line; Save re‑enabled
   server 5xx              → ErrorState replaces the form body w/ "Try again"
                             AND localStorage holds the unsaved values keyed by
                             {machine_id, date} so the user doesn't lose input.
```

### Critical details

- **Save is bottom‑anchored on mobile.** It does not move when validation errors appear; only its label and disabled state change.
- **Save count** ("Save 4 KPIs") is the count of **rows with values entered**, not the count of valid rows. (A row with a value but a type error is included in the count — the label says you intend to save 4, the error says fix this one first.) When zero rows have values, Save is disabled with helper "Enter at least one KPI."
- **No autosave per row.** Floor users typo and correct. Auto‑saving as they tap would write transient bad values that an Honest States contract has to undo. One Save, with localStorage as a crash buffer.
- **Crash buffer.** Values are mirrored to `localStorage[`fulcrum.kpi.draft.${machineId}.${date}`]` on every change. On screen mount, if the buffer exists for this {machine, date} and hasn't yet been Saved, the screen restores the values and shows a `info` banner above the rows: "ⓘ Restored unsaved values from earlier today — [discard]".

---

## 7. Date stepper (yesterday default)

Wraps `DateStepper §10`. Default value = **yesterday at local midnight**. ◀ steps day‑by‑day backwards (no floor); ▶ disabled when value === today. Tapping the calendar icon opens a shadcn date picker (flagged primitive — `Calendar` may need to be added; otherwise reuse the date picker pattern from shadcn examples).

When the date is not yesterday/today, the sub‑caption hides; when it's `today`, the sub‑caption reads `today` in `warning.fg` so the user notices they're writing live data, not the typical retrospective entry.

```
   ◀   Tuesday, 9 June 2026   ▶                          ← yesterday (the default)
       yesterday

   ◀   Wednesday, 10 June 2026                            ← today (warning sub‑caption)
       today
```

---

## 8. States

### 8.1 Loading

- MachineContextHeader renders fully — the machine identity is route data, available before KPIs fetch.
- Below the header, render **N=4 SkeletonRow §13** rows with two text bars + one input bar each. Height `touch-lg` (56). This matches the floor case visually so when data arrives the rows don't reflow.
- Save button is disabled with label "Loading KPIs…".
- Skeleton animates under non‑reduced‑motion; static at `opacity: .8` otherwise.

### 8.2 Empty (machine has no KPIs defined)

- After load, if the machine has no `kpi_definition` rows, render `EmptyState §14`:
  - Glyph `—` `5xl` `ink.subtle`
  - Title `xl` `ink.strong` — "No KPIs defined for {machineName} yet"
  - Body `base` `ink.muted` — "Ask your DMT lead to define daily KPIs for this machine."
  - Action — `Button variant="secondary"` "Contact DMT lead" (mailto/handoff stub; the link is out of scope this spec)
- The DateStepper is **hidden** in this state — there's nothing to step over.

### 8.3 Validation error per row

- Row's border `1px danger.fg`. Micro‑hint replaced with `✕ {translated message}` in `danger.fg`.
- Save remains enabled if at least one row is valid and clean. Saving with errors present submits **only the clean rows**; the dirty rows persist for fix.

(Actually no — that's clever and wrong. Default behaviour is the **rollback‑safe one**: Save is disabled when any row has a validation error, so the user fixes before submitting. The clever partial‑save path is **out of scope** v1.)

So:

- **If any row has a validation error, Save is disabled.** Helper: "Fix highlighted rows to save."

### 8.4 Save success

- Toast (sonner) — `4 KPIs saved · Novafold · Mon, 9 Jun`. Auto‑dismisses 4s.
- Form rows briefly tint `success.bg` for 600ms then return to default (`transition.fast` enter, `transition.DEFAULT` exit). Disabled under `prefers-reduced-motion: reduce`.
- Inputs are cleared; the screen stays on this machine + date so the user can confirm and re‑enter if they had a typo.
- **DateStepper does NOT auto‑advance.** A supervisor who just saved 9 June may want to also enter 8 June (a forgotten day); auto‑advancing to 10 June makes them tap back twice. The default returns to yesterday on next *route mount*, not on save.

### 8.5 Save failure (5xx)

- Form body replaced with `ErrorState §14`:
  - Title `xl` `ink.strong` — "Couldn't save KPIs"
  - Body — error code `xs` mono + sentence
  - Action — "Try again"
- The crash buffer in `localStorage` keeps the entered values. Hitting "Try again" re‑posts; if the user navigates away and back, the screen restores from buffer and surfaces the `info` banner per §6.

### 8.6 RLS‑denied

- A worker without entry permission on this machine sees an empty body with `RlsDeniedNotice §14`:
  - Glyph `🔒` (or `⛔` fallback) in `ink.muted`
  - Body — "Only the F&G DMT can enter Novafold KPIs."
- The MachineContextHeader still renders — the user must know what they're looking at and why they can't act on it.

---

## 9. Internationalisation

- KPI **names** use translations from `kpi_definition.kpi_name_hi` / `kpi_name_gu` when present; **fall back to English when NULL** (per the data note in the brief). Layout never moves — the row stays the same height; the label simply renders in English with no asterisk or "EN" tag.
- **Units** are **never translated**. "L Cartons", "%", "Minutes", "Hours", "KW/TR" are technical units rendered Latin‑only across all locales. Translating "Hours" to "घंटे" feels right but creates ambiguity at a glance — and units have to be parseable by anyone in the room during a leadership review.
- **Machine names** are verbatim ("Novafold", "Heidelberg 1", "Delta 1") — proper nouns; never translated.
- **Target hints** ("target ≥ 4.20") render with Latin numerals and the `≥`/`≤` glyph at all locales. Hindi/Gujarati/Tamil supervisors see the same comparison signal as English.

---

## 10. Accessibility

- Each KpiCaptureRow is a `<label>` wrapping the input, so a screen reader reads `"Production, L Cartons, target greater than or equal to 4.20, edit text"`.
- Tab order: Date stepper ◀ → date → ▶ → calendar → KPI 1 input → KPI 2 input → … → Save.
- Enter on a KPI input moves focus to the next KPI input (mobile keyboard "next" key); on the last KPI, Enter submits (only if Save is enabled).
- Focus ring `shadow.focus` always visible; never `outline:none`.
- Numeric input has `inputmode="decimal"` on mobile so the native numeric keyboard appears immediately.

---

## 11. Behaviour details

- **Per‑row caret position.** Right‑aligned inputs put the caret at the end after each keystroke — the standard. Don't change selection on focus; the user often returns to fix the last digit.
- **Long‑press the input** opens the custom `CaptureNumberPad §3` for users in gloves or on a phone where the native keypad covers the row. Rare‑path.
- **Pull‑to‑refresh** is disabled on this screen. A pull would discard the crash buffer; we do not allow it.
- **Back navigation** on mobile (system swipe / back button) prompts a `ConfirmModal §4` "Discard unsaved KPIs?" with `severity="caution"` *only* when the form is dirty. Clean form → back navigates immediately.

---

## 12. Patterns used

- **MachineContextHeader** (`PATTERNS §12`) — fixed top, identity + path.
- **DateStepper** (`PATTERNS §10`) — yesterday‑default capture.
- **KpiCaptureRow** (`PATTERNS §11`) — body rows.
- **CaptureNumberPad** (`PATTERNS §3`) — the numeric input, with mobile pad fallback.
- **SkeletonRow** (`PATTERNS §13`) — loading.
- **EmptyState · ErrorState · RlsDeniedNotice** (`PATTERNS §14`) — empty / fail / denied bodies.
- **ConfirmModal** (`PATTERNS §4`) — discard‑unsaved confirmation.
- **StatusBadge** (`PATTERNS §1`) — used implicitly in the "today" sub‑caption (warning) and the restored‑buffer info banner.

**Confirmed primitives to add** (per leadership sign‑off): `Sheet`, `Skeleton`, `Avatar` + `AvatarFallback`, `RadioGroup`, `Sonner` toast, `Textarea`, `DropdownMenu`, `Tooltip`. `Calendar` deferred — the DateStepper's stepper path covers 99% of cases; the calendar popover stays as a rare‑path stub until that primitive lands.

**This screen's specific use** of the eight: `Sonner` for save‑success toast; `Skeleton` for KPI row loading. None of the other six are required by KPI entry directly — they're inherited via `ConfirmModal §4` (discard‑unsaved). `Tooltip` on desktop wraps the unit chips for abbreviations (`KW/TR` → "Kilowatts per Tonne of Refrigeration") when present.

---

*End of KPI_ENTRY.md — v1.1*
