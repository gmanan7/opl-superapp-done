--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2026-08-09 13:30:16

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 772730)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5356 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 924 (class 1247 OID 772796)
-- Name: abnormality_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.abnormality_status AS ENUM (
    'open',
    'assigned',
    'wip',
    'pending_verify',
    'closed',
    'rejected'
);


ALTER TYPE public.abnormality_status OWNER TO postgres;

--
-- TOC entry 927 (class 1247 OID 772810)
-- Name: abnormality_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.abnormality_type AS ENUM (
    'minor_flaw',
    'unfulfilled_basic_condition',
    'source_of_contamination',
    'inaccessible_place',
    'source_of_quality_defect',
    'unnecessary_item',
    'unsafe_place'
);


ALTER TYPE public.abnormality_type OWNER TO postgres;

--
-- TOC entry 921 (class 1247 OID 772786)
-- Name: lang_pref; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.lang_pref AS ENUM (
    'en',
    'hi',
    'gu',
    'ta'
);


ALTER TYPE public.lang_pref OWNER TO postgres;

--
-- TOC entry 930 (class 1247 OID 772826)
-- Name: red_white_tag; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.red_white_tag AS ENUM (
    'red',
    'white'
);


ALTER TYPE public.red_white_tag OWNER TO postgres;

--
-- TOC entry 918 (class 1247 OID 772768)
-- Name: tpm_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.tpm_role AS ENUM (
    'apprentice',
    'on_roll',
    'jh_leader',
    'dmt_member',
    'dmt_leader',
    'pillar_champion',
    'be_team',
    'admin'
);


ALTER TYPE public.tpm_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 230 (class 1259 OID 773076)
-- Name: abnormality; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.abnormality (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    machine_id uuid,
    subsection_id uuid,
    reporter_worker_id uuid,
    title text NOT NULL,
    description text,
    status public.abnormality_status DEFAULT 'open'::public.abnormality_status NOT NULL,
    type public.abnormality_type,
    tag_color public.red_white_tag DEFAULT 'white'::public.red_white_tag NOT NULL,
    before_image_url text,
    after_image_url text,
    target_date date,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.abnormality OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 773107)
-- Name: abnormality_assignment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.abnormality_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abnormality_id uuid NOT NULL,
    assignee_worker_id uuid NOT NULL,
    assigned_by_worker_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.abnormality_assignment OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 773129)
-- Name: abnormality_update; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.abnormality_update (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abnormality_id uuid NOT NULL,
    author_worker_id uuid,
    comment text,
    status_from text,
    status_to text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.abnormality_update OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 772873)
-- Name: area; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.area (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    department_id uuid,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.area OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 772858)
-- Name: department; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.department OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 772913)
-- Name: dmt; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dmt (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dmt OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 773475)
-- Name: factory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.factory (
    id text NOT NULL,
    name text NOT NULL,
    code text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.factory OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 773005)
-- Name: factory_module; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.factory_module (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    module_key text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    enabled_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.factory_module OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 772893)
-- Name: jh_group; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jh_group (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    area_id uuid,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    module_group_id uuid,
    leader_emp_id text,
    leader_name text
);


ALTER TABLE public.jh_group OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 773775)
-- Name: jh_groups_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jh_groups_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jh_group_id uuid NOT NULL,
    emp_id text NOT NULL,
    worker_name text,
    role text DEFAULT 'member'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.jh_groups_list OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 773315)
-- Name: jh_kpi_definition; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jh_kpi_definition (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    name text NOT NULL,
    unit text,
    target_value numeric,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.jh_kpi_definition OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 773330)
-- Name: jh_kpi_entry; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jh_kpi_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    definition_id uuid NOT NULL,
    jh_group_id uuid NOT NULL,
    entry_date date NOT NULL,
    value numeric NOT NULL,
    recorded_by_worker_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.jh_kpi_entry OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 773290)
-- Name: kaizen; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kaizen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    jh_group_id uuid,
    author_worker_id uuid,
    team_member_ids uuid[],
    title text NOT NULL,
    description text,
    before_remarks text,
    after_remarks text,
    before_image_url text,
    after_image_url text,
    status text DEFAULT 'approved'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.kaizen OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 773041)
-- Name: machine; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    jh_group_id uuid,
    name text NOT NULL,
    code text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.machine OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 773061)
-- Name: machine_subsection; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine_subsection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.machine_subsection OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 773022)
-- Name: mdm_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mdm_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    actor_worker_id uuid,
    entity_table text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    changed_fields jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.mdm_audit OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 773756)
-- Name: module_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.module_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module text NOT NULL,
    factory_id text,
    module_lead_emp_id text,
    module_lead_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.module_groups OWNER TO postgres;

--
-- TOC entry 250 (class 1259 OID 773745)
-- Name: modules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.modules OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 773148)
-- Name: opl; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opl (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    machine_id uuid,
    jh_group_id uuid,
    author_worker_id uuid,
    title text NOT NULL,
    opl_type text DEFAULT 'one_point_lesson'::text NOT NULL,
    content_text text,
    before_remarks text,
    after_remarks text,
    before_image_url text,
    after_image_url text,
    status text DEFAULT 'published'::text NOT NULL,
    retrain_frequency_days integer DEFAULT 90,
    retired_at timestamp with time zone,
    retired_by uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.opl OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 773807)
-- Name: opl_audit_trail; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opl_audit_trail (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opl_id text,
    action text,
    status_from text,
    status_to text,
    submitted_by_from text,
    submitted_by_to text,
    performed_by text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.opl_audit_trail OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 773401)
-- Name: opl_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opl_details (
    opl_id bigint NOT NULL,
    title text NOT NULL,
    content text,
    before_image text,
    after_image text,
    submitted_by text,
    status text DEFAULT 'draft'::text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    before_description text,
    after_description text,
    classification text
);


ALTER TABLE public.opl_details OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 773400)
-- Name: opl_details_opl_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.opl_details_opl_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.opl_details_opl_id_seq OWNER TO postgres;

--
-- TOC entry 5357 (class 0 OID 0)
-- Dependencies: 245
-- Name: opl_details_opl_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.opl_details_opl_id_seq OWNED BY public.opl_details.opl_id;


--
-- TOC entry 234 (class 1259 OID 773186)
-- Name: opl_intended_audience; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opl_intended_audience (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    jh_group_id uuid,
    opl_id uuid NOT NULL,
    worker_id uuid NOT NULL,
    state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT opl_intended_audience_state_check CHECK ((state = ANY (ARRAY['included'::text, 'excluded'::text])))
);


ALTER TABLE public.opl_intended_audience OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 773268)
-- Name: opl_training; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opl_training (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opl_id uuid NOT NULL,
    worker_profile_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    trained_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.opl_training OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 773223)
-- Name: opl_training_event; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opl_training_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    jh_group_id uuid,
    opl_id uuid NOT NULL,
    worker_id uuid NOT NULL,
    retrain_cycle integer DEFAULT 1 NOT NULL,
    method text NOT NULL,
    trainer_id uuid,
    acknowledged boolean DEFAULT true NOT NULL,
    trained_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT opl_training_event_method_check CHECK ((method = ANY (ARRAY['self_ack'::text, 'trainer_led'::text])))
);


ALTER TABLE public.opl_training_event OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 772928)
-- Name: worker_profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.worker_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    jh_group_id uuid,
    email text,
    password_hash text,
    name text NOT NULL,
    employee_id text,
    role public.tpm_role DEFAULT 'apprentice'::public.tpm_role NOT NULL,
    lang_pref public.lang_pref DEFAULT 'en'::public.lang_pref NOT NULL,
    pin_hash text,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.worker_profile OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 773377)
-- Name: opl_training_due_v; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.opl_training_due_v AS
 SELECT o.id AS opl_id,
    o.title AS opl_title,
    o.factory_id,
    o.jh_group_id,
    wp.id AS worker_id,
    wp.name AS worker_name,
    COALESCE(ote.trained_at, o.created_at) AS last_trained_at,
        CASE
            WHEN (ote.id IS NULL) THEN true
            ELSE false
        END AS is_due
   FROM ((public.opl o
     CROSS JOIN public.worker_profile wp)
     LEFT JOIN public.opl_training_event ote ON (((ote.opl_id = o.id) AND (ote.worker_id = wp.id))))
  WHERE ((o.is_active = true) AND (wp.is_active = true) AND (o.retired_at IS NULL));


ALTER VIEW public.opl_training_due_v OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 773382)
-- Name: opl_training_status_v; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.opl_training_status_v AS
 SELECT o.id AS opl_id,
    o.title AS opl_title,
    o.factory_id,
    o.jh_group_id,
    wp.id AS worker_id,
    wp.name AS worker_name,
    ote.trained_at,
    COALESCE(ote.acknowledged, false) AS acknowledged
   FROM ((public.opl o
     CROSS JOIN public.worker_profile wp)
     LEFT JOIN public.opl_training_event ote ON (((ote.opl_id = o.id) AND (ote.worker_id = wp.id))));


ALTER VIEW public.opl_training_status_v OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 772843)
-- Name: pillar; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pillar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pillar OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 773388)
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 773356)
-- Name: translation_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.translation_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid,
    year_month text NOT NULL,
    char_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.translation_usage OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 773498)
-- Name: user_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_details (
    emp_id text NOT NULL,
    name text NOT NULL,
    email text,
    password_hash text,
    role text DEFAULT 'operator'::text NOT NULL,
    default_plant text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_details OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 773510)
-- Name: user_plant_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_plant_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    emp_id text NOT NULL,
    factory_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_plant_access OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 772984)
-- Name: worker_factory_membership; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.worker_factory_membership (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worker_profile_id uuid NOT NULL,
    factory_id uuid NOT NULL,
    is_home boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.worker_factory_membership OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 772956)
-- Name: worker_group_membership; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.worker_group_membership (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    factory_id uuid NOT NULL,
    worker_profile_id uuid NOT NULL,
    jh_group_id uuid,
    dmt_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.worker_group_membership OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 773373)
-- Name: worker_names; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.worker_names AS
 SELECT id,
    name,
    employee_id,
    role,
    is_active
   FROM public.worker_profile;


ALTER VIEW public.worker_names OWNER TO postgres;

--
-- TOC entry 5006 (class 2604 OID 773404)
-- Name: opl_details opl_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_details ALTER COLUMN opl_id SET DEFAULT nextval('public.opl_details_opl_id_seq'::regclass);


--
-- TOC entry 5330 (class 0 OID 773076)
-- Dependencies: 230
-- Data for Name: abnormality; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.abnormality (id, factory_id, machine_id, subsection_id, reporter_worker_id, title, description, status, type, tag_color, before_image_url, after_image_url, target_date, closed_at, created_at) FROM stdin;
\.


--
-- TOC entry 5331 (class 0 OID 773107)
-- Dependencies: 231
-- Data for Name: abnormality_assignment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.abnormality_assignment (id, abnormality_id, assignee_worker_id, assigned_by_worker_id, assigned_at) FROM stdin;
\.


--
-- TOC entry 5332 (class 0 OID 773129)
-- Dependencies: 232
-- Data for Name: abnormality_update; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.abnormality_update (id, abnormality_id, author_worker_id, comment, status_from, status_to, created_at) FROM stdin;
\.


--
-- TOC entry 5320 (class 0 OID 772873)
-- Dependencies: 220
-- Data for Name: area; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.area (id, factory_id, department_id, name, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5319 (class 0 OID 772858)
-- Dependencies: 219
-- Data for Name: department; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.department (id, factory_id, name, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5322 (class 0 OID 772913)
-- Dependencies: 222
-- Data for Name: dmt; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dmt (id, factory_id, name, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5344 (class 0 OID 773475)
-- Dependencies: 247
-- Data for Name: factory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.factory (id, name, code, is_active, created_at) FROM stdin;
1	TVT	TVT	t	2026-08-08 12:09:35.435741+05:30
2	NPF	NPF	t	2026-08-08 12:09:35.435741+05:30
3	UPF	UPF	t	2026-08-08 12:09:35.435741+05:30
4	MPF	MPF	t	2026-08-08 12:09:35.435741+05:30
\.


--
-- TOC entry 5326 (class 0 OID 773005)
-- Dependencies: 226
-- Data for Name: factory_module; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.factory_module (id, factory_id, module_key, is_enabled, enabled_at) FROM stdin;
109b3a39-7d9c-4ddf-8e3f-18a7bc73a8f6	00000000-0000-0000-0000-000000000001	jh_kpi	t	2026-08-05 19:34:14.251708+05:30
85513e2c-4ccf-40ae-8878-dcd6154bbe04	00000000-0000-0000-0000-000000000001	opl	t	2026-08-05 19:34:14.251708+05:30
0b9ca527-74c8-47a4-9045-44742e0507f0	00000000-0000-0000-0000-000000000001	kaizen	t	2026-08-05 19:34:14.251708+05:30
b31f5c0b-00be-4de7-98df-0d2fa98087b2	00000000-0000-0000-0000-000000000001	clti	t	2026-08-05 19:34:14.251708+05:30
36201746-e1b3-45c6-b434-b3aa3f60892d	00000000-0000-0000-0000-000000000001	abnormality	t	2026-08-05 19:34:14.251708+05:30
c1b52e7c-5f8e-4e5f-b300-fbe984a94ed6	00000000-0000-0000-0000-000000000001	meetings	t	2026-08-05 19:34:14.251708+05:30
352aa46e-e215-4376-be1e-6054434072a1	00000000-0000-0000-0000-000000000001	jh_audit	t	2026-08-05 19:34:14.251708+05:30
8037103d-22bf-406d-9f75-abf6c1ac6e5b	00000000-0000-0000-0000-000000000001	dashboards	t	2026-08-05 19:34:14.251708+05:30
77b47444-695a-414e-b41d-cb87bcc08382	00000000-0000-0000-0000-000000000001	content_translation	t	2026-08-05 19:34:14.251708+05:30
\.


--
-- TOC entry 5321 (class 0 OID 772893)
-- Dependencies: 221
-- Data for Name: jh_group; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jh_group (id, factory_id, area_id, name, is_active, created_at, module_group_id, leader_emp_id, leader_name) FROM stdin;
\.


--
-- TOC entry 5349 (class 0 OID 773775)
-- Dependencies: 252
-- Data for Name: jh_groups_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jh_groups_list (id, jh_group_id, emp_id, worker_name, role, created_at) FROM stdin;
\.


--
-- TOC entry 5338 (class 0 OID 773315)
-- Dependencies: 238
-- Data for Name: jh_kpi_definition; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jh_kpi_definition (id, factory_id, name, unit, target_value, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5339 (class 0 OID 773330)
-- Dependencies: 239
-- Data for Name: jh_kpi_entry; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jh_kpi_entry (id, definition_id, jh_group_id, entry_date, value, recorded_by_worker_id, created_at) FROM stdin;
\.


--
-- TOC entry 5337 (class 0 OID 773290)
-- Dependencies: 237
-- Data for Name: kaizen; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.kaizen (id, factory_id, jh_group_id, author_worker_id, team_member_ids, title, description, before_remarks, after_remarks, before_image_url, after_image_url, status, created_at) FROM stdin;
\.


--
-- TOC entry 5328 (class 0 OID 773041)
-- Dependencies: 228
-- Data for Name: machine; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine (id, factory_id, jh_group_id, name, code, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5329 (class 0 OID 773061)
-- Dependencies: 229
-- Data for Name: machine_subsection; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_subsection (id, machine_id, name, description, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5327 (class 0 OID 773022)
-- Dependencies: 227
-- Data for Name: mdm_audit; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.mdm_audit (id, factory_id, actor_worker_id, entity_table, entity_id, action, changed_fields, created_at) FROM stdin;
\.


--
-- TOC entry 5348 (class 0 OID 773756)
-- Dependencies: 251
-- Data for Name: module_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.module_groups (id, module, factory_id, module_lead_emp_id, module_lead_name, created_at) FROM stdin;
\.


--
-- TOC entry 5347 (class 0 OID 773745)
-- Dependencies: 250
-- Data for Name: modules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.modules (id, name, created_at) FROM stdin;
9164e51f-7627-4b99-8af3-63b5126a8fb4	SFM	2026-08-08 14:57:48.84411+05:30
423ba52b-12b8-47d9-90df-b213865f9eba	RFM	2026-08-08 14:57:48.84411+05:30
d033799f-0134-4c3e-8702-c55d542867f3	Labels	2026-08-08 14:57:48.84411+05:30
15756804-69da-4cf8-a6e8-41a1ff70ee12	Flexibles	2026-08-08 14:57:48.84411+05:30
\.


--
-- TOC entry 5333 (class 0 OID 773148)
-- Dependencies: 233
-- Data for Name: opl; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opl (id, factory_id, machine_id, jh_group_id, author_worker_id, title, opl_type, content_text, before_remarks, after_remarks, before_image_url, after_image_url, status, retrain_frequency_days, retired_at, retired_by, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5350 (class 0 OID 773807)
-- Dependencies: 253
-- Data for Name: opl_audit_trail; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opl_audit_trail (id, opl_id, action, status_from, status_to, submitted_by_from, submitted_by_to, performed_by, "timestamp") FROM stdin;
\.


--
-- TOC entry 5343 (class 0 OID 773401)
-- Dependencies: 246
-- Data for Name: opl_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opl_details (opl_id, title, content, before_image, after_image, submitted_by, status, "timestamp", before_description, after_description, classification) FROM stdin;
\.


--
-- TOC entry 5334 (class 0 OID 773186)
-- Dependencies: 234
-- Data for Name: opl_intended_audience; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opl_intended_audience (id, factory_id, jh_group_id, opl_id, worker_id, state, created_at, created_by) FROM stdin;
\.


--
-- TOC entry 5336 (class 0 OID 773268)
-- Dependencies: 236
-- Data for Name: opl_training; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opl_training (id, opl_id, worker_profile_id, status, trained_at, created_at) FROM stdin;
\.


--
-- TOC entry 5335 (class 0 OID 773223)
-- Dependencies: 235
-- Data for Name: opl_training_event; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opl_training_event (id, factory_id, jh_group_id, opl_id, worker_id, retrain_cycle, method, trainer_id, acknowledged, trained_at, created_at, created_by) FROM stdin;
\.


--
-- TOC entry 5318 (class 0 OID 772843)
-- Dependencies: 218
-- Data for Name: pillar; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pillar (id, factory_id, name, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5341 (class 0 OID 773388)
-- Dependencies: 244
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, code, name, description, is_active, created_at) FROM stdin;
848ea45c-cb21-461f-a6f5-7d52cb51967e	operator	Operator	Machine & Shopfloor Operator	t	2026-08-06 14:22:30.940668+05:30
10e75c01-a352-42d9-9190-17b2595ca5be	jh_lead	JH Lead	Jishuken Group Leader	t	2026-08-06 14:22:30.940668+05:30
67c33d49-477f-486e-afdf-6d98a7243c7b	module_lead	Module Lead	TPM Module Leader	t	2026-08-06 14:22:30.940668+05:30
b94ac6a6-ff3f-4953-8530-ae7294535a91	admin_5s	5s Admin	5S Administrative Controller	t	2026-08-06 14:22:30.940668+05:30
0e507906-5398-4de6-ac89-05444611cebb	area_champion_5s	5s Area Champion	5S Area Champion	t	2026-08-06 14:22:30.940668+05:30
d1b65f29-4a7b-4878-9745-e53c9f66b49b	auditor_pool	Auditor Pool	Auditor Pool Member	t	2026-08-06 14:22:30.940668+05:30
aab98f23-2749-4b08-9297-0924fbcc93c2	be_lead	BE Lead	Business Excellence Lead	t	2026-08-06 14:22:30.940668+05:30
613fb586-2e9c-4507-8378-4ecf0b1705df	it_lead	IT Lead	IT Administrator & Lead	t	2026-08-06 14:22:30.940668+05:30
2c45070d-f7c0-4bd5-ad92-f6be3f1f1106	leadership	Leadership	Executive & Plant Leadership	t	2026-08-06 14:22:30.940668+05:30
\.


--
-- TOC entry 5340 (class 0 OID 773356)
-- Dependencies: 240
-- Data for Name: translation_usage; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.translation_usage (id, factory_id, year_month, char_count, created_at) FROM stdin;
\.


--
-- TOC entry 5345 (class 0 OID 773498)
-- Dependencies: 248
-- Data for Name: user_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_details (emp_id, name, email, password_hash, role, default_plant, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5346 (class 0 OID 773510)
-- Dependencies: 249
-- Data for Name: user_plant_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_plant_access (id, emp_id, factory_id, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5325 (class 0 OID 772984)
-- Dependencies: 225
-- Data for Name: worker_factory_membership; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.worker_factory_membership (id, worker_profile_id, factory_id, is_home, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5324 (class 0 OID 772956)
-- Dependencies: 224
-- Data for Name: worker_group_membership; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.worker_group_membership (id, factory_id, worker_profile_id, jh_group_id, dmt_id, is_active, created_at) FROM stdin;
\.


--
-- TOC entry 5323 (class 0 OID 772928)
-- Dependencies: 223
-- Data for Name: worker_profile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.worker_profile (id, factory_id, jh_group_id, email, password_hash, name, employee_id, role, lang_pref, pin_hash, is_active, last_login_at, created_at) FROM stdin;
11111111-1111-1111-1111-111111111111	00000000-0000-0000-0000-000000000001	\N	admin@fulcrum.com	$2a$10$abcdefghijklmnopqrstuv	Plant Admin	EMP-001	admin	en	\N	t	\N	2026-08-05 19:34:14.251708+05:30
\.


--
-- TOC entry 5358 (class 0 OID 0)
-- Dependencies: 245
-- Name: opl_details_opl_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.opl_details_opl_id_seq', 1, false);


--
-- TOC entry 5065 (class 2606 OID 773113)
-- Name: abnormality_assignment abnormality_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality_assignment
    ADD CONSTRAINT abnormality_assignment_pkey PRIMARY KEY (id);


--
-- TOC entry 5063 (class 2606 OID 773086)
-- Name: abnormality abnormality_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality
    ADD CONSTRAINT abnormality_pkey PRIMARY KEY (id);


--
-- TOC entry 5067 (class 2606 OID 773137)
-- Name: abnormality_update abnormality_update_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality_update
    ADD CONSTRAINT abnormality_update_pkey PRIMARY KEY (id);


--
-- TOC entry 5033 (class 2606 OID 772882)
-- Name: area area_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.area
    ADD CONSTRAINT area_pkey PRIMARY KEY (id);


--
-- TOC entry 5031 (class 2606 OID 772867)
-- Name: department department_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_pkey PRIMARY KEY (id);


--
-- TOC entry 5037 (class 2606 OID 772922)
-- Name: dmt dmt_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dmt
    ADD CONSTRAINT dmt_pkey PRIMARY KEY (id);


--
-- TOC entry 5101 (class 2606 OID 773485)
-- Name: factory factory_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.factory
    ADD CONSTRAINT factory_code_key UNIQUE (code);


--
-- TOC entry 5053 (class 2606 OID 773016)
-- Name: factory_module factory_module_factory_id_module_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.factory_module
    ADD CONSTRAINT factory_module_factory_id_module_key_key UNIQUE (factory_id, module_key);


--
-- TOC entry 5055 (class 2606 OID 773014)
-- Name: factory_module factory_module_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.factory_module
    ADD CONSTRAINT factory_module_pkey PRIMARY KEY (id);


--
-- TOC entry 5103 (class 2606 OID 773483)
-- Name: factory factory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.factory
    ADD CONSTRAINT factory_pkey PRIMARY KEY (id);


--
-- TOC entry 5035 (class 2606 OID 772902)
-- Name: jh_group jh_group_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_group
    ADD CONSTRAINT jh_group_pkey PRIMARY KEY (id);


--
-- TOC entry 5119 (class 2606 OID 773786)
-- Name: jh_groups_list jh_groups_list_jh_group_id_emp_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_groups_list
    ADD CONSTRAINT jh_groups_list_jh_group_id_emp_id_key UNIQUE (jh_group_id, emp_id);


--
-- TOC entry 5121 (class 2606 OID 773784)
-- Name: jh_groups_list jh_groups_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_groups_list
    ADD CONSTRAINT jh_groups_list_pkey PRIMARY KEY (id);


--
-- TOC entry 5085 (class 2606 OID 773324)
-- Name: jh_kpi_definition jh_kpi_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_kpi_definition
    ADD CONSTRAINT jh_kpi_definition_pkey PRIMARY KEY (id);


--
-- TOC entry 5087 (class 2606 OID 773340)
-- Name: jh_kpi_entry jh_kpi_entry_definition_id_jh_group_id_entry_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_kpi_entry
    ADD CONSTRAINT jh_kpi_entry_definition_id_jh_group_id_entry_date_key UNIQUE (definition_id, jh_group_id, entry_date);


--
-- TOC entry 5089 (class 2606 OID 773338)
-- Name: jh_kpi_entry jh_kpi_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_kpi_entry
    ADD CONSTRAINT jh_kpi_entry_pkey PRIMARY KEY (id);


--
-- TOC entry 5083 (class 2606 OID 773299)
-- Name: kaizen kaizen_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kaizen
    ADD CONSTRAINT kaizen_pkey PRIMARY KEY (id);


--
-- TOC entry 5059 (class 2606 OID 773050)
-- Name: machine machine_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine
    ADD CONSTRAINT machine_pkey PRIMARY KEY (id);


--
-- TOC entry 5061 (class 2606 OID 773070)
-- Name: machine_subsection machine_subsection_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_subsection
    ADD CONSTRAINT machine_subsection_pkey PRIMARY KEY (id);


--
-- TOC entry 5057 (class 2606 OID 773030)
-- Name: mdm_audit mdm_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mdm_audit
    ADD CONSTRAINT mdm_audit_pkey PRIMARY KEY (id);


--
-- TOC entry 5117 (class 2606 OID 773764)
-- Name: module_groups module_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_groups
    ADD CONSTRAINT module_groups_pkey PRIMARY KEY (id);


--
-- TOC entry 5113 (class 2606 OID 773755)
-- Name: modules modules_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_name_key UNIQUE (name);


--
-- TOC entry 5115 (class 2606 OID 773753)
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (id);


--
-- TOC entry 5123 (class 2606 OID 773815)
-- Name: opl_audit_trail opl_audit_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_audit_trail
    ADD CONSTRAINT opl_audit_trail_pkey PRIMARY KEY (id);


--
-- TOC entry 5099 (class 2606 OID 773410)
-- Name: opl_details opl_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_details
    ADD CONSTRAINT opl_details_pkey PRIMARY KEY (opl_id);


--
-- TOC entry 5071 (class 2606 OID 773197)
-- Name: opl_intended_audience opl_intended_audience_opl_id_worker_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_intended_audience
    ADD CONSTRAINT opl_intended_audience_opl_id_worker_id_key UNIQUE (opl_id, worker_id);


--
-- TOC entry 5073 (class 2606 OID 773195)
-- Name: opl_intended_audience opl_intended_audience_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_intended_audience
    ADD CONSTRAINT opl_intended_audience_pkey PRIMARY KEY (id);


--
-- TOC entry 5069 (class 2606 OID 773160)
-- Name: opl opl_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl
    ADD CONSTRAINT opl_pkey PRIMARY KEY (id);


--
-- TOC entry 5075 (class 2606 OID 773237)
-- Name: opl_training_event opl_training_event_opl_id_worker_id_retrain_cycle_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training_event
    ADD CONSTRAINT opl_training_event_opl_id_worker_id_retrain_cycle_key UNIQUE (opl_id, worker_id, retrain_cycle);


--
-- TOC entry 5077 (class 2606 OID 773235)
-- Name: opl_training_event opl_training_event_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training_event
    ADD CONSTRAINT opl_training_event_pkey PRIMARY KEY (id);


--
-- TOC entry 5079 (class 2606 OID 773279)
-- Name: opl_training opl_training_opl_id_worker_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training
    ADD CONSTRAINT opl_training_opl_id_worker_profile_id_key UNIQUE (opl_id, worker_profile_id);


--
-- TOC entry 5081 (class 2606 OID 773277)
-- Name: opl_training opl_training_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training
    ADD CONSTRAINT opl_training_pkey PRIMARY KEY (id);


--
-- TOC entry 5029 (class 2606 OID 772852)
-- Name: pillar pillar_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pillar
    ADD CONSTRAINT pillar_pkey PRIMARY KEY (id);


--
-- TOC entry 5095 (class 2606 OID 773399)
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- TOC entry 5097 (class 2606 OID 773397)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 5091 (class 2606 OID 773367)
-- Name: translation_usage translation_usage_factory_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.translation_usage
    ADD CONSTRAINT translation_usage_factory_id_year_month_key UNIQUE (factory_id, year_month);


--
-- TOC entry 5093 (class 2606 OID 773365)
-- Name: translation_usage translation_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.translation_usage
    ADD CONSTRAINT translation_usage_pkey PRIMARY KEY (id);


--
-- TOC entry 5105 (class 2606 OID 773509)
-- Name: user_details user_details_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_details
    ADD CONSTRAINT user_details_email_key UNIQUE (email);


--
-- TOC entry 5107 (class 2606 OID 773507)
-- Name: user_details user_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_details
    ADD CONSTRAINT user_details_pkey PRIMARY KEY (emp_id);


--
-- TOC entry 5109 (class 2606 OID 773521)
-- Name: user_plant_access user_plant_access_emp_id_factory_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plant_access
    ADD CONSTRAINT user_plant_access_emp_id_factory_id_key UNIQUE (emp_id, factory_id);


--
-- TOC entry 5111 (class 2606 OID 773519)
-- Name: user_plant_access user_plant_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plant_access
    ADD CONSTRAINT user_plant_access_pkey PRIMARY KEY (id);


--
-- TOC entry 5049 (class 2606 OID 772992)
-- Name: worker_factory_membership worker_factory_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_factory_membership
    ADD CONSTRAINT worker_factory_membership_pkey PRIMARY KEY (id);


--
-- TOC entry 5051 (class 2606 OID 772994)
-- Name: worker_factory_membership worker_factory_membership_worker_profile_id_factory_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_factory_membership
    ADD CONSTRAINT worker_factory_membership_worker_profile_id_factory_id_key UNIQUE (worker_profile_id, factory_id);


--
-- TOC entry 5047 (class 2606 OID 772963)
-- Name: worker_group_membership worker_group_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_group_membership
    ADD CONSTRAINT worker_group_membership_pkey PRIMARY KEY (id);


--
-- TOC entry 5041 (class 2606 OID 772941)
-- Name: worker_profile worker_profile_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_profile
    ADD CONSTRAINT worker_profile_email_key UNIQUE (email);


--
-- TOC entry 5043 (class 2606 OID 772943)
-- Name: worker_profile worker_profile_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_profile
    ADD CONSTRAINT worker_profile_employee_id_key UNIQUE (employee_id);


--
-- TOC entry 5045 (class 2606 OID 772939)
-- Name: worker_profile worker_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_profile
    ADD CONSTRAINT worker_profile_pkey PRIMARY KEY (id);


--
-- TOC entry 5038 (class 1259 OID 772954)
-- Name: idx_worker_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_email ON public.worker_profile USING btree (email);


--
-- TOC entry 5039 (class 1259 OID 772955)
-- Name: idx_worker_emp_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_emp_id ON public.worker_profile USING btree (employee_id);


--
-- TOC entry 5139 (class 2606 OID 773114)
-- Name: abnormality_assignment abnormality_assignment_abnormality_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality_assignment
    ADD CONSTRAINT abnormality_assignment_abnormality_id_fkey FOREIGN KEY (abnormality_id) REFERENCES public.abnormality(id) ON DELETE CASCADE;


--
-- TOC entry 5140 (class 2606 OID 773124)
-- Name: abnormality_assignment abnormality_assignment_assigned_by_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality_assignment
    ADD CONSTRAINT abnormality_assignment_assigned_by_worker_id_fkey FOREIGN KEY (assigned_by_worker_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5141 (class 2606 OID 773119)
-- Name: abnormality_assignment abnormality_assignment_assignee_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality_assignment
    ADD CONSTRAINT abnormality_assignment_assignee_worker_id_fkey FOREIGN KEY (assignee_worker_id) REFERENCES public.worker_profile(id) ON DELETE CASCADE;


--
-- TOC entry 5136 (class 2606 OID 773092)
-- Name: abnormality abnormality_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality
    ADD CONSTRAINT abnormality_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machine(id) ON DELETE SET NULL;


--
-- TOC entry 5137 (class 2606 OID 773102)
-- Name: abnormality abnormality_reporter_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality
    ADD CONSTRAINT abnormality_reporter_worker_id_fkey FOREIGN KEY (reporter_worker_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5138 (class 2606 OID 773097)
-- Name: abnormality abnormality_subsection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality
    ADD CONSTRAINT abnormality_subsection_id_fkey FOREIGN KEY (subsection_id) REFERENCES public.machine_subsection(id) ON DELETE SET NULL;


--
-- TOC entry 5142 (class 2606 OID 773138)
-- Name: abnormality_update abnormality_update_abnormality_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality_update
    ADD CONSTRAINT abnormality_update_abnormality_id_fkey FOREIGN KEY (abnormality_id) REFERENCES public.abnormality(id) ON DELETE CASCADE;


--
-- TOC entry 5143 (class 2606 OID 773143)
-- Name: abnormality_update abnormality_update_author_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormality_update
    ADD CONSTRAINT abnormality_update_author_worker_id_fkey FOREIGN KEY (author_worker_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5124 (class 2606 OID 772888)
-- Name: area area_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.area
    ADD CONSTRAINT area_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE SET NULL;


--
-- TOC entry 5125 (class 2606 OID 772908)
-- Name: jh_group jh_group_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_group
    ADD CONSTRAINT jh_group_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area(id) ON DELETE SET NULL;


--
-- TOC entry 5126 (class 2606 OID 773802)
-- Name: jh_group jh_group_leader_emp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_group
    ADD CONSTRAINT jh_group_leader_emp_id_fkey FOREIGN KEY (leader_emp_id) REFERENCES public.user_details(emp_id) ON DELETE SET NULL;


--
-- TOC entry 5127 (class 2606 OID 773797)
-- Name: jh_group jh_group_module_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_group
    ADD CONSTRAINT jh_group_module_group_id_fkey FOREIGN KEY (module_group_id) REFERENCES public.module_groups(id) ON DELETE CASCADE;


--
-- TOC entry 5168 (class 2606 OID 773792)
-- Name: jh_groups_list jh_groups_list_emp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_groups_list
    ADD CONSTRAINT jh_groups_list_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.user_details(emp_id) ON DELETE CASCADE;


--
-- TOC entry 5169 (class 2606 OID 773787)
-- Name: jh_groups_list jh_groups_list_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_groups_list
    ADD CONSTRAINT jh_groups_list_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE CASCADE;


--
-- TOC entry 5161 (class 2606 OID 773341)
-- Name: jh_kpi_entry jh_kpi_entry_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_kpi_entry
    ADD CONSTRAINT jh_kpi_entry_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.jh_kpi_definition(id) ON DELETE CASCADE;


--
-- TOC entry 5162 (class 2606 OID 773346)
-- Name: jh_kpi_entry jh_kpi_entry_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_kpi_entry
    ADD CONSTRAINT jh_kpi_entry_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE CASCADE;


--
-- TOC entry 5163 (class 2606 OID 773351)
-- Name: jh_kpi_entry jh_kpi_entry_recorded_by_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jh_kpi_entry
    ADD CONSTRAINT jh_kpi_entry_recorded_by_worker_id_fkey FOREIGN KEY (recorded_by_worker_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5159 (class 2606 OID 773310)
-- Name: kaizen kaizen_author_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kaizen
    ADD CONSTRAINT kaizen_author_worker_id_fkey FOREIGN KEY (author_worker_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5160 (class 2606 OID 773305)
-- Name: kaizen kaizen_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kaizen
    ADD CONSTRAINT kaizen_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE SET NULL;


--
-- TOC entry 5134 (class 2606 OID 773056)
-- Name: machine machine_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine
    ADD CONSTRAINT machine_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE SET NULL;


--
-- TOC entry 5135 (class 2606 OID 773071)
-- Name: machine_subsection machine_subsection_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_subsection
    ADD CONSTRAINT machine_subsection_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machine(id) ON DELETE CASCADE;


--
-- TOC entry 5133 (class 2606 OID 773036)
-- Name: mdm_audit mdm_audit_actor_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mdm_audit
    ADD CONSTRAINT mdm_audit_actor_worker_id_fkey FOREIGN KEY (actor_worker_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5166 (class 2606 OID 773765)
-- Name: module_groups module_groups_factory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_groups
    ADD CONSTRAINT module_groups_factory_id_fkey FOREIGN KEY (factory_id) REFERENCES public.factory(id) ON DELETE CASCADE;


--
-- TOC entry 5167 (class 2606 OID 773770)
-- Name: module_groups module_groups_module_lead_emp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_groups
    ADD CONSTRAINT module_groups_module_lead_emp_id_fkey FOREIGN KEY (module_lead_emp_id) REFERENCES public.user_details(emp_id) ON DELETE SET NULL;


--
-- TOC entry 5144 (class 2606 OID 773176)
-- Name: opl opl_author_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl
    ADD CONSTRAINT opl_author_worker_id_fkey FOREIGN KEY (author_worker_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5148 (class 2606 OID 773218)
-- Name: opl_intended_audience opl_intended_audience_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_intended_audience
    ADD CONSTRAINT opl_intended_audience_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5149 (class 2606 OID 773203)
-- Name: opl_intended_audience opl_intended_audience_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_intended_audience
    ADD CONSTRAINT opl_intended_audience_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE CASCADE;


--
-- TOC entry 5150 (class 2606 OID 773208)
-- Name: opl_intended_audience opl_intended_audience_opl_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_intended_audience
    ADD CONSTRAINT opl_intended_audience_opl_id_fkey FOREIGN KEY (opl_id) REFERENCES public.opl(id) ON DELETE CASCADE;


--
-- TOC entry 5151 (class 2606 OID 773213)
-- Name: opl_intended_audience opl_intended_audience_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_intended_audience
    ADD CONSTRAINT opl_intended_audience_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.worker_profile(id) ON DELETE CASCADE;


--
-- TOC entry 5145 (class 2606 OID 773171)
-- Name: opl opl_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl
    ADD CONSTRAINT opl_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE SET NULL;


--
-- TOC entry 5146 (class 2606 OID 773166)
-- Name: opl opl_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl
    ADD CONSTRAINT opl_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machine(id) ON DELETE SET NULL;


--
-- TOC entry 5147 (class 2606 OID 773181)
-- Name: opl opl_retired_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl
    ADD CONSTRAINT opl_retired_by_fkey FOREIGN KEY (retired_by) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5152 (class 2606 OID 773263)
-- Name: opl_training_event opl_training_event_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training_event
    ADD CONSTRAINT opl_training_event_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5153 (class 2606 OID 773243)
-- Name: opl_training_event opl_training_event_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training_event
    ADD CONSTRAINT opl_training_event_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE CASCADE;


--
-- TOC entry 5154 (class 2606 OID 773248)
-- Name: opl_training_event opl_training_event_opl_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training_event
    ADD CONSTRAINT opl_training_event_opl_id_fkey FOREIGN KEY (opl_id) REFERENCES public.opl(id) ON DELETE CASCADE;


--
-- TOC entry 5155 (class 2606 OID 773258)
-- Name: opl_training_event opl_training_event_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training_event
    ADD CONSTRAINT opl_training_event_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.worker_profile(id) ON DELETE SET NULL;


--
-- TOC entry 5156 (class 2606 OID 773253)
-- Name: opl_training_event opl_training_event_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training_event
    ADD CONSTRAINT opl_training_event_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.worker_profile(id) ON DELETE CASCADE;


--
-- TOC entry 5157 (class 2606 OID 773280)
-- Name: opl_training opl_training_opl_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training
    ADD CONSTRAINT opl_training_opl_id_fkey FOREIGN KEY (opl_id) REFERENCES public.opl(id) ON DELETE CASCADE;


--
-- TOC entry 5158 (class 2606 OID 773285)
-- Name: opl_training opl_training_worker_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opl_training
    ADD CONSTRAINT opl_training_worker_profile_id_fkey FOREIGN KEY (worker_profile_id) REFERENCES public.worker_profile(id) ON DELETE CASCADE;


--
-- TOC entry 5164 (class 2606 OID 773522)
-- Name: user_plant_access user_plant_access_emp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plant_access
    ADD CONSTRAINT user_plant_access_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.user_details(emp_id) ON DELETE CASCADE;


--
-- TOC entry 5165 (class 2606 OID 773527)
-- Name: user_plant_access user_plant_access_factory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plant_access
    ADD CONSTRAINT user_plant_access_factory_id_fkey FOREIGN KEY (factory_id) REFERENCES public.factory(id) ON DELETE CASCADE;


--
-- TOC entry 5132 (class 2606 OID 772995)
-- Name: worker_factory_membership worker_factory_membership_worker_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_factory_membership
    ADD CONSTRAINT worker_factory_membership_worker_profile_id_fkey FOREIGN KEY (worker_profile_id) REFERENCES public.worker_profile(id) ON DELETE CASCADE;


--
-- TOC entry 5129 (class 2606 OID 772979)
-- Name: worker_group_membership worker_group_membership_dmt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_group_membership
    ADD CONSTRAINT worker_group_membership_dmt_id_fkey FOREIGN KEY (dmt_id) REFERENCES public.dmt(id) ON DELETE CASCADE;


--
-- TOC entry 5130 (class 2606 OID 772974)
-- Name: worker_group_membership worker_group_membership_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_group_membership
    ADD CONSTRAINT worker_group_membership_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE CASCADE;


--
-- TOC entry 5131 (class 2606 OID 772969)
-- Name: worker_group_membership worker_group_membership_worker_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_group_membership
    ADD CONSTRAINT worker_group_membership_worker_profile_id_fkey FOREIGN KEY (worker_profile_id) REFERENCES public.worker_profile(id) ON DELETE CASCADE;


--
-- TOC entry 5128 (class 2606 OID 772949)
-- Name: worker_profile worker_profile_jh_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_profile
    ADD CONSTRAINT worker_profile_jh_group_id_fkey FOREIGN KEY (jh_group_id) REFERENCES public.jh_group(id) ON DELETE SET NULL;


-- Completed on 2026-08-09 13:30:17

--
-- PostgreSQL database dump complete
--

