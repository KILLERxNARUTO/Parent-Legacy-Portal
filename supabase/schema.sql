-- ====================================================================
-- Edutainal Maverick World - Supabase PostgreSQL Schema
-- High-Performance Dual-Portal Learning Evidence & Evaluation System
-- Fully Configured with Realtime Triggers & CDC Replication
-- ====================================================================

-- 1. Enable standard cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Drop existing tables if recreating
DROP TABLE IF EXISTS login_attempts CASCADE;
DROP TABLE IF EXISTS auth_sessions CASCADE;
DROP TABLE IF EXISTS parent_children CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS observations CASCADE;
DROP TABLE IF EXISTS students CASCADE;

-- 3. Students Table
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Observations & Assessments Table
CREATE TABLE observations (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    observed_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    data JSONB NOT NULL
);

-- 5. Users Table
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('parent', 'observer')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Parent-Child Relationship Mapping Table
CREATE TABLE parent_children (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (user_id, student_id)
);

-- 7. Server Sessions Table
CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Rate Limiting & Failed Login Auditing
CREATE TABLE login_attempts (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    address TEXT NOT NULL,
    attempted_at DOUBLE PRECISION NOT NULL
);

-- ====================================================================
-- High-Performance Indexes
-- ====================================================================
CREATE INDEX idx_observations_student_date ON observations(student_id, observed_on DESC);
CREATE INDEX idx_observations_data ON observations USING gin (data);
CREATE INDEX idx_students_data ON students USING gin (data);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_parent_children_student ON parent_children(student_id);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX idx_login_attempts_time ON login_attempts(attempted_at DESC);

-- ====================================================================
-- Realtime CDC Replication (Full Identity)
-- Required so Supabase Realtime emits full payloads on changes
-- ====================================================================
ALTER TABLE students REPLICA IDENTITY FULL;
ALTER TABLE observations REPLICA IDENTITY FULL;
ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE parent_children REPLICA IDENTITY FULL;

-- Add all core tables to the Supabase Realtime publication
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE observations;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE students;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE users;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE parent_children;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- ====================================================================
-- Database Triggers for Real-time Notification & Timestamps
-- ====================================================================

-- Trigger 1: Auto-update updated_at timestamp on student records
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_updated_at ON students;
CREATE TRIGGER trg_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger 2: Real-time Observation Notification (pg_notify)
CREATE OR REPLACE FUNCTION notify_observation_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    payload = json_build_object(
        'event', TG_OP,
        'table', TG_TABLE_NAME,
        'id', NEW.id,
        'student_id', NEW.student_id,
        'observed_on', NEW.observed_on,
        'created_at', NEW.created_at,
        'data', NEW.data
    );
    PERFORM pg_notify('realtime_observations', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_observation_change ON observations;
CREATE TRIGGER trg_observation_change
    AFTER INSERT OR UPDATE ON observations
    FOR EACH ROW
    EXECUTE FUNCTION notify_observation_change();

-- Trigger 3: Real-time Student Notification (pg_notify)
CREATE OR REPLACE FUNCTION notify_student_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    payload = json_build_object(
        'event', TG_OP,
        'table', TG_TABLE_NAME,
        'id', NEW.id,
        'data', NEW.data
    );
    PERFORM pg_notify('realtime_students', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_student_change
    AFTER INSERT OR UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION notify_student_change();

-- Trigger 4: Realtime Broadcast Changes (Official realtime.broadcast_changes)
CREATE OR REPLACE FUNCTION public.broadcast_observation_changes()
RETURNS trigger
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'topic:observations',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  PERFORM realtime.broadcast_changes(
    'topic:student:' || coalesce(NEW.student_id, OLD.student_id)::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_broadcast_observations
AFTER INSERT OR UPDATE OR DELETE
ON public.observations
FOR EACH ROW
EXECUTE FUNCTION broadcast_observation_changes();

-- Trigger 5: Realtime Student Broadcast Changes
CREATE OR REPLACE FUNCTION public.broadcast_student_changes()
RETURNS trigger
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'topic:students',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  PERFORM realtime.broadcast_changes(
    'topic:student:' || coalesce(NEW.id, OLD.id)::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_broadcast_students
AFTER INSERT OR UPDATE OR DELETE
ON public.students
FOR EACH ROW
EXECUTE FUNCTION broadcast_student_changes();


-- ====================================================================
-- Row Level Security (RLS) Policies
-- ====================================================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on students" ON students FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on observations" ON observations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on parent_children" ON parent_children FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on auth_sessions" ON auth_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on login_attempts" ON login_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated and Anon Public Access policies for REST & Realtime
CREATE POLICY "Allow read on students" ON students FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow anon insert on students" ON students FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Allow anon update on students" ON students FOR UPDATE TO authenticated, anon USING (true);

CREATE POLICY "Allow read on observations" ON observations FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow anon insert on observations" ON observations FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Allow anon update on observations" ON observations FOR UPDATE TO authenticated, anon USING (true);

CREATE POLICY "Allow anon select on users" ON users FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow anon insert on users" ON users FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Allow anon update on users" ON users FOR UPDATE TO authenticated, anon USING (true);

CREATE POLICY "Allow anon select on parent_children" ON parent_children FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow anon insert on parent_children" ON parent_children FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Allow anon update on parent_children" ON parent_children FOR UPDATE TO authenticated, anon USING (true);
CREATE POLICY "Allow anon delete on parent_children" ON parent_children FOR DELETE TO authenticated, anon USING (true);
