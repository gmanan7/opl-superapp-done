# Fulcrum — PEOPLE_ROSTER.md

**Version:** v1.1 · **Companion to:** FOUNDATIONS.md v1.1 (D‑018) · **References:** PATTERNS.md
**Purpose:** The **density stress test.** This is the canonical roster that every later table follows. If a script, status, or membership pattern fails here, it fails everywhere.

### v1.1 changes

- **R1 — Role enum aligned to the live `user_role`.** The filter UI surfaces four *groups*; each group expands to the canonical role codes (`apprentice`, `on_roll`, `jh_leader`, `dmt_member`, `dmt_leader`, `pillar_champion`, `be_team`, `admin`). Mapping in §7.
- **R2 — JH group and DMT filter values are now dynamic** (sourced from `useOrgStructure()`), not hardcoded NPF codes. The `No DMT assigned` sentinel is preserved. PATTERNS §16 type contract needs the matching update — flagged at end of §13. Static "RFM / SFM / UTIL" tokens throughout this spec are illustrative examples of the data‑shape this factory currently returns, not enum literals.
- Row‑action role gating (§6) rewritten to use canonical codes.

---

## 1. What this screen exists to prove

- A **multi‑script, multi‑length** name column survives at production density (rows ≥ 30, every script seeded).
- **Status is three‑channel** (color + symbol + label) at the row level, not just in a detail view.
- **Primary vs additional membership** is legible at a glance — a chip rail tells you who participates where without lying about authority.
- **Mobile + desktop** are the same screen at two densities, not two layouts. The filters, the columns, the actions, the modals — all reused.

The Honest States contract from FOUNDATIONS §1 is wired in: **loading → empty → error → RLS‑denied** are first‑class, and each is reachable from the demo data.

---

## 2. Layout — desktop (≥ 1024px)

```
┌──────────────┬────────────────────────────────────────────────────────────────┐
│              │  People                                                        │
│  dark‑rail   │  Roster across 4 DMTs                          [ + Invite ]    │
│              │  ──────────────────────────────────────────────────────────────│
│              │  ┌──────────────────────────────────────────────────────────┐  │
│              │  │ ⌕ Search name, role…   Role▾  JH group▾  DMT▾  Status▾   │  │
│              │  │                                                          │  │
│              │  │ Showing 47 of 184 · [ × DMT: F&G ] [ × Status: Pending ] │  │
│              │  └──────────────────────────────────────────────────────────┘  │
│              │  ┌──────────────────────────────────────────────────────────┐  │
│              │  │ NAME                  ROLE       PRIMARY      +N  STATUS │  │
│              │  ├──────────────────────────────────────────────────────────┤  │
│              │  │ रमेश कुमार शर्मा       Operator    CNC · Novacut E   +2  ✓│  │
│              │  │ Manoj Kumar           Operator    VA  · Foil Stamp   +1  ✓│  │
│              │  │ સંજયકુમાર ઠક્કર        Supervisor F&G · Novafold     —  ▲ │  │
│              │  │ திருமலைச்சாமி வேங்கடா-                                     │ │
│              │  │   சலபதி பழனிசாமி      Supervisor PRINT · Heidelberg 1 +3 ✓│  │
│              │  │ …                                                        │  │
│              │  └──────────────────────────────────────────────────────────┘  │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

- **Sidebar** is the inverse‑surface rail per shadcn‑bridge `.dark-rail`. Out of scope for this spec — but the screen must coexist with it.
- **Page header**: title `4xl` (36) `ink.strong`, subtitle `sm` `ink.muted`, primary action right‑aligned. Padding `space.gutter-lg` (32) horizontal, `space.6` (24) vertical.
- **Filter bar**: `RosterFilterBar` (PATTERNS §16). Sticky to the top of the content scroll region — *not* the viewport — so the page header scrolls away but filters remain in reach.
- **Active filter chip rail** between filter bar and table, only present when ≥ 1 filter is active. `Showing N of M` count is `sm` `ink.muted`; the running chip set is `Badge` `variant="secondary"` with a trailing `×`.
- **Table**: shadcn `Table`. Column widths fixed in `ch`/`px`, see §4. Wraps; never truncates.

## 3. Layout — mobile (< 768px)

```
┌────────────────────────────────────────┐
│ ◀  People                              │
│ ────────────────────────────────────── │
│  ⌕ Search                       [ ⨁ ]  │ ← Filters trigger (Sheet)
│                                        │
│  [ × DMT: F&G ] [ × Pending ]          │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ रमेश कुमार शर्मा              ✓ │  │
│  │ Operator · CNC · Novacut E       │  │
│  │ [ + 2 ]                          │  │
│  ├──────────────────────────────────┤  │
│  │ સંજયકુમાર ઠક્કર                  ▲ │  │
│  │ Supervisor · F&G · Novafold      │  │
│  ├──────────────────────────────────┤  │
│  │ திருமலைச்சாமி வேங்கடாசலபதி        ✓ │  │
│  │   பழனிசாமி                       │  │
│  │ Supervisor · PRINT · Heidelberg 1│  │
│  │ [ + 3 ]                          │  │
│  └──────────────────────────────────┘  │
│                                        │
│       [    + Invite worker     ]      ← bottom‑anchored primary
└────────────────────────────────────────┘
```

- Mobile table is a **stack of cards**, not a horizontally scrolled grid. Each card is the row's content, re‑flowed: name (top), `role · path` (caption), additional‑memberships chip (when > 0), status badge (top‑right).
- **Row tap** → bottom sheet with full row detail + actions (Edit, Reset PIN, Reveal PIN, Deactivate).
- The "+ Invite worker" action is bottom‑anchored, full‑width minus `space.gutter`, height `space.touch-lg` (56). Always visible — never hidden behind scroll.

---

## 4. Desktop table columns

The 47‑row demo set fits ~6 columns at 1280px without any column being truncated when seeded with the §5 fixtures. Column widths are floors — they grow with the viewport but the **last name in any script** must still fit at the minimum.

| # | Column | Min width | Type | Notes |
|---|---|---|---|---|
| 1 | **Name** | `28ch` | `base` (16/1.6) `ink.strong` | `lang={user.lang_pref}` set so glyphs shape per script. Wraps to second line when needed. |
| 2 | **Role** | `12ch` | `sm` `ink.DEFAULT` | Translated, with English fallback when `*_hi` / `*_gu` NULL. |
| 3 | **Primary** | `26ch` | `sm` `ink.muted` for path, `ink.strong` for machine | Path rendered `JH · DMT · Machine`. The machine name is `ink.strong` to read as the leaf. |
| 4 | **+N** | `4ch` | shadcn `Badge variant="outline"` | `+0` is rendered as `—` in `ink.subtle`; otherwise `+N` opens a popover listing additional MembershipChips. |
| 5 | **Status** | `12ch` | `StatusBadge` size `sm` | One of `success ✓ Active`, `neutral ● Inactive`, `warning ▲ Pending re‑auth`. |
| 6 | **Last login** | `14ch` | `sm` `ink.muted` mono | Relative for ≤ 7 days (`2 hrs ago`, `Yesterday, 18:42`), absolute beyond (`14 May 2026, 09:12`). Latin numerals. |
| 7 | **Row actions** | `5ch` | `Button variant="ghost"` `⋯` | Opens a popover menu (see §6). On mobile this lives inside the row sheet, not the row. |

### Header row

- Background `surface.sunken`. Type `xs` weight 500 `ink.muted`, UPPERCASE, letter‑spacing 0.04em.
- **`xs` (12px) is Latin‑only by FOUNDATIONS §6 floor rules.** Column headers are Latin codes (NAME, ROLE…), so `xs` is allowed. **Do not translate the column headers into Indic at this size** — translate at `sm` or up, or display Latin codes. (Decision: Latin codes here; full translations live in the row sheet on mobile.)

### Row

- Min height `touch` (44). Default background `surface.raised`. Hover `surface.hover`. Focus `surface.hover` + `shadow.focus` outline. Bottom border `1px line.subtle`.
- **Numbers** (last‑login dates with embedded times) carry `font-variant-numeric: lining-nums tabular-nums` so the column doesn't shimmer as data updates.

---

## 5. People fixtures (synthetic — seed across all four scripts)

These are the names the screen renders in the demo, deliberately chosen to stress the table:

| # | Name (script) | `lang_pref` | Role | Primary | Additional | Status | Last login |
|---|---|---|---|---|---|---|---|
| 1 | **Anu Rao** | en | Operator | SFM · CNC · Novacut E | — | ✓ Active | 2 hrs ago |
| 2 | **M. Sundaram** | en | Helper | SFM · CNC · Novacut ER1 | — | ✓ Active | 4 hrs ago |
| 3 | **Manoj Kumar** | en | Operator | SFM · VA · Foil Stamping | F&G · Inspection | ✓ Active | Yesterday, 18:42 |
| 4 | **रमेश कुमार शर्मा** | hi | Operator | SFM · CNC · Novacut E | RFM · D1 / SFM · Press | ✓ Active | Yesterday, 21:05 |
| 5 | **अनिता गौतम** | hi | Supervisor | SFM · F&G · Novafold | VA · Lining Area | ✓ Active | 1 hr ago |
| 6 | **विनयकृष्ण द्विवेदी** | hi | DMT Leader | SFM · PRINT | VA / F&G | ✓ Active | 14 min ago |
| 7 | **સંજયકુમાર ઠક્કર** | gu | Supervisor | SFM · F&G · Novafold | — | ▲ Pending re‑auth | 9 days ago |
| 8 | **પ્રતિક્ષાબેન મકવાણા** | gu | Quality | SFM · VA · Checkmate | Inspection | ✓ Active | 38 min ago |
| 9 | **વિરલ પટેલ** | gu | Operator | SFM · VA · Clamshell 1 | — | ● Inactive | 4 May 2026, 11:00 |
| 10 | **கணேசன் முருகேசன்** | ta | Helper | RFM · D1 · Delta 1 | — | ✓ Active | 3 hrs ago |
| 11 | **நாகராஜன் சுப்பிரமணியன்** | ta | Operator | SFM · F&G · Experfold | PRINT · Kongsberg | ✓ Active | 22 min ago |
| 12 | **திருமலைச்சாமி வேங்கடாசலபதி பழனிசாமி** | ta | Supervisor | SFM · PRINT · Heidelberg 1 | Pile Turner / Kongsberg / VA | ✓ Active | Yesterday, 19:30 |
| 13 | **(deactivated)** Ravi K. | en | Operator | — · No DMT assigned (UTIL) | — | ● Inactive | 17 Mar 2026 |
| 14 | … (extend to 47 rows for layout proof, mixing scripts) |  |  |  |  |  |  |

**Required content the fixtures must surface:**

- One Tamil name long enough to **wrap to two lines** in the desktop name column at 28ch (#12).
- One Gujarati name with a **conjunct** (#7 has the *ṭha* ઠ).
- One Devanagari name with a **conjunct** (#6 has *kr̥* कृ + *dv* द्व).
- One **short Latin** name (#2: "M. Sundaram") and one **two‑word Latin** (#1).
- One worker with **0 additional memberships** (#1, #2, #7, #9, #10), at least one with **1** (#3), several with **2–3** (#4, #11, #12) so the `+N` popover has data.
- One **Pending re‑auth** (#7), one **Inactive** (#9, #13) so all three statuses are reachable without filtering.
- One row in the **No DMT assigned** group (#13) — the data quirk; visible in the JH group filter.

---

## 6. Row actions

Per‑row `⋯` menu (shadcn `DropdownMenu` flagged as primitive in PATTERNS §18 — uses Dialog/Sheet sibling primitives if dropdown unavailable). Mobile lives inside the row sheet.

Role gating uses the canonical `user_role` enum codes directly (not the UI groups from §7). The screen never invents new permission tiers — these are the codes the API enforces.

| Action | Visible to (canonical roles) | Behaviour |
|---|---|---|
| **Edit** | `dmt_leader`, `pillar_champion`, `be_team`, `admin` (own DMT for the first three; admin always) | Opens edit sheet (out of scope this spec) |
| **Reset PIN** | `admin` | Server regenerates and emits a one‑shot reveal via PinRevealModal §5 |
| **Reveal PIN** | `admin` | PinRevealModal §5 — requires reason capture |
| **Resend re‑auth invite** | `jh_leader`, `dmt_leader`, `pillar_champion`, `be_team`, `admin` | Visible only when status = `pending_reauth` |
| **Deactivate** | `admin` | ConfirmModal §4 — `severity="danger"`, `stepConfirm=true` |
| **Reactivate** | `admin` | Visible only when status = `inactive` |

**RLS‑denied case:** when a `dmt_leader` for one factory line right‑clicks a row whose primary is in a different line, the menu still opens — but the destructive items render as `RlsDeniedNotice` (PATTERNS §14) instead of being silently absent. The leader sees *why* they can't do it.

---

## 7. Filters

`RosterFilterBar` (PATTERNS §16). Four selects + search; chip rail below shows the active filter set.

### 7.1 Role filter — UI‑grouping over the canonical enum  *(R1)*

The live `user_role` enum is `apprentice · on_roll · jh_leader · dmt_member · dmt_leader · pillar_champion · be_team · admin`. A leader filtering the roster doesn't think in those eight codes — they think in *bands of seniority*. The filter UI surfaces four groups; each group expands server‑side to a `role IN (...)` query against the canonical codes.

| Group label (UI) | Canonical roles (sent to API) |
|---|---|
| **All roles** | *(no filter)* |
| **Shop floor** | `apprentice`, `on_roll` |
| **Leaders** | `jh_leader`, `dmt_member`, `dmt_leader` |
| **Champions & teams** | `pillar_champion`, `be_team` |
| **Admin** | `admin` |

Rules:
- **Grouping is a UI layer, not a data layer.** The roster row's role column shows the canonical code translated for display (`Apprentice`, `On‑roll`, `JH Leader`, `DMT Member`, `DMT Leader`, `Pillar Champion`, `BE Team`, `Admin`). The filter chip rail above the table reads the **group name** (`× Leaders`) so the user sees what they actually filtered, not a generated `role IN (jh_leader, dmt_member, dmt_leader)` formula.
- **Single‑select v1.** Multi‑group is v2.
- **If the canonical enum gains a code** (e.g. a future `auditor`), the mapping table above is the single place to edit; the UI and API contract update together. Until mapped, an unknown code falls into a final `Other` group rendered only when present in the data.
- The `RosterFilters.role` value sent through `RosterFilterBarProps.onChange` is the **group key** (`"all" | "shop_floor" | "leaders" | "champions_teams" | "admin"`), not the canonical code(s). The data layer expands it.

### 7.2 Org filters — dynamic from `useOrgStructure()`  *(R2)*

JH group and DMT filter values are **not** enum literals. They are fetched per session from `useOrgStructure()`, the multi‑factory aware hook (ARCHITECTURE §2.4). Adding factory #2 must not require a code change in this screen.

| Filter | Values | Source |
|---|---|---|
| **JH group** | `All` + one option per row in `org_structure` at depth `jh_group`, ordered by `display_order`. Each option's value is the row's `id` (or stable `code`); the label is its display name (translated where available). | `useOrgStructure({ level: "jh_group", factoryId })` |
| **DMT** | `All` + one option per row in `org_structure` at depth `dmt`, **filtered by the selected JH group** when one is active; otherwise all DMTs for the factory. Plus a fixed sentinel option `— No DMT assigned` whose value is the literal `"no_dmt"`. | `useOrgStructure({ level: "dmt", factoryId, parentId? })` |
| **Status** | `All · Active · Inactive · Pending re‑auth` | Static — these are app‑level user states, not factory data. Renders each option with the matching StatusBadge inline. |
| **Search** | freeform string | Matches across `display_name` (in *any* script) + role label + machine name + worker code. Case‑insensitive on Latin; Unicode‑normalized for Indic. |

Rules for org filters:
- **No hardcoded codes** — the screen never says `if (jhGroup === "RFM")`. Examples in the §2 layout sketch (`RFM`, `SFM`, `D1`, `CNC`, `F&G`, …) are illustrative of the data this factory currently returns, not enum literals.
- **The `No DMT assigned` sentinel** is part of the DMT select's option list, labeled `— No DMT assigned`, value `"no_dmt"`. It is a query that resolves to `WHERE dmt_id IS NULL`. Not hidden, not relabeled "Other".
- **Selecting a JH group filters the DMT options** to that group's children + the `no_dmt` sentinel (since UTIL‑like groups may sit at the JH‑group level with no DMTs). If the user had a DMT selected that no longer belongs to the chosen JH group, the DMT filter resets to `All` and a transient `info` toast explains.
- **Loading the org structure** uses skeleton selects (trigger renders a SkeletonRow at button width). The user can still type into Search while the org loads.
- **Empty `useOrgStructure()` result** (factory has no JH groups defined) is a configuration error, not a user state: show an `ErrorState §14` in the filter row with title "Org structure not loaded for this factory" and a contact action.

### 7.3 Empty‑filter state (no matches)

`EmptyState §14` glyph `⌕`, title "No people match these filters", action label "Clear filters" — single button, not a list of which filter to clear. The chip rail above the table makes the running set obvious.

---

## 8. States

### 8.1 Loading

- Top filter bar renders normally (it's local state, no fetch).
- Table region renders **8 `SkeletonRow §13` rows**, each with 6 column bars and a leading 32px circle for the avatar. Heights = `touch-lg` (56) so the load doesn't shorten the page and reflow on arrival (Law 6).
- Count chip shows `Showing — of —` in `ink.subtle`.
- Skeleton animates under `prefers-reduced-motion: no-preference`; static at `opacity: .8` otherwise.

### 8.2 Empty (no matches for filter)

- Table region renders `EmptyState §14`:
  - Glyph `⌕` `5xl` `ink.subtle`
  - Title `xl` `ink.strong` — "No people match these filters"
  - Body `base` `ink.muted` — "Try removing a filter or widening the JH group."
  - Action `Button variant="secondary"` — "Clear filters"
- Filter chip rail remains visible above so the user can see *what* they filtered, not just that they got zero.

### 8.3 Empty (zero people total — onboarding)

- Distinct copy from 8.2 — this is an empty roster, not an empty filter result.
- Title — "No people in this roster yet"
- Body — "Invite the first worker to start capturing KPIs."
- Action — primary `Button` "Invite worker"

### 8.4 Error

- Table region renders `ErrorState §14`:
  - Glyph `✕` `5xl` `danger.fg`
  - Title `xl` `ink.strong` — "Couldn't load roster"
  - Body — error code in `xs` mono `ink.muted` (e.g. `RLS_DENIED` / `NET_TIMEOUT`) for support, plus a human sentence
  - Action `Button` — "Try again"
- Filters remain editable; the user can adjust them and retry without a full page refresh.

### 8.5 RLS‑denied row action

The whole **screen** loading is not RLS‑denied — anyone with a role can see the roster of their own scope. RLS denial happens at row‑action level: see §6.

- Within the row's action menu, the disallowed item renders as `RlsDeniedNotice §14`:
  - Glyph `🔒` (or `⛔` fallback) in `ink.muted`
  - Body `sm` `ink.muted` — "Only an admin can reveal another DMT's PIN."
- The viewer still sees the row; the row still shows the worker's status; only the destructive action is replaced.

### 8.6 Save success (after invite / edit)

`Toast (sonner)` — `Worker added. Send their login link?` with an action — non‑blocking. Toast is **not** an error channel; errors are inline.

---

## 9. Modals

### 9.1 Deactivate confirmation

`ConfirmModal §4` instance:

```
title:        "Deactivate {displayName}?"
description:  "They won't be able to sign in to Fulcrum. Their captured
               KPIs and Kaizens stay on file."
consequenceList:
  - "Removes their session if currently signed in"
  - "Hides them from new Kaizen team pickers"
  - "PIN is invalidated; reactivation requires a new PIN"
severity:     "danger"
stepConfirm:  true
primaryLabel: "Deactivate"
```

**Step‑confirm** wording on the second press: "Press again to confirm — this signs them out now." Cool‑off 600ms.

### 9.2 PIN reveal

`PinRevealModal §5`. See pattern for full contract. Reason capture is **mandatory** before the PIN is fetched. Auto‑hide 12s. Reason values rendered (translated): `Worker forgot PIN`, `New device pairing`, `Audit verification`, `Other (specify)`.

---

## 10. Behaviour details

- **Sort.** Default sort is `last_login DESC` so today's active workers are first. Header click cycles `asc → desc → default`. Numeric sort uses tabular numerals; alphabetic sort uses Unicode collation per `lang_pref`.
- **Selection.** v1: no bulk selection. (Flag: if bulk deactivate is ever required, the `Checkbox` primitive is missing from the installed set — see PATTERNS §18.)
- **Pagination.** Server‑paginated at 50 rows. Pager at bottom: `1 · 2 · 3 · 4`. Mobile uses an "infinite" sentinel (load next 30 on scroll bottom).
- **Right‑click / long‑press** on a row → same menu as `⋯`.
- **Keyboard.** Up/Down move row focus, Enter opens the row sheet, `/` focuses the search input.

---

## 11. Internationalisation

- The **column header strings** ("NAME", "ROLE", "PRIMARY", "STATUS") are Latin codes by FOUNDATIONS §6 floor rules — `xs` (12px) does not render Indic safely. **The row sheet (mobile and desktop)** renders the same fields at `base` / `lg` in the user's locale.
- **Worker name column** uses `lang={user.lang_pref}` per cell so Devanagari, Gujarati, Tamil glyphs are shaped correctly even before fonts settle. Names are stored Unicode‑normalized (NFC) and rendered verbatim — never transliterated for sort.
- **Status labels** are translated; the symbol channel is invariant. "Pending re‑auth" → Hindi: "पुनः प्रमाणीकरण बाकी" — both renderings are tested.
- **English fallback.** If `*_hi` / `*_gu` translations are NULL, the English copy renders without any "fallback" suffix or asterisk — layout never moves; the user simply sees English.

---

## 12. Accessibility

- Each row is a `<tr role="row">` with a `<th scope="row">` carrying the name (desktop), or a `<button>` element on mobile cards (so the entire card is a single tap target with `aria-label` = `"{name}, {role}, {status label}"`).
- The status badge's accessible name is `"Status: {label}"` so screen readers don't say "check active" or "warning triangle pending."
- Color is supplementary; **the symbol + label carry meaning** under color‑blind and high‑glare conditions (Laws 3 + 4).
- Focus ring is always visible (`shadow.focus`) — no `outline:none` without a replacement.

---

## 13. Patterns used

- **StatusBadge** (`PATTERNS §1`) — Active / Inactive / Pending re‑auth on every row.
- **MembershipChip** (`PATTERNS §6`) — `+N` popover content; never the primary path.
- **ConfirmModal** (`PATTERNS §4`) — Deactivate confirmation, with `stepConfirm`.
- **PinRevealModal** (`PATTERNS §5`) — admin‑only Reveal PIN.
- **RosterFilterBar** (`PATTERNS §16`) — top filter region.
- **SkeletonRow** (`PATTERNS §13`) — loading state.
- **EmptyState · ErrorState · RlsDeniedNotice** (`PATTERNS §14`) — the three honest‑state surfaces.

**Confirmed primitives to add** (per leadership sign‑off): `Sheet`, `Skeleton`, `Avatar` + `AvatarFallback`, `RadioGroup`, `Sonner` toast, `Textarea`, `DropdownMenu`, `Tooltip`. `Calendar` deferred. See PATTERNS §18 (pending v1.1 update reflecting the same).

**Tooltip usage on this screen.** Now that Tooltip is in: column‑header abbreviations (`+N`, `STATUS`) get a Tooltip with the full label on desktop hover/focus. Mobile keeps the full label in the row sheet — no Tooltip on touch.

**Pending downstream:** PATTERNS §16 `RosterFilterBarProps` and `RosterFilters` type contract need to be updated to reflect R1 (UI grouping) + R2 (dynamic org). Concretely:

```ts
// PATTERNS §16 — next revision
type RoleGroup = "all" | "shop_floor" | "leaders" | "champions_teams" | "admin";
interface RosterFilters {
  q: string;
  role: RoleGroup;            // UI grouping; API expands per §7.1 mapping
  jhGroup: string | "all";    // id/code from useOrgStructure; no hardcoded enum
  dmt: string | "all" | "no_dmt"; // id/code OR the no‑DMT sentinel
  status: "all" | "active" | "inactive" | "pending_reauth";
}
```

Until PATTERNS is republished, this screen is the canonical reference for the filter contract.

---

*End of PEOPLE_ROSTER.md — v1.1*
