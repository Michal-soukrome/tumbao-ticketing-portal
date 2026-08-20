# Galavečer Tumbao 2027 Ticketing

Implementation of the single-event ticketing system specified by [ARCHITECTURE.md](./ARCHITECTURE.md) and [TASK.md](./TASK.md). The production boundary remains Supabase Postgres, Auth, Realtime Broadcast, and Edge Functions. The local demo backend is deliberately separate and development-only.

## Run the complete local demo

Requires Node 20 or newer.

```bash
cp .env.example .env.local
# Set VITE_TEST_MODE=true in .env.local
npm install
npm run dev
```

Test mode makes no Supabase or external-service connection. It persists its JSON-seeded state in browser `localStorage`; use **Reset demo data** in the banner to restore seats, orders, tickets, and admin fixtures. The sample ticket `TUM-DEMO-001` can be validated in `/admin/scan` and demonstrates the already-used result on a second scan.

The implemented demo flow is:

`seat map → atomic local reservation → customer details → simulated Pay → tickets → admin orders → QR/manual check-in`

## Production setup

1. Create separate staging and production Supabase projects.
2. Link the intended project with the Supabase CLI and apply `supabase/migrations` plus the reviewed venue seed.
3. Configure only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend. Never expose the service-role key as a Vite variable.
4. Deploy Edge Functions with their server-side Supabase environment.
5. Keep `VITE_TEST_MODE=false` or unset. Production builds throw during startup if test mode is requested.

`map.jpg` is the supplied venue-layout reference. The current seed reproduces its central A–L blocks with a smaller representative row set; it remains placeholder inventory until the venue/organizer supplies and approves an authoritative seat list, pricing, and accessibility metadata.

## Verification

```bash
npm run check
npm run test:e2e
supabase start
supabase db reset
supabase test db
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
```

The last command exercises actual concurrent database sessions: 20 contenders for one seat must yield exactly one order, and overlapping multi-seat requests must never partially allocate.

## Current implementation boundary

Phase 0 and the core of Phase 1 are implemented: frontend/tooling/CI scaffold, schema, RLS-denied private tables, atomic reservation, expiry, sanitized seat-map API, and venue seed. The customer/admin/scanner vertical slice is complete in isolated test mode. The production payment provider, verified webhook finalization, email worker, staff endpoints/auth UI, refunds, and camera/device hardening remain later phases and are not represented as production-complete.
