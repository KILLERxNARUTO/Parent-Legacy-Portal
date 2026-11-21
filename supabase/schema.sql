-- ====================================================================
-- Edutainal Maverick World - Supabase PostgreSQL Schema
-- High-Performance Dual-Portal Learning Evidence & Evaluation System
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
-- Stores learner demographic profiles, world tier, milestone targets, and pathway enrollments
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Observations & Assessments Table
-- Stores multi-pillar STEAMRE rubrics, behavioral observations, SDG links, and studio zones
CREATE TABLE observations (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    observed_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    data JSONB NOT NULL
);

-- 5. Users Table
-- Supports secure multi-role access (observer = company mentors, parent = student families)
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

-- 7. Server Sessions Table (Rotating scrypt / sha256 session tokens)
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
-- Row Level Security (RLS) Policies
-- ====================================================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Service Role Policy (full backend access for FastAPI service key)
CREATE POLICY "Service role full access on students" ON students
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on observations" ON observations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on users" ON users
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on parent_children" ON parent_children
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on auth_sessions" ON auth_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on login_attempts" ON login_attempts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users & Anon Policies (Safe Read-Only for Public Demonstration)
CREATE POLICY "Allow authenticated read on students" ON students
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Allow authenticated read on observations" ON observations
    FOR SELECT TO authenticated, anon USING (true);

-- ====================================================================
-- Realtime Subscriptions
-- Enables Supabase Realtime WebSocket notifications on new observations
-- ====================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'observations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE observations;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'students'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE students;
    END IF;
END $$;

-- ====================================================================
-- Helpful Diagnostic View
-- ====================================================================
CREATE OR REPLACE VIEW student_activity_summary AS
SELECT 
    s.id AS student_id,
    s.data->>'name' AS student_name,
    s.data->>'world_tier' AS world_tier,
    COUNT(o.id) AS total_observations,
    MAX(o.observed_on) AS last_observed_on
FROM students s
LEFT JOIN observations o ON s.id = o.student_id
GROUP BY s.id, s.data->>'name', s.data->>'world_tier';
