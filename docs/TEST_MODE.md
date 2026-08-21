# Local test/demo mode

`VITE_TEST_MODE=true` selects `src/test-mode/mock-ticketing-service.ts` through the repository factory. Route components depend only on `TicketingService`; they never import mock code.

Safety boundaries:

- test mode is accepted only when Vite reports `DEV` and the non-production build constant permits it;
- Vite refuses to create a production build if the flag is true, and runtime initialization has a second development-only guard;
- the Supabase module is dynamically imported only in production mode, so creating test mode does not instantiate a client;
- the mock module contains no network calls and persists only under the namespaced `tumbao:test-data:v5` local-storage key;
- demo admin access and instant payment exist only inside the mock implementation.

The JSON seed is `src/test-mode/seed.json`. It holds the event, price categories, hall section layouts, initial allocations, a paid order, tickets, and staff examples. Mock transitions intentionally mirror production concepts: one allocation per seat, all-or-nothing reservation, server-style expiry sweeps, paid orders converting HELD to SOLD, ticket creation after payment, and atomic single-use check-in.

Reset from the yellow test-mode banner or clear the `tumbao:test-data:v5` local-storage key. Resetting never touches Supabase.
