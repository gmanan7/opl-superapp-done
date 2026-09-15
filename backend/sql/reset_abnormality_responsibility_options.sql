-- Replaces the abnormality_responsibility options with the 4 approved departments.
-- Ran directly against the live DB on 2026-08-24 (0 abnormalities_details rows referenced
-- the old options, so this was a safe full replace, not an additive change).
DELETE FROM abnormality_responsibility;
INSERT INTO abnormality_responsibility (factory_id, name) VALUES
    ('1', 'Production'),
    ('1', 'Engineering'),
    ('1', 'Quality'),
    ('1', 'Materials');
