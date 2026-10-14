# StitchFlow

StitchFlow is a small-business tailoring workspace for customer records, garment measurements and order progress. It is designed for local shops that need a reliable digital measurement book without losing the practical speed of a paper diary.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, create the first shop account, and use the workspace. SQLite data is stored in `data/stitchflow.sqlite` (ignored from Git). Set `SESSION_SECRET` in the environment for a deployed instance; never commit credentials or the database.

## Core workflow

Create a customer, record a garment-specific measurement profile, then create an order from that profile. The order stores a JSON snapshot containing the measurements and unit at creation time. Editing or recording a newer profile does not modify the old order. Order status changes append to `order_status_history` instead of replacing history.

The complete architecture, data model, time-zone conventions and extension contract for payments, notifications, printing and exports are in [`plan.md`](plan.md). The current outcome checklist is in [`TODO.md`](TODO.md).
