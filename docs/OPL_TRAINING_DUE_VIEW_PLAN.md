# OPL Training Due — deferred plan

**Status:** Not built yet. Parked 2026-08-19, revisit later.

## Problem
`GET /api/opl/training-due` (backend/server.js) queries `opl_training_due_v`, a database view that
was never created in the local `superdb`. Powers `frontend/src/pages/opl/OPLTrainingDue.jsx` (worker's
own due/retraining queue + JH-leader's group due-board). Currently errors: `relation
"opl_training_due_v" does not exist`.

## What exists in the schema
`opl_training_assignment`: one row per (opl, worker) — `opl_id`, `jh_group_id`, `assigned_emp_id`,
`assigned_by_emp_id`, `status`, `assigned_at`, `completed_at`. No retrain-interval or repeat-cycle
concept — just a single assign → complete.

## What the frontend expects
Per row: `opl_id`, `title`, `is_star`, `never_trained` (bool), `days_overdue` (number). Leader board
groups by lesson with a count of people still due.

## Proposed plan (agreed direction, not yet built)
1. **View `opl_training_due_v`** — one row per pending assignment (`completed_at IS NULL`), joining
   `opl_training_assignment` → `opl_details` (title, is_star) → `user_details` (worker_name).
   Columns: `opl_id, title, is_star, jh_group_id, worker_id, worker_name, assigned_at, days_overdue`
   (`days_overdue` = `now() - assigned_at` in days).
2. **`never_trained`**: honestly `true` for every pending row, since this schema has no repeat-retrain
   cycle — it's "not yet completed," not a true retraining-overdue case.
3. **Filtering by viewer** stays in the API layer (matches the rest of the app): "My due" filters
   `worker_id = me`; leader board filters `jh_group_id = my group`.
4. **Caveat flagged to owner**: this only supports "hasn't completed assigned training yet," not real
   periodic retraining (e.g. "retrain every 6 months"). True retrain cadence is a separate, bigger
   feature (needs a retrain-interval column + tracking each completion cycle) — not in this scope
   unless explicitly requested.

## Next step when resumed
Confirm with owner: build the one-time-completion view as scoped above, or design real periodic
retraining first.
