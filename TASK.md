Build a production-ready ticketing web app for a single event.

## PROJECT

Event: Galavečer tumbao 2027
Date: 29 May 2027
Venue: GoJa Music Hall, Prague
The app will run on a dedicated subdomain, e.g. tickets.tumbao.cz.

The application is for ONE event only. Do not build a generic multi-tenant ticketing platform.

## GOAL

Users must be able to:

1. See an interactive seating map of the venue.
2. See which seats are available, temporarily reserved, or sold.
3. Select one or more specific seats.
4. See the total price immediately.
5. Enter their contact/billing information.
6. Pay online.
7. Receive a confirmation email containing their purchased seats and unique QR code ticket(s).
8. Show the QR code on their phone or print the ticket.
9. An administrator must be able to see orders and ticket status and validate tickets at the venue.

IMPORTANT:
The system must NEVER allow two customers to purchase the same seat.

## TECH STACK

Frontend:

- React
- TypeScript
- Vite
- Tailwind CSS

Backend:

- Supabase
- PostgreSQL
- Supabase Edge Functions where appropriate

Email:

- Resend

QR:

- Generate unique QR codes for every ticket.

Payments:

- Design the payment layer so it can be connected to a Czech payment provider such as GoPay or Comgate.
- Do not treat the frontend payment success redirect as proof of payment.
- Payment confirmation must happen through a server-side webhook.

## DATABASE

Design a proper relational schema.

At minimum:

events

- id
- name
- date
- venue
- created_at

seats

- id
- event_id
- section
- row
- seat_number
- price_category
- price
- status

orders

- id
- event_id
- customer_name
- customer_email
- customer_phone
- total_price
- status
- payment_status
- created_at
- expires_at

order_seats

- order_id
- seat_id
- price

tickets

- id
- order_id
- seat_id
- ticket_code
- qr_token
- status
- checked_in_at

price_categories

- id
- name
- price

## SEAT STATES

A seat can be:

AVAILABLE
HELD
SOLD

HELD seats must automatically expire after e.g. 10 minutes if payment has not been completed.

The expiration must be enforced server-side.

## RESERVATION LOGIC

This is the most important part of the application.

Never rely on React state to determine whether a seat is available.

Implement an atomic server-side reservation operation.

Example:

reserveSeats(seatIds, sessionId)

Requirements:

- Check all requested seats in a database transaction.
- If ANY requested seat is already HELD or SOLD, reject the entire reservation.
- If all are available, lock all seats atomically.
- Create an order with status = PENDING.
- Set expires_at = current time + 10 minutes.
- Return the order ID and expiration timestamp.

Two users attempting to reserve the same seat at the same time must never both succeed.

## PAYMENT FLOW

1. User selects seats.
2. Seats become HELD.
3. Pending order is created.
4. User proceeds to payment.
5. Payment provider processes payment.
6. Server receives payment webhook.
7. Server verifies the payment.
8. If payment is successful:
   - order = PAID
   - seats = SOLD
   - tickets are generated
   - confirmation email is sent
9. If payment fails or reservation expires:
   - order = CANCELLED / EXPIRED
   - seats return to AVAILABLE

Do not mark an order as paid based only on a frontend redirect.

## SEATING MAP

The seating map must be data-driven, not hardcoded as one image.

The venue map will contain multiple sections, rows and individual seats.

Each seat must have:

- unique ID
- section
- row
- seat number
- price category
- coordinates/position for rendering

The UI should visually distinguish:

AVAILABLE
HELD
SOLD
SELECTED

Users can click individual seats.

Display a legend.

Display selected seats and total price next to/below the seating map.

The seating map must work well on desktop and mobile.

## ADMIN

Create a protected admin area.

Admin should be able to:

- View event statistics.
- See total seats.
- See available / held / sold seats.
- View orders.
- Search orders by customer email/name/order ID.
- View individual tickets.
- Manually cancel/refund an order if necessary.
- Validate a ticket using QR code.
- Mark a ticket as CHECKED_IN.

QR validation must be server-side.

A valid ticket can only be checked in once.

If the same QR code is scanned twice, the second attempt must clearly show that the ticket has already been used.

## SECURITY

Treat the application as a real payment/ticketing system.

Requirements:

- Never trust client-side seat availability.
- Never trust client-side prices.
- Never trust frontend payment status.
- Validate all input server-side.
- Use Supabase Row Level Security where appropriate.
- Do not expose service-role keys to the browser.
- Payment webhooks must be authenticated/verified according to the provider's mechanism.
- QR tokens must be cryptographically random and impossible to guess.
- Admin routes must be protected.
- Rate-limit sensitive endpoints where appropriate.

## EMAIL

After successful payment send the customer a confirmation email.

Include:

- event name
- event date
- venue
- order number
- customer name
- purchased seats
- total price
- QR code(s)
- instructions for entry

Do not send the ticket before payment has been confirmed server-side.

## UX

The purchase flow should be extremely simple:

1. Select seats
2. Review selection
3. Enter customer details
4. Pay
5. Show confirmation

Show a visible countdown while seats are held:

"Your seats are reserved for 09:42"

If the reservation expires, release the seats and force the user to select them again.

## DESIGN

Clean, modern, minimal event-ticketing interface.

The seating map should be the primary UI element.

Use responsive design.

Do not introduce unnecessary animations, 3D effects, dashboards or visual complexity.

## ARCHITECTURE REQUIREMENT

Before writing implementation code:

1. Propose the complete architecture.
2. Propose the PostgreSQL schema.
3. Explain the seat reservation transaction and how race conditions are prevented.
4. Explain the payment/webhook flow.
5. Explain Supabase RLS policies.
6. Explain the admin authentication model.
7. Identify security risks and failure scenarios.
8. Provide a phased implementation plan.

Do NOT start by generating the entire application.

First produce the architecture and database design for review.
