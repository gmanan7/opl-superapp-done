# DMT — Owner Decisions Log

Running record of decisions the owner has made specifically about the **DMT (Daily
Management Tool)** module — one entry per decision, in the order they were made. Append new
entries to the bottom; never rewrite history here (if a decision is reversed, add a new entry
saying so, don't delete the old one).

This is a decisions log, not a spec — implementation detail lives in code/CLAUDE.md. Each
entry says what was decided and why, briefly.

---

### 1. DMT is enabled and active (Sept 2026)
DMT was previously "Locked" on the module-selection screen (owner wanted TPM finished
first). Owner decided to unlock it and start working on DMT directly. It is now a fully
clickable, active workspace next to TPM — same visual treatment (active border, "Active"
badge, working click-through), not a preview/demo state.

### 2. Display names, frontend-only, module-picker screen only (Sept 2026)
On the module-selection screen only:
- **TPM → "Lumos"**
- **DMT → "CloseLoop"**

Explicitly scoped by the owner to **frontend display text on that one screen** — not the
app's internal names, not routes/variables, not the database, and not (yet) the text inside
each module's own screens. The owner will give separate direction for renaming inside the
TPM and DMT apps themselves, and for the backend, later. Don't extend this rename anywhere
else until then.

### 3. "My View" tab must be open to every role (Sept 2026)
Owner wants the My View tab visible to all role types, no exceptions. **Checked and confirmed
already true** — no code change was needed. Verified across all three layers that could
restrict it (sidebar link, page route, and the API data behind it) plus live tests with 4
different roles. All 9 TPM roles reach it, since the lowest DMT permission tier is the default
for any role not explicitly mapped higher.

### 4. Roles — confirmed exactly 9, no changes made (Sept 2026)
Owner asked for confirmation of the role count. Verified against the live database: **exactly
9** — Operator, JH Lead, Module Lead, 5S Admin, 5S Area Champion, Auditor Pool, BE Lead,
IT Lead, Leadership. Nothing added or removed.

### 5. Departments expanded from 4 to 11, ahead of KPI/machine work (Sept 2026)
Starting point was 4 departments (Engineering, Materials, Production, Quality). Owner added:
**EHS, Business Excellence, Forwarding, Pre-Press & PD, Dispatch, HR, Finance** (Materials was
already there, not duplicated). Purpose stated by owner: laying groundwork before deciding how
KPIs and machines get assigned per department — that assignment design itself is **not yet
decided**, this was just the department list going in first.

### 6. KPI Master — starting state noted, no changes made (Sept 2026)
Confirmed for the owner: exactly **1 KPI template** exists right now ("OEE %", numeric,
measured in %, tied to one department). Noted as a baseline before any KPI-template
expansion work begins — nothing added or changed yet.

---

---

## Decisions & functions added (Sept 2026 session), in table form

| # | Decision / function | Detail |
|---|---|---|
| 7 | Departments table unified | DMT's own department list (`dmt_department`) was merged into the one `departments` table the rest of the app already used. Both sides' names are now in one place; DMT's admin screen writes to the shared table. Migration run, old table dropped (backup kept as `dmt_department_backup`). |
| 8 | Department order is drag-and-drop | The manual "Display order" number field on DMT's Add/Edit Department form was removed. Reordering is now done by dragging rows on the Departments admin screen; the order saves automatically. |
| 9 | `departments.code` — decided, not yet done | Owner decided to remove the `code` column from `departments` (e.g. "ENG", "FIN") since the full name is enough. **Not implemented yet** — still pending: drop the column, move the one feature that used it (an Engineering-department bypass in PM Schedule) to match by name instead. |
| 10 | Factory/plant table unified | DMT's own single-plant table (`dmt_factory`) was merged into the shared `factory` table (which already held the real plants: TVT/NPF/UPF/MPF). DMT's plant was added as its own new row (code `ITC-PPB`) rather than assumed to be one of the existing plants — that mapping is a business call for later, not something guessed. Migration run, old table dropped (backup kept as `dmt_factory_backup`). |
| 11 | Dashboard and My View combined | The separate "My View" page/nav item is gone. Its pinned-KPI-chart idea now lives inside the Dashboard as one of several **configurable widgets** anyone can add to their own "My Dashboard" section. The original full department KPI table stays fixed at the top for everyone, unchanged. |
| 12 | Six widget types available on My Dashboard | (1) KPI trend chart — one KPI. (2) Multi-KPI chart — several KPIs together, choice of line/bar/composed. (3) Saved chart — reuses a chart already built on Admin → KPI Charts. (4) KPI status card — red/amber/green counts for a department. (5) Open task counter. (6) Open task list. |
| 13 | Department-scoped widgets — who can pick which department | For the status-card/task widgets: a regular user can only build one for their own department. Only BE Lead / Leadership tier can pick a different department, or "all departments". |
| 14 | Dashboard's single-day table now defaults to the most recent day with real data | Previously always defaulted to "yesterday", which could show blank ("—") if nobody logged data yesterday specifically, even though a chart nearby (viewing a wider period) showed a real recent number. Now it opens on whichever day actually has the latest entry, so the two don't visually disagree. Manually picking a date still works as before. |

---

## Dashboard page — full function list (existing + new)

| Function | Status | Detail |
|---|---|---|
| Stat tiles (Open Tasks, Overdue Tasks, Red KPIs, PM This Month, Next Meeting) | Existing | Click any tile to jump to that section (Tasks / KPI Entry / PM Schedule / Meetings). |
| Single-day KPI table, grouped by department | Existing | Target / Actual / Status / MTD / Remarks per KPI, collapsible per department. |
| Date picker for that table | Existing | Was defaulting to "yesterday"; **changed this session** to default to the latest day with real data instead (see decision 14). |
| **Create Task** button on a red KPI row | Existing | Opens a dialog to spin up a task (title, owner, priority, due date) directly from a red KPI reading; links back to that KPI entry. Untouched this session. |
| Project-tracker sub-items under a department | Existing | Shows checklist-style tracker items tied to a "project tracker" type KPI, if the department has one. |
| **My Dashboard** — configurable widgets section | New (this session) | Replaces the old separate "My View" page. Add/remove/reorder widgets: KPI trend chart, multi-KPI chart, saved chart, KPI status card, open-task counter, open-task list. Own period selector (This/Last Week/Month/Year). |
| Widget reorder controls (▲▼✕) | New (this session) | Fixed a bug where these buttons visually covered a widget's own badge/content — moved to their own row above each card. |

---

## Dummy/demo KPI data seeded (Sept 2026)

Owner asked for realistic dummy KPIs + values so departments aren't empty on the dashboard.
Self-cleaning scripts in `backend/tools/`, same pattern as the existing OPL/Kaizen/Abnormality/
Audit demo seeders — safe to re-run, each has a `... clean` mode.

| Department | Script | What it adds |
|---|---|---|
| EHS | `seed_demo_ehs_kpis.mjs` | 10 KPIs (PJO, EHS Training Man-Hours, Hazards Spotted, Near Miss Reported, Gemba Rounds - Dept Heads, PSI by EHS, LTI, First Aid Cases, Fire-Related Incidents, Man Hours Lost), 10 days of dummy entries each. |
| Business Excellence | `seed_demo_be_kpis.mjs` | 6 KPIs (FIP - SFM Wastage KPI (MTD), FIP - RFM Process Wastage KPI (MTD), FIP - RFM OEE KPI, Training Hours, Fulcrum Meeting Compliance, JH Audit Score), 4 days of dummy entries each. |

Other departments still have no KPIs configured — say the word if you want the same for more.

---

## More decisions & functions (Sept 2026, later in the same session)

| # | Decision / function | Detail |
|---|---|---|
| 15 | **Supersedes #10** — DMT's plant consolidated onto TVT, not kept separate | Decision #10 gave DMT's data its own plant row ("ITC-PPB"). Owner reversed this: all of DMT's existing data (meetings, meeting templates, task groups, PM machines, PD jobs, KPI charts, departments) was moved onto **TVT** instead, and the separate ITC-PPB plant row was deleted outright. DMT and TVT are now simply the same plant — no separate DMT plant identity anywhere. |
| 16 | Every plant now only sees/edits its own departments and meeting templates | Before this, DMT showed **every** plant's departments mixed together (a leftover of how the department-table merge worked) — a BE Admin at one plant could see and edit another plant's departments. Fixed server-side (not just hidden in the UI): reading, creating, editing, and deleting departments/meeting-templates is now locked to the caller's own plant, resolved the same way the rest of the app resolves a user's plant (`user_details.default_plant`). |
| 17 | 5 unused departments permanently deleted | **Human Resources, Stores, Product Development, Dispatch, Forwarding** — owner request. Confirmed zero KPIs/tasks/people attached to any of them (checked before deleting) — genuine hard delete, not a deactivate. |
| 18 | "Organisation" page created — replaces 4 separate admin pages | **Departments, KPI Master, Meeting Templates, and Analytics** are now tabs on one page (`/dmt/organisation`) instead of 4 separate sidebar entries. Old links still work (they redirect here automatically). **Task Overview and KPI Charts were deliberately left out** of this merge (owner request) — they stay as their own separate pages. **Audit Log also stays separate** — owner said its visibility needs restricting to a few people specifically, which is a separate, not-yet-done task. |
| 19 | "Edit Factory" option removed from the Departments screen | A BE Admin could rename/re-code/relocate their entire plant from inside DMT's Departments admin screen — the app already resolves a person's plant automatically, so this option didn't make sense here (plant identity is TPM-wide, not something to hand-edit from one module's settings page). Removed entirely; the plant's name now shows read-only at the bottom of the DMT sidebar instead. |
| 20 | KPI Master's "Hidden" toggle removed | This toggle (`is_hidden_from_trends`) only ever affected one screen (KPI Trends) and sat confusingly next to "Active," which already controls a KPI's visibility everywhere else in the app (Dashboard, KPI Entry, Analytics, Charts, Meetings). Removed for a single clear rule: **Active** = the admin-controlled master on/off switch, used everywhere. A separate, personal "hide this from just my view" option (an eye icon) exists only on the Dashboard's own KPI cards — a different, per-user thing, not an admin setting. |
| 21 | Dashboard KPI cards redesigned | The department KPI table (Dashboard) is now a grid of cards, 5 per row, colour-tinted red/amber/green by status, with the actual value shown big and bold. Includes a department filter dropdown (view one department at a time or all), and a personal eye icon per card so anyone can hide a KPI from their own view — everyone sees every KPI by default; hiding one only ever affects the person who hid it. |
| 22 | "Add widget" KPI picker — department filter | Adding a KPI-chart or multi-KPI-chart widget now has a dedicated department filter above the KPI list (in addition to the KPIs already being grouped by department), so the list stays usable as more KPIs get added across departments. |

### 23. Removed the fake "team_member / department_head / factory_manager / super_admin" tier names (Sept 2026)
Owner pointed out the app only has 9 real roles, and DMT was pretending to have a separate,
made-up 4-tier role system alongside them. Fixed by renaming the 4 tier *values* to the real
role that actually reaches each level — **no change in who can do what**, purely a naming fix:

| Old fake tier name | New real-role name | Roles that reach it |
|---|---|---|
| `team_member` | `jh_lead` | jh_lead, operator (baseline) |
| `department_head` | `module_lead` | module_lead + everything above |
| `factory_manager` | `leadership` | leadership + everything above |
| `super_admin` | `be_lead` | it_lead, be_lead (+ a defensive `admin` fallback, not a real role) |

Applied everywhere the old names appeared — `server.js`'s `DMT_ROLE_MAP`/`DMT_TIER_ORDER`, every
`DMT_RESOURCES` write-level, every `dmtGuard(...)` call, and every frontend `tierAtLeast(...)`
check across ~15 files. Confirmed no other behavior changed: it's a pure find-and-replace of the
4 tier-level strings, same ladder, same comparisons, same access.

## Open / not yet decided
- **How machines get assigned** (to a JH group / area / department) — owner said they will
  explain their intended rules for this; nothing built yet. The Machines page itself was
  separately fixed (it was crashing, and Edit/Deactivate were silently broken) so it's ready
  to build on once the assignment rules are given.
- **KPI template additions** — now that departments are expanded to 11, more KPI templates
  per department are presumably coming; no rules given yet for what they should be or how
  they map to departments.
- **Renaming inside the TPM/DMT apps themselves + backend** — owner said this will come as a
  separate instruction; not started.
