# Fulcrum — MDM Specification (Module Zero)

**Status:** Living spec. MDM is the first module of the rebuild (D-012) and the foundation every other module reads from. Subordinate to `FULCRUM_VISION.md` and `ARCHITECTURE.md`; constrained by `TRAINING_HUB_SYNC_CONTRACT.md`; gated by `SECURITY_VAPT.md` §F.

**Audience:** Claude Code (build), Claude Design (MDM screens), the owner.

---

## 1. Purpose

MDM is the **single write-authority for master data**: factories, DMTs, JH groups, areas, machines, and people. Every other module reads master data from MDM's tables; no module ever defines its own copy. Downstream apps (Fulcrum Training Hub) consume it via the documented nightly sync. MDM is also where **multi-factory becomes real**: onboarding factory #2 is performed entirely inside MDM, with zero schema or code change (Architecture §2.4).

What MDM is NOT: it is not a TPM pillar, has no KPIs or workflows of its own, and does not own authentication (it owns the *people records* that auth resolves against).

---

## 2. Data model

### 2.1 The frozen core — six physical tables (D-002)

`factory`, `dmt`, `jh_group`, `area`, `machine`, `worker_profile` — exactly as they exist today, with the contracted columns listed in `TRAINING_HUB_SYNC_CONTRACT.md` §3. These tables and their data (1 factory, 2 DMTs, 8 JH groups, 18 areas, 40 machines, 80 workers as of baseline) are **preserved in place**. No row is recreated; no UUID changes (D-003).

Current FK shape (also contracted — do not restructure):
```
factory ── dmt ── jh_group ── area ── machine
   └────────────── worker_profile (factory_id, jh_group_id, dmt_id)
```

Additive changes permitted and planned:
- **`lang_pref` enum gains `'ta'`** (D-008). The live enum is named `lang_pref`, not `language_code` — corrected per D-016. Additive; coordinate with Training Hub before workers can select it (their side reads `lang_pref`).
- New columns may be added to any of the six when a real need arises (contract §6 permits). None are required for MDM v1.
- Note from contract §5: `dmt` has no `is_active`; if one is ever added, the sync won't soft-deactivate dropped DMTs — acceptable, just documented behavior.

### 2.2 New MDM tables (built around the core)

**`factory_module`** — per-factory module enablement (Architecture §7.3):
```sql
factory_module (
  id uuid PK default gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factory(id),
  module_key text NOT NULL,          -- 'jh_kpi','opl','kaizen','clti','abnormality','meetings','jh_audit','dashboards', future pillar keys
  is_enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz DEFAULT now(),
  UNIQUE (factory_id, module_key)
)
```
Navigation, routes, and dashboards render only enabled modules for the active factory. Disabling hides; it never deletes data.

**`worker_factory_membership`** — cross-factory capability, **dormant** (D-010):
```sql
worker_factory_membership (
  id uuid PK default gen_random_uuid(),
  worker_profile_id uuid NOT NULL REFERENCES worker_profile(id),
  factory_id uuid NOT NULL REFERENCES factory(id),
  is_home boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (worker_profile_id, factory_id)
)
```
Seeded with one home-membership row per existing worker. Until a real cross-factory user exists, `worker_profile.factory_id` remains the operative scope everywhere; this table is kept in sync but not yet consulted by `my_factory_id()`. Promotion to active use = new DECISIONS entry.

**`worker_group_membership`** — additional JH/DMT memberships beyond the primary (support functions: EHS, HR, Quality, etc.):
```sql
worker_group_membership (   -- as built, per D-016
  id uuid PK default gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factory(id),   -- D-016: standard RLS pattern
  worker_profile_id uuid NOT NULL REFERENCES worker_profile(id),
  jh_group_id uuid REFERENCES jh_group(id),
  dmt_id uuid REFERENCES dmt(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CHECK (num_nonnulls(jh_group_id, dmt_id) = 1)   -- D-016: exactly one grant per row
)
-- D-016: partial unique indexes are ACTIVE-ONLY — one per (worker, jh_group) and one per
-- (worker, dmt) WHERE the FK is not null AND is_active — so a removed membership can be
-- re-granted while inactive history rows persist.
```
**Semantics (contract-safe by design):** `worker_profile.jh_group_id` / `dmt_id` remain the **primary** membership — they are contracted columns the Training Hub reads, and they keep their current meaning unchanged. This table holds only *additional* memberships. A worker's effective JH groups = primary ∪ active additional rows; same for DMTs. Two helper functions, defined once and used by every module's RLS/queries: `my_jh_group_ids()` and `my_dmt_ids()` (SECURITY DEFINER, resolving both identity types, returning primary + additional). Modules that previously checked `jh_group_id = <my group>` check membership in `my_jh_group_ids()` instead.

**Authority note:** additional memberships grant *visibility and participation* in those groups' modules; they do **not** grant leadership authority. Management scope (who a jh_leader/dmt_leader can administer) follows the primary assignment only — keeps the governance model unambiguous.

**Known limitation to flag:** Training Hub sees only the primary membership (it reads the contracted columns). If multi-group audience targeting is ever needed on the Training Hub side, that's a cross-app coordination item, not something Fulcrum can fix unilaterally.

**`mdm_audit`** — who changed what in master data (SECURITY_VAPT §I.11):
```sql
mdm_audit (
  id uuid PK default gen_random_uuid(),
  factory_id uuid NOT NULL,
  actor_worker_id uuid,             -- nullable: NULL = system/service-role writer (D-016)
  entity_table text NOT NULL,        -- one of the six + the MDM tables
  entity_id uuid NOT NULL,
  action text NOT NULL,              -- 'create','update','deactivate','reactivate','pin_reset','redact'
  changed_fields jsonb,              -- old/new for updated fields; NEVER includes pin_hash or secrets
  created_at timestamptz DEFAULT now()
)
```
RLS: readable by admin only. Written by MDM Edge Functions / triggers on every master-data mutation.

### 2.3 RLS

All MDM tables follow the standard pattern (D-004): `factory_id = my_factory_id()` for SELECT; writes restricted by role as per §3 below. `mdm_audit` SELECT is admin-only. The six core tables keep their existing (already-migrated) policies; service-role read access is never restricted (contract §7).

---

## 3. Governance — who may write what

| Entity | Create / edit / deactivate | Notes |
|---|---|---|
| factory | admin (own factory settings); creating a NEW factory = platform owner via controlled seed/Edge Function | Factory creation is rare and deliberate; see §6 onboarding recipe. |
| dmt, jh_group, area | admin | Structural changes are infrequent and consequential (Training Hub audience builder reads jh_group). |
| machine | admin; dmt_leader may edit machines within own DMT | `machine_type` taxonomy kept consistent. |
| worker_profile | admin: full. jh_leader: create/edit/deactivate **apprentice & on_roll within own (primary) JH group only** (carried from prototype M2). dmt_leader: same scope across own (primary) DMT. Self: own `lang_pref`, own PIN change. | Role assignment above on_roll = admin only. No role may elevate anyone to a role ≥ their own. |
| worker_group_membership | admin; dmt_leader may add/remove additional memberships within own DMT | Additional memberships = visibility/participation only, never authority (§2.2). |
| factory_module | admin | Toggling modules per factory. |
| worker_factory_membership | admin (dormant feature; UI hidden until promoted) | |

Every write lands in `mdm_audit`. All governance is enforced server-side (RLS + Edge Functions), not by UI hiding (SECURITY_VAPT B6/B7).

---

## 4. People lifecycle (the most sensitive part of MDM)

**Create:**
- Staff (jh_leader and above): email identity via controlled Edge Function (creates Supabase Auth user + `worker_profile` row, links `supabase_user_id`). Password complexity enforced server-side (SECURITY_VAPT B2). No self-registration (B1).
- Shop floor (apprentice, on_roll): PIN identity (worker_profile row + hashed PIN; `employee_id` nullable per contract). PIN reveal/reset via the existing controlled flow, logged to `pin_reset_log` and `mdm_audit`.

**Edit:** name, employee_id, role (within governance limits), jh_group/dmt assignment, `apprentice_type` ('NAPS'/'CAT' only — new values require Training Hub CHECK coordination, contract §3.6), `lang_pref`.

**Deactivate (never delete):** sets `is_active=false`, `deactivated_at=now()`, and **revokes access at the auth layer** (ban-on-deactivate, SECURITY_VAPT B4). The Training Hub mirror soft-deactivates on next sync — correct and expected.

**DPDP erasure request (D-005):** deactivate + redact PII in place — `name` → 'Redacted Worker', `employee_id` → null, `pin_hash`/`supabase_user_id` cleared — UUID and row preserved so history and the sync stay coherent. Action logged as `redact` in `mdm_audit`. Procedure documented in the data-handling note.

**Reactivate:** admin-only; restores `is_active=true`, clears `deactivated_at`; requires re-issuing credentials.

---

## 5. Screens (MDM module UI)

All screens: four languages (master-data *names* — factories, machines, people — are stored and displayed verbatim, not translated; UI chrome is translated), desktop-first for admin work but functional on mobile, design per `DESIGN_SYSTEM.md`.

1. **Org Structure** — factory header; tree of DMT → JH group → area; create/edit/deactivate at each level; row counts and active/inactive filters.
2. **Machines** — list grouped by JH group/area; machine_type taxonomy; create/edit/deactivate; **bulk import** (§5a); each machine shows which modules reference it (read-only usage hints).
3. **People** — the heaviest screen. Roster with role/JH/DMT/status filters and search; create flows for both identity types; **bulk import** (§5a); edit; deactivate with confirmation; PIN reset (logged); role assignment within governance limits; **additional JH/DMT memberships** (add/remove, clearly labeled as participation-not-authority); language preference.
4. **Modules** — per-factory module toggles (`factory_module`), with a clear note that disabling hides but never deletes.
5. **Sync Health** — read-only panel for the owner: last Training Hub sync expectations, the contract §9 verification queries surfaced as one-click checks (run against *this* side: row counts vs baseline, recent master-data mutations), and a "trigger manual sync" instruction per contract §10. This panel is the operational guard-rail for D-002/D-003.

### 5a. Bulk import (workers & machines) — in scope for MDM v1

Single-row creation doesn't scale to 80+ workers and 40+ machines per factory, and factory #2 onboarding multiplies that. Bulk import is therefore v1 scope:

- **Flow:** download CSV template → fill → upload → **server-side validation with a full preview** (every row marked OK / error with reason) → user confirms → commit → per-row result report. Nothing is written until the confirm step; a file with errors can still commit its valid rows after explicit confirmation, with the error rows returned for fixing.
- **Workers template:** name*, role*, jh_group_code, dmt_code, employee_id, apprentice_type (NAPS/CAT), lang_pref (en/hi/gu/ta), email (required for jh_leader+), additional_jh_codes, additional_dmt_codes (semicolon-separated). PIN identities get a default PIN issued (force-change on first login); email identities get a controlled-creation Auth user.
- **Machines template:** name*, code, machine_type, jh_group_code*, area_name.
- **Validation server-side in an Edge Function** — same rules as single-create (governance limits, enum values, FK resolution by code/name, duplicate detection by employee_id/name+group). Import is a privileged action: admin only.
- **Files:** csv/xlsx only, allow-list + content validation per SECURITY_VAPT §E1–E4; the upload itself is transient (parsed and discarded, not stored in the bucket).
- **Audit:** one `mdm_audit` row per created/updated entity plus one summary row per import batch.
- **Hard rule:** import NEVER updates or deletes existing rows in v1 — create-only, with duplicates rejected. (Updating via import is a sharp knife near contracted data; revisit deliberately via DECISIONS if needed.)

---

## 6. Tenant onboarding recipe (the multi-factory proof)

Adding factory #2 must be **data only** (Architecture §2.4). The recipe MDM must support end-to-end through its UI (plus one controlled seed step for the factory row itself):

1. Create `factory` row (code unique, stable UUID minted once, forever).
2. Create its DMTs → JH groups → areas → machines in Org Structure / Machines screens.
3. Create its people in People screen (both identity types).
4. Enable its modules in the Modules screen.
5. Done — no schema change, no code change, no redeploy. The Training Hub sync picks up the new rows automatically on the next nightly run (contract §6 ✅ "Add NEW factories").

A dry-run of this recipe (create a test factory, then deactivate it) is part of MDM acceptance testing.

---

## 7. Contract protection (non-negotiable build discipline)

For every migration step that touches any of the six core tables, Claude Code follows the contract §14 checklist, and after each step:
1. Trigger a manual Training Hub sync (contract §10) — or, when not feasible from this side, run the local equivalents: row counts ≥ baseline (factory 1, dmt 2, jh_group 8, area 18, machine 40, worker 80), no unexpected `is_active` flips, all contracted columns present with correct types.
2. Run the UUID-drift check: every pre-migration `id` still present post-migration, per table.
3. Any failure → roll back immediately; do not proceed.

These checks are scripted once (SQL file in the repo, surfaced in the Sync Health screen) and reused at every step.

---

## 8. Out of scope for MDM v1 (deliberate deferrals)

- Cross-factory UI (D-010 — dormant).
- Master-data name translation (names verbatim; revisit if a real multilingual-naming need appears).
- Shift/team modeling (no current consumer; add when a module needs it — contract §6 permits new tables freely).
- Update/delete via bulk import (create-only in v1, §5a).
- Any change to the sync mechanism itself (contract §2 — outside this spec; coordinate with Training Hub owner if ever desired).

---

## 9. Build order & acceptance

**Build order:**
1. Schema: new tables (`factory_module`, `worker_group_membership`, `worker_factory_membership`, `mdm_audit`) + `'ta'` enum value + the `my_jh_group_ids()` / `my_dmt_ids()` helpers + RLS + audit triggers — applied and verified in Supabase first (Architecture §8.2).
2. Seed: module-enablement rows for NPF (current modules), home-membership rows for all 80 workers.
3. Contract-protection script (§7) committed to repo and run as a baseline.
4. Hooks (`src/hooks/useMdm*.ts`) — typed, against the real schema.
5. Screens 1–4, then bulk import (5a), then Sync Health (5).
6. Tests: governance matrix (each role × each entity × create/edit/deactivate), cross-factory isolation on all MDM tables, multi-membership resolution (`my_jh_group_ids()` returns primary + additional, authority stays primary-only), lifecycle (create→deactivate→reactivate, redaction), bulk-import validation (bad rows rejected with reasons; create-only enforced), onboarding dry-run (§6).

**Acceptance = all of:** SECURITY_VAPT §F gate passes; §7 checks green; onboarding dry-run succeeds; a bulk import of ≥20 mixed-validity rows behaves per §5a; the 80 existing workers and all existing master data untouched (same UUIDs, same values); Training Hub's next nightly sync succeeds with no unexpected soft-deactivations.
