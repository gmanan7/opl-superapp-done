-- Adds the fixed 7-value abnormality-type classification to abnormalities_details.
-- Existing table has 0 rows, so this is a safe additive change.

ALTER TABLE abnormalities_details
    ADD COLUMN type text CHECK (type IN (
        'minor_flaw',
        'unfulfilled_basic_condition',
        'hard_to_access',
        'source_of_contamination',
        'quality_defect_source',
        'unnecessary_item',
        'unsafe_place'
    ));
