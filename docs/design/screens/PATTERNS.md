# Fulcrum — PATTERNS.md

**Version:** v1.0 · **Companion to:** FOUNDATIONS.md v1.1 (D‑018) · **Owner:** Marut Shukla
**Scope:** Reusable components extracted from the three reference screens (People roster · KPI entry · Kaizen detail). Every prop contract is implementation‑ready for Claude Code.

> **Reading order.** Read FOUNDATIONS.md first — every token referenced here (`brand.DEFAULT`, `ink.muted`, `surface.sunken`, `success.bg`, `touch`, `shadow.md`, `transition.fast`, etc.) is defined there. This file does not redefine tokens; it **uses** them.

> **shadcn baseline.** The codebase already has: `Button · Input · Card · Dialog · Select · Badge · Table · Switch`. Where a pattern builds on a shadcn primitive that **isn't** in that list, it is flagged at the bottom of this file under **§14 Primitives to add**.

---

## Index

1. StatusBadge
2. TranslateControl  *(first‑class, L7)*
3. CaptureNumberPad
4. ConfirmModal
5. PinRevealModal
6. MembershipChip
7. ScoreSegment
8. ScoringPanel
9. BeforeAfterImagePair
10. DateStepper
11. KpiCaptureRow
12. MachineContextHeader
13. SkeletonRow · SkeletonImage · SkeletonText
14. EmptyState · ErrorState · RlsDeniedNotice
15. KaizenStatusChip
16. RosterFilterBar
17. TeamMemberList
18. **Primitives to add** *(flag list)*

---

## 1. StatusBadge

3‑channel state: **color + symbol + label**, never color alone (Law 4). There is no color‑only variant in the API — it cannot be misused.

### Visual

```
┌────────────────────────┐
│ ✓  Active              │   success — fg #047857  bg #ECFDF5  border #A7F3D0
└────────────────────────┘
┌────────────────────────┐
│ ●  Inactive            │   neutral — fg #57534E  bg #F5F5F4  border #E7E5E4
└────────────────────────┘
┌────────────────────────┐
│ ▲  Pending re‑auth     │   warning — fg #A16207  bg #FEFCE8  border #FDE68A
└────────────────────────┘
```

### Tokens

- Background → `status.bg`, border → `status.border` (1px solid), foreground → `status.fg`.
- Padding `space.1.5 / space.2.5` (6 × 10). Min height `space.7` (28). Radius `radius.full`.
- Type `sm` (14/1.375) weight 500. Symbol prefix renders in the **same** weight as the label so it doesn't look like an icon font has failed.
- Symbol → label gap `space.1.5` (6).

### Props

```ts
type StatusKey = "info" | "success" | "warning" | "danger" | "neutral";

interface StatusBadgeProps {
  status: StatusKey;            // drives color + symbol pair
  label: string;                // ALREADY translated by caller; renders in active locale's script
  size?: "sm" | "md";           // sm = compact tables; md = top‑of‑detail headers (default sm)
  className?: string;
}
```

### Rules

- **No `color`‑only variant.** Symbol is intrinsic to the status; never overridable. If you need a different symbol, you need a different status.
- Label is **already translated** when passed in — the component does not translate. (Caller pulls from i18n keyed by status, with English fallback when `kpi_name_hi` / `kpi_name_gu` are null — same fallback contract as label fields elsewhere.)
- **Indic safety.** Weight is `500`, never `700`. Line‑height inherits from `sm` (1.375rem) which clears Devanagari/Gujarati matras.
- Min target: badge is *informational*, not a hit target — it does NOT need `touch`. If made interactive (filter chip), see **RosterFilterBar §16**.

### States

| State | Behaviour |
|---|---|
| Default | Static. |
| Hover | No hover — badges aren't actionable. |
| Inside a `<button>` (filter pill) | Inherits button focus ring `shadow.focus`. |

### Maps to

- `success` → Active · Approved · On‑target · Synced
- `warning` → Pending re‑auth · Awaiting approval · Retraining due · Missing days
- `danger` → Overdue · Rejected · Off‑target · Sync failed
- `neutral` → Inactive · Draft · Archived · Deactivated
- `info` → Translate active · Hint · Sync notice

---

## 2. TranslateControl  *(first‑class)*

The component embodying Law 7 — **the original is never destroyed.** A worker writes Gujarati or code‑mix Hindi+English; the leader can render an English view, but the original is **always one tap away**. Translate is a **toggle over** content, not a replacement.

### Visual

Sits **above** the content block it governs, never overlaid.

```
   गुजराती · written 2026‑05‑14                [ Aa  Translate to English ]
   ───────────────────────────────────────────────────────────────────────
   CL CONNECT के जॉब में पहले ये पुलिंग (Short pull:‑95 and Long pull:‑485)
   रहे थे जिसमें २००० मीटर Foil में 6500 SHEETS चल रही थी ...
```

Once toggled:

```
   English · machine‑translated from Hindi              [ ↺ Show original ]
   ─────────────────────────────────────────────────────────────────────
   In the CL CONNECT job, the pulling was previously Short:‑95 and
   Long:‑485, which gave 6500 sheets per 2000 m of foil ...

   ⓘ Translated by Fulcrum · original by Manoj Kumar, 14 May 2026
```

### Layout

A header row + a content block. The header row is `space.10` (40) tall, never overlaps the content. Content block is whatever the host gives it (Problem Description, Result, comment, etc.).

### Tokens

- Header row background `surface.sunken` (when translate active → `info.bg`), with `line.subtle` bottom hairline.
- Source‑language label: `xs` weight 500, color `ink.muted`. **Latin metadata only** — "Hindi · written 14 May 2026" — never the translated *prose* (Indic at 12 is below the floor; see FOUNDATIONS §6).
- Action button: shadcn `Button` `variant="ghost" size="sm"` with leading 14px glyph (Aa for translate, ↺ for revert). Color `brand.strong` (`#92400E`) on light surface — readable but quieter than primary CTAs so it doesn't compete with Approve.
- When translate is active, the active header swaps to `info.bg` (`#EFF6FF`) + `info.border` (`#BFDBFE`) + the ⓘ glyph leading the source‑language strapline. This is the "info" channel of the status system, *not* "success" — translation is not a state change of the content.

### Props

```ts
interface TranslateControlProps {
  /** Original text as the worker wrote it. ALWAYS rendered verbatim by default. */
  originalText: string;

  /** BCP‑47 of original (e.g. "hi", "gu", "ta", "en"). Used for the strapline + i18n labels. */
  originalLang: "en" | "hi" | "gu" | "ta";

  /** Pre‑computed translation. Hosted server‑side; lazy‑loaded on first toggle. null = not yet fetched. */
  translatedText: string | null;
  translatedLang?: "en";        // v1 only translates → English

  /** Async resolver if translatedText is null. Component shows skeleton while pending. */
  onRequestTranslation?: () => Promise<string>;

  /** Metadata for the strapline */
  authorName?: string;          // "Manoj Kumar"
  writtenAt?: Date | string;    // ISO; rendered locale‑aware, Latin numerals (Law Q2)

  /** Visual density. block = body prose (default). inline = short comment in a list. */
  variant?: "block" | "inline";

  /** Controlled mode; otherwise component manages its own toggle state. */
  showTranslation?: boolean;
  onToggle?: (next: boolean) => void;
}
```

### Rules (non‑negotiable)

1. **Default state is ALWAYS the original.** Even if a user previously translated this block, a fresh mount shows the original first — translation is per‑session, never sticky.
2. **The original is never replaced in the DOM.** Toggling renders the translation in a sibling node; "Show original" toggles visibility, it does not re‑fetch. (Implementation hint: render both nodes; hide the inactive one with `display:none` so the original is still available to screen readers via `aria-describedby` if needed.)
3. **Never overlay.** No tooltip, no popover, no hover‑translate. The translation occupies the same column as the original.
4. **The strapline always names the source language.** A translated block whose strapline reads "English" with no "from Hindi" qualifier is a bug.
5. **Latin numerals everywhere the system renders text.** The strapline date is `14 May 2026`, never `१४ मई २०२६`. The translated body text follows the same rule. The **original** body text is **verbatim** — if the worker wrote `२०००` we render `२०००`.
6. **Layout never reflows on toggle.** The block reserves the height of the larger of the two; toggling swaps content within that envelope. Capture surfaces using TranslateControl can rely on this for stable cursor position.
7. **Reduced motion.** Toggle is `transition.fast` (120ms) opacity crossfade by default; under `prefers-reduced-motion: reduce` it is `transition.instant` (50ms) — never animated transform.

### States

| State | Behaviour |
|---|---|
| `original` (default) | Strapline `surface.sunken` + source‑language label. Action label "Translate to English". |
| `loading` (toggle pressed, no `translatedText` yet) | `SkeletonText` lines match the original's line count. Button disabled, label "Translating…". |
| `translated` | Strapline `info.bg` + ⓘ + "English · machine‑translated from <lang>". Action label "↺ Show original". Footer caption names the author + date. |
| `error` (resolver rejected) | Inline `ErrorState §14` *within the block*, with "Try again" linked to the resolver. Original remains visible above. |
| `unavailable` (originalLang === "en") | Component renders the prose without the toggle row. No empty chrome. |

### A11y

- Toggle button is a `<button>` with `aria-pressed`. Its accessible name is the action label.
- The container has `lang={originalLang}` set on the original node and `lang="en"` on the translated node, so the browser shapes glyphs per script.
- Loading state announces "Translating to English" via `aria-live="polite"`.

---

## 3. CaptureNumberPad

Numeric capture optimised for KPI entry — **faster than paper** (Law 1). Used inline on each `KpiCaptureRow §11`. On mobile this is the visible keypad; on desktop the native numeric keyboard handles it and this component renders only the input + unit + target chip.

### Visual (mobile, expanded)

```
┌──────────────────────────────────────────────┐
│  Production                       L Cartons  │
│  target ≥ 4.20                               │
│ ┌──────────────────────────────────────────┐ │
│ │                                  4 . 1 8 │ │   ← 44 height, type `lg`, tabular
│ └──────────────────────────────────────────┘ │
│ ┌────┬────┬────┐                             │
│ │ 1  │ 2  │ 3  │                             │
│ ├────┼────┼────┤                             │
│ │ 4  │ 5  │ 6  │                             │
│ ├────┼────┼────┤                             │
│ │ 7  │ 8  │ 9  │   each cell 56×56 (touch‑lg)│
│ ├────┼────┼────┤                             │
│ │ .  │ 0  │ ⌫  │                             │
│ └────┴────┴────┘                             │
└──────────────────────────────────────────────┘
```

### Tokens

- Input field: height `space.field` (48), padding‑x `space.4`, border `line.strong`, focus ring `shadow.focus`, font `data` (32/700 Latin lining + tabular). Right‑aligned.
- Pad cells: square `touch-lg` (56), radius `radius.md`, background `surface.raised`, border `line.DEFAULT`, type `xl` (20/600), `ink.strong`. Press feedback `transition.instant` (50ms) — paper‑instant per Law 1.
- Unit chip top‑right: `xs` weight 500, color `ink.muted`. Mono if it's a code (`L Cartons` is prose, mono is wrong here; `KW/TR` is technical, mono is right — let the host decide via `unitVariant`).
- Target hint: `sm` weight 400, color `ink.muted`, prefix `target ≥` or `target ≤` per `direction`.

### Props

```ts
interface CaptureNumberPadProps {
  /** Controlled value as a string so leading zeros + partial entry round‑trip cleanly. */
  value: string;
  onChange: (next: string) => void;

  /** KPI metadata for the label + unit + target hint. */
  kpiName: string;              // already translated; English fallback when Hindi/Gujarati NULL
  unit: string;                 // "L Cartons" | "%" | "Minutes" | "Hours" | "KW/TR" | …
  unitVariant?: "prose" | "code"; // default "prose"; "code" renders mono
  target?: number;
  direction?: "higher_better" | "lower_better";

  /** Mobile pad visibility. desktop: false (use native), mobile: true (custom pad). */
  showPad?: boolean;            // defaults true on viewport < md

  /** Validation message rendered below the input. */
  error?: string | null;

  /** Disable while saving / RLS denied. */
  disabled?: boolean;
}
```

### Rules

- **No spinner buttons.** A factory‑floor thumb hitting `+`/`−` 47 times is a paper loss. The keypad is the input.
- **Decimal allowed; comma not.** Internally we always store `.` as the decimal separator (matches Western‑Arabic / Latin numerals, Law Q2). Locale display formatting happens at render only.
- **Tabular figures.** Input has `font-variant-numeric: lining-nums tabular-nums` so the cursor doesn't dance as digits are typed.
- **Press feedback is mandatory but only `transition.instant`** — anything longer loses to paper.
- Backspace removes one character; long‑press clears (mobile only); not gesture‑clear (too easy to lose data).

### States

| State | Behaviour |
|---|---|
| Empty | Placeholder shows `—`. Save disabled at form level until ≥1 KPI has a value. |
| Valid | Target hint colored `ink.muted`; numeric in `ink.strong`. |
| Out of bounds | Value still accepted (factory data is sometimes ugly), but a `warning` micro‑hint appears below: `▲ above target` / `▼ below target`. Does NOT block save. |
| Validation error | Type mismatch (negative on a % field, non‑numeric paste) renders the error in `danger.fg`, input border `danger.fg`. Save disabled until cleared. |
| Disabled | Background `surface.sunken`, ink `ink.subtle`, no focus ring. |

---

## 4. ConfirmModal

Generic destructive‑action confirmation. Wraps shadcn `Dialog`. Used for **Deactivate user**, **Reject Kaizen**, **Discard draft**, etc.

### Tokens

- Backdrop `rgba(28,25,23,.48)`, blur 2px (skip blur if `prefers-reduced-motion: reduce`).
- Panel `surface.raised`, radius `radius.lg`, shadow `shadow.lg`, max‑width 480px, padding `space.6` (`24`).
- Title `2xl` (24/600) `ink.strong`. Body `base` (16/1.6) `ink.DEFAULT`. Footer aligned right on desktop, **stacked + bottom‑anchored** on mobile (per Law 5).
- Primary button colour = severity: `danger` → `destructive` shadcn variant; `caution` → `default` (brand); neutral → `secondary`.

### Props

```ts
interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  title: string;                     // "Deactivate user?"
  description?: string;              // single sentence, 1‑2 lines max
  consequenceList?: string[];        // optional bullet list of what changes; rendered as ul

  severity?: "danger" | "caution" | "neutral";   // default "caution"
  primaryLabel: string;              // "Deactivate"
  cancelLabel?: string;              // default "Cancel"

  /** Step‑confirm for serious actions. When true, user must press primary twice
   *  with a 600ms cool‑off; the second press becomes available with a subtle
   *  "Press again to confirm" label. NOT a typed confirmation — too slow on floor. */
  stepConfirm?: boolean;

  isWorking?: boolean;               // spinner replaces label on primary; cancel disabled
  onConfirm: () => void | Promise<void>;
}
```

### Rules

- **Esc closes; backdrop click closes** unless `isWorking`.
- **First focus** is on the cancel button (not primary). Floor users sometimes triple‑tap; we don't want triple‑tap to destroy a record.
- **No "Don't show again" checkbox.** Confirmation that can be skipped is a bug in disguise.
- Long‑form policy text doesn't belong here — link out.

---

## 5. PinRevealModal

Admin‑only. Reveals a worker's 4‑digit machine‑login PIN so an admin can read it to the worker over the line. Sensitive surface — its presence is gated by the admin role at the route level, and its open event is logged server‑side.

### Visual

```
┌─────────────────────────────────────────┐
│ Reveal PIN — रमेश कुमार शर्मा           │
│ Operator · CNC · Active                 │
│                                         │
│  Confirm your reason for revealing:     │
│  ◯ Worker forgot PIN (on‑floor reset)   │
│  ◯ New device pairing                   │
│  ◯ Audit verification                   │
│  ◯ Other  ────────────────              │
│                                         │
│  [ Reveal PIN ]                         │
└─────────────────────────────────────────┘
```

After Reveal:

```
┌─────────────────────────────────────────┐
│ रमेश कुमार शर्मा's PIN                  │
│                                         │
│     ┌───┬───┬───┬───┐                   │
│     │ 4 │ 8 │ 1 │ 9 │   data‑lg, tabular│
│     └───┴───┴───┴───┘                   │
│                                         │
│  Auto‑hides in 12s · [ Hide now ]       │
│                                         │
│  [ Copy ]  [ Regenerate ]  [ Done ]     │
└─────────────────────────────────────────┘
```

### Tokens

- Panel inherits ConfirmModal tokens.
- PIN digit cells: `space.10 × space.12` (40 × 48), border `line.strong`, background `surface.sunken`, type `data-lg` (44/700) tabular.
- Auto‑hide countdown progress bar uses `brand.subtle` background + `brand.DEFAULT` fill, `transition.slow` linear over 12s.

### Props

```ts
type RevealReason = "forgot" | "device_pairing" | "audit" | "other";

interface PinRevealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  user: { id: string; displayName: string; role: string; primaryAssignment: string; lang_pref: "en" | "hi" | "gu" | "ta" };

  /** Server resolves only after reason is captured (audit trail). */
  onReveal: (reason: RevealReason, otherText?: string) => Promise<{ pin: string }>;

  /** Optional admin actions. If omitted, the buttons are not rendered. */
  onCopy?: (pin: string) => void;
  onRegenerate?: () => Promise<void>;

  /** Auto‑hide ms after reveal. Default 12000. */
  autoHideMs?: number;
}
```

### Rules

- **PIN is never in the DOM before the admin confirms reason.** Server returns it only after `onReveal()` resolves. (Prevents accidental leak via devtools or screen‑share.)
- **Auto‑hide is non‑skippable.** "Keep visible" is not an option.
- **Copy** writes to clipboard *and* schedules a clipboard clear at `autoHideMs` (best‑effort; falls back to a banner reminding the admin to clear it).
- **Regenerate** is a destructive action — wraps a nested `ConfirmModal` with `severity="danger"` because it invalidates the old PIN immediately.

---

## 6. MembershipChip

Tells primary authority apart from additional participation. Worker's *primary* JH group / DMT shows as a plain text label; *additional* memberships render as chips with visibly different chrome so they read as **participation, not authority**.

### Visual

```
   Primary:   SFM · Folding & Gluing · Novafold        ← plain ink.strong text
   Also in:   [ + RFM · D1 ]  [ + SFM · Press ]        ← dashed border chips
```

### Tokens

- Background `surface.raised`. Border `1px dashed line.strong` (the dash is the affordance: "participates in, not owned by").
- Padding `space.1 / space.2.5`. Min height `space.7`. Radius `radius.full`. Type `sm` (14/500) `ink.DEFAULT`. Leading `+` glyph in `ink.muted`.
- Hover (when interactive): `surface.hover`, border becomes solid `line.strong`. Focus `shadow.focus`.
- **Never amber.** Membership is informational. Amber is the brand action; using it here makes membership look like a CTA.

### Props

```ts
interface MembershipChipProps {
  /** Path within the org: ["RFM","D1","Delta 1 Floor"] → "RFM · D1 · Delta 1 Floor" */
  path: string[];

  /** primary = no dash, no plus glyph, no chrome — used in the same row to set the contrast. */
  variant?: "primary" | "additional";   // default "additional"

  /** Tap target for filter‑by‑membership. If omitted, chip is static. */
  onClick?: () => void;
}
```

### Rules

- The path is rendered with `·` as separator, **never `/` or `>`** — slashes read like a URL and arrows imply navigation, neither of which fits org‑breadcrumb semantics.
- **Indic safety:** longest org path test cases live in `PEOPLE_ROSTER.md §5 fixtures`. Chips wrap to a second line; they do not truncate. Truncation hides information that is the entire point of the chip.

---

## 7. ScoreSegment

The 1 / 3 / 9 segmented control for Kaizen scoring. Three discrete values — **not a slider**. A leader scores by speaking: "nine on P‑Q, three on S, nine on C, three on M — twenty‑four". The control must read that fluently.

### Visual

```
   P,Q   Productivity / quality impact          ┌────┬────┬────┐
         9 — Impact on both P & Q              │ 1  │ 3  │█9█ │
                                               └────┴────┴────┘
```

### Tokens

- Three buttons in a row, each `touch` (44) tall, evenly distributed. Border `line.strong`. Background `surface.raised`. Type `lg` (18/600) tabular.
- Selected: background `brand.DEFAULT`, ink `brand.on`. Focus ring `shadow.focus`. Hover (unselected): `surface.hover`.
- Disabled (already approved, viewer is not admin): background `surface.sunken`, ink `ink.subtle`. Selected state still legible: outlined with `line.strong`, value in `ink.strong` semibold — no amber when read‑only.
- Dimension tag (P,Q / S / C / M) renders as `xs` weight 500 mono‑like uppercase **Latin only** — these are codes, not prose. (Mono is fine here even though the rubric prose is sans.)

### Props

```ts
type ScoreValue = 1 | 3 | 9;

interface ScoreSegmentProps {
  /** Dimension code: P,Q | S | C | M  (must match KAIZEN_DETAIL §4 scoring panel order). */
  dimension: "P,Q" | "S" | "C" | "M";

  /** Long label, already translated. Renders to the left of the segments on desktop, above on mobile. */
  label: string;

  /** Rubric phrasing per value, already translated. Renders under the selected value as live caption. */
  rubric: Record<ScoreValue, string>;

  value: ScoreValue | null;       // null = not yet scored
  onChange: (next: ScoreValue) => void;

  readOnly?: boolean;             // approved Kaizen, or viewer < dmt_leader
}
```

### Rules

- **Three values only, never a slider.** A slider lets a leader pick 2, 4, 7 — none of those exist in the rubric. The control encodes the rubric.
- **Caption updates live** under the selected value with that value's rubric phrase. This is what makes the verbal idiom work — the leader says "nine" and the screen shows what nine *means*.
- Tab order is left→right: 1 → 3 → 9. Arrow keys move within the group; Space/Enter selects.
- `aria-label` reads `"{dimension} — {label}, score {value} of 9"` (translated).

---

## 8. ScoringPanel

Composition of four `ScoreSegment` rows plus a live total. The panel a `dmt_leader+` sees on Kaizen detail when status = `submitted`.

### Visual

```
   ┌───────────────────────────────────────────────────────────────────┐
   │  Best Kaizen — Scoring                                        / 36│
   │                                                              ──── │
   │  P,Q  Productivity / quality impact     [1] [3] [█9█]              │
   │       Impact on both P & Q                                        │
   │  S    EHS impact                         [1] [█3█] [9]            │
   │       Significant                                                 │
   │  C    Quantitative benefit               [1] [3] [█9█]            │
   │       More than ₹1,00,000/year                                    │
   │  M    Easy to follow                     [1] [█3█] [9]            │
   │       One of (implement / adherence) easy                         │
   │                                                              24/36│
   │                                                                   │
   │  [ Reject with reason ]                  [   Approve  ]            │
   └───────────────────────────────────────────────────────────────────┘
```

### Tokens

- Card `surface.raised`, radius `radius.lg`, shadow `shadow.sm`, padding `space.6`.
- Section title `2xl` (24/600). Total figure `data` (32/700 tabular) right‑aligned. Updates live with `transition.fast` opacity flash on change.
- "Approve" = shadcn `Button` default (brand). "Reject with reason" = `Button variant="ghost"` `ink.muted` — alternative, never co‑primary.

### Props

```ts
interface ScoringPanelProps {
  scores: Partial<Record<"P,Q"|"S"|"C"|"M", ScoreValue>>;
  onScoreChange: (dimension: "P,Q"|"S"|"C"|"M", value: ScoreValue) => void;

  readOnly: boolean;              // viewer < dmt_leader OR status === "approved"
  onApprove: () => Promise<void>;
  onReject: () => void;           // opens a separate "Reject with reason" dialog
}
```

### Rules

- **Approve is enabled only when all four are scored.** Rendering should make this visible (greyed approve + helper "Score all four dimensions to approve").
- **Total cannot be edited directly.** It is derived.
- The four rows render in fixed order **P,Q · S · C · M** — never alphabetical, never by score. This is the verbal idiom and the printed rubric order; reordering breaks both.

---

## 9. BeforeAfterImagePair

Side‑by‑side Before/After image pair on Kaizen detail. Signed URLs load ~1s — must handle the gap gracefully, never collapse, never spin without context.

### Visual

```
   ┌────────────────────────┐  ┌────────────────────────┐
   │ Before                 │  │ After                  │
   │ ┌────────────────────┐ │  │ ┌────────────────────┐ │
   │ │                    │ │  │ │                    │ │
   │ │       image        │ │  │ │       image        │ │
   │ │                    │ │  │ │                    │ │
   │ └────────────────────┘ │  │ └────────────────────┘ │
   │ Caption — Hindi verbatim│  │ Caption — Hindi verbatim
   └────────────────────────┘  └────────────────────────┘
```

### Tokens

- Each card `surface.raised`, radius `radius.lg`, shadow `shadow.xs`, padding `space.3`. Inner image area is **aspect‑locked 4:3** with `background: surface.sunken` and `radius.md` — reserves layout *before* the image loads (Law 6: layout never reflows).
- Header row "Before" / "After" type `lg` (18/500) `ink.strong`. Caption `sm` `ink.muted`.
- Lightbox (on click): backdrop `rgba(0,0,0,.8)`, image contained with arrow nav + ESC close.

### Props

```ts
interface BeforeAfterImagePairProps {
  before: { src: string | null; alt: string; caption?: string };
  after:  { src: string | null; alt: string; caption?: string };

  /** Loading state per side — host owns it because signed URLs may arrive at different times. */
  beforeLoading?: boolean;
  afterLoading?: boolean;

  /** Per‑side error (signed URL expired, blob missing). Renders ErrorState §14 inside the slot. */
  beforeError?: string | null;
  afterError?: string | null;

  /** Click opens lightbox; if omitted, images are static. */
  onOpen?: (which: "before" | "after") => void;
}
```

### Rules

- **Aspect ratio is always 4:3 in the slot, regardless of actual image dimensions.** Image fits with `object-fit: contain` and `background: surface.sunken` — never crop a Kaizen photo without permission.
- **Skeleton state** uses `SkeletonImage §13` — does NOT animate a spinner. Pulsing skeleton tells the user "data is coming," a spinner tells the user "wait."
- **Captions follow Law 7.** If the worker wrote the caption in Hindi, it stays in Hindi here verbatim. Pair with `TranslateControl §2` *outside* this component when the host wants translation over the caption — never inside.

---

## 10. DateStepper

The yesterday‑default date picker for KPI entry. Captures 99% of cases (yesterday's production) in zero taps.

### Visual

```
   ┌──────────────────────────────────────────────────┐
   │  ◀   Tuesday, 9 June 2026   ▶   [📅]              │
   │      yesterday                                   │
   └──────────────────────────────────────────────────┘
```

### Tokens

- Container `surface.raised`, border `line.DEFAULT`, radius `radius.md`, height `space.field` (48).
- Date text `lg` (18/500) `ink.strong`. Sub‑caption (yesterday / today / N days ago) `sm` `ink.muted`.
- ◀ / ▶ are 44px hit areas (touch). Calendar icon opens a shadcn date picker — secondary path; the steppers are the primary affordance.

### Props

```ts
interface DateStepperProps {
  value: Date;
  onChange: (d: Date) => void;

  /** Inclusive bounds. KPI entry locks the future. */
  min?: Date;
  max?: Date;                     // default = today

  /** Default initial value when uncontrolled. Used for "yesterday default" wiring. */
  defaultValue?: Date;            // host typically passes yesterday
}
```

### Rules

- **Sub‑caption is a relative phrase** for the first ±3 days (today / yesterday / 2 days ago / …); beyond that it's hidden.
- **Tomorrow ▶ is disabled when value === today.** Steppers do not silently wrap.
- **Latin numerals + Latin month names rendered per active locale** (en‑IN by default). Indic locales still show Latin numerals (Law Q2).

---

## 11. KpiCaptureRow

One row of KPI entry. Composes `CaptureNumberPad` + label + unit + target hint. Stack of these is the body of the KPI entry screen.

### Visual (desktop, collapsed)

```
   ┌────────────────────────────────────────────────────────────────────┐
   │ Production               L Cartons     target ≥ 4.20   [   4.18 ]  │
   │ ▼ below target                                                    │
   └────────────────────────────────────────────────────────────────────┘
```

### Tokens

- Row min height `space.touch-lg` (56). Padding `space.4 / space.5`. Border bottom `line.subtle`.
- Label `lg` (18/500) `ink.strong`. Unit + target hint `sm` `ink.muted`.
- Input on the right is the `CaptureNumberPad §3` collapsed view.

### Props

```ts
interface KpiCaptureRowProps {
  kpi: {
    id: string;
    name: string;                 // already‑translated; English fallback when Hindi/Gujarati null
    unit: string;
    unitVariant?: "prose" | "code";
    target?: number;
    direction?: "higher_better" | "lower_better";
  };
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
  disabled?: boolean;
}
```

### Rules

- **Label is translated by the caller**, with the English‑fallback contract (`kpi_name_hi` / `kpi_name_gu` NULL → English `kpi_name` — same as the global rule). The component does not lookup translations.
- **Validation does not block save.** Out‑of‑target shows a micro‑hint; type errors block. Distinction: ugly data is real, malformed data isn't.

---

## 12. MachineContextHeader

The screen header for KPI entry, fixed at top, containing machine identity + JH/DMT path. Sets the **context that makes the entry trustworthy** (entering 4.18 against the wrong machine is the original sin).

### Visual

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Novafold                                                            │
   │ SFM · F&G · Folding & Gluing                                        │
   │ ──────────────────────────────────────────────────────────────────  │
   │ ◀   Tuesday, 9 June 2026   ▶   [📅]    Folder Gluer · 4 KPIs         │
   └─────────────────────────────────────────────────────────────────────┘
```

### Tokens

- Background `surface.raised`. Bottom border `line.DEFAULT`. Padding `space.4 / space.6`.
- Machine name `2xl` (24/600) `ink.strong`. Org path `sm` `ink.muted` rendered with `·` separators (matches MembershipChip).
- Sticky to viewport top during KPI entry scroll. Shadow `shadow.xs` appears on scroll start (so it lifts off the content) — not before.

### Props

```ts
interface MachineContextHeaderProps {
  machine: {
    id: string;
    name: string;                  // "Novafold" — Latin code; verbatim
    type: string;                  // "Folder Gluer"
    path: string[];                // ["SFM","F&G","Folding & Gluing"]
  };
  date: Date;
  onDateChange: (d: Date) => void;
  kpiCount: number;                // for the "4 KPIs" hint
}
```

---

## 13. Skeleton primitives

### SkeletonText

Pulsing rectangle, 1+ lines, used inside any text block awaiting load (translate, captions).

```ts
interface SkeletonTextProps {
  lines?: number;                  // default 3
  lastLineWidth?: string;          // default "60%"
}
```

Tokens: bar background `surface.sunken`, animation `opacity 0.6 ↔ 1.0` 1.4s ease, suspended under `prefers-reduced-motion: reduce` (static at opacity 0.8).

### SkeletonRow

Used in roster + KPI list while loading.

```ts
interface SkeletonRowProps {
  columns?: number;                // matches the destination table's column count
  height?: number;                 // default touch-lg (56)
}
```

### SkeletonImage

Used inside `BeforeAfterImagePair §9` slot.

```ts
interface SkeletonImageProps {
  aspect?: "4:3" | "16:9" | "1:1"; // default "4:3"
}
```

---

## 14. EmptyState · ErrorState · RlsDeniedNotice

Three sibling components for the **honest states** family (Law 8). All three share an envelope: centered icon‑mark (Unicode glyph, not raster), title, single‑sentence body, optional action.

### EmptyState

```ts
interface EmptyStateProps {
  glyph?: string;                  // default "—"  ;  filter‑empty uses "⌕"
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}
```

Tokens: glyph in `5xl` `ink.subtle`; title `xl` `ink.strong`; body `base` `ink.muted`; action is `Button variant="secondary"`. **Never** an illustration — illustrations infantilise floor users and add load weight.

### ErrorState

```ts
interface ErrorStateProps {
  title: string;                   // "Couldn't load roster"
  message?: string;                // technical detail if useful; otherwise hide
  onRetry?: () => void;
}
```

Tokens: glyph `✕` in `danger.fg`. Title `xl` `ink.strong`. Body `base` `ink.muted`. Retry is `Button variant="default"`.

### RlsDeniedNotice

For row actions the viewer's role doesn't permit (e.g. SFM leader trying to PIN‑reveal an RFM worker). Renders **in place of** the action menu item rather than as a toast — the user must see that the action isn't theirs, not learn it after the fact.

```ts
interface RlsDeniedNoticeProps {
  reason: string;                  // "RFM workers are managed by the RFM DMT lead"
}
```

Tokens: glyph `🔒` (one‑off — only place the Fulcrum system uses an emoji; if the team rejects this, fall back to "⛔" in `ink.muted`). Body `sm` `ink.muted`. **No retry.** A denied action is denied.

---

## 15. KaizenStatusChip

The status progression chip on Kaizen detail. A specialised `StatusBadge §1` that knows the four canonical Kaizen states.

```ts
type KaizenStatus =
  | "draft"                        // neutral ●
  | "submitted"                    // warning ▲  awaiting approval
  | "approved"                     // success ✓  with score
  | "rejected";                    // danger  ✕  with reason

interface KaizenStatusChipProps {
  status: KaizenStatus;
  /** When status === "approved", renders `✓ Approved · 24/36`. */
  score?: number;
}
```

Wraps `StatusBadge` with a fixed mapping; no other variants.

---

## 16. RosterFilterBar

The top‑of‑roster filter row. Composes shadcn `Select`s for role / JH group / DMT / status, plus search `Input`, plus a chip rail of active filters (for mobile clarity).

### Tokens

- Bar background `surface.raised`, bottom border `line.DEFAULT`, padding `space.3 / space.4`.
- Active‑filter chips: `Badge` variant with leading `·` glyph, trailing `×` button — when present, clicking the × removes that filter only.
- Search input height `space.field` (48), leading glyph `⌕`.

### Props

```ts
interface RosterFilters {
  q: string;
  role: "all" | "operator" | "supervisor" | "dmt_leader" | "admin" | "viewer";
  jhGroup: "all" | "RFM" | "SFM" | "UTIL";
  dmt: "all" | "D1" | "CNC" | "FG" | "PRINT" | "VA" | "no_dmt";
  status: "all" | "active" | "inactive" | "pending_reauth";
}

interface RosterFilterBarProps {
  filters: RosterFilters;
  onChange: (next: RosterFilters) => void;
  totalShown: number;
  totalAll: number;
}
```

### Rules

- The **No DMT assigned** option (`no_dmt`) is a labeled group — *not* hidden, not "Other." It's a data quirk that needs surface; see PEOPLE_ROSTER §3.
- Selects render their value in the trigger using the same `·`‑separated path as `MembershipChip` (`SFM · F&G`), so the visual language carries across.
- Mobile: filter selects collapse into a single "Filters" button that opens a `Sheet` (see §18 primitives).

---

## 17. TeamMemberList

Member list for Kaizen Team Details. 1..N members; the longest list we've seen is 8. Designed for vertical legibility, not a grid.

### Visual

```
   Team
   ──────────────────────────────────────────────────────────────────
   ●  Manoj Kumar                Foiling Operator · VA · Foil Stamp
   ●  रमेश कुमार शर्मा           Helper · VA · Foil Stamp
   ●  திருமலைச்சாமி வேங்கடாசலபதி  Supervisor · VA
   ●  Anu Rao                    Quality · VA
```

### Tokens

- Row `space.touch-lg` (56) min height. Leading 32px `Avatar` (initials fallback — never icon glyph). Name `lg` (18/500). Role + assignment `sm` `ink.muted` with `·` separator.

### Props

```ts
interface TeamMemberListProps {
  members: Array<{
    id: string;
    displayName: string;          // already rendered in worker's lang_pref script
    role: string;
    primaryAssignment: string;
  }>;
}
```

### Rules

- **Wraps; does not truncate.** Long Tamil names get a second line; the row min‑height grows.
- Avatar uses **last + first letter** initials so the disambiguation stays useful across scripts where given‑name‑first vs family‑name‑first orderings differ. (Implementation: first grapheme of each whitespace‑separated token, capped at 2.)

---

## 18. Primitives to add (flag list)

shadcn primitives the screens need that are **not** in the installed set (`Button · Input · Card · Dialog · Select · Badge · Table · Switch`):

| Primitive | Used by | Why |
|---|---|---|
| **Sheet** | RosterFilterBar §16 (mobile), KAIZEN_DETAIL scoring panel on phone | A modal that slides from bottom; required for one‑handed filter editing on mobile (Law 5). |
| **Skeleton** | §13 family, all loading states across the three screens | Honest loading (Law 8). Spinner is not adequate. |
| **Avatar / AvatarFallback** | TeamMemberList §17, roster row leading initials | Multi‑script initials need consistent sizing + fallback chain. |
| **RadioGroup** | PinRevealModal §5 reason capture, ScoreSegment §7 (alternative impl) | Form‑native radio behaviour with arrow‑key navigation; replaces hand‑rolled segmented buttons where keyboard semantics matter more than the visual segmented look. |
| **Toast (sonner)** | Save success on KPI entry, copy‑to‑clipboard confirmations | Non‑blocking confirmation that survives one‑handed use. **Never** for errors — those are inline. |
| **Tooltip** | StatusBadge hover hint on desktop only | Optional; current designs do not require it. **Flag, not adopt** — request from the team before adding. |

**Patterns that do NOT need a new primitive:**

- TranslateControl is shadcn `Button` (ghost) + a wrapping div; no primitive.
- ScoringPanel is shadcn `Card` + composed ScoreSegments.
- ConfirmModal / PinRevealModal are shadcn `Dialog`.
- DateStepper is `Button`s + `Input` (or popover) — no new primitive needed unless a calendar grid component is desired.

---

## 19. LanguageSwitcher  *(shell fixture — Phase 2 Step 2)*

One component, two presentational variants over a single `useLanguageSwitch()` hook.

### Variants
- `variant="links"` — Facebook‑style inline row `English · हिन्दी · ગુજરાતી · தமிழ்` (DESIGN_SYSTEM §3.4). Login footer + mobile profile sheet.
- `variant="dropdown"` — compact globe + current native name; shadcn `DropdownMenu`. Desktop sidebar footer.

### Rules (non‑negotiable)
- **All four languages are DISPLAYED.** Selectability is gated by `SELECTABLE_LANGS` (en/hi/gu today); the unselectable language (Tamil, until Step 5 / D‑008) renders **disabled + greyed** with a `common.langComingSoon` tooltip — never hidden (§3.4 shows all four).
- Each native label carries `lang={code}` so the browser shapes glyphs per script (cross‑cutting rule 6).
- The hook is the only place a switch happens: i18next set → local‑session mirror → `set_my_lang_pref` RPC (authenticated) → success toast. Pre‑auth (login) persists `tpm_ui_lang` only, no RPC.
- RPC failure is **soft** — the UI already switched; never toast the error (§18 toast guidance).

---

## 20. AppShell navigation  *(module‑ + role‑driven — Phase 2 Step 3a)*

Navigation is **data, not JSX branches**. A single `NAV_CONFIG: NavEntry[]` drives every surface; a future pillar module is one new row (ARCHITECTURE §7.3, Vision §5.6).

### NavEntry
`{ to, labelKey, icon, moduleKey: ModuleKey|null, minRole: TpmRole|null, surface: 'capture'|'admin' }`

### Visibility predicate (`visibleNav`)
`(moduleKey === null || enabledSet.has(moduleKey)) && (minRole === null || roleAtLeast(role, minRole)) && (surface matches)`

### Rules
- **Capture** entries carry a `moduleKey` → shown only when `factory_module.is_enabled` for the active factory (RLS `fm_read` lets shop‑floor read it). Home is always‑on (`moduleKey: null`).
- **MDM** is platform infrastructure (module‑zero, D‑012) — **role‑gated only, never module‑gated**, desktop `admin` surface (MDM is desktop‑first admin, MDM_SPEC §5).
- `minRole` must equal the route's `RequireRole` guard so nav never advertises a denied surface (the route guard is the control, B7/D4; nav is UX hygiene).
- **Desktop:** dark sidebar (capture group + "Master Data" admin group + footer: LanguageSwitcher dropdown + Profile). **Mobile:** bottom‑anchored capture nav + a Profile entry opening `ProfileSheet` (language links + logout). Touch targets `min-h-touch` (≥44px).

---

## 21. CaptureColumn  *(Phase 3 M1 — pending Design v1.2 ratification)*

The centered column every KPI surface lives in — **not full‑bleed**. Two variants: **`reading`** (default, `max-w-3xl` ≈ 768px) for CAPTURE — comfortable card width + line length; **`wide`** (`md:w-4/5`, ≈ 80% of the content area after the sidebar) for ANALYSIS surfaces (trend charts) that benefit from horizontal room. Full‑width with `px-gutter` on mobile either way. KPI capture uses `reading`; KPI trend uses `wide`; OPL/Kaizen inherit both.

```ts
interface CaptureColumnProps { children: ReactNode; className?: string; variant?: 'reading' | 'wide' }
```

## 22. MachineCard  *(Phase 3 M1 — pending Design v1.2 ratification)*

A token‑styled card for one capture unit (a machine, or a rollup): **header** slot (identity — `MachineContextHeader §12` + an optional trailing `StatusBadge §1`), **body** slot (the `KpiCaptureRow §11` stack / module rows), **footer** slot (the per‑unit primary action, e.g. "Save N KPIs"). Card `surface.raised` · `radius.lg` · `shadow.sm` · border `line`. Footer is **sticky‑to‑bottom on desktop** (`md:sticky md:bottom-0`) while a tall card is in view, so the action stays reachable at ANY row count — no nested scroll, no fixed‑count budget (supersedes KPI_ENTRY's ≤6 no‑scroll assumption). On **mobile** the footer is static (the shell's fixed bottom nav overlays viewport‑bottom; the scroll area's `pb‑24` keeps the static footer clear). Intentionally **not** `overflow-hidden` (that disables the sticky footer; corners rounded on the footer instead). *(Mobile sticky‑with‑nav‑offset → Design v1.2.)*

```ts
interface MachineCardProps { header: ReactNode; children: ReactNode; footer?: ReactNode; stickyFooter?: boolean; className?: string }
```

- **One card per machine; clear gap between cards** (`space-y-4`). Type hierarchy: machine name (`xl/600`) > KPI name (`lg/500`) > meta (`sm` muted). Burnt‑amber accent only on the action + focus, never decoratively.

## 23. TrendSection  *(Phase 3 M1 — pending Design v1.2 ratification)*

Groups analysis charts under a clear, **collapsible** section header — one section per machine, plus a delineated rollup ("JH Overview") section — so a trend page reads as structured machine groups, not a flat grid. Header is a `<button aria-expanded>` (title verbatim machine name / translated label · optional subtitle = org path · optional trailing meta = KPI count) with a rotating chevron. Reusable by OPL/Kaizen analysis surfaces.

```ts
interface TrendSectionProps { title: string; subtitle?: string; meta?: string; defaultOpen?: boolean; children: ReactNode }
```

> **Note (Design v1.2):** §21–23 + the role‑conditional landing (capture‑first vs analytics‑first) and the single‑page **machine‑cards capture** layout (each machine a card with its own Save, group selector + DateStepper in one sticky header) are a Phase‑3 refinement of `KPI_ENTRY.md`'s "machine is the screen" → "machine is the **card**". Capture‑speed levers preserved (yesterday‑default, no per‑machine context taps, per‑machine Save). To be formalised in a Design v1.2 pass.

---

## Cross‑cutting rules (apply to every pattern)

1. **Every component must render its longest‑language string without truncating, overlapping, or breaking layout.** Each spec includes a test fixture; verify against all four scripts.
2. **Tokens only.** No hex literals in implementation. No prototype palette names.
3. **Capture surfaces** (KPI entry, PIN reveal, scoring) use `touch` minimum; `touch-lg` for primary actions; bottom‑anchored on mobile.
4. **Numbers** are Latin / Western‑Arabic, `lining-nums tabular-nums`, right‑aligned in tables and KPI columns.
5. **Animation** is wrapped in `@media (prefers-reduced-motion: no-preference)`. Capture flows survive zero animation.
6. **Strings rendered as `lang={…}`** in JSX/HTML so the browser shapes glyphs per script even mid‑swap.
7. **No emoji except the single 🔒 fallback in RlsDeniedNotice §14**, pending team review. Status symbols (✓ ▲ ✕ ● ⓘ) are Unicode geometric marks, not emoji.

---

*End of PATTERNS.md*
