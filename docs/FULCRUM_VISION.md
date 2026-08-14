# Fulcrum — Vision & North Star

**Status:** Living document. This is the single source of truth for *what* Fulcrum is and *why*. It does not contain implementation detail (that lives in `ARCHITECTURE.md` and the per-module specs). When any other document or build decision conflicts with this one, this one wins — or this one gets deliberately updated first.

**Owner:** Marut Shukla (Works Manager, ITC PPB NPF Nadiad)
**Last meaningful revision:** 2026 rebuild kickoff

---

## 1. One-sentence definition

Fulcrum is the central, multi-factory, multilingual platform through which ITC PPB factories run **Total Productive Maintenance (TPM)** — starting with the JH (Jishu Hozen / Autonomous Maintenance) pillar already in production, and architected to absorb every TPM pillar and every factory over time.

## 2. The thesis

Factories run TPM today on a sprawl of Excel files, WhatsApp photos, printed formats, and tribal knowledge. The data exists but is trapped: it can't be aggregated, can't be trended, can't be audited, and dies when people transfer. Fulcrum's bet is that if you give the shop floor a tool that is **faster than the paper it replaces**, in **the language the operator actually thinks in**, the data captures itself as a byproduct of work people already do — and that data then powers reviews, audits, scoring, and continuous improvement that were previously impossible.

Fulcrum is not a reporting layer bolted on top of work. It *is* where the work happens.

## 3. What "Fulcrum" spans

Fulcrum is deliberately a **super-app**, not a single-purpose tool. Three concentric scopes:

### 3.1 The TPM scope (the product)
TPM is organized around eight pillars. Fulcrum must be able to house all of them. Today only JH is built; the architecture must never assume JH is the whole product.

The eight pillars:
1. **JH — Jishu Hozen (Autonomous Maintenance)** — *in production.* CLTI, abnormalities, OPLs, Kaizens, daily KPIs, JH meetings, JH audits, R&R scoring.
2. **PM — Planned Maintenance** — preventive/predictive maintenance schedules, breakdown analysis, MTBF/MTTR, spare parts.
3. **QM — Quality Maintenance** — quality defects, conditions-for-zero-defect, QM matrix.
4. **FI — Focused Improvement (Kobetsu Kaizen)** — structured loss analysis, improvement projects, cost-benefit tracking. (Note: JH-level Kaizen already exists; FI is the heavier, cross-functional version.)
5. **E&T — Education & Training** — skill matrices (KSA), training calendars, competency tracking. *Partly external:* the Fulcrum Training Hub is a separate app that already consumes Fulcrum master data. Fulcrum's E&T pillar and the Training Hub must be coherent, not competing.
6. **EHS — Environment, Health & Safety** — incidents, near-misses, safety audits, environmental KPIs.
7. **OTPM / Office TPM** — TPM applied to administrative and support functions.
8. **Development Management / Early Equipment Management** — TPM applied to new equipment and product introduction.

Plus the cross-pillar connective tissue: **dashboards, leaderboards (R&R), the daily/weekly/monthly review cadences, and the audit ladder (JH Level 1→2→3, then pillar and plant assessments).**

### 3.2 The organizational scope (multi-factory)
Fulcrum is the core central app for the **overall Fulcrum project across ITC PPB**, not for one factory. NPF Nadiad is the first factory and the current production tenant, but:
- Every piece of data is owned by a factory ("tenant").
- A user belongs to one or more factories.
- Master data (factories, DMTs, JH groups, areas, machines, people) is modeled so a second, third, Nth factory can be onboarded without schema change or code change — only data.
- Cross-factory roles exist (corporate TPM team, central BE) who see across tenants; factory roles see only their own.

### 3.3 The ecosystem scope (Fulcrum is a platform other apps depend on)
Fulcrum is already a **source of truth that other applications import from.** The Fulcrum Training Hub syncs Fulcrum's master data nightly. This means Fulcrum's master data is not an internal implementation detail — it is a **published contract**. Master Data Management is therefore a first-class concern, not a side-effect of the app. See `ARCHITECTURE.md` and `MDM_SPEC.md`.

## 4. Who uses Fulcrum

Roles, lowest to highest authority (the production role ladder; extend, don't break):

- **apprentice** (NAPS/CAT trainees) — shop floor, PIN login, own JH group. The highest-volume users. Everything they touch must work one-handed on a phone in their native language.
- **on_roll** — permanent shop floor operators. PIN login, own JH group.
- **jh_leader** — leads one JH group (the production model also seats deputy leaders here). Email login. Approves OPLs/Kaizens, closes abnormalities, runs JH meetings, enters KPIs.
- **dmt_member** — member of a DMT (Department Management Team). Email login. Sees all JH groups in their DMT; read + contribute, not approve.
- **dmt_leader** — leads a DMT. Email login. Full authority across their DMT's JH groups.
- **pillar_champion** — owns a TPM pillar across the factory. Factory-wide within their pillar.
- **be_team** — Business Excellence / TPM facilitation team. Factory-wide read + analytics.
- **admin** — full control within a factory.
- **(future) corporate / cross-factory roles** — see across tenants. Must be expressible in the same model.

Design implication: the role model must support both **factory-scoped** and **cross-factory** authority, and both **PIN** (shop floor, no email) and **email/SSO** (staff) identity.

## 5. Non-negotiable product principles

These are the principles that, if violated, make Fulcrum fail regardless of feature completeness.

1. **Faster than paper.** Every shop-floor capture flow must be completable in seconds on a phone. If a flow is slower than the format it replaces, it will not be adopted, and unadopted = dead data.

2. **Multilingual by design, not by retrofit.** Every surface exists in **English (default), Hindi, Gujarati, and Tamil** from the moment it ships. Beyond static UI translation, **content people submit** (OPL remarks, Kaizen descriptions, abnormality notes) must be translatable on demand in real time — the mechanism already proven in the Training Hub is to be borrowed. A worker writes in Gujarati; a reviewer reads it in Tamil. See `ARCHITECTURE.md` §i18n.

3. **The shop floor is the primary device.** Mobile-first is not a nice-to-have. Desktop is for leaders and analysis; the phone is for capture. Both must be excellent, but when they conflict, the capture-on-phone experience wins.

4. **Data captures itself.** Prefer designs where the valuable data is a natural byproduct of a task someone already needs to do, over designs that ask someone to enter data "for the system."

5. **Master data is a published contract.** Other apps depend on it. It is versioned, stable, and changed deliberately — never casually. The Training Hub sync contract (`TRAINING_HUB_SYNC_CONTRACT.md`) is the living proof of this principle and must never be silently broken.

6. **Modular to the pillar.** Each TPM pillar is a module that can be built, shipped, enabled, and disabled independently per factory. A factory early in its TPM journey might run only JH; a mature one runs all eight. The same codebase serves both by configuration, not by forking.

7. **Secure and compliant by default.** This is factory operational data and personal data of employees. DPDP (India's Digital Personal Data Protection Act) compliance, sound data-privacy practice, and readiness for VAPT (Vulnerability Assessment & Penetration Testing) are designed in from the start, not bolted on. See `ARCHITECTURE.md` §security. Security posture takes precedence over feature velocity when the two conflict.

8. **Identity is forever.** A person's identity key (their worker UUID) is permanent across the entire ecosystem. Attendance history, scoring history, audit trails, and the Training Hub's records all hang off it. It is never regenerated. (This is rule #1 of the Training Hub contract and it is also just correct system design.)

## 6. What "done" looks like (the long arc)

Fulcrum is "done enough to be the central app" when:
- All eight TPM pillars have at least their core loop in the product.
- NPF Nadiad runs its entire TPM operation in Fulcrum with no parallel Excel.
- A second factory has been onboarded with zero schema/code change — data only.
- Master data is governed: one place to manage factories, org units, machines, and people, consumed by Fulcrum and every downstream app.
- Every surface is fully available in all four languages, and submitted content is translatable on demand.
- The system has passed a VAPT engagement and is DPDP-defensible.
- Leadership reviews (daily JH meetings up to monthly plant assessments) are run *from* Fulcrum, not from exported decks.

This is a multi-quarter arc. The roadmap (`ROADMAP.md`) sequences it. This document only defines the destination.

## 7. What Fulcrum is *not*

- Not an ERP, MES, or SCADA replacement. It integrates with / sits beside plant systems; it does not try to be them.
- Not a generic project-management tool. Its structure is TPM's structure.
- Not a document graveyard. If a feature just stores files nobody acts on, it doesn't belong.
- Not single-factory, ever again. Any code or schema that hardcodes "the factory" is a defect.

## 8. The current starting reality (so the vision stays honest)

As of this rebuild:
- One production factory (NPF Nadiad), 80 workers seeded, no live end-users yet beyond the master-data sync to Training Hub.
- The JH pillar is substantially built (KPIs, OPL, Kaizen live; CLTI, meetings, abnormality polish, dashboards pending) on a single-factory codebase.
- That codebase is being treated as a **validated prototype**: it proved the stack (React/TS/Vite/Tailwind/Supabase/Cloudflare), the dual PIN+email auth model, the `my_factory_id()` RLS pattern, and the core JH domain logic. The rebuild keeps what's proven and re-lays the foundation for multi-factory + MDM + modular-pillar + security-by-design.
- The six master-data tables are preserved physically and evolved additively to honor the Training Hub contract; everything else is rebuilt clean.

The gap between §8 (today) and §6 (done) is the work. `ROADMAP.md` is how we cross it.
