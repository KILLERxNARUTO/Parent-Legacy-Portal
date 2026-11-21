# Supabase Setup Guide for Edutainal Maverick World

This directory provides the complete database schema, seed data, and synchronization tools to connect Edutainal to Supabase.

---

## Quick Setup (3 Steps)

### Step 1: Create your Supabase Project & Tables
1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and create a new project (e.g. `edutainal-portal`).
2. Go to the **SQL Editor** in the left sidebar.
3. Open [`schema.sql`](./schema.sql), copy its contents, paste them into the SQL Editor, and click **Run**.
   - This creates `students`, `observations`, `users`, `parent_children`, `auth_sessions`, `login_attempts`, indexes, and RLS policies.
4. *(Optional)* Open [`seed.sql`](./seed.sql), paste into SQL Editor, and click **Run** to load initial sample students, rubric observations, and demo accounts.

### Step 2: Configure Environment Variables
1. In your Supabase Dashboard, go to **Project Settings** → **API**.
2. Copy your **Project URL**, **anon public key**, and **service_role key**.
3. Open `.env` in the root of this project and fill in the values:
   ```env
   SUPABASE_URL=https://<your-project-ref>.supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```

### Step 3: Verify Connection & Sync Existing Data
Run the sync CLI tool from PowerShell/terminal:
```powershell
python -m backend.sync_supabase --test
```
To push all existing local SQLite records directly into your Supabase database:
```powershell
python -m backend.sync_supabase --push
```

---

## Schema Overview

| Table | Purpose | Realtime Enabled |
| :--- | :--- | :---: |
| `students` | Learner demographic profiles, world tier, milestone targets, and action pathway progress | Yes |
| `observations` | Multi-pillar STEAMRE rubrics, behavioral scores, SDG links, and studio zones | Yes |
| `users` | Secure multi-role user accounts (observers & parents) with scrypt hashes | No |
| `parent_children` | Mapping between parent accounts and assigned students | No |
| `auth_sessions` | Server-side expiring session tokens with CSRF hashes | No |
| `login_attempts` | Brute-force throttling audit log | No |
