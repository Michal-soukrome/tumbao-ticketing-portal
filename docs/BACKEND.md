# Supabase-only backend topology

Production uses one backend platform: Supabase.

```text
React browser
  -> Supabase Edge Functions (public/staff API and authorization boundary)
    -> Supabase-managed PostgreSQL (inventory and transactional state)
    -> Supabase Auth (staff identities)
    -> Supabase Realtime Broadcast (sanitized seat deltas)
```

No independently hosted PostgreSQL server, application server, or direct browser database connection is part of the deployment. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are the only Supabase browser settings. The service-role key exists only in the Edge Function environment.

The repository's `postgres` development package is a database test driver. It connects to the PostgreSQL instance inside `supabase start` so the test suite can create 20 genuinely concurrent transactions and verify row locking. It is not imported anywhere under `src/`, not included in the browser bundle, and does not represent another production service.

Test/demo mode is separate: it dynamically loads the local JSON-backed repository and does not initialize the Supabase client or make network requests.

Creating hosted staging and production projects requires organization access and cannot be encoded as a repository-side action. Once projects exist, link and deploy this repository with the Supabase CLI; do not provision a separate database.
