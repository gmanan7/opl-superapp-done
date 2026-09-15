# CLAUDE.md — TPM Super-App Operating Manual for Claude Code

This file is read at the start of every session. Keep it current; keep it short.

## What this project is

A single-plant **portal / super-app** with a login → module chooser (`pages/ModuleSelect.jsx`,
route `/select-module`). Three modules:
- **TPM** (built — this codebase): OPL (One Point Lessons), Kaizen, Abnormality reporting,
  Audits (5S etc.), MDM/org-structure admin, BE-lead-tier Analytics + Audit Trail. Lives at
  `/home`, `/opl`, `/kaizen`, `/abnormalities`, `/audits`, `/admin/mdm/*`.
- **DMT** (Daily Management Tool) — **fully migrated** from its old Supabase/TypeScript build into
  this stack (see "## DMT module" section below). Lives at `/dmt/*` with its own sidebar. **The
  tile on `ModuleSelect` is currently disabled ("Locked") — the owner wants TPM finished first.**
  Re-enabling = point `handleDmtClick` back to `navigate('/dmt')` + restore the active card style.
  The `/dmt/*` routes and all DMT code stay live regardless (direct-URL still works for testing).
- **Training Hub** — NOT built here yet. Still a partial Supabase/TS build to migrate into
  `/training/*`, same pattern as DMT.

Shared: one login, one `user_details` identity, one PostgreSQL DB (module tables get a
`dmt_`/`training_` prefix), same design tokens. Everyone gets all modules (no per-module
permission table — yet).

No multi-tenant/multi-factory abstraction, no external sync contracts, no Supabase, no RLS.

## Stack (actual — verify before assuming anything else)

- **Frontend:** React + Vite + **plain JavaScript** (no TypeScript, no `.ts`/`.tsx`, no
  `tsconfig`, no `@types/*` — all stripped) + Tailwind + a small local shadcn/ui-style component
  set (`@/components/ui`) + TanStack Query + recharts (charts) + xlsx (Excel export) +
  react-i18next + sonner (toasts). **No test runner** — every `*.test.js/jsx` file was deleted;
  `npm run build` (zero errors) is the only gate.
- **Backend:** Node.js + Express, one monolithic file — `backend/server.js` (~6,500 lines, 116
  routes). Plain JavaScript, ES modules. No separate router files, no ORM. `backend/package.json`
  has **zero devDependencies**. The `mockDb` in-memory fallback (~150 lines) only runs when
  `pool` is null (never, in practice) — leave it.
- **Database:** **PostgreSQL**, self-hosted, connected via the `pg` package's `Pool`, built from
  `.env` (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`, `DB_DATABASE`, or a single
  `DATABASE_URL`) — **not Supabase, no cloud DB service, no RLS**. Auth/authorization is
  hand-rolled in each route (role checks + `x-worker-id` header), not policy-based.
- **No internet-dependent packages.** Everything must run self-hosted/offline — no calls to
  external SaaS APIs, cloud AI services, or hosted auth providers for core functionality.
  `browser-image-compression` runs client-side; image storage is a local upload endpoint, not
  S3/cloud storage.

```bash
cd backend && npm run dev      # node --watch server.js, port 3000 — auto-restarts on save
cd backend && npm start        # node server.js, port 3000 — no watch, for production/manual runs
cd frontend && npm run dev     # vite dev server, port 3001
cd frontend && npm run build   # production build — must be zero errors before calling anything done
```

## Hard rules

1. **Plan before building.** For any non-trivial task, present a plan and get confirmation
   before writing code — especially anything touching workflow/authorization logic.
2. **Schema before code.** Never write SQL against an assumed column or table shape — query
   `information_schema.columns` (or just `SELECT *` a row) against the real live DB first. This
   codebase's `backend/sql/*.sql` migration files are historical records, not a live source of
   truth — the actual DB has drifted from some of them (e.g. `abnormalities_details.type`
   values). Trust the database, not the migration file.
3. **No hardcoded plant/factory identifiers** in app code — always resolve from session context
   (`x-worker-id` header → `user_details.default_plant` → `factory` table).
4. **Every user-facing string** goes through the i18n catalogs where the module already uses
   `react-i18next`; modules built ad hoc in plain JSX strings (much of Abnormality, OPL, Kaizen)
   follow the existing convention of that file — check the surrounding code before assuming i18n
   is required.
5. **Run the backend with `npm run dev`** (`node --watch server.js`) — it auto-restarts on save,
   so an edit to `backend/server.js` takes effect on its own within ~1-2s. `npm start`/plain
   `node server.js` has no watcher, so an edit there still needs a manual kill+restart. Only one
   process can hold port 3000 at a time — if a start fails immediately, something (often a
   leftover Claude Code test instance) is already listening; find it with
   `Get-NetTCPConnection -LocalPort 3000 -State Listen` and `Stop-Process -Force` before retrying.

## Session & identity facts (established this session — do not rediscover)

- **`user_details`** (not `worker_profile`) is the sole identity table: `emp_id`, `name`, `role`,
  `default_plant`, `department_id` (uuid → real `departments` table), `is_active`.
- Auth is a simple `x-worker-id` header carrying the requester's `emp_id` — no JWT, no session
  tokens. Every mutating route requires it and 401s without it.
- Role tiers (as used in role-gate checks, not a formal enum): `operator` <
  `jh_lead`/`module_lead` < `be_lead`/`it_lead`/`leadership` < `admin`. `BE_LEAD_ROLES` (backend
  constant) = `{be_lead, it_lead, leadership}`; `admin` is checked separately and is stricter
  (e.g. Abnormality's Audit Trail is `admin`-only, narrower than BE-lead-tier).
- **Postgres `date` columns get UTC-shifted by default.** `pg`'s default type parser turns a
  `date` column into a JS `Date`, which then serializes to a UTC-midnight ISO string —  in IST
  (+5:30) this silently rolls the calendar date back a day. Fixed globally in `server.js` via
  `types.setTypeParser(1082, v => v)` (oid 1082 = `date`) so date columns round-trip as plain
  `'YYYY-MM-DD'` strings. Never re-introduce `new Date(dateOnlyString)` — display date-only
  values directly or via a local-safe formatter (see `formatAbnDate` in `AbnormalityList.jsx`).
- **Approval routing** (`approval_routing` table, generic `entity_type` column, one row per
  `jh_group_id` + `entity_type`) drives who reviews what, for OPL (`opl`/`opl_stage_N`), Kaizen
  (`kaizen`/`kaizen_dmt`), and Abnormality (`abnormality`/`abnormality_dmt`). Default resolution
  when no routing row exists: JH-stage → the JH group's `leader_emp_id`; DMT-stage → the JH
  group's linked `module_groups.module_lead_emp_id`. Configured via the admin Org Structure →
  Approval Routing dialog (`frontend/src/pages/admin/mdm/OrgStructure.jsx`).
- **Which JH group an OPL/Kaizen/Abnormality is FILED under** (→ which routing applies):
  `resolveSubmitterJhGroupForFiling(empId, requestedJhGroupId)` (server.js). A regular
  operator always files under their own `jh_groups_list` membership; the request's
  `jh_group_id` is ignored. But three kinds of submitter instead pick their filing group from
  a cascading **DMT → JH Group** dropdown on the submit form, and that pick is **mandatory on
  a real submission** (draft is exempt; enforced server-side via `mustSelectGroup` → 400):
  (a) anyone in **no** JH group (incl. DMT-only members), (b) anyone in the **Engineering**
  department (even if also in a group), (c) **BE-admin tier** (`BE_LEAD_ROLES`). Frontend gate
  = `canFileForOtherGroup` in each `*List.jsx`. Filing group ≠ attribution — analytics still
  credit the submission to the submitter's real home group via `jh_group_membership_history`.
- **Reviewer-queue visibility must be status-independent for the actual configured approver** —
  mirrors OPL's `canReviewOpl` pattern: check "is this person the approver for this item," not
  "is this item still in a pending status." Otherwise a JH leader loses track of something the
  moment they act on it (e.g. reject/mark-for-deletion drops out of their own queue). Action
  *buttons* stay separately status-gated — this only affects which items are listed.
- **BE-lead-tier gets read-only, factory-wide visibility** into OPL's rejected items and
  Abnormality's marked-for-deletion items, via their own Review tab — visibility only, never
  action authority (no approve/reopen buttons appear for them on those items).
- Images are compressed client-side to **150KB by default** via the shared
  `compressImageAndUpload` helper (`frontend/src/lib/imageUpload.js`) — used identically by OPL,
  Kaizen, and Abnormality. Don't special-case a module to a different target without being asked.

## OPL configurable multi-stage workflow (added this session)

- **`opl_workflow_stage`** table (`factory_id`, `stage_order`, `stage_name`, unique on
  `factory_id+stage_order`) lets a be_admin build OPL's review flow as an ordered, drag-reorderable
  list of stages — add, remove, reorder — instead of a fixed single JH-review step. No rows for a
  factory = today's default single implicit stage (`entity_type = 'opl'`), so untouched factories
  see zero behavior change. Stage 1 always keeps `entity_type = 'opl'`; stage N (N>1) uses
  `opl_stage_N`, and `approval_routing` rows key off those same `entity_type` values — same table,
  same admin-picker UI pattern as Kaizen/Abnormality, just one row per stage instead of one row
  per module.
- **Stage names are system-generated ("Reviewer 1", "Reviewer 2", …), never admin-typed free
  text** — computed by position on both read and save, so stale/manually-set names (including
  leftover text from API testing) self-heal on the next save. Don't reintroduce an editable
  stage-name `<Input>`.
- `opl_details.current_stage_order` tracks which stage an in-flight item is on (`null`/`1` both
  mean stage 1). The server — never the client — decides the next stage: `PUT /api/opl-details/:id`
  with `action: 'jh_accepted'` resolves the item's *current* stage's approvers, and if a next stage
  exists, advances `current_stage_order` and keeps `status` pending; only the *last* configured
  stage's approval sets `status = 'approved'`. The client's optimistic `status: 'approved'` in the
  request body is always overridden server-side — never trust it.
- **A fresh (re)submission always restarts at stage 1**, even if it was rejected deep in a
  multi-stage flow — reworked content gets a full review, not a resume from wherever it got kicked
  back. (Detected as: new `status` is a pending-review value AND old `status` wasn't.)
- **No re-deciding an already-finished item**: `jh_accepted`/`jh_rejected` on an item whose status
  has left the pending-review set (`pending_jh_review`/`pending_approval`/`pending_be_review`)
  returns 409, even from someone who's a valid approver for that stage — this is what makes
  multiple approvers on one stage a real "first one wins," not just a lucky side effect of
  stage-mismatch checks.
- Deleting a stage that has any in-flight item currently sitting on it is blocked (409, names the
  stuck OPL ids) rather than silently reassigning them.
- Admin write endpoints (`POST /api/org/approval-routing`, `POST /api/org/opl-workflow-stages`)
  require `BE_LEAD_ROLES` (or `admin`) **and** that the target factory/JH-group is one the caller
  actually has `user_plant_access` to — this auth check didn't exist at all before this session
  (anyone who could reach the endpoint could rewrite any factory's routing).
- **Known dead code, don't build on it**: OPL's `be_accepted`/`be_rejected` backend actions and the
  `useBEApproveOpl`/`useBERejectOpl` frontend hooks exist but nothing in the UI calls them —
  `OPLList.jsx`'s review button (`canReviewOpl`) checks only the resolved stage approver list, no
  BE-lead role bypass. OPL is genuinely single-path-per-stage in real use; don't assume a BE
  fallback exists.
- **The "To Review" tab is now assignment-driven, not role-driven** — since a be_admin can name
  *anyone* (any role, including `operator`) as a stage's reviewer, `OPLList.jsx`'s
  `isReviewerRole` also checks `oplDetails.some(canReviewOpl)`, not just
  `jh_lead+`/`be_lead+` role strings. If you're editing that gate, keep both checks — role alone
  will hide the tab from a legitimately-assigned non-lead reviewer.

## OPL Analytics (`OplAnalyticsTab` in `OPLList.jsx`) — overhauled this session

- **Vertical section tabs** (Submissions / Category & Criticality / Reviewer Workload /
  Per-User Breakdown / Member Submissions / Compare) instead of one long scroll.
- **Global filter** (All / JH Group / DMT) narrows *every* tab, including Submissions — not just
  Category/Criticality like before. Backend (`GET /api/opl-analytics`) accepts `jh_group_id` OR
  `dmt_id` (400s if both given) and threads that scope through every query (`byDmt`, `byJhGroup`,
  `memberSubmissions`, `byClassification`/`byCriticality`, and the reviewer/submitter breakdown) —
  if you add a new analytics query to this endpoint, scope it too, or it'll silently ignore the
  global filter.
- **`reviewerWorkload`** and **`submitterStageBreakdown`** are live snapshots ("right now"), not
  scoped to the date-range filter — approver identity is never stored on the OPL row, it's
  resolved live the same way `resolveOplApprovers`/`resolveOplStages` do it for the review screen,
  by walking every non-terminal row in-process (no separate "who's assigned" table exists).
- Per-User Stage Breakdown has its own stage dropdown (separate from the global filter) — pick a
  stage to see a name-chip list of just who's there, instead of the full per-user table.
- **Compare tab**: two JH groups or two DMTs side by side, each column its own independently
  `jh_group_id`/`dmt_id`-scoped fetch against the same endpoint — no new backend needed for this.
- **Export All to Excel** is one persistent button (not tab-scoped) building one workbook with a
  sheet per section, respecting whatever global filter is active. Replaced the old
  Member-Submissions-only export.
- **Pie chart labels must render INSIDE the ring** (`renderPctLabel`/`renderValueLabel` /
  `renderInsidePieLabel` helpers), not recharts' default outside-the-arc placement — a single
  100%-share slice degenerates the outside-label angle calculation and draws it off-canvas. Reuse
  these helpers for any new pie chart on this page instead of inline `label={({pct}) => ...}`.
- Month-on-Month trend displays `YYYY-MM` (the API's actual format) as `MM/YYYY` via
  `formatMonthLabel` — applied to the chart axis, tooltip, and table column all three; don't format
  just one and leave the others raw.

## OPL training push, membership history & auth hardening (added this session)

- **Password auth was previously a no-op.** `/api/auth/login` accepted any password (or none) as
  long as the emp_id/email matched — genuine security hole, not a display bug. Fixed with real
  `bcrypt` hashing (`password_hash` column already existed, just wasn't checked). Also removed the
  dead legacy PIN-login code path (session-shape branching, unused `x-worker-id`/`x-factory-id`
  PIN fallback logic) — it had no working PIN-entry UI and `loginWithPin()` was already a no-op
  wrapper around email login; nothing lost by deleting it.
- **`jh_group_membership_history`** table (`jh_group_id`, `emp_id`, `role`, `joined_at`, `left_at`)
  is the real source of truth for "who was on this team, and when" — maintained by the JH-group
  member add/remove endpoints (open a row on add, close it with `left_at = NOW()` on remove).
  **Any analytics/member-count query must use date-range *overlap* against this table**
  (`joined_at <= to AND (left_at IS NULL OR left_at >= from)`), never today's live membership
  applied retroactively across historical months — a person who left two months ago still counts
  correctly for that month, and stops counting after. `jh_group.leader_emp_id` is a separate
  concept from list-membership; both are folded into this history table (role `'leader'` vs
  `'member'`) so member counts include the leader without double-counting if they're also listed.
- **`opl_training_assignment`** table (`opl_id`, `jh_group_id`, `assigned_emp_id`,
  `assigned_by_emp_id`, `status` `'assigned'`/`'completed'`, `assigned_at`, `completed_at`) is the
  real per-person training record — replaced an earlier all-localStorage, fake-seed-data version
  of "who's completed this lesson."
  - **Auto-assign on approval**: when an OPL is approved, every member of the *submitting* JH
    group gets an `assigned` row **except the approver** — the submitter is not excluded, they
    train on their own lesson like anyone else. This exclusion is by identity (whoever's
    `x-worker-id` performed the approval), not by role, so it holds even if a leader is also
    technically a list-member.
  - **Manual push** (`POST /api/opl-training/push`) lets a JH lead/BE-lead push an *approved*
    OPL to a specific user, a whole JH group, multiple JH groups at once, or a hand-picked subset
    of one group's members. **A push always resets the target row to `assigned`/`completed_at =
    NULL` via `ON CONFLICT ... DO UPDATE`** — re-pushing to someone who already finished it is a
    deliberate retraining trigger, not a no-op. Don't "fix" this to skip already-completed rows.
  - Only `status: 'approved'` OPLs are push-eligible (checked server-side, 409 otherwise) —
    `'published'` is a legacy status from an old, now-removed OPL creation path and is *not*
    treated as equivalent to `'approved'` for this or any other gate.
- **Completion is read-gated, not a free click.** `OnePointLessonSheet.jsx`: both the close
  control and the "mark complete" button stay hidden until the reader either scrolls to the
  bottom of the lesson body or 7 seconds elapse (`setTimeout` + a scroll listener, whichever
  fires first) — applies uniformly, including to short lessons that don't need scrolling.
- **"My Remaining"/assignment-status checks must use one query, not two independent ones.** Two
  separate `useOplTrainingAssignments()` calls (one filtered to "my" assignments, one unfiltered
  "all assignments" for the completions list) can disagree with each other because they refresh on
  independent timers — this caused a real, reported bug (a lesson showing "not assigned to you" on
  its card while correctly appearing in "My Remaining," because the two views read from different
  fetches). Fix pattern: derive any per-user "is this assigned to me / did I complete it" check
  from the *same* fetch that drives whatever list is showing it, not a second broader fetch.
- **`GET /api/opl-analytics` and `GET /api/opl-analytics/trend`** (BE-lead-tier only) are scoped
  to the requester's own plant, resolved server-side via `user_details.default_plant → factory.code
  → factory.id` — never trust a client-supplied plant/factory value here. Provide: approved-OPL
  counts by DMT and by JH group (bar charts, one color per bar via recharts `Cell`, not a flat
  single color), **OPL Index** = approved-OPL count ÷ member count (from the membership-history
  table, date-range-scoped — see above), **Participation %** = members who submitted ≥1 OPL ÷
  total members, a **Member Submission Breakdown** with a plain-number "more than N" threshold
  that's editable and recomputed entirely client-side (no re-fetch per keystroke) — member *names*
  only ever show once a specific JH group is selected, never in the plant-wide "Global" view, and
  an **Excel export** (`xlsx` package) of per-member submission counts for the exact date range
  currently applied. The `/trend` endpoint returns per-calendar-month OPL count, participant count,
  and OPL Index for one JH group over N months (default 6, max 24), each month's member count
  computed independently from the history table (not a single current count applied to every
  month).
- **Removed the legacy `opl` table + its routes/pages entirely** (`OPLForm.jsx`, `OPLDetail.jsx`,
  `/opl/new`, `/opl/:id`, `/opl/:id/edit`, `GET/POST /api/opl`) — it had zero rows, no live UI
  reachability, and its only side effect (`POST /api/opl` also silently wrote a second row into
  `opl_details`) was dead code. Real OPL data has only ever lived in `opl_details`. Don't recreate
  anything against the `opl` table — if it's needed again, it's a fresh build against `opl_details`.
- **`backend/server.js` had no hot-reload** — this bit hard, repeatedly, across sessions, until
  `npm run dev` was switched to `node --watch server.js` (see Hard Rule 5). If a fix that should
  work doesn't seem to be taking effect, first check the process actually reloaded (or was
  started via `npm start`, which still has no watcher) before assuming the code is wrong.

## Abnormality module (rebuilt this session — current shape)

- Responsibility (`abnormality_responsibility`) is department-linked (`department_id` → real
  `departments` table); the "Assign To" picker auto-filters to that department's workers, with
  one exception: a reviewer can always additionally pick **themselves** regardless of department.
- Reviewer edit-and-assign: the JH reviewer can edit every reported field (type, tag, description,
  action, target date, before-photo) via a "Review & Assign" modal, then must pick a
  responsibility + assignee (mandatory for both tag colors). Every field they actually change is
  snapshotted to `abnormalities_details.review_changes` (jsonb) so the submitter can see a
  before/after diff on the item's detail view.
- Closure flow is the **same for both tag colors**: Assigned → assignee submits after-photo +
  closure notes + completion date (`submit_closure`) → `pending_dmt_review` → DMT/Module Lead
  closes it (`dmt_close`) → `closed`. There is no tag-color-based shortcut/self-close path.
- `abnormality_audit_trail` table logs every lifecycle transition (created, marked for deletion,
  assigned for closure, submitted for DMT review, DMT closed) with before/after field diffs where
  relevant. Viewing is **`role === 'admin'` only**, enforced server-side.
- Analytics tab (`AbnormalityAnalyticsTab.jsx`) mirrors OPL's structure — submissions by
  DMT/JH-group (attributed to the submitter's home group via `jh_group_membership_history`, not
  wherever the item was filed), type/tag-color breakdown, status breakdown, responsibility
  breakdown, reviewer workload, per-user breakdown, member submissions, compare, trend, Excel
  export. Gated to BE-lead-tier, scoped to the requester's own plant.

## Kaizen photo previews & review-screen detail access (this session)

- **Never use `object-cover` on an uploaded before/after photo preview** — with `browser-image-
  compression` output (arbitrary aspect ratios) it crops into the image and reads as "zoomed in,"
  not a preview. Every photo thumbnail in `KaizenList.jsx` (submit form, Reviews-tab cards,
  Standard Kaizens cards, the detail sheet) uses `object-contain` on a `bg-surface-sunken`
  background instead, so the full photo is visible with neutral letterboxing. Apply the same when
  adding any new photo preview anywhere in the app — `object-cover` is the wrong default here.
- **Every list/review screen needs a way to see the full record, not just the summary card.** The
  Kaizen "Standard Kaizens" (repository) tab already had a full detail sheet
  (`selectedKaizenSheet` state, opened via a card click) with problem/solution description, full
  photos, submitter/plant/JH-group — but the "Kaizen Reviews" tab had no way to reach it, so an
  approver was reviewing off the summary card alone. Fixed by adding a "View Details" button to
  every Reviews-tab card that opens the same sheet (`setSelectedKaizenSheet(k)`) — reused the
  existing modal rather than building a second one.

## Kaizen full review lifecycle & DMT routing (this session)

- **Lifecycle**: `proposed` → (JH approve/reject) → `approved_for_implementation` → (submitter
  reports implementation) → `submitted_for_confirmation` → (phase-2 reviewer — JH leader by
  default — validates & closes, or rejects) → `confirmed_closed` or `rejected`. The old
  mandatory JH-forward → DMT-confirm two-step was removed (Sept 2026); with an admin-added
  extra stage the reviewer `forward_to_dmt`s to it, status staying `submitted_for_confirmation`
  throughout. There is no `implemented`/`under_review` status
  in real use — an earlier build used `under_review` for the JH→DMT handoff, but the owner
  wanted the status to stay `submitted_for_confirmation` throughout; "has the JH lead forwarded
  it yet" is tracked by `forwarded_to_dmt_at`/`forwarded_to_dmt_by` (timestamp/emp_id columns)
  instead, not by a status change. Don't reintroduce `under_review` as a live status.
- **No JH validation checklist** — the old "tick ≥1 of Categorization/Savings/Final Outcome
  to forward" rule was dropped (Sept 2026). `jh_validated_category`/`_savings`/`_outcome`
  columns still exist but are dead — nothing reads or writes them.
- **Phase-2 review routing** (`resolveKaizenDmtApprovers` in `server.js`): `approval_routing`
  row (`entity_type = 'kaizen_dmt'`) if configured, **else the JH group's own
  `leader_emp_id`** (changed Sept 2026 from the module lead — phase 2 no longer defaults to a
  DMT/module lead). Still fully independent of phase-1's `kaizen` routing.
- **Savings estimate has a free unit toggle**, not a category-derived one: submitter picks one of
  `Rs/annum` / `Units/annum` / `Hr/annum` / `Others/annum` (the last opens a free-text field). The
  server no longer enforces that fixed set — it accepts any non-empty `savings_unit` string, so
  the "Others" custom text passes straight through. An earlier version derived the unit from
  category; don't reintroduce that, the owner explicitly wanted a submitter-chosen toggle.
- **"Mark for Deletion" never deletes the row.** It's a DMT-lead terminal status
  (`marked_for_deletion`) with a mandatory `rejection_reason` comment, rendered on the card for
  anyone who can see it (no separate role-gate was built for who *sees* the comment — only who
  can perform DMT actions is gated).
- **The multi-field "Request Changes" round-trip flow was built, then fully reverted** per owner
  direction — category can now *only* be changed directly by the JH lead via a dropdown
  (`action: 'update_category'`, logged with an old→new diff in `kaizen_audit_trail` and shown
  inline as a "was: X" chip on the card), never via a submitter-resubmit round trip. If you see
  references to `request_changes`/`resubmit`/`change_requested_field` — those columns still exist
  on `kaizen_details` (not dropped) but are dead; don't wire new UI to them.
- **Kaizen BE-lead Analytics** (`KaizenAnalyticsTab.jsx`, `GET /api/kaizen-analytics` +
  `/kaizen-analytics/trend`) — BE-lead-tier only, scoped to the requester's own plant, mirrors
  the Abnormality analytics endpoint. Sections: submissions (By DMT / By JH Group + Kaizen
  Index = count ÷ members, attributed to the submitter's home group via
  `jh_group_membership_history`), **By Category** (6 result areas), **Savings realised**
  (Σ `savings_estimate` per `savings_unit`, confirmed-closed only — Kaizen-only, OPL/Abn have
  no equivalent), By Status, reviewer workload (live-resolved JH + Implementation reviewers),
  per-user breakdown, member submissions, compare, month-on-month trend, Excel export. Wired
  as a 4th `mainTab` (`'analytics'`) in `KaizenList.jsx`, shown only when `isBeLeadRole`. Built
  mobile-first (scroll-strip section tabs, `grid-cols-2 sm:grid-cols-4` stat tiles, tables in
  `overflow-x-auto` with `min-w`).
- **`useCreateKaizenDetail` used to drop `jh_group_id`** — its `mutationFn` destructured only
  6 fields, so the filing-group picker's chosen group never reached `POST /api/kaizen-details`
  from the UI (the API itself was fine; only the hook was lossy). Fixed to forward
  `jh_group_id`. OPL/Abnormality create hooks always spread the whole payload — not affected.
- **`kaizen_audit_trail`** table (mirrors `opl_audit_trail`'s shape) is the real, permanent log —
  every action (create/draft, propose, approve, reject, category change, forward, confirm-close,
  mark-for-deletion) writes a row, `changed_fields` (jsonb-as-text) carries an old→new diff where
  relevant. Replaced an earlier localStorage-only fake audit trail.
- **Reviews tab has the same To Review / My Submissions split as OPL** — `canReviewKaizen`
  (JH-stage) and `canDmtReviewKaizen` (DMT-stage) are both checked for "To Review" membership;
  `isMySubmissionKaizen` for the other tab. Same principle as the generic status-independent
  reviewer-queue rule above.
- **Bugs found and fixed this session** (don't rediscover):
  - `after_image` was hardcoded to `null` in `KaizenList.jsx`'s `kaizens` mapping regardless of
    the real column value — after-photos never rendered anywhere even when saved.
  - `userJhGroup` fell back to a fake-but-real-sounding group name (`'Printing - Group A'`) and
    `dmtJhMap` was pre-seeded with fake DMT/group names (`'DMT 1'`, `'Alpha Team'`, etc.) merged
    in alongside real org data — caused "My JH Group" to show 0 for real users whose session
    lacked a `jh_group_name` field (which is *always*, since `ctx` only ever carries
    `jh_group_id` — see the flat-session note below). Fixed to resolve the real name from
    `orgData.jhGroups` by `ctx.jh_group_id`, same lookup OPL already does for
    `resolvedUserJhGroupName`. `userWorkerId` similarly fell back to a fake ID (`'EMP-102'`) —
    changed to `''`, matching OPL's `currentEmpId` fallback (fails closed, matches nothing).
  - `Home.jsx`'s "Kaizens This Month" stat read the **old, abandoned `kaizen` table**
    (`api.getKaizens()`) and didn't actually filter to the current month despite the label —
    fixed to `api.getKaizenDetails()` filtered by `timestamp`'s calendar month.
- **Standard Kaizens catalogue**: "Area" filter renamed to "Category" and its option list fixed
  to the real 6 categories (productivity/quality/cost/delivery/safety/morale — was a stale
  hand-typed list including a nonexistent `'environment'` value and missing `delivery`/`morale`).
  Plant/DMT-Level/JH-Group filters only render on the "All Standard Kaizens" sub-tab (hidden, and
  reset to `'all'`, when switching to "My JH Group"/"My Remaining" — those are already scoped).
  "My Remaining" was a fake localStorage-only "mark completed" toggle with no server write at all
  — redefined to a real check (`status === 'approved_for_implementation'`, i.e. genuinely awaiting
  the submitter's implementation report); the fake "Mark as Completed" button is gone, replaced
  with the item's real `StatusBadge`. **The card grid here is intentionally 1-per-row**
  (`grid grid-cols-1`, not a responsive 3-column grid) — this was a deliberate owner choice, not
  a bug; don't "fix" it back to multi-column.
- **The old `kaizen` table and everything on it were deleted** this session: `GET/POST
  /api/kaizen`, `api.getKaizens`/`createKaizen`, `KaizenDetail.jsx` + route `/kaizen/:id`, and
  the `useKaizens`/`useKaizen(id)`/`useCreateKaizenIdea`/`useUpdateKaizen`/`useApproveKaizen`/
  `useRejectKaizen`/`useSubmitKaizen` hooks. `KaizenList.jsx` reads/writes only `kaizen_details`;
  `useKaizen.js` is now 6 hooks (details CRUD + repository-setting + audit-trail).

## Startup, env, and legacy-table gotchas (found this session)

- **`.env` must resolve from the script's own real file location, not `process.cwd()`.**
  `backend/server.js` does a manual `dotenv.config({ path: ... })` search (own-file dir →
  parent → entry-script dir → parent → `process.cwd()`) instead of plain `import
  'dotenv/config'`, because the terminal's working directory at launch time is *not*
  reliable across `npm run dev`, a standalone `node backend/server.js`, and the
  esbuild-bundled `dist/server.cjs` (where `import.meta.url` isn't even available — it
  becomes `undefined` and crashes if you rely on it unguarded). If DB connection silently
  falls back to in-memory mock data even though `.env` looks fine, check this resolution
  logic before assuming the file itself is missing.
- **`factory_module` and the `useFactoryModules`/`toggleModule`/`GET/PATCH /api/org/modules`
  chain were deleted** this session (table in the drop list below; hook, endpoints, and the
  `visibleNav` `moduleKey`/`enabled` gating all removed). Sidebar nav (`navConfig.js`) is now
  purely role-gated — `visibleNav(entries, role, surface)`, no module-enable concept.
  (`Audits` replaced the old `KPIs` module earlier — KPI tables/routes/i18n deleted outright.)
- **The `roles` table (9 rows) is the ground-truth role vocabulary**: `operator`,
  `jh_lead`, `module_lead`, `admin_5s`, `area_champion_5s`, `auditor_pool`, `be_lead`,
  `it_lead`, `leadership`. Any route guard, nav config, or role check written against a
  role name *not* in this list (`admin`, `dmt_leader`, `pillar_champion`, `dmt_member`,
  `jh_leader`, `be_team`, `apprentice`, `on_roll` have all shown up as stale/fictional
  names in this codebase at one point or another) will silently pass for every logged-in
  user if it goes through `auth.js`'s `roleAtLeast` — see the Carried tech debt entry
  below for why.

## Reviewer-edit, status merge, configurable multi-stage workflow, blue rebrand (this session)

- **Kaizen reviewer can now edit submitted content at review time**, mirroring Abnormality's
  `assign_for_closure` edit-and-diff pattern (previously Kaizen review was read-only until
  approve/reject). Applies at the proposal-review stage (title/content/category/before_image)
  AND at the post-implementation JH-forward stage (after_image/savings_estimate/savings_unit/
  improvement_notes/implementation_date). Only fields actually changed are snapshotted to a new
  `kaizen_details.review_changes` (jsonb) column and shown on the detail sheet as a submitter-
  facing diff ("Changed by the reviewer"), same UI pattern as Abnormality's `review_changes`.
  `improvement_notes` diffing is deliberately **case-insensitive** (retyping "None" as "none"
  doesn't count as a change) — every other field is exact-match.
- **"Confirm & Close" is two-click** — the first click opens an inline "Validate before
  closing" panel (`confirmCloseId` state in `KaizenList.jsx`) showing the implementation
  report + any `review_changes` + audit-trail steps since `submit_implementation`; only the
  panel's own Confirm button fires `action: 'confirm_close'`.
- **`rejected` and `marked_for_deletion` are now ONE status (`rejected`) for Kaizen.** Which
  review phase it happened at is told apart by whether implementation was reported —
  frontend uses `implementation_date || after_image` (the `reached_phase2` flag in
  `KaizenList.jsx`), NOT `forwarded_to_dmt_at` (which no longer gets set in the default
  single-stage phase 2). Frontend: one "Rejected" top-level filter tab with two nested
  sub-tabs ("Proposal Review" / "Implementation Review"). `mark_for_deletion` the *action*
  is unchanged (requires `rejection_reason`); only the resulting `status` merged.
  Abnormality's `marked_for_deletion` status was **not** touched.
- **Configurable multi-stage review ladder, generalized from OPL's existing pattern to Kaizen
  and Abnormality — both of their two review phases each** (not just phase 1 like OPL had).
  New shared table `workflow_stage (factory_id, module, phase, stage_order, stage_name)`
  replaces needing a dedicated table per module/phase; `kaizen_details`/`abnormalities_details`
  both got a `current_stage_order` column (mirrors `opl_details`). No rows configured for a
  given (factory, module, phase) = today's exact default behavior, unchanged:
  - Kaizen phase 1 (proposal review) floor = 1 stage (`kaizen`).
  - Kaizen phase 2 (post-implementation) floor = **1 stage** (`kaizen_dmt`), the JH group
    leader by default (`resolveKaizenDmtApprovers` now defaults to `jh_group.leader_emp_id`,
    not the module lead). **The old mandatory 2nd "DMT confirm" stage was removed** (owner
    direction, Sept 2026) — no forced DMT sign-off, no validation checklist. Admins can still
    add stages beyond the floor (same as OPL/Abnormality); an admin-added stage uses
    `forward_to_dmt` to advance to it. Phase 2's single reviewer both validates and closes
    (`confirm_close`) or rejects (`mark_for_deletion` → `status='rejected'`, mandatory
    reason). A phase-2 rejection notifies the submitter **+ the plant BE leads + the JH
    group leader**. Phase 2's stage-1 config is now fully independent of phase 1 (its own
    `kaizen_dmt` approval_routing row, its own admin card).
  - Abnormality phase 1 (JH review) floor = 1 stage (`abnormality`); phase 2 (DMT final
    closure) floor = 1 stage (`abnormality_dmt`). Abnormality phase 2 has **no reject option**
    at any stage (matches today's behavior) — `dmt_close` serves as both "advance" (non-final
    stage) and "finalize" (last stage).
  - Backend: `resolveModulePhaseStages(factoryId, module, phase)` (generic stage-list
    resolver) + `resolveStageApproversFor(jhGroupId, module, phase, stage)` (dispatches to the
    original per-entity resolvers — `resolveKaizenApprovers`/`resolveKaizenDmtApprovers`/
    `resolveAbnormalityApprovers`/`resolveAbnormalityDmtApprovers`, all **left unchanged** — for
    floor-position stages, and a new role-aware `resolveGenericStageApprovers` for anything
    admin-added beyond the floor). New generic endpoints `GET/POST /api/org/workflow-stages`
    (`module`+`phase` query/body params) alongside the pre-existing OPL-only
    `/api/org/opl-workflow-stages` (left as-is, not merged in).
  - Approving a non-final stage advances `current_stage_order` and leaves `status` unchanged
    (still pending); only the LAST configured stage's approval actually finalizes. Entering a
    module's phase 2 (Kaizen's `submit_implementation`, Abnormality's `submit_closure`) always
    resets `current_stage_order` to phase 2's first configured stage — the pointer is shared
    sequentially across both phases on one column, so this reset is required every time.
  - Frontend: `useWorkflowStages`/`useSaveWorkflowStages` generic hooks
    (`frontend/src/hooks/mdm/useOrgStructure.js`) alongside the existing OPL-only ones. Org
    Structure → Approval Routing has 4 new drag-reorder stage builders (Kaizen ×2 phases,
    Abnormality ×2 phases) mirroring OPL's exactly, each with its own per-stage approver-config
    card loop. Kaizen review cards show a "Stage X of Y" chip once >1 stage is configured
    (invisible otherwise).
  - **Bug fixed this session**: the stage-builder draft state (`kzP1StageDrafts` etc.) only
    resynced from saved data when the underlying query result actually *changed* — editing a
    draft (drag/add/remove) and closing the Approval Routing dialog *without* saving left the
    unsaved draft sitting in memory, so it reappeared next time the dialog opened even though
    nothing was ever saved. Fixed with a `useEffect` keyed on `isApprovalRoutingOpen` that
    force-resets all 5 stage-drafts (OPL + Kaizen×2 + Abnormality×2) from current saved data
    every time the dialog opens, discarding any unsaved edits from the prior open.
  - **Verified with 45 live API tests this session** (self-cleaning, run directly against
    `x-worker-id`-header auth, no login needed) — defaults unchanged, full happy-path flows,
    the merged `rejected` status split, real multi-stage add/advance/finalize/reset for both
    Kaizen and Abnormality, and specific-named-reviewer assignment (confirmed a routing
    override correctly locks out the previous default approver, not just adds the new one).
- **App-wide amber → blue rebrand.** The `brand` design token itself was burnt amber
  (`docs/design/tokens.tailwind.js` `colors.brand.*` + `docs/design/shadcn-bridge.css`
  `--primary`/`--ring`/`--chart-1`/`--sidebar-primary`/`--sidebar-ring`, both root and
  `.dark-rail` scopes) — changed to blue (`DEFAULT #2563EB`/`bright #3B82F6`/`strong #1D4ED8`)
  at the token source, so it cascades to every `bg-primary`/`bg-brand`/shadcn default-variant
  Button app-wide, not just per-page class overrides. OPL/Kaizen/Abnormality/OrgStructure pages
  additionally had their *explicit* amber/rose/orange Tailwind utility classes (not routed
  through the token) swapped to literal `blue-600`/`blue-700`/`blue-50` by hand — those don't
  auto-follow the token change. If a new orange/amber/rose patch shows up anywhere, check
  whether it's a literal Tailwind color class (needs manual swap) vs. the `brand`/`primary`
  token (already fixed at the source, shouldn't need touching again).
  Also fixed: several `object-cover` photo thumbnails across Abnormality/Kaizen/OPL cropped
  into non-square uploaded photos — all switched to `object-contain` with a neutral background.
- **`SECURITY_VULNERABILITIES.md`** (new, project root) — tracks CORS-wide-open (`cors()` with
  no origin restriction; matters more than usual here since auth is a plain `x-worker-id`
  header, not a server-issued secret) and the missing frontend↔backend deploy wiring for a real
  IIS deployment (URL Rewrite + ARR reverse-proxy, NSSM-as-Windows-Service for the Node
  process, IIS-specific gotchas: request-size cap, proxy timeout, worker-recycle risk if
  iisnode were used instead of a real service). Both blocked on the owner supplying the real
  production hostname. Not fixed yet — read before deployment.

## Audits module (current consolidated state — supersedes the earlier layered notes)

Replaced the old KPI stub entirely (KPI tables/routes/pages/i18n deleted). Lives at `/audits`
→ `frontend/src/pages/audits/AuditsHome.jsx` (tabs) + `AuditCapture.jsx` (the scoring screen).

**Migrations, all in `backend/sql/`, all applied to the live DB, all additive:**
`create_zone_and_audit_tables.sql` (base) → `audit_flexible_templates.sql` (structure/scale/
categories/multi-photo) → `audit_schedule_recurrence.sql` (Teams-style recurrence) →
`audit_schedule_reminder.sql` (`last_reminded_for`) → `audit_template_max_auditors.sql` (cap)
→ `audit_multi_auditor_occurrence.sql` (`audit_occurrence` + per-person scorecards). Trust the
live DB, not the base `.sql` file — it has drifted.

### Schema (current)

- `zone` — plant-scoped free-form areas (`factory_id` only; no dept/module link).
- `audit_template` — one audit TYPE. `structure` (`questions` | `categories` |
  `categories_questions`, **immutable** after creation), `scoring_mode` (`required` |
  `optional` | `off`), `score_min`/`score_max`/`score_step` (the mark scale; "step up" in UI),
  `max_auditors` (nullable cap — NULL = unlimited; **the Audit Admin counts toward it**),
  `is_active`.
- `audit_template_category` — free-form category rows (`name`, `category_order`,
  `photo_required`, `is_active`). Replaced the fixed 5S-pillar enum. The seeded "5S Audit"
  template is just `structure='categories_questions'` with its 5 pillar names as categories.
- `audit_template_question` — `question_text`, `question_order`, `photo_required`, `is_active`,
  `category_id` (nullable FK; for `categories_questions`). Legacy `category` text column kept
  as a denormalised label, **no longer constrained**. Retire = `is_active=false`, never delete.
- `audit_schedule` — `template_id`, `zone_id`, **mandatory** `admin_emp_id` (the per-schedule
  Audit Admin). Recurrence: `freq` (`once`/`daily`/`weekly`/`monthly`), `recur_interval`,
  `weekdays int[]` (0=Sun..6=Sat), `day_of_month`, `start_date`, `end_type` (`never`/`on`/
  `after`), `end_date`, `occurrence_count`. Legacy `recurrence` enum + `specific_date` are
  **kept and written in sync** by `legacyAuditRecurrence()`. `last_reminded_for date`.
- `audit_schedule_auditor` — the auditor pool for a schedule.
- **`audit_occurrence`** — one row per `(schedule_id, due_date)` (unique). `status`
  (`open`/`closed`), `combined_score`/`combined_max`, `submitted_count`/`expected_count`,
  `close_requested_by_emp_id`/`close_requested_at`/`close_request_note`, `closed_by_emp_id`/
  `closed_at`. **Occurrences are still lazy** (created on first Start, not pre-generated).
- **`audit_submission`** = one SCORECARD per `(occurrence, person)`. `occurrence_id`,
  `started_by_emp_id` (set at Start — the scorecard's owner), `submitted_by_emp_id`, `status`
  (`pending`/`submitted`), `total_score` (this person's overall), `max_score`.
- `audit_response` — per scorecard, per item. `question_id` (nullable) OR `category_id`,
  `score numeric`, `remarks`. **No CHECK constraints** — score validity is server-side via
  `isScoreOnScale()` (min ≤ s ≤ max, `(s−min)` a whole multiple of step).
- `audit_response_photo` — unlimited captioned photos per response (`photo_url`, `caption`,
  `photo_order`). `audit_response.photo_url` is legacy back-compat only. All photos compress
  to 150KB via `compressImageAndUpload`. Photo is required only where the item's
  `photo_required` flag is set; **≥1 photo satisfies it** (the old "score 1/2 forces a photo"
  rule is gone).
- `audit_submission_category_score` — per-category average for ONE scorecard (`category_id`).
- `audit_home_zone` — a worker's home zone. **Blocks** self-auditing (`isHomeZoneConflict` in
  every assignment path; the picker disables + labels those people).
- `audit_change_request` / `audit_change_request_item` — post-submission correction on a
  scorecard: the submitter requests a score/photo/remarks change with a reason; an admin
  approves (applies it, recomputes) or rejects. Question-keyed → not offered for
  `categories`-structure audits.
- `audit_audit_trail` — event log (`submitted`, `draft_saved`, `change_requested/approved/
  rejected`, `template_deleted`, `schedule_deleted`, `submission_deleted`, `occurrence_closed`,
  `occurrence_force_closed`). Rows for deletions carry `template_id` and NULL `submission_id`.
- `audit_global_admin`, `audit_template_admin` — the appointment tables (see authz below).

### Authorization — 4 tiers, never touch `user_details.role`

1. **`BE_LEAD_ROLES`** (`be_lead`/`it_lead`/`leadership`) — everything. **Only tier that can
   appoint a Global Audit Admin (tier 2).**
2. **`audit_global_admin`** ("**Global Audit Admin**") — appointed only by tier 1. Full peer of
   tier 1 *inside Audits*: create/configure/schedule/**delete** any audit, manage
   **Zones/Home Zones**, appoint per-audit **Audit Admins** (tier 3), **force-close**
   occurrences. **Cannot** appoint another Global Audit Admin.
3. **`audit_template_admin`** ("**Audit Admin**", per audit type) — configure ONE named
   template (its questions/categories, schedule it, manage its auditors). Appointed by tier 1
   **or** tier 2.
4. **Per-schedule admin** (`audit_schedule.admin_emp_id`, mandatory at creation) — configure
   just that schedule: recurrence + dates + its auditor pool. **NOT** the zone, **NOT** who
   the Audit Admin is (`PUT /api/audit-schedules/:id` ignores `zone_id`/`admin_emp_id` from a
   tier-4 caller). Gets the Configure tab (Schedules sub-tab only — `scheduleAdminOnly`).

Helpers (`server.js`, top of the Audits section): `isFullAuditAdmin` (1–2) → `isTemplateAdmin`
(+3) → `isScheduleAdmin` (+4). `GET /api/audit-admins/me` → `{ isBeLead (=tier 1 or 2),
isGlobalAdmin, adminTemplateIds, isScheduleAdmin, isAuditAdmin }`. Frontend `isTrueBeLead(role)`
is a real-role-only check, used only to gate appointing a *Global* Audit Admin.

### Multi-auditor occurrences (the core workflow)

- **Every assigned auditor AND the schedule's Audit Admin fills in their own scorecard.** They
  all hang off one `audit_occurrence`. One person submitting does **not** hide "Start" from the
  others.
- `combined_score` = **plain average of the SUBMITTED `total_score`s**. A person who never
  submits is **not counted as zero** — they're simply absent from the average.
- The occurrence **auto-closes once every person CURRENTLY expected has submitted** — matched
  **by identity, not by count** (`expected.every(e => submitters.has(e))`, where `expected` =
  `distinct(audit_schedule_auditor ∪ audit_schedule.admin_emp_id)`, computed live). The old
  `submitted_count >= expected_count` test was wrong once anyone could be removed mid-audit: a
  scorecard from someone since removed would stand in for a person who still hadn't submitted.
  Verified — 2 cards in, `2/2` on the counters, still `open` because the Audit Admin's card is
  the missing one.
- **Closing early is the audit's OWN Audit Admin's call** (owner direction, Sept 2026).
  `POST /api/audit-occurrences/:id/close` is gated by `isScheduleAdmin`, so the schedule's
  Audit Admin, a template admin, and the BE-lead / Global tier can all close; auditors and
  outsiders get 403. Whoever hasn't submitted **drops out of the scoring entirely — never
  scored zero**. Trail `occurrence_force_closed`, notifies the Audit Admin + submitters
  (`audit_closed`).
- **UI shape of that (AuditCapture):** *everyone* — the Audit Admin included — sees only
  **Submit** for their own scorecard. **"Close the Audit" appears to the Audit Admin only
  once their OWN card is submitted** (`can_close && submission.status === 'submitted'`); before
  that they get a "Submit your own scorecard first" hint. They audit like everyone else before
  deciding the round is over. This gate is UI-only — the endpoint stays permissive so a BE-lead
  can always close from the All Audits board without being an auditor on that schedule.
- **Final audit report** — `GET /api/audit-occurrences/:id/report` (closed occurrence only,
  `isScheduleAdmin`-gated) returns one payload with the occurrence, template, zone, computed
  scoring legend (`auditScoreLegend`: `max = Good | mid–(max-1) = Marginal | min–(mid-1) =
  Poor`, null when `scoring_mode='off'`), every submitted scorecard (per-item score /
  observation / photos) AND the combined roll-up. Frontend `AuditReport.jsx` at
  **`/audits/report/:id`** — a **top-level route deliberately OUTSIDE `AppShell`** so the
  sidebar / bottom nav don't print. One page, `window.print()` → Save as PDF (same pattern as
  the OPL sheet). A `?auditor=<emp_id>` query param (a `<select>` in the toolbar) switches
  between the **combined round report** and a **single auditor's report**. Works for all three
  template structures. "Generate Report" button appears once closed on: AuditCapture (to the
  Audit Admin), the All Audits board Completed cards and the Scores tab (BE/Global). Item
  detail uses `ItemBlock` + `ScoreChip` (colour-banded — Good/Marginal/Poor, same split as the
  legend): question title + category pill + big headline chip; then a bordered list of auditor
  rows (**name bold**, own chip, observation); photos grouped once at the bottom. Individual
  mode drops the row list and shows just that auditor's observation.
- **All Audits board** — each column (`PagedColumn`) shows **5 cards** with its own Prev/Next
  pager (`BOARD_PAGE = 5`). The **Scores tab** table paginates the same way (`PAGE = 5`, resets
  to page 1 on any filter change).
- **Configure tab tables → cards under `sm`.** The Templates list and both appointment
  rosters (per-audit Audit Admins, Global Audit Admins — shared `AdminRoster` component) were
  6-ish-column tables that scrolled / clipped on a phone; now a card per row (name + a small
  labelled grid + wrapped action buttons), real table from `sm` up.
- **Audits tab strips stay on ONE line, no scroll, no wrap** (owner: wrapping "does not look
  good"). Both the main strip (My Audits / All Audits / Scores / Configure / Audit Trail) and
  the Configure sub-tabs use `flex-1 min-w-0` so the buttons share the row evenly, dropping to
  ~11px and a `short` label under `sm` (main: Mine/All/Scores/Config/Trail; sub:
  Templates/Schedules/Zones/**Admins**/**Changes**), full labels + auto width from `sm` up.
  Measured at 375px: 5 buttons, 1 row, nothing clipped.
- **Demo data:** `backend/tools/seed_demo_audit.mjs` builds one closed 20-question 5S round
  ("DEMO 5S Audit") with 3 auditors + the Audit Admin, varied scores, a couple of observations
  and photos. `node backend/tools/seed_demo_audit.mjs` (needs the server running) prints the
  report URL; `... clean` removes it. Everything it makes is prefixed `DEMO `.
- **`CloseAuditDialog`** always confirms (even at full attendance) and names who is being left
  behind, split two ways from
  `occurrence.in_progress_auditors` / `.not_started_auditors` (both added to
  `GET /api/audit-submissions/:id`; `missing_auditors` = the two combined, kept for AuditsHome):
  **part-way through** (started a scorecard — closing *discards* their unfinished work, the
  thing worth pausing over) vs **not started**. Confirm button reads "Close the Audit" when
  everyone is in, "Close anyway" when they are not. Don't collapse the two lists back into one.
- **The old two-step "Audit Admin requests → BE-lead approves" is GONE** —
  `POST /api/audit-occurrences/:id/request-close`, `api.requestCloseAuditOccurrence`,
  `useRequestCloseAuditOccurrence`, the "Request early close" button and the
  `audit_close_requested` notification were all removed as more ceremony than the decision
  warranted. The `audit_occurrence.close_requested_*` columns remain but are dead — don't
  wire new UI to them.
- **Removing an auditor mid-audit is the normal way to unblock a stuck occurrence.**
  `DELETE /api/audit-schedules/:id/auditors/:empId` (Audit Admin only) now also bins that
  person's *unfinished* scorecard (an already-submitted one is kept — real work, still scored)
  and re-runs `recomputeAuditOccurrence` on every open occurrence of the schedule, so it closes
  the instant everyone still on the list has submitted.
- `recomputeAuditOccurrence(occId, {forceClose, closedBy})` is the single rollup function
  (called on every submit, on close, and on auditor removal).

### Key endpoints

- `POST /api/audit-submissions` (Start) — find-or-create the occurrence for the **caller's own
  next due date** (rolls past dates they've already submitted), then find-or-create **their**
  pending scorecard (idempotent per person). Gated: assigned auditor / schedule admin / full
  admin (403 else). Non-full callers get 409 before the due date; full admin may pre-create.
  409 if the occurrence is already closed.
- `PUT /api/audit-submissions/:id` (submit) — a scorecard belongs to whoever started it (403
  otherwise unless full admin); 409 if the occurrence is closed; recomputes the occurrence
  after.
- `GET /api/audit-submissions` — the caller's own scorecards (`is_mine` = started or submitted
  by me), plus `occurrence_status` / `combined_score` / `submitted_count` / `expected_count`.
- `GET /api/audit-submissions/:id` — scorecard + `occurrence` + `scorecards[]` (every
  auditor's card, status, score) + `combined_categories[]` + `occurrence.missing_auditors[]` +
  `can_close` (full admin) + `is_audit_admin`.
- `GET /api/audit-schedules` — per-requester `next_occurrence` / `current_occurrence` /
  `open_submission_id` / `my_current_submission_id` / `is_my_audit`; `auditors[]` enriched with
  `jh_group` + `department`; `max_auditors`.
- `POST`/`PUT /api/audit-schedules` — create / edit recurrence (one `CreateScheduleDialog`
  does both). `POST /api/audit-schedules/:id/auditors` (add / copy-pool) enforces
  `auditAuditorCapError`.
- `GET /api/audit-occurrences` (full admin) — plant-wide; the All Audits board runs off this.
- `GET /api/audit-scores` (full admin) — **closed occurrences only**: `combined_score` is the
  grade, per-category = averaged across submitted scorecards, `submitted_count/expected_count`.
- `GET /api/audit-audit-trail` — `LEFT JOIN`s the submission (so deletion events show), scoped
  to what the caller administers, limit 1000.
- Deletes: `DELETE /api/audit-templates/:id` (soft + deactivates its schedules, `isFullAuditAdmin`),
  `/audit-schedules/:id` (soft, `isScheduleAdmin`), `/audit-submissions/:id` (**hard**, txn,
  `isScheduleAdmin`, trail `submission_deleted`).
- Zones + home-zones write: `isFullAuditAdmin`. Appoint Global Audit Admin: tier-1 only.
  Appoint per-audit Audit Admin: tier 1–2.

### Frontend tabs (`AuditsHome.jsx`)

- **My Audits** — "Assigned to you" shows the caller's own state per schedule (Resume draft /
  Start / "✓ Submitted — others pending" / "Scheduled for …"); "Completed" lists their
  scorecards (their score, plus the combined once the occurrence closes).
- **All Audits** (`isFullAuditAdmin`) — `AuditBoard`, Board/List toggle, 3 buckets off
  `/audit-occurrences`: **Scheduled** (schedule's next date, no open occurrence) / **In
  progress** (open occurrences, "n/m auditors submitted", "Close now" button) / **Completed**
  (closed, combined grade). Deleting one occurrence is done here (card trash icon) — the only
  such UI.
- **Scores** (`isFullAuditAdmin`) — `AuditScoresTab`: closed occurrences, filters (audit type
  / zone / date range), summary tiles, avg-by-zone / avg-by-audit-type, Excel export.
- **Configure** (`isAdmin`) — sub-tabs Templates / Schedules / Zones / Global Audit Admin /
  Change Requests. `scheduleAdminOnly` → Schedules only.
- **Audit Trail** (`isAdmin`) — `AuditTrailTab`: event-type filter chips + dropdowns (audit
  type / zone / actor / date) + a table. The filter dropdowns are a `grid-cols-2` on a phone
  (their fixed `w-44`/`w-40`/`w-36` widths left ragged half-rows) and natural-width from `sm`;
  the 5-column table is card-per-entry under `sm`.
- **`AuditCapture.jsx`** = the scoring screen **only**. Score buttons generated from the scale
  (numeric input when >12 steps); scores categories directly for `structure='categories'`;
  multi-photo + caption per item; honours `scoring_mode`. Shows the occurrence combined-score
  panel (each auditor's row + status, missing auditors, combined per-category) with "Request
  early close" (Audit Admin) / "Close now" (full admin). "Request Change" for submitted
  question-structure audits. **No** auditor management and **no** delete button here.

### Template creation / editing

- `POST /api/audit-templates` body: `{ name, structure, scoring_mode, score_min, score_max,
  score_step, max_auditors, categories:[{name,photo_required}],
  questions:[{question_text,photo_required,category_index}] }`.
- `PUT /api/audit-templates/:id` — name + scoring_mode + scale + max_auditors (structure is
  immutable). `POST /api/audit-templates/:id/categories` + `PUT /api/audit-template-categories/:id`
  and the question add/`PUT` endpoints for evolving a live template.
- `CreateTemplateDialog` = structure picker → questions / categories / categories-with-nested-
  questions editor + scale + scoring-mode + optional auditor cap. `EditTemplateDialog` shows
  structure read-only.
- Excel: **download only** (`.xlsx` of the current questionnaire, for reference). The old
  import was removed with the flexible-template rework.

### Recurrence UI

Deliberately minimal (owner rejected a frequency dropdown twice): pick a **Date**, tick
**"Repeat every \<Weekday\>"** → weekly on that date's weekday (`freq:'weekly'`, `interval:1`,
`weekdays:[dow]`). Only an "Ends: Never / On \<date\> / After N" block under the checkbox.
Unticked = one-off (`freq:'once'`, the default for a new schedule). `nextAuditOccurrence(sched,
from)` is pure/stateless. The backend still accepts the full daily/monthly/every-N vocabulary
(no UI for it now); `describeRecurrence()` still renders legacy daily/monthly schedules.

### Day-before reminders

`sweepDueAuditReminders()` runs on the same hourly `setInterval` + 15s-after-boot timer as the
OPL training sweep: for every active schedule whose `nextAuditOccurrence(today)` is **tomorrow**
and whose `last_reminded_for` isn't already that date → `notify()` the assigned auditors **+
the Audit Admin** (`audit_reminder`, "Scheduled audit tomorrow"), then stamp `last_reminded_for`
(fires once per occurrence). No time-of-day on schedules; no external scheduler.

### Dead / removed — don't build on these

- `audit_submission_auditor` + `POST/DELETE /api/audit-submissions/:id/auditors` (the old
  per-occurrence auditor override) — endpoints still exist, **no caller**.
- `RECURRENCE_OPTIONS` const, the Excel questionnaire import, the fixed 5-pillar category enum,
  `OccurrenceAuditorsSection` in `AuditCapture`.

### Re-verified end-to-end (Sept 2026, 30/30, self-cleaning)

Full owner-described chain: BE lead creates the audit → appoints an Audit Admin **and
themselves** (both allowed) → that Audit Admin schedules it naming themselves schedule admin
→ adds auditors → `expected_count` = auditors **+ the Audit Admin** (they fill their own
scorecard) → occurrence stays `open` at 1/3 and 2/3 → **auto-closes only at 3/3**, combined =
mean of the submitted cards. A closed occurrence 409s a late start; an Audit Admin cannot
appoint further admins (403). Then re-verified after the close rework (22/22): request-close
404s, the **Audit Admin closes their own audit** (auditors + outsiders 403, BE lead still
can), no-shows excluded from the score, removal mid-audit auto-closes when everyone left has
submitted, removal does **not** close it while someone else is outstanding, and a removed
person's card doesn't cover a no-show. **Note `audit_submission.total_score` is the mean score
on the template's scale, not a sum** — a test that assumes a sum reports false failures.

**Gotcha when testing:** `isFullAuditAdmin` = `BE_LEAD_ROLES.has(role) || audit_global_admin`
row. A user's *job role* says nothing about their audit powers — pick negative-test users by
checking `audit_global_admin` / `audit_template_admin`, not by role.

### Verified earlier (dry runs, all self-cleaning)

Flexible templates across all 3 structures; recurrence date math (10 unit assertions);
multi-auditor workflow — **29-assertion end-to-end**: all-submit → auto-close with
`combined = avg(all)`; partial-submit → stays open → Audit-Admin request-close → BE force-close
with `combined = avg(submitted only)`, **missing auditor NOT scored 0**; `/audit-scores` +
`/audit-occurrences` reflect combined + counts; permission gates (auditor can't request-close,
schedule admin can't force-close). Also: caps, tier-4 Configure access, audit-trail deletions,
zone lock for tier-4.


## OPL classification, reviewer-edit, per-plant repository, recurring training, team analytics & notifications (this session)

**Migrations to run (all in `backend/sql/`, all additive / non-destructive except where noted):**
`opl_retire_knowledge_classification.sql` (WRITES: moves `Knowledge`/null → `Basic Condition`),
`opl_add_review_changes.sql`, `opl_repository_setting.sql`, `opl_training_schedule.sql`,
`notification.sql`. Backend restart required after each batch.

- **OPL classification is now 3 fixed values** — `Basic Condition` / `Troubleshoot` /
  `Improvement`. `Knowledge` retired everywhere (`CLASSIFICATIONS` const in `OPLList.jsx` is the
  single frontend source; backend default `'Basic Condition'`). There is no classification
  master table — this is a deliberate fixed business vocabulary, hardcoding the 3 is correct.
- **A submitter can never change an OPL's classification after submission** — the create form
  and drafts are fine, but once submitted only a reviewer changes it (via the Review & Accept
  panel). Enforced frontend (dropdown → static text) AND backend (`PUT /api/opl-details/:id`
  403s a classification change from `submitter_emp_id` when status ≠ `draft`).
- **OPL JH review is an inline "Review & Accept" panel** (replaced the old "Is this critical?"
  `ConfirmModal`), mirroring the inline-reject panel. The reviewer edits title / content /
  before+after descriptions / before+after images / classification / critical flag in the same
  action as approve. Changed fields are diffed into **`opl_details.review_changes`** (jsonb,
  `{field:{from,to}}`, merged across multi-stage) and shown to the submitter as a "Changed by
  the reviewer" box on their OPL card — same pattern as Kaizen/Abnormality `review_changes`.
- **No self-approval of OPLs.** `resolveEffectiveOplApprovers(oplRow, entityType)` = the stage's
  configured approvers MINUS the OPL's own `submitter_emp_id`; if that leaves nobody (submitter
  was sole approver, OR the OPL has no `jh_group_id` — e.g. a DMT member with no group filed it)
  it falls back to the plant's **BE-lead tier** (`beLeadEmpIdsForFactory`, also submitter-
  filtered). Used in `GET /api/opl-details` (`approver_emp_ids`) and the `jh_accepted`/
  `jh_rejected` auth check (hard 403 if `submitter === requester`). `resolveSubmitterJhGroup`
  now also resolves `factory_id` from `user_details.default_plant` when the submitter is in no
  JH group, so those OPLs get a plant home and can route. All resolved live — change routing and
  the reviewer moves on the next request.
- **"Completed Trainees" list + its Excel are reviewer-only** (`canSeeCompletions` = configured
  approver for that OPL, or BE-lead-tier). Auto-hides when routing changes. The completions
  export gained Department / DMT / Plant / full completion timestamp (backend join to
  `factory` / `module_groups` / `departments`), a 3-per-page modal, and a second **"Full status
  (done + pending)"** export (everyone assigned, with status).
- **Per-plant OPL repository scope** — new **`opl_repository_setting`** table (`factory_id` PK,
  `extra_factory_ids text[]`). A plant's "Standard Lessons → All" tab shows its own approved
  OPLs plus any OTHER plants a BE lead has opted into (grouped-by-DMT plant chips on both the
  OPL Standard Lessons tab AND Org Structure). Default (no row) = own plant only. `GET/POST
  /api/opl-repository-setting` (POST = BE_LEAD_ROLES/admin, own plant only, server-resolved).
  **`GET /api/opl-details` now returns `plant_code`/`plant_name`** (factory join) — the Standard
  Lessons plant filter was silently broken before (every lesson showed `'TVT'` from a missing
  `plant_name`), now id-based and real.
- **Kaizen plant filter was hardcoded `TVT/NPF/UPF/MPF`** → now built from `orgData.factories`,
  compared by `factory_id` (Kaizen `GET` returns `factory_code`). OPL "My Remaining" had its own
  hardcoded+broken plant/DMT/JH filters — **removed** (that list is already personal). Standard
  Lessons filters now reset when switching sub-tabs (All / My JH Group / My Remaining).
- **Recurring OPL training** — **`opl_training_schedule`** (`opl_id`, `interval_days` 1–3650,
  `target_jh_group_ids text[]`, `target_emp_ids text[]` = subset or empty for all,
  `start_date`/`end_date`, `is_active`, `last_run_at`) + **`opl_training_schedule_run`** (history).
  Created **per-OPL from a "Schedule" button on each repository card** (button shows the cadence
  once set; re-opens the same modal for edit). The top **"Recurring Training Schedules"** panel
  is a shared status/manage view (Run now / Pause / Resume / Delete / inline interval edit) for
  any incharge. **Firing: an in-process hourly `setInterval` sweep** (`sweepDueOplTrainingSchedules`)
  + a throttled fire-and-forget backstop at the top of `GET /api/opl-training/assignments` — NO
  external scheduler, NO new package; a missed window fires once and resumes (catch-up-safe for
  IIS app-pool recycling). `isOplTrainingIncharge` helper gates the endpoints.
- **"My Team" analytics tab** (`MyTeamAnalyticsTab` in `OPLList.jsx`, `GET /api/opl-analytics/
  jh-group?jh_group_id&from&to`) — a **JH-group-scoped** analytics view for the group's leader /
  module lead / routing OPL reviewer. Authorised set resolved live by **`jhGroupsLedOrReviewedBy`**:
  `jh_group.leader_emp_id`, `module_groups.module_lead_emp_id` (→ all JH groups under a module),
  `jh_groups_list.role ILIKE '%lead%'`, `user_details.role LIKE '%lead%'` + `jh_groups_list`
  membership, and `approval_routing` (`entity_type ~ '^opl'`, `approver_role='specific'`). Roster
  = `jh_group_membership_history` date-range overlap (mirrors the BE analytics tab). Per-member:
  OPL's submitted / approved / critical, trainings assigned+completed, completion %, unique
  lessons, an expandable per-lesson table (5/page, longest-pending first). Leaderboards
  (top / fewest submitters, ranked by OPL count). Member-table sort dropdown ("most trainings
  left" etc.), 5/page. Date presets (This/Last month, This year); **default range = month-to-
  date**. Two Excel exports (Team summary, Training status). Tab self-hides on 403 (probe query
  in `OPLList`). **Removed a removed-incharge instantly** (live check).
  - **DB TYPE DRIFT — important:** `approval_routing.jh_group_id` is `uuid`; `jh_group.id` and
    `jh_groups_list.jh_group_id` are `text` (uuid-strings). Column-to-column joins between them
    fail (`operator does not exist: uuid = text`) — cast **both sides `::text`**. Parameter
    comparison (`WHERE jh_group_id = $1`) works fine (pg infers). This crashed the whole
    `jh-group` endpoint until every such join was cast.
- **In-app notifications** — **`notification`** table (`recipient_emp_id`, `kind`, `title`,
  `body`, `opl_id`, `is_read`, …). A **bell** in `AppShell` (sidebar footer + mobile bottom bar)
  for **every** user, unread badge, `useNotifications` polls every 15s (+ invalidated on every
  workflow mutation — see the this-session section), `POST /api/notifications/
  :id/read` + `/read-all`. **`POST /api/opl-training/remind`** — an incharge (leads/reviews the
  target's group, or `isOplTrainingIncharge`) nudges a team member about training assigned but
  not completed; creates one `training_reminder` per lesson, refreshes rather than duplicates a
  still-unread one. Surfaced as "Remind" buttons + checkbox multi-select in the My Team expanded
  lesson table.
- **Critical OPL marker = amber `Star`** (matching the repository tab) everywhere it appears in
  the analytics — briefly tried a green medal / red octagon, owner wants it consistent with the
  repo.
- **`OnePointLessonSheet` completion gate changed** — was "scrolled to end OR 7s elapsed"; now
  **"≥5s elapsed AND scrolled to the bottom"**, with the scroll condition auto-satisfied for a
  body too short to scroll (48px tolerance, `requestAnimationFrame` measure) so phone users are
  never stuck.
- Standard Lessons default page size **3 → 5**.

## Portal shell, dead-code purge, offline hardening & fixes (this session)

**Portal / super-app**
- `pages/ModuleSelect.jsx` (`/select-module`) is the post-login chooser. TPM active; DMT built
  but tile disabled (see top of file); Training not built.
- The `server.js` split into `routes/core.js`/`routes/tpm.js`/… was never done — it stayed one
  monolithic file. DMT was added as a delimited section at the end of `server.js`, not a router.

**Deleted (dead code — build verified after each)**
- Whole `frontend/src/lib/shared/` folder (`cors`, `csv`, `edge`, `file-validation`,
  `import-templates`, `machine-validator`, `row-hash`, `translation`, `validation-context`,
  `worker-validator`) — Edge-Function-era, imported by nothing live.
- `lib/supabase.js` (fake stub), `lib/kaizen.js`, `lib/pinSession.js`, `types/database.js`,
  `test/setup.js`, all `*.test.js/jsx` (~24), `components/JhGroupMultiSelect.jsx`,
  `components/LanguageSwitcher.jsx`, `components/ui/card.jsx`, `hooks/useJhGroupSelector.js`,
  `hooks/useLanguageSwitch.js`.
- The content-translation feature: `hooks/useTranslateContent.js`, `hooks/mdm/useTranslationUsage.js`,
  `components/patterns/TranslateControl.jsx`, `POST /api/translate`, `api.translate`. Dead.
- The factory-module feature: `hooks/mdm/useFactoryModules.js`, `GET/PATCH /api/org/modules`,
  `api.getModules`/`toggleModule`. `visibleNav` simplified (no `enabled`/`moduleKey`).
- `pages/kaizen/KaizenDetail.jsx` + `/kaizen/:id` + old `/api/kaizen` + dead `useKaizen.js` hooks.
- `package.json` (both): removed `typescript`, `tsx`, `@types/*` — backend devDeps now `{}`.
- `dist/` + `frontend/dist/` build folders. CLTI: Home stat card, mock `modules` rows, i18n
  `modules.keys.*` phantom labels (`clti`/`meetings`/`jh_audit`/`dashboards`/`content_translation`).
  RCA has never existed anywhere.
- Home page: the 3 "Quick Actions" buttons → one line "Functions available: OPL, Kaizen,
  Abnormalities and Audits"; Overview is now 3 stat cards (no CLTI).

**DB — 12 empty, unreferenced tables to DROP** (SQL handed to owner; the auto-mode classifier
blocks `DROP`/`INSERT` via psql, so a Claude session cannot run it — give the SQL):
`dmt`, `pillar`, `worker_profile`, `worker_factory_membership`, `worker_group_membership`,
`opl_training`, `opl_training_event`, `opl_intended_audience`, `mdm_audit`, `translation_usage`,
`kaizen`, `factory_module`. All old-schema `uuid`-keyed leftovers; no kept table FKs them.
**KEEP `modules`** (4 rows SFM/RFM/Labels/Flexibles — read live by `GET /api/org/module-names`
→ `useOrgStructure`).

**Offline / IIS**
- Fully offline-capable: static frontend, local Postgres, relative `/api` calls, fonts in
  `public/fonts/`, images stored as base64 data URIs in the entity row (`POST /api/upload` just
  echoes the base64 — its internet `picsum.photos` fallback was removed; now 400s on empty).
- Still to do for IIS (blocked on the prod hostname): URL Rewrite + ARR reverse-proxy for
  `/api/*`, run Node as a Windows Service (also fixes "backend randomly stops"), lock CORS.
- **"Backend keeps stopping" was diagnosed**: a 9-hour-old orphaned `node --watch server.js`
  from an earlier Claude session, restarting on every file save and fighting the owner's own
  `npm start` for port 3000. Kill EVERY stray `node`/`npm` (not vite) before the owner starts
  theirs — `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` shows command lines +
  ages. Two un-killable zombie node PIDs remain until a reboot (harmless, not on any port).

**Fonts** — `docs/design/fonts.css`: only the **5 × 400-weight** woff2 exist in `public/fonts/`.
The old 500/600/700 `@font-face` rules pointed at files that don't exist, so bold text silently
fell back to a Windows system font (the "different font" bug). Fixed: one 400 face per script,
`font-weight: 400`, browser synthesises bold uniformly. Do NOT re-add 500/600/700 `@font-face`
unless the actual woff2 files are added to `public/fonts/`.

**Notifications**
- `useNotifications`: poll 60s → **15s**, `refetchOnMount: 'always'`, `refetchIntervalInBackground:
  false`. Every OPL/Kaizen/Abnormality workflow mutation `onSuccess` now also invalidates
  `['notifications']` → the panel updates the instant your own action completes.
- `NotificationBell.openItem`: clicking an actionable (`*_pending`) notification now ONLY
  navigates — it is NOT marked read and NOT dismissed. It stays bold + counted until the server's
  `resolveNotifications()` deletes it when the action is actually completed. Info kinds
  (`*_approved`/`*_rejected`/`*_closed`) still mark-read + dismiss on click.

**`review_changes` ("Changed by the reviewer") visibility** — OPL card / Kaizen sheet /
Abnormality detail modal now gate the diff box with `canSee*ReviewChanges(item)`:
BE-lead tier (always) OR submitter OR the item's routing incharges/stage approvers OR its
`jh_group.leader_emp_id` OR the owning `module_groups.module_lead_emp_id` (Abnormality also:
the assignee). Hidden from plain repository browsers. **Client-side gate only** — `review_changes`
is still in the API response (same as the reviewer-only "Completed Trainees" list).

**Kaizen UI**
- "Standard Kaizens" → **"Kaizen Repository"** (tab, sheet title "Kaizen Sheet", search
  placeholder, empty state); sub-tab "All Standard Kaizens" → "All".
- Review status filter row: no "All" tab, per-tab count badges, mobile 2-row grid / desktop
  single row, short labels on mobile. "Submitted" tab → **"Validation"**; card `StatusBadge`
  "Submitted for confirmation" → **"Submitted for Validation"**.
- Cards: "Stage X of Y" chip + amber "With <name>" reviewer chip (mirrors OPL). Tap-to-zoom
  photo lightbox (`lightboxImage` state). Implementation outcome (savings + notes + date) shown
  on Repository cards + sheet.
- Filter dropdowns "All DMTs/Plants/Groups/Categories" → "All"; Category always lists all 6.
- Plant filter row only shows when `kzVisiblePlantIds.size > 1`; the editable "Show plants"
  chips were removed from the Kaizen Repository tab (governed on Org Structure now).
- All Repository filters reset on sub-tab switch (`useEffect` keyed on `stdTab`).

**Abnormality**
- New **`abnormality_repository_setting`** table (self-healing schema, mirrors
  `kaizen_repository_setting`) + `GET/POST /api/abnormality-repository-setting`. Org Structure's
  **"Repository Plant Scope"** panel (`OrgStructure.jsx`) now drives all three modules (OPL /
  Kaizen / Abnormality) — one row each, shown for whichever the caller can edit; rows render a
  loading/error placeholder rather than vanishing.
- Repository tab: plant filter hidden unless multi-plant, "Show plants" chips removed (Org
  Structure governs it), sub-tabs centered, "All Plants" → "All".
- Mobile pass: tab bar (stacked icon/label), review status filter (2-row grid + short labels),
  repo filter dropdowns 2-up grid.
- "Assigned to Me" scope tab kept as-is (a rename to "My Remaining" was tried then reverted).

**Shared `ListPager`** (`components/patterns/ListPager.jsx`) — the one pagination footer for
every OPL/Kaizen/Abnormality review + repository list. Page-size picker (`Per page` 3/5/10…) +
`from–to of N <noun>` total + windowed page numbers (collapses past 7 pages).

## DMT module (fully migrated from the old Supabase/TS build — Sept 2026)

The old standalone `dmt/` folder (Lovable app: React+TS+Vite+Supabase) was ported into this
stack and **deleted**. DMT is now a first-class module of this app.

- **Frontend:** `frontend/src/dmt/` — plain JS, own sidebar (`dmt/DmtShell.jsx`), routes
  `/dmt/*` in `App.jsx` (own route tree, NOT inside the TPM `AppShell`). **Screen inventory below
  is stale as of the later "shared-table unification" session — see that section for the current
  shape.** As originally built: Dashboard, Planner, KPI Master, KPI Entry, KPI Trends, My View,
  Task Board, Meetings + Meeting Workspace, Meeting Templates, Decision Log, Compliance, PM
  Schedule, PD Cycle, Admin (Departments, Analytics, Task Overview, KPI Charts, Audit Log).
  **My View no longer exists** (folded into Dashboard's "My Dashboard" widgets). **Departments /
  KPI Master / Meeting Templates / Analytics no longer exist as separate pages** (combined into
  `/dmt/organisation`). No "DMT Users" screen — staff accounts are the shared `user_details` /
  MDM People roster.
- **Backend:** one delimited section at the END of `backend/server.js` (`// 11. DMT …`). A
  table-driven CRUD registrar (`DMT_RESOURCES`, ~30 resources → `/api/dmt/<resource>`
  GET-list / GET :id / POST / PATCH / DELETE) + named ops: `/api/dmt/me`, `/my-departments`,
  `/my-task-groups`, `tasks/:id/{status,due-date,fields,comment}`, `pd-jobs/:id/{stage,spawn}`,
  `kpi-entries/upsert`, `planner-items/clear-completed`, `/audit`.
- **Auth/permissions:** shared `x-worker-id` header. TPM `user_details.role` → a DMT tier via
  `DMT_ROLE_MAP`, **named directly after the real TPM role that reaches each level** (the old
  `team_member`/`department_head`/`factory_manager`/`super_admin` labels were removed — this app
  has exactly 9 real roles, and pretending there was a separate 4-tier DMT role system alongside
  them was confusing). Current ladder low→high: `jh_lead` (jh_lead/operator) <
  `module_lead` (module_lead) < `leadership` (leadership) < `be_lead` (it_lead/be_lead/admin —
  admin is a defensive fallback, not a real role today). Guards: `dmtGuard(minTier)`,
  `dmtTierAtLeast(tier, min)`, frontend mirror `dmtApi.js`'s `DMT_TIERS`/`dmtTierAtLeast`. Purely
  a rename from the old tier words to real-role words — access levels themselves are unchanged.
  `shop_floor`/`task_only` from the old app are unused.
- **Data:** 30 `dmt_`-prefixed tables in `superdb` (schema: `backend/sql/dmt_schema.sql`,
  authoritative + idempotent). All former `profiles` FKs point at `user_details(emp_id)` (text).
  Per-user tables (`dmt_planner_items`, `dmt_my_view_items`) are owner-scoped server-side
  (`owner: 'emp_id'` in the resource config). `dmt_tasks` LIST is visibility-scoped
  (`scoped: true`): you see public tasks + your own + your group's; `?scope=all` (leadership+)
  is the Admin Task Overview escape hatch.
- **Change logging:** `dmtAudit()` writes to `dmt_audit_logs` on create/update/delete for the
  `DMT_AUDITED` set + the named task/PD ops; viewable at `/dmt/admin/audit`.
- **The 6 former Supabase RPCs** are plain route logic now (task status/due-date/fields, PD
  stage/spawn, get-user-departments) — no DB functions. Kept as DB triggers: generic
  `updated_at`, PD job-number assignment, PD comment stage-stamp.
- **Deferred (low value, not built):** invitee-department label on Meeting Templates; deepest
  Analytics per-user drill-downs / MoM trends / PDF (uses xlsx instead); the "dispatch dept can
  enter today's KPIs" nicety may be simplified. Everything else has parity.

## Screen flexibility / mobile (structural — read before touching layout)

The old "I have to zoom out on my phone" symptom was **one structural bug, not many page
bugs**: `AppShell`'s content column was `flex-1` with no `min-w-0`. A flex/grid ITEM defaults
to `min-width: auto`, so it refuses to shrink below its content's intrinsic width — one wide
table / long unbroken string / fixed-width block stretched the entire shell past the viewport
and the browser zoomed the page out. **Measured at 375px with a 900px element present: shell
896px wide, 521px of overflow, 30 elements pushed off-screen. With `min-w-0`: 0 overflow.**

The rules now in place — keep them:

1. **`src/index.css` guardrails**: `html,body { max-width:100%; overflow-x:hidden }`,
   `#root { min-width:0; max-width:100% }`, `overflow-wrap:anywhere` on `p/li/label/h1-h6`,
   `img/svg/video/canvas { max-width:100% }`, `th { white-space:nowrap }`.
2. **`overflow-wrap:anywhere` must NOT be applied to `td`/`th`.** It also drives min-content
   sizing, so a multi-column table collapses each column to one character and renders text
   **vertically** (this actually happened to the Audit Trail table and was caught by
   measurement, not by eye). Data tables instead keep natural widths and scroll.
3. **`min-w-0` on the flex chain**: `AppShell`'s content column + `<main>`, and
   `CaptureColumn`. Without these the guardrails only *clip* the damage.
4. **Horizontal scroll is a safety net, not a design.** Owner rejected side-scrolling
   tables and tab strips on phones (Sept 2026). The two patterns to use instead:
   - **Wide tables → labelled cards under `sm`.** `<div className="space-y-2 sm:hidden">`
     of `<button>` cards (heading + a 2-col `<dl>` of label/value) alongside
     `<div className="hidden sm:block …">` holding the real `<table>`. Applied to the
     By-JH-Group tables in OPL / Kaizen / Abnormality analytics, and the **Audit Trail**
     log (chip + timestamp header row, then audit · zone, actor, free-text detail — all
     `break-words`). Keep both branches fed from the same array so they can't drift.
     Narrow (≤3 col) tables stay as tables.
   - **Tab strips → a `grid-cols-3` grid of short labels under `sm`**, the full-label pill
     row from `sm` up (`sm:hidden` / `hidden sm:flex` pair). Every tab list carries both a
     `label` and a `short`. Matches the review-status filter rows in the List pages.
   The one genuine exception that still scrolls, correctly: the **A4 OPL sheet**
   (`min-w-[700px]`, a fixed print layout — verified scrolling inside a 338px host).
5. **`DialogContent`** is `w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto` with
   `p-4 sm:p-6` — long dialogs scroll internally instead of pushing their footer buttons
   off-screen. Verified with Approval Routing at 375px (351px wide, scrolls, buttons reachable).
6. **Button rows on cards need `flex-wrap`**, not `shrink-0`. The OPL Repository card's
   View Sheet / Push Training / Audit row ran ~70px past a 375px screen and its last button
   was unreachable — invisible to grep, found only by measuring.

7. **Minimum readable size on a phone — the type floor.** The design tokens say it plainly:
   `sm`=14px is the **"analysis floor"**, `2xs`=11px / `xs`=12px are **"Latin meta only"**.
   The enforced rule now:
   - **≥12px (`text-xs`)** for anything sentence-case a user reads: card metadata
     ("Submitted by…", "JH Group:", "Plant:"), filter-pill labels, section-tab labels,
     form field labels, stat-tile captions.
   - **≥14px (`text-sm`)** for the values on analytics cards.
   - **11px (`text-2xs`)** only for uppercase chips, count badges and photo overlay captions.
   - **Below 11px: nothing**, except the numeric notification bubble.
   **`text-3xs` was NOT a defined token** yet was used 45× — it generated no CSS, so those
   elements silently inherited whatever their parent was. All 45 replaced with `text-2xs`
   (OPLList 20, KaizenList 15, OnePointLessonSheet 7, NotificationBell 3). Don't reintroduce
   it; there is no size below `2xs`.
   Measured fixes on **Kaizen Reviews @375px**: filter pills 10px→12px, count badges
   10px→11px, BEFORE/AFTER photo captions 9px→11px, card metadata row 11px→12px. The 9px
   band went 6 elements → **0**; the 12px band 23 → **43**.
   And on **AuditCapture @375px**: the two score panels (combined-grade / your-scorecard) had
   their per-category rows at 11px and scorecard rows at 12px — bumped to 12px labels + 14px
   `font-semibold` values, laid out as a 2-col grid; photo captions 11px→12px. After: nothing
   under 12px on that screen except the notification badge.
8. **An empty analytics page must say why.** The date range defaults to *month-to-date*, so
   on the 9th of a month with no submissions yet every chart legitimately reads zero and
   looks broken. All three analytics tabs now show an amber banner naming the exact range
   plus a **"Show last month"** button (verified: Abnormality went 0 → 8 on one tap).

**How to verify (do this, don't eyeball):** run the app, emulate 375px, and for each
route/tab count elements whose `getBoundingClientRect().right > clientWidth` that are *not*
inside a scrollable ancestor. Zero = flexible. Note the guardrail CLIPS overflow, so
`documentElement.scrollWidth` alone reports 0 and lies — temporarily set html/body/main
`overflow-x:visible` while measuring. Login is bcrypt so seed `localStorage.tpm_session`
(shape in `src/lib/auth.js`) on the local dev server to reach the pages.

**Swept clean at 375px and 768px** (Sept 2026): Home, Select Module, OPL (Submit / Reviews /
Repository / Analytics + all 6 analytics sections), Kaizen (Submit / Reviews / Repository /
Analytics + all 9 sections), Abnormality (Report / Reviews / Repository / Analytics), Audits
(My / All / Scores / Configure / Audit Trail), Org Structure (+ Approval Routing dialog),
MDM People / Machines / Subsections. Desktop layout re-verified unchanged.

## Draft editing, self-approval, JH-leader filing fix, My Team parity, machine/DMT fixes (this session)

- **Drafts are now editable, on all three modules.** OPL/Kaizen/Abnormality drafts previously
  had no edit path — only "Submit for Review" as-is. Each now has an **Edit** button (submitter
  only) that opens an inline form, plus a **Draft** tab in "My Submissions" so people can find
  them. Backend: OPL reuses `PUT /api/opl-details/:id` (no-action content edit, guarded to
  `submitter_emp_id === x-worker-id` **and** `status === 'draft'`, else 403/409). Kaizen/
  Abnormality got a new `action: 'edit_draft'` (same guard) with an optional `submit: true` flag
  that also flips status to `proposed`/`pending_review` and fires the normal review-pending
  notification in one call — don't build a second "submit this draft" endpoint, this is it.
- **A JH leader / routing incharge may now review and approve their OWN submission** (owner
  direction, Sept 2026) — themselves, or a co-approver on the same stage. **Kaizen and
  Abnormality already worked this way** (their approver resolvers never excluded the submitter);
  only OPL blocked it. Fixed by removing the submitter-exclusion in
  `resolveEffectiveOplApprovers` (now returns the stage's configured approvers as-is; falls back
  to BE-lead tier only when the stage has **no** configured approver at all) and deleting the
  hard "you cannot review your own OPL" 403 in the `jh_accepted`/`jh_rejected` handler. Frontend:
  removed the `&& !isMySubmission(detail)` guard hiding the Review panel on OPLList. A plain
  operator still can't self-approve — this only matters when the submitter IS a configured
  approver, which is only ever a JH leader/routing incharge.
- **JH-leader filing bug, fixed at the source.** `resolveSubmitterJhGroup` (server.js) only
  checked `jh_groups_list` membership, not `jh_group.leader_emp_id` — so a JH leader who leads a
  group but isn't *also* listed as an ordinary member (the normal case) was treated as having no
  home group, forcing them through the "pick a filing team" flow meant for engineering/BE-admin/
  no-group submitters. Fixed to fall back to `jh_group.leader_emp_id` (mirrors the existing
  `resolveUserJhGroupId` helper). Same fix mirrored on the frontend (`hasNoJhGroup` in
  `OPLList.jsx`/`KaizenList.jsx`/`AbnormalityList.jsx` now also checks
  `orgData.jhGroups.some(g => g.leader_emp_id === me)`). Affects all three modules identically.
- **Kaizen: implementation cost + team members, one-time benefit units.** `kaizen_details` grew
  `implementation_cost numeric` (optional, rejects negative/non-numeric) and
  `team_member_emp_ids text[]` (optional, up to 3, set at `submit_implementation`) — both shown
  on Reviews-tab cards, the confirm-close validation panel, and the repository detail sheet.
  **`SAVINGS_UNITS` changed from `Rs/annum`/`Units/annum`/`Hr/annum`/`Others/annum` to
  `Rs`/`Units`/`Hr`/`Others`** (one-time benefit, not recurring — owner direction) — the field is
  now labelled "One-Time Benefit" everywhere (`FIELD_LABELS`, the form, the diff box, the
  detail sheet). Old Kaizens saved with an `/annum` unit still display their stored text as-is;
  not backfilted.
- **Kaizen "Pending" split into its real sub-stages** on the My Team tab — `kaizen_pending` is
  gone as a single number; replaced by `kaizen_proposed` / `kaizen_approved_for_implementation`/
  `kaizen_submitted_for_confirmation`, each its own stat card, member-table column and Excel
  export column. Abnormality's My Team still uses one combined `abn_pending` — only Kaizen's was
  asked to be split.
- **"My Team" analytics, generalized from OPL to Kaizen and Abnormality.**
  `jhGroupsLedOrReviewedBy(empId, entityPrefix='opl')` now takes an `entityPrefix` param so the
  same leader/module-lead/list-role/named-routing-approver resolution logic serves all three
  modules — pass `'kaizen'`/`'abnormality'` for their routing-approver check (the `entity_type ~
  '^' || prefix` match), leave default for OPL. New endpoints `GET /api/kaizen-analytics/
  jh-group` and `GET /api/abnormality-analytics/jh-group` (identical roster/date-range pattern to
  OPL's), with module-appropriate per-member fields (Kaizen: submitted/confirmed-closed/pending
  sub-stages/rejected/savings-total-mixed-units; Abnormality: reported/closed/pending/red-tag)
  instead of OPL's training-assignment pair (neither module has a training mechanism). Frontend:
  `KaizenMyTeamAnalyticsTab.jsx`/`AbnormalityMyTeamAnalyticsTab.jsx`, wired as a `myteam` mainTab
  next to Analytics, self-hiding via the same probe-query-on-403 pattern as OPL.
  - **Ranking-card mobile fix (apply this pattern to any future narrow multi-stat table)**: a
    `table-fixed` table with short numeric columns (e.g. "Submitted"/"Closed") visually runs
    the header words together on a phone even with `[&_th]:whitespace-normal` — the real fix is
    a `sm:hidden` card list (rank/name/stat inline, e.g. "8 submitted · 4 closed") alongside
    `hidden sm:table` for the real table, same split already used for the bigger Team-members
    list. Applied to both new ranking cards.
- **Audits admin UI polish**: the "Add a Global/per-audit Admin" search box now sits *above*
  the appointed-admins list (was below — meant scrolling to find it) in both
  `GlobalAdminsSection` and `TemplateAdminsSection`. The per-schedule auditor picker now also
  excludes the schedule's own Audit Admin (`schedule.admin_emp_id`) — they already count toward
  the auditor cap, but weren't excluded from the "add auditor" search, so they showed up as if
  addable again. Auditor list is now `sm:hidden` cards / `hidden sm:table` (was a bare table that
  clipped its own remove button off-screen on a phone). Remove buttons switched from an `X` icon
  to `Trash2` (auditor list only, other `X` usages elsewhere untouched).
- **Training reminder was completely broken** (`POST /api/opl-training/remind` 500'd every time)
  — the `INSERT INTO notification` reused one parameter (`$2`) for both `entity_id` (`text`) and
  `opl_id` (`integer`), which Postgres can't type-unify ("inconsistent types deduced"). Fixed by
  casting each usage explicitly (`$2::text` / `$2::int`). Any future notification insert that
  reuses a param across differently-typed columns needs the same per-usage cast.
- **Machines page (`frontend/src/pages/admin/mdm/Machines.jsx`) was crashing on every load** —
  `allGroups.flatMap((g) => g.areas)` with no `?? []` fallback; since no `jh_group` row actually
  carries an `areas` array (that shape was never wired up in `useOrgStructure`), `flatMap` pushed
  `undefined` into the list and the subsequent `.map(a => ...a.id)` threw. Fixed with `?? []`.
  While in there, found and fixed two more real bugs: **`useUpdateMachine`/`useSetMachineActive`
  both called `api.createMachine`** — Edit and Deactivate looked like they worked but silently
  created a duplicate machine (or did nothing) instead of updating/deactivating. Added real
  `PUT /api/machines/:id` and `PATCH /api/machines/:id/active` endpoints + matching
  `api.updateMachine`/`api.setMachineActive` client methods, and fixed the hooks to call them.
  Also: `GET /api/machines` now accepts `include_inactive=true` (the "Show inactive" toggle
  silently did nothing before — the backend never returned inactive rows to filter) and joins
  `jh_group.name` (the group header was showing the raw group UUID). **Known gap, not yet
  built**: `machine` has no `machine_type`/`area_id` columns at all — the Area/Type filters and
  the `area` table (unrelated to `jh_group`, keyed by `department_id` instead, currently 0 rows)
  are placeholders with nothing behind them yet. Owner is deciding machine-assignment rules
  separately — don't build Area/Type schema ahead of that.
- **DMT is enabled** (`ModuleSelect.jsx`) — no longer "Locked"; `handleDmtClick` navigates to
  `/dmt` and the tile has the same active styling as TPM (just blue instead of amber).
- **Frontend-only display rename, module-picker screen only**: TPM → **"Lumos"**, DMT →
  **"CloseLoop"** on `ModuleSelect.jsx` (card titles + "Open ... Workspace" button text). Nothing
  else renamed — not routes, not variables/component names, not the database, not the text
  inside either app's own screens. Owner will give separate direction for renaming inside the
  apps and in the backend; don't extend this rename anywhere else until then.
- **Idle-logout warning window widened 60s → 5 min** (`frontend/src/lib/sessionTimeout.js`,
  `WARN_MS`). The 30-minute idle-logout itself is unchanged — only how much warning people get
  first.
- **Departments expanded 4 → 11** (`departments` table): added EHS, Business Excellence,
  Forwarding, Pre-Press & PD, Dispatch, HR, Finance (Materials already existed, not duplicated).
  Groundwork for KPI/machine-assignment work — the assignment rules themselves are not decided
  yet (see `DMT_DECISIONS.md`).
- **`DMT_DECISIONS.md`** (new, project root) — running, append-only log of owner decisions
  specifically about the DMT module (one entry per decision, in order, never rewritten). Add new
  DMT decisions there as they're made instead of re-deriving "what did we already decide" from
  chat history.
- **Sample/demo data**: `backend/tools/seed_demo_workflow_items.mjs` — creates one dummy
  OPL/Kaizen/Abnormality per status (draft through terminal) for both a JH Leader (333333) and
  an Operator (222222), title/description prefixed `[SEED]`. Re-run any time to reset to a clean
  set; `... clean` removes them. Its "approved" dummy OPLs were inserted directly at that status
  (not through the real approve action), so they carry **no** `opl_training_assignment` rows —
  expected, not a bug; real approvals still auto-assign training correctly.

## DMT: shared-table unification, Organisation page, configurable Dashboard (this session)

Full decision-by-decision detail lives in `DMT_DECISIONS.md` (entries 7–22) — this section is
the code/architecture summary. **Departments were expanded 4 → 11 → 9** across sessions: see
`DMT_DECISIONS.md` #5 (4→11) and #17 (11→9, five unused ones hard-deleted: Human Resources,
Stores, Product Development, Dispatch, Forwarding).

- **`dmt_department` and `dmt_factory` no longer exist** — both were merged into the shared
  `departments`/`factory` tables (backups kept as `dmt_department_backup`/`dmt_factory_backup`,
  not used by the app). DMT does not have its own separate plant identity any more: an earlier
  attempt to give it one (a distinct "ITC-PPB" row in `factory`) was reversed — all of DMT's
  data (meetings, meeting templates, task groups, PM machines, PD jobs, KPI charts, departments)
  now lives under **TVT** (`factory.id = '1'`), same as the rest of the app. Don't reintroduce a
  DMT-specific factory concept; a DMT user's plant is resolved exactly like everywhere else in
  the app — `user_details.default_plant` → `resolveFactoryId()` → `factory.id`.
- **`dmtUserFactoryId(dmtUser)`** (`server.js`, right above `dmtResolveUser`) is the one helper
  for "which plant does this DMT caller belong to" — wraps the existing `resolveFactoryId()`.
  Any new DMT resource that's meant to be plant-scoped should use it, following the
  `factoryScoped: true` pattern below.
- **`factoryScoped: true`** on a `DMT_RESOURCES` entry (currently: `department`,
  `meeting-templates`) makes the generic CRUD registrar enforce plant isolation on **every**
  verb, server-side, not just hide-in-the-UI: LIST filters to the caller's own `factory_id`;
  CREATE force-sets `factory_id` from the caller's own plant (ignores whatever the client sent);
  GET-one/PATCH/DELETE 403 with `'Not your plant'` if the row belongs to a different plant.
  `factory_id` is also now excluded from every resource's PATCH body, globally, not just
  factory-scoped ones — it's set once at creation, never client-editable after. This is what
  fixed "a BE Admin from one plant could see/edit another plant's departments," a real gap left
  over from the `dmt_department` merge (that merge matched rows by name across plants with no
  plant-scoping at the read layer at all). **Not yet applied** to `meetings`, `task-groups`,
  `pm-machines`, `pd-jobs`, `kpi-charts` — those still trust a client-supplied `factory_id`
  (harmless today since there's only one plant's worth of DMT data, but revisit if DMT ever
  needs to isolate a second plant's data from TVT's).
- **`dmtApi.myFactory()`** (`frontend/src/dmt/lib/dmtApi.js`) resolves the caller's own plant
  from `/api/dmt/me`'s `factory_code` (in turn from `dmtUserFactoryId`), **not** a hardcoded
  plant code. `GET /api/dmt/me` now also returns `factory_name`/`factory_code`. Used to show the
  plant name read-only at the bottom of the DMT sidebar (`DmtShell.jsx`) — there is no "Edit
  Factory" UI anywhere in DMT any more (removed from the old Departments page; renaming a whole
  plant doesn't belong inside one module's settings screen).
- **`/dmt/organisation`** (`DmtOrganisation.jsx`) is a tabbed page combining **Departments / KPI
  Master / Meeting Templates / Analytics** — each tab just renders the pre-existing page
  component as-is (own data-fetching, own internal tier gates), no logic duplicated. The old 4
  routes/nav entries are gone; old URLs `Navigate` here automatically. **Task Overview and KPI
  Charts stay separate on purpose** (owner request) — don't fold them in. **Audit Log also stays
  separate** — its visibility needs restricting to a few people specifically, not yet built.
- **Department reordering is drag-and-drop**, not a typed number. The manual "Display order"
  field is gone from the Add/Edit Department dialog; `display_order` is still the underlying
  column, just set by dragging rows (`GripVertical` handle, native HTML5 drag events — same
  pattern as OrgStructure's stage-reorder builders) and auto-saved.
- **KPI Master's "Hidden" toggle (`is_hidden_from_trends`) was removed.** It only ever affected
  the KPI Trends page and sat confusingly next to "Active" (which already gates a KPI's
  visibility everywhere: Dashboard, KPI Entry, Analytics, Charts, Meetings). One rule now:
  **Active** = admin-controlled master on/off, used everywhere, full stop. The column still
  exists in the DB (harmless, unread) — don't wire new UI to it.
- **Dashboard + My View merged.** The separate `/dmt/my-view` page is gone (old links
  `Navigate` to `/dmt`). Its pinned-KPI-chart idea is now one of **six widget types** on a
  new **"My Dashboard"** configurable section that sits above the (unchanged, always-visible)
  full department KPI table:
  1. **KPI trend chart** — one KPI, target line + MTD (the old My View pin, generalized).
  2. **Multi-KPI chart** — several KPIs on one chart, line/bar/composed, reuses
     `ComposedKpiChart` (the same renderer Admin → KPI Charts uses).
  3. **Saved chart** — pulls in a chart already built on Admin → KPI Charts.
  4. **KPI status card** — red/amber/green counts, department-scoped.
  5. **Open task counter** — department-scoped.
  6. **Open task list** — department-scoped.
  - **`dmt_dashboard_widgets`** (`emp_id`, `widget_type`, `config jsonb`, `display_order`)
    replaced `dmt_my_view_items` (old pins carried over as `kpi_chart` widgets in the migration,
    `backend/sql/dmt_dashboard_widgets.sql` — safe to re-run). Server-side `dmtValidateWidget()`
    enforces the department-scoped widgets' authorization rule: a regular user can only build one
    for their **own** department; only `leadership`+ (BE Lead/Leadership) can pick a
    different department or "all departments" — chart widgets (KPI-scoped, not
    department-scoped) have no such restriction, matching the old My View pin's openness.
  - **Widget reorder controls (▲▼✕) live in their own row above each card**, not
    absolutely-positioned on top of it — an earlier version overlaid them on the widget content
    and they visually collided with a chart's own RAG badge. Apply the same pattern (a slim
    control strip, never an overlay) to any future per-item admin controls on a card grid.
- **The fixed department KPI table (Dashboard) is now a card grid, 5 per row**, not a `<table>`:
  colour-tinted background (rose/amber/emerald) by RAG status, the actual value shown large and
  bold, target/MTD as secondary text. Also gained: a **department filter dropdown** (view one
  department or all), and a **personal eye icon per card** — `dmt_hidden_kpis`
  (`emp_id`+`kpi_id`, unique) lets anyone hide a KPI from just their own view; everyone sees
  every KPI by default, and hiding one never affects anyone else. A "N hidden — show" toggle per
  department reveals them again without unhiding. The single-day date picker for this table now
  **defaults to the most recent day that actually has an entry**, not blindly "yesterday" — it
  used to show a blank/`—` day right next to a chart correctly showing a recent real value,
  purely because nobody happened to log data on the literal previous calendar day.
- **"Add widget"'s KPI picker is grouped by department**, with a separate **department filter
  dropdown** on top of the grouping once there's more than one department to filter by — for
  the KPI-trend-chart and multi-KPI-chart widget types. The filter only narrows what's
  *displayed*; it never un-checks an already-selected KPI from a different department in the
  multi-KPI picker.
- **Demo data**: `backend/tools/seed_demo_ehs_kpis.mjs` (10 KPIs, 10 days each) and
  `seed_demo_be_kpis.mjs` (6 KPIs, 4 days each) — same self-cleaning, re-runnable pattern as the
  other `seed_demo_*` scripts (`... clean` removes just what that script made). Dummy data only,
  clearly not real readings — don't mistake it for production numbers.

## Carried tech debt (known, not yet fixed — don't rediscover, don't assume fixed)

- **No test runner, no test files.** Every `*.test.js/jsx` was deleted this session (they had
  no runner and many imported since-deleted modules). `npm run build` is the only gate. If tests
  are ever wanted again it's a fresh Vitest setup (`environment: 'jsdom'` + a `test` script).
- ~~**Mobile compatibility is partial.**~~ **Resolved** — see "Screen flexibility" below.
- **`approval_routing.jh_group_id` is `uuid` while `jh_group.id` / `jh_groups_list.jh_group_id`
  are `text`** — column-to-column joins need `::text` on both sides (param comparison is fine).

- **`frontend/src/lib/auth.js`'s `roleAtLeast`/`ROLE_ORDER` ladder is missing several real
  roles** (`jh_leader`, `dmt_member`, `dmt_leader`, `pillar_champion`, `be_team`, `apprentice`,
  `on_roll`, `admin` all absent) → `roleAtLeast(role, minimum)` with any of those wrongly returns
  true. `useKaizen.js`/`useOPL.js`/`useAbnormalities.js`/`App.jsx`/`navConfig.js` import it;
  `OPLList.jsx`/`KaizenList.jsx`/`AbnormalityList.jsx`/`OrgStructure.jsx` use inline role-string
  checks instead and aren't affected. Client-side *display* only (server never trusts this).
  (`lib/shared/worker-validator.js`, the other ladder, was deleted with the rest of `lib/shared/`.)
- `frontend/src/lib/auth.js`'s session shape is **flat** (`session.role`, `session.factory_id`,
  `session.worker_id` directly) — this is what's actually live (confirmed by reading the file this
  session), not a nested `.worker` shape. Trust this file's `loadSession()`/`getSessionContext()`
  output shape over any prior assumption.

## Debugging heuristics (hard-won)

- A query returns empty with no error → check the actual `WHERE` scoping (factory/JH-group), not
  a permissions system — there's no RLS here to blame.
- A date field displays one day off → see the `date` column UTC-shift note above.
- Backend changes not taking effect → you forgot to restart the node process (see Hard Rules).
- Ctrl+C not stopping the backend cleanly → check for a stray `process.on('SIGINT', ...)`
  handler that only logs instead of exiting (this existed as dead debug code and was removed —
  don't reintroduce a no-op signal handler).

## Communication Protocol

### Human Readback — end every response to the user with this block

Format:

---
🔍 READBACK
**Done:** [What was completed — 1 sentence, plain English, no code terms]
**Decision:** [If a technical choice was made — "Chose X over Y because Z." Skip if none.]
**Watch out:** [Anything the user needs to know, verify, or that could break — 1 line. Skip if none.]
**Next:** [What happens next or what the user needs to do]
---

Rules for the Readback block:
- Maximum 80 words total
- No jargon, no code snippets, no technical terms
- Write as if explaining to a smart non-coder
- Never explain HOW something works, only WHAT and WHY
- If a decision had tradeoffs, name them simply: "faster but less flexible"
- Flag any irreversible action explicitly: DB write, schema change, file deletion

### SQL requests

Before giving the user any SQL to run, always precede it with one plain-English sentence: what
the query does, and whether it reads data only or changes/writes data. Never give the user SQL
to run blind. Before composing any SQL that references specific column names: if uncertain, run
an `information_schema` discovery query first — never assume column names.

### When the user stops understanding

If the user asks "what does this mean" or "why did it do this" — answer only in plain English.
Do not repeat the code or technical explanation unless the user asks for it.
