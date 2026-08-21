# Galavečer Tumbao 2027 Ticketing

Implementation of the single-event ticketing system specified by [ARCHITECTURE.md](./ARCHITECTURE.md) and [TASK.md](./TASK.md). The production boundary remains Supabase Postgres, Auth, Realtime Broadcast, and Edge Functions. The local demo backend is deliberately separate and development-only.

There is no standalone PostgreSQL service to provision: PostgreSQL is the database engine included in Supabase. Browser production code calls Supabase Edge Functions only; Edge Functions perform privileged operations against the Supabase-managed database. The `postgres` npm development dependency is used solely to open concurrent connections to the local Supabase stack during allocation race tests and is never bundled into the application.

## Run the complete local demo

Requires Node 22 or newer.

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
5. Keep `VITE_TEST_MODE=false` or unset. Vite refuses to create a production build if test mode is requested.

The venue is rendered as a fully data-driven 900×400 SVG. Every visible seat block is its own accessible interactive element; there is no bitmap or separate transparent hit-target layer. Seat geometry is shared by test JSON and the Supabase seed. Inventory, pricing categories, and accessibility metadata remain provisional until the venue/organizer supplies and approves an authoritative seat list.

## Verification

Local database verification requires the Supabase CLI and a Docker-compatible container runtime. CI runs the same migration reset, pgTAP assertions, database lint, and concurrent-session tests on every push and pull request.

```bash
npm run check
npm run test:e2e
supabase start
supabase db reset
supabase test db
SUPABASE_LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
```

The last command exercises actual concurrent database sessions: 20 contenders for one seat must yield exactly one order, and overlapping multi-seat requests must never partially allocate.

## Current implementation boundary

Phase 0 and the core of Phase 1 are implemented: frontend/tooling/CI scaffold, schema, RLS-denied private tables, atomic reservation, expiry, sanitized seat-map API, and venue seed. The customer/admin/scanner vertical slice is complete in isolated test mode. The production payment provider, verified webhook finalization, email worker, staff endpoints/auth UI, refunds, and camera/device hardening remain later phases and are not represented as production-complete.
