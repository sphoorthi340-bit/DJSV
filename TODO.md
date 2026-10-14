# StitchFlow delivery checklist

## Foundation and access
- [ ] Protected business pages require an authenticated user; no hardcoded credentials are used.
- [ ] Shop profile stores shop name, phone, optional address, unit and timezone.
- [ ] Ownership is enforced through the authenticated shop relationship.

## Customers and measurements
- [ ] Customer directory supports listing, search by name/phone, add, edit, details and order history.
- [ ] Customers retain stable IDs, timestamps, notes and fit preferences.
- [ ] Measurement profiles are garment-specific, unit-explicit, editable and historical.
- [ ] Orders retain immutable measurement snapshots after profile edits.

## Orders and dashboard
- [ ] Orders have unique human-readable references, due/fitting dates, instructions, total extension point and current status.
- [ ] Supported statuses and status history are preserved.
- [ ] Orders can be searched and filtered by status, customer, due date and overdue state.
- [ ] Dashboard counts derive from stored records and link to filtered work queues.
- [ ] Due-date calculations use Asia/Kolkata business dates.

## Quality and handoff
- [ ] Mobile and desktop layouts remain usable.
- [ ] Validation errors are visible and duplicate order submission is guarded.
- [ ] Tests cover references, due dates, snapshots and status history.
- [ ] Person 2 extension points and known limitations are documented in `plan.md`.
