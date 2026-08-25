# Production Build Brief — Galavečer Tumbao 2027 Ticketing

Build a production-ready ticketing web app for one event.

## PROJECT

Event: **Galavečer Tumbao 2027**  
Date: **29 May 2027**  
Venue: **GoJa Music Hall, Prague**  
Production host: **tickets.tumbao.cz** (or the final dedicated ticketing subdomain)

This application is for **ONE event only**. Do not build a generic multi-tenant ticketing platform, organizer marketplace or reusable event CMS unless requirements change later.

The database and payment code must be designed as real-money production infrastructure, not a demo.

---

## PRIMARY USER FLOW

A customer must be able to:

1. Open the event page and understand the event/date/venue/pricing.
2. Use an interactive venue seating map.
3. See each seat as available, held or sold.
4. Select one or more specific seats.
5. See selected seats and total price immediately.
6. Reserve the seats atomically for a limited time.
7. See a server-derived reservation countdown.
8. Enter required contact/billing information.
9. Pay on the selected payment provider's hosted checkout.
10. Return to the site and see processing/confirmed status based only on server-known state.
11. Receive confirmation email after verified payment.
12. Access one unique QR ticket per purchased seat.
13. Show the QR ticket on a phone or use a printable ticket view.

Staff must be able to:

1. Authenticate securely.
2. See event/order/ticket information allowed by their role.
3. Search orders and tickets.
4. Handle refunds/cancellations where allowed.
5. Scan and validate QR tickets at the venue.
6. Check a valid ticket in exactly once.
7. See a clear already-used/void/invalid result on subsequent scans.

### Non-negotiable inventory invariant

**Two customers must never own or purchase the same seat.**

Frontend state, Realtime messages, cron cadence and payment redirects must not be required for that guarantee. PostgreSQL transaction/constraint logic must enforce it.

---

## CHOSEN TECH STACK

### Frontend

Use:

- React
- TypeScript
- Vite
- Tailwind CSS 4
- TanStack Router
- TanStack Query
- shadcn/ui using Base UI primitives for a new project
- React Hook Form
- Zod
- TanStack Table for admin tables
- Lucide icons
- small SVG pan/zoom library such as `@panzoom/panzoom`
- `@zxing/browser` for QR camera scanning

Do not introduce Next.js or another server framework for v1. Supabase remains the application backend/security boundary.

Do not introduce Redux/Zustand by default. Add a global state library only if implementation exposes a real need that local state + route state + TanStack Query cannot handle cleanly.

### Backend

- Supabase
- PostgreSQL
- Supabase Auth for staff accounts
- Supabase Edge Functions for public/admin API boundaries and provider integrations
- Supabase Realtime Broadcast for seat-state deltas in production
- `pg_cron` for scheduled expiry/outbox work where appropriate

### Email

- Resend
- transactional outbox pattern; do not make successful ticket creation depend on an immediate Resend request succeeding

### Payments

- Design a provider adapter and implement **one** Czech provider first: GoPay or Comgate.
- Use the provider's hosted payment UI; card data must not touch this application.
- Do not treat a frontend success/return redirect as proof of payment.
- Verify payment server-side through the provider's current supported webhook/status mechanism.
- Payment finalization must be idempotent.
- Support multiple payment attempts for one order.

### Testing/operations

- Vitest + Testing Library
- Playwright
- automated database concurrency/integration tests
- load test reservation/realtime behavior before launch
- production error monitoring such as Sentry or equivalent

---

## FRONTEND / UI REQUIREMENTS

The design should be clean, modern, minimal and event-focused.

The seating map is the primary UI element. Do not bury it inside a dashboard shell.

### Desktop

- map takes most of the usable viewport;
- sticky selected-seat/price summary at the side;
- clear stage/venue orientation;
- checkout CTA visible once seats are selected.

### Mobile

- map remains large enough to pan/zoom comfortably;
- sticky bottom selection/price/continue bar;
- selected-seat details can expand in a bottom sheet/dialog;
- preserve map position while opening/closing UI;
- touch targets must be practical on a phone.

### Visual seat states

Distinguish:

- AVAILABLE
- HELD
- SOLD
- SELECTED

Do not rely only on color. Use outline/fill/pattern/icon changes plus accessible labels/focus states.

### Accessibility

Each interactive seat must expose meaningful information such as section, row, seat number, price and availability. Keyboard/focus behavior must be usable where practical. Forms require proper labels, errors and focus management.

### Avoid

- unnecessary 3D effects;
- motion-heavy transitions;
- ornamental analytics cards in the customer flow;
- excessive modals;
- hiding total price until the last step;
- custom UI primitives where the selected component library already provides accessible versions.

---

## SEATING MAP

The map must be **data-driven SVG**, not one hardcoded image and not hundreds of independently hardcoded DOM coordinates in JSX.

Every seat requires:

- unique ID;
- event ID;
- section;
- row label;
- seat number;
- price category;
- x/y rendering coordinates;
- optional rotation/layout metadata where the real map requires it.

Static seat geometry belongs in `seats`. Current reservation/sale ownership does not.

Use a stable SVG `viewBox` and a small pan/zoom implementation. The application must remain usable on desktop and mobile.

---

## DATABASE MODEL

Use a relational schema with at least:

### `events`

- id
- name
- event_date
- venue
- timezone
- sales_open_at
- sales_close_at
- created_at

### `price_categories`

- id
- event_id
- name
- price_minor
- currency
- sort_order

Money is stored as integer minor units according to the payment-provider adapter's currency convention. Never accept a browser-provided charge amount.

### `seats`

Static physical inventory only:

- id
- event_id
- section
- row_label
- seat_number
- price_category_id
- pos_x
- pos_y
- optional rotation/accessibility metadata
- is_active

Do **not** store `held_by_session` as the current inventory authority on `seats`.

### `orders`

- id
- event_id
- order_number
- session_id_hash
- access_token_hash
- customer/contact/billing fields actually required
- total_minor
- currency
- status
- created_at
- expires_at
- paid_at
- cancelled_at

Order status must support at least:

- PENDING
- PAID
- EXPIRED
- CANCELLED
- RECONCILIATION_REQUIRED

### `order_seats`

Immutable price/history snapshot:

- order_id
- seat_id
- price_category_name
- price_minor
- currency

Historical rows do not mean the order currently owns the seat.

### `seat_allocations`

This is the current inventory authority:

- seat_id **PRIMARY KEY**
- order_id
- status = HELD | SOLD
- hold_expires_at (required only for HELD)
- timestamps

Interpretation:

- no allocation row = AVAILABLE;
- HELD allocation = temporarily reserved;
- SOLD allocation = purchased.

`seat_id` being unique/primary-key is a database backstop against two current owners.

### `payment_attempts`

- id
- order_id
- provider
- status
- amount_minor
- currency
- idempotency_key
- provider_ref
- provider_status
- redirect_url
- failure information
- timestamps

Allow multiple attempts per order.

### `payment_events`

Used for webhook deduplication/audit:

- provider
- provider_event_id
- payment_attempt_id
- received_at
- processed_at
- payload_hash/minimal metadata

Provider + provider_event_id must be unique.

### `tickets`

- id
- order_id
- seat_id
- ticket_code
- qr_token
- status = VALID | CHECKED_IN | VOID
- checked_in_at
- checked_in_by
- voided_at
- created_at

Only one active VALID/CHECKED_IN ticket may exist for a seat. A VOID historical ticket must not prevent a legitimate resale/new ticket.

### `refunds`

- id
- order_id
- payment_attempt_id
- provider/ref
- amount_minor
- currency
- status
- reason
- requested_by
- timestamps

### `email_outbox`

- id
- kind
- dedupe_key UNIQUE
- order_id
- recipient
- payload
- status
- attempts
- next_attempt_at
- last_error
- timestamps

### `admin_users`

Backed by Supabase Auth:

- id -> auth.users.id
- full_name
- role = ADMIN | SCANNER
- is_active
- created_at

### `admin_audit_log`

Record privileged actions such as refund, cancel, resend, void/check-in and sensitive operational actions.

---

## RESERVATION LOGIC

This is the most important part of the system.

Public call conceptually:

`reserveSeats(eventId, seatIds)`

The browser does not choose hold duration and does not send authoritative prices.

### Required server validation

- event exists and is on sale;
- seat IDs are unique;
- seat count is between 1 and the configured purchase maximum;
- all seats belong to the event and are active;
- rate limit passes.

### Required database transaction

1. Lock all requested static `seats` rows in stable ID order.
2. Remove/reclaim expired HELD allocations for those seats.
3. Re-check current `seat_allocations` after the locks are held.
4. If **ANY** requested seat still has a HELD or SOLD allocation, reject the entire reservation.
5. Read authoritative prices from `price_categories`.
6. Create one PENDING order with server-generated expiry and order number.
7. Snapshot lines into `order_seats`.
8. Insert HELD `seat_allocations` for every selected seat.
9. Commit atomically.
10. Return order ID, order access token, expiration and sanitized summary.

No partial reservation is allowed.

Two requests targeting the same seat must serialize on the database seat row. Exactly one may commit an allocation.

### Transaction function security

Privileged Postgres functions must use safe `SECURITY DEFINER` practices:

- fixed search path;
- schema-qualified objects;
- restricted execute grants;
- internal input validation;
- invoked from service-role Edge Functions, not directly by anonymous browser RPC calls.

---

## HOLD EXPIRY

Default business assumption: 10-minute reservation window until confirmed otherwise.

Expiration is server-side.

Use both:

- lazy reclaim in reservation logic for expired HELD allocations;
- scheduled `pg_cron` sweep roughly every 30 seconds that marks expired PENDING orders EXPIRED and removes their HELD allocations.

The frontend countdown is cosmetic/UX only and is derived from server expiry.

When countdown ends, payment actions are disabled and authoritative status is re-fetched. React must never release inventory by itself.

---

## PAYMENT CREATION

When the customer chooses Pay:

1. validate order ID + public access token;
2. require order PENDING and not expired;
3. confirm every ordered seat is still HELD by that order;
4. read amount/currency from the database;
5. create/reuse a local payment attempt with an idempotency key;
6. create provider payment session;
7. store provider reference/redirect URL;
8. redirect browser to hosted payment page.

If provider creation times out ambiguously, reconcile/retry with the same idempotency strategy where supported. Do not blindly create another charge.

---

## PAYMENT WEBHOOK / FINALIZATION

A successful frontend return URL is **never** a payment state transition.

The webhook Edge Function must:

1. authenticate/verify the callback using the chosen provider's current production method;
2. independently query authoritative payment state where supported/required;
3. verify provider reference;
4. verify paid amount and currency against the local order/payment attempt;
5. deduplicate provider events;
6. call one database `finalize_payment()` transaction.

### Valid finalization

The transaction must lock payment attempt, order and relevant seats/allocations.

If the order is already PAID, return idempotently.

If it is still payable and **every ordered seat is still HELD by this exact order**:

- payment attempt = PAID;
- order = PAID;
- allocations HELD -> SOLD;
- create unique ticket per seat;
- create one confirmation `email_outbox` row with a deterministic dedupe key;
- commit.

### Critical late-payment rule

If payment is verified as successful after the reservation expired:

- if **all ordered seats are currently unallocated**, the locked finalization transaction may reacquire those exact seats directly as SOLD and honor the payment;
- if **any ordered seat belongs to another order**, do not overwrite it.

For an inventory conflict:

- payment attempt = RECONCILIATION_REQUIRED;
- order = RECONCILIATION_REQUIRED;
- no tickets created;
- current seat allocations untouched;
- alert/audit entry created;
- initiate/queue refund reconciliation according to provider capability.

Both late-payment cases must have automated integration tests.

---

## PAYMENT / ORDER RETURN PAGE

The customer return route uses `order_id + access_token` and polls/refetches server state.

Possible UI:

- `Processing payment…`
- `Payment confirmed`
- `Payment failed`
- `Reservation expired`
- `Payment received, support is resolving your order` for rare reconciliation cases

Never inspect query parameters such as `success=true` to decide payment success.

---

## TICKETS AND QR TOKENS

Generate one ticket per purchased seat only after server-confirmed payment finalization.

Keep two identifiers:

- short human-friendly `ticket_code`;
- high-entropy random QR bearer token.

Store the QR bearer token as a protected high-entropy secret so an existing ticket can be rendered/resend without regenerating it. Never expose it through broad table reads or logs.

The QR must not encode customer PII, sequential ticket IDs or predictable data.

Default v1 delivery:

- QR code(s) in confirmation email;
- secure web ticket/order page;
- printable web stylesheet.

PDF attachment is optional and can be added later.

---

## EMAIL

After successful DB payment finalization, the transaction must insert a durable `email_outbox` record.

A separate worker sends through Resend and retries failures.

Confirmation includes:

- event name;
- event date/time;
- venue;
- order number;
- customer name where appropriate;
- purchased seats;
- total price;
- one QR per ticket;
- entry instructions;
- secure ticket/order link.

Do not send tickets before payment has been confirmed server-side.

Admin resend uses existing tickets and does not regenerate QR tokens.

---

## REFUNDS / CANCELLATIONS

Refunding is a stateful provider operation, not a one-click local DB change.

Required behavior:

1. ADMIN requests refund.
2. Create/refetch an idempotent local refund record.
3. Call provider.
4. Do **not** release SOLD seats merely because the request was sent.
5. After authoritative provider success, one DB transaction voids active tickets, updates order/refund state and releases the seat allocation if business policy allows resale.
6. Write audit log.

Failed/uncertain refund operations remain visible for admin reconciliation.

---

## ADMIN AUTHORIZATION

Use Supabase Auth. No public/self-service admin signup.

Roles:

### ADMIN

May:

- see event statistics;
- see/search orders;
- inspect tickets/payment history;
- request refunds/cancellations;
- resend confirmations;
- inspect reconciliation failures;
- perform scanner actions.

### SCANNER

May:

- scan/check in tickets;
- receive only minimal ticket/event information necessary for scan result.

SCANNER must **not** be able to list customer orders, view customer contact details, see finance data or issue refunds.

Client route guards are only UX. Every staff Edge Function verifies Supabase JWT, active staff row and role server-side.

Prefer purpose-specific Edge Functions over broad authenticated direct-table access.

---

## QR CHECK-IN

QR validation is server-side and atomic.

`checkin-ticket` must:

1. authenticate staff JWT;
2. require active ADMIN or SCANNER role;
3. look up the scanned bearer token without logging it;
4. find and `FOR UPDATE` lock ticket;
5. verify event/status;
6. if VALID, set CHECKED_IN + timestamp + staff ID;
7. if already CHECKED_IN, return explicit already-used result and original time;
8. if VOID/invalid, return explicit result;
9. audit the action.

Two simultaneous scans of the same ticket may not both report a first successful check-in.

### Launch connectivity

Use online-authoritative scanning in v1 to preserve strict single-use semantics. Prepare venue Wi-Fi/hotspot/device fallback. Do not quietly implement browser-offline check-in without a separate reconciliation design.

---

## REALTIME

Realtime improves UX only.

Production preference: Supabase Realtime Broadcast of sanitized seat deltas.

Clients must re-fetch canonical state after:

- reconnect;
- browser resume after long suspension;
- hold expiry;
- reservation conflict;
- payment return.

Never send order/customer/payment identifiers in public realtime messages.

---

## RLS / DATABASE SECURITY

Enable RLS on application tables.

### Anonymous users

No direct writes to any application table.

No direct reads of:

- orders;
- order_seats;
- seat_allocations;
- payment_attempts/events;
- tickets;
- refunds;
- outbox;
- admin/audit tables.

Serve public event/seat state through sanitized API responses and Realtime Broadcast.

### Authenticated staff

Do not give every staff user broad `SELECT` access to orders/tickets. Use Edge Functions that enforce ADMIN vs SCANNER and return only fields required by each screen.

### Service role

Service-role key stays server-side only. Never expose it in Vite environment variables or client bundles.

---

## PUBLIC ORDER ACCESS

Do not let anonymous users fetch orders merely by UUID.

Reservation returns a high-entropy order access token. Store only its hash.

`get-order-status` and customer ticket pages require:

- order ID;
- access token.

Rate-limit failed access-token lookups and return sanitized data only.

Do not leave the raw order access token in ordinary analytics-visible query strings. Keep it in browser session state across the provider redirect; for emailed ticket links, prefer a URL fragment that the SPA consumes and removes immediately.

---

## SECURITY REQUIREMENTS

Treat this as a payment/ticketing system.

Required:

- never trust client seat availability;
- never trust client prices;
- never trust frontend payment state;
- validate input both at API and critical DB boundaries;
- use fixed-search-path/hardened SECURITY DEFINER functions;
- no service-role key in browser;
- verify payment callbacks against current provider documentation;
- compare verified amount/currency against local data;
- webhook idempotency/deduplication;
- payment creation idempotency/reconciliation;
- cryptographically random bearer tokens;
- hash public order access tokens at rest; protect QR bearer tokens with server-only/RLS access and never log them;
- role-based server authorization;
- rate-limit sensitive public/staff endpoints;
- audit privileged actions;
- appropriate CSP/security headers;
- collect only needed PII;
- separate staging and production secrets/projects.

Do not store card details.

---

## OBSERVABILITY / OPERATIONS

Before launch:

- structured Edge Function logs with correlation/request IDs;
- frontend + backend error monitoring;
- alert for reconciliation-required payments;
- alert for stuck/failed email jobs;
- admin audit log;
- payment/refund references searchable operationally;
- backup/PITR appropriate for production and a recovery procedure;
- staging project + payment sandbox;
- production-secret rotation procedure;
- venue scanning connectivity fallback.

---

## REQUIRED TESTS

The project is not production-ready until these are automated.

### Reservation concurrency

- 20+ concurrent attempts for same seat -> exactly one reservation succeeds.
- overlapping multi-seat requests -> no partial order/allocation.
- expired hold can be reclaimed.
- duplicate seat IDs rejected.

### Payment

- normal success;
- normal failure;
- user abandons provider;
- webhook before browser return;
- browser return before webhook;
- duplicate webhook;
- delayed webhook;
- amount/currency mismatch;
- provider API timeout;
- ambiguous create-payment timeout/retry;
- **successful late payment after seat was reallocated -> reconciliation path, no seat theft**.

### Tickets

- one ticket per paid seat;
- duplicate webhook does not generate duplicates;
- simultaneous QR scans -> one first check-in;
- VOID ticket cannot check in;
- refunded/voided seat can be resold with a new valid ticket if policy allows.

### Permissions

- anon cannot read private tables;
- scanner cannot list orders/customer data/refund;
- admin-only endpoints reject scanner;
- public order access requires valid order token.

### Browser UX

Playwright coverage for desktop/mobile seat selection, checkout validation, hold expiry, payment-return states, confirmation, admin and scanner flows.

### Load

Load-test likely on-sale burst with concentrated attempts on popular seats and many concurrent map viewers.

---

## IMPLEMENTATION PHASES

### Phase 0 — Foundations

- repository and CI;
- React/Vite/Tailwind frontend scaffold;
- selected UI/query/router libraries;
- staging + production Supabase projects;
- migration/seed workflow;
- environment/secrets setup.

### Phase 1 — Database correctness

- implement schema;
- implement seat allocation transaction;
- implement expiry;
- concurrency test suite;
- sanitized event/seat read API;
- seed venue layout.

**Do not begin payment integration until the allocation race tests pass.**

### Phase 2 — Seat-map frontend

- SVG map;
- mobile/desktop pan/zoom;
- seat state/legend;
- selected-seat summary;
- reservation flow;
- countdown;
- realtime + reconnect/refetch handling;
- accessibility pass.

### Phase 3 — Payments

- customer form;
- payment attempt model;
- one provider adapter/sandbox;
- create-payment recovery/idempotency;
- verified webhook;
- transactional payment finalization;
- late-payment conflict/reconciliation handling.

### Phase 4 — Tickets/email

- QR/ticket generation;
- order-access token hashing and protected QR bearer tokens;
- transactional email outbox;
- Resend worker/retries;
- secure customer ticket view;
- printable ticket view.

### Phase 5 — Admin/refunds

- Auth provisioning;
- ADMIN/SCANNER role enforcement;
- stats/orders/tickets;
- refund workflow;
- reconciliation queue;
- audit log;
- resend confirmation.

### Phase 6 — Check-in

- mobile scanner UI;
- atomic check-in;
- clear status responses;
- manual code fallback;
- real-device/network testing.

### Phase 7 — Launch hardening

- load/concurrency testing;
- payment/webhook retry tests;
- endpoint/RLS review;
- CSP/security headers;
- logs/monitoring/alerts;
- backup/recovery review;
- deliverability checks;
- production payment credentials;
- venue network plan;
- DNS/subdomain cutover.

---

## IMPLEMENTATION RULES FOR CODING AGENT / DEVELOPER

1. Read `ARCHITECTURE_UPDATED.md` before implementation.
2. Do not replace database invariants with frontend checks.
3. Keep payment/refund provider code behind adapter modules.
4. Keep Edge Functions thin where possible; transactional state transitions live in explicit Postgres functions.
5. Do not expose core private tables because it is convenient for the UI.
6. Use typed API DTOs and Zod validation at HTTP boundaries.
7. Keep migrations reviewable and reversible where practical.
8. Add tests with every state transition, not after the entire app is built.
9. Never silently accept an impossible/ambiguous payment state. Put it in reconciliation and alert an admin.
10. Do not introduce additional frameworks/state libraries without a concrete problem they solve.

---

## PROJECT INPUTS STILL NEEDED BEFORE RELEVANT PHASES

- Choose GoPay or Comgate for the first integration.
- Obtain the real GoJa Music Hall seating/section layout.
- Confirm price categories and prices.
- Confirm maximum seats per order (engineering default: 10).
- Confirm refund/resale policy.
- Confirm exact billing/invoice fields required.
- Provide event brand assets/palette/type choices for final UI.

These inputs do not block building/testing the core database allocation model against a placeholder seat fixture.
