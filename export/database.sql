--
-- PostgreSQL database dump
--


-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.projects DROP CONSTRAINT IF EXISTS projects_suggested_by_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.projects DROP CONSTRAINT IF EXISTS projects_owner_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.projects DROP CONSTRAINT IF EXISTS projects_department_id_departments_id_fk;
ALTER TABLE IF EXISTS ONLY public.projects DROP CONSTRAINT IF EXISTS projects_bucket_id_department_buckets_id_fk;
ALTER TABLE IF EXISTS ONLY public.project_comments DROP CONSTRAINT IF EXISTS project_comments_project_id_projects_id_fk;
ALTER TABLE IF EXISTS ONLY public.project_comments DROP CONSTRAINT IF EXISTS project_comments_author_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.department_buckets DROP CONSTRAINT IF EXISTS department_buckets_department_id_departments_id_fk;
DROP INDEX IF EXISTS public.ticket_views_user_name_unique;
DROP INDEX IF EXISTS public.projects_updated_idx;
DROP INDEX IF EXISTS public.projects_department_idx;
DROP INDEX IF EXISTS public.projects_bucket_idx;
DROP INDEX IF EXISTS public.project_comments_project_idx;
DROP INDEX IF EXISTS public.department_buckets_dept_name_uq;
DROP INDEX IF EXISTS public.department_buckets_dept_idx;
DROP INDEX IF EXISTS public.board_members_dept_user_uniq;
ALTER TABLE IF EXISTS ONLY public.vendors DROP CONSTRAINT IF EXISTS vendors_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE IF EXISTS ONLY public.tickets DROP CONSTRAINT IF EXISTS tickets_ticket_key_unique;
ALTER TABLE IF EXISTS ONLY public.tickets DROP CONSTRAINT IF EXISTS tickets_pkey;
ALTER TABLE IF EXISTS ONLY public.ticket_views DROP CONSTRAINT IF EXISTS ticket_views_pkey;
ALTER TABLE IF EXISTS ONLY public.ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_pkey;
ALTER TABLE IF EXISTS ONLY public.session_state DROP CONSTRAINT IF EXISTS session_state_pkey;
ALTER TABLE IF EXISTS ONLY public.projects DROP CONSTRAINT IF EXISTS projects_pkey;
ALTER TABLE IF EXISTS ONLY public.project_comments DROP CONSTRAINT IF EXISTS project_comments_pkey;
ALTER TABLE IF EXISTS ONLY public.kb_articles DROP CONSTRAINT IF EXISTS kb_articles_pkey;
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS departments_slug_unique;
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS departments_pkey;
ALTER TABLE IF EXISTS ONLY public.department_settings DROP CONSTRAINT IF EXISTS department_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.department_settings DROP CONSTRAINT IF EXISTS department_settings_department_id_unique;
ALTER TABLE IF EXISTS ONLY public.department_buckets DROP CONSTRAINT IF EXISTS department_buckets_pkey;
ALTER TABLE IF EXISTS ONLY public.board_members DROP CONSTRAINT IF EXISTS board_members_pkey;
ALTER TABLE IF EXISTS ONLY public.assets DROP CONSTRAINT IF EXISTS assets_pkey;
ALTER TABLE IF EXISTS ONLY public.assets DROP CONSTRAINT IF EXISTS assets_asset_tag_unique;
ALTER TABLE IF EXISTS ONLY public.applications DROP CONSTRAINT IF EXISTS applications_pkey;
ALTER TABLE IF EXISTS public.vendors ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tickets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ticket_views ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ticket_comments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.session_state ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.projects ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_comments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.kb_articles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.departments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.department_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.department_buckets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.board_members ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.assets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.applications ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.vendors_id_seq;
DROP TABLE IF EXISTS public.vendors;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.tickets_id_seq;
DROP TABLE IF EXISTS public.tickets;
DROP SEQUENCE IF EXISTS public.ticket_views_id_seq;
DROP TABLE IF EXISTS public.ticket_views;
DROP SEQUENCE IF EXISTS public.ticket_comments_id_seq;
DROP TABLE IF EXISTS public.ticket_comments;
DROP SEQUENCE IF EXISTS public.session_state_id_seq;
DROP TABLE IF EXISTS public.session_state;
DROP SEQUENCE IF EXISTS public.projects_id_seq;
DROP TABLE IF EXISTS public.projects;
DROP SEQUENCE IF EXISTS public.project_comments_id_seq;
DROP TABLE IF EXISTS public.project_comments;
DROP SEQUENCE IF EXISTS public.kb_articles_id_seq;
DROP TABLE IF EXISTS public.kb_articles;
DROP SEQUENCE IF EXISTS public.departments_id_seq;
DROP TABLE IF EXISTS public.departments;
DROP SEQUENCE IF EXISTS public.department_settings_id_seq;
DROP TABLE IF EXISTS public.department_settings;
DROP SEQUENCE IF EXISTS public.department_buckets_id_seq;
DROP TABLE IF EXISTS public.department_buckets;
DROP SEQUENCE IF EXISTS public.board_members_id_seq;
DROP TABLE IF EXISTS public.board_members;
DROP SEQUENCE IF EXISTS public.assets_id_seq;
DROP TABLE IF EXISTS public.assets;
DROP SEQUENCE IF EXISTS public.applications_id_seq;
DROP TABLE IF EXISTS public.applications;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id integer NOT NULL,
    name text NOT NULL,
    vendor text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    website text,
    owner_id integer,
    department_id integer,
    license_seats integer,
    license_used integer,
    monthly_cost real,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.applications_id_seq OWNED BY public.applications.id;


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id integer NOT NULL,
    asset_tag text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'laptop'::text NOT NULL,
    manufacturer text,
    model text,
    serial_number text,
    location text DEFAULT ''::text NOT NULL,
    site text DEFAULT 'office'::text NOT NULL,
    status text DEFAULT 'in_use'::text NOT NULL,
    assigned_to_id integer,
    department_id integer,
    purchased_at timestamp with time zone,
    warranty_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;


--
-- Name: board_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_members (
    id integer NOT NULL,
    department_id integer NOT NULL,
    user_id integer NOT NULL,
    role text DEFAULT 'modify'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.board_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: board_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.board_members_id_seq OWNED BY public.board_members.id;


--
-- Name: department_buckets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_buckets (
    id integer NOT NULL,
    department_id integer NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#4B9CD3'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: department_buckets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.department_buckets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: department_buckets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.department_buckets_id_seq OWNED BY public.department_buckets.id;


--
-- Name: department_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_settings (
    id integer NOT NULL,
    department_id integer NOT NULL,
    portal_enabled boolean DEFAULT true NOT NULL,
    portal_title text DEFAULT 'Help Center'::text NOT NULL,
    portal_welcome text DEFAULT 'Welcome — submit a request and we''ll get back to you shortly.'::text NOT NULL,
    default_priority text DEFAULT 'medium'::text NOT NULL,
    sla_response_minutes integer DEFAULT 60 NOT NULL,
    sla_resolution_minutes integer DEFAULT 1440 NOT NULL,
    auto_assign boolean DEFAULT true NOT NULL,
    notify_on_new_ticket boolean DEFAULT true NOT NULL,
    notify_on_sla_breach boolean DEFAULT true NOT NULL,
    allow_end_user_attachments boolean DEFAULT true NOT NULL,
    require_category boolean DEFAULT false NOT NULL,
    business_hours_start text DEFAULT '09:00'::text NOT NULL,
    business_hours_end text DEFAULT '17:00'::text NOT NULL,
    ticket_categories text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: department_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.department_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: department_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.department_settings_id_seq OWNED BY public.department_settings.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    icon text DEFAULT 'Briefcase'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: kb_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_articles (
    id integer NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    department_id integer NOT NULL,
    author_id integer NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    sync_status text DEFAULT 'completed'::text NOT NULL,
    last_synced_at timestamp with time zone
);


--
-- Name: kb_articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kb_articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kb_articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kb_articles_id_seq OWNED BY public.kb_articles.id;


--
-- Name: project_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_comments (
    id integer NOT NULL,
    project_id integer NOT NULL,
    author_id integer,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_comments_id_seq OWNED BY public.project_comments.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    color text DEFAULT '#4B9CD3'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    department_id integer,
    owner_id integer,
    due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    suggested_by_id integer,
    goal text DEFAULT ''::text NOT NULL,
    implementation text DEFAULT ''::text NOT NULL,
    rationale text DEFAULT ''::text NOT NULL,
    impacted_department_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    additional_comments text DEFAULT ''::text NOT NULL,
    completed_year integer,
    labels jsonb DEFAULT '[]'::jsonb NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    bucket_id integer,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: session_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_state (
    id integer NOT NULL,
    current_user_id integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_state_id_seq OWNED BY public.session_state.id;


--
-- Name: ticket_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_comments (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    author_id integer NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_comments_id_seq OWNED BY public.ticket_comments.id;


--
-- Name: ticket_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_views (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    config jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_views_id_seq OWNED BY public.ticket_views.id;


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id integer NOT NULL,
    ticket_key text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    type text DEFAULT 'incident'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    source text DEFAULT 'portal'::text NOT NULL,
    department_id integer NOT NULL,
    reporter_id integer NOT NULL,
    assignee_id integer,
    location text,
    team text,
    category text,
    sla_breached boolean DEFAULT false NOT NULL,
    response_due_at timestamp with time zone,
    resolution_due_at timestamp with time zone,
    first_response_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    support_level smallint DEFAULT 1 NOT NULL
);


--
-- Name: tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tickets_id_seq OWNED BY public.tickets.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    title text,
    phone text,
    location text,
    department_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    contact_name text,
    contact_email text,
    contact_phone text,
    website text,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications ALTER COLUMN id SET DEFAULT nextval('public.applications_id_seq'::regclass);


--
-- Name: assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);


--
-- Name: board_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_members ALTER COLUMN id SET DEFAULT nextval('public.board_members_id_seq'::regclass);


--
-- Name: department_buckets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_buckets ALTER COLUMN id SET DEFAULT nextval('public.department_buckets_id_seq'::regclass);


--
-- Name: department_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_settings ALTER COLUMN id SET DEFAULT nextval('public.department_settings_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: kb_articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_articles ALTER COLUMN id SET DEFAULT nextval('public.kb_articles_id_seq'::regclass);


--
-- Name: project_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comments ALTER COLUMN id SET DEFAULT nextval('public.project_comments_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: session_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_state ALTER COLUMN id SET DEFAULT nextval('public.session_state_id_seq'::regclass);


--
-- Name: ticket_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments ALTER COLUMN id SET DEFAULT nextval('public.ticket_comments_id_seq'::regclass);


--
-- Name: ticket_views id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_views ALTER COLUMN id SET DEFAULT nextval('public.ticket_views_id_seq'::regclass);


--
-- Name: tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets ALTER COLUMN id SET DEFAULT nextval('public.tickets_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Data for Name: applications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.applications (id, name, vendor, category, status, description, website, owner_id, department_id, license_seats, license_used, monthly_cost, created_at, updated_at) FROM stdin;
1	Procore	Procore Technologies	ops	active	Construction PM platform	\N	\N	\N	120	98	\N	2026-04-24 18:33:08.350657+00	2026-04-24 18:33:08.350657+00
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assets (id, asset_tag, name, type, manufacturer, model, serial_number, location, site, status, assigned_to_id, department_id, purchased_at, warranty_ends_at, created_at, updated_at) FROM stdin;
1	EWH-LAP-0042	MacBook Pro 14"	laptop	Apple	MBP14 M3	C02XKQ9PMD6T	Plainview HQ	office	in_use	33	14	2024-08-12 00:00:00+00	2027-08-12 00:00:00+00	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
2	EWH-LAP-0043	MacBook Pro 14"	laptop	Apple	MBP14 M3	C02XKQ9PMD7T	Plainview HQ	office	in_use	34	14	2024-08-12 00:00:00+00	2027-08-12 00:00:00+00	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
3	EWH-MON-0211	Dell U2723QE 27"	monitor	Dell	U2723QE	DLM2723QE-991	Plainview HQ	office	in_use	35	14	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
4	EWH-PRT-0008	HP Color LaserJet	printer	HP	M553x	HP-LJM553-8181	Plainview HQ Floor 4	office	in_use	\N	14	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
5	EWH-PHN-0117	iPhone 15	phone	Apple	iPhone 15 Pro	F2LWDQXC15	Plainview HQ	office	in_use	53	22	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
6	EWH-SVR-0003	Dell PowerEdge R750	server	Dell	R750	PE-R750-0003	Plainview HQ Server Room	office	in_use	\N	14	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
7	JFK6-LAP-0102	ThinkPad T14 (jobsite kit)	laptop	Lenovo	T14 Gen 4	PF3CKTRX102	JFK Terminal 6 Trailer A	jobsite	in_use	55	15	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
8	CORN-LAP-0033	ThinkPad T14 (jobsite kit)	laptop	Lenovo	T14 Gen 4	PF3CKTRX033	Cornell Tech Trailer 1	jobsite	in_use	58	24	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
9	LGA-PRN-0021	Brother MFC Printer	printer	Brother	MFC-L8900CDW	BR-LGA-021	LaGuardia Concourse Trailer	jobsite	in_use	\N	14	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
10	BNY-RTR-0009	Cisco Meraki MX67	network	Cisco	MX67	MK-MX67-9	Brooklyn Navy Yard Trailer	jobsite	in_use	\N	14	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
11	EWH-TBL-0044	iPad Pro 12.9"	tablet	Apple	iPad Pro M2	DMQX1FTBL44	Plainview HQ	office	in_storage	\N	14	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
12	EWH-LAP-0029	MacBook Air 13"	laptop	Apple	M2 Air	C02OLDAIR29	Plainview HQ Storage	office	retired	\N	14	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
13	JFK6-TLR-0001	Total Station	tool	Trimble	S7	TR-S7-001	JFK Terminal 6 Trailer A	jobsite	in_use	\N	15	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
14	EWH-VEH-0007	Ford F-150 (Fleet)	vehicle	Ford	F-150 XL 2024	1FTFW1E5XPKE12345	Plainview HQ Lot	office	in_use	\N	26	\N	\N	2026-04-24 13:40:22.240283+00	2026-04-24 13:40:22.240283+00
\.


--
-- Data for Name: board_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.board_members (id, department_id, user_id, role, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: department_buckets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.department_buckets (id, department_id, name, color, "position", created_at) FROM stdin;
1	15	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
2	15	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
3	15	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
4	15	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
5	15	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
6	15	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
7	15	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
8	16	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
9	16	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
10	16	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
11	16	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
12	16	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
13	16	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
14	16	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
15	18	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
16	18	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
17	18	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
18	18	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
19	18	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
20	18	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
21	18	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
22	19	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
23	19	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
24	19	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
25	19	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
26	19	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
27	19	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
28	19	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
29	20	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
30	20	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
31	20	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
32	20	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
33	20	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
34	20	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
35	20	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
36	21	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
37	21	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
38	21	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
39	21	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
40	21	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
41	21	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
42	21	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
43	22	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
44	22	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
45	22	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
46	22	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
47	22	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
48	22	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
49	22	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
50	23	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
51	23	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
52	23	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
53	23	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
54	23	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
55	23	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
56	23	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
57	24	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
58	24	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
59	24	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
60	24	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
61	24	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
62	24	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
63	24	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
64	25	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
65	25	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
66	25	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
67	25	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
68	25	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
69	25	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
70	25	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
71	26	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
72	26	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
73	26	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
74	26	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
75	26	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
76	26	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
77	26	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
78	27	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
79	27	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
80	27	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
81	27	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
82	27	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
83	27	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
84	27	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
85	14	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
86	14	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
87	14	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
88	14	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
89	14	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
90	14	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
91	14	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
92	17	New Suggestions	#94A3B8	0	2026-04-25 02:47:53.832856+00
93	17	Future Roadmap	#A78BFA	1	2026-04-25 02:47:53.832856+00
94	17	Backlog	#60A5FA	2	2026-04-25 02:47:53.832856+00
95	17	Phase 1 - R&D (Go/No-Go)	#F59E0B	3	2026-04-25 02:47:53.832856+00
96	17	Phase 2 - Preparation & Planning	#FB923C	4	2026-04-25 02:47:53.832856+00
97	17	Phase 3 - Implementation	#F472B6	5	2026-04-25 02:47:53.832856+00
98	17	2026 Completed Initiatives	#34D399	6	2026-04-25 02:47:53.832856+00
\.


--
-- Data for Name: department_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.department_settings (id, department_id, portal_enabled, portal_title, portal_welcome, default_priority, sla_response_minutes, sla_resolution_minutes, auto_assign, notify_on_new_ticket, notify_on_sla_breach, allow_end_user_attachments, require_category, business_hours_start, business_hours_end, ticket_categories, updated_at) FROM stdin;
15	15	t	QAQC Help Center	Submit a request to the QAQC team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
16	16	t	Safety Help Center	Submit a request to the Safety team and we'll respond shortly.	medium	15	240	t	t	t	t	f	08:00	18:00	{"Near miss",Incident,PPE,"Site inspection"}	2026-04-24 13:40:22.201054+00
17	17	t	Finance & Accounting Help Center	Submit a request to the Finance & Accounting team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
18	18	t	HR Help Center	Submit a request to the HR team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{Benefits,PTO,Onboarding,"Payroll question"}	2026-04-24 13:40:22.201054+00
19	19	t	Insurance Help Center	Submit a request to the Insurance team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
20	20	t	Legal Help Center	Submit a request to the Legal team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
21	21	t	MWBE Help Center	Submit a request to the MWBE team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
22	22	t	Marketing & Sales Help Center	Submit a request to the Marketing & Sales team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
23	23	t	Prequalification Help Center	Submit a request to the Prequalification team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
24	24	t	Procore Help Center	Submit a request to the Procore team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
25	25	t	Security Help Center	Submit a request to the Security team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
26	26	t	Workplace Resources Help Center	Submit a request to the Workplace Resources team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{General,Question,Request}	2026-04-24 13:40:22.201054+00
27	27	t	Help Center	Welcome — submit a request and we'll get back to you shortly.	medium	60	1440	t	t	t	t	f	09:00	17:00	{}	2026-04-24 15:50:18.564354+00
14	14	t	IT Service Desk Portal	Submit a request to the IT team and we'll respond shortly.	medium	60	1440	t	t	t	t	f	08:00	18:00	{Hardware,Software,Access,Network,Email}	2026-04-24 17:23:52.287+00
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.departments (id, name, slug, color, icon, description, created_at, updated_at) FROM stdin;
15	QAQC	qaqc	#0ea5e9	ShieldCheck	Quality Assurance & Quality Control.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
16	Safety	safety	#f59e0b	HardHat	Site safety and incident response.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
18	HR	hr	#ec4899	Users	Hiring, benefits, employee relations.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
19	Insurance	insurance	#8b5cf6	Umbrella	Policy, claims, COI.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
20	Legal	legal	#0f172a	Scale	Contracts and compliance.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
21	MWBE	mwbe	#22c55e	Handshake	Minority/Women Business Enterprise compliance.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
22	Marketing & Sales	marketing-sales	#f43f5e	Megaphone	Outbound, brand, proposals.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
23	Prequalification	prequalification	#14b8a6	ListChecks	Vendor and project prequalification.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
24	Procore	procore	#f97316	Hammer	Procore platform admin and field support.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
25	Security	security	#dc2626	Lock	Physical and information security.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
26	Workplace Resources	workplace-resources	#64748b	Building2	Office, facilities, supplies.	2026-04-24 13:40:22.194108+00	2026-04-24 13:40:22.194108+00
27	Operations Test 1	operations-test-1	#0ea5e9	Wrench	\N	2026-04-24 15:50:18.310258+00	2026-04-24 15:50:18.310258+00
14	IT Support Ops	it	#6366f1	Laptop	Information Technology service desk.	2026-04-24 13:40:22.194108+00	2026-04-24 17:23:05.875+00
17	Finance & Accounting	finance	#3b82f6	Banknote	AP, AR, payroll, expense.	2026-04-24 13:40:22.194108+00	2026-04-24 17:46:41.791+00
\.


--
-- Data for Name: kb_articles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.kb_articles (id, title, body, department_id, author_id, tags, views, created_at, updated_at, source, sync_status, last_synced_at) FROM stdin;
2	Connecting to the jobsite VPN (OpenVPN)	Each jobsite trailer has its own OpenVPN profile. Download the matching .ovpn file from the IT portal, then...	14	33	{vpn,jobsite,network}	219	2026-04-24 13:40:22.236478+00	2026-04-24 13:40:22.236478+00	confluence	completed	2026-04-05 17:05:59.144699+00
3	Reporting a near miss on site	Any near miss must be reported within 24 hours. Use the Safety portal or call the on-call safety officer.	16	38	{"near miss",OSHA,field}	88	2026-04-24 13:40:22.236478+00	2026-04-24 13:40:22.236478+00	notion	completed	2026-04-19 01:31:13.17784+00
4	Submitting expense reports in Concur	All expenses over $25 require a receipt. Submit weekly. Project codes must match the cost code in Sage.	17	40	{concur,expense,ap}	174	2026-04-24 13:40:22.236478+00	2026-04-24 13:40:22.236478+00	freshservice	completed	2026-04-11 20:24:45.392106+00
5	Open enrollment FAQ	Open enrollment runs annually in November. Eligible benefits include medical, dental, vision, 401k, and HSA.	18	42	{benefits,enrollment}	96	2026-04-24 13:40:22.236478+00	2026-04-24 13:40:22.236478+00	sharepoint	completed	2026-03-26 00:49:42.075673+00
6	Procore RFI routing rules	RFIs are routed by trade. Mechanical RFIs auto-assign to the MEP coordinator. Architectural RFIs go to the design lead.	24	50	{procore,rfi}	53	2026-04-24 13:40:22.236478+00	2026-04-26 15:36:27.399+00	manual	completed	2026-04-23 01:29:41.400151+00
1	How to reset your corporate password	If you've forgotten your password or it has expired, follow these steps...\n\n1. Visit the password portal\n2. Enter your @ewhowell.com email\n3. Check your phone for the verification code	14	33	{password,account,self-serve}	7	2026-04-24 13:40:22.236478+00	2026-04-26 15:36:34.352+00	manual	completed	2026-03-28 12:04:20.08931+00
\.


--
-- Data for Name: project_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.project_comments (id, project_id, author_id, body, created_at) FROM stdin;
1	53	33	Kicked off the pilot	2026-04-25 03:09:45.143137+00
3	64	33	Lena comment	2026-04-25 03:17:30.119411+00
4	65	33	x	2026-04-25 03:21:36.877872+00
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, name, description, color, status, department_id, owner_id, due_at, created_at, updated_at, suggested_by_id, goal, implementation, rationale, impacted_department_ids, additional_comments, completed_year, labels, priority, bucket_id, checklist) FROM stdin;
49	Block AI chatbots joining Microsoft Teams Meetings		#F97316	active	14	35	2026-06-15 17:00:00+00	2026-04-25 01:53:01.99925+00	2026-04-25 01:53:02.008+00	34	Stop unmanaged AI assistants from auto-joining Teams meetings.		Unsanctioned chatbots can capture confidential conversations and exfiltrate notes.	[]		\N	[{"name": "IT Security", "color": "#F97316"}, {"name": "Risk Register", "color": "#F43F5E"}, {"name": "Cost Impact (None)", "color": "#10B981"}, {"name": "P2 (Not Urgent / Important)", "color": "#F59E0B"}, {"name": "User Impact - High", "color": "#06B6D4"}, {"name": "Time to implement", "color": "#3B82F6"}]	medium	87	[]
52	Install, migrate, and enroll servers to Intune (Install to latest Windows Server)		#F97316	active	14	38	2026-06-15 17:00:00+00	2026-04-25 01:53:02.051984+00	2026-04-25 01:53:02.058+00	\N			Unifies device management and gets us off the legacy Windows Server.	[]		\N	[{"name": "IT Operations", "color": "#F97316"}, {"name": "IT Security", "color": "#F97316"}, {"name": "Risk Register", "color": "#F43F5E"}, {"name": "P1 (Urgent) / Budgeted", "color": "#F59E0B"}, {"name": "User Impact - High", "color": "#06B6D4"}, {"name": "Time to implement", "color": "#3B82F6"}]	high	87	[]
44	Block AI chatbots joining Microsoft Teams meetings		#0EA5E9	active	14	33	2026-05-15 00:00:00+00	2026-04-24 20:09:56.610358+00	2026-04-24 20:09:56.610358+00	\N				[]		\N	[{"name": "IT Security", "color": "#0EA5E9"}, {"name": "Risk Register", "color": "#F43F5E"}]	high	87	[{"done": true, "text": "Audit current Teams policies", "assigneeId": null}, {"done": false, "text": "Define exception process", "assigneeId": null}, {"done": false, "text": "Roll out tenant-wide", "assigneeId": null}]
45	Microsoft Copilot enablement		#10B981	active	14	33	2026-05-08 00:00:00+00	2026-04-24 20:09:56.653172+00	2026-04-24 20:09:56.653172+00	\N				[]		\N	[{"name": "Business Ops", "color": "#10B981"}]	medium	87	[{"done": true, "text": "Complete powerpoint", "assigneeId": null}, {"done": false, "text": "Create demo videos", "assigneeId": null}]
46	AI tool to automate manual work		#F97316	active	14	33	\N	2026-04-24 20:09:56.694771+00	2026-04-24 20:09:56.694771+00	\N				[]		\N	[{"name": "IT Operations", "color": "#F97316"}, {"name": "Cost Impact", "color": "#F59E0B"}]	urgent	87	[{"done": true, "text": "Vendor shortlist", "assigneeId": null}, {"done": true, "text": "POC with Finance team", "assigneeId": null}, {"done": false, "text": "Procurement", "assigneeId": null}]
47	AI internal Chat bot		#0EA5E9	active	14	\N	\N	2026-04-24 20:09:56.734404+00	2026-04-24 20:09:56.734404+00	\N				[]		\N	[{"name": "IT Security", "color": "#0EA5E9"}]	high	87	[{"done": false, "text": "Knowledge base export", "assigneeId": null}, {"done": false, "text": "Privacy review", "assigneeId": null}, {"done": false, "text": "Pilot with HR", "assigneeId": null}]
48	Install, migrate, and enroll servers to Intune		#F97316	active	14	33	\N	2026-04-24 20:09:56.774216+00	2026-04-24 20:09:56.774216+00	\N				[]		\N	[{"name": "IT Operations", "color": "#F97316"}, {"name": "Risk Register", "color": "#F43F5E"}]	medium	87	[{"done": true, "text": "Plan window", "assigneeId": null}, {"done": true, "text": "Migrate prod", "assigneeId": null}, {"done": true, "text": "Final validation", "assigneeId": null}]
50	AI internal Chat bot		#F97316	active	14	36	2026-06-15 17:00:00+00	2026-04-25 01:53:02.018124+00	2026-04-25 01:53:02.026+00	33				[]		\N	[{"name": "Business Ops", "color": "#F97316"}, {"name": "Cost Impact (Not Budgeted)", "color": "#F59E0B"}, {"name": "P2 (Not Urgent / Important)", "color": "#F59E0B"}, {"name": "User Impact - (None)", "color": "#06B6D4"}, {"name": "Time to implement", "color": "#3B82F6"}]	medium	87	[{"done": true, "text": "Pick a shortlist of internal LLM vendors", "assigneeId": 35}, {"done": true, "text": "Run a security review of the top option", "assigneeId": 36}, {"done": false, "text": "Pilot with the IT team", "assigneeId": 34}]
51	AI tool to automate manual work		#F97316	active	14	37	\N	2026-04-25 01:53:02.036066+00	2026-04-25 01:53:02.043+00	\N				[]		\N	[{"name": "IT Operations", "color": "#F97316"}, {"name": "IT Security", "color": "#F97316"}, {"name": "Cost Impact (Not Budgeted)", "color": "#F59E0B"}, {"name": "P2 (Not Urgent / Important)", "color": "#F59E0B"}, {"name": "User Impact - High", "color": "#06B6D4"}, {"name": "Time to implement", "color": "#3B82F6"}]	medium	87	[{"done": true, "text": "Inventory the top 10 manual tasks", "assigneeId": 37}, {"done": true, "text": "Score each task for AI fit", "assigneeId": 38}, {"done": false, "text": "Recommend a pilot candidate", "assigneeId": 37}]
57	test  project 425		#A4373A	active	\N	33	\N	2026-04-25 02:53:25.740205+00	2026-04-25 02:53:25.740205+00	33				[]		\N	[]	medium	\N	[]
58	test  project 425		#A4373A	active	\N	33	\N	2026-04-25 02:53:26.993465+00	2026-04-25 02:53:26.993465+00	33				[]		\N	[]	medium	\N	[]
64	comment-auth probe		#4B9CD3	active	14	33	\N	2026-04-25 03:17:30.048491+00	2026-04-25 03:17:30.048491+00	33				[]		\N	[]	medium	87	[]
65	final probe		#4B9CD3	active	15	33	\N	2026-04-25 03:21:36.657739+00	2026-04-25 03:21:36.829+00	33				[]		\N	[]	medium	\N	[]
53	Microsoft Copilot enablement		#4B9CD3	active	14	34	2026-05-29 00:00:00+00	2026-04-25 01:53:02.066844+00	2026-04-25 10:00:05.809+00	\N	Roll Microsoft Copilot out to the wider company in a controlled pilot.			[]		\N	[{"name": "IT Operations", "color": "#F97316"}, {"name": "IT Security", "color": "#F97316"}, {"name": "P2 (Not Urgent / Important)", "color": "#F59E0B"}, {"name": "User Impact - (None)", "color": "#06B6D4"}, {"name": "Time to implement", "color": "#3B82F6"}]	medium	86	[{"done": true, "text": "Choose pilot user group", "assigneeId": 34}, {"done": true, "text": "Provision Copilot licenses", "assigneeId": 35}, {"done": true, "text": "Run kick-off briefing", "assigneeId": 34}, {"done": true, "text": "Configure DLP guardrails", "assigneeId": 36}, {"done": true, "text": "Collect first-week feedback", "assigneeId": 34}, {"done": false, "text": "Complete powerpoint", "assigneeId": 33}, {"done": false, "text": "Create demo videos", "assigneeId": 37}, {"done": true, "text": "Pilot with five users", "assigneeId": null}]
\.


--
-- Data for Name: session_state; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session_state (id, current_user_id, updated_at) FROM stdin;
1	33	2026-04-28 00:30:07.588+00
\.


--
-- Data for Name: ticket_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ticket_comments (id, ticket_id, author_id, body, created_at) FROM stdin;
37	34	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-24 14:10:22.216+00
38	34	34	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-24 15:10:22.216+00
39	35	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-22 21:22:22.216+00
40	35	35	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-22 22:22:22.216+00
41	36	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-21 04:34:22.216+00
42	36	34	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-21 05:34:22.216+00
43	37	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-19 11:46:22.216+00
44	37	35	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-19 12:46:22.216+00
45	38	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-17 18:58:22.216+00
46	38	34	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-17 19:58:22.216+00
47	39	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-16 02:10:22.216+00
48	39	35	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-16 03:10:22.216+00
49	40	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-14 09:22:22.216+00
50	40	34	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-14 10:22:22.216+00
51	41	56	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-12 16:34:22.216+00
52	41	35	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-12 17:34:22.216+00
53	42	55	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-10 23:46:22.216+00
54	42	36	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-11 00:46:22.216+00
55	43	55	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-09 06:58:22.216+00
56	43	37	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-09 07:58:22.216+00
57	44	55	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-07 14:10:22.216+00
58	44	36	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-07 15:10:22.216+00
59	45	59	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-05 21:22:22.216+00
60	45	38	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-05 22:22:22.216+00
61	46	59	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-04 04:34:22.216+00
62	46	39	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-04 05:34:22.216+00
63	47	59	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-04-02 11:46:22.216+00
64	47	38	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-04-02 12:46:22.216+00
65	48	54	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-03-31 18:58:22.216+00
66	48	40	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-03-31 19:58:22.216+00
67	49	54	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-03-30 02:10:22.216+00
68	49	41	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-03-30 03:10:22.216+00
69	50	54	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-03-28 09:22:22.216+00
70	50	40	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-03-28 10:22:22.216+00
71	51	57	Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.	2026-03-26 16:34:22.216+00
72	51	42	Investigating now. I've escalated to the platform team and will follow up within the SLA window.	2026-03-26 17:34:22.216+00
73	67	59	hello	2026-04-24 18:47:27.300901+00
\.


--
-- Data for Name: ticket_views; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ticket_views (id, user_id, name, is_default, config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tickets (id, ticket_key, title, description, type, priority, status, source, department_id, reporter_id, assignee_id, location, team, category, sla_breached, response_due_at, resolution_due_at, first_response_at, resolved_at, created_at, updated_at, support_level) FROM stdin;
34	REQ-001	Cannot connect to corporate VPN from jobsite trailer	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	low	open	portal	14	56	34	Yankee Stadium Jobsite	Helpdesk	\N	t	2026-04-24 14:40:22.216+00	2026-04-25 13:40:22.216+00	2026-04-24 14:43:42.216+00	\N	2026-04-24 13:40:22.216+00	2026-04-24 13:40:22.216+00	1
35	INC-001	MS Teams crashes when sharing screen	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	medium	open	email	14	56	35	Yankee Stadium Jobsite	Helpdesk	\N	t	2026-04-22 21:52:22.216+00	2026-04-23 20:52:22.216+00	\N	\N	2026-04-22 20:52:22.216+00	2026-04-22 20:52:22.216+00	1
36	INC-002	Need new MacBook Pro for new hire onboarding	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	high	open	phone	14	56	34	Yankee Stadium Jobsite	Helpdesk	\N	t	2026-04-21 05:04:22.216+00	2026-04-22 04:04:22.216+00	\N	\N	2026-04-21 04:04:22.216+00	2026-04-21 04:04:22.216+00	1
37	REQ-002	Outlook search index keeps failing	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	urgent	pending	chat	14	56	35	Yankee Stadium Jobsite	Helpdesk	\N	f	2026-04-19 12:16:22.216+00	2026-04-20 11:16:22.216+00	2026-04-19 11:29:47.216+00	\N	2026-04-19 11:16:22.216+00	2026-04-19 11:16:22.216+00	1
38	INC-003	Printer on the 4th floor jamming intermittently	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	low	resolved	walk_in	14	56	34	Yankee Stadium Jobsite	Helpdesk	\N	f	2026-04-17 19:28:22.216+00	2026-04-18 18:28:22.216+00	2026-04-17 18:45:01.216+00	2026-04-18 06:28:22.216+00	2026-04-17 18:28:22.216+00	2026-04-17 18:28:22.216+00	1
39	INC-004	Request: increase Procore license seats by 5	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	medium	resolved	portal	14	56	35	Yankee Stadium Jobsite	Helpdesk	\N	t	2026-04-16 02:40:22.216+00	2026-04-17 01:40:22.216+00	2026-04-16 01:59:10.216+00	2026-04-17 02:40:22.216+00	2026-04-16 01:40:22.216+00	2026-04-16 01:40:22.216+00	1
40	REQ-003	Slack notifications not arriving on iPhone	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	high	closed	email	14	56	34	Yankee Stadium Jobsite	Helpdesk	\N	f	2026-04-14 09:52:22.216+00	2026-04-15 08:52:22.216+00	2026-04-14 09:25:28.216+00	2026-04-14 20:52:22.216+00	2026-04-14 08:52:22.216+00	2026-04-14 08:52:22.216+00	1
41	INC-005	Two-factor app reset for jobsite super	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	urgent	open	phone	14	56	35	Yankee Stadium Jobsite	Helpdesk	\N	t	2026-04-12 17:04:22.216+00	2026-04-13 16:04:22.216+00	\N	\N	2026-04-12 16:04:22.216+00	2026-04-12 16:04:22.216+00	1
42	REQ-004	Concrete cylinder break log discrepancy on JFK6	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	low	open	chat	15	55	36	JFK Terminal 6 Jobsite	\N	\N	f	2026-04-11 00:16:22.216+00	2026-04-11 23:16:22.216+00	2026-04-10 23:21:44.216+00	\N	2026-04-10 23:16:22.216+00	2026-04-10 23:16:22.216+00	1
43	INC-006	Punchlist export missing photos in Procore	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	medium	open	walk_in	15	55	37	JFK Terminal 6 Jobsite	\N	\N	t	2026-04-09 07:28:22.216+00	2026-04-10 06:28:22.216+00	\N	\N	2026-04-09 06:28:22.216+00	2026-04-09 06:28:22.216+00	1
44	INC-007	Need additional inspector for façade pour Tuesday	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	high	pending	portal	15	55	36	JFK Terminal 6 Jobsite	\N	\N	f	2026-04-07 14:40:22.216+00	2026-04-08 13:40:22.216+00	2026-04-07 13:45:43.216+00	\N	2026-04-07 13:40:22.216+00	2026-04-07 13:40:22.216+00	1
45	REQ-005	Near miss: dropped tool on Cornell Tech tower crane lift	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	urgent	resolved	email	16	59	38	LaGuardia Concourse Jobsite	Field Safety	\N	f	2026-04-05 21:07:22.216+00	2026-04-06 00:52:22.216+00	2026-04-05 20:53:04.216+00	2026-04-05 22:52:22.216+00	2026-04-05 20:52:22.216+00	2026-04-05 20:52:22.216+00	1
46	INC-008	PPE refill needed at LaGuardia warehouse	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	low	resolved	phone	16	59	39	LaGuardia Concourse Jobsite	Field Safety	\N	f	2026-04-04 04:19:22.216+00	2026-04-04 08:04:22.216+00	2026-04-04 04:05:44.216+00	2026-04-04 06:04:22.216+00	2026-04-04 04:04:22.216+00	2026-04-04 04:04:22.216+00	1
47	INC-009	Fall protection harness inspection overdue	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	medium	closed	chat	16	59	38	LaGuardia Concourse Jobsite	Field Safety	\N	f	2026-04-02 11:31:22.216+00	2026-04-02 15:16:22.216+00	2026-04-02 11:25:42.216+00	2026-04-02 13:16:22.216+00	2026-04-02 11:16:22.216+00	2026-04-02 11:16:22.216+00	1
48	REQ-006	AP invoice GL miscoded for vendor 8821	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	high	open	walk_in	17	54	40	Plainview, NY (HQ)	AP	\N	t	2026-03-31 19:28:22.216+00	2026-04-01 18:28:22.216+00	\N	\N	2026-03-31 18:28:22.216+00	2026-03-31 18:28:22.216+00	1
49	INC-010	Need W-9 from subcontractor for jobsite payment	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	urgent	open	portal	17	54	41	Plainview, NY (HQ)	AP	\N	t	2026-03-30 02:40:22.216+00	2026-03-31 01:40:22.216+00	\N	\N	2026-03-30 01:40:22.216+00	2026-03-30 01:40:22.216+00	1
50	INC-011	Expense report stuck in Concur approval	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	low	open	email	17	54	40	Plainview, NY (HQ)	AP	\N	f	2026-03-28 09:52:22.216+00	2026-03-29 08:52:22.216+00	2026-03-28 09:26:03.216+00	\N	2026-03-28 08:52:22.216+00	2026-03-28 08:52:22.216+00	1
51	REQ-007	Update beneficiary on 401k	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	medium	pending	phone	18	57	42	Plainview, NY (HQ)	\N	\N	f	2026-03-26 17:04:22.216+00	2026-03-27 16:04:22.216+00	2026-03-26 16:28:12.216+00	\N	2026-03-26 16:04:22.216+00	2026-03-26 16:04:22.216+00	1
52	INC-012	Question about parental leave eligibility	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	high	resolved	chat	18	57	43	Plainview, NY (HQ)	\N	\N	f	2026-03-25 00:16:22.216+00	2026-03-25 23:16:22.216+00	2026-03-24 23:52:41.216+00	2026-03-25 11:16:22.216+00	2026-03-24 23:16:22.216+00	2026-03-24 23:16:22.216+00	1
53	INC-013	Onboarding checklist missing for new estimator	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	urgent	resolved	walk_in	18	57	42	Plainview, NY (HQ)	\N	\N	f	2026-03-23 07:28:22.216+00	2026-03-24 06:28:22.216+00	2026-03-23 07:00:14.216+00	2026-03-23 18:28:22.216+00	2026-03-23 06:28:22.216+00	2026-03-23 06:28:22.216+00	1
54	REQ-008	Need updated COI for Brooklyn Navy Yard project	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	low	closed	portal	19	62	44	Plainview, NY (HQ)	\N	\N	t	2026-03-21 14:40:22.216+00	2026-03-22 13:40:22.216+00	2026-03-21 13:49:26.216+00	2026-03-22 14:40:22.216+00	2026-03-21 13:40:22.216+00	2026-03-21 13:40:22.216+00	1
55	INC-014	Auto policy update for new fleet truck	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	medium	open	email	19	62	44	Plainview, NY (HQ)	\N	\N	t	2026-03-19 21:52:22.216+00	2026-03-20 20:52:22.216+00	\N	\N	2026-03-19 20:52:22.216+00	2026-03-19 20:52:22.216+00	1
56	REQ-009	Subcontract redline review needed by Friday	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	high	open	phone	20	60	45	Plainview, NY (HQ)	\N	\N	t	2026-03-18 05:04:22.216+00	2026-03-19 04:04:22.216+00	\N	\N	2026-03-18 04:04:22.216+00	2026-03-18 04:04:22.216+00	1
57	INC-015	NDA template request for new partner	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	urgent	open	chat	20	60	45	Plainview, NY (HQ)	\N	\N	t	2026-03-16 12:16:22.216+00	2026-03-17 11:16:22.216+00	\N	\N	2026-03-16 11:16:22.216+00	2026-03-16 11:16:22.216+00	1
58	REQ-010	Quarterly MWBE participation report missing data	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	low	pending	walk_in	21	63	46	Brooklyn Navy Yard Jobsite	\N	\N	f	2026-03-14 19:28:22.216+00	2026-03-15 18:28:22.216+00	2026-03-14 18:37:30.216+00	\N	2026-03-14 18:28:22.216+00	2026-03-14 18:28:22.216+00	1
59	REQ-011	Proposal binder cover update for Penn Station bid	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	medium	resolved	portal	22	53	47	Plainview, NY (HQ)	\N	\N	t	2026-03-13 02:40:22.216+00	2026-03-14 01:40:22.216+00	2026-03-13 02:16:51.216+00	2026-03-14 02:40:22.216+00	2026-03-13 01:40:22.216+00	2026-03-13 01:40:22.216+00	1
60	INC-016	Website case study for Cornell Tech needs photos	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	high	resolved	email	22	53	48	Plainview, NY (HQ)	\N	\N	f	2026-03-11 09:52:22.216+00	2026-03-12 08:52:22.216+00	2026-03-11 09:24:32.216+00	2026-03-11 20:52:22.216+00	2026-03-11 08:52:22.216+00	2026-03-11 08:52:22.216+00	1
61	REQ-012	Vendor prequal package incomplete — missing safety EMR	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	urgent	closed	phone	23	64	49	Plainview, NY (HQ)	\N	\N	f	2026-03-09 17:04:22.216+00	2026-03-10 16:04:22.216+00	2026-03-09 16:31:40.216+00	2026-03-10 04:04:22.216+00	2026-03-09 16:04:22.216+00	2026-03-09 16:04:22.216+00	1
62	REQ-013	Procore RFI workflow not routing to right approver	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	low	open	chat	24	58	50	Cornell Tech Jobsite	\N	\N	t	2026-03-08 00:16:22.216+00	2026-03-08 23:16:22.216+00	2026-03-08 00:19:42.216+00	\N	2026-03-07 23:16:22.216+00	2026-03-07 23:16:22.216+00	1
63	INC-017	Sync error between Procore and Sage 300	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	medium	open	walk_in	24	58	50	Cornell Tech Jobsite	\N	\N	t	2026-03-06 07:28:22.216+00	2026-03-07 06:28:22.216+00	\N	\N	2026-03-06 06:28:22.216+00	2026-03-06 06:28:22.216+00	1
64	REQ-014	Badge access not working at Plainview HQ side door	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	high	open	portal	25	53	51	Plainview, NY (HQ)	\N	\N	t	2026-03-04 14:40:22.216+00	2026-03-05 13:40:22.216+00	\N	\N	2026-03-04 13:40:22.216+00	2026-03-04 13:40:22.216+00	1
65	REQ-015	Office coffee machine not dispensing	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	request	urgent	pending	email	26	61	52	Plainview, NY (HQ)	\N	\N	f	2026-03-02 21:52:22.216+00	2026-03-03 20:52:22.216+00	2026-03-02 21:22:13.216+00	\N	2026-03-02 20:52:22.216+00	2026-03-02 20:52:22.216+00	1
66	INC-018	Conference room A monitor flickering	Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.	incident	low	resolved	phone	26	61	52	Plainview, NY (HQ)	\N	\N	f	2026-03-01 05:04:22.216+00	2026-03-02 04:04:22.216+00	2026-03-01 04:34:02.216+00	2026-03-01 16:04:22.216+00	2026-03-01 04:04:22.216+00	2026-03-01 04:04:22.216+00	1
67	REQ-039	My computer is very slow	My computer is very slow	request	medium	open	chat	14	59	\N	\N	\N	\N	f	2026-04-24 19:47:18.66+00	2026-04-25 18:47:18.66+00	\N	\N	2026-04-24 18:47:18.661766+00	2026-04-24 18:47:18.661766+00	1
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, role, title, phone, location, department_id, created_at, updated_at) FROM stdin;
33	Lena Park	lena.park@ewhowell.com	admin	Service Desk Administrator	\N	Plainview, NY (HQ)	14	2026-04-24 13:40:22.204027+00	2026-04-24 13:40:22.204027+00
34	Marcus Reyes	marcus.reyes@ewhowell.com	agent	Senior Systems Engineer	\N	Plainview, NY (HQ)	14	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
35	Priya Shah	priya.shah@ewhowell.com	agent	Helpdesk Lead	\N	Plainview, NY (HQ)	14	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
36	Daniel Wu	daniel.wu@ewhowell.com	agent	QA Manager	\N	Plainview, NY (HQ)	15	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
37	Hannah Riley	hannah.riley@ewhowell.com	agent	QC Inspector	\N	Plainview, NY (HQ)	15	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
38	Tomás Vega	tomas.vega@ewhowell.com	agent	Safety Director	\N	Plainview, NY (HQ)	16	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
39	Renee Okafor	renee.okafor@ewhowell.com	agent	Site Safety Officer	\N	Plainview, NY (HQ)	16	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
40	Margot Bishop	margot.bishop@ewhowell.com	agent	Controller	\N	Plainview, NY (HQ)	17	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
41	Jin Park	jin.park@ewhowell.com	agent	AP Specialist	\N	Plainview, NY (HQ)	17	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
42	Aisha Bennett	aisha.bennett@ewhowell.com	agent	HR Business Partner	\N	Plainview, NY (HQ)	18	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
43	Eli Lawson	eli.lawson@ewhowell.com	agent	Talent Coordinator	\N	Plainview, NY (HQ)	18	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
44	Owen Parrish	owen.parrish@ewhowell.com	agent	Risk Manager	\N	Plainview, NY (HQ)	19	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
45	Cara Donnelly	cara.donnelly@ewhowell.com	agent	General Counsel	\N	Plainview, NY (HQ)	20	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
46	Naomi Grant	naomi.grant@ewhowell.com	agent	MWBE Compliance Lead	\N	Plainview, NY (HQ)	21	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
47	Brett Halloran	brett.halloran@ewhowell.com	agent	Director of BD	\N	Plainview, NY (HQ)	22	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
48	Sofia Iyer	sofia.iyer@ewhowell.com	agent	Marketing Manager	\N	Plainview, NY (HQ)	22	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
49	Wendell Cho	wendell.cho@ewhowell.com	agent	Prequal Analyst	\N	Plainview, NY (HQ)	23	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
50	Ramon Castillo	ramon.castillo@ewhowell.com	agent	Procore Admin	\N	Plainview, NY (HQ)	24	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
51	Kira Nash	kira.nash@ewhowell.com	agent	Security Lead	\N	Plainview, NY (HQ)	25	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
52	Theo Bramwell	theo.bramwell@ewhowell.com	agent	Office Manager	\N	Plainview, NY (HQ)	26	2026-04-24 13:40:22.208518+00	2026-04-24 13:40:22.208518+00
53	Janelle Whitaker	janelle.whitaker@ewhowell.com	end_user	Sales Engineer	\N	Plainview, NY (HQ)	22	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
54	Trent McAllister	trent.mcallister@ewhowell.com	end_user	Project Accountant	\N	Plainview, NY (HQ)	17	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
55	Suki Watanabe	suki.watanabe@ewhowell.com	end_user	Field Engineer	\N	JFK Terminal 6 Jobsite	15	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
56	Devon Marsh	devon.marsh@ewhowell.com	end_user	Project Manager	\N	Yankee Stadium Jobsite	14	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
57	Maeve Calloway	maeve.calloway@ewhowell.com	end_user	Recruiter	\N	Plainview, NY (HQ)	18	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
58	Beatriz Solano	beatriz.solano@ewhowell.com	end_user	Superintendent	\N	Cornell Tech Jobsite	24	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
59	Asher Kowalski	asher.kowalski@ewhowell.com	end_user	Foreman	\N	LaGuardia Concourse Jobsite	16	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
60	Reese Aldridge	reese.aldridge@ewhowell.com	end_user	Contracts Coordinator	\N	Plainview, NY (HQ)	20	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
61	Indira Bose	indira.bose@ewhowell.com	end_user	Estimator	\N	Plainview, NY (HQ)	26	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
62	Quinton Meyers	quinton.meyers@ewhowell.com	end_user	Operations Lead	\N	Plainview, NY (HQ)	19	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
63	Harper Velez	harper.velez@ewhowell.com	end_user	Project Engineer	\N	Brooklyn Navy Yard Jobsite	21	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
64	Felix Brennan	felix.brennan@ewhowell.com	end_user	Estimator	\N	Plainview, NY (HQ)	23	2026-04-24 13:40:22.213241+00	2026-04-24 13:40:22.213241+00
65	Sasha Nguyen QA-1777044983291	sasha.qa.1777044983291@ewhowell.com	agent	Service Desk Analyst	\N	\N	14	2026-04-24 15:37:15.070929+00	2026-04-24 15:37:15.070929+00
66	Test Person QA-1777044983291	test.person.1777044983291@ewhowell.com	end_user	Project Engineer	\N	Cornell Tech Jobsite	24	2026-04-24 15:38:05.546496+00	2026-04-24 15:38:05.546496+00
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vendors (id, name, category, status, contact_name, contact_email, contact_phone, website, notes, created_at, updated_at) FROM stdin;
1	Procore Technologies	software	active	Acct Mgr	rep@procore.com	\N	\N	EA renewal Q3	2026-04-24 18:33:08.404131+00	2026-04-24 18:33:08.404131+00
\.


--
-- Name: applications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.applications_id_seq', 2, true);


--
-- Name: assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.assets_id_seq', 14, true);


--
-- Name: board_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.board_members_id_seq', 3, true);


--
-- Name: department_buckets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.department_buckets_id_seq', 102, true);


--
-- Name: department_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.department_settings_id_seq', 27, true);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 28, true);


--
-- Name: kb_articles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.kb_articles_id_seq', 7, true);


--
-- Name: project_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.project_comments_id_seq', 4, true);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.projects_id_seq', 65, true);


--
-- Name: session_state_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.session_state_id_seq', 1, true);


--
-- Name: ticket_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ticket_comments_id_seq', 73, true);


--
-- Name: ticket_views_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ticket_views_id_seq', 1, false);


--
-- Name: tickets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tickets_id_seq', 67, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 66, true);


--
-- Name: vendors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vendors_id_seq', 2, true);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: assets assets_asset_tag_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_tag_unique UNIQUE (asset_tag);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: board_members board_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_members
    ADD CONSTRAINT board_members_pkey PRIMARY KEY (id);


--
-- Name: department_buckets department_buckets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_buckets
    ADD CONSTRAINT department_buckets_pkey PRIMARY KEY (id);


--
-- Name: department_settings department_settings_department_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_settings
    ADD CONSTRAINT department_settings_department_id_unique UNIQUE (department_id);


--
-- Name: department_settings department_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_settings
    ADD CONSTRAINT department_settings_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: departments departments_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_slug_unique UNIQUE (slug);


--
-- Name: kb_articles kb_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_articles
    ADD CONSTRAINT kb_articles_pkey PRIMARY KEY (id);


--
-- Name: project_comments project_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: session_state session_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_state
    ADD CONSTRAINT session_state_pkey PRIMARY KEY (id);


--
-- Name: ticket_comments ticket_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: ticket_views ticket_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_views
    ADD CONSTRAINT ticket_views_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_ticket_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_key_unique UNIQUE (ticket_key);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: board_members_dept_user_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX board_members_dept_user_uniq ON public.board_members USING btree (department_id, user_id);


--
-- Name: department_buckets_dept_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX department_buckets_dept_idx ON public.department_buckets USING btree (department_id);


--
-- Name: department_buckets_dept_name_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX department_buckets_dept_name_uq ON public.department_buckets USING btree (department_id, name);


--
-- Name: project_comments_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_comments_project_idx ON public.project_comments USING btree (project_id);


--
-- Name: projects_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_bucket_idx ON public.projects USING btree (bucket_id);


--
-- Name: projects_department_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_department_idx ON public.projects USING btree (department_id);


--
-- Name: projects_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_updated_idx ON public.projects USING btree (updated_at);


--
-- Name: ticket_views_user_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ticket_views_user_name_unique ON public.ticket_views USING btree (user_id, name);


--
-- Name: department_buckets department_buckets_department_id_departments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_buckets
    ADD CONSTRAINT department_buckets_department_id_departments_id_fk FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: project_comments project_comments_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: project_comments project_comments_project_id_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_bucket_id_department_buckets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_bucket_id_department_buckets_id_fk FOREIGN KEY (bucket_id) REFERENCES public.department_buckets(id) ON DELETE SET NULL;


--
-- Name: projects projects_department_id_departments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_department_id_departments_id_fk FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: projects projects_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_suggested_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_suggested_by_id_users_id_fk FOREIGN KEY (suggested_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


