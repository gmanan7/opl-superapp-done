# Fulcrum — Security & VAPT Authority

**Status:** Living document. This is the **authoritative security standard** for Fulcrum: the gate every module passes before it is "done," and the baseline an external assessment will be run against. Where this document and any other conflict on a security matter, this one wins (subordinate only to a deliberate, logged update in `DECISIONS.md`).

**Provenance — two sources, in order of authority:**
1. **The ITSS VAPT report for PPB Pulse** (Security Reassessment VI, ITSS Application Security Team, March 2026) — the *actual assessment format, test battery, and architecture-control review* that an ITC PPB application faces. Fulcrum must be ready for exactly this assessment. Its findings are encoded in §H (the test battery) and §I (architecture controls), adapted to Fulcrum's stack.
2. **The internal VAPT hardening workstream proven on Fulcrum Focus** (same stack as Fulcrum: Supabase + Cloudflare) — the practical A→E hardening structure, carried into §A–§E.

Where Pulse's remediations and Fulcrum's stack diverge, this document specifies Fulcrum's *equivalent or better* control and says so explicitly — the goal is the security outcome ITSS tests for, achieved the right way on this stack.

**Relationship to other docs:** `ARCHITECTURE.md` §5 sets the posture; this document is the operational authority, item by item.

---

## How to use this document

- Every module, before it is "done," passes the **per-module security gate** (§F).
- Platform-wide items (§A–§E, §I) are completed once and re-verified whenever the foundation changes.
- §H is the **assessment simulation**: before any external assessment, Fulcrum is tested against the full ITSS battery internally and every finding driven to closure with evidence.
- §J encodes the **assessment lifecycle** — because the report shows the process is iterative (Pulse took 7 reassessment rounds): findings → remediation → evidence → re-verification.
- Each item has a type: `DB` (Supabase SQL), `Edge` (Edge Function), `CF` (Cloudflare config), `App` (frontend), `Verify` (a test that must pass). An item is done only when its verification passes.

---

## A — Row-Level Security (the primary control)

RLS is Fulcrum's primary control because it enforces **tenant isolation** (factory A cannot see factory B) and **authorization** (a person sees only what their role permits) at the database, where application bugs cannot bypass it. This is also Fulcrum's *correct* answer to the ITSS "Broken Access Control" finding (§H.1) — server-side authorization on every object, rather than obscuring traffic.

| ID | Item | Type | Done-when |
|---|---|---|---|
| A1 | **RLS enabled on every table in `public`.** No exceptions. A new table without RLS is a defect. | DB | `pg_tables` shows `rowsecurity = true` for all. |
| A2 | **Every table's SELECT policy is scoped** to `factory_id = my_factory_id()` (plus ownership/role refinement). No business table relies on `authenticated` alone. | DB | Policy audit shows no broad authenticated-only policies. |
| A3 | **Write policies are factory-scoped and role-appropriate.** Apprentices cannot write outside their group; deletes are restricted or soft. | DB | Write policies reviewed against the role ladder. |
| A4 | **`my_factory_id()` resolves both identity types** (email via `auth.uid()`, PIN via `x-factory-id` header) and returns NULL safely when neither is present. | DB | Tested under both session types. |
| A5 | **Legacy JWT-claim helpers fully removed** (`auth_role()`, `auth_factory_id()`). | DB | Grep of policies returns zero references. |
| A6 | **Service-role key is server-side only** (Edge Functions, Training Hub sync) — never in client code or bundle. | Verify | Bundle + repo scan clean. |

**A-verification (the most important test in the system):** for each table, attempt reads and writes as an apprentice of factory A, a jh_leader of factory A, an admin of factory A, and a user of factory B. Factory B must get **zero rows** of factory A data and every cross-factory write must fail.

---

## B — Identity, accounts & authentication

ITSS's highest-severity Pulse finding was **account takeover via broken access control** — a "Normal User" reaching Company Master and User Master admin panels. Fulcrum's answers:

| ID | Item | Type | Done-when |
|---|---|---|---|
| B1 | **No self-registration.** Accounts are created only by authorized roles via a controlled Edge Function; no public sign-up path. (Pulse was dinged for non-AD users being creatable — Fulcrum's equivalent: only admin-created identities exist.) | Edge/Verify | Account creation via public API fails. |
| B2 | **Password complexity enforced server-side** in any function that sets/resets email-user passwords. | Edge | Weak passwords rejected. |
| B3 | **PIN auth is hash-stored, rate-limited, and logged.** PINs never stored or transmitted in plaintext; attempts throttled; failures logged (`pin_auth_log`). | Edge/DB | PIN guessing throttled; hashes confirmed. |
| B4 | **Deactivation revokes access at the auth layer** — an `is_active=false` user cannot log in or continue an existing session (ban-on-deactivate pattern). | Edge | Deactivated user rejected at login and on API calls. |
| B5 | **Bounded sessions** — inactivity timeout (~30 min) and absolute timeout (~8 hr), both identity types. Supabase JWT expiry configured accordingly. | App | Idle and long sessions force re-auth. |
| B6 | **Role escalation impossible from the client.** Role lives server-side on `worker_profile`; every privileged action is authorized server-side (`roleAtLeast` at the DB/Edge layer), never only by hidden UI. | Edge/Verify | Lower-role token attempting admin actions is rejected. |
| B7 | **Privileged-URL probing fails.** Direct navigation or API calls to admin modules (user management, MDM writes) by a low-privilege user return denial — the exact Pulse High-finding test, run against every Fulcrum admin surface. | Verify | Low-priv account + admin URLs/endpoints = denied, with evidence captured. |
| B8 | **Future SSO posture noted.** Pulse authenticates via ITC AD; Fulcrum uses Supabase email + PIN today. If Fulcrum is brought into ITSS scope, AD/SSO integration for staff accounts is the likely ask — the architecture must not preclude it (it doesn't; Supabase supports SAML/OIDC). Logged as a future coordination item. | — | Noted in `DECISIONS.md` when raised. |
| B9 | **PIN session integrity** — replace client-asserted `x-worker-id` with a server-minted signed session token (issued by `pin-auth`, verified at the DB/Edge layer). Status: backlog (D-017). Current mitigation: privilege cap to shop-floor roles + same-factory cross-check + unguessable UUIDs + rate limiting. | Edge/DB | Signed token verified end-to-end. |

**Token storage note (Fulcrum-specific):** Pulse was assessed on cookie attributes (Path scoping, Secure flag). Supabase JS stores session tokens in `localStorage`, not cookies — so the cookie findings translate into a harsher truth: **XSS = credential theft**. That makes §D.6 (output escaping) and the CSP in §C1 *more* critical for Fulcrum than they were for Pulse, and they are treated as such.

---

## C — Edge / network layer (Cloudflare)

| ID | Item | Type | Done-when |
|---|---|---|---|
| C1 | **The seven ITSS-checked security headers injected** (via Cloudflare Transform Rule or Pages `_headers`): `X-Content-Type-Options: nosniff` · `X-XSS-Protection: 1; mode=block` · `X-Frame-Options: SAMEORIGIN` · `Content-Security-Policy` (strict, SPA-appropriate: `frame-ancestors 'self'`, no `unsafe-inline` scripts; allow only Supabase + app origins) · `Strict-Transport-Security: max-age=31536000; includeSubDomains` · `Cache-Control: no-cache, no-store` on API/auth responses · `Referrer-Policy: strict-origin`. | CF | All seven present in DevTools, matching the values ITSS verified on Pulse. |
| C2 | **Rate limiting on auth endpoints** (~5 req/min/IP) — credential stuffing and PIN brute force. ITSS's Pulse test: flood requests and observe throttling kick in; Fulcrum must show the same behavior. | CF | Rapid auth requests throttled, evidence captured. |
| C3 | **Rate limiting on write endpoints** (~30 req/min) — including **file-upload endpoints specifically** (the exact function ITSS flooded on Pulse). | CF | Rapid writes/uploads throttled. |
| C4 | **Unsafe HTTP methods blocked** — TRACE, and PUT/DELETE where unused by PostgREST semantics, blocked at the WAF. | CF/Verify | TRACE/PUT/DELETE probes denied (Pulse test case). |
| C5 | **No stack fingerprinting** — `Server`, `X-Powered-By`, and similar headers stripped. | CF/Verify | Response headers reveal no server/framework versions. |
| C6 | **TLS 1.2+ only, modern ciphers** — Cloudflare minimum TLS set to 1.2 (prefer 1.3 enabled); deprecated protocols/ciphers (SSLv3, TLS 1.0/1.1, MD5, SHA-1, DES/3DES, RC4) impossible. Mirrors ITSS architecture controls 1–3, satisfied via Cloudflare-managed TLS. | CF/Verify | SSL scan shows TLS 1.2/1.3 only, AES-GCM suites, valid cert ≥2048-bit RSA / sha256. |
| C7 | **HTTPS-only, no mixed content; HSTS active.** | CF/Verify | Site unreachable over plain HTTP; HSTS header present. |

**Infrastructure note (shared responsibility):** Pulse's infra VA covered OS/IIS/Postgres hardening and open-port scans (8090, 445/SMB findings) on self-managed Windows servers. Fulcrum runs on managed infrastructure (Cloudflare, Supabase) — there are no division-managed servers to harden or ports to close. The equivalent control is **documented provider posture** (Supabase/Cloudflare compliance attestations, e.g. SOC 2) plus correct configuration of what *is* in Fulcrum's control (this section, Supabase project settings). This shared-responsibility answer is part of the readiness report (§K).

---

## D — Application input & error handling

| ID | Item | Type | Done-when |
|---|---|---|---|
| D1 | **Numeric inputs validated** client- and server-side (KPI entries, costs, scores) — type, range, no free text where numbers belong. | App | Malformed numeric input rejected (ITSS input-validation test). |
| D2 | **`maxLength` on all free-text inputs** — bounds payloads in every language (multibyte-aware for hi/gu/ta). | App | Oversized text rejected. |
| D3 | **Allowed-character / format validation** on structured fields (employee IDs, codes, emails) — the specific gap ITSS flagged on Pulse ("input validation against allowed character set is not implemented"). | App/Edge | Malformed structured input rejected server-side. |
| D4 | **All privileged routes guarded at route AND action level** — UI hiding is never the control (pairs with B6/B7). | App/Edge | Direct access by unauthorized role fails. |
| D5 | **Errors never leak internals** — no stack traces, raw DB errors, or schema hints to users; detail goes to server logs only. | App/Edge | User-facing errors sanitized. |
| D6 | **User content treated as untrusted, escaped on render** — no `dangerouslySetInnerHTML` with user data; nothing user-supplied interpolated into SQL/HTML. Elevated importance per the token-storage note in §B: XSS here means session theft. Test in all four languages including mixed-script and transliterated text. | App | XSS attempts via submitted content (any language) do not execute. |

---

## E — Files & storage (upload validation + access control)

Fulcrum stores photos that can carry proprietary process detail. ITSS tested Pulse's uploads three ways — **renamed executable** (`KILLNOTES.exe` → `KILLNOTES.pdf`), **raw executable**, and **double extension** (`KILLNOTES.EXE.pdf`). All three must fail against Fulcrum, plus Fulcrum's own access-control layer:

### Upload validation (what gets in)
| ID | Item | Type | Done-when |
|---|---|---|---|
| E1 | **Extension allow-list** — only expected types (jpg/jpeg/png/webp; pdf only where a module genuinely needs it). Executables and unknown types rejected client- and server-side. | App/Edge | Raw `.exe` rejected. |
| E2 | **Double extensions rejected** (`file.exe.jpg`, `file.EXE.pdf`). | App/Edge | Double-extension probe rejected. |
| E3 | **Content (magic-byte/MIME) validation, not just filename** — a renamed executable with an image extension is detected and rejected server-side. This is the test that matters; extension checks alone fail it. | Edge | Renamed-executable probe rejected. |
| E4 | **Size limits enforced** per module's image rules (e.g. 150–200KB post-compression), server-side as well as client-side. | App/Edge | Oversized upload rejected. |
| E5 | **Upload paths are server-controlled and factory-namespaced**: `{factory_id}/{module}/{entity_id}/{file}` — the client cannot write outside its factory's namespace. | Edge/DB | Foreign-namespace upload fails. |

### Access control (who gets it out)
| ID | Item | Type | Done-when |
|---|---|---|---|
| E6 | **Bucket private** — no public URLs, ever. | DB/CF | Public-URL access fails. |
| E7 | **Access only via the `sign-url` Edge Function**, which verifies identity (PIN via `x-worker-id`, email via JWT) before signing. | Edge | Unauthenticated sign requests rejected. |
| E8 | **Factory ownership enforced at signing** — requested path must begin with the caller's `factory_id`; no IDOR on files. | Edge/Verify | Factory-A user requesting factory-B path refused. |
| E9 | **Signed URLs time-bounded** (~1 hour) — a leaked URL is not a permanent backdoor. | Edge | Expired URL no longer serves. |

---

## F — The per-module security gate (run for EVERY module)

Before any module is "done," Claude Code runs this gate:

1. Every new table has RLS on with `factory_id = my_factory_id()` scoping. (A1–A2)
2. Write policies match the role ladder; deletes soft or restricted. (A3)
3. **Cross-factory isolation test passes** on the module's tables. (A-verification)
4. **Role-escalation + privileged-URL test passes** — lower roles cannot perform the module's privileged actions via direct API or URL. (B6–B7)
5. Free-text inputs have `maxLength`; numeric and structured inputs validated. (D1–D3)
6. Submitted content renders escaped — no XSS in any of the four languages. (D6)
7. Any upload obeys §E in full: allow-list, double-extension, magic-byte, size, namespace, private access. (E1–E9)
8. No new secret exposed; any new Edge Function authorizes the specific action. (A6, B6)
9. Errors sanitized. (D5)
10. Security-relevant actions write to the audit log, which itself is admin-readable only. (§I.11)
11. Anything widening the attack surface logged in `DECISIONS.md`.

---

## G — DPDP & data-privacy controls

| ID | Item | Done-when |
|---|---|---|
| G1 | **Data minimization** — personal-data fields hold only what TPM needs. | Schema reviewed against necessity. |
| G2 | **Purpose & transparency** — a data-handling note documents what is collected, why, where stored (Supabase region), and sub-processors. | Note exists and is current. |
| G3 | **Personal data role-gated** — no enumeration of others' data beyond work need. | RLS + role checks enforce. |
| G4 | **Access / correction** — an authorized process can produce and correct a person's data. | Procedure documented. |
| G5 | **Erasure = deactivate + redact PII** (worker UUIDs are permanent across the ecosystem; hard delete would orphan Training Hub history). Stance documented for DPDP defensibility. | Procedure documented and implemented. |
| G6 | **Audit trail** of access/changes to personal data, keyed to actor UUID. | Logging in place. |
| G7 | **Breach-readiness** — documented detect/contain/notify path per DPDP obligations. | Note exists. |

---

## H — The ITSS test battery (assessment simulation)

The nine vulnerability categories ITSS tested on Pulse, with Fulcrum's control for each. Before any external assessment, run this battery internally and capture evidence of each pass:

| # | ITSS finding (Pulse) | Severity | Fulcrum's control | Where |
|---|---|---|---|---|
| 1 | **Account takeover / broken access control** — low-priv user reaches admin URLs/modules | High | Server-side authorization on every object and action: RLS + Edge-level role checks. (Pulse remediated partly via encrypted payloads; Fulcrum's stack answers with DB-enforced authorization, which is the stronger control.) | §A, B6–B7, D4 |
| 2 | **Unrestricted file upload** — renamed exe, raw exe, double extension | High | Full upload-validation chain incl. magic-byte checks | §E1–E5 |
| 3 | **Absence of rate limit** — request flooding, incl. upload endpoint | Medium | Cloudflare rate limits on auth + writes + uploads | §C2–C3 |
| 4 | **Missing security headers** — the seven | Medium | All seven injected and verified | §C1 |
| 5 | **Insecure cookie attributes** — Path, Secure | Medium | localStorage-token model: compensate with strict CSP + escaping (XSS is the credential vector); any cookies set must be Secure/HttpOnly/SameSite | §B note, C1, D6 |
| 6 | **Insecure ports/services** — 8090, 445/SMB on servers | Medium | Managed infra; no division-run servers. Shared-responsibility documentation + provider attestations | §C note |
| 7 | **Insecure HTTP methods** — TRACE/PUT/DELETE | Medium | Blocked at WAF | §C4 |
| 8 | **Server name & version disclosure** | Low | Fingerprint headers stripped | §C5 |
| 9 | **Insufficient input validation** — character sets; rogue account creation | Low | Server-side format/allow-list validation; no self-registration | §D1–D3, B1 |

---

## I — Architecture security controls (the ITSS §5 review, adapted)

ITSS reviews implementation of architecture-mandated controls. The Pulse list, translated to Fulcrum's stack — each must be demonstrable:

1. **HTTPS, TLS 1.2+ only** → Cloudflare TLS minimum 1.2, 1.3 preferred. *(C6–C7)*
2. **Certificate strength** (≥2048-bit RSA / 256-bit ECC, sha256) → Cloudflare-managed certs satisfy; verify. *(C6)*
3. **Modern cipher suites only** → Cloudflare-managed; verify via SSL scan. *(C6)*
4. **Directory-integrated auth** → today: Supabase email + PIN with no self-registration; future: ITC AD/SSO for staff if ITSS requires — architecture supports it. *(B1, B8)*
5. **RBAC on menus/pages/modules by privilege** → role ladder enforced at RLS + Edge + route levels; each role sees only its surfaces. *(A, B6, D4)*
6. **Admin interface restricted** → Pulse: intranet-only. Fulcrum (cloud-native): admin surfaces gated by role server-side, bounded sessions, full audit; optional future hardening = Cloudflare Access in front of admin routes. The *outcome* (only designated identities can administer) is the control. *(B6–B7, B4–B5)*
7. **Sensitive data encrypted at rest (AES-256)** → Supabase/Postgres disk encryption at the platform layer; secrets (PINs) additionally hashed (bcrypt); document classification of stored data (operational + limited personal data). *(G1–G2)*
8. **No deprecated cryptography anywhere** → platform TLS + bcrypt for PINs; no custom crypto. *(C6, B3)*
9. **Sensitive configuration not in plaintext in code** → no DB strings client-side at all; service keys only in Edge Function secrets; `.env` git-ignored; anon key is the only client-side credential by design. *(A6)*
10. **Key rotation** → service-role and Edge secrets rotatable; rotate on schedule (~12 months) and on any suspicion; procedure documented. *(new standing item)*
11. **Audit log for key transactions; no credentials in logs; restricted to high privilege** → audit tables RLS-restricted to admin; log content excludes secrets. *(G6, F.10)*
12. **ICS/OT security** → Fulcrum is a cloud app used from phones/desktops; it has **no OT-network integration today**. If future machine-data integration is built, OT segregation review is triggered and logged in `DECISIONS.md` first. *(standing rule)*

---

## J — Assessment lifecycle (how the process actually runs)

The Pulse report went through **seven assessment rounds** (Feb 5 → Mar 18) before all findings closed. Encode the process, not just the controls:

1. **Findings are tracked to closure with evidence.** Every finding gets: severity (CVSS), owner, remediation, and *captured proof* of closure (the screenshots/scan outputs ITSS expects). Maintain a living `VAPT_FINDINGS_LOG` from the first internal assessment onward.
2. **Version parity** — the build that is assessed is the build that ships. No untested changes ride along into production after assessment.
3. **Major changes trigger re-review.** ITSS explicitly requires that module additions and architectural changes be re-cleared. Fulcrum's per-module gate (§F) is the internal mechanism; if Fulcrum is in formal ITSS scope, major module go-lives are also flagged to them.
4. **Internal battery before external assessment** — run §H end-to-end, close everything, *then* invite assessment. Arriving with open Highs wastes a round.
5. **Re-verify the platform items** (§A–§E, §I) after any foundation change — auth model, storage model, RLS helpers, Cloudflare config.

---

## K — World-class augmentations (beyond the ITSS baseline)

The ITSS battery is the floor. A world-class posture for an internet-facing, multilingual, multi-tenant factory platform adds:

1. **Dependency & supply-chain hygiene** — lockfiles committed; `npm audit` (or equivalent) clean of criticals as a build gate; dependencies updated deliberately.
2. **Secrets scanning** — automated scan of repo and bundle for leaked keys on every build.
3. **Strict CSP as a living control** — tightened as the app evolves; any third-party origin addition is a `DECISIONS.md` entry.
4. **Backup & recovery** — Supabase PITR/backup posture documented and restore actually tested; recovery time objectives stated.
5. **Monitoring & alerting** — auth anomalies (PIN brute-force spikes, failed-login bursts), sync failures, and Edge Function error rates surfaced to the owner, not discovered by accident.
6. **Least-privilege Supabase settings** — anon key scope minimal; PostgREST schema exposure limited to `public` intentionally; unused features (e.g. self-serve signups) disabled at the project level.
7. **The cross-tenant test is continuous** — not a one-time check: an automated test suite runs the factory-A/factory-B isolation battery on every schema change.
8. **Multilingual abuse cases** — validation, escaping, and length limits tested with Devanagari, Gujarati, Tamil scripts and romanized/transliterated input, since this is Fulcrum's actual content profile.

---

## L — The VAPT readiness deliverable

When §A–§K are satisfied and the §H battery passes internally, consolidate into the **VAPT readiness report** (the polished technical document an assessment team is handed): scope and architecture, RLS posture with proof, identity/account controls, network/header configuration with scans, input and upload handling with probe results, file-access model, DPDP controls, shared-responsibility statement for managed infrastructure, audit posture, and the findings log showing closure evidence. Pulse's report is the format reference.

---

## The standing creed (every build, every module)

1. RLS on, `factory_id = my_factory_id()`, every table.
2. No service-role key client-side.
3. Files: validated on the way in (type, content, size), private on the way out (signed, factory-checked, time-bounded).
4. Personal data role-gated and minimized.
5. Every Edge Function authorizes the specific action, not just the caller's existence.
6. Escape everything users submit, in every language.
7. Log anything that widens the attack surface in `DECISIONS.md`.
