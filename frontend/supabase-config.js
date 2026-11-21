/**
 * Optional Frontend Supabase Client Configuration
 * If SUPABASE_URL and SUPABASE_ANON_KEY are provided,
 * the portal can directly subscribe to real-time database changes.
 */
window.EDUTAINAL_SUPABASE_CONFIG = {
  url: '',        // e.g. 'https://your-project-id.supabase.co'
  anonKey: '',    // e.g. 'eyJhbGciOiJIUzI1NiIsIn...'
  realtimeEnabled: true
};
