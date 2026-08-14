-- No schema change required for independent JH Groups.
-- The jh_group table's module_group_id column is already nullable.

-- CREATE TABLE public.jh_group (
--     id uuid DEFAULT gen_random_uuid() NOT NULL,
--     factory_id uuid NOT NULL,
--     area_id uuid,
--     name text NOT NULL,
--     is_active boolean DEFAULT true NOT NULL,
--     created_at timestamp with time zone DEFAULT now() NOT NULL,
--     module_group_id uuid,  -- <-- ALREADY NULLABLE
--     leader_emp_id text,
--     leader_name text
-- );

-- This migration file serves to document that the UI has been updated to support
-- creating JH Groups without a parent DMT (Module Group).
-- The backend endpoints were also updated to accept null module_group_id.
