import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let server; let base; let dir; let cookie;
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(options.headers || {}) } });
  const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}
async function waitForServer() { for (let i = 0; i < 40; i += 1) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error('server did not start'); }

before(async () => { dir = await mkdtemp(join(tmpdir(), 'stitchflow-phase2-')); const port = 3400 + Math.floor(Math.random() * 200); base = `http://127.0.0.1:${port}`; server = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), STITCHFLOW_DB: join(dir, 'test.sqlite'), SESSION_SECRET: 'phase2-test-secret-with-more-than-32-chars' }, stdio: 'ignore' }); await waitForServer(); });
after(async () => { server?.kill(); await rm(dir, { recursive: true, force: true }); });

test('Phase 2 business workflow keeps backend authoritative', async () => {
  let result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'QA Operator', email: 'qa@example.test', password: 'correct-horse-battery', shopName: 'QA Tailors', phone: '9876543210' }) });
  assert.equal(result.response.status, 201);
  result = await request('/api/customers', { method: 'POST', body: JSON.stringify({ name: 'Anita Rao', phone: '9876543210' }) });
  const customerId = result.body.id;
  result = await request('/api/measurements', { method: 'POST', body: JSON.stringify({ customerId, garmentType: 'Blouse', unit: 'cm', values: { chest_bust: '92', waist: '78' } }) });
  const measurementId = result.body.id;
  result = await request('/api/orders', { method: 'POST', body: JSON.stringify({ customerId, measurementId, garmentType: 'Blouse', quantity: 1, dueDate: '2099-10-20', totalAmount: 1800 }) });
  const orderId = result.body.id;
  assert.equal(result.body.payment_summary.remaining, '1800.00');
  result = await request(`/api/orders/${orderId}/payments`, { method: 'POST', body: JSON.stringify({ amount: 500, method: 'UPI', transactionReference: 'upi-qa-1' }) });
  assert.equal(result.response.status, 201); assert.equal(result.body.summary.remaining, '1300.00');
  result = await request(`/api/orders/${orderId}/payments`, { method: 'POST', body: JSON.stringify({ amount: 1301, method: 'Cash' }) });
  assert.equal(result.response.status, 400);
  result = await request(`/api/orders/${orderId}/notifications`, { method: 'POST', body: JSON.stringify({ purpose: 'Fitting Ready' }) });
  assert.equal(result.response.status, 201); assert.match(result.body.whatsapp_url, /^https:\/\/wa\.me\/919876543210\?text=/); assert.equal(result.body.status, 'Prepared');
  result = await request(`/api/orders/${orderId}/notifications`, { method: 'POST', body: JSON.stringify({ purpose: 'Fitting Ready' }) });
  assert.equal(result.response.status, 409);
  result = await request('/api/exports/orders.csv');
  assert.equal(result.response.status, 200); assert.match(result.body, /Order ID,Reference/); assert.match(result.body, /Anita Rao/); assert.doesNotMatch(result.body, /password_hash/);
});

test('unauthenticated payment and export access is blocked', async () => {
  cookie = undefined;
  let result = await request('/api/orders/1/payments'); assert.equal(result.response.status, 401);
  result = await request('/api/exports/customers.csv'); assert.equal(result.response.status, 401);
});
