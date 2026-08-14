# CLAUDE.md — Fulcrum Operating Manual for Claude Code

This file is read at the start of every session. Keep it current; keep it short. Detail lives in `docs/`.

## What this project is

Fulcrum: multi-factory, multilingual TPM super-app for ITC PPB. Currently rebuilding on a clean foundation (MDM-first, multi-tenant, security-by-design) while preserving the six master-data tables that the Fulcrum Training Hub syncs nightly. One production factory (NPF Nadiad), no live end-users yet — but the nightly sync is live and sacred.

## The three Fulcrum projects (naming convention)

When discussing or querying any of these in chat or SQL, always identify which:

- **TPM Fulcrum** — this project. The main TPM super-app. Supabase: joryoadrvisizkkspuov.
- **Fulcrum Training Hub** — separate production app for factory training. Syncs the six master tables nightly FROM TPM Fulcrum. Supabase: opvdxubkxyghylxgnrhn.
- **Fulcrum Hub T4** — separate T4 daily-meeting app on the Focus stack. Independent of TPM Fulcrum. Supabase: hxsyzgjlqbelieokoudc.

Never refer to any of these as just "Fulcrum" or "the Hub" without the qualifier — they have collided in past sessions.

## Session start — read in this order

0. `docs/STATUS.md` — current phase/step, last contract-check result, open flags, next step (D-015). Overwrite + commit it as the last act of every session.
1. `docs/DECISIONS.md` — never contradict an entry; to change one, propose a new entry and STOP for owner approval.
2. `docs/ARCHITECTURE.md` — the five foundations and conventions.
3. The spec for whatever you're building (`docs/MDM_SPEC.md`, etc.) + `docs/ROADMAP.md` for where it fits.
4. If touching `factory`, `dmt`, `jh_group`, `area`, `machine`, or `worker_profile` in ANY way: `docs/TRAINING_HUB_SYNC_CONTRACT.md` §3, §7, §14 first. UUIDs are forever. Contracted columns are frozen. When unsure, STOP and ask.

## Hard rules (non-negotiable)

1. **Plan before building.** For any non-trivial task, present a plan and get confirmation before writing code.
2. **Schema before code.** Design tables/RLS/functions, apply in Supabase, VERIFY with a real query, then write hooks/UI against the real schema. Never write a query against an assumed column — read the actual schema first (`information_schema.columns`). The prototype lost six debugging sessions to assumed column names.
3. **RLS pattern:** every table, `factory_id = my_factory_id()`. The helper resolves email users via `auth.uid()` and PIN users via the `x-factory-id` header. Legacy `auth_role()`/`auth_factory_id()` are banned. Group scoping uses `my_jh_group_ids()`/`my_dmt_ids()` (primary + additional memberships).
4. **No hardcoded factory UUID** in app code. The factory always comes from session context. (Seeds/migrations may reference the NPF UUID; app code may not.)
5. **Security gate:** every module passes `docs/SECURITY_VAPT.md` §F before it is "done." Files: validated in (allow-list, double-extension, magic-byte, size), private out (sign-url Edge Function, factory-checked, 1-hour expiry).
6. **Every user-facing string** comes from i18n catalogs (en/hi/gu/ta), `fallbackLng: 'en'`. No hardcoded English in components.
7. **Contract verification after any master-data migration:** run the repo's contract-protection script (UUID drift check + row counts). **Authoritative drift reference = the frozen Phase-0 UUID baseline in `contract_uuid_baseline` (original 80 worker UUIDs) — untouched; the missing-UUID and `≥`-count checks behave correctly against it.** NPF row counts (reconciled 2026-06-14 to current reality): factory 1, dmt 2, jh_group 8, area 18, machine 42, worker 84. The deltas vs the original sketch (machine 40→42, worker 80→84) are **known deactivated test residue**, not drift: 3 deactivated `ZUAT-S8-*` workers (Step 8 bulk-import UAT, 2026-06-11) + dryrun machines (Step 9 onboarding rehearsal), retained per D-005 (deactivate, never delete). Any UUID-drift failure → roll back, report.

## Stack & commands

React + TS + Vite + Tailwind + shadcn/ui + TanStack Query | Supabase (`joryoadrvisizkkspuov`) | Cloudflare Pages (deploys from `main`).

```bash
npm run dev          # local dev (port 5173)
npm run build        # must pass with zero TS errors before any commit
npm run test:run     # Vitest suite — must pass
supabase functions deploy <name> --no-verify-jwt   # Edge Functions do their own auth
```

Git: small, well-described commits per shippable unit, pushed to `origin/main` at every green, shippable boundary — push is part of the workflow, not an owner-gated step (D-026). `main` IS production: each push triggers a Cloudflare deploy (~1–2 min). Do not push broken intermediate states; do push the moment a unit is green (`build` + `test:run` pass). A local commit is invisible to the owner and the live site — never call work "shipped/live" until `origin/main` carries the SHA and its Cloudflare build has succeeded (D-025/D-026). Never commit secrets; `.env` is git-ignored.

## Session & identity facts (prototype-proven; do not rediscover)

- PIN session in localStorage key `tpm_session`, shape: `{ type:'pin', worker:{ worker_id, factory_id, jh_group_id, dmt_id, name, role, lang_pref } }` — factory_id is NESTED under `.worker`, not top-level.
- Email users: Supabase Auth + `worker_profile` row via `supabase_user_id`.
- The Supabase client injects `x-factory-id` from the PIN session via a custom fetch wrapper in `src/lib/supabase.ts`.
- Worker name lookups: ALWAYS via the `worker_names` view (RLS-bypassing, granted to anon+authenticated) — never query `worker_profile` for display names.
- Role order (lowest→highest): apprentice → on_roll → jh_leader → dmt_member → dmt_leader → pillar_champion → be_team → admin. Use the single shared `roleAtLeast` helper.
- Roles `apprentice`/`on_roll` = PIN identities; `jh_leader`+ = email identities.

## Storage & images

- Bucket `tpm-uploads` is PRIVATE. Never `getPublicUrl`.
- Read: `useStorageUrl` hook → `sign-url` Edge Function (PIN: `x-worker-id` header; email: JWT) → 1-hour signed URL. Components handle null→url with a placeholder.
- Write: create-first pattern (insert row → upload → update row with URL). Path: `{factory_id}/{jh_group_id}/{module}/{entity_id}/{file}`. Compress client-side to module limits (OPL 150KB, Kaizen 150KB, Abnormality 200KB).

## Debugging heuristics (hard-won)

- Supabase query returns empty with NO error → suspect RLS first, always. Check the policy uses `my_factory_id()` and works for the session type you're testing.
- 400 on a well-formed PostgREST query → a column in the select doesn't exist. Read the real schema.
- 401 from an Edge Function before your code runs → JWT verification toggle; deploy with `--no-verify-jwt` (functions authorize internally).
- PIN-user-only failures → the `x-factory-id`/`x-worker-id` header path; check the fetch wrapper and the session shape (nested `.worker`).

## Module build checklist (every module)

1. Read spec + DECISIONS + (if master data) the contract.
2. Plan → confirm with owner.
3. Schema + RLS in Supabase, verified by query.
4. Typed hooks against real schema; names via `worker_names`; embedded joins over second queries.
5. UI per `docs/DESIGN_SYSTEM.md`; all four languages; mobile-first for capture flows.
6. Tests (Vitest): logic + the cross-factory isolation test for the module's tables.
7. `npm run build` zero errors; `npm run test:run` green.
8. SECURITY_VAPT §F gate, item by item.
9. If master data was touched: contract-protection script green.
10. Commit with a clear message; report what shipped, what's deferred, any DECISIONS entries proposed.

## Communication Protocol

### Inter-agent communication
All prompts generated for Claude Code, Claude Design, or any subagent must be fully technical, precise, and uncompromised. No simplification. No explanations added for the user's benefit inside these prompts. Technical quality is non-negotiable.

### Human Readback — mandatory in every response to the user
Every response to the user ends with this block, separated by a divider. It is appended AFTER all technical work, prompts, and outputs are complete.

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

### Status & shipping honesty (D-025)
- Name the exact state reached, never a rosier one: **committed (local)** → **pushed (`origin/main`)** → **shipped/live** (= `origin/main` + a successful Cloudflare build). Never report a lower state as a higher one.
- Verify only what is machine-checkable (build/test/lint pass, `origin/main` SHA, deployed bundle hash). Do **not** claim the rendered UI looks right or that all four languages render correctly — that is the owner's visual gate; request it explicitly.
- When reporting completion, state the evidence for the claimed state — and "shipped/live/deployed" means the commit is on `origin/main` with a successful Cloudflare build (D-026), never a local-only commit.
- Enforced, not assumed: before a module is "done," grep its components for user-facing string literals and convert any found — a passing missing-key check is necessary but NOT sufficient; it is blind to a literal that was never made a key (the Phase-3 M1 i18n miss; D-025).

### SQL requests
Before giving the user any SQL to run, always precede it with one plain-English sentence: what the query does, and whether it reads data only or changes/writes data. Never give the user SQL to run blind.

Before composing any SQL that references specific column names: if uncertain about the column names, first run an information_schema discovery query, OR ask the user to run one — never assume column names. Wrong columns in SQL handed to the user is a protocol failure.

### When the user stops understanding
If the user asks "what does this mean" or "why did it do this" — answer only in plain English. Do not repeat the code or technical explanation unless the user asks for it.
