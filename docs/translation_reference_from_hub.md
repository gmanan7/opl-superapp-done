# D-009 Extraction — Fulcrum Training Hub translation implementation (reference)

**Read 2026-06-14 from the owner-provided clone `/Users/Marut/fulcrum-training-hub-reference` (Fulcrum Training Hub, project `opvdxubkxyghylxgnrhn`) — read-only reference.** This note records what the Hub does so TPM Fulcrum's Step 4 build is faithful where it borrows and deliberate where it diverges. **Three-project note:** the reference is the *Fulcrum Training Hub*; the build target is *TPM Fulcrum* (`joryoadrvisizkkspuov`).

## What the Hub does

### Client — `src/components/common/TranslateControl.tsx`
- Source select `auto | en | hi | gu`, target select `en | hi | gu` (default = viewer `lang_pref`). Explicit "Translate" button (never auto-run). Session-scoped memory of last source/target.
- Calls `supabase.functions.invoke("translate", { text, source_lang, target_lang, source_asserted? })`; reads `translated_text | translation | text` from the response.
- `source_asserted: true` is set when the reader picks a non-`auto` source — the human override.
- **Original-preserving:** the translation renders in a separate block; "Hide translation" removes it; the original is never mutated. Loading spinner, error via toast.

### Provider — the `translate` Edge Function (NOT in the repo clone)
The Edge function source was not committed (deployed out-of-band). Per the owner's reading of the deployed function:
- Provider: the **unofficial** Google Translate endpoint (`translate.googleapis.com/translate_a/single`, spoofed User-Agent) with a **MyMemory** fallback. Free, no key — but fragile, ToS-gray, **not VAPT/DPDP-defensible**.
- **Transliteration handling (the part worth borrowing):** a **script-range check** (Devanagari / Gujarati / Tamil unicode ranges) that downgrades a *declared* source to `auto` when the text's script doesn't match the declaration; PLUS the **`source_asserted` escape hatch** — when a human explicitly declares the source, trust it and pass it through even if the text is romanized (the provider handles transliteration). Modest and effective.
- Auth: authenticated-only, **no factory-scoping**, **wildcard CORS**.

### Cache — `translation_cache` table (Hub)
`{ source_text, source_text_hash, source_lang, target_lang, translated_text, provider, use_count, created_at, last_used_at }`. Keyed by `source_text_hash + langs + provider`. Caches results (read-time augmentation) — it does **not** overwrite originals (those live in their own content tables). In-parity, not gold-plating.

## What TPM Fulcrum borrows vs. diverges (D-022)

| Aspect | Hub | TPM Fulcrum (Step 4) |
|---|---|---|
| Provider | Unofficial GT endpoint + MyMemory | **Google Cloud Translation v3 (Advanced), service-account-keyed** — official, ToS-clean (D-022) |
| Glossary | none | **GCS-hosted glossary** pinning TPM floor vocabulary (the owner's real problem) |
| Transliteration | script-range check + `source_asserted` | **borrowed verbatim** (the good part) |
| Cache | `translation_cache`, no RLS | `translation_cache` **factory-scoped RLS + DPDP note** |
| Auth | authenticated-only, wildcard CORS | **factory-scoped** caller resolution + **tightened CORS** (C1) + rate-limit (C3) |
| Cost control | none | **kill switch (`factory_module`) + monthly usage rollup + computed auto-pause at 95%** (personal-card safety) |

## Flagged improvements over the Hub
- The Hub's scraped endpoint is the single biggest weakness — replaced (D-022), not copied.
- The Hub's lack of factory-scoping + wildcard CORS are tightened.
- Cost controls are net-new (the Hub runs on a free scraped endpoint; TPM Fulcrum's official API bills the owner's card, so an auto-pause safety net is mandatory).

**Consumers differ (same mechanism):** the Hub translates trainee-facing quiz/training content; TPM Fulcrum translates shop-floor-submitted TPM content (Kaizen/OPL/abnormality prose). The component + Edge contract are shared; the data and readers differ.
