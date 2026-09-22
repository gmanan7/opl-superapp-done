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
  `jh_group.name` (the group header was showing the raw group UUID). **(Superseded — see "DMT: KPI
  ownership…" below)**: `machine` now has `machine_type`, `module_id`, `is_critical`, `display_order`
  and a primary key. `area_id` / the `area` table still have nothing behind them (0 rows) and the
  Area field was removed from the form. Owner is still deciding machine-to-area/department
  assignment rules — don't build that schema ahead of them.
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

## Module/department scoping — settled model (this session)

Two earlier approaches were tried and reverted before landing here — don't rebuild either of
the abandoned ones:
- Tried: tagging `departments` with a `module_id` and filtering the department list per viewer.
  Reverted — owner wanted a flat, shared department list for everyone (Scenario B).
- **Landed on**: `departments` stays flat/shared, zero module concept on it. Instead,
  **`user_details` gained its own `module_id`** column (FK to `modules`) — a person's module is
  a fact about *them*, completely independent of their department. **`modules` also gained a
  5th row: `PPB`**, representing "overall/plant-wide" — anyone tagged `PPB` is meant to have
  full, unrestricted visibility (the same role plant-wide leadership already had elsewhere),
  modeled as a real module rather than a null/special-case.
- **KPI Master got its own separate, optional module tag** (`dmt_kpi_master.module_id`) — a
  KPI can be tagged with a module (SFM/RFM/…) in addition to its (shared) department; when
  tagged, it displays as e.g. "SFM Production" everywhere it's listed, purely a display/grouping
  aid — the department itself is still the one shared record, not duplicated per module.

## DMT Tiers — T4 / T3 / T2 review-tier system (this session)

Full decision-by-decision detail lives in `DMT_DECISIONS.md` (entries 24–34) — this section is
the code/architecture summary. A brand-new feature — none of this existed before this session.

- **Schema**: 3 new tables — `dmt_tier` (`factory_id`, `name`, `is_active`, `lead_emp_id`,
  `dmt_id` nullable FK → `module_groups`, `jh_group_id` nullable FK-less uuid → `jh_group` —
  `jh_group.id` has no PK/unique constraint in this DB, a pre-existing gap, so this column is
  a bare uuid with no FK), `dmt_tier_member` (`tier_id`+`emp_id`), `dmt_tier_kpi`
  (`tier_id`+`kpi_id`). A tier is scoped to **exactly one** of factory-wide (T4, both id
  columns null) / one DMT (T3, `dmt_id` set) / one JH group (T2, `jh_group_id` set) — DB
  partial unique indexes enforce "at most one tier of a given name" per scope level
  independently (`(factory_id,name) WHERE dmt_id IS NULL AND jh_group_id IS NULL`, etc.).
- **No manual "Add tier" flow** — owner: "let us not ask users to add." The Tiers screen
  (Organisation → **Tiers** tab, `frontend/src/dmt/pages/DmtTiers.jsx`) is 3 fixed sub-tabs
  (T4/T3/T2); each real DMT/JH-group's row **auto-creates itself** (a `useEffect` fires the
  create mutation once per missing row) the moment a BE Lead opens that tab. Regular members
  never see a create action at all — they only see rows they already have visibility into.
- **Auth is layered, not one flat rule** — `dmtCanManageTier` (BE Lead or the tier's own
  current Lead → governs membership), `dmtCanManageTierKpis` (broader — adds DMT-level or
  JH-group-level routing incharges on top), `dmtCanManageT2` (T2's single combined rule
  covering **both** Lead-reassignment and KPI-picking: BE Lead, the JH group's own leader,
  its parent DMT's module lead, or a routing incharge for that JH group specifically).
  `dmtRoutingInchargesForDmt`/`dmtRoutingInchargesForJhGroup` resolve "routing incharge" as
  the union of every JH group's own `leader_emp_id` (the default reviewer) plus any explicit
  `approval_routing.approver_emp_id` for OPL/Kaizen/Abnormality, either review phase
  (`entity_type LIKE 'opl%'/'kaizen%'/'abnormality%'`). Activating/deactivating a tier is
  **always** BE-Lead-only at every level, no exceptions.
- **`GET /api/dmt/tiers`** resolves and returns `can_manage_kpis` per row server-side (not
  left to the frontend to re-derive) and applies the same authorized-set logic to *visibility*
  for inactive-vs-active tiers: BE Lead sees everything including inactive; everyone else only
  sees **active** tiers they're a member of, the Lead of, or a routing incharge for — a tier
  they'd otherwise qualify to manage stays invisible to them while inactive.
- **KPI picking has no department restriction** — any active KPI, any department, can be
  added to any tier's shown-KPI set (`frontend`'s `KpiPickerDialog` has an optional department
  filter purely for narrowing a long list, not an access restriction).
- **"My Tier KPIs" dashboard card** (`GET /api/dmt/my-tier-kpis`, card in
  `DmtDashboard.jsx` above "My Dashboard") — combined, deduplicated KPI list across every
  **active** tier the caller belongs to, as **member OR Lead** (Lead is a separate concept
  from list-membership everywhere in this system — a naive member-only join misses a Lead
  who isn't also separately listed, verified as a real gap during dry-run, not hypothetical).
  A KPI picked by more than one of the person's tiers appears once, tagged `via_tiers` (e.g.
  "via T2, T3"). Card renders nothing at all for anyone belonging to zero tiers.
- **Verified end-to-end, self-cleaning, multiple passes** — tier auto-creation, DB-enforced
  uniqueness per scope level, every authorization rule tested with both a real unauthorized
  user (403) and a real authorized one (200) at each tier level, default-Lead correctness on
  creation, and the dashboard dedup query including the Lead-not-listed-as-member case.

## DMT Task Board — tier-based visibility, replacing ad-hoc Groups (this session)

Full decision-by-decision detail lives in `DMT_DECISIONS.md` (entries 35–45) — this section is
the code/architecture summary. The old ad-hoc "Groups" feature (`dmt_task_groups`/
`dmt_task_group_members`, custom-team creation, `/api/dmt/my-task-groups`) was **deleted
outright** and replaced by the T4/T3/T2 tier system as the one task-visibility mechanism.
`dmt_tasks` gained a nullable `tier_id` column (FK → `dmt_tier`, `ON DELETE SET NULL`); the old
`task_group_id` column and its tables are left in place but dead — don't wire new UI to them.

- **`dmtVisibleTierIdsFor(dmtUser)`** (`server.js`, near the other tier helpers) is the single
  source of truth for "which tiers' tasks can this person see," used both for the LIST query's
  visibility filter and for validating a task's `tier_id` at create time (`dmtValidateTask`,
  wired as `DMT_RESOURCES.tasks.validate`). The rule, per owner direction:
  - Ordinary **membership** of a tier (incl. being listed as its Lead) grants visibility of
    only that one tier's own tasks — it does **not** cascade to tiers nested beneath it.
  - ~~Being the **Lead** of a tier additionally grants visibility of every tier nested beneath
    it (a T3 Lead sees its DMT's T2s; a T4 Lead sees the whole factory).~~ **REMOVED, a later
    session** — there is no downward cascade of any kind now; see "DMT escalation, task
    permissions…" below and `DMT_DECISIONS.md` #73–74.
  - **BE Lead sees every tier outright**, no exceptions — same blanket authority
    `dmtCanManageTier` already gave them, extended to tasks.
  - An explicit **`dmt_tier_task_viewer`** grant (tier_id + emp_id + added_by) lets a tier's
    incharge (BE Lead or that tier's own Lead) name specific extra people who see just that
    tier's own tasks without being a full member — managed via
    `GET/POST /api/dmt/tiers/:id/task-viewers` + `DELETE .../task-viewers/:empId`, same
    `dmtCanManageTier` auth as the member endpoints. This also feeds `dmtValidateTask`, so a
    granted viewer can create tasks tagged to that tier too, not just see them.
  - **Consequence (current)**: a person can only tag a task to a group they can see, i.e. one they
    are a member/Lead of (or BE Admin / an Overview-list viewer) — a T3 Lead can no longer tag a
    task to a child T2 they don't belong to (that used to work under the removed cascade).
- **The scoped LIST query** (`dmtBuildFilter`'s `cfg.scoped` branch) replaced its old
  `task_group_id IN (...)` join with `tier_id = ANY($visibleTierIds)`, where `visibleTierIds`
  comes from `dmtVisibleTierIdsFor`. A task with `tier_id IS NULL` stays exactly as before
  (public unless `is_private`, or visible to its owner/assigner/creator).
- **All 3 task-creation surfaces carry the same Tier picker and the same server-side
  validation** — Task Board's "New Task", the Dashboard's "Create Task from Red KPI"
  (`DmtDashboard.jsx`), and a Meeting's red-KPI task dialog (`DmtMeetingWorkspace.jsx`). One
  rule everywhere; don't add a 4th creation path without wiring the same `tier_id` field.
- ~~Meeting-to-tier auto-linking is explicitly deferred~~ **Built, a later session.**
  `dmt_meetings` now has its own `tier_id` (see "Decision Log tier-scoping..." section below) —
  a meeting created from a red-KPI task dialog could inherit it, but that specific wiring
  wasn't revisited; verify before assuming it's connected.
- **Task Board filter UI — settled on the simple version.** Several visual pickers were tried
  live (breadcrumb drill-down, multi-select checkbox tree, searchable combobox, full SVG
  org-chart with measured curved connectors) and all rejected in favor of the **original
  cascading-dropdown version**: a T4 toggle chip + a "Filter by DMT" dropdown + a dependent
  "Filter by JH Group" dropdown that only appears once a DMT is picked (`DmtTaskBoard.jsx`,
  `t4Selected`/`dmtFilterId`/`t2FilterId` state, `tierFilterIds` memo). Don't rebuild the
  fancier versions unless asked again — they were built, demoed, and explicitly turned down.
- **Default scope**: everyone opens the Task Board on **"My Tiers"** (their own tier tasks +
  public/own tasks), with an "All I can see" toggle to widen it — except **BE Lead**, who has
  no meaningful "My Tiers" concept (role-based access, not membership-based) and always shows
  a fixed "All (factory-wide)" label instead of the toggle; and anyone belonging to **zero**
  tiers, who silently falls back to "All" so they never land on a confusing empty board.
- **Filter chips, confirmed working as designed**: My Tasks (you're the owner), Overdue (due
  date passed, not closed), Due Today, Carryover (due date pushed at least once via the real
  due-date-change endpoint, `dmt_task_updates` with `update_type='due_date_change'`, still open).
- **Real bug found and fixed at the database level**: `dmt_tier`'s `dmt_tier_factory_name_no_dmt`
  unique index was defined as `(factory_id, name) WHERE dmt_id IS NULL` — missing
  `AND jh_group_id IS NULL` — which silently capped the **entire factory** to one T2 tier ever,
  not one per JH group as designed. Invisible until this session because the org had only ever
  had 1 real JH group. Corrected on the live database; verified by successfully creating 20.
- **`backend/tools/seed_demo_task_board.mjs`** (self-cleaning, `... clean` to remove) — builds
  5 dummy DMTs × 4 JH groups (20 total, all active tiers with Leads/members) and ~56 dummy
  tasks with varied due dates, a few genuine carryovers pushed via the real due-date-change
  endpoint. Built specifically to stress-test tier visibility/filtering beyond the 1-real-group
  scale the org had before.

## Decision Log tier-scoping, Task Board fixes, and T4 becomes a real multi-group feature (this session)

Full decision-by-decision detail (why, not how) lives in `DMT_DECISIONS.md` (entries 46–57) —
this section is the code/architecture summary.

- **Decision Log is now tier-scoped through its meeting, not its own tag.** `dmt_meetings`
  gained `tier_id` (and `dmt_meeting_templates` gained one too, inherited by any meeting
  created from that template). `GET /api/dmt/meetings` is now `scoped: true` on the generic
  DMT_RESOURCES engine — reused the exact same tier-visibility clause Task Board already used,
  generalized via a new `cfg.scopedIdentityCols` option (was hardcoded to
  `owner_id`/`assigned_by`; meetings use `facilitator_id`/`created_by` instead) and a
  `hasPrivate` check (meetings have no `is_private` column, tasks do). `DmtDecisionLog.jsx`
  needs **zero** extra filtering of its own — a decision whose meeting isn't in the
  already-scoped meetings list simply never matches during the existing
  `meetingById` lookup. Same "My Tiers / All I can see" toggle as Task Board, client-side only
  (narrows an already-server-scoped list down to tiers you're a direct member/Lead of).
- **T4 is no longer a singleton, silently-auto-created tier.** `dmt_tier` gained a
  `display_name` column (nullable — falls back to plain "T4" when unset/cleared), and the old
  `dmt_tier_factory_name_no_dmt` unique index (which capped a factory to exactly one T4 row)
  was dropped. `POST /api/dmt/tiers` now requires `lead_emp_id` when creating a T4-level tier
  (no `dmt_id`/`jh_group_id`) — a real, active user, validated server-side — and sets
  `is_active = true` immediately (a deliberate BE-admin action shouldn't need the extra
  activate step the old silent auto-create needed). `tierLabel()` (`taskExtras.js`) now checks
  `display_name` first, before the generated "T3 · DMT" / "T2 · JH Group" fallback.
  `DmtTiers.jsx`'s `T4Panel` lists every T4-level tier (was: find-or-auto-create exactly one)
  with a "New T4 Group" dialog (name optional, Lead required) gated to BE Lead; `T3Panel`/
  `T2Panel` are untouched.
- **Renaming**: inline pencil-icon edit on the group's own card, gated by `dmtCanManageTier`
  (BE Lead or that tier's own Lead) — same rule already used for members/task-viewers.
  `PATCH /api/dmt/tiers/:id` accepts `display_name` under that same auth check (separate from
  the existing `is_active`-is-BE-Lead-only and `lead_emp_id` checks on that same endpoint).
- **Every meeting must belong to a group, and only that group's Lead or BE admin may
  create/retarget it.** `dmtValidateMeeting` (was a thin alias for the generic
  `dmtValidateTierTag`) is now its own function: 400s a create with no `tier_id` (via a new
  `{ isCreate }` third argument threaded through from the generic POST handler — PATCH doesn't
  pass it, so editing an existing meeting without touching `tier_id` isn't forced to re-supply
  one), then re-runs the existing visibility check, then 403s unless `dmtCanManageTier` passes
  for that specific tier. This is enforced identically whether the meeting is created from
  `DmtMeetings.jsx`'s "New Meeting" or a tier card's own "Create Meeting" button (which now
  passes `initialTierId` into the same `CreateMeetingDialog`, exported from `DmtMeetings.jsx`
  rather than kept private, and hides the Template picker + locks the tier field in that mode
  so a picked template can't silently redirect the meeting to a different group).
- **Facilitator defaults to the picked tier's `lead_emp_id`** (a `useEffect` keyed on
  `f.tier_id`, re-firing on manual tier change, template inheritance, or a fixed
  `initialTierId`) — still a plain editable dropdown afterward. The old role-filtered
  facilitator list (`leadership`/`be_lead`/`it_lead`/`admin`/`module_lead` only) was dropped
  entirely in favor of "any active worker," since a BE-admin-appointed Lead can be any role.
- **Real recurring meetings** (weekly-only, mirrors Audits' owner-approved minimal recurrence
  UI — no frequency dropdown). `dmt_meetings` gained `series_id` (nullable uuid, no FK — pure
  grouping tag). `buildOccurrenceDates()` in `DmtMeetings.jsx` is a pure helper: Never (capped
  at 26 occurrences ≈ 6 months), On-date, or After-N. Each occurrence is created as an
  ordinary, independent `dmt_meetings` row via a normal loop of `dmtApi.create` calls (not a
  lazy schedule/occurrence split like Audits) — so attendance, decisions, and KPI snapshots
  all keep working per-instance with zero changes elsewhere; `series_id` is purely a shared
  tag, nothing reads it yet beyond storage.
- **Group deletion**: `DELETE /api/dmt/tiers/:id`, `dmtGuard('be_lead')` — no carve-out for the
  tier's own Lead (deliberately stricter than every other tier-management endpoint, which all
  allow BE Lead OR the tier's Lead). Relies entirely on existing FK behavior: `dmt_tier_member`/
  `dmt_tier_kpi`/`dmt_tier_task_viewer` are `ON DELETE CASCADE` (pure junction rows); `dmt_tasks`/
  `dmt_meetings`/`dmt_meeting_templates`.`tier_id` are all `ON DELETE SET NULL` — nothing there
  needed to change. Frontend only renders the delete icon when `!tier.is_active`, so
  deactivating is a forced first step. Deactivating itself (flipping the Switch off) now opens
  a confirm dialog first (`deactivateOpen` state) — flipping it back on stays a single click,
  no confirm, since reactivating is harmless.
- **Lead-change confirmation**: picking a new Lead from the dropdown no longer applies
  immediately — it stages the pick (`pendingLead` state: `{id, name}`) and opens a dialog
  naming the current Lead (`tier.lead_name`) and the incoming one before calling
  `updateTier.mutate`. Cancelling just clears the staged pick; the `<Select>` is controlled by
  `tier.lead_emp_id` so it reverts on its own.
- **T4 list sort**: active groups before inactive ones (`t4Tiers.sort((a,b) => (b.is_active?1:0)
  - (a.is_active?1:0))`), stable otherwise.
- **Task Board bugs found and fixed this session**:
  - Clicking a task row on **Task Overview** (`DmtAdminTaskOverview.jsx`) navigated to
    `/dmt/tasks` but never opened the actual task — fixed with a `?open=<taskId>` query param
    that `DmtTaskBoard.jsx` reads once on mount to auto-open that task's detail sheet, then
    clears the param. **Guard with a `useRef`, not just the param itself** — `tasks.rows` is a
    brand-new array every render (built fresh in `useDmtTasks`), so an effect with `tasks.rows`
    in its dependency array re-fires on every render for as long as `open` lingers in the URL,
    silently reopening a drawer the user just closed. The ref (`openedRef.current`) makes the
    auto-open fire exactly once per link, independent of how many times the effect re-runs.
  - The Sheet-based drawer's close (✕) button (`components/ui/sheet.jsx`,
    `SheetPrimitive.Close`) had **no padding at all** — a genuinely tiny 16×16px hit target
    (icon size with zero surrounding click area), easy to miss on a real click. This is the
    shared primitive every `Sheet` in the app uses (Task Board's detail drawer, any future
    one), not a Task-Board-only fix. Enlarged to 28×28px (`p-1.5`, position nudged from
    `right-4 top-4` to `right-3 top-3` to keep the icon visually in the same spot) plus a
    `hover:bg-secondary` affordance now that there's a real box to hover.
- **DMT sidebar nav scrollbar hidden** (`.no-scrollbar` utility added to `index.css`, applied
  to `DmtShell.jsx`'s `<nav>`) — purely cosmetic, the panel still scrolls the same way, just
  without a visible track/thumb.
- **Demo data**: `backend/tools/seed_demo_decision_log.mjs` (self-cleaning, `... clean` to
  remove) — one small demo DMT + JH group, T4/T3/T2-tagged meetings (3 rounds) each with 3
  decisions (mixing linked overdue/completed tasks and no-task decisions), used to verify
  Decision Log's tier-scoped visibility end to end at every tier level.

## DMT Hierarchy tab, Task Board Overview, and New Task rework (this session)

Full decision-by-decision detail (why, not how) lives in `DMT_DECISIONS.md` (entries 58–72) —
this section is the code/architecture summary.

- **New Hierarchy tab** (Organisation → Hierarchy, `DmtHierarchy.jsx`) renders the T4→T3→T2
  reporting structure as a classic top-down org chart (pure-CSS `::before`/`::after` connector
  trick, horizontal scroll if it's wider than the panel — an auto-scale-to-fit version and a
  rotated left-to-right version were both tried live and rejected). **Renders ONLY explicit
  `parent_tier_id` links** — a group with no link set isn't placed in the tree at all, not even
  under a guessed default; it only appears in a separate "groups without an explicit link" list
  below the chart, with its own inline "Reports to" picker. Every "Reports to" dropdown across
  the app is blank unless a link was actually saved (never pre-filled with a resolved default),
  and offers a "— Clear link —" sentinel option to undo a link with no separate confirm modal.
- **`dmt_tier.parent_tier_id`** (new, nullable, self-referencing FK) is what makes an explicit
  link possible at any level. Backend validation (`dmtValidateParentTier`) enforces: a T3-level
  group may only link to a T4; a T2-level group may link to a T3 **or** a T4 directly (skipping
  T3 is allowed — some JH groups have no DMT-level group above them). "Level" here is decided by
  `name` ('T3'/'T2'/'T4'), not just `dmt_id`/`jh_group_id`, because a standalone/custom group
  (see next bullet) has both of those null just like T4 does.
- **T3 and T2 can now be standalone/custom groups**, same shape T4 already had — a name + a Lead,
  not tied to any real DMT/JH group. Creating a group is now **BE Admin only** (tightened in a
  later session); relinking ("Reports to") stays **BE Lead or a T4 group's own Lead**
  (`dmtIsBeOrT4Lead`, new) — T3/T2 no longer
  silently auto-create for anyone who opens the Tiers page; that auto-create `useEffect` was
  removed from `T3Panel`/`T2Panel` entirely. `CreateScopedGroupDialog` (`DmtTiers.jsx`) offers
  "Link to a real DMT/JH group" (disabled once none remain unlinked) or "Custom group" as two
  explicit modes, with an optional "reports to" pick at creation time.
- **`resolveDmtHierarchyTree(allTiers, moduleGroups, jhGroups)`** (`lib/dmtHierarchyTree.js`,
  new, pure function) is the single source of truth for "what links to what" — both
  `DmtHierarchy.jsx` and `DmtTaskBoard.jsx`'s group filter call this same function now, instead
  of each maintaining its own notion of "which DMT owns which JH group" (the old Task Board
  filter grouped by raw `jh_group_dmt_id`, ignoring Hierarchy links entirely, so a group could
  show up under a different parent in the filter than where the chart actually placed it).
- **Groups are colored by LEVEL, not chart position** (T4 blue / T3 violet / T2 emerald,
  `NodeBox`'s `tone` prop) — needed because a T2 linked directly to T4 renders one row up from
  where T2s normally sit, in the same visual column T3 usually occupies.
- **Old per-tier task-viewer grant removed from the UI.** The "Task Board visibility / Add"
  box on each Tiers card (`AddTaskViewerDialog`, the `dmt_tier_task_viewer` management UI) is
  gone — owner confirmed removing it despite it being a real access grant, not just a filter.
  The underlying table/data and backend read-path are untouched, just no longer editable here.
- **New factory-wide replacement: Task Board Overview tab** (Organisation, BE-Lead-only,
  `DmtTaskBoardOverview.jsx`). New `dmt_global_task_viewer` table (`factory_id`, `emp_id`,
  `added_by`, unique per factory+person) + `GET/POST /api/dmt/global-task-viewers` +
  `DELETE .../global-task-viewers/:empId`. `dmtVisibleTierIdsFor` now also returns every tier
  when the caller is a global task viewer, same branch as the existing BE-Lead check. Private
  tasks are unaffected either way — they were never tier-scoped to begin with.
- **Task Board's group filter is now a multi-select hover-flyout** built from
  `resolveDmtHierarchyTree` (`DropdownMenuCheckboxItem` + `DropdownMenuSub` for DMTs with JH
  children), replacing the old single-choice T4-chip/DMT-dropdown/JH-dropdown cascade. **The
  separate "My Tiers / All I can see" Scope toggle (and BE Admin's fixed "All (factory-wide)"
  pill) was removed entirely** — default (nothing picked in the group filter) is "my own tiers +
  untagged tasks," and anyone belonging to zero tiers (BE Admin, or a global task viewer with no
  personal membership) sees everything by default instead. Department and a later-considered
  Module filter were both explicitly rejected — Task Board filtering stays to Groups + Priority
  (+ the existing status-based Kanban/List views) only.
- **New Task is now Owner-first.** `SearchableOwnerPicker` (type-to-filter panel, not a plain
  `<Select>` — the worker list doesn't scale to scrolling by hand) replaces the old Owner
  dropdown. Picking an Owner calls the new `GET /api/dmt/tiers/for-person/:empId` (every active
  group that person is a member of or leads) and offers those as the visibility pick — **not**
  the old approach of picking a group/tier first and filtering Owner by its members. Department
  auto-fills from the owner's own `user_details.department_id` (now selected in
  `/api/worker-names`, alongside `module_id`), never picked by hand. **An owner in zero groups
  forces the task private** (owner + assignor + admins only) instead of the old default of
  `tier_id = NULL` meaning visible to literally everyone in the factory — the private checkbox
  is hidden in this case since there's nothing left to toggle.
- **`modules`/`user_details.module_id`** (SFM/RFM/Labels/Flexibles/PPB — `GET
  /api/org/module-names`) is a **separate real master list**, unrelated to the DMT/
  `module_groups` (DMT) hierarchy tree despite the similar name. A "Department + Module"
  owner-search mode was built using this table, then removed again per owner direction
  (judged overkill once Owner-first existed) — don't reintroduce without being asked, and don't
  conflate this table with `module_groups` (DMTs) if "module" comes up again.
- **Backend has no file-watcher in this dev environment** (`node server.js`, not
  `node --watch server.js`, despite Hard Rule 5's guidance) — every backend edit this session
  needed a manual kill + restart, confirmed via a live `curl` check before treating any
  backend change as live. Check this before assuming a server-side fix has taken effect.

## DMT escalation, task permissions, private groups, Task Board redesign (this session)

Full decision-by-decision detail (why, not how) lives in `DMT_DECISIONS.md` (entries 73–86) —
this section is the code/architecture summary. **Several entries there reverse older ones
(#36, #62, #66); this section is the current truth.**

- **Visibility is membership-only, no cascade.** `dmtVisibleTierIdsFor` (server.js) returns:
  every tier for BE Lead-tier or a `dmt_global_task_viewer` (Task Board Overview list); otherwise
  ONLY tiers the caller is a member/Lead of + explicit `dmt_tier_task_viewer` rows. A T4/T3 Lead
  gets nothing extra; a Hierarchy `parent_tier_id` link and the real DMT→JH group relationship
  grant nothing. `dmtValidateTierTag` (task/meeting tier tagging) uses the same set. The one
  exception: the scoped task LIST also has `OR escalated_to_tier_id = ANY(visibleTierIds)` (added
  in `DMT_RESOURCES` LIST handler, only for `dmt_tasks` and only once `_dmtEscSchemaEnsured`).
- **Groups.** `POST /api/dmt/tiers` is **BE Admin only** (`dmtTierAtLeast be_lead`). Optional
  `is_private` (BE only; column `dmt_tier.is_private`) — same visibility as any group, only a flag
  for escalation. `dmt_tier.escalation_days` (int 1–365, **default 90**, NULL = off) is set with
  `PATCH /api/dmt/tiers/:id` `{escalation_days}` (BE only; 400 for a T4 or a private group). New
  T4/private groups are created with NULL; other new groups with 90. UI: `DmtTiers.jsx`
  (`PrivateGroupCheckbox` in the three New-group dialogs, a "Private" badge, and an Auto-escalation
  box with a red Turn-off button on each non-T4, non-private card).
- **Schema is applied lazily at startup, no manual SQL** (same convention as
  `ensureNotificationSchema`): `ensureDmtEscalationSchema()` adds `dmt_tasks.escalated_at /
  escalation_type / escalated_to_tier_id / escalated_from_owner_id / escalated_by /
  escalation_note`, `dmt_tier.escalation_days` (+ a ONE-TIME backfill to 90 keyed on the column
  default so a later "Turn off" is never re-enabled by a restart), and adds `'escalation'` to the
  `dmt_task_updates.update_type` CHECK; it sets `_dmtEscSchemaEnsured`. `ensureDmtTaskDeptNullable()`
  runs `ALTER TABLE dmt_tasks ALTER COLUMN department_id DROP NOT NULL`. The `.sql` files in
  `backend/sql/` (`dmt_task_escalation.sql`, `dmt_tier_private.sql`) are the record. A
  `dmt_escalation_setting` table (an abandoned per-plant version) may still exist in the DB — dead,
  don't build on it.
- **Escalation engine (server.js, DMT section).** `dmtEscalateTask(task, {toTierId, toEmpId, type,
  by, note})` moves **ownership** to the recipient, records `escalated_from_owner_id`, writes a
  `dmt_task_updates` row (`update_type='escalation'`), audits and `notify()`s (kind
  `dmt_task_escalated`, module `'dmt'`). `sweepDmtEscalations()` runs hourly + 20s after boot: an
  unfinished, non-private task in an active, non-private group with `escalation_days` set, whose
  group has an active `parent_tier_id` parent with a Lead (≠ owner), is escalated once when
  `due_date + escalation_days <= today`. `POST /api/dmt/tasks/:id/escalate` (`to_tier_id` → that
  group's Lead, or `to_emp_id`, optional `note`) and `GET /api/dmt/escalation-targets` (active,
  non-private groups). Private *tasks* (`is_private`) never escalate; tasks of a private *group*
  can be escalated by hand. An escalated task's group can't be changed; reassigning it is limited
  to the current owner and to members of `escalated_to_tier_id`.
- **Only the assigner and the assignee can act on a task** — `dmtCanActOnTask(task, empId)`
  (`owner_id` or `assigned_by`) + `DMT_TASK_ACT_ERR`, enforced in the named ops
  (`status`, `due-date`, `fields`, `comment`, `escalate`) AND the generic PATCH/DELETE via
  `DMT_RESOURCES.tasks.canModify`. Nobody else — not BE Admin, module lead, group Lead or
  Overview-list viewer. Frontend mirror: `canAct(task, me)` in `DmtTaskBoard.jsx` (no Actions /
  Edit / Change Due Date / comment box otherwise).
- **Task status rules.** `dmtAutoStartIfOwner`: an Open task becomes In Progress on its OWNER's
  first comment / edit / due-date change (not on a reassignment, not for anyone else); history note
  "Started automatically…". `POST …/status` with `new_status:'blocked'` needs a non-blank `note`
  (400); the drawer shows it in a red "Blocked" box.
- **`POST …/fields`** now accepts `title, description, owner_id, priority` and `tier_id`/`is_private`
  (group change: not when escalated; caller must see the group; the owner must be in it; `tier_id:null`
  requires `is_private:true`). **No department** — `department_id` is out of the tasks `cols`
  whitelist (the server ignores it), out of every task form/card/export, and the Admin Task
  Overview + Analytics group by `tier_id` ("Not in any group" when null). Old rows keep their
  department value, unused.
- **Task Board frontend (`DmtTaskBoard.jsx`).** Columns Open / In Progress / Blocked / **Escalated** /
  Completed / Cancelled; escalated unfinished tasks appear ONLY in Escalated (`isEscalatedActive`).
  `COL_PAGE_SIZE = 4` with a per-column pager; fixed-size (148px) cards showing title, priority +
  due/overdue, the source meeting (name + date, from a `meetings` lookup keyed by
  `origin_meeting_id`) and assignee + group — or a From | To block when escalated. Card colour is
  viewer-relative (`escalationFor`): amber = escalated up to me/my group, blue = my group's task
  sent up, violet = between groups I'm not in; an Escalated-column dropdown filters those.
  A **Columns** menu hides columns per person (`safeStorage` key `dmt_taskboard_cols_<emp_id>`).
  BE Admin opens on every task (`belongsToNoTiers = tierAtLeast('be_lead') || …`); everyone else on
  their own groups + untagged + unfinished escalations. Edit Task = title, description, owner
  (`SearchableOwnerPicker`), group (`GET /api/dmt/tiers/for-person/:empId`), priority. The
  notification bell (`NotificationBell.jsx`, now with a **Tasks** tab, route `/dmt/tasks`) is also
  mounted in `DmtShell.jsx`.
- **Test / dry-run tooling** (all self-cleaning; hit the REAL API + DB): `backend/tools/
  seed_demo_escalation.mjs` (demo groups/tasks, `… verify` after the sweep, `… clean`),
  `test_task_flow.mjs` (auto-start, blocked reason, actor rules, no-department, group editing) and
  `test_viewers_readonly.mjs` (people who see everything are read-only). `server.js` now reads
  `PORT` (`Number(process.env.PORT) || 3000`) so a **separate test copy** can run on e.g. 3111
  (`PORT=3111 node server.js`, point scripts with `DEMO_API=http://localhost:3111/api`) without
  touching the owner's backend on 3000 — never kill port 3000. The sweep fires ~20s after boot.
- **Gotchas found.** In DMT, `111111` (it_lead) and `444444` (be_lead) both map to the BE tier —
  use `222222/333333/555555/666666/777777` for non-BE test users. The browser pane forgets its
  seeded `tpm_session` when it is reopened (you land on `/login`) — re-seed it. Backend changes
  still need a manual restart of the owner's process; a passing dry run on the test copy says
  nothing about their running instance.

## DMT: KPI ownership & entry, KPI tabs, PM Schedule rebuild, task-form fixes (this session)

Full decision-by-decision detail (why, not how) lives in `DMT_DECISIONS.md` (entries 87–106).

- **KPI ownership.** One KPI belongs to exactly ONE group: unique index `dmt_tier_kpi_one_group`
  (lazy `ensureDmtKpiOneGroup()`), `PUT /api/dmt/tiers/:id/kpis` 409s naming the current owner,
  `GET /api/dmt/kpi-owners` feeds the picker (KPIs owned elsewhere show greyed "In <group>").
- **Who may enter a KPI value.** `dmtKpisNotEnterableBy(kpiIds, empId)`: the KPI's owning group must
  be active and the person its member or Lead. **No role bypass — BE Admin included** (BE Admin
  controls access by managing membership); a KPI in no group can't be entered by anyone. The generic
  `kpi-entries` resource is `readOnly: true` (405 on POST/PATCH/DELETE); values are written only by
  `POST /api/dmt/kpi-entries/upsert`, which skips blank rows, 400s a row missing `kpi_id`/date (it
  used to skip silently), and treats a save on an already-valued day as an EDIT: the ORIGINAL
  submitter/late flag are kept, an unchanged save is a no-op, and every submit/edit is logged in
  `dmt_kpi_entry_log` (lazy `ensureDmtKpiEntryLog()`). An entry only counts as submitted if it
  holds a value (~7 old blank rows exist). Project Tracker item CREATE is group-checked the same
  way; editing/deleting an existing item still follows the old rule.
- **KPI Entry page** (`DmtKpiEntry.jsx`): no department picker — it lists `/api/dmt/my-tier-kpis`
  (that endpoint names the id `kpi_id`; the page maps it to `id` — forgetting this made every save
  silently do nothing). Submitted rows lock; per-row Edit / Cancel; button reads "Save N KPIs".
- **Organisation tabs (leadership tier+):** *KPI Not Submitted* (`GET /api/dmt/kpi-entry-status?date`,
  flags KPIs in no group), *KPI Audit Trail* (`GET /api/dmt/kpi-entry-audit?date`), *PM Schedule Edit
  Access*, *PM Schedule Audit Trail*. Filters/paging are client-side: `DmtKpiFilters.jsx`
  (`KpiFilterBar`, `optionsFrom`, `deptLabel`) + the shared `ListPager`; cascade Module →
  Department → Group, Module options = the full `modules` list, KPI department shown as
  "<module> <department>".
- **PM Schedule.** Everyone views; BE Admin (always — #108, reversing the earlier "no role bypass") and
  the people in `dmt_pm_editor` edit (list managed in the tab, BE-only writes). Enforced by a resource-level `editGuard` in
  `dmtWriteGuard` on `pm-plan`/`pm-actual`. The calendar shows ONLY machines in `dmt_pm_machine`
  (editors pick from the master via "Add machines", X per machine to remove; removal keeps
  plan/actual history; machines added to the master later stay off until picked):
  `GET /api/dmt/pm-machine-list`, `GET /api/dmt/pm-machine-master` (editors only),
  `POST/DELETE /api/dmt/pm-machine-select`. Old `dmt_pm_machines` is a read-only backup (`readOnly`).
  **Audit trail:** `dmt_pm_log` written by `dmtPmLog()` (never throws) from a new generic
  `afterWrite(action, before, after, user)` hook on `DMT_RESOURCES` plus the machine-select and
  editor endpoints; `GET /api/dmt/pm-audit?from&to`. It had NO history before shipping — earlier
  PM changes can't be recovered. Tables `dmt_pm_editor`/`dmt_pm_machine`/`dmt_pm_log` are created
  lazily by `ensureDmtPmEditor()`.
- **PM page UI** (`DmtPmSchedule.jsx`): view-only by default; Edit → Plan/Actual switch + "Add
  machines" + "Done editing". Filter buttons = modules present. Legend = the seven colour squares
  behind an "i" dropdown, built from `CELL_CLASS`; the "2 days" rule is one constant,
  `PM_GRACE_DAYS` in `lib/pmSchedule.js`, used by `getCellState` AND the legend text. No "view
  only…" hint text for anyone.
- **Machine master (TPM, `pages/admin/mdm/Machines.jsx`).** Form = Name, JH Group, Module
  (`machine.module_id` → `modules`), Machine type (`machine.machine_type`, the PM group heading),
  Critical, plus the Active/Deactivate button. Code stays in the DB but is off the form (`PUT`
  preserves any field the caller doesn't send); Area removed. Group-less machines are valid
  (page heading "No JH Group"; editing one doesn't force a group). `machine` had NO primary key
  before — `machine_pkey` was added. Migrations, in order, all in `backend/sql/`:
  `pm_machines_to_machine.sql` → `pm_machine_selection.sql` → `machine_module_and_type.sql` (apply
  with a small node script that reads `.env`; a Claude session may not be able to use `psql`).
  **Renaming a column breaks the running backend until the owner restarts it** (it errored with
  `column m.line does not exist`).
- **Task Board fixes.** New Task / Edit Task group pickers use `useAssignableGroups` in
  `DmtTaskBoard.jsx` (owner's groups ∩ creator's member/Lead groups; BE Admin all; none shared →
  private) so the form never offers a group the server refuses; the server rule is unchanged.
  `POST …/fields` logs a `group_change` Activity entry (extended `dmt_task_updates.update_type`
  CHECK, applied in `ensureDmtEscalationSchema`).
- **Login cache bug.** `lib/queryClient.js` is the one shared TanStack client; `saveSession` /
  `clearSession` (`lib/auth.js`) call `queryClient.clear()`. Before this, DMT's `['dmt','me']` role
  (cached 10 min, not keyed by user) leaked between users in one tab.
- **Layout.** `DmtShell.jsx`'s content column and `<main>` need `min-w-0` (same lesson as the TPM
  AppShell) — a wide table stretched the whole page. The dev frontend needs a FULL page reload after
  shell/layout edits (HMR didn't apply them).
- **Testing recipe used (all self-cleaning).** Test backend copy `PORT=3111 node server.js`; in the
  browser pane load an SPA page, override `window.fetch` to send `/api` to `http://localhost:3111`, then
  navigate by clicking sidebar links (a full navigation drops the override); seed `tpm_session` per user
  and clear it afterwards. Users: 222222 operator, 333333 JH Leader (jh_lead tier), 444444 BE Admin
  (the owner also uses these accounts, so distinguish test rows by time window, not by user). Never kill
  port 3000 — the owner restarts it manually, and until then new endpoints 404 and renamed columns 500.

## DMT: PD Cycle access, audit trail, page rework (this session)

Detail in `DMT_DECISIONS.md` (#107–110). **#108 reverses the PM "no role bypass" rule: BE Admin tier can always edit the PM Schedule and the PD Cycle** (`dmtCanEditPm` / `dmtCanEditPd` return true for `be_lead` tier); everyone else needs a row in `dmt_pm_editor` / `dmt_pd_editor` (Organisation → "… Edit Access" tabs, BE-only writes). PD Cycle mirrors the PM pattern: `ensureDmtPd()` lazily creates `dmt_pd_editor` + `dmt_pd_log`; `dmtPdLog()` never throws; the `pd-jobs` / `pd-job-comments` resources use `editGuard` + `afterWrite` hooks, the stage/spawn routes use `dmtPdGuard`, and `pd-stage-history` is `readOnly` (only the stage route writes it). Viewer endpoints: `GET /api/dmt/pd-editors[/me]`, `GET /api/dmt/pd-audit?from&to` (leadership+). Page (`DmtPdCycle.jsx`): fixed 136px cards, 4 per kanban column with a per-column pager, paginated list view, drawer split into Details/Comments/History tabs. **Categories (#111):** `dmt_pd_category` + `dmt_pd_jobs.category_id`, created/seeded lazily by `ensureDmtPd()` (also called at boot); `GET/POST/PATCH /api/dmt/pd-categories` (GET jh_lead+, writes BE only, off not delete); jobs validated against ACTIVE categories (`dmtValidatePdJob`); audit CHECK widened with `category_*` events. **Attendance sheet + co-facilitator (#126):** `dmt_tier.co_facilitator_emp_id` (lazy `ensureDmtCoFacilitator()`, also at boot; counted by `dmtMyGroupIds` / `dmtVisibleTierIdsFor` / `dmtMeetingAccess.isManager`); `dmt_meeting_invitees.source` (`group`|`extra`) + `added_by` (`ensureDmtAttendeeSheet()`); `dmtSyncGroupAttendees()` (called on meeting INSERT and by `POST /api/dmt/meetings/:id/sync-attendees`), rules `dmtInviteeRule` / `dmtAttendanceRule`. Verified with a 31-check self-cleaning API run. **Meeting write rules (#124):** generic `rule(action, {row, body, user})` hook on `DMT_RESOURCES` (INSERT/UPDATE/DELETE, may stamp/clean `body`); `dmtMeetingAccess()` gives `{isManager, isParticipant, open}`; anyone part of a meeting adds notes/points/decisions, only the author edits (`created_by`, `dmt_meetings.summary_by`, both stamped server-side); tasks unrestricted. Verified with a 29-check self-cleaning API run. **Decision visibility (#121):** `meeting-decisions` has `rowFilter: dmtDecisionRowFilter` (generic hook in the `DMT_RESOURCES` LIST + GET-one handlers, returns `{clause, params}` to AND on): BE tier sees all; everyone else only decisions of meetings whose `tier_id` is an active group they're a member/Lead of, or where they're facilitator/creator. Supersedes the old client-side "My Tiers / All I can see" switch on the Decision Log. **Meeting audit trail (#120):** `dmt_meeting_log` (lazy `ensureDmtMeetingLog()`), written by `dmtMeetingLog()` (never throws) from the `afterWrite` hooks `dmtMeetingAfter` / `dmtInviteeAfter` / `dmtAttendanceAfter` / `dmtPointAfter` / `dmtDecisionAfter` on `meetings`, `meeting-invitees`, `meeting-attendance`, `meeting-discussion-points`, `meeting-decisions`; `GET /api/dmt/meeting-audit` (leadership+); Organisation tab `DmtMeetingAudit.jsx`, plus an "Audit trail" button in `DmtMeetingWorkspace.jsx`. Verified with a 19-check self-cleaning API run on a test copy. **Columns + demo data (#116–117):** the PD board has a per-person "Columns" menu (`dmt_pdcycle_cols_<emp_id>` via `safeStorage`, same as the Task Board) and `colPageSize(shownColumns)` = 4/5/6 cards per column page; `backend/tools/seed_demo_pd_cycle.mjs` seeds/cleans "[DEMO] " jobs through the real API. **Stages (#112–115):** no longer a fixed enum — `dmt_pd_stage_def` (key, label, kind `active`/`closing`, position, `requires_note`, `early_exit`, tone, `is_removed`) is managed at Organisation → PD Cycle Stages (`GET/POST/PATCH/DELETE /api/dmt/pd-stages`, GET jh_lead+, writes BE only); the four stage columns are plain text (converted in `ensureDmtPd()`). Server `pdStageOptions(cfg,key)` is the single source for allowed moves (next in-progress stage + closing stages that are `early_exit`, or all closing from the LAST in-progress stage; `back_to` = previous in-progress stage, reason required); the client only reads `forward`/`back_to` off `GET /pd-stages` via `usePdStages()` (`lib/usePdStages.js`, `lib/pdCycle.js` `buildStages`). The generic `pd-jobs` create/edit forces/ignores `stage` (`dmtValidatePdJob`). Kanban = one column per in-progress stage + one "closed" column. Verified with a self-cleaning API run on a test copy (`PORT=3111`, 40/42 — the 2 "failures" were because the owner had legitimately granted 222222 PD edit access, not a bug); the first backend restart runs the enum→text migration on the live DB. Earlier: verified with a 26-check self-cleaning API run on a test copy (`PORT=3111`); the owner must restart their backend for the new endpoints, and the layout is still the owner's visual gate.

## DMT: PD Cycle + Meetings rework — index, migrations, how it was verified (Sept 2026)

Per-feature detail is in the "DMT: PD Cycle access…" section above and `DMT_DECISIONS.md` #107–129. Index:
- **PD Cycle** (#107–119, 128): edit access list (BE Admin always edits), audit trail, categories, BE-managed stages
  (`dmt_pd_stage_def`), move back with a reason, respawn popup / duplicate warning / earlier history, Analytics side panel
  (target-date based), per-person Columns menu, fixed-size non-overlapping cards, bold form labels. Files:
  `pages/DmtPdCycle.jsx`, `DmtPdEditAccess.jsx`, `DmtPdStages.jsx`, `DmtPdAudit.jsx`, `DmtPdAnalyticsSheet.jsx`,
  `lib/pdCycle.js`, `usePdStages.js`, `pdAnalytics.js`.
- **Meetings** (#120–126): Meeting Audit Trail (`dmt_meeting_log`, cascading filters, per-meeting button), Decision Log
  visibility (`rowFilter`), meeting write rules (`rule` hook; author-only edits), Groups filter (`components/GroupFilter.jsx`),
  group Co-facilitator, attendance sheet = group people + per-meeting extras, self-marking, Edit-lock (page only).
- **Shell** (#127): `components/layout/ModuleSwitch.jsx` (Lumos ⇄ CloseLoop), CloseLoop Logout.
- **One-time schema changes made lazily at first backend start after deploy (no manual SQL; all additive except the enum
  conversion):** `dmt_pd_editor`, `dmt_pd_log`, `dmt_pd_category`, `dmt_pd_stage_def`, `dmt_pd_jobs.category_id`; the four PD stage
  columns converted from the `dmt_pd_stage` enum to text (values kept); `dmt_meeting_log` (+ `tier_id`); `dmt_meetings.summary_by`;
  `dmt_tier.co_facilitator_emp_id`; `dmt_meeting_invitees.source/added_by`. **The owner must restart the backend** for any of it
  to exist. Until then, respawning fails against the converted stage columns on an OLD running backend (its INSERT has no stage).
- **New generic `DMT_RESOURCES` options:** `afterWrite(action, before, after, user)` (audit hooks), `rowFilter(user, startIdx)`
  (who may SEE a row), `rule(action, {row, body, user})` (who may WRITE, can stamp/clean `body`), plus existing `editGuard`, `readOnly`.
- **Dry-run recipe that worked** (use it again): run a test copy `PORT=3111 node server.js`; the browser-pane preview tool reads the
  PARENT `C:\…\opl-done-superapp\.claude\launch.json`, so add a temporary config there (`npx vite --config vite.dry.config.js`,
  cwd `opl-superapp-done/frontend`, port 3002) with a temporary `frontend/vite.dry.config.js` that proxies `/api` to 3111; seed
  `localStorage.tpm_session` (flat shape, `role: 'be_lead'`) after loading `/login`; then delete both temp files and restore
  launch.json. Result of the last run: 85/86 API checks (the 1 was a wrong expectation), UI smoke clean after fixing a nested
  `<button>` in the Decision Log. Not exercised: a non-BE leadership viewer of the Meeting Audit Trail (none exists), non-English
  rendering, phone widths.
- **Demo data scripts (self-cleaning):** `backend/tools/seed_demo_pd_cycle.mjs`, `seed_demo_meetings.mjs` (`… clean`). The meeting demo
  set is currently still in the database (titles start `[DEMO] `); it affects Compliance/Analytics attendance figures until cleaned.
- **Known gaps:** attendance Edit-lock and "who may add outside people" are UI + server for marking/adding, but the Edit-lock itself is
  page-only; a wrong author-owned note/decision can be fixed by nobody but its author (no BE override, by request); the Co-facilitator
  is one per group; template invitees are no longer copied onto meetings.

## Carried tech debt (known, not yet fixed — don't rediscover, don't assume fixed)

- **No test runner, no test files.** Every `*.test.js/jsx` was deleted this session (they had
  no runner and many imported since-deleted modules). `npm run build` is the only gate. If tests
  are ever wanted again it's a fresh Vitest setup (`environment: 'jsdom'` + a `test` script).
- ~~**Mobile compatibility is partial.**~~ **Resolved** — see "Screen flexibility" below.
- **Machine endpoints have no auth.** `GET/POST/PUT/PATCH /api/machines` check neither login nor role
  (anyone who can reach the server can create/edit/deactivate machines); the route guard on the
  Machines page (`module_lead`) is client-side only, and `Machines.jsx` has an `isAdmin = role ===
  'admin'` check using a role that isn't in the real roles table. `POST /api/machines` writes a fixed
  placeholder `factory_id` (`00000000-…-0001`); `machine.factory_id` is `uuid` while `factory.id` is
  `text`, so machines can't be scoped to a plant, and `GET /api/machines` isn't plant-scoped. The
  backend also listens on `0.0.0.0`. A follow-up task was suggested; nothing done yet. (The backend's
  in-memory `mockDb` still contains a sample machine — only used if there's no DB.)
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
