# Training Hub ↔ TPM Fulcrum Sync Contract

**Audience:** the agent (or human) re-architecting the TPM Fulcrum app.
**Purpose:** document the cross-system data dependency so the re-architecture does not silently break the Fulcrum Training Hub.

This is a contract, not a suggestion. The Training Hub is a separate production app that reads master data from TPM Fulcrum nightly. Breaking this contract corrupts attendance history, breaks audience matching, and silently degrades reporting until someone notices days later.

---

## TL;DR — the four hard rules

1. **Worker UUIDs are forever.** A given worker's `worker_profile.id` must never change. Migrating to a new schema must preserve the same UUID for the same person. If you regenerate UUIDs, every existing attendance row and every reconciliation match in Training Hub becomes orphaned and there is no automatic recovery path.

2. **Six source tables and their column lists are part of the contract** (see §3 below). You cannot rename, drop, or restructure these tables without also providing a backward-compatible view that exposes the original shape. The sync code requests specific columns via REST and will fail the moment one is missing.

3. **Some columns are read-by-Training-Hub and must not change semantics.** `worker_profile.role`, `worker_profile.apprentice_type`, `worker_profile.is_active`, `worker_profile.lang_pref`, and the FK columns (`factory_id`, `jh_group_id`, `dmt_id`) are interpreted by Training Hub logic. Enum values CAN be added; column types and meanings CANNOT change.

4. **You can freely change anything Training Hub doesn't read.** New tables, new columns, internal refactors, dropping unused columns (e.g., `pin_hash`), changing TPM-only RLS, restructuring TPM-specific features — all fine. See §6 for what's safe.

If you only read one section, read §3 (the column contract), §4 (the UUID rule), and §6 (what's safe to change).

---

## 1. Systems involved

| | Project ref | Role |
|---|---|---|
| **TPM Fulcrum** (you're re-architecting this) | `joryoadrvisizkkspuov` | Source of truth for factory master data |
| **Fulcrum Training Hub** | `opvdxubkxyghylxgnrhn` | Consumer — copies master data into local mirror tables nightly |

Code repos:
- TPM Fulcrum: `maruts28/tpm-fulcrum` (being re-architected)
- Training Hub: `maruts28/fulcrum-training-hub` (do not modify in this re-architecture)

---

## 2. The sync mechanism (existing, healthy as of 2026-06-08)

```
pg_cron (Training Hub)
   └── pg_net.http_post → Edge Function `sync-master-data` (Training Hub)
          └── REST API fetch → TPM Fulcrum (joryoadrvisizkkspuov)
                 └── Upsert by id → mirror tables (Training Hub)
                 └── Log to sync_log (Training Hub)
```

- **Schedule:** `30 21 * * *` (cron expression) → 21:30 UTC daily = 03:00 IST
- **Cron job name:** `fulcrum-training-hub-master-sync` (in Training Hub's `cron.job`)
- **Edge Function:** `sync-master-data` (in Training Hub project)
- **Authentication:** Training Hub holds TPM Fulcrum's service role key in Edge Function secrets (`T3_SUPABASE_SERVICE_KEY`) and Project URL (`T3_SUPABASE_URL`)
- **API used:** Supabase REST (PostgREST) at `${T3_URL}/rest/v1/<table>?select=<cols>&limit=1000&offset=N&order=id.asc`
- **Page size:** 1000 rows per page, batched 500 per upsert
- **Idempotent:** safe to re-run anytime (upsert by id); manual invocation via POST to the Edge Function

This contract assumes the existing sync mechanism remains in place. If you want to redesign the sync itself (e.g., replace REST polling with logical replication, or with a foreign data wrapper), coordinate explicitly with the Training Hub owner — that is outside this contract.

---

## 3. The column contract — what TPM Fulcrum MUST continue to expose

For each source table, Training Hub reads exactly these columns. If any column listed below is missing, dropped, renamed, or has its type changed incompatibly, the next sync (next 21:30 UTC) will fail for that table.

### 3.1 `factory`
Columns read: `id, name, code, location, is_active, created_at`

Constraints:
- `id` is uuid, must be stable per factory
- `code` is unique
- `is_active` is boolean; used to soft-deactivate the mirror row if a factory is dropped

Current production row count: **1**

### 3.2 `dmt`
Columns read: `id, factory_id, name, code, created_at`

Constraints:
- `id` is uuid, stable
- `factory_id` references `factory.id`

Current production row count: **2**

### 3.3 `jh_group`
Columns read: `id, factory_id, dmt_id, name, code, is_active, created_at`

Constraints:
- `id` is uuid, stable
- FKs: `factory_id`, `dmt_id`
- `is_active` used for soft-deactivation

Current production row count: **8**

This table feeds Training Hub's audience builder (`jh_group_mirror` is selectable when adding intended audience to a campaign). Workers belonging to a JH group are expanded into individual rows at audience-build time.

### 3.4 `area`
Columns read: `id, factory_id, jh_group_id, name, is_active`

Constraints:
- `id` uuid, stable
- FKs: `factory_id`, `jh_group_id`
- `is_active` used for soft-deactivation

Current production row count: **18**

### 3.5 `machine`
Columns read: `id, factory_id, jh_group_id, area_id, name, code, machine_type, is_active, created_at`

Constraints:
- `id` uuid, stable
- FKs: `factory_id`, `jh_group_id`, `area_id`

Current production row count: **40**

### 3.6 `worker_profile` — THE MOST IMPORTANT TABLE

Columns read: `id, factory_id, employee_id, name, role, apprentice_type, jh_group_id, dmt_id, lang_pref, is_active, created_at, last_login_at, deactivated_at`

Constraints:
- `id` uuid — **THIS IS THE PERSON'S IDENTITY KEY ACROSS BOTH SYSTEMS. Never change it.**
- `employee_id` is nullable text (T3 allows workers without employee_id)
- `name` is text NOT NULL
- `role` is currently a TPM enum; Training Hub stores it as text via stringification, so adding/removing enum values is safe
- `apprentice_type` is currently a TPM enum with values `'NAPS'`, `'CAT'`, or null; Training Hub's CHECK constraint accepts these three values only — adding new values requires updating Training Hub's CHECK
- `lang_pref` is a `language_code` enum value (e.g., 'en'/'hi'/'gu'); used by the trainee-facing UI
- `is_active` boolean — drives soft-deactivation
- All FK columns must reference valid `factory.id`, `jh_group.id`, `dmt.id`

**Columns Training Hub explicitly does NOT read:** `pin_hash`, `supabase_user_id`. These are TPM auth secrets. You may keep them, drop them, restructure them — Training Hub doesn't care.

Current production row count: **80** workers

---

## 4. The UUID preservation rule (the #1 contract)

> **Every `id` UUID in the six source tables must remain stable across the re-architecture.**

Why this matters:

- Training Hub stores `worker_profile_mirror.id = <same UUID>`. Sync upserts by id.
- `training_attendance.worker_profile_mirror_id` points at this UUID. There are months of historical attendance.
- Campaign audience matching (`intended_participant.worker_profile_mirror_id`) uses this UUID.
- The auto-match trigger on attendance insert matches by UUID equality. If UUIDs change, every worker is treated as a brand new person, all historical attendance is orphaned, all confirmed campaign matches become invalid, and the existing 80 workers in `worker_profile_mirror` get soft-deactivated as "missing from T3" on the next sync.

**If you absolutely must regenerate UUIDs** (e.g., you're moving to a new database that auto-generates them):
1. Stop the cron in Training Hub before the migration
2. Compute a mapping `old_uuid → new_uuid` for every row in all six tables
3. Apply that mapping to ALL Training Hub tables that reference these UUIDs (see §7)
4. Resume the cron only after every UUID has been migrated end-to-end

This is non-trivial. Avoid it unless there's no alternative. Better: preserve the existing UUIDs even if the rest of the schema changes.

---

## 5. Other semantics Training Hub depends on

### `is_active` flag drives soft-deactivation
For tables with `is_active` (`factory`, `jh_group`, `area`, `machine`, `worker_profile`), the sync compares local IDs to T3 IDs. Anything present locally but missing from T3 gets `is_active = false`. So:
- If you HARD-DELETE a worker from `worker_profile`, the next sync soft-deactivates them in `worker_profile_mirror`. Historical attendance still resolves correctly (the UUID still exists in the mirror, just `is_active=false`).
- If you set `is_active = false` directly in T3, the mirror inherits that.
- The mirror is never hard-deleted by the sync — it only ever toggles `is_active`.

### `role` and `apprentice_type` are stringified
Training Hub stores these as `text`. Adding new enum values to either column is safe. Changing the column type to something other than enum/text is not.

### `lang_pref` defaults to 'en' if null
If TPM Fulcrum returns null for `lang_pref`, Training Hub stores `'en'`. Safe to leave as null in T3.

### `dmt` is read in the sync but has no `is_active` column
The sync code calls `syncSimpleTable("dmt", "dmt_mirror", ..., hasIsActive=false)`. If you add an `is_active` column to `dmt` in the new schema, the sync will continue to work but won't soft-deactivate dropped DMTs — they'll persist in the mirror until manually cleaned. Not a contract violation, just a behavior note.

---

## 6. What you CAN change freely

This is the permissive list — these changes do not affect Training Hub:

✅ **Add new tables to TPM Fulcrum.** Training Hub doesn't see them.

✅ **Add new columns to any source table** (`factory`, `dmt`, `jh_group`, `area`, `machine`, `worker_profile`). The sync's REST select is column-specific; unknown new columns are simply not requested.

✅ **Drop columns Training Hub doesn't read** — including `pin_hash`, `supabase_user_id` on `worker_profile`. Verify by checking that the dropped column is not in the lists under §3.

✅ **Add new enum values** to `role` or `apprentice_type`. Adding to `apprentice_type` may require updating Training Hub's CHECK constraint — flag if you do this.

✅ **Refactor TPM Fulcrum internals**: RLS policies on these tables (as long as service role still reads everything), Edge Functions, triggers, views, indexes, business logic that DOESN'T touch the column contract above.

✅ **Restructure relationships you don't expose to Training Hub.** E.g., if you introduce a `shift` or `team` table that doesn't yet appear in the column lists above, that's purely internal.

✅ **Rename columns Training Hub doesn't read.**

✅ **Add NEW factories**, new workers, new groups, new machines. The sync picks them up automatically on the next nightly run.

---

## 7. What you CANNOT change without coordination

🚫 **Change any worker's `worker_profile.id` UUID.** See §4.

🚫 **Rename any of the six source tables.** The sync hardcodes them as `factory`, `dmt`, `jh_group`, `area`, `machine`, `worker_profile`.

🚫 **Rename any column read by the sync** (the lists in §3).

🚫 **Drop any column read by the sync.**

🚫 **Change types incompatibly.** E.g., changing `worker_profile.id` from uuid to bigint, or `is_active` from boolean to text. Adding precision (e.g., `created_at timestamp` → `timestamptz`) is generally fine.

🚫 **Move tables to a non-public schema.** The sync uses Supabase REST which assumes `public.`.

🚫 **Remove or restrict service-role access** to these six tables on the TPM Fulcrum side. The sync authenticates as service role.

🚫 **Restructure FK relationships** (e.g., flattening `area` into `jh_group`, or making `worker_profile.factory_id` derived through a join). Training Hub's audience expansion logic assumes the current FK shape.

**Backward-compatibility escape hatch:** if you genuinely need to restructure (e.g., split `worker_profile` into `person + role_assignment`), create a `worker_profile` VIEW that reconstructs the original shape including all columns in §3.6 with the same names and types. Training Hub will continue to work against the view as if it were the original table. The same pattern applies to any of the six tables.

---

## 8. Failure modes and how Training Hub reacts

If you break the contract, here's what happens (and what you'll see):

| Change in TPM Fulcrum | Training Hub effect | When user notices |
|---|---|---|
| Rename a read column | Next 21:30 UTC sync logs `status='failed'` for that table with the REST error. Other tables continue. Mirror data goes stale. | Banner on Training Hub home (see §10) — within ~hours. Or: never, if no one looks. |
| Drop a read column | Same as rename. |  |
| Drop a table | Same as rename for that table. Other tables continue. | Same. |
| Move table to non-public schema | REST returns 404. Sync fails for that table. | Same. |
| Change UUID of an existing worker | Old UUID disappears from T3 result. Sync soft-deactivates the old `worker_profile_mirror` row, inserts a "new" worker with the new UUID. All historical attendance is silently orphaned. | **Silent corruption.** No log entry indicates this is wrong; the sync reports success. Could go undetected for weeks. |
| Add a new column | No effect — sync ignores unknown columns. | N/A |
| Add a new enum value to `role` | No effect — Training Hub stores as text. | N/A |
| Add a new enum value to `apprentice_type` | New value rejected by Training Hub's CHECK constraint on `worker_profile_mirror`. Sync fails for that table. | Banner / sync_log. |
| Restrict service-role access | Sync fails with 401/403. | Banner / sync_log. |

**The dangerous case is silent UUID drift** (regenerating UUIDs as part of "cleanup"). The sync reports success, the data is corrupt. The other cases are loud (sync_log shows the error). UUIDs are forever.

---

## 9. Verification — how to check the contract is intact

Run these queries on the **Training Hub** Supabase project (`opvdxubkxyghylxgnrhn`) before, during, and after any TPM Fulcrum migration step.

### 9.1 Is the cron alive and firing?
```sql
SELECT runid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'fulcrum-training-hub-master-sync')
ORDER BY start_time DESC
LIMIT 10;
```
Expected: 10 rows, all `status='succeeded'`, ~24h apart at 21:30 UTC.

### 9.2 Did the actual syncs succeed per-table?
```sql
SELECT run_at, table_name, status, error_message,
       rows_inserted, rows_updated, rows_soft_deactivated, duration_ms
FROM sync_log
WHERE run_at > now() - interval '3 days'
ORDER BY run_at DESC, table_name;
```
Expected per nightly run: 6 rows, all `status='success'`, `error_message IS NULL`. Counts should roughly match the totals in §3.

### 9.3 Are mirrors fresh?
```sql
SELECT 'factory_mirror' AS t, count(*) AS rows, max(mirror_synced_at) AS last_sync FROM factory_mirror
UNION ALL SELECT 'dmt_mirror', count(*), max(mirror_synced_at) FROM dmt_mirror
UNION ALL SELECT 'jh_group_mirror', count(*), max(mirror_synced_at) FROM jh_group_mirror
UNION ALL SELECT 'area_mirror', count(*), max(mirror_synced_at) FROM area_mirror
UNION ALL SELECT 'machine_mirror', count(*), max(mirror_synced_at) FROM machine_mirror
UNION ALL SELECT 'worker_profile_mirror', count(*), max(mirror_synced_at) FROM worker_profile_mirror;
```
Expected (as of 2026-06-08 baseline): factory=1, dmt=2, jh_group=8, area=18, machine=40, worker=80. `last_sync` within the last 24h.

### 9.4 UUID drift detector — run after any TPM-side data migration
```sql
-- Workers in Training Hub that are now missing from a fresh TPM read
-- (run manually after major changes — if non-zero, you've broken UUID stability)
SELECT count(*) AS orphaned_workers
FROM worker_profile_mirror
WHERE is_active = false
  AND deactivated_at IS NULL  -- T3 didn't intentionally deactivate them
  AND mirror_synced_at > now() - interval '2 days';
```
Expected: 0. Non-zero means workers were "deactivated" by the sync (not by TPM Fulcrum itself), which means their UUIDs disappeared from T3 — a contract violation.

---

## 10. Operational alerting

A "sync health" indicator should be added to Training Hub's home page (banner shown to admin/coordinator when last sync is stale or has any failure in the last 36 hours). This is being built separately.

If you make any change in TPM Fulcrum that you suspect might affect the sync, **trigger a manual sync immediately after**. To get the working invocation, run this on the Hub project and use the exact command it returns (it carries its own Authorization header), changing `run_type` to `'manual'`:
```sql
-- On Training Hub project:
SELECT command FROM cron.job WHERE jobname = 'fulcrum-training-hub-master-sync';
```
(The previous template here referenced `current_setting('app.settings.edge_anon_key')` — that parameter was never configured on the Hub project and the call fails. Do not paste the actual key into this document. **Cross-repo item:** the Hub-repo copy of this contract needs the same fix — owner will carry it.)

Then re-check §9.2 to see if the new run succeeded. Don't wait until 21:30 UTC to find out.

---

## 11. Migration coordination protocol

If you're about to make a change that COULD break the contract:

1. **Confirm whether it's actually in scope.** Cross-check §3 (read columns) and §6/§7 (free vs. restricted). Most refactors are safe.

2. **If unsure:** stop and ask the Training Hub owner. Don't proceed on assumption.

3. **For unavoidable breaking changes:**
   - Add a backward-compatibility VIEW that exposes the original shape (table name + column names + types)
   - The view must include all columns Training Hub reads (§3)
   - Verify via §9 after deploying the view
   - Only then proceed with the underlying restructure

4. **For UUID regeneration** (last-resort scenario):
   - Coordinate with Training Hub owner BEFORE migration
   - Plan: pause cron → migrate UUIDs in T3 AND in Training Hub mirror AND in all downstream tables in one transaction window → resume cron
   - This is multi-hour work; do not attempt incrementally
   - Affected Training Hub tables include: `worker_profile_mirror`, `factory_mirror`, `dmt_mirror`, `jh_group_mirror`, `area_mirror`, `machine_mirror`, `training_attendance`, `training_session.trainer_id`, `training_session.created_by`, `intended_participant.worker_profile_mirror_id`, `attendance_match.*`, and possibly more

---

## 12. Baseline as of 2026-06-08

Last successful sync: **2026-06-08 21:30 UTC** — all 6 tables succeeded, no soft-deactivations.

Production row counts (must remain ≥ these unless you intentionally deprecate items in T3):
- factory: 1
- dmt: 2
- jh_group: 8
- area: 18
- machine: 40
- worker_profile: 80

Cron history: 10 of 10 last runs `succeeded`. Sync duration: ~2 seconds per run.

If post-migration any of these numbers drop unexpectedly, that's a red flag — Training Hub is soft-deactivating items because they disappeared from T3.

---

## 13. Source code references

For the agent / human who wants to read the actual implementation:

- **Sync Edge Function:** `sync-master-data.ts` in Training Hub repo (`maruts28/fulcrum-training-hub`, under `supabase/functions/sync-master-data/`). Pulls T3 via REST, upserts mirrors, writes `sync_log`.
- **Cron schedule SQL:** `04_pg_cron_setup.sql` in Training Hub deployment files. Defines `fulcrum-training-hub-master-sync` cron job.
- **Mirror schema:** `01_schema.sql` in Training Hub deployment files, section "MIRROR TABLES". Defines the six mirror tables plus the `sync_log` table.
- **The Training Hub mirror columns include Fulcrum-owned enrichment** (gender, training_category_id, etc. on worker_profile_mirror; latitude/longitude/geofence_radius_meters on factory_mirror) that exist ONLY in the mirror and are never read from or written to T3. These are local to Training Hub and irrelevant to TPM Fulcrum.

---

## 14. Quick checklist for the re-architecture agent

Before each migration step, ask:

- [ ] Does this change touch any of the six source tables (`factory`, `dmt`, `jh_group`, `area`, `machine`, `worker_profile`)?
- [ ] If yes: does it touch any column listed in §3?
- [ ] If yes: am I renaming, dropping, or retyping that column?
- [ ] If yes: do I have a backward-compat view planned? If no view, STOP.
- [ ] Does this change affect any `id` UUID? If yes, STOP and coordinate.

After each migration step:

- [ ] Trigger a manual sync (§10) and watch sync_log
- [ ] Run §9.2, §9.3, §9.4 to confirm contract integrity
- [ ] If anything is broken, ROLL BACK the TPM-side change immediately — don't let Training Hub limp on stale data

---

**End of contract. Keep this file checked into both repos:**
- `tpm-fulcrum/docs/TRAINING_HUB_SYNC_CONTRACT.md` (so anyone working on T3 sees it)
- `fulcrum-training-hub/docs/TRAINING_HUB_SYNC_CONTRACT.md` (so the consumer side is also documented)

Any updates to the sync mechanism, column list, or rules should update BOTH copies in sync.
