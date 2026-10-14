import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, STATUSES, GARMENTS, now, todayIST, makeReference, parseJson, publicUser, customerForShop, orderForShop, serializeMeasurement, serializeOrder, isOverdue } from './db.js';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(session({ secret: process.env.SESSION_SECRET || 'stitchflow-local-development-secret', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 12 } }));
app.use(express.static(join(__dirname, '..', 'public')));

const fail = (res, status, message, details = {}) => res.status(status).json({ error: message, details });
const requireAuth = (req, res, next) => req.session.user ? next() : fail(res, 401, 'Please sign in to continue.');
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const cleanPhone = (value) => String(value || '').replace(/[^\d+]/g, '');
const validateCustomer = (body) => {
  const errors = {};
  if (!String(body.name || '').trim()) errors.name = 'Customer name is required.';
  if (!/^\+?[0-9]{10,13}$/.test(cleanPhone(body.phone))) errors.phone = 'Enter a valid mobile number.';
  return errors;
};

app.get('/api/health', (req, res) => res.json({ ok: true, today: todayIST() }));
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, shopName, phone } = req.body || {};
  if (!name || !email || !password || !shopName || !phone) return fail(res, 400, 'Name, email, password, shop name and phone are required.');
  if (String(password).length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(String(email).trim().toLowerCase());
  if (exists) return fail(res, 409, 'An account with that email already exists.');
  const timestamp = now();
  const create = db.transaction(() => {
    const shop = db.prepare('INSERT INTO shops (name, phone, created_at, updated_at) VALUES (?,?,?,?,?)').run(String(shopName).trim(), cleanPhone(phone), timestamp, timestamp);
    const user = db.prepare('INSERT INTO users (shop_id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)').run(shop.lastInsertRowid, String(name).trim(), String(email).trim().toLowerCase(), bcrypt.hashSync(password, 12), timestamp);
    return db.prepare('SELECT * FROM users WHERE id=?').get(user.lastInsertRowid);
  });
  const user = create(); req.session.user = publicUser(user); res.status(201).json({ user: req.session.user });
});
app.post('/api/auth/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body?.email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(req.body?.password || ''), user.password_hash)) return fail(res, 401, 'Email or password is incorrect.');
  req.session.user = publicUser(user); res.json({ user: req.session.user });
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/auth/me', (req, res) => req.session.user ? res.json({ user: req.session.user }) : fail(res, 401, 'Not signed in.'));

app.use('/api', requireAuth);
app.get('/api/shop', (req, res) => res.json(db.prepare('SELECT * FROM shops WHERE id=?').get(req.session.user.shopId)));
app.put('/api/shop', (req, res) => {
  const { name, phone, address, unit, timezone } = req.body || {};
  if (!name || !phone || !['cm','in'].includes(unit) || !timezone) return fail(res, 400, 'Shop name, phone, unit and timezone are required.');
  db.prepare('UPDATE shops SET name=?,phone=?,address=?,unit=?,timezone=?,updated_at=? WHERE id=?').run(String(name).trim(), cleanPhone(phone), String(address || '').trim(), unit, timezone, now(), req.session.user.shopId);
  res.json(db.prepare('SELECT * FROM shops WHERE id=?').get(req.session.user.shopId));
});

app.get('/api/customers', (req, res) => {
  const search = `%${String(req.query.search || '').trim()}%`;
  const rows = db.prepare(`SELECT c.*, COUNT(o.id) order_count FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE c.shop_id=? AND (c.name LIKE ? OR c.phone LIKE ?) GROUP BY c.id ORDER BY c.updated_at DESC`).all(req.session.user.shopId, search, search);
  res.json(rows);
});
app.post('/api/customers', (req, res) => {
  const errors = validateCustomer(req.body); if (Object.keys(errors).length) return fail(res, 400, 'Please correct the highlighted fields.', errors);
  const t = now(); const result = db.prepare('INSERT INTO customers (shop_id,name,phone,email,notes,fit_preferences,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(req.session.user.shopId, String(req.body.name).trim(), cleanPhone(req.body.phone), String(req.body.email || '').trim(), String(req.body.notes || '').trim(), String(req.body.fit_preferences || '').trim(), t, t);
  res.status(201).json(customerForShop(result.lastInsertRowid, req.session.user.shopId));
});
app.get('/api/customers/:id', (req, res) => {
  const customer = customerForShop(req.params.id, req.session.user.shopId); if (!customer) return fail(res, 404, 'Customer not found.');
  const measurements = db.prepare('SELECT * FROM measurements WHERE customer_id=? ORDER BY created_at DESC').all(customer.id).map(serializeMeasurement);
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC').all(customer.id).map(serializeOrder);
  res.json({ ...customer, measurements, orders });
});
app.put('/api/customers/:id', (req, res) => {
  if (!customerForShop(req.params.id, req.session.user.shopId)) return fail(res, 404, 'Customer not found.');
  const errors = validateCustomer(req.body); if (Object.keys(errors).length) return fail(res, 400, 'Please correct the highlighted fields.', errors);
  db.prepare('UPDATE customers SET name=?,phone=?,email=?,notes=?,fit_preferences=?,updated_at=? WHERE id=? AND shop_id=?').run(String(req.body.name).trim(), cleanPhone(req.body.phone), String(req.body.email || '').trim(), String(req.body.notes || '').trim(), String(req.body.fit_preferences || '').trim(), now(), req.params.id, req.session.user.shopId);
  res.json(customerForShop(req.params.id, req.session.user.shopId));
});

app.get('/api/measurements', (req, res) => {
  const rows = db.prepare(`SELECT m.*, c.name customer_name FROM measurements m JOIN customers c ON c.id=m.customer_id WHERE c.shop_id=? ORDER BY m.created_at DESC`).all(req.session.user.shopId);
  res.json(rows.map(serializeMeasurement));
});
app.post('/api/measurements', (req, res) => {
  const { customerId, garmentType, unit, values, notes } = req.body || {};
  if (!customerForShop(customerId, req.session.user.shopId)) return fail(res, 404, 'Customer not found.');
  if (!GARMENTS.includes(garmentType) || !['cm','in'].includes(unit) || !values || typeof values !== 'object') return fail(res, 400, 'Garment, unit and measurements are required.');
  const result = db.prepare('INSERT INTO measurements (customer_id,garment_type,unit,values_json,notes,created_at) VALUES (?,?,?,?,?,?)').run(customerId, garmentType, unit, JSON.stringify(values), String(notes || '').trim(), now());
  res.status(201).json(serializeMeasurement(db.prepare('SELECT * FROM measurements WHERE id=?').get(result.lastInsertRowid)));
});

app.get('/api/orders', (req, res) => {
  const q = String(req.query.search || '').trim(); const status = String(req.query.status || '').trim();
  let sql = `SELECT o.*, c.name customer_name, c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.shop_id=?`;
  const args = [req.session.user.shopId];
  if (q) { sql += ' AND (o.reference LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'; args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (status && STATUSES.includes(status)) { sql += ' AND o.status=?'; args.push(status); }
  sql += ' ORDER BY CASE WHEN o.status IN (\'Delivered\',\'Cancelled\') THEN 1 ELSE 0 END, o.due_date ASC, o.updated_at DESC';
  res.json(db.prepare(sql).all(...args).map(serializeOrder));
});
app.get('/api/orders/:id', (req, res) => { const order = orderForShop(req.params.id, req.session.user.shopId); if (!order) return fail(res, 404, 'Order not found.'); const history = db.prepare('SELECT * FROM order_status_history WHERE order_id=? ORDER BY changed_at DESC').all(order.id); res.json({ ...serializeOrder(order), history }); });
app.post('/api/orders', (req, res) => {
  const { customerId, measurementId, garmentType, quantity, instructions, fabricNotes, internalNotes, totalAmount, dueDate, fittingDate } = req.body || {};
  const customer = customerForShop(customerId, req.session.user.shopId); if (!customer) return fail(res, 404, 'Customer not found.');
  const measurement = measurementId ? db.prepare('SELECT m.* FROM measurements m JOIN customers c ON c.id=m.customer_id WHERE m.id=? AND m.customer_id=?').get(measurementId, customerId) : null;
  if (!measurement || !GARMENTS.includes(garmentType) || !validDate(dueDate) || Number(quantity) < 1) return fail(res, 400, 'Garment, measurement, quantity and a valid due date are required.');
  const timestamp = now(); const reference = makeReference();
  const snapshot = { garmentType: measurement.garment_type, unit: measurement.unit, values: parseJson(measurement.values_json), notes: measurement.notes, capturedAt: timestamp };
  const result = db.transaction(() => {
    const order = db.prepare(`INSERT INTO orders (shop_id,customer_id,reference,garment_type,quantity,measurement_snapshot_json,instructions,fabric_notes,internal_notes,total_amount,currency,created_at,due_date,fitting_date,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.session.user.shopId, customerId, reference, garmentType, Number(quantity), JSON.stringify(snapshot), String(instructions || '').trim(), String(fabricNotes || '').trim(), String(internalNotes || '').trim(), Number(totalAmount || 0), 'INR', timestamp, dueDate, validDate(fittingDate) ? fittingDate : '', 'New Order', timestamp);
    db.prepare('INSERT INTO order_status_history (order_id,previous_status,new_status,changed_at) VALUES (?,?,?,?)').run(order.lastInsertRowid, null, 'New Order', timestamp);
    return order.lastInsertRowid;
  })();
  res.status(201).json(serializeOrder(orderForShop(result, req.session.user.shopId)));
});
app.patch('/api/orders/:id/status', (req, res) => {
  const order = orderForShop(req.params.id, req.session.user.shopId); if (!order) return fail(res, 404, 'Order not found.');
  if (!STATUSES.includes(req.body?.status)) return fail(res, 400, 'Unsupported order status.');
  if (order.status === req.body.status) return res.json(serializeOrder(order));
  const t = now(); db.transaction(() => { db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(req.body.status, t, order.id); db.prepare('INSERT INTO order_status_history (order_id,previous_status,new_status,changed_at) VALUES (?,?,?,?)').run(order.id, order.status, req.body.status, t); })();
  res.json(serializeOrder(orderForShop(order.id, req.session.user.shopId)));
});

app.get('/api/dashboard', (req, res) => {
  const shopId = req.session.user.shopId; const orders = db.prepare('SELECT o.*, c.name customer_name FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.shop_id=?').all(shopId); const today = todayIST();
  const active = orders.filter(o => !['Delivered','Cancelled'].includes(o.status));
  res.json({ today, stats: { active: active.length, dueToday: active.filter(o => o.due_date === today).length, overdue: active.filter(o => isOverdue(o, today)).length, fittings: active.filter(o => o.fitting_date === today || (o.fitting_date > today && o.fitting_date <= new Date(Date.now()+7*86400000).toISOString().slice(0,10))).length, fittingReady: active.filter(o => o.status === 'Fitting Ready').length, readyPickup: active.filter(o => o.status === 'Ready for Pickup').length }, recent: orders.sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,6).map(serializeOrder) });
});

app.get('*', (req, res) => res.sendFile(join(__dirname, '..', 'public', 'index.html')));
const port = Number(process.env.PORT || 3000); app.listen(port, '0.0.0.0', () => console.log(`StitchFlow running on http://0.0.0.0:${port}`));
export { app };
