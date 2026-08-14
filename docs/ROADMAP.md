# Fulcrum — Rebuild Roadmap

**Status:** Living document. The sequence from today's validated prototype to the super-app of `FULCRUM_VISION.md` §6. Each phase has exit criteria; a phase is not done until they pass. Contract gates (🔒) mark steps that touch the six master-data tables — the contract-protection script must be green before and after.

**Working model:** Claude.ai chat = orchestration & specs · Claude Code = build (one module/phase slice per session, plan-first) · Claude Design = visual system. Docs in `docs/` are the handoff (D-011).

---

## Phase 0 — Foundation docs & baseline (NOW)

- Commit the doc set to `docs/`: FULCRUM_VISION, ARCHITECTURE, SECURITY_VAPT, DECISIONS, MDM_SPEC, ROADMAP, DESIGN_SYSTEM, TRAINING_HUB_SYNC_CONTRACT; replace root CLAUDE.md.
- Commit the contract-protection script (SQL) and capture the baseline (row counts, UUID snapshot of the six tables). 🔒
- **Exit:** docs in repo on `main`; baseline snapshot stored; Training Hub nightly sync confirmed healthy (contract §9.1–9.3).

## Phase 1 — MDM (module zero) 🔒

Build per `MDM_SPEC.md` §9: schema (factory_module, worker_group_membership, worker_factory_membership, mdm_audit, 'ta' enum, membership helpers) → seeds → hooks → screens (Org, Machines, People, Modules, bulk import, Sync Health) → tests.
- **Exit:** MDM_SPEC acceptance criteria in full — §F security gate, contract checks green, onboarding dry-run succeeds, bulk-import test passes, all 80 workers untouched (same UUIDs), next nightly sync clean.

## Phase 2 — Platform foundations (i18n + app shell)

- i18n foundation: four catalogs (en/hi/gu/ta) key-complete, login-page language toggle (always-English default), per-user lang_pref application, language switch on every authenticated surface, Tamil fonts rendering correctly (DESIGN_SYSTEM §type).
- **Extract the Training Hub translation implementation as reference (D-009)** and stand up the on-demand content-translation service (server-mediated, original-verbatim, source-language aware). First consumer wired in Phase 3.
- App shell rebuilt on the design system: navigation driven by `factory_module` enablement, role-aware, four-language.
- Coordinate `'ta'` lang_pref with Training Hub owner before workers can select it (D-008).
- **Exit:** shell + i18n live; a PIN user and an email user can each switch languages everywhere; module toggles in MDM actually show/hide navigation; translation service callable.

## Phase 3 — Port the proven JH modules onto the foundation

Re-ground KPIs, OPL, and Kaizen: keep their proven domain logic and schemas, rebuild their surfaces on the design system, replace any single-factory/hardcoded assumptions, scope group access via `my_jh_group_ids()`, wire the translate control onto submitted content (OPL remarks, Kaizen descriptions), and bring each through the §F gate with cross-factory isolation tests. One module per session: KPIs → OPL → Kaizen.
- **Exit:** all three live on the new foundation in four languages with content translation; prototype-era code paths deleted; tests green.

## Phase 4 — Complete the JH pillar

In order: **Abnormality** completion (title, crew_type, closure rules) → **CLTI** (check items seeded from factory masters; daily OK/Not-OK; auto-abnormality on Not-OK) → **JH Meetings** (daily cadence, actions, escalations) → **JH Audit** (level 1→2→3 ladder).
- **Exit:** the JH pillar's full loop runs in Fulcrum: CLTI finding → abnormality → meeting review → closure; each module §F-gated.

## Phase 5 — Cross-module layer

Dashboards (JH + factory), Leaderboard with the R&R scoring (Abnormality + Kaizen + OPL points, defined once), review-cadence views.
- **Exit:** a JH leader's daily meeting and the factory monthly review can run entirely from Fulcrum screens.

## Phase 6 — Security consolidation & internal VAPT

Run the full ITSS battery (`SECURITY_VAPT.md` §H) internally; close findings with evidence; complete platform items §C (headers, rate limits, methods, TLS verification) and §K augmentations; produce the VAPT readiness report (§L).
- **Exit:** §H battery passes end-to-end with captured evidence; findings log clean; readiness report written.

## Phase 7 — Scale-out readiness & user go-live

- NPF go-live to real users (leaders first, then shop floor), feedback loop.
- Factory #2 onboarding rehearsal via the MDM recipe (data-only — the Vision §6 proof). 🔒
- Pillar #2 (likely PM or EHS per factory priority) scoped as the first *new* pillar module on the platform — its ease of addition is the modularity proof.
- **Exit:** NPF running daily TPM work in Fulcrum; a second factory onboarded or rehearsed; first new pillar spec'd.

---

## Standing rules across all phases

- Sequence within a phase can flex; **phase order does not** (each builds on the previous).
- Any scope change, new decision, or contradiction → `DECISIONS.md` entry first.
- 🔒 steps: contract-protection script before and after, no exceptions.
- The Training Hub nightly sync must be green every morning of this rebuild. A red sync stops all other work until resolved.
