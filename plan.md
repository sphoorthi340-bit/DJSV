# StitchFlow implementation plan and handoff

## Product direction
StitchFlow is a focused operations workspace for Indian tailoring shops: fast on a phone, calm on the eyes, and explicit about dates, units and order history.

## Architecture
StitchFlow runs on Node.js 22 with Express serving a dependency-light browser client. SQLite through `better-sqlite3` is initialized idempotently in `server/db.js`; the additive Phase 2 tables are created with `CREATE TABLE IF NOT EXISTS`, so existing customers, measurements and orders are preserved. JSON REST endpoints live under `/api`, and all business routes are protected by the authenticated session and shop ownership checks.

The existing measurement snapshot contract is unchanged: creating an order copies the chosen garment profile, values, unit, notes and capture timestamp into `orders.measurement_snapshot_json`. Historical order views, print layouts and CSV exports read that snapshot, never the customer's latest profile.

## Phase 2 data model
- `payments`: `id`, `shop_id`, `order_id`, `amount_paise`, `method`, `transaction_reference`, `notes`, `paid_at`, `created_by`, `created_at`. It is an append-only ledger for received payments.
- `notifications`: `id`, `shop_id`, `customer_id`, `order_id`, `purpose`, `destination_phone`, `message`, `status`, `provider_reference`, `failure_details`, `created_at`, `last_action_at`. MVP statuses are `Prepared` and `Link Open Requested`; provider delivery statuses are not asserted without a real provider.
- Payment balance is calculated centrally as `orders.total_amount * 100 - SUM(payments.amount_paise)`. Cancelled orders are retained and excluded from the dashboard outstanding total; historical payment data remains visible.
- All stored timestamps are ISO UTC strings. Business date comparisons use `Asia/Kolkata`; the shop profile retains its timezone for future expansion.

## API contracts
Core routes remain available: `/api/auth/*`, `/api/shop`, `/api/customers`, `/api/measurements`, `/api/orders`, `/api/orders/:id/status` and `/api/dashboard`.

Phase 2 routes are:

| Route | Purpose |
|---|---|
| `GET /api/orders/:id/payments` | Authorized order payment summary and ledger |
| `POST /api/orders/:id/payments` | Record a validated cash/UPI/bank/card/other payment |
| `GET /api/orders/:id/notifications` | Authorized notification history |
| `POST /api/orders/:id/notifications` | Prepare a fitting-ready or pickup WhatsApp message |
| `POST /api/notifications/:id/opened` | Record that the click-to-chat link was opened/requested |
| `GET /api/exports/customers.csv` | Authenticated shop customer export |
| `GET /api/exports/orders.csv` | Authenticated shop order, snapshot and balance export |
| `GET /api/exports/payments.csv` | Authenticated shop payment export |

Person 2 can add provider integrations using `notifications.provider_reference` and `failure_details`; do not change the established status names or snapshot structure.

## Design system
The editorial small-business utility design remains: warm neutrals, deep teal foundation, saffron attention accents, restrained shadows, clear financial hierarchy and touch-friendly controls. Order details use the same system and add a clear payment ledger, message preparation panel and print-only receipt/job-sheet layouts.

## Security posture
Production startup requires `SESSION_SECRET` with at least 32 characters. Production cookies are HttpOnly, Secure and SameSite=None for HTTPS previews; local development uses an explicit local-only fallback and SameSite=Lax. Login and registration normalize email, validate passwords, renew the session, and have a basic per-IP attempt limiter. The default Express memory session store is not suitable for a multi-instance production deployment; use a persistent shared session store before scaling out. No credentials, hashes or session values are exported.

## Demonstration workflow
1. Run `npm install && npm run dev`, open the app and register a shop.
2. Add a customer, record a Blouse profile in centimetres, and create an order with a total.
3. Open the order reference from the order list, record a UPI advance, then record a second payment until the balance is zero.
4. Prepare a fitting-ready or pickup message. Explain that the URL opens WhatsApp but delivery remains unverified.
5. Use Print job sheet and Print receipt, choosing browser Print to PDF if desired.
6. Download customers, orders or payments CSV from the relevant screen.
7. Edit or record a newer customer profile and show that the original order snapshot remains unchanged.

## Project structure
- `server/index.js`: authenticated API, payment ledger, notifications, CSV exports and static server.
- `server/db.js`: SQLite schema, additive Phase 2 tables, money and ownership helpers.
- `public/app.js`: hash navigation, forms, order detail, payment, notification, print and export actions.
- `public/styles.css` and `public/phase2.css`: responsive workspace and print layouts.
- `test/`: domain and Phase 2 integration tests.
- `public/manus-routes.json`: actual route manifest including order/customer detail patterns.
