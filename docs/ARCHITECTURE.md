# Fulcrum — Architecture

**Status:** Living document. Defines *how* Fulcrum is built. Subordinate to `FULCRUM_VISION.md` (the *why*) and paired with `DECISIONS.md` (the *when & because*). Per-module specs inherit from this document.

**Audience:** Claude Code (primary), Claude Design (the i18n and component constraints), and any human engineer.

---

## 0. How to read this document

This is the contract for the foundation. The five pillars of the architecture are:
1. **Multi-tenancy** — every row belongs to a factory; isolation is enforced in the database.
2. **Master Data Management (MDM)** — the governed core other apps depend on.
3. **Security, privacy & compliance** — DPDP, data-privacy, VAPT-readiness, designed in.
4. **Internationalization (i18n)** — four languages by design, plus on-demand content translation.
5. **Modularity** — pillars as independently shippable, per-factory-toggleable modules.

Plus the **stack & conventions** that everything obeys. Each is a section below.

---

## 1. The stack (fixed; do not re-litigate without a DECISIONS.md entry)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite | SPA. |
| Styling | Tailwind CSS + shadcn/ui | Design tokens defined in `DESIGN_SYSTEM.md`. |
| State/data | TanStack Query (React Query) | Server state via hooks; no Redux. |
| Backend | Supabase (Postgres + Auth + Edge Functions + Storage) | Single Supabase project: `joryoadrvisizkkspuov`. |
| Auth | Supabase Auth (email/SSO) **+** custom PIN auth (shop floor) | Dual identity model, §3. |
| Hosting | Cloudflare Pages | Deploys from `main`. Site: tpm-fulcrum.pages.dev. |
| Repo | `maruts28/tpm-fulcrum` | Planning docs live in `docs/`. |

Build conventions:
- File creation > 100 lines: build iteratively, never one shot.
- Every Supabase query through a typed hook in `src/hooks/`.
- No secret ever in client code or committed to the repo.
- Every module ships with tests (Vitest).

---

## 2. Multi-tenancy — the factory is the tenant

### 2.1 The rule
**Every domain row is owned by exactly one factory.** `factory_id` is present on every business table and is the primary isolation boundary. There is no such thing as "the factory" — the current factory is always derived from the authenticated identity, never hardcoded.

> Any code or seed that hardcodes a factory UUID is a defect. The single exception is documented reference data during the transition, and even that is being removed.

### 2.2 How the current factory is known
The production pattern (keep it, it works) is the `my_factory_id()` SECURITY DEFINER Postgres function, used in every RLS policy:

```sql
-- Resolves the caller's factory from either identity type:
-- email/SSO users via auth.uid(); PIN users via the x-factory-id request header.
my_factory_id() RETURNS uuid
```

RLS policy shape on every business table:
```sql
FOR SELECT USING (factory_id = my_factory_id())
FOR INSERT WITH CHECK (factory_id = my_factory_id())
FOR ALL    USING (factory_id = my_factory_id())
```
Never use the older `auth_role()` / `auth_factory_id()` JWT-claim helpers — they don't work for PIN users and are being fully removed.

### 2.3 Cross-factory roles (designed in, built when needed)
Most users are factory-scoped. Some (corporate TPM, central BE) need to see across factories. The model must express this without breaking single-factory isolation:
- A user has a **home factory** and a set of **factory memberships** (one row each).
- `my_factory_id()` returns the home/active factory for scoped operations.
- Cross-factory roles get an additional capability checked by a separate helper (e.g. `can_see_all_factories()`), and cross-factory views/queries are explicit and audited — never the default path.
- Until a real corporate user exists, build the membership structure but keep the single-factory path as the only active one. Do not over-build speculative cross-tenant UI.

### 2.4 Tenant onboarding goal
Adding factory #2 must require **data only** — insert a `factory` row, its DMTs/JH groups/areas/machines, its people — with **zero schema change and zero code change**. Any module that can't onboard a new factory by data alone is incomplete.

---

## 3. Identity & auth — dual model

### 3.1 Two identity types, one person model
- **Email / SSO identity** — staff (jh_leader and above). Supabase Auth. May move to ITC SSO later; the model must not assume password auth forever.
- **PIN identity** — shop floor (apprentice, on_roll). No email. Custom PIN auth via Edge Function; session held client-side; factory passed via `x-factory-id` header so `my_factory_id()` resolves.

Both resolve to the **same `worker_profile` row** keyed by the permanent worker UUID. Identity type is an implementation of how someone logs in; it is not a different kind of person.

### 3.2 The permanent identity key
`worker_profile.id` (uuid) is the person's identity across the entire ecosystem and is **never regenerated** (Vision §5.8, Training Hub contract rule #1). All history — attendance, scoring, audit, Training Hub records — hangs off it.

### 3.3 Roles
The role ladder is defined in `FULCRUM_VISION.md` §4. Authority checks use an ordered comparison (`roleAtLeast`) defined once and imported everywhere — never re-implemented per module. The order, lowest→highest:
`apprentice → on_roll → jh_leader → dmt_member → dmt_leader → pillar_champion → be_team → admin`
Roles are stored as data on `worker_profile`; adding a role is additive.

---

## 4. Master Data Management (MDM) — the governed core

> Full schema and module behavior in `MDM_SPEC.md`. This section sets the architectural rules MDM obeys.

### 4.1 Why MDM is module zero
Master data (factories, DMTs, JH groups, areas, machines, people) is:
- the foundation every other module references,
- a **published contract** consumed by external apps (Training Hub syncs it nightly),
- the thing that makes multi-factory real.

So it is built **first** in the rebuild, and built as a real managed module — not as tables that accrete by side-effect.

### 4.2 The six contract tables are physical and additive-only
Per `DECISIONS.md` (six-tables-physical) and `TRAINING_HUB_SYNC_CONTRACT.md`, these six tables stay as physical tables, keep their names, keep their listed columns/types, keep their UUIDs, keep their FK shape, stay in `public`, and keep service-role read access:

`factory`, `dmt`, `jh_group`, `area`, `machine`, `worker_profile`

We may **add** columns and **add** tables around them. We may not rename, drop, retype, or restructure the contracted columns, nor regenerate UUIDs. If a future need demands restructuring underneath, the escape hatch is a backward-compatible VIEW that reconstructs the exact contracted shape — but the default and strongly-preferred path is physical preservation.

The MDM module's richness (multi-factory hierarchy management, machine taxonomy, org structure, people governance) is built **in and around** these six tables, not by replacing them.

### 4.3 MDM is the write-authority for master data
Master data is created and edited **in Fulcrum's MDM module** by authorized roles (admin, and scoped delegation). Other modules read it; they never define their own copies of factories/machines/people. Downstream apps (Training Hub) read it via the documented sync. One source of truth, many readers.

### 4.4 The Training Hub sync is a frozen interface
The nightly REST sync (`TRAINING_HUB_SYNC_CONTRACT.md`) must keep working through and after the rebuild. Every migration step is checked against the contract's §9 verification queries. UUID drift is the catastrophic failure mode and is explicitly tested for. See `ROADMAP.md` for the verification gate built into the MDM rebuild.

---

## 5. Security, privacy & compliance — designed in

> This section is a posture applied to *every* module, not a module itself. When security and feature velocity conflict, security wins (Vision §5.7).

### 5.1 Threat model in one paragraph
Fulcrum holds factory operational data (competitively sensitive) and employee personal data (DPDP-regulated). The realistic threats: a logged-in user reaching another factory's or another person's data they shouldn't; a leaked credential or service key; injection via user-submitted content; insecure direct object references on files (the OPL/Kaizen photos, some of which carry proprietary process detail); and data exfiltration through misconfigured storage or over-permissive APIs. The architecture answers each.

### 5.2 Tenant & row isolation (the primary control)
- RLS is **on for every table**, no exceptions, enforced at the database — not in application code that could be bypassed.
- Isolation is `factory_id = my_factory_id()` plus, where relevant, ownership/role refinements.
- The service-role key is used **only** server-side (Edge Functions, the Training Hub sync) and never shipped to the client.

### 5.3 Personal data & DPDP
- **Data minimization:** collect only what TPM needs. `worker_profile` holds work identity, not surplus personal data.
- **Purpose limitation & transparency:** documented in a data-handling note; what's collected and why is explicit.
- **Right to access/correction/erasure:** the model supports producing, correcting, and (soft-)removing a person's data. Because the worker UUID is permanent and referenced across the ecosystem, "erasure" is implemented as deactivation + PII redaction rather than hard delete, and the approach is documented for DPDP defensibility.
- **Consent & roles:** access to personal data is role-gated; an apprentice cannot enumerate other people's records beyond what their work requires.
- **Data residency / processor:** Supabase region and sub-processor posture recorded in the data-handling note.

### 5.4 Files & proprietary content
- The storage bucket (`tpm-uploads`) is **private**. No public URLs.
- Access is via signed URLs minted by an Edge Function (`sign-url`) that verifies the caller's identity (PIN via `x-worker-id`, email via JWT) **and** that the requested path belongs to the caller's factory before signing.
- Storage path always begins with the factory UUID so ownership is checkable from the path: `{factory_id}/{...}/{file}`.

### 5.5 Input handling & injection
- All writes go through PostgREST/Edge Functions with parameterized queries; no string-built SQL.
- User-submitted content is treated as untrusted: escaped on render, never interpolated into queries or HTML.
- Edge Functions validate identity and authorize the specific action; "the function is callable" never implies "the caller may do this."

### 5.6 Secrets & configuration
- Secrets (service-role key, Training Hub keys, any third-party keys) live in Edge Function secrets / environment config, never in the repo, never in client bundles.
- `.env` is git-ignored; client only ever sees the anon key and public URL.

### 5.7 Auditability
- Security-relevant actions (auth, role changes, master-data edits, approvals, deletions) are logged with actor UUID and timestamp.
- The permanent worker UUID makes the audit trail coherent over time.

### 5.8 VAPT readiness
The system is built to survive a Vulnerability Assessment & Penetration Test:
- No IDOR (every object access is authorization-checked, including files).
- No tenant bleed (RLS proven by tests that attempt cross-factory access and must fail).
- No secret exposure (bundle and repo scanned).
- Sensible headers/CSP at the Cloudflare layer.
- A pre-VAPT self-checklist is maintained as the security posture matures.

### 5.9 The standing security rules for every module
1. RLS on, `factory_id = my_factory_id()`, every table.
2. No service-role key client-side.
3. Files private; access only via identity-and-factory-checked signed URLs.
4. Personal data role-gated and minimized.
5. Every Edge Function authorizes the specific action, not just the caller's existence.
6. Add a row to `DECISIONS.md` for any choice that widens the attack surface.

---

## 6. Internationalization (i18n) — four languages by design

> The brief for how this looks and behaves in the UI is echoed in `DESIGN_SYSTEM.md`. This section sets the architecture.

### 6.1 The four languages
**English (default), Hindi, Gujarati, Tamil.** Every surface ships in all four. A language missing on any surface is a defect, not a backlog item.

### 6.2 Two distinct problems, two mechanisms
i18n here is **not** one problem. It is two:

**(a) Static UI translation** — labels, buttons, headings, system messages. Mechanism: a translation framework (react-i18next or equivalent) with one message catalog per language (`en`, `hi`, `gu`, `ta`). Rules:
- Every user-facing string comes from the catalog; no hardcoded English in components.
- `fallbackLng: 'en'` so a missing key shows English, never a raw key string.
- All four catalogs are kept key-complete as a build/review gate.
- The active language is: the user's `lang_pref` once authenticated; a login-page language toggle (persisted) before auth; English by default.
- The login page is always English by default with a visible language switcher (the user hasn't been identified yet).
- A language toggle is present on **every** authenticated surface; changing it updates `i18n` immediately, persists to `worker_profile.lang_pref`, and (for PIN users) to the local session.

**(b) On-demand content translation** — the *free text people submit* (OPL before/after remarks, Kaizen problem/solution descriptions, abnormality notes, meeting minutes). A worker writes in Gujarati; a Tamil-reading reviewer needs to understand it. Mechanism: **borrow the approach already proven in the Fulcrum Training Hub** — a translate control on submitted content that translates on demand at read time, with source-language awareness. Architectural requirements:
- Original content is **always stored verbatim** in the language it was written; translation is a read-time augmentation, never a destructive overwrite.
- Source language is captured or detected so transliteration cases are handled correctly (the Training Hub solved romanized-Gujarati/Hindi issues — reuse that handling).
- Translation is invoked explicitly by the reader (a control), not auto-run on every render, to control cost and latency.
- The translation service/integration is server-mediated so no key is exposed and usage is governable.

> Before building (b), extract the Training Hub's translation implementation as the reference. Do not reinvent it. `ROADMAP.md` notes this as a dependency for the first content-bearing module.

### 6.3 Data implications
- `worker_profile.lang_pref` is a contracted column (Training Hub reads it) — values `'en' | 'hi' | 'gu' | 'ta'`. Adding `'ta'` to the language set is an **additive enum change**; confirm it doesn't violate the Training Hub CHECK (the contract notes lang_pref is read for the trainee UI). Flag in `DECISIONS.md` and coordinate if Training Hub constrains the value set.
- Content tables store original text + detected/declared source language; translated text is not persisted as a replacement.

---

## 7. Modularity — pillars as independent modules

### 7.1 The principle
Each TPM pillar (Vision §3.1) is a module that can be **built, shipped, enabled, and disabled independently, per factory.** A factory running only JH and a factory running all eight share one codebase, differing by configuration.

### 7.2 What a module owns
A module owns its own tables (all `factory_id`-scoped, all RLS-on), its hooks, its routes, its screens, its i18n keys, and its tests. It reads master data from MDM; it never redefines master data. It declares what it escalates to or depends on from other modules through explicit interfaces, not hidden coupling.

### 7.3 Per-factory enablement
A factory has a set of enabled modules (data, not code). Navigation, routes, and dashboards reflect only enabled modules for the active factory. Disabling a module hides it without deleting its data.

### 7.4 The current modules (JH pillar) and their status
Carried from the prototype, to be re-grounded on the new foundation per `ROADMAP.md`:
- KPIs (machine-level daily KPIs) — built
- OPL (one-point lessons, with training/star/retraining) — built
- Kaizen (two-stage, scored, DMT escalation) — built
- CLTI, Abnormalities (polish), JH Meetings, JH Audit, Training, Dashboards/Leaderboard — pending

### 7.5 Shared connective tissue (not owned by any single pillar)
- **Dashboards & leaderboards** read across modules; they live in a shared analytics layer that depends on modules, not vice-versa.
- **R&R scoring** is cross-module (abnormalities + Kaizen + OPL + …) and is defined once.
- **Review cadences & the audit ladder** span pillars and are modeled as shared concerns.

---

## 8. Conventions that prevent drift

1. **One source of truth per concept.** Roles, the role-order comparison, factory resolution, signed-URL access, i18n setup, worker-name lookup — each defined once, imported everywhere. Never re-implemented per module.
2. **Schema before code.** A module's tables, RLS, and any functions are designed and applied in Supabase first, verified, *then* the hooks and UI are built against the real schema. (The prototype repeatedly hit "column doesn't exist" by writing code against assumed schemas — don't.)
3. **Read the real schema, never assume it.** Before writing a query, confirm the actual columns.
4. **Every cross-cutting decision is logged** in `DECISIONS.md` with date and rationale.
5. **The Training Hub contract is checked** before and after any master-data change, using its §9 queries.
6. **Tests are part of the module,** not a later phase — especially a test that proves cross-factory isolation holds.
