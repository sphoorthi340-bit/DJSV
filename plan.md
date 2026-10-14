# StitchFlow implementation plan

## Product direction
StitchFlow is a focused operations workspace for Indian tailoring shops: fast on a phone, calm on the eyes, and explicit about dates, units and order history.

## Architecture
- **Runtime:** Node.js 22 with Express serving the API and the browser client.
- **Persistence:** SQLite through `better-sqlite3`; schema creation is idempotent in `server/db.js` so local setup is reproducible without destructive migrations.
- **Authentication:** bcrypt password hashes and signed session cookies. Business API routes require the authenticated session.
- **Frontend:** dependency-light browser JavaScript and CSS in `public/`, keeping the first version easy to run and extend.
- **Contract:** JSON REST endpoints under `/api`; order measurement snapshots are stored as JSON at creation time and never read from the current profile for historical display.

## Design system
- **Design movement:** editorial small-business utility, combining a warm paper-like canvas with a dark teal workbench.
- **Core principles:** operational clarity, touch-friendly density, honest status language, and visible history.
- **Color philosophy:** warm neutrals reduce visual fatigue; dark teal anchors trust; saffron is reserved for attention and due-date urgency.
- **Layout paradigm:** a persistent rail on desktop becomes a compact top bar on mobile; dashboard content is organized as a vertical work queue rather than a decorative card grid.
- **Signature elements:** stitched corner detail, pill-shaped status labels, and a slim “today” date rail.
- **Interaction philosophy:** forms are short and progressive; destructive actions are avoided; status changes explain what happened.
- **Animation:** use only short fades and pressed states; no looping motion in the operations workspace.
- **Typography:** system UI stack for fast loading, with strong numeric hierarchy and generous line-height.
- **Brand essence:** a dependable digital measurement book for busy local tailors. Personality: grounded, precise, welcoming.
- **Brand voice:** direct and reassuring. Examples: “Keep every fitting on track.” / “The latest work, at a glance.”
- **Wordmark:** “StitchFlow” paired with a small thread-loop mark built in CSS.
- **Signature brand color:** deep teal `#124e52`.

## Project structure
- `server/index.js`: authenticated REST API and static server.
- `server/db.js`: SQLite schema, seed account, and data helpers.
- `public/index.html`: application shell and semantic route containers.
- `public/app.js`: client-side navigation, forms, API calls and rendering.
- `public/styles.css`: responsive design system.
- `public/manus-routes.json`: route manifest for preview tooling.
- `test/`: API-independent domain tests for due dates, order references and snapshots.

## Extension contract for Person 2
- Add payment records keyed by `orders.id`; use `orders.total_amount` and `orders.currency` as the stable extension point.
- Add notification/print/export tables keyed by `orders.id` and `customers.id`.
- Preserve the status values in `server/db.js` and the snapshot fields returned by `GET /api/orders/:id`.
- All timestamps are stored as ISO UTC strings; date-only business fields are interpreted in `Asia/Kolkata` on the server.
