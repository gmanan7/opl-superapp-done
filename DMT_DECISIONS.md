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

## Tiers — T4 / T3 / T2 review-tier system (Sept 2026)

A brand-new feature: per-factory "review tiers" that each get their own membership, a Lead,
and a curated set of KPIs shown to that tier's people — none of this existed before this
session. Lives at Organisation → **Tiers** tab (`/dmt/organisation`, not a separate sidebar
page — folded into Organisation per owner request). Backend: `dmt_tier` / `dmt_tier_member` /
`dmt_tier_kpi` tables (new), routes at `/api/dmt/tiers*`.

| # | Decision | Detail |
|---|---|---|
| 24 | Three fixed tiers, no free-text creation | The Tiers screen is 3 fixed tabs — **T4 / T3 / T2** — not an "Add tier" form. Owner: "let us not ask users to add." Each tier row is **auto-created silently** the moment a BE Lead opens that tab — nothing to type, nothing to click to create it. |
| 25 | T4 = one, plant-wide | A single factory-wide tier, no link to any DMT or JH group. Auto-created once. |
| 26 | T3 = one per real DMT | Every DMT (a `module_groups` row — SFM, RFM, …) automatically gets its own T3 row. At most one T3 per DMT, enforced by the database (partial unique index), not just app logic. |
| 27 | T2 = one per real JH group | Same pattern one level down — every JH group automatically gets its own T2 row, at most one T2 per JH group, DB-enforced. |
| 28 | Default Lead, per tier level | T4: no default (BE Lead appoints by hand). T3: defaults to that DMT's own `module_lead_emp_id`. T2: defaults to that JH group's own `leader_emp_id`. Always changeable afterwards by whoever's authorized (below) — the default just means nobody has to appoint one manually before the tier is usable. |
| 29 | Who can activate/deactivate a tier | **BE Lead only**, at every level (T4/T3/T2) — even a tier's own Lead can't turn it on/off. |
| 30 | Who can reassign a tier's Lead | **T4**: BE Lead only. **T3**: BE Lead, or that DMT's own module lead. **T2**: BE Lead, that JH group's own leader, that JH group's parent DMT's module lead, **or** a routing incharge (anyone configured as an OPL/Kaizen/Abnormality reviewer, either review phase) for that specific JH group. |
| 31 | Who can add/remove tier members | BE Lead, or whoever is currently the tier's own appointed Lead (any level — this one didn't get the broader T2/T3 routing-incharge carve-out, only Lead-reassignment and KPI-picking did). |
| 32 | Who can pick a tier's KPIs | **T4**: BE Lead or T4's own Lead. **T3**: BE Lead, that DMT's module lead, T3's own current Lead, **or** any routing incharge (OPL/Kaizen/Abnormality reviewer for either phase) across **any** JH group under that DMT. **T2**: identical rule to T2's Lead-reassignment (#30 above) — same authorized set governs both. KPIs can be picked from **any** active KPI plant-wide, no department restriction. |
| 33 | KPI Master gained an optional "Module" tag | A KPI can optionally be tagged with a module (SFM/RFM/…) in addition to its department — when tagged, it displays as e.g. "SFM Production" everywhere instead of just "Production" (department stays the real, shared record; the module tag is purely a display/grouping aid, doesn't change who owns the department). |
| 34 | "My Tier KPIs" on the DMT Dashboard | New card, above "My Dashboard," showing the logged-in person's **combined, deduplicated** KPI list from every active tier they belong to — as a **member or as the tier's Lead** (Lead is a separate concept from list-membership, so this had to explicitly include both, or a Lead who isn't also listed as a member would see nothing). A KPI picked by more than one of the person's tiers shows once, tagged "via T2, T3" etc. Card is completely hidden for anyone in zero tiers. |

**Verified end-to-end, self-cleaning, twice** (once per major build step): tier auto-creation,
DB-enforced one-per-DMT/one-per-JH-group uniqueness, every authorization rule above tested
with a real non-authorized user (403) and a real authorized one (200) for each tier level,
default-Lead correctness, and the combined-dashboard dedup query (including the
Lead-not-listed-as-member edge case, which a naive member-only join gets wrong).

## Task Board — tier-based visibility, replacing ad-hoc Groups (Sept 2026)

The Task Board's old "Groups" feature (custom team creation, e.g. a made-up "Alpha Team") was
**replaced entirely** by the T4/T3/T2 tier system above — one visibility mechanism instead of
two overlapping ones. `dmt_tasks` gained a `tier_id` column (nullable — untagged tasks stay
public, unchanged from before); the old `dmt_task_groups`/`dmt_task_group_members` tables and
`task_group_id` column are left in place but unused (dead, not dropped, matching how this
codebase retires other columns).

| # | Decision | Detail |
|---|---|---|
| 35 | Tiers fully replace ad-hoc Groups | The Groups panel, its create/add-member UI, and the `/my-task-groups` endpoint were deleted outright. "Visible to" on New Task is now Everyone / Private / a specific Tier. |
| 36 | Visibility hierarchy: membership is NOT the same as Lead-cascade | A tier's own **members** (incl. its Lead) see that tier's own tasks — this does not cascade. Being the **Lead** of a tier additionally sees every tier nested beneath it (a T3 Lead sees its DMT's T2s; a T4 Lead sees the whole factory). Owner explicitly rejected "any T3 member sees T2 tasks" — only the Lead should see downward, not the whole tier above. |
| 37 | BE Admin sees everything, always | Full authority regardless of any tier membership — same rule already governing tier management (`dmtCanManageTier`), extended to task visibility. |
| 38 | Creation-time rule: a tier you can't see, you can't tag | You can only restrict a task to a tier that's already visible to you under rule #36/37 — enforced server-side (`dmtValidateTask`), not just hidden in the UI. This is what makes "a T2 person can't create a task for T3, but a T3 Lead can create one for its own T2" literally true, not just a UI nicety. |
| 39 | Extra individual visibility grants, beyond membership | A tier's incharge (BE Admin or that tier's own Lead) can name specific extra people who see that tier's tasks without being a full tier member — new `dmt_tier_task_viewer` table, managed from a "Task Board visibility" box on each tier's card (Organisation → Tiers), shown right under the existing Members list. Granting this also lets that person create tasks tagged to that tier (same visibility set drives both). |
| 40 | All 3 task-creation points behave identically | Task Board's "New Task", the Dashboard's "Create Task from Red KPI", and a Meeting's red-KPI task dialog all got the same Tier picker and the same server-side validation — one rule everywhere, not one path with a hole in it. |
| 41 | Meeting-to-tier auto-linking deferred | Owner's stated direction for later: meetings should default to a template (T4/T3/T2) so a task created from that meeting auto-inherits its tier; if no template, the creator picks a tier manually. **Not built yet** — meetings currently have no DMT/JH-group field at all, so for now every meeting-created task uses the same manual picker as the other two entry points. |
| 42 | Task Board filter UI — final shape: simple cascading dropdowns | Went through several visual options (a breadcrumb drill-down, a multi-select checkbox tree, a searchable combobox, and a full SVG org-chart with curved connectors) — owner tried each live and settled on the **original simple version**: a T4 toggle chip + a "Filter by DMT" dropdown + a dependent "Filter by JH Group" dropdown that only appears once a DMT is picked. Don't rebuild the fancier versions without being asked again. |
| 43 | "My Tiers" vs "All" default scope | Everyone defaults to seeing only their own tiers' tasks (plus public/own tasks) on the Task Board, with an "All I can see" toggle to widen it. Two overrides: **BE Admin** always shows "All (factory-wide)" — no "My Tiers" toggle at all, since their access is role-based, not membership-based, so the option is meaningless for them. **Anyone who belongs to zero tiers** silently falls back to "All" too, so they never land on a confusing empty board by default. |
| 44 | Real bug fixed: one T2 tier per factory, not one per JH group | While seeding 20 test JH groups, tier creation started failing with a false "T2 already exists" collision after the very first one. Root cause: the database's T4-level uniqueness rule (`dmt_tier_factory_name_no_dmt`) was missing a condition — it silently also capped **every** T2 tier to one per factory, not one per JH group as designed. Never caught before because the org had only ever had 1 real JH group. Fixed at the database level (index corrected to also require `jh_group_id IS NULL`); T2 tiers now correctly scale to any number of JH groups. |
| 45 | Demo data tool for stress-testing the Task Board | `backend/tools/seed_demo_task_board.mjs` (self-cleaning, `... clean` to remove) — builds 5 dummy DMTs × 4 JH groups each (20 total), all with active tiers/Leads/members, plus ~56 dummy tasks with varied due dates and a few genuine carryovers (pushed once via the real due-date-change endpoint). Used to verify the tier filters and visibility rules actually hold up at realistic scale, not just with the 1 real JH group that existed before. |

Task Board filter chips, confirmed working as designed: **My Tasks** (you're the owner),
**Overdue** (due date passed, not closed), **Due Today** (due today, not closed), **Carryover**
(due date has been pushed at least once via the real due-date-change flow, still not closed).

## Decision Log — tier-scoped visibility, and T4 becomes BE-admin-created, multi-group, with real meetings (Sept 2026)

Decision Log had no team-based visibility at all before this — every decision from every
meeting was visible to everyone. T4 itself changed shape too: from a single silent
auto-created factory tier to something a BE admin deliberately builds, names, and can retire.

| # | Decision | Detail |
|---|---|---|
| 46 | Decision Log inherits visibility from its meeting, not its own tag (tightened by #121: only meetings you are part of; BE Admin sees all) | No new column on decisions themselves — `dmt_meetings` gained `tier_id`, and a decision is only ever shown grouped under its meeting, so scoping the meeting scopes the decision automatically. Same "My Tiers / All I can see" toggle as Task Board. |
| 47 | Meeting Templates carry a default Tier | A template's tier always wins when picked for a new meeting — matches how title/time/location defaults already worked, just extended to the group. |
| 48 | T4 stops being one singleton, silent-auto-created tier | Owner: "T4 is something the BE admin will create... they will assign one lead for it." BE admin can now create **any number** of independently named, independently led T4-level groups (e.g. "Packing Excellence", "Quality Council") — the old one-per-factory database cap was removed. T3/T2 are untouched for now; owner will give separate direction for those later. |
| 49 | A T4 group's display name is cosmetic, never the real record | BE admin (or that group's own Lead) can name a group anything, or clear the name back to a plain "T4" — the backend still always tracks it as tier `name = 'T4'`; the custom name is a separate `display_name` field shown in its place, never a substitute for the real record. |
| 50 | Every meeting must belong to a group; only that group's Lead or BE admin may create/move it | Owner: "only the group lead and BE admin can create the meetings, either through this page or meetings tab." A tier-less "ad-hoc" meeting is no longer allowed at all — enforced server-side (400 with no tier, 403 if you're neither BE admin nor that specific group's Lead), not just hidden in the UI. Applies identically whether creating from the Meetings tab or from a group's own card. |
| 51 | Real recurring meetings, Teams-style | Owner flagged the missing recurrence option and asked for the full version. Weekly-only (mirrors Audits' already-approved minimal recurrence UI — no frequency dropdown), with Never/On-date/After-N endings; "Never" is capped to the next 26 occurrences (~6 months) so it can't generate unboundedly — more can always be scheduled the same way later. Every generated meeting is a normal, independent row (attendance/decisions/KPI-snapshot all still per-instance); a shared `series_id` just tags which ones belong together. |
| 52 | Facilitator defaults to the group's own Lead | Owner: "facilitator by default should be the lead of the group for which meeting is created." Still editable afterward if someone else is actually running that particular meeting. |
| 53 | A T4 group can be permanently deleted — BE admin only, no exception for its own Lead | Owner: "what if someone by mistake creates a group... only BE admin will do that no other person can delete it." Meetings/tasks already tagged to a deleted group are kept and simply lose that tag (DB `ON DELETE SET NULL`) — nothing else is touched or deleted. Members/KPI links on the deleted group itself are removed (they're pure junction rows). |
| 54 | Delete is only offered once a group is already Inactive | Owner: deactivating first is the required safety step before the irreversible delete becomes available at all — the delete icon is simply not shown on an Active group. |
| 55 | Turning a group Inactive asks for confirmation; turning it back Active does not | Deactivating hides the group from everyone but BE admins, so it gets a confirm prompt; reactivating is harmless and instant. |
| 56 | Changing a group's Lead asks for confirmation naming both names | Owner: "pop up like if i change the lead, that lead changed from this to this." Picking a new Lead from the dropdown doesn't apply immediately — a dialog names the current and incoming Lead by name, and only applies on explicit Confirm. |
| 57 | Active groups sort above inactive ones | In the T4 list, so retired/inactive groups don't clutter the top among the ones actually in use. |

**Verified live, self-cleaning**: multiple independent T4 groups coexisting with distinct
Leads; renaming and clearing a custom name; the mandatory-tier and Lead/BE-admin-only rules
both confirmed with real 400/403 responses from an unauthorized request; a 3-occurrence
weekly recurring series created and confirmed in the database (correct dates, shared
`series_id`, facilitator defaulted to the group's Lead); delete confirmed to actually remove
the row while leaving unrelated data untouched; delete-only-when-inactive and both new
confirmation dialogs (deactivate, Lead change) confirmed working in the browser.

## Hierarchy tab, Task Board Overview, and New Task rework (Sept 2026, later session)

A new **Hierarchy** tab (Organisation) makes group-to-group reporting lines explicit and
visual; the old ad-hoc "who else can see this tier's tasks" grant was replaced by one
factory-wide visibility list; and "New Task" was redesigned around picking the Owner first.

| # | Decision | Detail |
|---|---|---|
| 58 | Hierarchy chart shows ONLY explicit links, never a guessed default | Early versions auto-placed an unlinked group under "the sole active T4" so the chart never looked broken. Owner rejected this — a group not yet linked doesn't appear in the tree at all now (not even under a plausible parent); it only shows in a separate "groups without an explicit link" list below the chart, so a real link is never confused with an inferred one. |
| 59 | "Reports to" pickers never pre-fill a resolved default either | Same principle applied to the per-group dropdowns: blank means genuinely unset, full stop. A "— Clear link —" option was added instead of a separate confirm-modal for undoing a mistaken link — picking a group was never destructive, so a confirm step would only be friction. |
| 60 | T3 and T2 groups can now be standalone/custom, same as T4 already could | Previously only T4 supported a free-form "not tied to any real DMT/JH group" group. Extended down: a "Custom group" mode on the New Group dialog (T3/T2) lets a BE Lead / T4 Lead create a group with just a name + Lead, same shape as T4. `dmt_tier.parent_tier_id` (new, self-referencing FK) is what makes the explicit link possible at any level. |
| 61 | A T2 can report straight to a T4, skipping T3 entirely | Some JH groups genuinely have no DMT-level group above them. The link picker for a T2 offers both its DMT's T3 **and** any T4 as valid targets. |
| 62 | Only BE Lead or a T4 group's own Lead may create/relink T3 or T2 groups | New server-side rule (`dmtIsBeOrT4Lead`) — previously T3/T2 auto-created silently for anyone who opened the page; creation is now deliberate and restricted, matching how T4 already worked. |
| 63 | Groups are color-coded by LEVEL, not by chart position | A T2 that reports directly to T4 sits one row up from where T2s normally are — without a level-based color it looked like a T3. Fixed tones: T4 blue, T3 violet, T2 emerald (bumped to a stronger shade after the first pass read as too pale/similar). |
| 64 | Chart layout: top-down with horizontal scroll — not rotated, not auto-shrunk | Tried three approaches live: a left-to-right rotated tree, and an auto-scale-to-fit (both directions) version. Owner explicitly chose the simplest option: classic top-down org chart, scrolls sideways if there are too many groups to fit. Don't rebuild the other two without being asked again. |
| 65 | Old per-tier "Task Board visibility / Add extra people" grant removed from the Tiers page | This was `dmt_tier_task_viewer` — letting a non-member see one specific tier's tasks. Owner confirmed removing it despite it being a real access grant (not just a display filter) — the UI is gone; the underlying table/data is untouched, just no longer editable from the Tiers cards. |
| 66 | New factory-wide replacement: Task Board Overview tab, BE-Lead-only | New `dmt_global_task_viewer` table + tab. BE Admin can name specific people who see **every** group's tasks, factory-wide — a capability BE Admin and every T4 Lead already have by construction (not listed here, since it's automatic). Private tasks are completely unaffected either way — they were never tier-scoped, so this grant can't reach them. |
| 67 | Task Board's group filter now derives from the Hierarchy tree, not a separate grouping | The old filter grouped JH groups by their raw `jh_group_dmt_id` regardless of any Hierarchy link, so a group could appear under a different parent in the filter than where the chart actually placed it. Extracted the placement logic into one shared function (`resolveDmtHierarchyTree`) both screens now call — they can't drift apart again. |
| 68 | Group filter is now a multi-select hover-flyout, and the old "Scope" toggle is gone entirely | Owner: multiple groups may be picked at once; hovering a DMT reveals its JH groups in a flyout. The separate "My Tiers / All I can see" toggle (and BE Admin's fixed "All (factory-wide)" pill) was removed outright once it became clear the group filter already covers the same need with more precision — default (nothing picked) is "my own groups," narrowing/widening is entirely the filter's job now. |
| 69 | Task Board filtering stays to Groups + Priority (+ existing status views) only | Department and a later-considered Module filter were both explicitly rejected — not added. |
| 70 | New Task redesigned around picking the Owner first | Old flow made the assignor pick a group (or department+module) before Owner. New flow: pick Owner (now via a type-to-search picker, not a long plain dropdown) → the form looks up which real group(s) that person is actually in (`GET /api/dmt/tiers/for-person/:empId`, new) and offers those for visibility. Department auto-fills from the owner's own real record, never picked by hand. |
| 71 | Owner with zero groups → task is forced private, not "visible to everyone" | The old behavior for an untagged task (`tier_id = NULL`) was factory-wide visibility to every single person in DMT. Owner found that surprising once it was spelled out, and decided a groupless owner's task should default to private (owner + assignor + admins only) instead — the private checkbox disappears in this case since there's nothing left to toggle. |
| 72 | A "Department + Module" owner-search path was built, then removed again | Briefly added as a second way to narrow the Owner list (Department, then a real `modules`-table Module select, cascading). Owner judged it overkill once Owner-first existed and asked for it removed — simpler is better here. Note for later: `modules`/`user_details.module_id` (SFM/RFM/Labels/Flexibles/PPB) is a **separate real master list**, unrelated to the DMT/`module_groups` hierarchy tree — don't conflate the two again if this resurfaces. |

**Verified this session**: full create → deactivate → delete lifecycle on a real custom T3
group against the live database and backend (confirmed via network requests, not just code
review); the new `/api/worker-names` fields (`department_id`, `module_id`) and
`/api/dmt/tiers/for-person/:empId` endpoint confirmed responding correctly after backend
restarts (the dev backend here runs as plain `node server.js`, no `--watch` — every backend
edit this session needed a manual kill+restart, confirmed each time via a live curl check
before reporting anything as done). Frontend build (`npm run build`, zero errors) confirmed
green after every change. **Not verified live in the rendered UI** — no working login was
available in the browser tool for most of this session; all UI-level claims should get a
manual owner pass before being treated as fully confirmed.

## Escalation, private groups, task permissions and Task Board redesign (Sept 2026, latest session)

Task visibility was tightened, a full escalation feature was built on top of the group hierarchy,
who may act on a task was locked down, and the Task Board was redesigned. Several entries
below **reverse** earlier ones (#36, #62, #66) — those stay in the log as history; the entries
here are current.

| # | Decision | Detail |
|---|---|---|
| 73 | A T4 Lead no longer sees every group's tasks by default | Reverses the "a T4 Lead sees the whole factory" half of #36 and the "BE Admin and every T4 Lead already have this" note in #66. Only **BE Admin** and people named on the **Task Board Overview** list see every group's tasks. |
| 74 | Visibility is membership-only — no downward cascade of any kind | Being in (or leading) a group shows that group's own tasks, nothing beneath it. The T3-Lead-sees-their-JH-groups cascade was removed too, and a Hierarchy "Reports to" link never grants visibility on its own. Owner: "linking should not mean that visibility is there." One exception: an **escalated** task (see #78). Reverses the Lead-cascade half of #36. |
| 75 | Only BE Admin can create a new group (T4, T3 or T2) | Reverses the creation half of #62. A T4 Lead can still rename their group and relink groups in Hierarchy — not touched, flagged to the owner. |
| 76 | "Private group" option at creation, BE Admin only | A checkbox on the New T4 / T3 / T2 dialogs (`dmt_tier.is_private`). Task visibility is identical to any other group (members + BE Admin + Overview list). The flag exists for escalation: a private group **never auto-escalates**, but its owners may still escalate a task **by hand** to any group or person. Private groups are not offered as escalation targets. Not editable after creation (not asked for). |
| 77 | Auto-escalation: N days past the due date, set per group, default 90 | `dmt_tier.escalation_days`, edited by BE Admin on each group's card in the Tiers page (blank = off; a red **Turn off** button). New and existing non-T4, non-private groups default to 90 (existing rows backfilled once). An hourly job escalates an unfinished, non-private task once, to the **Lead of the group its group reports to** (the Hierarchy "Reports to" link) — no link, no parent Lead, or a private group means no auto-escalation. Tasks are never escalated automatically more than once. |
| 78 | Escalation moves ownership and makes the task visible to the higher group | The recipient (a group's Lead by default) becomes the task's owner and can reassign it, but only to someone in their own group; the previous owner is recorded (`escalated_from_owner_id`). Members of the group it was escalated to can now see it (the one exception to #74). Its group can't be changed while escalated. The recipient gets an in-app notification (the notification bell was added to the DMT sidebar with a **Tasks** tab). |
| 79 | Manual escalation: an **Escalate** button for the assigner or assignee | Goes to any active group (→ that group's Lead) or to any person, with an optional reason. Not available for individually private tasks. |
| 80 | Task Board has a new **Escalated** column with three colours and a filter | Escalated, unfinished tasks show only in that column (finishing one drops it into Completed). **Amber** = escalated up **to** my group/me, **blue** = my group's task sent up to a higher group/person, **violet** = between groups I'm not part of (mostly BE Admin's view). A dropdown above the column title filters All / to us / to higher / other. |
| 81 | Only the person who ASSIGNED a task and the person it is ASSIGNED TO can act on it | Status changes, edit, due date, comment and escalate are limited to those two — **not** BE Admin, module leaders, group Leads or Overview-list viewers, who can see the task but only read it. Enforced on the server (403) and on screen (no Actions, Edit, due-date link or comment box for anyone else), including the generic edit/delete route. Replaces the earlier screen-only rule (owner, assigner, creator, module lead+). Consequence the owner accepted: BE Admin can't step in on someone else's task (overdue auto-escalation is the fallback). |
| 82 | An Open task starts itself when its **owner** works on it; Blocked needs a reason | The owner's first comment, edit, or due-date change moves Open → In Progress (history says "Started automatically"); anyone else's action, a reassignment, or a finished/blocked task never triggers it. The Start / Resume button stays (needed to resume a Blocked task). Blocking now asks for a required reason (kept in history, shown in a red "Blocked" box); the server refuses a block without one. |
| 83 | Tasks belong to a group, never to a department | Department removed from task cards/drawer/forms/export/Decision Log; the Admin Task Overview and Analytics now filter/chart by **group**; a task with no group reads **"Not in any group"**. The old NOT NULL `dmt_tasks.department_id` was only relaxed to nullable (data kept, not dropped). Departments still exist for KPIs and people. |
| 84 | Edit Task has the same fields as New Task | Title, description, owner (same searchable picker), **group** (the owner's groups; resets when the owner changes; an owner in no group makes it private), priority. Department is gone; due date still changes through "Change Due Date" (reason required). Escalated tasks show the group read-only. |
| 85 | Task Board layout: 4 cards per column, fixed-size slim cards, per-person column picker | Kanban columns Open / In Progress / Blocked / Escalated / Completed / Cancelled, each showing at most **4** cards with its own pager (owner tried 5 and preferred 4). Every card is the same fixed size and shows only: title, priority, due date (or "Nd overdue"), the meeting name + date if it came from a meeting, and assignee + group (or a **From | To** block — person and group on each side — once escalated). A **Columns** button lets each person hide columns (remembered in their browser). The Groups filter sits on the same row as the quick-filter chips. |
| 86 | BE Admin opens the Task Board on every task; everyone else on their own groups combined | Everyone else still narrows with the Groups filter; unfinished escalated tasks stay in view by default. |

**Verified**: self-cleaning dry-run scripts against the real API and database (on a separate
test copy of the backend, not the owner's running one): `backend/tools/seed_demo_escalation.mjs`
(22 + 15 checks — auto and manual escalation, private-group rules, reassignment, visibility,
meeting-origin tasks), `test_task_flow.mjs` (48 — auto-start, blocked reason, actor rules,
no-department, group editing) and `test_viewers_readonly.mjs` (48 — BE Admin, an IT admin, an
Overview-list viewer and a group's own Lead can see a task but every action returns 403).
UI checks were done in the browser pane (cards, drawer, filters, Columns picker, paging, Edit
form) by seeding a `tpm_session`; **not** checked: phone width, and the list/calendar views with
the slimmer cards. `seed_demo_escalation.mjs` leaves "DEMO Esc" demo data in the live
database — `... clean` removes it.

## KPI ownership by group, and who may enter KPI values (Sept 2026)

| # | Decision | Detail |
|---|----------|--------|
| 87 | A KPI belongs to exactly ONE group | Assigning it on the Tiers tab is refused (409, naming the group that has it) if another group already owns it; the picker shows those KPIs greyed out with "In <group>". A unique index on `dmt_tier_kpi(kpi_id)` backs this up. |
| 88 | Only members / the Lead of the owning group may enter its values | Checked on the server for every KPI save and for adding Project Tracker items. **No role bypass — BE Admin included**: BE Admin controls access by adding people to (or removing them from) the group, which can be done at any time. A KPI in no group can't be entered by anyone. |
| 89 | KPI Entry page is "the KPIs of the groups I'm in" | The department dropdown is gone. Data comes from `/api/dmt/my-tier-kpis` (active groups only). |
| 90 | The generic KPI-entries write routes are closed | POST/PATCH/DELETE on `/api/dmt/kpi-entries` return 405 (`readOnly`); values are written only via `/kpi-entries/upsert`, which does the group check. |

| 91 | A submitted KPI row is locked; an Edit button unlocks it | "Save" only sends rows that have a value (no more blank "submitted" rows). Old blank rows count as not submitted. |
| 92 | Every submission and edit is logged (`dmt_kpi_entry_log`) | Old value → new value, who, when. An edit keeps the ORIGINAL submitter and late flag; saving with no change logs nothing. Table is created automatically on first use. |
| 93 | Organisation tab "KPI Not Submitted" | Pick a date: KPIs with no value that day, with department, group, Lead, member count; KPIs in no group are flagged. Leadership tier and above. |
| 94 | Organisation tab "KPI Audit Trail" | Pick a date: who submitted each KPI, the value, status, and every edit. Leadership tier and above. |

| 95 | PM Schedule: everyone views, only people BE Admin lists can edit (BE Admin can also always edit — #108) | New Organisation tab "PM Schedule Edit Access" (`dmt_pm_editor`, created automatically). Nobody has edit access by default and there is **no role bypass** — BE Admin adds themselves if needed. Enforced on the server for plan and actual (`editGuard`). |
| 96 | PM calendar is view-only until an approved person presses **Edit** | Edit / Done editing buttons; Plan and Actual switch shows only while editing. A key on the page explains every colour and sign (built from the same styles the grid uses). |
| 97 | PM machine list comes ONLY from the shared `machine` table | The 24 machines were copied into `machine` with the same ids (`sql/pm_machines_to_machine.sql`), so plans and actuals stayed attached. `machine` gained `line` (SFM/RFM), `is_critical`, `category` (PM group heading) and `display_order`, plus a primary key it never had. Edited on MDM → Machines. Old `dmt_pm_machines` is kept as an unused backup and is now read-only. The PM page's own Manage-machines panel is gone. |

| 98 | PM calendar shows only machines people SELECT from the master list | New `dmt_pm_machine` table (`sql/pm_machine_selection.sql`). People with PM edit access use "Add machines" (picker of master machines not yet on the calendar) and an X per machine to take one off. Removing keeps its plan/actual history; re-adding brings it back. Machines added to the master later do NOT appear until picked. The 24 machines already on the calendar were pre-selected. |

| 99 | Machine master fields: Name, JH Group, Module, Machine type, Critical (+ Active/Deactivate) | Code and the never-saved Area field were removed from the form. "Module" is a real link to the shared modules list (SFM/RFM/Labels/Flexibles/PPB), replacing the SFM/RFM-only text "line"; "Machine type" (was "PM category") is stored on the machine and is the PM calendar's group heading. `sql/machine_module_and_type.sql` (run after `pm_machines_to_machine.sql`) backfilled module from the old line values, renamed the column, and dropped `line`. The Machines page also gained a Module filter. PM calendar filter chips are now the modules present. |

| 100 | PM Schedule now has an audit trail, shown on Organisation → "PM Schedule Audit Trail" | New `dmt_pm_log` table (created automatically). Records: plan added/removed, marked done, remarks edited, done record removed, machine added to / removed from the calendar, edit access given / removed — each with who, when, machine, date and old → new remarks. A save with no change logs nothing. **History starts from the day this shipped**: earlier PM changes were never recorded and can't be recovered. Tab is visible to leadership tier and above, with a date range and Module / Change / Person filters. |

**Not covered / open**: editing or deleting an existing Project Tracker item and adding stage updates to it still follow the old rule (any JH Lead or above). A group that is deactivated stops its members entering its KPIs.

## Task assignment fixes, login cache, KPI tabs and PM page polish (Sept 2026)

| # | Decision | Detail |
|---|----------|--------|
| 101 | New Task / Edit Task only offer groups the creator may actually use | The group list = the owner's groups that the creator is also a member/Lead of (BE Admin: all of the owner's groups). No shared group → the task is created private and the form says so. The server rule is unchanged (creator must be a member/Lead of the group, BE Admin exempt); the form just stops offering choices the server refuses. Edit keeps the task's current group selectable so an unrelated edit never turns it private. |
| 102 | Changing a task's group is written to its Activity | "Group changed: A → B" (or "No group (private)"); new `group_change` activity type. |
| 103 | Signing in or out clears all cached app data | One shared query client (`lib/queryClient.js`) is wiped by `saveSession` / `clearSession`. Fixes a bug where CloseLoop showed the previous person's role after a new login in the same tab. |
| 104 | KPI tabs (Not Submitted, Audit Trail) have filters and paging | Search, Module → Department → Group cascade (Module always lists every module), plus Person / Status / Edited only / Late only on the trail; the module is shown with the department ("SFM Production"). Filtering is in the browser on the chosen day's data. |
| 105 | PM calendar legend = the seven colour squares only, behind an "i" button | Closed by default. The "2 days" grace rule lives in one constant (`PM_GRACE_DAYS`) used by both the cell colours and the legend wording, so they can't drift. No "View only…" hint text is shown to anyone; people with edit access simply see the Edit button. |
| 106 | DMT layout lets wide pages shrink | The DMT shell's content column and `<main>` got `min-w-0`; the 30-day PM calendar was stretching the whole page past the screen edge (clipping the header controls). |

## PD Cycle access + audit trail; BE Admin can edit PM Schedule (Sept 2026)

| # | Decision | Detail |
|---|----------|--------|
| 107 | PD Cycle: everyone views, only BE Admin + people BE Admin lists can edit | New Organisation tab "PD Cycle Edit Access" (table `dmt_pd_editor`, BE-only writes, leadership can view). Editing = create job, edit details, move stage, comment, respawn; enforced server-side on the generic resources and the stage/spawn routes. `pd-stage-history` is now read-only through the generic API (written only by the stage route). |
| 108 | **BE Admin can always edit the PM Schedule and the PD Cycle (reverses the "no role bypass" part of #95)** | Owner direction: BE Admin edits without adding themselves to the list. The Edit Access tabs now say so; the list is for everyone else. |
| 109 | PD Cycle audit trail | New Organisation tab "PD Cycle Audit Trail" (table `dmt_pd_log`, leadership+): job created, details edited (old → new), stage moved (with note), comment added, respawned, access given/removed. Only changes from now on are recorded. |
| 110 | PD Cycle page layout | Every job card is one fixed size (136px). Board columns show 4 cards each with their own Prev/Next; list view is paginated (6/12/24); the job drawer is split into Details / Comments / History tabs with comments and history paged, so nothing needs scrolling. |
| 111 | PD job categories | New table `dmt_pd_category` (named with the `dmt_` prefix like every other DMT table; created and seeded automatically): Cartons, Tobacco, Flexibles, Labels. BE Admin adds, renames and turns categories on/off in Organisation → PD Cycle Edit Access (leadership can see the list). Categories are turned off, never deleted, so old jobs keep their label. `dmt_pd_jobs.category_id` is a new optional column; New PD Job requires a category (dropdown of active ones), editing a job can change it, respawn copies it, existing jobs show as Uncategorised until edited. The PD Cycle page has a Category filter (incl. Uncategorised). Category changes and job category edits appear in the PD Cycle Audit Trail. |
| 112 | PD Cycle stages are managed by BE Admin (Organisation → "PD Cycle Stages") | New table `dmt_pd_stage_def` (created and filled automatically with the six original stages). Two kinds: **in-progress** (ordered) and **closing** (how a job ends). BE Admin adds, renames, reorders (arrows) and removes; a stage that still has jobs in it can't be removed (409, says how many); at least one of each kind must stay. Removed stages are hidden, not deleted, so old history and audit rows still show their name. Closing stages carry two rules: "feedback note required" and "can be chosen from any stage" (otherwise only from the last in-progress stage). |
| 113 | Stage columns changed from a fixed database list to plain text (one-time migration of live data) | `dmt_pd_jobs.stage`, `dmt_pd_job_comments.stage_at_comment` and `dmt_pd_stage_history.from_stage/to_stage` were the `dmt_pd_stage` enum; converted in place with values kept (done by `ensureDmtPd()` on first backend start, one column at a time). The enum type itself is left in the database, unused. New jobs and respawns start in the first in-progress stage; a plain job edit can no longer change the stage (only the Move route can). |
| 114 | Moving a job back one stage | From any in-progress stage except the first, a job can go back to the previous in-progress stage with a **required reason**; it is recorded in stage history ("Moved back: …") and in the audit trail. Closed jobs stay final — retrying means Respawn. |
| 115 | Respawn is offered from closing stages that require a feedback note | Originally hard-wired to Rejected/Abandoned; now follows the stage rules so a new negative outcome can be respawned too. Approved-type stages can't be. |
| 116 | PD Cycle board: each person picks which columns to see, and the page size follows | A "Columns" menu (like the Task Board) hides/shows kanban columns, remembered per person in this browser (`dmt_pdcycle_cols_<emp_id>`); at least one column always stays. Cards per column page = 4 when 4+ columns are shown, 5 with 3, 6 with 2 or 1, so fewer columns means more cards per page. Cards stay one fixed size, so there is still no scrolling. |
| 117 | Demo data for PD Cycle | `backend/tools/seed_demo_pd_cycle.mjs` (self-cleaning: `... clean`): jobs titled "[DEMO] …" spread over every stage as currently set up, all categories, several customers, overdue and future dates, comments, jobs moved back once, and a respawn. |
| 118 | PD Cycle analytics in a side panel, based on the target dispatch date | An "Analytics" button opens a side panel (works out of the jobs already on the page, no backend): open jobs; tiles for Overdue / Due in 7 days / Due rest of this month / No target date (only open jobs count; tapping a tile filters the board, shown as a removable chip); open jobs by target month (Overdue + next 6 months + Later); where overdue jobs are stuck, by stage; closed jobs finished on/before vs after their target date. It follows the page's other filters (customer, category, search, stage chips, My jobs). Logic in `lib/pdAnalytics.js` (`matchesDue` is shared by the tiles and the board filter so numbers always agree; dates use the local calendar day, not UTC). |
| 119 | PD Cycle forms have a bold label above every field | Create job, Edit details and the Respawn popup use one `Field` component (bold label, red * when required) so the fields line up. |
| 120 | Meeting audit trail (Organisation → "Meeting Audit Trail", leadership tier and above) | New table `dmt_meeting_log` (created automatically) fed by `afterWrite` hooks on the meeting resources. Logs: meeting created / edited (old → new) / started / completed / cancelled / deleted; notes edited (before/after); invitee added/removed; attendance marked and changed (person, old → new, who); discussion point added / notes edited / moved / removed; decision added / edited / removed. The meeting's title and date are saved on every row so the history survives the meeting being deleted. Invitees copied from a template within 30 seconds of a meeting being created are treated as set-up and not logged. Only changes from now on are recorded. Page: date range + filters (meeting, change, person, search) + paging; an "Audit trail" button inside each meeting (leadership+) opens it narrowed to that meeting, over its whole history (`/dmt/organisation?tab=meeting-audit&meeting=<id>`). Endpoint `GET /api/dmt/meeting-audit?from&to&meeting_id`. |
| 121 | Decision Log shows only decisions from meetings the person is part of; only BE Admin sees every meeting's decisions (tightens #46–#57's tier scoping) | "Part of" = the meeting belongs to an active group (Organisation → Tiers) the person is a member or Lead of — i.e. meetings created from that group's "Create Meeting" — or they run (facilitator) or created it. Now enforced **on the server** for `meeting-decisions` (list and open-one; a decision you may not see is a 404) instead of only by the page filtering, via a new generic `rowFilter` option on `DMT_RESOURCES` (`dmtDecisionRowFilter`). Leadership tier and Task Board Overview viewers get no extra view. The page's "My Tiers / All I can see" switch is gone (everything returned is already yours) and a line says what is being shown. This also applies to the Decisions tab inside a meeting. Writes are unchanged. |
| 122 | Meetings can be picked by group (Meetings page and Decision Log) | A shared "Groups:" filter (`components/GroupFilter.jsx`) — the same T4 → DMT → JH group flyout as the Task Board, multi-select, empty = any group. Groups not yet linked in Hierarchy are listed under "Other groups" so every meeting can be filtered. Only groups the person can see are offered. Client-side narrowing of what the server already allows. |
| 123 | The group filter offers only the groups you are part of; the Meeting Audit Trail follows the same rule | The shared Groups filter lists only groups the person is a member or Lead of (BE Admin: every group). The Organisation → Meeting Audit Trail now also has this filter, and on the server only BE Admin gets every meeting's trail; anyone else who can open the tab (leadership tier) gets just the trail of meetings of the groups they are part of, plus meetings they run or created. Each log row now stores the meeting's group (`dmt_meeting_log.tier_id`, older rows back-filled from their meeting), so this still works after a meeting is deleted. |
| 124 | Who may write in a meeting: anyone who is part of it adds; what someone added, only they can edit | "Part of the meeting" = member/Lead of its group, its facilitator, its creator, or module lead and above (BE Admin included). They can add meeting notes, discussion points and decisions while the meeting is open. **Once someone has added something, only that person can edit or delete it — no one else, not even the facilitator or BE Admin:** a discussion point and a decision belong to their author; the meeting-notes box belongs to whoever wrote it (`dmt_meetings.summary_by`; clearing the notes frees the box). Re-ordering discussion points is open to any participant (it changes no one's content). Older items with no recorded author can be taken over by a participant on first edit. Meeting details (title, date, status …) and attendance stay with the facilitator, creator and module lead+. **Tasks have no restriction** (Create Task from a red KPI is available to everyone, in any meeting status). Completed/cancelled meetings accept no new notes/points/decisions. Enforced on the server (generic `rule` hook on `DMT_RESOURCES`: `dmtMeetingRule`, `dmtPointRule`, `dmtDecisionRule`; the author is stamped from the login, never taken from the request), not just the page. Attendance, once marked, changes only through an Edit button (page only). |
| 125 | Meeting Audit Trail filters cascade | Groups, Meeting, Change and Person work as linked filters: each dropdown lists only what is still possible given the other filters (pick a group → only its meetings, changes and people; pick a person → only the groups, meetings and changes they touched), and a choice that stops being possible drops back to "All". The Groups menu keeps its tree shape and just skips groups with nothing left (`GroupFilter`'s new `only` option). |
| 126 | Attendance list reworked: the group's people are the list; each group has a Co-facilitator; "Add person" is for one meeting only | **Co-facilitator:** every group (Organisation → Tiers, under Lead) can have one (`dmt_tier.co_facilitator_emp_id`; set by BE Lead or the group's Lead). The facilitator and co-facilitator run the group's meetings: start/complete, edit details, see the whole attendance list, mark anyone, add outside people. **Attendance list:** the group's members, Lead, Co-facilitator and the meeting's facilitator are on it automatically (written by the server when a meeting is created, refreshed when the tab is opened while the meeting is open; people who left the group and have nothing marked drop off) — `dmt_meeting_invitees.source = 'group'`, not audited as "invitee added". **Marking:** facilitator/co-facilitator mark anyone; every other person on the list marks only their own name (server-enforced, `marked_by` stamped from the login); once marked, a row is locked behind Edit. **Add person:** facilitator/co-facilitator only, for someone who is NOT in the meeting's group, for that one meeting only (`source = 'extra'`, shown as "Added for this meeting", removable until attendance is marked) — never carried across a recurring series (each meeting of a series is its own record). Template invitees are no longer copied onto meetings; invitees already on older meetings stay as extras until the next refresh relabels those who are group members. Notes, discussion points, decisions and tasks stay open to every participant (author-only edits, #124). The Co-facilitator counts as part of the group for who-sees-what (meetings, decisions, audit). |
| 127 | Switch between the two apps with one click; CloseLoop gets its own Logout; "Back to modules" is gone from CloseLoop | A "Switch to CloseLoop" / "Switch to Lumos" button (`components/layout/ModuleSwitch.jsx`, texts in all four languages under `nav.switchModule`) sits in both sidebars and, on a phone, in a top bar (Lumos gained a slim one). CloseLoop's sidebar/top bar also carry Logout (same sign-out as Lumos' profile menu). The sidebar titles ("TPM Fulcrum", "Fulcrum · DMT") were deliberately NOT renamed — Lumos/CloseLoop naming stays to the module chooser and this button until the owner says otherwise. |
| 128 | PD Cycle page details settled with the owner | Respawn opens a confirmation popup (reason required) and warns if the job was already respawned (with a link to the copy; button becomes "Respawn again"); respawned jobs get their own violet card + "↻ PD#n" tag; a respawned job also shows the earlier jobs' stage history (under "Earlier history — PD#n") and the respawn reason + why the old job ended. Job cards never let text overlap: fixed pieces (PD number, respawn tag) don't shrink, one variable item per row (stage name, customer, category) ellipsises, and board columns don't repeat the stage name (only the Closed column and the list view do). Forms have a bold label above every field, incl. "Target dispatch date". The board has a per-person Columns menu and the page size follows the columns (#116). The closing-stage up/down arrows were kept (they only change the list order). |
| 129 | Dry run of everything added this session (Sept 2026) | API level: 85 of 86 checks passed on a test copy of the backend (the one "failure" was a wrong expectation in the check — a stage-only edit is answered 400 "No writable fields", the stage stayed unchanged). UI level (browser, test backend): PD Cycle board, Analytics panel + tile filter, New Job dialog, Organisation tabs (PD Edit Access with categories panel, Stages, Tiers with Co-facilitator, Meeting Audit with cascading filters — picking a group cut the Meeting list from 9 to 2), Meetings + Decision Log group filters, meeting Attendance tab, Lumos ⇄ CloseLoop switch both ways. One real defect found and fixed: the Decision Log had a button inside a button (invalid HTML, console error). Not exercised: a non-BE leadership-tier viewer of the Meeting Audit Trail (none exists in the data; the SQL rule was run directly), Hindi/Gujarati/Tamil rendering (owner's visual gate), phone-width layouts. |

## Open / not yet decided
- **How machines get assigned** (to a JH group / area / department) — owner said they will
  explain their intended rules for this; nothing built yet. **Partly answered since**: the machine
  master now holds Module, Machine type and Critical (#99), and the PM calendar shows only machines
  people pick from it (#98). Still undecided: any rule tying machines to areas/departments, and how
  machines should be scoped to a plant (`machine.factory_id` is a uuid but `factory.id` is text, so
  machines can't be tied to a real plant today).
- **Machine endpoints have no login / role check** (`GET/POST/PUT/PATCH /api/machines`) — flagged as
  a follow-up task; decide which roles may change machines, then guard the write routes.
- **KPI template additions** — now that departments are expanded to 11, more KPI templates
  per department are presumably coming; no rules given yet for what they should be or how
  they map to departments.
- **Renaming inside the TPM/DMT apps themselves + backend** — owner said this will come as a
  separate instruction; not started.
