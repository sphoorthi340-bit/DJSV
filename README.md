# StitchFlow

StitchFlow is a small-business tailoring workspace for customer records, garment measurements, order progress, payment ledgers and practical shop operations. It is designed for local shops that need a reliable digital measurement book without losing the speed of a paper diary.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, create the first shop account, and use the workspace. SQLite data is stored in `data/stitchflow.sqlite` and is ignored by Git. For a production-like run, configure a strong secret:

```bash
NODE_ENV=production SESSION_SECRET="use-a-random-secret-at-least-32-characters" npm start
```

Production requires the secret and sets Secure, HttpOnly, SameSite=None cookies. The local fallback is intentionally for development only. Express's default in-memory session store is not suitable for multi-instance production; replace it with a persistent shared store before scaling out.

## Complete workflow

Create a customer, record a garment-specific measurement profile, then create an order from that profile. The order stores a JSON snapshot containing the measurements and unit at creation time. Editing or recording a newer profile does not modify the old order.

Open an order to record cash, UPI, bank transfer, card or other payments. Amounts are stored as integer paise, the backend calculates the remaining balance, and overpayments are rejected. The same order detail view prepares fitting-ready and pickup messages, records notification history, opens WhatsApp click-to-chat and clearly distinguishes link opening from delivery confirmation.

The order detail page provides a printable internal job sheet and customer receipt. Customers, orders and payments can be exported as authenticated, shop-scoped CSV files with UTF-8, escaping and spreadsheet formula-injection protection.

## Quality commands

```bash
npm run check
npm test
```

The test suite covers the existing core domain rules plus an isolated Phase 2 integration workflow for registration, payments, overpayment rejection, notification history, CSV output and unauthenticated access. See [`plan.md`](plan.md) for the data model, API contracts, security posture and a college-demo script. See [`TODO.md`](TODO.md) for completed scope and known limitations.

WhatsApp remains click-to-chat only: StitchFlow does not claim that a customer received a message without a real provider integration. Payment history is auditable and not silently deleted.
