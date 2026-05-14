--
-- PostgreSQL database dump
--

\restrict w43U64tiuqAqkNhjQmhXAo8aiVJsCMW0hIckHkcAqMMc58GdlOi3tP0zqTXtSRK

-- Dumped from database version 15.16 (Debian 15.16-0+deb12u1)
-- Dumped by pg_dump version 15.16 (Debian 15.16-0+deb12u1)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analytics; Type: TABLE; Schema: public; Owner: xlip_admin
--

CREATE TABLE public.analytics (
    id integer NOT NULL,
    link_id integer,
    clicked_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address character varying(45),
    referer text,
    user_agent text
);


ALTER TABLE public.analytics OWNER TO xlip_admin;

--
-- Name: analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: xlip_admin
--

CREATE SEQUENCE public.analytics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.analytics_id_seq OWNER TO xlip_admin;

--
-- Name: analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xlip_admin
--

ALTER SEQUENCE public.analytics_id_seq OWNED BY public.analytics.id;


--
-- Name: bio_links; Type: TABLE; Schema: public; Owner: xlip
--

CREATE TABLE public.bio_links (
    id integer NOT NULL,
    profile_id integer,
    title character varying(100) NOT NULL,
    url text NOT NULL,
    image_url text,
    display_order integer DEFAULT 0,
    clicks integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.bio_links OWNER TO xlip;

--
-- Name: bio_links_id_seq; Type: SEQUENCE; Schema: public; Owner: xlip
--

CREATE SEQUENCE public.bio_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.bio_links_id_seq OWNER TO xlip;

--
-- Name: bio_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xlip
--

ALTER SEQUENCE public.bio_links_id_seq OWNED BY public.bio_links.id;


--
-- Name: bio_profiles; Type: TABLE; Schema: public; Owner: xlip
--

CREATE TABLE public.bio_profiles (
    id integer NOT NULL,
    user_id integer,
    username character varying(30) NOT NULL,
    display_name character varying(60),
    bio text,
    avatar_url text,
    accent_color character varying(7) DEFAULT '#b8d900'::character varying,
    instagram character varying(100),
    twitter character varying(100),
    tiktok character varying(100),
    youtube character varying(100),
    facebook character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.bio_profiles OWNER TO xlip;

--
-- Name: bio_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: xlip
--

CREATE SEQUENCE public.bio_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.bio_profiles_id_seq OWNER TO xlip;

--
-- Name: bio_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xlip
--

ALTER SEQUENCE public.bio_profiles_id_seq OWNED BY public.bio_profiles.id;


--
-- Name: links; Type: TABLE; Schema: public; Owner: xlip_admin
--

CREATE TABLE public.links (
    id integer NOT NULL,
    long_url text NOT NULL,
    short_code character varying(10) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer,
    custom_alias character varying(50),
    expires_at timestamp without time zone,
    link_password_hash text,
    domain_name character varying(255) DEFAULT 'xlip.uk'::character varying
);


ALTER TABLE public.links OWNER TO xlip_admin;

--
-- Name: links_id_seq; Type: SEQUENCE; Schema: public; Owner: xlip_admin
--

CREATE SEQUENCE public.links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.links_id_seq OWNER TO xlip_admin;

--
-- Name: links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xlip_admin
--

ALTER SEQUENCE public.links_id_seq OWNED BY public.links.id;


--
-- Name: subdomains; Type: TABLE; Schema: public; Owner: xlip
--

CREATE TABLE public.subdomains (
    id integer NOT NULL,
    user_id integer,
    subdomain character varying(63) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.subdomains OWNER TO xlip;

--
-- Name: subdomains_id_seq; Type: SEQUENCE; Schema: public; Owner: xlip
--

CREATE SEQUENCE public.subdomains_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.subdomains_id_seq OWNER TO xlip;

--
-- Name: subdomains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xlip
--

ALTER SEQUENCE public.subdomains_id_seq OWNED BY public.subdomains.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: xlip_admin
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_admin boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    verification_code character varying(6),
    verification_expires_at timestamp without time zone,
    is_banned boolean DEFAULT false,
    api_key text,
    plan character varying(20) DEFAULT 'free'::character varying,
    monthly_link_count integer DEFAULT 0,
    link_count_reset_at timestamp without time zone DEFAULT now(),
    trial_ends_at timestamp without time zone,
    trial_used boolean DEFAULT false,
    trial_warning_sent boolean DEFAULT false,
    plan_expires_at timestamp without time zone
);


ALTER TABLE public.users OWNER TO xlip_admin;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: xlip_admin
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO xlip_admin;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xlip_admin
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: visitor_logs; Type: TABLE; Schema: public; Owner: xlip
--

CREATE TABLE public.visitor_logs (
    id integer NOT NULL,
    ip_address character varying(45),
    action character varying(50),
    detail text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.visitor_logs OWNER TO xlip;

--
-- Name: visitor_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: xlip
--

CREATE SEQUENCE public.visitor_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.visitor_logs_id_seq OWNER TO xlip;

--
-- Name: visitor_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xlip
--

ALTER SEQUENCE public.visitor_logs_id_seq OWNED BY public.visitor_logs.id;


--
-- Name: analytics id; Type: DEFAULT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.analytics ALTER COLUMN id SET DEFAULT nextval('public.analytics_id_seq'::regclass);


--
-- Name: bio_links id; Type: DEFAULT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.bio_links ALTER COLUMN id SET DEFAULT nextval('public.bio_links_id_seq'::regclass);


--
-- Name: bio_profiles id; Type: DEFAULT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.bio_profiles ALTER COLUMN id SET DEFAULT nextval('public.bio_profiles_id_seq'::regclass);


--
-- Name: links id; Type: DEFAULT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.links ALTER COLUMN id SET DEFAULT nextval('public.links_id_seq'::regclass);


--
-- Name: subdomains id; Type: DEFAULT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.subdomains ALTER COLUMN id SET DEFAULT nextval('public.subdomains_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: visitor_logs id; Type: DEFAULT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.visitor_logs ALTER COLUMN id SET DEFAULT nextval('public.visitor_logs_id_seq'::regclass);


--
-- Name: analytics analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.analytics
    ADD CONSTRAINT analytics_pkey PRIMARY KEY (id);


--
-- Name: bio_links bio_links_pkey; Type: CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.bio_links
    ADD CONSTRAINT bio_links_pkey PRIMARY KEY (id);


--
-- Name: bio_profiles bio_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.bio_profiles
    ADD CONSTRAINT bio_profiles_pkey PRIMARY KEY (id);


--
-- Name: bio_profiles bio_profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.bio_profiles
    ADD CONSTRAINT bio_profiles_username_key UNIQUE (username);


--
-- Name: links links_custom_alias_key; Type: CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_custom_alias_key UNIQUE (custom_alias);


--
-- Name: links links_pkey; Type: CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_pkey PRIMARY KEY (id);


--
-- Name: links links_short_code_key; Type: CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_short_code_key UNIQUE (short_code);


--
-- Name: subdomains subdomains_pkey; Type: CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.subdomains
    ADD CONSTRAINT subdomains_pkey PRIMARY KEY (id);


--
-- Name: subdomains subdomains_subdomain_key; Type: CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.subdomains
    ADD CONSTRAINT subdomains_subdomain_key UNIQUE (subdomain);


--
-- Name: users users_api_key_key; Type: CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_api_key_key UNIQUE (api_key);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visitor_logs visitor_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.visitor_logs
    ADD CONSTRAINT visitor_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_bio_links_profile_id; Type: INDEX; Schema: public; Owner: xlip
--

CREATE INDEX idx_bio_links_profile_id ON public.bio_links USING btree (profile_id);


--
-- Name: idx_bio_profiles_username; Type: INDEX; Schema: public; Owner: xlip
--

CREATE INDEX idx_bio_profiles_username ON public.bio_profiles USING btree (username);


--
-- Name: idx_short_code; Type: INDEX; Schema: public; Owner: xlip_admin
--

CREATE INDEX idx_short_code ON public.links USING btree (short_code);


--
-- Name: idx_subdomains_subdomain; Type: INDEX; Schema: public; Owner: xlip
--

CREATE INDEX idx_subdomains_subdomain ON public.subdomains USING btree (subdomain);


--
-- Name: idx_subdomains_user_id; Type: INDEX; Schema: public; Owner: xlip
--

CREATE INDEX idx_subdomains_user_id ON public.subdomains USING btree (user_id);


--
-- Name: idx_visitor_logs_created; Type: INDEX; Schema: public; Owner: xlip
--

CREATE INDEX idx_visitor_logs_created ON public.visitor_logs USING btree (created_at);


--
-- Name: idx_visitor_logs_ip; Type: INDEX; Schema: public; Owner: xlip
--

CREATE INDEX idx_visitor_logs_ip ON public.visitor_logs USING btree (ip_address);


--
-- Name: analytics analytics_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.analytics
    ADD CONSTRAINT analytics_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.links(id) ON DELETE CASCADE;


--
-- Name: bio_links bio_links_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.bio_links
    ADD CONSTRAINT bio_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.bio_profiles(id) ON DELETE CASCADE;


--
-- Name: bio_profiles bio_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.bio_profiles
    ADD CONSTRAINT bio_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: links links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xlip_admin
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subdomains subdomains_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xlip
--

ALTER TABLE ONLY public.subdomains
    ADD CONSTRAINT subdomains_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: TABLE bio_links; Type: ACL; Schema: public; Owner: xlip
--

GRANT ALL ON TABLE public.bio_links TO xlip_admin;


--
-- Name: SEQUENCE bio_links_id_seq; Type: ACL; Schema: public; Owner: xlip
--

GRANT SELECT,USAGE ON SEQUENCE public.bio_links_id_seq TO xlip_admin;


--
-- Name: TABLE bio_profiles; Type: ACL; Schema: public; Owner: xlip
--

GRANT ALL ON TABLE public.bio_profiles TO xlip_admin;


--
-- Name: SEQUENCE bio_profiles_id_seq; Type: ACL; Schema: public; Owner: xlip
--

GRANT SELECT,USAGE ON SEQUENCE public.bio_profiles_id_seq TO xlip_admin;


--
-- Name: TABLE subdomains; Type: ACL; Schema: public; Owner: xlip
--

GRANT ALL ON TABLE public.subdomains TO xlip_admin;


--
-- Name: SEQUENCE subdomains_id_seq; Type: ACL; Schema: public; Owner: xlip
--

GRANT SELECT,USAGE ON SEQUENCE public.subdomains_id_seq TO xlip_admin;


--
-- Name: TABLE visitor_logs; Type: ACL; Schema: public; Owner: xlip
--

GRANT ALL ON TABLE public.visitor_logs TO xlip_admin;


--
-- Name: SEQUENCE visitor_logs_id_seq; Type: ACL; Schema: public; Owner: xlip
--

GRANT SELECT,USAGE ON SEQUENCE public.visitor_logs_id_seq TO xlip_admin;


--
-- PostgreSQL database dump complete
--

\unrestrict w43U64tiuqAqkNhjQmhXAo8aiVJsCMW0hIckHkcAqMMc58GdlOi3tP0zqTXtSRK

