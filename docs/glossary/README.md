# TPM Fulcrum content-translation glossary

`tpm_glossary.csv` pins TPM floor vocabulary so machine translation renders domain
terms the way the shop floor actually speaks them ("match the floor", Step 1 +
Step 4). Used by the `translate-content` Edge Function via Google Cloud Translation
v3 `glossaryConfig` (D-022).

> **`ta` column (Step 5a):** present but **unpopulated and unpushed** — no validated Tamil floor terms exist yet. Populate the `ta` cells + re-push the glossary (and bump `GLOSSARY_VERSION`) only when `content_translation` re-enables for a Tamil audience. Until then `tpm-glossary-v1` (en/hi/gu) stays as-is.

## File format (Google Cloud "equivalent term set")
- Header row = BCP-47 language codes: `en,hi,gu` (Tamil deferred to Step 5).
- Each row = one term set: the same concept across languages. A blank cell = no pin for that language.
- This is the exact CSV shape Google Cloud Translation ingests for an `equivalent_term_set` glossary — **no transformation needed** to push.
- It is plain data with a stable header so the deferred **Step 4b** frontend editor can read/write it (and, later, per-factory variants) without a rebuild.

## Two terms carry a teach-on-first-encounter gloss (owner-ruled, NOT generalized)
`abnormality` and `root cause` render the English loanword the floor speaks with the
native word bracketed: `एब्नॉर्मेलिटी (समस्या)`. This pattern is **limited to these two
terms only** — a general TPM-term-teaching layer is a separate future feature (logged
in STATUS, Phase 3+). Acronyms (OPL/DMT/JH Group/KPI/CLTI) pin to unchanged English.

## Push to Google Cloud (owner / one-time + on glossary change)
The glossary lives in a GCS bucket; a glossary *resource* is created per language pair.
**Region constraint (verified 2026-06-14):** Cloud Translation **Advanced (v3)** glossaries are supported **only in `us-central1`** (custom resources live in `global`/`us-central1`; glossaries require `us-central1`). The glossary resource AND the translate call's `GOOGLE_LOCATION` must both be `us-central1`, or you get `INVALID_ARGUMENT (400)`. The **source CSV bucket has no single-region requirement** — a **US multi-region** bucket is fine (it encompasses us-central1; the create call just needs read access to the file). So `us-central1` glossary + US-multi-region `fulcrum-glossary` bucket is a valid combination.

After editing `tpm_glossary.csv` (PROJECT = `fulcrum-translation`, BUCKET = `fulcrum-glossary`, GLOSSARY_ID = e.g. `tpm-glossary-v1`):

1. Upload the CSV:
   ```
   gsutil cp docs/glossary/tpm_glossary.csv gs://fulcrum-glossary/tpm_glossary.csv
   ```
2. Create the glossary in **us-central1** (`equivalent_term_set`, langs from the CSV header row `en,hi,gu`). Returns a long-running operation:
   ```
   curl -X POST \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "x-goog-user-project: fulcrum-translation" \
     -H "Content-Type: application/json" \
     "https://translation.googleapis.com/v3/projects/fulcrum-translation/locations/us-central1/glossaries" \
     -d '{
       "name": "projects/fulcrum-translation/locations/us-central1/glossaries/tpm-glossary-v1",
       "languageCodesSet": { "languageCodes": ["en","hi","gu"] },
       "inputConfig": { "gcsSource": { "inputUri": "gs://fulcrum-glossary/tpm_glossary.csv" } }
     }'
   ```
3. Poll until the operation is done (the glossary shows a non-zero `entryCount`):
   ```
   curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://translation.googleapis.com/v3/projects/fulcrum-translation/locations/us-central1/glossaries"
   ```
4. **Only after creation succeeds**, set the Edge secret to the full resource name:
   `GOOGLE_GLOSSARY = projects/fulcrum-translation/locations/us-central1/glossaries/tpm-glossary-v1`
   (Setting it before the glossary exists makes every translate call fail.)

To **replace** the glossary after editing the CSV: delete the existing resource (`DELETE …/glossaries/tpm-glossary-v1`), re-upload, re-create (or create a new id and bump `GLOSSARY_VERSION`). `glossary_version` is recorded in `translation_cache` so a glossary change naturally invalidates stale cached translations.
