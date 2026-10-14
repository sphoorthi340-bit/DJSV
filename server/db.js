import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const file = process.env.STITCHFLOW_DB || join(process.cwd(), 'data', 'stitchflow.sqlite');
mkdirSync(dirname(file), { recursive: true });
export const db = new Database(file);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'cm' CHECK (unit IN ('cm','in')), timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '', notes TEXT DEFAULT '', fit_preferences TEXT DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  garment_type TEXT NOT NULL, unit TEXT NOT NULL CHECK (unit IN ('cm','in')), values_json TEXT NOT NULL,
  notes TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id), reference TEXT NOT NULL UNIQUE, garment_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1, measurement_snapshot_json TEXT NOT NULL, instructions TEXT DEFAULT '',
  fabric_notes TEXT DEFAULT '', internal_notes TEXT DEFAULT '', total_amount REAL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR',
  created_at TEXT NOT NULL, due_date TEXT NOT NULL, fitting_date TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'New Order', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status TEXT, new_status TEXT NOT NULL, changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id), amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  method TEXT NOT NULL CHECK (method IN ('Cash','UPI','Bank transfer','Card','Other')),
  transaction_reference TEXT DEFAULT '', notes TEXT DEFAULT '', paid_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id), order_id INTEGER NOT NULL REFERENCES orders(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('Fitting Ready','Ready for Pickup')), destination_phone TEXT NOT NULL,
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Prepared' CHECK (status IN ('Prepared','Link Open Requested','Provider Accepted','Delivery Confirmed','Failed')),
  provider_reference TEXT DEFAULT '', failure_details TEXT DEFAULT '', created_at TEXT NOT NULL, last_action_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_shop_order ON payments(shop_id, order_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_notifications_shop_order ON notifications(shop_id, order_id, created_at);
`);

export const STATUSES = ['New Order','Measurements Taken','Cutting','Stitching','Fitting Ready','Alteration Required','Ready for Pickup','Delivered','Cancelled'];
export const GARMENTS = ['Shirt','Trousers','Kurta','Blouse','Dress','Other'];
export const PAYMENT_METHODS = ['Cash','UPI','Bank transfer','Card','Other'];
export const NOTIFICATION_PURPOSES = ['Fitting Ready','Ready for Pickup'];
export const now = () => new Date().toISOString();
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const orderIsComplete = (status) => ['Delivered','Cancelled'].includes(status);
export const isOverdue = (order, today = todayIST()) => !orderIsComplete(order.status) && order.due_date < today;
export const makeReference = () => `SF-${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year:'2-digit', month:'2-digit', day:'2-digit' }).format(new Date()).replaceAll('/','')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
export const parseJson = (value, fallback = {}) => { try { return JSON.parse(value); } catch { return fallback; } };
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const inr = (paise) => (Number(paise || 0) / 100).toFixed(2);
export const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, shopId: user.shop_id });
export const customerForShop = (id, shopId) => db.prepare('SELECT * FROM customers WHERE id=? AND shop_id=?').get(id, shopId);
export const orderForShop = (id, shopId) => db.prepare(`SELECT o.*, c.name customer_name, c.phone customer_phone, c.email customer_email, s.name shop_name, s.phone shop_phone, s.address shop_address FROM orders o JOIN customers c ON c.id=o.customer_id JOIN shops s ON s.id=o.shop_id WHERE o.id=? AND o.shop_id=?`).get(id, shopId);
export const serializeMeasurement = (row) => row ? { ...row, values: parseJson(row.values_json) } : null;
export const paymentRows = (orderId, shopId) => db.prepare('SELECT * FROM payments WHERE order_id=? AND shop_id=? ORDER BY paid_at DESC, id DESC').all(orderId, shopId);
export const paymentSummary = (order, shopId) => { const totalPaise = toPaise(order.total_amount); const paidPaise = db.prepare('SELECT COALESCE(SUM(amount_paise),0) paid FROM payments WHERE order_id=? AND shop_id=?').get(order.id, shopId).paid; return { totalPaise, paidPaise, remainingPaise: totalPaise - paidPaise, total: inr(totalPaise), paid: inr(paidPaise), remaining: inr(totalPaise - paidPaise), state: paidPaise >= totalPaise && totalPaise > 0 ? 'Paid' : paidPaise > 0 ? 'Partially paid' : 'Unpaid' }; };
export const serializeOrder = (row, shopId = row?.shop_id) => row ? { ...row, measurement_snapshot: parseJson(row.measurement_snapshot_json), overdue: isOverdue(row), payment_summary: paymentSummary(row, shopId) } : null;
