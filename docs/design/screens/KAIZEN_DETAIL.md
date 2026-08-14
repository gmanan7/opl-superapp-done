# Fulcrum — KAIZEN_DETAIL.md

**Version:** v1.1 · **Companion to:** FOUNDATIONS.md v1.1 (D‑018) · **References:** PATTERNS.md
**Purpose:** **The richness bar.** Law 7 made physical — *the original is never destroyed*. Real worker prose (code‑mix Hindi+English) renders verbatim by default; translation is a toggle that lives **over** the content, never replaces it. Approval scoring follows the leader's verbal idiom: 1 / 3 / 9 per dimension, total live, P,Q · S · C · M ordered.

### v1.1 changes

- **R1 — Role gating rewritten against the canonical `user_role` enum.** The shorthand `dmt_leader+` is replaced everywhere by explicit role sets. Three role tiers govern this screen's behaviour:
  - **Approver tier** — `dmt_leader`, `pillar_champion`, `be_team`, `admin`. Sees the scoring panel **editable** when status = `submitted`. Can approve or reject.
  - **Reviewer tier** — `jh_leader`, `dmt_member`. Sees the scoring panel **read‑only** when status = `submitted` (visibility into pending approvals, no action).
  - **Worker tier** — `apprentice`, `on_roll`. Sees an `info` Alert ("Awaiting approval by {leaderName}"); scoring panel hidden.
  - **Admin override** is `admin` specifically — can re‑open `approved` and edit scores via a route‑level menu (out of scope this spec).
- **R2 acknowledged** — the Kaizen's DMT / department path renders from the record's stored `dmt_id` resolved through `useOrgStructure()`, not from hardcoded codes. The `VA · Foil Stamping` text in §2/§3/§4 is sample data.
- Confirmed primitives list updated in §13.

---

## 1. Source sample (real Kaizen, attached)

Theme: **"Change Pulling in job And Saving Foil"** — Manoj Kumar et al., VA · Foil Stamping.

Problem Description (verbatim — Devanagari + English code‑mix, as the worker wrote):

> CL CONNECT के जॉब में पहले ये पुलिंग (Short pull:‑95 and Long pull:‑485) रहे थे जिसमें २००० मीटर Foil में 6500 SHEETS चल रही थी।

Result (verbatim):

> पुलिंग को Short pull:‑75 and Long pull:‑425 करने पर २००० मीटर Foil में 8200 SHEETS चलने लगी। प्रति Sheet Foil saving ≈ 12%.

The translate control reveals an English rendering on tap; the original is one tap away. **Inline English technical terms ("Short pull", "Foil", "SHEETS", "CL CONNECT") are part of the original prose — they are not translated away when the user toggles to English, they remain as the worker wrote them.** This is the difference between machine translation and respect.

---

## 2. Layout — desktop (≥ 1024px)

```
┌──────────────┬────────────────────────────────────────────────────────────────┐
│              │  ◀ Kaizens                                                     │
│  dark‑rail   │  ──────────────────────────────────────────────────────────────│
│              │  Change Pulling in job And Saving Foil                         │
│              │  KZN‑2026‑0418 · VA · Foil Stamping                            │
│              │  Started 4 May 2026 · Closed 9 May 2026                        │
│              │  [ ▲ Submitted — awaiting approval ]                            │
│              │                                                                │
│              │  ┌──── Before ────────────┐  ┌──── After ─────────────┐         │
│              │  │                        │  │                        │        │
│              │  │     image 4:3 slot     │  │     image 4:3 slot     │        │
│              │  │                        │  │                        │        │
│              │  └────────────────────────┘  └────────────────────────┘        │
│              │  Caption (verbatim Hindi)     Caption (verbatim Hindi)         │
│              │                                                                │
│              │  ── Problem Description ─────────────────────────────────────  │
│              │  [Hindi · written 4 May 2026]      [ Aa  Translate to English ]│
│              │  CL CONNECT के जॉब में पहले ये पुलिंग (Short pull:‑95 and        │
│              │  Long pull:‑485) रहे थे जिसमें २००० मीटर Foil में 6500 SHEETS    │
│              │  चल रही थी।                                                     │
│              │                                                                │
│              │  ── Result ──────────────────────────────────────────────────  │
│              │  [Hindi · written 9 May 2026]      [ Aa  Translate to English ]│
│              │  पुलिंग को Short pull:‑75 and Long pull:‑425 करने पर २०००       │
│              │  मीटर Foil में 8200 SHEETS चलने लगी। प्रति Sheet Foil saving 12%.│
│              │                                                                │
│              │  ┌── Team ──────────────────────────┐  ┌── Costs & Benefit ─┐  │
│              │  │ ● Manoj Kumar    Operator · VA   │  │ Cost of mod  ₹ 0    │ │
│              │  │ ● रमेश कुमार    Helper · VA      │  │ Benefit/yr   ₹ 4.8L│  │
│              │  │ ● தி. வேங்கடா-                   │  │                     │  │
│              │  │     சலபதி      Supervisor · VA   │  │ Scope HD            │  │
│              │  │ ● Anu Rao       Quality · VA     │  │ All Foil Stamping   │  │
│              │  │ ● विनयकृष्ण द.   DMT · VA         │  │ lines (Clamshell    │  │
│              │  └──────────────────────────────────┘  │  1–2, T&L 1–8)      │  │
│              │                                       └─────────────────────┘  │
│              │                                                                │
│              │  ┌── Best Kaizen — Scoring ─────────────────────────────── /36│ │
│              │  │ P,Q  Productivity / quality impact   [1] [3] [█9█]          │
│              │  │      Impact on both P & Q                                  │ │
│              │  │ S    EHS impact                       [1] [█3█] [9]        │ │
│              │  │      Significant                                          │ │
│              │  │ C    Quantitative benefit             [1] [3] [█9█]        │ │
│              │  │      More than ₹1,00,000/year                              │ │
│              │  │ M    Easy to follow                   [1] [█3█] [9]        │ │
│              │  │      One of (implement / adherence) easy                  │ │
│              │  │                                                       24/36│ │
│              │  │  [ Reject with reason ]                    [    Approve   ]│ │
│              │  └────────────────────────────────────────────────────────────┘│
│              │                                                                │
│              │  Approved by — (will be filled on approval)                    │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

- Main content column max‑width 880px, centered. Side rails left blank — leader review is a focused read, not a dashboard scan.
- Hierarchy: Title → status chip → image pair → prose blocks → team/costs → scoring panel. The scoring panel sits at the bottom because that is the **action surface**; everything above informs it.

## 3. Layout — mobile (< 768px)

```
┌────────────────────────────────────────┐
│ ◀  Kaizens                             │
│ ────────────────────────────────────── │
│ Change Pulling in job And Saving Foil  │
│ KZN‑2026‑0418                          │
│ VA · Foil Stamping                     │
│ Started 4 May · Closed 9 May 2026      │
│ [ ▲ Submitted — awaiting approval ]    │
│                                        │
│ ┌──────────── Before ────────────────┐ │
│ │       image 4:3 slot               │ │
│ └────────────────────────────────────┘ │
│ ┌──────────── After ─────────────────┐ │
│ │       image 4:3 slot               │ │
│ └────────────────────────────────────┘ │
│                                        │
│ Problem Description                    │
│ Hindi · written 4 May 2026             │
│         [ Aa  Translate to English ]   │
│ ────────────────────────────────────── │
│ CL CONNECT के जॉब में पहले ये पुलिंग    │
│ (Short pull:‑95 and Long pull:‑485)…   │
│                                        │
│ Result                                 │
│ Hindi · written 9 May 2026             │
│         [ Aa  Translate to English ]   │
│ ────────────────────────────────────── │
│ पुलिंग को Short pull:‑75 …               │
│                                        │
│ Team — 5 members          [▾ expand]   │
│ Costs & Benefit           [▾ expand]   │
│ Horizontal Deployment     [▾ expand]   │
│                                        │
│ ──────────────────────────────────────  │
│ ┌───────────────────────────────────┐  │
│ │   ▲ Score this Kaizen (24/36)     │  │ ← bottom‑anchored, opens Sheet
│ └───────────────────────────────────┘  │
└────────────────────────────────────────┘
```

- Mobile shows image pair **stacked**, never crammed side‑by‑side at thumbnail size (loses the comparison value).
- Translate control sits **above** each prose block on its own line — mobile space doesn't allow the desktop side‑by‑side label/button layout.
- Team / Costs / HD collapse into accordions to keep the scroll length sane.
- **Scoring panel becomes a bottom Sheet** on mobile — same `ScoringPanel §8` rendered inside a `Sheet` primitive (flagged in PATTERNS §18). The Sheet is full‑height when invoked; rows score the same way; Approve / Reject sit at the bottom of the Sheet.

---

## 4. Header anatomy

```
   Change Pulling in job And Saving Foil                ← title 4xl 36/700
   KZN‑2026‑0418 · VA · Foil Stamping                   ← sm ink.muted, mono for the code
   Started 4 May 2026 · Closed 9 May 2026               ← sm ink.muted
   [ ▲ Submitted — awaiting approval ]                  ← KaizenStatusChip §15
```

### Status progression chip

Single `KaizenStatusChip §15` — see PATTERNS. The visible chip is **the current state**, not a four‑step breadcrumb. Earlier transitions are visible by tapping the chip → reveals a popover with `Draft → Submitted → (Approved 24/36 | Rejected — reason)` timeline. This is **the only chrome** on the header — no edit menu, no share, no breadcrumb (the ◀ back is the breadcrumb).

States:

| Status | Chip | Approve panel? |
|---|---|---|
| `draft` | `● Draft` (neutral) | Hidden (worker still editing) |
| `submitted` | `▲ Submitted — awaiting approval` (warning) | **Editable for the approver tier** (`dmt_leader`, `pillar_champion`, `be_team`, `admin`); **read‑only for the reviewer tier** (`jh_leader`, `dmt_member`); **hidden for the worker tier** (`apprentice`, `on_roll`) — they see the "Awaiting approval" info alert instead. |
| `approved` | `✓ Approved · 24/36` (success) | Visible, read‑only to everyone. `admin` can re‑open via menu (out of scope this spec). |
| `rejected` | `✕ Rejected` (danger) | Hidden. Reject reason rendered as a `danger` Alert above the body. |

---

## 5. Before / After image pair

`BeforeAfterImagePair §9`. See pattern for full contract.

- Both images load from signed URLs (~1s typical). `beforeLoading` + `afterLoading` flow into `SkeletonImage §13` slots; the aspect ratio is reserved (Law 6).
- Click opens a lightbox; navigation between the two with ◀ / ▶ + Esc closes. (Lightbox is light wrapper; flag in PATTERNS §18 if no shadcn primitive — usually rolled with Dialog + custom content.)
- **Captions live verbatim.** If the worker wrote a Hindi caption ("पुलिंग settings पहले"), it renders Hindi. Captions don't get their own TranslateControl in v1 — they're short, and the body prose translation gives enough context. (Flag for v2: per‑caption translate.)

---

## 6. Long‑form prose blocks — TranslateControl in action

Both **Problem Description** and **Result** are `TranslateControl §2` wrappers around the original prose.

### Anatomy (desktop)

```
   ── Problem Description ──────────────────────────────────────────────
   [Hindi · written 4 May 2026]               [ Aa  Translate to English ]
   ──────────────────────────────────────────────────────────────────────
   CL CONNECT के जॉब में पहले ये पुलिंग (Short pull:‑95 and Long pull:‑485)
   रहे थे जिसमें २००० मीटर Foil में 6500 SHEETS चल रही थी।
```

### Anatomy after translate toggled

```
   ── Problem Description ──────────────────────────────────────────────
   [English · machine‑translated from Hindi]  [ ↺ Show original ]
   ──────────────────────────────────────────────────────────────────────
   In the CL CONNECT job, the pulling was previously Short pull:‑95 and
   Long pull:‑485, which gave 6500 SHEETS per 2000 m of foil.

   ⓘ Translated by Fulcrum · original by Manoj Kumar, 4 May 2026
```

Notes per PATTERNS §2 contract:

- Default state is **always the original**; per‑session, never sticky across navigation.
- Translation is rendered in a sibling node; original is one tap away.
- **English technical terms in the original** (Short pull, Long pull, Foil, SHEETS, CL CONNECT) stay as the worker wrote them in the translated rendering too — they are not Indic prose to translate; they are factory jargon.
- **Worker's own digits** (२०००, ६५००) stay verbatim in the original; the translated rendering uses Latin (2000, 6500) per Q2 (system‑rendered numbers).
- Strapline names the source language. Strapline + footer name the author + date. **The author attribution is part of the contract** — translation without attribution loses the worker's voice in the long run.

### Multiple long blocks

Problem Description + Result are independent TranslateControls. Toggling one does **not** toggle the other — a leader may want the problem in English (technical, scanning fast) and the result in Hindi (reading the worker's voice). This is a feature.

---

## 7. Team / Costs / Horizontal Deployment

### Team

`TeamMemberList §17`. 1..N members. The fixture has 5 (Manoj Kumar, रमेश कुमार शर्मा, திருமலைச்சாமி வேங்கடாசலபதி, Anu Rao, विनयकृष्ण द्विवेदी) — multi‑script by design. Each row min‑height `touch-lg` (56), name `lg` (18/500), role + assignment `sm` `ink.muted`. Avatar fallback is initials (last + first grapheme).

### Costs & Benefit

A two‑column micro‑card:

| Field | Value | Tokens |
|---|---|---|
| Cost of modification | `₹ 0` (or value) | label `sm` `ink.muted`; value `lg` (18/500) tabular `ink.strong` |
| Benefit/year | `₹ 4,80,000` (Indian numbering) | same; **Indian thousand grouping (4,80,000)** because that's how the rubric reads it |

The C dimension rubric uses `Less than ₹10,000/year` · `Up to ₹1,00,000/year` · `More than ₹1,00,000/year` — Indian grouping. The displayed Benefit/year matches that convention so the leader's mental comparison ("more than a lakh?") is one glance.

### Scope for Horizontal Deployment

Free‑form text. `base` `ink.DEFAULT`. May be in any script — runs through a `TranslateControl §2` too when not English. (For the sample: "All Foil Stamping lines (Clamshell 1–2, T&L 1–8)" is English; no translate control.)

### Approved By

`sm` `ink.muted` label + `lg` `ink.strong` value. Empty until approval. After approval: `Approved by विनयकृष्ण द्विवेदी on 11 May 2026 · 14:03` — the leader's name in their preferred script.

---

## 8. Scoring panel

`ScoringPanel §8` — see PATTERNS for the full contract. Recap of what THIS screen wires:

- Renders only when status === `submitted` or `approved`.
- **Editable** when status = `submitted` AND viewer role ∈ **approver tier** {`dmt_leader`, `pillar_champion`, `be_team`, `admin`}.
- **Read‑only** when status = `approved`, OR when viewer role ∈ **reviewer tier** {`jh_leader`, `dmt_member`}.
- **Hidden** when viewer role ∈ **worker tier** {`apprentice`, `on_roll`} — they see the worker‑facing info alert instead (see §9.4).
- `admin` can override (re‑approve, edit scores) on `approved` Kaizens via a route‑level "Edit scores" menu — out of scope of this spec, but the panel **does** show `aria-readonly="false"` for `admin` even on approved.

### Dimension rows — verbatim wording

From the rubric (image — transcribed). Each dimension is one `ScoreSegment §7`:

| Code | Long label | 1 | 3 | 9 |
|---|---|---|---|---|
| **P,Q** | Productivity or quality impact | No impact on P or Q | Impact on at least one of P or Q | Impact on both P & Q |
| **S** | EHS impact | Negligible | Significant | Very Significant |
| **C** | Quantitative benefit | Less than ₹10,000/year | Up to ₹1,00,000/year | More than ₹1,00,000/year |
| **M** | Easy to follow | Hard to implement & adhere | One of (implement / adherence) easy | Both easy |

### Order

**Fixed: P,Q → S → C → M.** This is the rubric order, the printed sheet order, the verbal idiom order. Alphabetical (C → M → P,Q → S) breaks the cadence; numeric (by score) is nonsensical for an unscored Kaizen.

### Total

- Right‑aligned `data` (32/700 tabular) `/ 36`. Updates live as scores change with `transition.fast` opacity flash.
- When fewer than 4 dimensions are scored, total shows current sum followed by `/ 36 (incomplete)` in `ink.muted`.

### Approve / Reject

- `Approve` button is `Button variant="default"` (brand). **Disabled until all four dimensions are scored.** Helper text below: "Score all four dimensions to approve."
- `Reject with reason` is `Button variant="ghost"` `ink.muted` — alternative, NOT co‑primary (Law 2). Opens a small modal with a `Textarea` (flagged primitive — shadcn `Textarea`) + `Submit` + `Cancel`. Reason is mandatory; rejection without a reason is not shippable.
- Confirmation of approval: full‑width `success` Alert at top of detail body — "✓ Approved by {leaderName} on {date} · 24/36" — and the chip transitions to `KaizenStatusChip status="approved" score={24}`.

---

## 9. States

### 9.1 Loading

- Header renders title + code as text (route data, available before fetch).
- Image pair renders **two SkeletonImage §13** slots, aspect 4:3.
- Prose blocks render `SkeletonText §13` — 4 lines, last‑line 70%.
- Team / Costs / HD render placeholder skeleton bars.
- Scoring panel does not render until status is known (visible state is *not yet known* — avoid flicker).

### 9.2 Draft

- Viewer is the author (worker / supervisor); detail is read‑only **for everyone else**; for the author it links to the editor (out of scope this spec).
- Chip `● Draft` neutral.
- Scoring panel hidden.

### 9.3 Submitted — viewer in **approver tier** (`dmt_leader` · `pillar_champion` · `be_team` · `admin`)

- Chip `▲ Submitted — awaiting approval` warning.
- **Scoring panel rendered editable**, scores empty (or restored from prior draft saves — see §12), total `0 / 36 (incomplete)`, Approve disabled.
- As leader scores: total updates; Approve enables when 4/4 dimensions scored.

### 9.4 Submitted — viewer in **reviewer tier** (`jh_leader` · `dmt_member`) or **worker tier** (`apprentice` · `on_roll`)

- Chip `▲ Submitted — awaiting approval` warning (same).
- **Reviewer tier:** scoring panel rendered **read‑only**, current draft scores visible (so a `jh_leader` can see how an in‑progress approval is shaping up), no Approve/Reject buttons. Helper text below: "Approval is reserved for the DMT leader, pillar champion, or BE team."
- **Worker tier:** scoring panel **hidden entirely**. Top of body: `info` Alert — "ⓘ Awaiting approval by {leaderName}". No scores visible (a score isn't a score until it's an approval).

### 9.5 Approved

- Chip `✓ Approved · 24/36` success.
- Top of body: `success` Alert — "✓ Approved by {leaderName} on {date} · 24/36"
- Scoring panel rendered read‑only with scores filled, total `24 / 36`. The selected segment per row remains visually emphasized (outlined `line.strong`, value `ink.strong`) but **NOT amber** — read‑only must not look like a CTA.
- Approve / Reject buttons hidden. `admin` sees an "Edit scores" link (out of scope).

### 9.6 Rejected

- Chip `✕ Rejected` danger.
- Top of body: `danger` Alert — "✕ Rejected by {leaderName} on {date}" + reason quoted in `danger.fg` `base` `ink.strong`.
- Scoring panel hidden (rejection doesn't carry scores in v1).
- The worker has an action available: "Revise and resubmit" — out of scope this spec, but the surface is present.

### 9.7 Image load failure

- Per slot: `BeforeAfterImagePair §9` renders `ErrorState §14` inline:
  - Glyph `✕` in `danger.fg`
  - Title `lg` `ink.strong` — "Couldn't load image"
  - Action — "Try again" (re‑fetches the signed URL)
- The other slot keeps loading or rendering independently.

### 9.8 RLS denied (viewer can't see this Kaizen)

- Route‑level: redirect to Kaizen list with toast — `You don't have access to KZN‑2026‑0418`. Detail does **not** half‑render; the user shouldn't see fragments of a Kaizen they can't access.

---

## 10. Multilingual behaviour

- **Worker's submitted text is rendered verbatim, always.** Hindi stays Hindi, mixed Gujarati+English stays mixed, Tamil stays Tamil. The TranslateControl is the **only** path to an English rendering and it is opt‑in.
- **System chrome** (section titles "Problem Description", "Result", "Team", "Costs & Benefit", "Best Kaizen — Scoring", buttons) is translated to the **viewer's** locale. Worker submitted in Hindi; reviewing leader prefers Gujarati; the chrome is Gujarati, the prose is Hindi. This is exactly the point.
- **Numbers** in system chrome (dates, scores, money amounts) are Latin / Western‑Arabic + Indian thousand grouping where relevant (Q2).
- **Author name** uses the *author's* `lang_pref` script. "Manoj Kumar" stays Latin; "रमेश कुमार शर्मा" stays Devanagari; the system does not re‑transliterate.
- **English fallback** for chrome translations: same contract as everywhere — if `*_hi` / `*_gu` NULL, English renders without an asterisk; layout never moves.

---

## 11. Accessibility

- Each prose block has `aria-describedby` pointing to its strapline so screen readers announce the source language + author before the prose.
- TranslateControl button is `<button aria-pressed={showTranslation}>`, label "Translate to English" / "Show original".
- ScoreSegment buttons are a `radiogroup`; each `radio` carries `aria-checked`. Arrow keys cycle 1 ↔ 3 ↔ 9; Space/Enter selects.
- Status chip's accessible name is `"Status: {label}, score {N} of 36"` when applicable. Screen readers don't say "warning triangle" — they say "Submitted — awaiting approval".
- Lightbox traps focus; Esc returns focus to the image that opened it.
- Approve disabled state is conveyed by `aria-disabled="true"` AND the helper text — color alone is insufficient.

---

## 12. Behaviour details

- **Translate state is per‑session, per‑block.** Toggling Result to English doesn't toggle Problem Description; neither persists across page reloads. Per PATTERNS §2 — original is the default on mount.
- **Scoring state is auto‑saved** as the leader scores — each `ScoreSegment.onChange` posts to `/kaizens/{id}/scores/{dimension}` with the new value. **Approve** is the action that flips status; the saved draft scores let a leader leave and come back without losing work. (If the API doesn't support draft scores, fall back to client‑local until Approve.)
- **Reject with reason** does not auto‑save the reason — rejection is one user action, including its reason. A draft reason is not a real reason.
- **Lightbox** preserves zoom + pan per image; closing returns to the detail at the same scroll position.
- **Print view** — out of scope this spec, but PATTERNS §0 reminds us that print uses Fulcrum Sans; the Kaizen A4 print stylesheet will be a separate deliverable.

---

## 13. Patterns used

- **KaizenStatusChip** (`PATTERNS §15`) — the single header chip; status‑aware.
- **BeforeAfterImagePair** (`PATTERNS §9`) — image pair with skeleton + error states.
- **TranslateControl** (`PATTERNS §2`) — wrapping Problem Description, Result, and Scope for HD when non‑English.
- **TeamMemberList** (`PATTERNS §17`) — multi‑script member list.
- **ScoringPanel** (`PATTERNS §8`) composing **ScoreSegment** (`PATTERNS §7`) ×4 — the approval surface.
- **ConfirmModal** (`PATTERNS §4`) — Reject with reason modal (a specialised instance).
- **SkeletonImage · SkeletonText** (`PATTERNS §13`) — loading.
- **EmptyState · ErrorState · RlsDeniedNotice** (`PATTERNS §14`) — failure surfaces.
- **StatusBadge** (`PATTERNS §1`) — used implicitly by KaizenStatusChip and the success/danger Alerts.

**Confirmed primitives to add** (per leadership sign‑off): `Sheet`, `Skeleton`, `Avatar` + `AvatarFallback`, `RadioGroup`, `Sonner` toast, `Textarea`, `DropdownMenu`, `Tooltip`. `Calendar` deferred.

**This screen's specific use** of the eight: `Sheet` for mobile scoring; `Skeleton` for image/text load; `Avatar` + `AvatarFallback` for TeamMemberList; `Textarea` inside the Reject‑with‑reason ConfirmModal; `Sonner` for approval/rejection confirmation; `DropdownMenu` for the admin "Edit scores" overflow (out of scope, but the surface is there); `Tooltip` on desktop for the dimension code badges (`P,Q` → "Productivity / quality impact") and for abbreviated team‑member chips when the row wraps to a second line; `RadioGroup` is the internal a11y substrate of `ScoreSegment` (PATTERNS §7).

**Also required:** shadcn `Alert` for the success / danger / info bands at top of body (§9.5, §9.6, §9.4). Verify installation; if absent, add to the primitives list.

---

*End of KAIZEN_DETAIL.md — v1.1*
