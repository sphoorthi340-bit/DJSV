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
  assert.equal(result.response.status, 201, JSON.stringify(result.body)); assert.equal(result.body.summary.remaining, '1300.00');
  result = await request(`/api/orders/${orderId}/payments`, { method: 'POST', body: JSON.stringify({ amount: 1301, method: 'Cash' }) });
  assert.equal(result.response.status, 400);
  result = await request(`/api/orders/${orderId}/notifications`, { method: 'POST', body: JSON.stringify({ purpose: 'Fitting Ready' }) });
  assert.equal(result.response.status, 409);
  await request(`/api/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Fitting Ready' }) });
  result = await request(`/api/orders/${orderId}/notifications`, { method: 'POST', body: JSON.stringify({ purpose: 'Fitting Ready' }) });
  assert.equal(result.response.status, 201); assert.match(result.body.whatsapp_url, /^https:\/\/wa\.me\/919876543210\?text=/); assert.equal(result.body.status, 'Prepared');
  result = await request(`/api/orders/${orderId}/notifications`, { method: 'POST', body: JSON.stringify({ purpose: 'Fitting Ready' }) });
  assert.equal(result.response.status, 409); assert.ok(result.body.existing?.whatsapp_url);
  result = await request('/api/exports/orders.csv');
  assert.equal(result.response.status, 200); assert.match(result.body, /Order ID,Reference/); assert.match(result.body, /Anita Rao/); assert.doesNotMatch(result.body, /password_hash/);
});

test('unauthenticated payment and export access is blocked', async () => {
  cookie = undefined;
  let result = await request('/api/orders/1/payments'); assert.equal(result.response.status, 401);
  result=await request('/api/auth/login',{method:'POST',headers:{origin:'https://attacker.example'},body:JSON.stringify({email:'x@example.test',password:'bad'})});assert.equal(result.response.status,403);
  result = await request('/api/exports/customers.csv'); assert.equal(result.response.status, 401);
});


test('calendar dates, decimal precision, garment matching, and server filters are enforced', async () => {
  cookie=undefined; await request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Other QA',email:'other@example.test',password:'correct-horse-battery',shopName:'Other Shop',phone:'9876543212'})});
  let r = await request('/api/customers', { method:'POST', body:JSON.stringify({name:'=HYPERLINK(\"https://evil.test\")',phone:'9876543211'}) });
  const customerId=r.body.id;
  r = await request('/api/measurements', {method:'POST',body:JSON.stringify({customerId,garmentType:'Blouse',unit:'cm',values:{'bust <b>':'91'}})});
  const measurementId=r.body.id;
  r=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId,measurementId,garmentType:'Shirt',quantity:1,dueDate:'2099-02-30',totalAmount:'12.34'})}); assert.equal(r.response.status,400);
  r=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId,measurementId,garmentType:'Blouse',quantity:1,dueDate:'2099-02-28',fittingDate:'2026-02-29',totalAmount:'12.34'})}); assert.equal(r.response.status,400);
  r=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId,measurementId,garmentType:'Blouse',quantity:1,dueDate:'2099-02-28',totalAmount:'12.345'})}); assert.equal(r.response.status,400);
  r=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId,measurementId,garmentType:'Blouse',quantity:1,dueDate:'2099-02-28',fittingDate:'2028-02-29',totalAmount:'12.34'})}); assert.equal(r.response.status,201);
  const orderId=r.body.id;
  r=await request(`/api/orders/${orderId}/payments`,{method:'POST',body:JSON.stringify({amount:'0.001',method:'Cash'})}); assert.equal(r.response.status,400);
  r=await request(`/api/orders/${orderId}/payments`,{method:'POST',body:JSON.stringify({amount:'0.10',method:'Cash',paidAt:'2026-02-30'})}); assert.equal(r.response.status,400);
  r=await request(`/api/orders/${orderId}/payments`,{method:'POST',body:JSON.stringify({amount:'0.10',method:'Cash'})}); assert.equal(r.response.status,201); assert.equal(r.body.payment.amount_paise,10);
  r=await request(`/api/orders?status=bogus`); assert.equal(r.response.status,400);
  r=await request(`/api/orders/${orderId}/notifications`,{method:'POST',body:JSON.stringify({purpose:'Ready for Pickup'})}); assert.equal(r.response.status,409);
  const other=await request('/api/customers',{method:'POST',body:JSON.stringify({name:'Second customer',phone:'9876500013'})});
  r=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId:other.body.id,measurementId,garmentType:'Blouse',quantity:1,dueDate:'2099-03-01',totalAmount:'1.00'})}); assert.equal(r.response.status,400,'cross-customer measurement is rejected');
  const today=(await request('/api/health')).body.today;const previous=new Date(`${today}T00:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);const yesterday=previous.toISOString().slice(0,10);
  const dueOrder=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId,measurementId,garmentType:'Blouse',quantity:1,dueDate:today,totalAmount:'12.34'})});assert.equal(dueOrder.response.status,201);
  const lateOrder=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId,measurementId,garmentType:'Blouse',quantity:1,dueDate:yesterday,totalAmount:'12.34'})});assert.equal(lateOrder.response.status,201);
  r=await request('/api/orders?due=today&search=HYPERLINK');assert.ok(r.body.some(o=>o.id===dueOrder.body.id));assert.ok(!r.body.some(o=>o.id===lateOrder.body.id));
  r=await request('/api/orders?overdue=1');assert.ok(r.body.some(o=>o.id===lateOrder.body.id));
  await request(`/api/orders/${lateOrder.body.id}/status`,{method:'PATCH',body:JSON.stringify({status:'Delivered'})});r=await request('/api/orders?overdue=1');assert.ok(!r.body.some(o=>o.id===lateOrder.body.id));
  const concurrent=await request('/api/orders',{method:'POST',body:JSON.stringify({customerId,measurementId,garmentType:'Blouse',quantity:1,dueDate:'2099-04-01',totalAmount:'10.00'})});const concurrentId=concurrent.body.id;
  const results=await Promise.all([request(`/api/orders/${concurrentId}/payments`,{method:'POST',body:JSON.stringify({amount:'7.00',method:'Cash'})}),request(`/api/orders/${concurrentId}/payments`,{method:'POST',body:JSON.stringify({amount:'7.00',method:'UPI'})})]);assert.deepEqual(results.map(x=>x.response.status).sort(),[201,400]);
  r=await request('/api/exports/customers.csv'); assert.match(r.body,/Customer ID,Name/); assert.match(r.body,/'=HYPERLINK/);
  cookie=undefined;await request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Second Shop',email:'second@example.test',password:'correct-horse-battery',shopName:'Second Shop Tailoring',phone:'9876500099'})});
  r=await request(`/api/orders/${concurrentId}`);assert.equal(r.response.status,404);
  r=await request(`/api/orders/${concurrentId}/payments`);assert.equal(r.response.status,404);
  r=await request(`/api/orders/${concurrentId}/notifications`);assert.equal(r.response.status,404);
  r=await request('/api/exports/customers.csv');assert.doesNotMatch(r.body,/HYPERLINK|Second customer/);
  r=await request('/api/exports/orders.csv');assert.doesNotMatch(r.body,/SF-/);
  r=await request('/api/exports/payments.csv');assert.doesNotMatch(r.body,/QA Operator|Meera/);
});
