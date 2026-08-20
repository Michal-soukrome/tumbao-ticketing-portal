# Galavečer Tumbao 2027 — Production Ticketing Architecture

Single-event ticketing system for **Galavečer Tumbao 2027**, 29 May 2027, GoJa Music Hall, Prague.

This document is the implementation architecture. It keeps Supabase/PostgreSQL as the backend, makes seat ownership and payment finalization database-safe, and defines the frontend/UI stack to use for the first production version.

The application is intentionally for one event. Do not turn this into a generic ticketing platform unless requirements change later.

---

## 1. Architecture decisions

### Keep

- Supabase Postgres as the system of record.
- Supabase Auth for staff accounts only.
- Supabase Edge Functions for public/admin API boundaries and payment-provider integration.
- PostgreSQL transactions and row locks for inventory correctness.
- Supabase Realtime for visual freshness, not correctness.
- Resend for transactional email.
- Hosted payment pages from GoPay or Comgate.

### Change from the first draft

1. **Static seats no longer store mutable reservation ownership.** Current ownership lives in `seat_allocations`, where `seat_id` is the primary key. One seat therefore cannot have two current allocations at the database level.
2. **Orders and payments are separate state machines.** An order may have multiple payment attempts.
3. **Payment finalization is one locked Postgres transaction.** A webhook can only convert seats to SOLD if the paid order still owns those exact allocations.
4. **Late payment is an explicit failure mode.** If payment succeeds after an allocation expired and a seat has been reallocated, the system never steals the seat back. The payment enters reconciliation/refund handling.
5. **Email uses a transactional outbox.** Ticket creation and the durable instruction to send the confirmation email commit together.
6. **Public users do not query private order/ticket/allocation tables directly.** Public endpoints return deliberately sanitized DTOs.
7. **Scanner users do not receive order/customer access through broad RLS policies.** Admin capabilities are enforced by purpose-specific Edge Functions.
8. **Money is stored in integer minor units.** For CZK, `75000` means 750.00 CZK only if the provider uses two minor digits; the provider adapter owns conversion rules so gateway payloads are never built from browser values.
9. **The frontend remains React/Vite.** The improvement is the UI architecture and libraries, not a framework rewrite.

---

## 2. High-level system architecture

```text
┌──────────────────────────────────────────────┐
│ React + TypeScript + Vite                    │
│ tickets.tumbao.cz                            │
│                                              │
│ Public                                       │
│ - event + SVG seat map                       │
│ - selection / checkout                       │
│ - payment return / ticket view               │
│                                              │
│ Staff                                        │
│ - /admin                                     │
│ - /admin/scan                                │
└──────────────────────┬───────────────────────┘
                       │ HTTPS
                       │ anon key for Supabase client plumbing only
                       │ staff JWT for authenticated staff calls
                       ▼
┌──────────────────────────────────────────────┐
│ Supabase                                     │
│                                              │
│ Postgres: source of truth                    │
│ Auth: admin/scanner users                    │
│ Realtime Broadcast: public seat deltas       │
│ Edge Functions: API/security boundary        │
│ pg_cron: expiry/outbox maintenance           │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Transactional Postgres functions             │
│                                              │
│ reserve_seats()                              │
│ finalize_payment()                           │
│ expire_stale_orders()                        │
│ checkin_ticket()                             │
│ finalize_refund()                            │
└───────────────┬──────────────────┬───────────┘
                │                  │
                ▼                  ▼
      ┌──────────────────┐  ┌──────────────────┐
      │ GoPay / Comgate  │  │ Resend           │
      │ hosted payments  │  │ transactional    │
      └──────────────────┘  │ email            │
                            └──────────────────┘
```

### Trust boundaries

The browser is never authoritative for:

- whether a seat is available;
- whether a hold is valid;
- ticket price or charge amount;
- whether a payment succeeded;
- whether a ticket is valid or already checked in;
- whether a staff user has permission to refund or inspect customer data.

Every state-changing action is verified server-side and committed in Postgres.

The frontend countdown and Realtime messages are UX hints. The database clock and transactional state are authoritative.

---

## 3. Frontend and UI architecture

### Chosen stack

Use:

- React + TypeScript + Vite
- Tailwind CSS 4
- TanStack Router
- TanStack Query
- Supabase JS
- shadcn/ui using Base UI primitives for a new project
- React Hook Form + Zod
- TanStack Table for admin orders/tickets
- Lucide icons
- `@panzoom/panzoom` or an equivalently small SVG pan/zoom helper
- `@zxing/browser` for camera QR scanning
- Vitest + Testing Library
- Playwright for browser flows
- Sentry or an equivalent production error-monitoring service

Do **not** add Zustand/Redux initially. Local selection state is local UI state, remote seat/order state belongs to the query/realtime layer, and staff auth belongs to Supabase Auth. Add a global store only if a concrete cross-route problem appears.

### Why keep React + Vite

This application is mostly client interaction: seat selection, checkout, payment-return status and QR scanning. It does not need a second server framework merely to render those flows. Keeping the privileged application layer in Supabase avoids splitting business logic between Supabase and another backend runtime.

If the product later becomes a multi-event public content site where SSR/SEO becomes important, reassess the frontend framework then. Do not optimize for that hypothetical now.

### Route structure

```text
/                         event + interactive seat map
/checkout/:orderId        customer details + payment initiation
/order/:orderId           post-payment status / ticket access
/admin/login
/admin                     stats + operational alerts
/admin/orders              orders search/list
/admin/orders/:orderId     order detail/refund actions
/admin/tickets/:ticketId   ticket detail
/admin/scan                mobile-first scanner
```

Public order routes require both the opaque order ID and a separate high-entropy access token. The database stores only the token hash.

### Customer UI principles

The seating map is the primary interface.

Desktop layout:

- stage/venue context at the top of the map;
- map consumes most horizontal space;
- sticky selection summary on the right;
- checkout CTA remains visible without obscuring seats.

Mobile layout:

- large pan/zoom SVG map;
- sticky bottom summary such as `3 seats · 2 250 Kč · Continue`;
- selected-seat details in a bottom sheet/dialog;
- large touch targets and generous spacing around seat clusters;
- preserve map position when opening/closing the summary.

Avoid ornamental dashboards, gradients everywhere, 3D seat effects, motion-heavy transitions, and interactions that hide ticket price until late in checkout.

### Seat map implementation

Use a custom SVG with a stable `viewBox`.

Each seat is data-driven and includes:

- seat ID;
- section;
- row label;
- seat number;
- price category;
- x/y coordinates;
- optional rotation/shape metadata only if the real venue layout needs it.

Seat appearance has four public states:

- AVAILABLE
- HELD
- SOLD
- SELECTED (client-local overlay on an AVAILABLE seat)

Do not rely on color alone. Selected/disabled states also differ by outline, iconography or pattern, and expose an accessible name such as:

`Row D, seat 14, Standard, 750 Kč, available.`

For very dense layouts, rendering and hit targets can be separated: keep the visible seat small while providing a larger transparent pointer target.

### Data/query behavior

Initial seat-map load comes from a sanitized public API response. Realtime only applies small seat-state deltas afterward.

On:

- WebSocket reconnect,
- browser tab returning from long suspension,
- hold expiry,
- reservation failure,
- payment return,

re-fetch authoritative state instead of assuming the local cache is complete.

TanStack Query owns request lifecycle/retries/cache invalidation. Realtime callbacks update or invalidate query data but never make purchase decisions.

---

## 4. Realtime strategy

Prefer Supabase **Realtime Broadcast** for seat-state updates because it separates the public event stream from direct table exposure and scales better when many buyers watch the same inventory.

Broadcast payloads should contain only what the public UI needs, for example:

```json
{
  "seat_id": "uuid",
  "status": "HELD",
  "hold_expires_at": "2027-05-29T18:12:00Z"
}
```

Do not broadcast:

- order IDs;
- session IDs;
- customer data;
- payment references;
- staff IDs.

A database trigger or the transactional functions can emit a seat-state event after state changes. Losing or delaying a Realtime message must never affect correctness. Clients periodically/reconnectively re-fetch the canonical snapshot.

Postgres Changes is acceptable as an early-development simplification, but the frontend data layer should not depend on its payload shape so production can use Broadcast without a rewrite.

---

## 5. PostgreSQL model

The following is the target relational model. Migration files should implement this in dependency order and include comments, constraints and indexes.

### 5.1 Extensions and sequence

```sql
create extension if not exists pgcrypto;

create sequence if not exists public.order_seq;
```

### 5.2 Types

```sql
create type public.order_status as enum (
  'PENDING',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'RECONCILIATION_REQUIRED'
);

create type public.allocation_status as enum ('HELD', 'SOLD');

create type public.payment_status as enum (
  'CREATED',
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'RECONCILIATION_REQUIRED'
);

create type public.refund_status as enum (
  'REQUESTED',
  'PENDING',
  'SUCCEEDED',
  'FAILED'
);

create type public.ticket_status as enum (
  'VALID',
  'CHECKED_IN',
  'VOID'
);

create type public.admin_role as enum ('ADMIN', 'SCANNER');

create type public.outbox_status as enum ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
```

### 5.3 Events and pricing

```sql
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date timestamptz not null,
  venue text not null,
  timezone text not null default 'Europe/Prague',
  sales_open_at timestamptz,
  sales_close_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.price_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'CZK',
  sort_order integer not null default 0,
  unique (event_id, name)
);
```

**Implementation note:** verify the exact currency code and gateway minor-unit convention in the chosen payment-provider adapter before production. The browser never performs this conversion.

### 5.4 Static seats

```sql
create table public.seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  section text not null,
  row_label text not null,
  seat_number text not null,
  price_category_id uuid not null references public.price_categories(id),
  pos_x numeric not null,
  pos_y numeric not null,
  rotation numeric not null default 0,
  is_accessible boolean not null default false,
  is_active boolean not null default true,
  unique (event_id, section, row_label, seat_number)
);

create index idx_seats_event on public.seats(event_id);
create index idx_seats_price_category on public.seats(price_category_id);
```

`seats` describes physical inventory only. It does not contain `held_by_session`, mutable payment state, or customer information.

### 5.5 Staff users

Create this before `tickets`, because tickets reference staff users for check-in metadata.

```sql
create table public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.admin_role not null default 'ADMIN',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
```

### 5.6 Orders

```sql
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  order_number text not null unique,
  session_id_hash text not null,
  access_token_hash text not null,

  customer_name text,
  customer_email text,
  customer_phone text,

  billing_company text,
  billing_address jsonb,
  billing_tax_id text,

  total_minor bigint not null default 0 check (total_minor >= 0),
  currency char(3) not null,
  status public.order_status not null default 'PENDING',

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,

  check (expires_at > created_at)
);

create index idx_orders_status_expiry
  on public.orders(status, expires_at);

create index idx_orders_customer_email
  on public.orders(lower(customer_email));
```

Never store the raw public `access_token`; only store a one-way hash suitable for constant-time comparison in the server function/Edge Function.

### 5.7 Historical order lines

```sql
create table public.order_seats (
  order_id uuid not null references public.orders(id) on delete cascade,
  seat_id uuid not null references public.seats(id),
  price_category_name text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null,
  primary key (order_id, seat_id)
);

create index idx_order_seats_seat on public.order_seats(seat_id);
```

`order_seats` is a historical snapshot. It does **not** mean the order currently owns the seat.

### 5.8 Current seat allocations

```sql
create table public.seat_allocations (
  seat_id uuid primary key references public.seats(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.allocation_status not null,
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    (status = 'HELD' and hold_expires_at is not null)
    or
    (status = 'SOLD' and hold_expires_at is null)
  )
);

create index idx_allocations_order on public.seat_allocations(order_id);
create index idx_allocations_expiry
  on public.seat_allocations(hold_expires_at)
  where status = 'HELD';
```

This table is the hard inventory invariant:

> A seat can have zero or one current allocation because `seat_id` is the primary key.

Interpretation:

- no row = AVAILABLE;
- row with `HELD` = temporarily reserved;
- row with `SOLD` = sold.

### 5.9 Payment attempts

```sql
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('gopay', 'comgate')),
  status public.payment_status not null default 'CREATED',
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  idempotency_key uuid not null default gen_random_uuid() unique,
  provider_ref text,
  provider_status text,
  redirect_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  failure_code text,
  failure_message text
);

create unique index uq_payment_provider_ref
  on public.payment_attempts(provider, provider_ref)
  where provider_ref is not null;

create index idx_payment_attempts_order on public.payment_attempts(order_id);
```

Multiple attempts per order are allowed. The payment adapter is responsible for reusing the local idempotency key when the provider supports idempotent create-payment requests.

### 5.10 Provider webhook/event deduplication

```sql
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_event_id text not null,
  payment_attempt_id uuid references public.payment_attempts(id),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_hash text,
  unique (provider, provider_event_id)
);
```

Do not store unnecessary payment payload PII. Store only fields needed for audit/debugging and a payload hash where possible.

### 5.11 Tickets

```sql
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  seat_id uuid not null references public.seats(id),
  ticket_code text not null unique,
  qr_token text not null unique,
  status public.ticket_status not null default 'VALID',
  checked_in_at timestamptz,
  checked_in_by uuid references public.admin_users(id),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index uq_active_ticket_per_seat
  on public.tickets(seat_id)
  where status in ('VALID', 'CHECKED_IN');
```

`qr_token` is a high-entropy bearer secret, not a human-readable identifier. It is stored so confirmations can be resent and tickets can be rendered again. Protect it with RLS/server-only access, never include it in logs/analytics, and expose it only through an authorized order/ticket response. If stronger at-rest protection is later required, encrypt this column with an application-managed key without changing the public token format.

A VOID historical ticket can coexist with a newly issued ticket for the same seat after a valid refund/cancellation and resale.

### 5.12 Refunds

```sql
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_attempt_id uuid not null references public.payment_attempts(id),
  provider text not null,
  provider_ref text,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status public.refund_status not null default 'REQUESTED',
  reason text,
  requested_by uuid references public.admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_refunds_order on public.refunds(order_id);
```

### 5.13 Transactional email outbox

```sql
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedupe_key text not null unique,
  order_id uuid references public.orders(id),
  recipient text not null,
  payload jsonb not null,
  status public.outbox_status not null default 'PENDING',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index idx_email_outbox_pending
  on public.email_outbox(status, next_attempt_at)
  where status in ('PENDING', 'FAILED');
```

### 5.14 Admin audit log

```sql
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.admin_users(id),
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_admin_audit_created on public.admin_audit_log(created_at desc);
```

Refunds, manual cancellations, ticket voids, resend actions and privileged order access should produce audit records.

---

## 6. Reservation transaction

### Public API

`POST /functions/v1/reserve-seats`

Input:

```json
{
  "event_id": "uuid",
  "seat_ids": ["uuid", "uuid"]
}
```

The browser does **not** send:

- price;
- total;
- hold duration;
- seat status;
- order number.

The Edge Function creates/reads an anonymous browser session token, validates request shape, applies rate limits, and calls a non-public transactional RPC.

### Server validation

Before touching inventory:

- event exists and sales are open;
- 1 to configured maximum seats requested (for example 10);
- no duplicate seat IDs;
- every seat belongs to the event and is active;
- request/session/IP rate limits pass.

### Transaction algorithm

`reserve_seats()` performs this sequence in one transaction:

1. Lock the requested rows in `seats` with `SELECT ... FOR UPDATE ORDER BY id`.
2. Delete any expired `HELD` allocations for those seats.
3. Check whether any requested seat still has a row in `seat_allocations`.
4. If any allocation exists, reject the entire reservation with a structured `SEAT_UNAVAILABLE` error and the unavailable seat IDs.
5. Read authoritative current price categories from Postgres.
6. Create the PENDING order with a server-generated expiry and order number.
7. Insert immutable `order_seats` price snapshots.
8. Insert one `HELD` row in `seat_allocations` per selected seat.
9. Commit.
10. Return the order ID, raw one-time access token, server expiry and price summary.

`seat_allocations.seat_id` remains a unique database backstop even if application logic regresses.

### Why two customers cannot reserve the same seat

Both transactions must lock the same static `seats` row. One waits. When the waiting transaction resumes, it observes the allocation inserted by the winner and fails as a whole.

There is no client-side check-then-write race and no window where two allocations for one seat can exist.

### SECURITY DEFINER hardening

Every privileged RPC must:

- use `SECURITY DEFINER` only when required;
- set a fixed `search_path` such as `pg_catalog, public`;
- schema-qualify security-sensitive objects;
- revoke `EXECUTE` from `PUBLIC`, `anon` and `authenticated` unless explicitly needed;
- be invoked from a service-role Edge Function rather than exposed as an anonymous RPC;
- validate cardinality and input format internally, even if the Edge Function already validated them.

---

## 7. Hold expiry

Use both eager and scheduled expiry.

### Lazy/eager expiry

Reservation logic treats an expired HELD allocation as reclaimable after locking its seat row. This prevents cron cadence from blocking a new buyer.

### Scheduled expiry

A `pg_cron` job runs approximately every 30 seconds and calls `expire_stale_orders()`.

For orders where:

- `status = PENDING`; and
- `expires_at < now()`;

it:

1. locks the order;
2. sets it to `EXPIRED` if still PENDING;
3. deletes its `HELD` seat allocations;
4. emits/broadcasts the newly AVAILABLE seat states.

It never deletes `SOLD` allocations.

### Customer countdown

The browser derives the countdown from the server `expires_at` timestamp and its measured server/client clock offset. When the timer reaches zero, disable payment actions and re-fetch the order. Never locally convert seats back to AVAILABLE.

---

## 8. Payment creation

Payment creation is deliberately separate from payment finalization.

### `create-payment` Edge Function

1. Validate `order_id + access_token`.
2. Lock/read the order through a transactional helper.
3. Require `order.status = PENDING` and `expires_at > now()`.
4. Require every `order_seats` seat to still have a `HELD` allocation owned by this order.
5. Read `orders.total_minor` and `orders.currency`; never accept charge amount from the browser.
6. Reuse an existing usable payment attempt where possible, otherwise create a new `payment_attempts` row with a server-generated idempotency key.
7. Call the provider hosted-payment API.
8. Save the provider reference and redirect URL.
9. Return only the provider redirect URL and non-sensitive status.

If the provider call times out after the provider may have created a payment, retry/reconcile using the local idempotency key/provider lookup instead of blindly creating another charge.

---

## 9. Webhook verification and payment finalization

The browser payment return is never proof of payment.

### Edge Function verification

`payment-webhook`:

1. authenticates the callback according to the chosen provider's current production specification;
2. derives the provider transaction reference;
3. independently queries the provider status API where supported/required;
4. verifies paid amount and currency against the local payment attempt/order;
5. inserts/deduplicates `payment_events`;
6. calls `finalize_payment()` for a verified successful payment.

### `finalize_payment()` transaction

The database function:

1. locks the `payment_attempts` row;
2. locks the order row;
3. locks all relevant static seat rows in stable ID order;
4. re-reads current seat allocations;
5. handles one of the following outcomes.

#### A. Already finalized

If order is already `PAID`, return success idempotently. Do not create additional tickets or email jobs.

#### B. Valid on-time payment

If:

- order is still PENDING;
- verified amount/currency match;
- every ordered seat still has a HELD allocation owned by this order;

then atomically:

- set payment attempt `PAID`;
- set order `PAID` + `paid_at`;
- update those allocations `HELD -> SOLD` and clear hold expiry;
- create one ticket per seat with a fresh cryptographically random QR bearer token;
- insert exactly one confirmation-email job into `email_outbox` using a deterministic dedupe key;
- commit.

#### C. Late payment, seats still free

A webhook can arrive after the local hold expired even though the provider accepted payment. If the order no longer owns its HELD allocations but **every ordered seat is currently unallocated**, the transaction may atomically reacquire those exact seats directly as `SOLD` and finalize the order as PAID. This avoids refunding a valid customer when there is no inventory conflict.

This path must still verify amount/currency and lock all seat rows before deciding they are free.

#### D. Late/conflicting successful payment

If the provider says PAID and **any** ordered seat is currently allocated to another order, never overwrite the new owner's allocation.

Instead atomically:

- mark the payment attempt `RECONCILIATION_REQUIRED`;
- mark the order `RECONCILIATION_REQUIRED`;
- create an admin alert/audit record;
- enqueue a refund workflow where provider rules allow automatic refund;
- create no tickets;
- leave current seat allocations untouched.

This is the critical protection against the sequence:

1. order A expires;
2. its seat is released;
3. order B reserves/buys the seat;
4. a delayed successful payment for A arrives.

Order A must be refunded/reconciled. It must never take B's seat.

---

## 10. Refund/cancellation flow

Do not model refund as a single synchronous status flip.

### Admin request

`refund-order` requires ADMIN role and:

1. validates refund eligibility;
2. creates a `refunds` row with `REQUESTED/PENDING`;
3. calls the provider with a stable idempotency/reference strategy;
4. records provider outcome.

### Successful refund finalization

After provider-confirmed success, one DB transaction:

- locks order/payment/tickets/allocations;
- marks refund `SUCCEEDED`;
- marks order `CANCELLED` if fully refunded according to product policy;
- marks current tickets `VOID`;
- deletes the order's `SOLD` allocations if resale is allowed and the event has not passed;
- emits AVAILABLE seat updates;
- writes an audit-log row;
- optionally enqueues a refund-confirmation email.

Do not release a sold seat merely because a refund API request was sent. Release it only after the refund outcome is authoritative.

---

## 11. Ticket and QR design

Generate separate values:

- `ticket_code`: short human-friendly support code;
- QR bearer token: at least 128 bits of CSPRNG entropy, preferably more;
- database stores `qr_token` as a protected bearer secret so tickets can be re-rendered or resent without regenerating identity.

The QR contains a compact HTTPS ticket-check URL or opaque bearer token, not customer PII.

Recommended customer delivery for v1:

- confirmation email containing event/order details and QR code(s);
- secure customer order/ticket web page accessible with order access token;
- print stylesheet for paper tickets.

PDF attachment is optional, not required for launch.

---

## 12. Check-in transaction

`checkin-ticket` is staff-authenticated and server-side.

Input is the scanned QR bearer token. The server performs an exact lookup on the protected token value; the token must never be logged.

Transaction:

1. verify Supabase staff JWT;
2. require active `ADMIN` or `SCANNER` role;
3. find and lock the ticket row;
4. verify it belongs to the expected event;
5. if `VALID`, set `CHECKED_IN`, timestamp and staff ID;
6. if `CHECKED_IN`, return `ALREADY_USED` with first check-in time;
7. if `VOID`, return `VOID`;
8. commit and audit the action.

The second simultaneous scan cannot also succeed because both attempts lock the same ticket row.

### Connectivity policy

Launch v1 as **online-authoritative scanning**. Offline scanning cannot strictly preserve the “only one successful check-in” invariant across multiple devices without reconciliation trade-offs.

Operationally provide:

- dedicated venue Wi-Fi where possible;
- at least one mobile hotspot backup;
- a tested fallback staff device;
- a manual support lookup by ticket/order code.

If offline mode becomes a hard requirement, design it explicitly as a separate feature with bounded device leases and reconciliation rules rather than silently caching check-ins in the browser.

---

## 13. Email delivery

Email is driven by `email_outbox`, not directly by the payment transaction after commit.

Worker/Edge job:

1. atomically claims pending jobs;
2. sends through Resend;
3. marks SENT on success;
4. records failure and exponential retry schedule on transient errors;
5. stops automatic retries after a configured threshold and surfaces the job in admin operations.

The payment transaction remains successful even if Resend is temporarily unavailable, while the email instruction cannot be lost between DB commit and process crash.

Admin `resend-confirmation` creates another explicitly deduplicated outbox job using existing tickets. It never regenerates QR tokens.

---

## 14. Public order access

Do not expose an RLS policy that lets anonymous clients query `orders` by guessed IDs.

Reservation returns:

- `order_id`;
- raw high-entropy `access_token`;
- expiry;
- sanitized order summary.

Database stores only `access_token_hash`.

Public status endpoints require both values and return only the data needed for that order:

- order state;
- payment state suitable for UI;
- expiry;
- selected seats;
- total;
- tickets only after confirmed payment.

Apply rate limits to failed token lookups.

For browser navigation, do not leave the raw access token in a normal query string. Prefer keeping it in `sessionStorage` during the payment redirect. For emailed ticket links, a URL fragment can carry the token to the SPA without sending it in the HTTP request/referrer; the app should immediately move it into session state and remove it from the visible URL.

---

## 15. RLS and database exposure

RLS is defense in depth. Service-role Edge Functions bypass it, so Edge Function authorization and transactional functions remain primary application controls.

### Core tables

Enable RLS on all application tables.

For `anon`:

- no INSERT/UPDATE/DELETE on application tables;
- no SELECT on orders, order seats, allocations, payment attempts/events, tickets, refunds, outbox, admin users or audit logs.

For `authenticated` staff:

- avoid broad direct-table reads of private operational tables;
- staff UI calls role-specific Edge Functions instead;
- no direct writes to payment, inventory or ticket state.

Public seat-map/event data should be served through a sanitized Edge Function response (and Realtime Broadcast deltas), keeping private schema columns out of the browser by construction.

### Staff roles

`SCANNER` may call only scanner-safe functions such as:

- check in ticket;
- minimal ticket lookup required to resolve a scan.

It must not receive customer email/phone, order lists, refund functions or finance statistics.

`ADMIN` may access operational endpoints according to the admin UI requirements.

---

## 16. Edge Function inventory

Public:

- `get-event`
- `get-seat-map`
- `reserve-seats`
- `update-order-customer`
- `create-payment`
- `get-order-status`
- `payment-webhook`

Staff:

- `get-admin-stats`
- `list-orders`
- `get-order-admin`
- `refund-order`
- `resend-confirmation`
- `checkin-ticket`

Jobs/internal:

- `process-email-outbox`
- optional `reconcile-payment`
- optional `reconcile-refund`

`expire_stale_orders()` should normally be invoked directly from scheduled Postgres work rather than a public HTTP endpoint.

---

## 17. Input validation and API contracts

Use Zod schemas in Edge Functions for HTTP payload validation and mirror critical invariants in Postgres constraints/functions.

Return stable machine-readable errors, for example:

```json
{
  "code": "SEAT_UNAVAILABLE",
  "message": "One or more seats are no longer available.",
  "seat_ids": ["..."]
}
```

Useful error codes include:

- `VALIDATION_ERROR`
- `RATE_LIMITED`
- `EVENT_NOT_ON_SALE`
- `SEAT_UNAVAILABLE`
- `ORDER_NOT_FOUND`
- `ORDER_EXPIRED`
- `ORDER_NOT_PAYABLE`
- `PAYMENT_PENDING`
- `PAYMENT_RECONCILIATION_REQUIRED`
- `TICKET_INVALID`
- `TICKET_VOID`
- `TICKET_ALREADY_USED`
- `FORBIDDEN`

Do not expose raw SQL errors or provider payloads to the browser.

---

## 18. Security controls

### Keys and secrets

- Supabase service-role key only in server runtime secrets.
- Payment credentials only in server runtime secrets.
- Resend API key only server-side.
- Frontend receives only publishable/anon configuration intended for browsers.
- Separate credentials and Supabase projects for staging and production.

### Rate limiting

Apply rate limits to:

- reservations;
- public order-token lookup failures;
- create-payment;
- admin login/auth abuse where platform controls are insufficient;
- ticket scanning;
- refund/resend actions.

Use user/session/IP signals appropriately. Do not make IP the only identity for legitimate shared networks.

### HTTP/browser hardening

Configure:

- strict HTTPS;
- Content Security Policy compatible with the selected payment provider;
- `frame-ancestors`/clickjacking protection where appropriate;
- secure referrer policy;
- no sensitive tokens in analytics URLs/logs;
- access tokens in fragment/session storage or another deliberate mechanism that avoids leaking through referrers; do not put long-lived bearer secrets in public analytics events.

### PII

Collect only the customer/billing data actually needed. Define retention/deletion policy before launch and keep payment-card data entirely on the hosted provider page.

---

## 19. Observability and operations

Before production, have:

- structured logs with request/correlation IDs;
- payment attempt/provider reference searchable in logs without exposing secrets;
- error monitoring for frontend and Edge Functions;
- alerts for webhook failures/reconciliation-required payments;
- alerts for stuck email outbox jobs;
- admin audit log;
- Supabase database backups/PITR configured and recovery procedure tested as appropriate for the chosen plan;
- staging environment using payment-provider sandbox;
- documented production-secret rotation procedure.

Do not use application logs as the only audit trail for refunds/check-ins.

---

## 20. Testing strategy

### Database correctness tests

Automate tests for:

- two concurrent requests for the same seat: exactly one succeeds;
- overlapping multi-seat requests: no partial allocation;
- expired hold reclaimed correctly;
- duplicate seat IDs rejected;
- ticket check-in race: exactly one VALID -> CHECKED_IN transition;
- duplicate webhook delivery: one finalization/email job;
- late paid webhook after seat has been reallocated: no seat theft, reconciliation path used;
- refund retry: no duplicate refund/release;
- void ticket followed by valid resale: only the new active ticket is valid.

### Integration tests

Use provider sandbox/mocks for:

- payment success;
- payment fail;
- user abandons payment;
- webhook before browser return;
- browser return before webhook;
- delayed webhook;
- duplicate webhook;
- provider API timeout;
- refund success/failure/retry.

### Browser tests

Playwright should cover:

- seat selection desktop/mobile;
- seat lost to another buyer between selection and reservation;
- checkout validation;
- expired hold UX;
- payment-return processing state;
- confirmation ticket rendering;
- admin permissions;
- QR camera/manual-entry scanner flows.

### Load tests

Before launch, simulate the expected on-sale burst plus a safety margin:

- many users loading the same map;
- many users receiving seat updates;
- simultaneous reservation attempts concentrated on popular rows;
- checkout/payment creation spikes.

Measure database lock wait, Edge Function latency, Realtime delivery lag and error rates.

---

## 21. Failure scenarios and required behavior

| Scenario | Required behavior |
|---|---|
| Two buyers reserve same seat | Exactly one reservation commits; other receives `SEAT_UNAVAILABLE`. |
| Buyer changes browser price | Ignored; server computes order total. |
| Fake payment-return URL | Shows only server-known order status; cannot mark paid. |
| Duplicate webhook | Idempotent DB finalization; no duplicate tickets/email. |
| Payment succeeds after hold was reallocated | Do not touch new allocation; mark reconciliation/refund required. |
| Edge Function crashes after payment DB commit | Outbox row remains and email worker retries. |
| Resend unavailable | Sale stays PAID; email retries and admin can resend. |
| Payment create request times out | Reconcile/reuse idempotency key, do not blindly create another payment. |
| Same QR scanned simultaneously | Row lock allows one check-in; other returns already used. |
| Scanner account tries admin endpoint | Server returns forbidden; no customer/finance data exposed. |
| Refund API call fails | Keep ticket/allocation unchanged until authoritative refund success. |
| Realtime disconnects | UI re-fetches canonical snapshot; purchasing correctness unaffected. |
| Cron delayed | Reservation path can reclaim expired HELD allocations after locking. |
| Database/service-role secret leaked | Rotate immediately; RLS alone is not assumed to contain service-role compromise. |

---

## 22. Phased implementation plan

### Phase 0 — Repository and environments

- Create production/staging Supabase projects.
- Vite + React + TS + Tailwind scaffold.
- Add TanStack Router/Query, shadcn/ui Base UI, Zod/RHF, test tooling.
- Configure lint/typecheck/test CI.
- Establish migrations and seed workflow.
- Configure secrets separately for local/staging/production.

### Phase 1 — Database invariants first

- Implement schema and enums.
- Implement `reserve_seats()` with concurrency tests.
- Implement expiry job.
- Implement sanitized seat-map query/API.
- Seed real or placeholder venue map.

Do not build payment UI until concurrent allocation tests are green.

### Phase 2 — Customer seat-map UX

- SVG venue/seat map.
- pan/zoom and mobile touch behavior.
- selection summary + price calculation for display only.
- reservation API integration.
- hold countdown.
- Realtime Broadcast + re-fetch recovery behavior.
- accessibility pass.

### Phase 3 — Checkout and payments

- customer/billing form;
- `payment_attempts`;
- provider adapter interface;
- integrate one provider sandbox first;
- `create-payment` idempotency/recovery;
- verified webhook;
- `finalize_payment()` including late-payment conflict tests.

### Phase 4 — Tickets and email

- ticket/QR generation;
- token hashing;
- transactional email outbox;
- Resend worker;
- secure order/ticket page;
- print styles;
- resend action.

### Phase 5 — Admin

- Supabase Auth staff provisioning;
- ADMIN/SCANNER authorization helpers;
- stats/orders/ticket search;
- audit log;
- refund state machine;
- reconciliation-required queue.

### Phase 6 — Venue scanning

- mobile scan UI with `@zxing/browser`;
- atomic check-in RPC;
- clear VALID / ALREADY USED / VOID / INVALID states;
- manual code fallback;
- real-device testing on venue-like network conditions.

### Phase 7 — Launch hardening

- concurrency/load tests;
- provider webhook retry/failure tests;
- RLS/endpoint permission review;
- CSP/security headers;
- monitoring/alerts;
- backup/recovery check;
- email deliverability checks;
- venue connectivity backup;
- production payment credentials;
- DNS/subdomain cutover.

---

## 23. UI component inventory

Customer:

- EventHeader
- SeatMap
- SeatMapToolbar
- SeatLegend
- SeatSelectionSummary
- HoldCountdown
- CheckoutForm
- PriceSummary
- PaymentStatus
- TicketCard
- PrintableTicketView

Admin:

- AdminShell
- StatsSummary
- OrdersTable
- OrderFilters
- OrderDetail
- PaymentTimeline
- RefundDialog
- ReconciliationAlert
- TicketDetail
- ScannerView
- ScanResult

Shared shadcn/base components:

- Button
- Input
- Field/Form controls
- Dialog
- Sheet/Drawer
- Tooltip
- Popover
- Select
- Table primitives
- Badge
- Alert
- Toast
- Skeleton

Keep customer-facing components visually calmer than the admin interface.

---

## 24. Decisions still requiring project input

These do not block Phase 0/1 database work but must be resolved before corresponding integration work:

1. **Payment provider:** implement GoPay or Comgate first, not both simultaneously.
2. **Venue layout:** obtain the real GoJa Music Hall seat/section plan and pricing categories; use a generated placeholder only until then.
3. **Maximum tickets per order:** choose a business limit; default engineering assumption can be 10 until confirmed.
4. **Refund/resale policy:** confirm whether refunded seats may always return to sale before the event or whether some cases require manual review.
5. **Billing/invoice requirements:** confirm exactly which fields are necessary rather than collecting broad billing data by default.
6. **Brand assets:** logo, typography, event artwork and approved palette for the final customer UI.

Default ticket delivery for implementation: email QR + secure printable web ticket. PDF can be added later if required.

---

## 25. Current implementation references

These choices were checked against current project documentation in August 2026:

- Supabase Realtime database changes: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Postgres Changes scaling notes: https://supabase.com/docs/guides/realtime/postgres-changes
- shadcn/ui Base UI default: https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default
- TanStack Router type safety/search params: https://tanstack.com/router/latest/docs/guide/type-safety
- TanStack Router search params: https://tanstack.com/router/latest/docs/guide/search-params
- ZXing browser package: https://github.com/zxing-js/browser
