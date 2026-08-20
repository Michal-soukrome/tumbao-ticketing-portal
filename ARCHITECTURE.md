# Galavečer Tumbao 2027 — Ticketing App Architecture

Single-event ticketing system. Event: Galavečer tumbao 2027, 29 May 2027, GoJa Music Hall, Prague.

This document covers architecture, schema, reservation concurrency, payment/webhook flow, RLS, admin auth, risks, and a phased build plan. No implementation code yet — for review first.

---

## 1. System Architecture

```
┌─────────────────────────────┐
│  React + TS + Vite (SPA)    │
│  tickets.tumbao.cz          │
│  - Seating map (public)     │
│  - Checkout                 │
│  - /admin (protected)       │
└──────────────┬───────────────┘
               │ HTTPS (anon key, RLS-scoped)
               ▼
┌─────────────────────────────┐
│  Supabase                    │
│  - Postgres (source of truth)│
│  - Auth (admin users only)   │
│  - Realtime (seat status)    │
│  - Edge Functions (Deno)     │
│  - Storage (not required,    │
│    QR generated on the fly)  │
└──────────────┬───────────────┘
               │ service-role key (server-only)
               ▼
┌───────────────────────────────────────────┐
│  Edge Functions (all privileged logic)      │
│  - reserve-seats                            │
│  - create-payment          (calls GoPay/     │
│                              Comgate API)     │
│  - payment-webhook         (verifies sig)     │
│  - expire-holds            (cron, pg_cron)    │
│  - checkin-ticket          (admin, QR scan)   │
│  - resend-confirmation                        │
└──────────────┬───────────────┬───────────────┘
               │               │
               ▼               ▼
     ┌──────────────┐   ┌──────────────┐
     │ GoPay/Comgate │   │  Resend      │
     │ (payment)     │   │  (email)     │
     └──────────────┘   └──────────────┘
```

**Key architectural rule:** the browser never writes seat status, price, or payment status directly to Postgres. All state-changing operations go through Edge Functions using the service-role key, which enforce business rules inside a DB transaction. The browser only _reads_ via RLS-scoped anon-key queries and Realtime subscriptions, and _calls_ Edge Functions for anything that mutates data.

### Why Edge Functions instead of client + RLS-only writes

Row Level Security can restrict _who_ can write a row, but it cannot express "reserve these 4 seats atomically, or none," or "verify this HMAC signature from GoPay before marking paid." That's transactional/procedural logic, so it belongs server-side in Postgres functions invoked by Edge Functions, not in RLS policies alone. RLS remains the last line of defense so that even if an Edge Function had a bug, a browser client still cannot directly flip a seat to SOLD.

### Frontend structure

- `/` — landing/event info + seating map
- `/checkout` — seat review, customer details, payment redirect
- `/checkout/confirmation` — post-payment status (polls order status; never trusted as proof)
- `/admin/login`
- `/admin` — dashboard, orders, ticket search
- `/admin/scan` — QR check-in tool (mobile-friendly camera scanner)

### Realtime seat updates

Supabase Realtime subscribes to the `seats` table (or a lightweight `seat_status` view) so all connected clients see HELD/SOLD updates within ~1s without polling. The reservation Edge Function is still the sole writer; Realtime is read-only propagation.

---

## 2. PostgreSQL Schema

```sql
-- ========== EVENTS ==========
create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date timestamptz not null,
  venue text not null,
  created_at timestamptz not null default now()
);

-- ========== PRICE CATEGORIES ==========
create table price_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,          -- e.g. "VIP", "Standard", "Balcony"
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'CZK'
);

-- ========== SEATS ==========
create type seat_status as enum ('AVAILABLE', 'HELD', 'SOLD');

create table seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  section text not null,
  row_label text not null,
  seat_number text not null,
  price_category_id uuid not null references price_categories(id),
  pos_x numeric not null,      -- rendering coordinates (%, or px on a fixed viewbox)
  pos_y numeric not null,
  status seat_status not null default 'AVAILABLE',
  held_by_session text,        -- nullable; the session/order that currently holds it
  hold_expires_at timestamptz, -- nullable; enforced server-side
  version integer not null default 0,  -- optimistic-lock guard (belt & suspenders)
  unique (event_id, section, row_label, seat_number)
);

create index idx_seats_event_status on seats(event_id, status);
create index idx_seats_hold_expiry on seats(hold_expires_at) where status = 'HELD';

-- ========== ORDERS ==========
create type order_status as enum ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED');
create type payment_status as enum ('NONE', 'INITIATED', 'PAID', 'FAILED', 'REFUNDED');

create table orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  order_number text not null unique,     -- short human-readable code, e.g. TT-20270529-00042
  session_id text not null,              -- anonymous browser session that created the hold
  customer_name text,
  customer_email text,
  customer_phone text,
  total_price numeric(10,2) not null default 0,
  status order_status not null default 'PENDING',
  payment_status payment_status not null default 'NONE',
  payment_provider text,                 -- 'gopay' | 'comgate'
  payment_provider_ref text,             -- provider's transaction id
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);

create index idx_orders_email on orders(customer_email);
create index idx_orders_status on orders(status);
create index idx_orders_expiry on orders(expires_at) where status = 'PENDING';

-- ========== ORDER_SEATS ==========
create table order_seats (
  order_id uuid not null references orders(id) on delete cascade,
  seat_id uuid not null references seats(id),
  price numeric(10,2) not null,  -- price snapshot at time of reservation
  primary key (order_id, seat_id)
);

-- one seat can only ever belong to one *active* (PENDING/PAID) order at a time;
-- enforced procedurally in reserve_seats(), not by a DB constraint alone,
-- since CANCELLED/EXPIRED orders may retain historical rows.

-- ========== TICKETS ==========
create type ticket_status as enum ('VALID', 'CHECKED_IN', 'VOID');

create table tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  seat_id uuid not null references seats(id) unique,
  ticket_code text not null unique,       -- human-readable, e.g. TKT-9F3K2A
  qr_token text not null unique,          -- cryptographically random, opaque
  status ticket_status not null default 'VALID',
  checked_in_at timestamptz,
  checked_in_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);

create index idx_tickets_qr on tickets(qr_token);

-- ========== ADMIN USERS ==========
-- backed by Supabase Auth; this table stores role/metadata only
create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'admin',   -- 'admin' | 'scanner' (door staff, check-in only)
  created_at timestamptz not null default now()
);
```

**Notes on design choices**

- `seats.status` is the fast-path read for the UI; `hold_expires_at` is what the expiry job actually checks.
- `version` on `seats` is an extra optimistic-concurrency guard on top of row locking (belt-and-suspenders, detailed in §3).
- `order_seats.price` snapshots price at reservation time, so later price-category edits never retroactively change a customer's paid amount.
- `qr_token` is never derived from `ticket_code`, `order_id`, or anything guessable — see §7.

---

## 3. Seat Reservation: Atomic Transaction & Race-Condition Prevention

This is implemented as a single Postgres function (`SECURITY DEFINER`), called only from the `reserve-seats` Edge Function — never from the browser.

```sql
create or replace function reserve_seats(
  p_event_id uuid,
  p_seat_ids uuid[],
  p_session_id text,
  p_hold_minutes int default 10
) returns table(order_id uuid, expires_at timestamptz)
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_expires timestamptz := now() + make_interval(mins => p_hold_minutes);
  v_total numeric(10,2) := 0;
  v_locked_count int;
begin
  -- 1. Lock only the requested rows, in a stable order, to avoid deadlocks
  --    between two concurrent requests that overlap on some seats.
  perform 1
  from seats
  where id = any(p_seat_ids)
  order by id
  for update;  -- blocks until any other in-flight reservation on these rows finishes

  -- 2. Re-check availability AFTER acquiring the lock (not before).
  --    A seat is takeable if AVAILABLE, or HELD but expired.
  select count(*) into v_locked_count
  from seats
  where id = any(p_seat_ids)
    and event_id = p_event_id
    and (
      status = 'AVAILABLE'
      or (status = 'HELD' and hold_expires_at < now())
    );

  if v_locked_count <> array_length(p_seat_ids, 1) then
    raise exception 'SEAT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- 3. All requested seats are free -> flip them to HELD atomically.
  update seats
  set status = 'HELD',
      held_by_session = p_session_id,
      hold_expires_at = v_expires,
      version = version + 1
  where id = any(p_seat_ids);

  -- 4. Compute total from current price_categories.
  select coalesce(sum(pc.price), 0) into v_total
  from seats s join price_categories pc on pc.id = s.price_category_id
  where s.id = any(p_seat_ids);

  -- 5. Create the PENDING order + snapshot line items.
  v_order_number := 'TT-' || to_char(now(), 'YYYYMMDD') || '-' ||
                     lpad(nextval('order_seq')::text, 5, '0');

  insert into orders (event_id, order_number, session_id, total_price, status, expires_at)
  values (p_event_id, v_order_number, p_session_id, v_total, 'PENDING', v_expires)
  returning id into v_order_id;

  insert into order_seats (order_id, seat_id, price)
  select v_order_id, s.id, pc.price
  from seats s join price_categories pc on pc.id = s.price_category_id
  where s.id = any(p_seat_ids);

  return query select v_order_id, v_expires;
end;
$$;
```

**Why two concurrent requests for the same seat can never both succeed:**

1. `select ... for update` takes row-level exclusive locks on exactly the requested seat rows, ordered by `id` so that any two overlapping requests always attempt to acquire locks in the same global order — this prevents deadlocks (classic ordered-locking pattern).
2. The second request that wants an overlapping seat **blocks** on the `for update` until the first transaction commits or rolls back. It does not run its own availability check concurrently against stale data — Postgres serializes it.
3. Once unblocked, the second request re-reads seat status _after_ acquiring the lock. If the first transaction already flipped the seat to `HELD`/`SOLD`, the re-check fails and the whole function raises, rolling back the transaction — no partial holds.
4. The function is atomic: either all seats become `HELD` and the order + order_seats rows are created, or nothing changes (Postgres transaction guarantees).
5. This is a stronger guarantee than "check then write" from application code (which is inherently racy), and stronger than relying on a unique constraint retry loop, since it avoids failed writes and gives predictable "seat taken" responses immediately.

**Expiry (also must be server-side, not client-triggered):**
A `pg_cron` job runs every ~30–60 seconds and calls:

```sql
create or replace function expire_stale_holds() returns void
language sql as $$
  update seats
  set status = 'AVAILABLE', held_by_session = null, hold_expires_at = null
  where status = 'HELD' and hold_expires_at < now();

  update orders
  set status = 'EXPIRED'
  where status = 'PENDING' and expires_at < now();
$$;
```

This is the authoritative expiry mechanism — the frontend countdown is purely cosmetic (derived from `orders.expires_at`), and re-fetches the order on expiry to confirm server-side state before showing "select again."

Additionally, `reserve_seats` itself treats an expired `HELD` seat as available (step 2 above), so even if the cron job hasn't run yet, a new reservation attempt on an expired hold succeeds correctly — the cron job is an optimization for UI freshness, not the source of truth for correctness.

---

## 4. Payment & Webhook Flow

```
Browser                 Edge: create-payment          GoPay/Comgate         Edge: payment-webhook        DB
   │                            │                            │                       │                   │
   │ POST order_id              │                            │                       │                   │
   │───────────────────────────▶│                            │                       │                   │
   │                            │ verify order is PENDING     │                       │                   │
   │                            │ & not expired                │                      │                   │
   │                            │ create payment session ─────▶│                      │                   │
   │                            │ store payment_provider_ref   │                      │                   │
   │                            │◀──────── redirect URL ───────│                      │                   │
   │◀─── redirect URL ──────────│                            │                       │                   │
   │─── browser redirected to provider's hosted payment page ─▶│                      │                   │
   │                            │                            │  user pays            │                   │
   │                            │                            │───── webhook ─────────▶│                   │
   │                            │                            │  (signed payload)     │ verify signature  │
   │                            │                            │                       │ verify w/ provider│
   │                            │                            │                       │ API (server-to-   │
   │                            │                            │                       │ server confirm)   │
   │                            │                            │                       │──────────────────▶│
   │                            │                            │                       │ order=PAID         │
   │                            │                            │                       │ seats=SOLD         │
   │                            │                            │                       │ tickets created    │
   │                            │                            │                       │ email queued       │
   │◀── redirected to /checkout/confirmation (order_id) ─────────────────────────────────────────────────│
   │  polls GET /order-status?id=... until status=PAID (or shows "processing")        │                   │
```

**Critical rule: the frontend redirect is only a hint to poll, never a state transition.**

- Step "user is redirected back to the site" happens client-side and is _not trusted_. The confirmation page only displays "Payment confirmed" once it reads `orders.payment_status = 'PAID'` from the database (via a read-only, RLS-scoped query keyed by order id + a short-lived confirmation token, not by iterating order ids).
- Marking `PAID` happens exclusively inside `payment-webhook`, an Edge Function that:
  1. Verifies the request's authenticity per the provider's mechanism — GoPay: verify against GoPay's returned transaction state by calling their status API server-to-server (do not trust the webhook payload's fields alone); Comgate: verify the signature/hash per their webhook spec, and independently re-query Comgate's status endpoint for authoritative status before trusting it.
  2. Loads the order by `payment_provider_ref` and re-checks it is still `PENDING` (idempotency — see below).
  3. Runs a single DB transaction: `orders.status = 'PAID'`, `orders.payment_status = 'PAID'`, `seats.status = 'SOLD'` for all seats in `order_seats`, generates `tickets` rows with fresh `qr_token`s, and only after commit, enqueues the confirmation email via Resend.
  4. Returns 200 to the provider only after the DB transaction commits, so the provider's retry logic is the safety net if the function crashes mid-way.
- **Idempotency:** webhooks can be delivered more than once. The handler checks `orders.status` before applying changes; if already `PAID`, it returns 200 immediately without re-processing (no duplicate tickets, no duplicate emails). A unique constraint on `tickets.seat_id` also prevents accidental double ticket creation as a second safety net.
- **Failure / expiry path:** if the webhook reports failure, or the order's `expires_at` passes before any webhook arrives, `orders.status` becomes `FAILED`/`EXPIRED` and the existing `expire_stale_holds()` job releases the seats back to `AVAILABLE`. No manual intervention is required for the common case.
- **Refunds:** admin-triggered refund calls a `refund-order` Edge Function that calls the provider's refund API, then on confirmed success sets `orders.status = 'CANCELLED'`, `tickets.status = 'VOID'`, seats back to `AVAILABLE` (only if the event is still in the future).

---

## 5. Supabase Row Level Security (RLS)

RLS is a defense-in-depth layer; Edge Functions using the service-role key bypass RLS entirely for the writes described above. RLS mainly governs what the **anon** (public browser) key can directly read/do.

```sql
alter table events enable row level security;
alter table price_categories enable row level security;
alter table seats enable row level security;
alter table orders enable row level security;
alter table order_seats enable row level security;
alter table tickets enable row level security;
alter table admin_users enable row level security;

-- Public can read event + pricing info (needed to render the page)
create policy "public read events" on events
  for select using (true);

create policy "public read price categories" on price_categories
  for select using (true);

-- Public can read seat layout/status (needed for the seating map),
-- but never write directly.
create policy "public read seats" on seats
  for select using (true);
-- No insert/update/delete policy for anon => all writes rejected by default;
-- only service-role (which bypasses RLS) can write, i.e. only Edge Functions.

-- Orders: a browser session should NEVER be able to list all orders
-- (that would leak other customers' names/emails). Only allow a client
-- to read an order it just created, by matching a short-lived, unguessable
-- token (not the raw session_id, which could otherwise be replayed).
create policy "read own order via token" on orders
  for select using (
    id = current_setting('request.jwt.claims', true)::json->>'order_id'
    -- in practice: the confirmation page calls a dedicated Edge Function
    -- (get-order-status) rather than querying the table directly, which
    -- avoids exposing this policy's mechanics to the client at all.
  );
-- No public insert/update/delete on orders.

-- order_seats / tickets: no public select policy at all.
-- The client never needs to see other people's seat/ticket rows directly;
-- ticket details are delivered via the get-order-status Edge Function
-- (service-role, filtered to that one order) and via the email.

-- Admin tables: only authenticated admins.
create policy "admins read admin_users" on admin_users
  for select using (auth.uid() = id or exists (
    select 1 from admin_users a where a.id = auth.uid() and a.role = 'admin'
  ));

create policy "admins read all orders" on orders
  for select using (exists (
    select 1 from admin_users a where a.id = auth.uid()
  ));

create policy "admins read all tickets" on tickets
  for select using (exists (
    select 1 from admin_users a where a.id = auth.uid()
  ));
```

**Practical simplification actually used in the app:** rather than crafting a custom JWT claim for "read your own order," the recommended pattern is that the client _never_ queries `orders`/`tickets` directly with the anon key. Instead:

- `get-order-status(order_id, access_code)` — an Edge Function — returns sanitized status/seat/QR data only if `access_code` (a random token issued at reservation time, stored in the browser, not the DB primary key) matches. This avoids relying on RLS trickery for a case RLS isn't well-suited to, and keeps the "who can see this order" logic in one auditable place.
- Admin reads go through the admin dashboard, authenticated via Supabase Auth, and RLS policies above act as a second line of defense in case an Edge Function bug ever queries with a user's session instead of service-role.

---

## 6. Admin Authentication Model

- Admin accounts are Supabase Auth users (email + password, optionally with MFA enabled in Supabase Auth settings). No separate custom auth system.
- On signup/provisioning (done manually by the organizer, not self-serve signup), a corresponding row is created in `admin_users` with a `role`:
  - `admin` — full access: statistics, orders, refunds, ticket search.
  - `scanner` — check-in only, for door staff; restricted to the `checkin-ticket` Edge Function and a minimal scan UI, cannot view orders/customer data or issue refunds.
- The React app's `/admin/*` routes are gated by checking for a valid Supabase Auth session client-side (for UX/redirects only — this is not the security boundary).
- The actual security boundary is server-side: every admin Edge Function (`checkin-ticket`, `list-orders`, `refund-order`, `get-stats`) validates the caller's Supabase JWT, looks up `admin_users` by `auth.uid()`, and checks the required role before doing anything. RLS policies on `orders`/`tickets`/`admin_users` back this up for any direct table reads from the dashboard.
- Sessions use Supabase's standard JWT/refresh-token mechanism; no custom session handling needed.
- Rate-limiting on `/admin/login` (and on `checkin-ticket`, see §7) is enforced at the Edge Function / Supabase level to slow brute-force attempts.

---

## 7. Security Risks & Failure Scenarios

| Risk                                                                           | Mitigation                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two users buy the same seat                                                    | `for update` row locks + re-check-after-lock in `reserve_seats` (§3); unique `tickets.seat_id` as a final backstop.                                                                                                                                                                                          |
| Client tampers with price before checkout                                      | Price is never sent from client to server for the charge amount. `create-payment` reads `orders.total_price`, which was computed server-side from `price_categories` inside `reserve_seats`, and re-validates it hasn't been altered before creating the payment session.                                    |
| Client fakes a "payment successful" redirect                                   | Confirmation page only reflects DB state (`get-order-status`), never a query param from the redirect. Only `payment-webhook`, after verifying with the provider, flips `payment_status`.                                                                                                                     |
| Forged/replayed webhook                                                        | Verify provider signature/HMAC per §4; additionally re-query the provider's transaction-status API server-to-server before trusting any "paid" claim, since some Czech gateways' webhook payloads alone are not treated as sufficient proof.                                                                 |
| Duplicate webhook delivery causes duplicate tickets/emails                     | Idempotency check: skip processing if order already `PAID`; unique constraint on `tickets.seat_id`.                                                                                                                                                                                                          |
| QR token guessed or enumerated                                                 | `qr_token` generated with a CSPRNG (e.g. 128+ bits, `gen_random_bytes`/`crypto.randomUUID` is _not_ sufficient alone if used as ticket_code, so keep `ticket_code` human-friendly/short and `qr_token` long+random+unique, unrelated to any sequential ID), unique index, no pattern tied to order/seat IDs. |
| QR code reused / double check-in                                               | `checkin-ticket` runs inside a transaction: `select ... for update` on the ticket row, check `status = 'VALID'`, only then set `CHECKED_IN` + timestamp; if already `CHECKED_IN`, return an explicit "already used at HH:MM by X" response rather than silently succeeding.                                  |
| Seat held forever (abandoned checkout)                                         | Server-side `hold_expires_at` + `pg_cron` sweep (§3); also re-checked lazily inside `reserve_seats` so correctness never depends on the cron cadence.                                                                                                                                                        |
| Service-role key leaked to browser                                             | Service-role key only ever used inside Edge Functions (server-side Deno runtime env vars), never in any frontend bundle or `.env` exposed to Vite (`VITE_`-prefixed vars only carry the anon key).                                                                                                           |
| Admin endpoints hit by non-admins                                              | Every privileged Edge Function independently verifies `auth.uid()` against `admin_users` server-side; RLS as second layer.                                                                                                                                                                                   |
| Brute-force on admin login or ticket scan                                      | Rate limiting (Supabase Auth has built-in throttling; add explicit rate limits on `checkin-ticket` and `get-order-status` in the Edge Function, e.g. via a `rate_limits` table keyed by IP/session).                                                                                                         |
| Overselling due to inventory miscount (e.g. seats added after event goes live) | `seats` is the single source of truth for both map rendering and reservation; no cached/precomputed inventory count is treated as authoritative for the reservation decision.                                                                                                                                |
| Refund issued twice                                                            | `refund-order` checks `orders.status <> 'CANCELLED'` before calling the provider, inside a transaction.                                                                                                                                                                                                      |
| Customer never receives email (Resend failure)                                 | Log email send attempts; provide an admin "resend confirmation" action (`resend-confirmation` Edge Function) that re-sends using the already-generated ticket data (never regenerates QR tokens).                                                                                                            |
| Direct DB access via anon key bypassing intended flow                          | RLS denies all seat/order/ticket writes to anon role by default (§5); only reads needed for map rendering are exposed.                                                                                                                                                                                       |

---

## 8. Phased Implementation Plan

**Phase 0 — Foundations**

- Supabase project setup, apply schema (§2), enable RLS policies (§5).
- Seed one `events` row + `price_categories` + a generated seating chart of `seats` (script to import from a venue layout spec).
- Vite + React + TS + Tailwind scaffold, routing skeleton.

**Phase 1 — Seating map & seat state (read path)**

- Data-driven seating map component (SVG or absolutely-positioned divs from `pos_x`/`pos_y`).
- Legend + seat color states (AVAILABLE/HELD/SOLD/SELECTED).
- Realtime subscription to seat status changes.
- Mobile-responsive layout pass.

**Phase 2 — Reservation flow**

- `reserve_seats` Postgres function + `reserve-seats` Edge Function.
- Client seat selection → call reservation → receive order id + expiry.
- Countdown timer UI bound to `orders.expires_at`.
- `expire_stale_holds` cron job.

**Phase 3 — Checkout & payment**

- Customer details form + validation.
- `create-payment` Edge Function integrating GoPay or Comgate sandbox.
- `payment-webhook` Edge Function with signature verification + idempotent order/seat/ticket transition.
- `get-order-status` Edge Function + polling confirmation page.

**Phase 4 — Tickets & email**

- QR token generation, ticket rendering (downloadable/printable view).
- Resend integration + email template (event details, seats, QR, entry instructions).
- `resend-confirmation` admin action.

**Phase 5 — Admin dashboard**

- Supabase Auth admin login, `admin_users` roles.
- Stats view (available/held/sold counts), orders list + search.
- Manual cancel/refund flow calling provider refund API.

**Phase 6 — Check-in / scanning**

- `checkin-ticket` Edge Function (atomic VALID→CHECKED_IN transition).
- Mobile camera QR scanner UI for door staff (`scanner` role).
- Clear "already used" / "invalid" / "wrong event" states.

**Phase 7 — Hardening & launch prep**

- Rate limiting on sensitive endpoints, load-test the reservation function for concurrency correctness (simulate simultaneous seat grabs).
- Webhook failure/retry testing against provider sandbox.
- RLS policy review/pen-test pass, remove any debug bypasses.
- Real payment provider production credentials, DNS/subdomain cutover to `tickets.tumbao.cz`.

---

### Open questions before implementation begins

1. **Payment provider**: GoPay or Comgate for the actual integration (both are supportable; picking one first simplifies Phase 3)?
2. **Venue layout source**: do you have an actual seat map (CSV/spreadsheet of sections/rows/seats/coordinates) for GoJa Music Hall, or should I help design a placeholder layout to structure the data model against?
3. **Ticket delivery**: PDF attachment vs. inline QR image in the email vs. link to a "my ticket" page — any preference, or is inline QR + printable web view sufficient?
4. **Admin provisioning**: should the first admin account be created via a one-off seed script, or do you want a lightweight "invite admin" flow?

Once you confirm/adjust anything above, I'll move into Phase 0/1 implementation.
