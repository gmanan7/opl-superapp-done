# Security & Production-Readiness Findings

Tracked here for future action — not yet fixed. Found during a production-readiness review
(2026-08-26). Revisit before this app goes internet-facing.

## Open — needs a decision or action

### 1. CORS is wide open
`backend/server.js:36` — `app.use(cors());` with no origin restriction. Any website can call
this API from a browser and read the response.

**Why this matters more than usual for this app:** auth here is a plain `x-worker-id` header
the caller sets — not a server-issued secret (no cookie, no JWT, no session token). CORS is
one of the only things stopping an arbitrary external site from calling the API with a guessed
or known employee ID and reading back real data or firing writes. Not optional hardening once
internet-facing.

**Fix:** restrict to the real production origin(s):
```js
app.use(cors({ origin: 'https://<real-domain>' }));
```
Blocked on: knowing the actual production hostname(s) (prod, and any staging domain).

### 2. No frontend↔backend wiring for a real deployment
The frontend calls relative `/api/...` paths. That only resolves today because Vite's *dev
server* proxies `/api` to `localhost:3000` (`frontend/vite.config.js`) — a dev-only trick, not
present in `vite build` output. Nothing in the repo currently serves the built frontend from
the same origin as the API (no `express.static`, no reverse-proxy config checked in).

**Target: Windows IIS.** Recommended shape:
- IIS serves the built `frontend/dist` static files directly.
- IIS reverse-proxies `/api/*` to the Node/Express backend running as its own background
  process on `localhost:<port>` (not exposed externally).
- Needs **URL Rewrite** + **Application Request Routing (ARR)** IIS modules (not installed by
  default; ARR also needs "Enable proxy" explicitly ticked after install).
- Needs a SPA fallback rewrite rule (non-file, non-`/api` paths → `index.html`), or refreshing
  on any inner route (`/kaizen/123`) 404s.
- Node should run as a genuine Windows Service (recommend **NSSM** wrapping `node server.js`)
  for auto-start-on-boot + auto-restart-on-crash — not iisnode, since IIS's own worker-process
  recycling (~every 29h by default, or on idle) would kill iisnode's Node process mid-flight,
  taking the live PostgreSQL connection pool down with it.

**Known IIS gotchas to handle in the `web.config` up front:**
- IIS's own request-size cap (~28.6 MB default) is lower than the app's `express.json({ limit:
  '50mb' })` — large photo uploads would get blocked by IIS before reaching Node, with a
  generic 404.13, not the app's own validation error. Raise `maxAllowedContentLength`.
- ARR's default proxy timeout (~30s) can cut off slow requests (big uploads, heavy analytics
  queries) that Node would otherwise have handled fine. Raise `proxyTimeout`.
- Port 3000 (or whatever the Node process listens on) must only be reachable from IIS on the
  same machine — never opened to the public internet directly, or CORS/auth restrictions can
  be bypassed entirely by hitting Node directly.
- Whatever Windows account the NSSM service runs as needs real permissions to reach PostgreSQL
  and read `.env` — untested if it differs from the account used during manual dev testing.
- Nothing in IIS itself will notice if the Node service dies — requests just start returning
  ARR's generic 502.3 with no obvious cause. Worth having something actually watch the service.

**Fix:** write `web.config` (URL Rewrite + ARR proxy rules, size/timeout limits raised) and the
NSSM service registration commands. Blocked on: the real production hostname, and confirming
IIS/ARR/URL-Rewrite are actually available on the target Windows box.

## Minor / cleanup

### 3. Dead `JWT_SECRET` placeholder in `.env`
`.env` has `JWT_SECRET=your_jwt_secret_key`, but nothing in `backend/server.js` references
`JWT_SECRET` or JWTs at all (auth is bcrypt + the `x-worker-id` header, no session tokens).
Not exploitable — it's unused — but it reads like a real secret and should be deleted for
clarity, or genuinely wired up if a JWT-based flow is ever added.

### 4. No production process hardening
`backend/package.json` — `start` and `dev` scripts are identical (`node server.js`), no
`NODE_ENV=production`, no process manager. (The Windows Service wrapper in item 2 covers the
"stay running" part; `NODE_ENV` and any prod-specific tuning are still unset.)

### 5. Known client-side role-ladder bug (already flagged in `CLAUDE.md`)
`frontend/src/lib/auth.js`'s `roleAtLeast`/`ROLE_ORDER` is missing several real roles
(`jh_leader`, `dmt_member`, `dmt_leader`, `pillar_champion`, `be_team`, `apprentice`,
`on_roll`, `admin`), so calling it with any of those silently returns true either way. Display
bug only — server-side authorization never trusted this ladder. Don't add new
`roleAtLeast(...)` call sites importing from `auth.js` without checking which ladder you're
actually getting.

## Confirmed OK (no action needed)
- Factory/plant IDs are resolved dynamically from session context everywhere checked — no
  hardcoded factory IDs found in route/query logic.
- `.env` is gitignored; no other hardcoded secrets found in source files.
- `frontend/package.json` has a real production build script (`vite build`).
