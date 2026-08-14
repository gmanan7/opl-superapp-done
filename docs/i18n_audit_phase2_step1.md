# i18n Catalog Audit — Phase 2 · Step 1 (2026-06-12)

Method: Python flatten over `src/i18n/{en,hi,gu,ta}.json` + static `t('…')` extraction
over `src/` + manual enumeration cross-check of every dynamic key family. Re-runnable;
this document records the state at Phase 2 entry and the agreed handling per namespace.

**Headline:** hi and gu are 100% **key**-complete (zero missing keys) — every gap in this
audit is a **value-quality** gap. ta is intentionally partial (D-008 gate).

## 1. Catalog matrix (en = 687 keys, 15 namespaces)

| namespace | en | hi keys | gu keys | ta keys | hi =en values | gu =en values | ta =en values | class |
|---|---|---|---|---|---|---|---|---|
| abn | 79 | 79 | 79 | 0 | 78 | 78 | — | **2 — English-in-slot (untranslated)** |
| common | 21 | 21 | 21 | 0 | 0 | 0 | — | translated |
| home | 8 | 8 | 8 | 0 | 0 | 0 | — | translated |
| kaizen | 70 | 70 | 70 | 0 | 70 | 70 | — | **2 — English-in-slot (untranslated)** |
| kpi | 23 | 23 | 23 | 0 | 23 | 23 | — | **2 — English-in-slot (untranslated)** |
| login | 17 | 17 | 17 | 0 | 4 | 4 | — | translated (4 intentional: placeholders/product name) |
| mdm | 58 | 58 | 58 | 57 | 6 | 6 | 8 | **1 — drafted, pending review** (Step 3b) |
| mdmImport | 101 | 101 | 101 | 0 | 1 | 1 | — | **1 — drafted, pending review** (Step 8) |
| nav | 7 | 7 | 7 | 0 | 3 | 3 | — | translated (3 =en — see chat batch) |
| opl | 88 | 88 | 88 | 0 | 88 | 88 | — | **2 — English-in-slot (untranslated)** |
| patterns | 3 | 3 | 3 | ~~3~~ 0 | 0 | 0 | ~~3~~ | translated (ta stubs deleted this step) |
| people | 103 | 103 | 103 | ~~102~~ 0 | 7 | 7 | ~~102~~ | **1 — drafted, pending review** (Steps 5/6; ta stubs deleted) |
| roles | 8 | 8 | 8 | 0 | 1 | 1 | — | translated |
| syncHealth | 23 | 23 | 23 | ~~23~~ 0 | 2 | 2 | ~~23~~ | translated (ta stubs deleted this step) |
| users | 78 | 78 | 78 | 0 | 78 | 78 | — | **2 — English-in-slot (untranslated)** |

Classes: **1** = machine-drafted hi/gu awaiting owner review (real translations in slots).
**2** = English values sitting in hi/gu slots — silent untranslated content.
Orphan keys (present in hi/gu/ta but absent from en): **zero**, both directions.

## 2. Code → catalog gap scan (`en` completeness)

- 422 static `t('…')` keys in `src/` (test files excluded).
- **One gap found and fixed this step:** `abn.daysOpen` (AbnormalityList day counter,
  used with `{count}`) — added to `en` (+ plural forms `_one`/`_other`; hi/gu carry the
  same English value, consistent with the abn namespace's deferred class-2 state).
- **All 16 dynamic key families verified complete** against their enumerations:
  `abn.priority_*` (4), `mdm.errors.*` (6), `mdm.modules.keys.*` (8),
  `mdmImport.codes.*` (30), `.columns.*` (13), `.fileErrors.*` (7), `.tiers.*` (3),
  `.title.*` (2), `nav.*` (7), `people.deactivate.reasons.*` (7), `people.pin.reasons.*`
  (4), `people.roleGroups.*` (5), `people.roles.*` (8), `people.statuses.*` (4).
- Methodology limit: fully dynamic keys cannot be proven exhaustively by regex; the
  family cross-check covers every dynamic call site found (40 sites).
- Missing-key warnings in the test-suite output: **zero**.

## 3. Tamil state (D-008 gate — review deferred to Phase 2 Step 5)

- Absent namespaces (clean English fallback by design): abn, common, home, kaizen, kpi,
  login, mdmImport, nav, opl, roles, users.
- Genuinely drafted: `mdm` (57 keys, 8 intentional =en loanwords) — in the Step 5 review scope.
- **English-copy stubs deleted this step** (were indistinguishable from translations in
  audits; rendering unchanged because fallback serves the same English): `people` (102),
  `syncHealth` (23), `patterns` (3). ta semantics are now uniformly *absent = fallback*.

## 4. Agreed handling (owner-approved 2026-06-12)

| Bucket | Namespaces / items | State |
|---|---|---|
| Review now — workbooks issued | `mdmImport` (101), `mdm` (58), `people` (103) hi+gu | `docs/i18n_review/*_review.xlsx`, blank=accept convention; 63 rows pre-flagged |
| Chat-inline batches | 24 scattered =en identicals; 7 deactivation reasons + 10 STATUS-flagged terms | presented in the Step 1 session report |
| Deferred → Phase 3 | `abn`, `kaizen`, `kpi`, `opl` (259 keys × 2) | prototype screens re-specified at Phase 3 re-grounding; translating now risks double work |
| Deferred → Step 3 decision | `users` (78 × 2) | **Step 3 must explicitly decide** whether `/admin/users` survives the new shell or is removed as duplicative with MDM People — not an implicit drop |
| Deferred → Step 5 | all `ta` review | D-008 Training Hub coordination first |

## 5. Standing rule going forward (STATUS hygiene, owner-directed)

Key-completeness is **not** translation-completeness. Every namespace-touching step must
leave STATUS with a current per-namespace translation-state note
(translated / drafted-pending-review / English-in-slot / deferred), verified by value
comparison — not inferred from key counts. The matrix in §1 is the baseline.
