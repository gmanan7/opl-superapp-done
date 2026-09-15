-- Optional "what did it cost to implement" on a Kaizen's implementation report. Not
-- mandatory — many improvements are zero-cost. Plain numeric (currency assumed Rs, same
-- as the rest of the app). Purely additive: nullable, no default, existing rows unaffected.

ALTER TABLE kaizen_details
  ADD COLUMN IF NOT EXISTS implementation_cost numeric;
