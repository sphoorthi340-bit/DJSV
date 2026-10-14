# StitchFlow delivery checklist

## Core foundation — complete
- [x] Protected business pages require an authenticated user; no hardcoded credentials are used.
- [x] Shop profile stores shop name, phone, optional address, unit and timezone.
- [x] Ownership is enforced through the authenticated shop relationship.
- [x] Customer directory supports listing, search by name/phone, add, edit, details and order history.
- [x] Garment-specific measurement profiles are unit-explicit and historical.
- [x] Orders retain immutable measurement snapshots after profile edits.
- [x] Orders have unique references, due/fitting dates, instructions, total extension point and current status.
- [x] Supported statuses and status history are preserved.
- [x] Dashboard counts derive from stored records and link to work queues.

## Phase 2 — complete
- [x] Payments use an additive `payments` ledger with integer paise, shop/order foreign keys, methods, timestamps and audit fields.
- [x] Payment creation validates positive finite amounts, methods, ownership and the server-calculated remaining balance.
- [x] Order details show total, received, remaining, paid state and payment history after refresh.
- [x] Fitting-ready and pickup messages use real customer, order and shop values.
- [x] WhatsApp click-to-chat URLs normalize Indian numbers conservatively and store honest notification history.
- [x] Notification statuses never claim delivery without provider evidence; duplicate preparation is guarded for ten minutes.
- [x] Internal job-sheet and customer receipt print actions use the saved measurement snapshot and print CSS.
- [x] Authenticated customer, order and payment CSV exports use UTF-8, escaping, formula-injection protection and shop scoping.
- [x] Production sessions require a strong configured secret and secure cookies; local development remains explicit and documented.
- [x] Authentication routes have normalized email handling, password validation, session renewal and basic rate limiting.
- [x] Integration tests cover the payment ledger, notification creation, export content and unauthenticated access.

## Known limitations
- WhatsApp uses click-to-chat; it does not send messages or verify delivery without a provider integration.
- The default Express session store is suitable for demonstration and single-process local use, but should be replaced by a persistent shared store before multi-instance production deployment.
- Payment corrections are not destructive: a future correction workflow should add explicit reversal records rather than editing history.
