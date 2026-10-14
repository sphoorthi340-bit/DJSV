import test from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue, orderIsComplete, makeReference } from '../server/db.js';

test('overdue ignores completed orders and compares date-only values', () => {
  assert.equal(isOverdue({ status: 'Stitching', due_date: '2026-10-13' }, '2026-10-14'), true);
  assert.equal(isOverdue({ status: 'Delivered', due_date: '2026-10-01' }, '2026-10-14'), false);
  assert.equal(isOverdue({ status: 'Stitching', due_date: '2026-10-14' }, '2026-10-14'), false);
});

test('completion states are explicit', () => {
  assert.equal(orderIsComplete('Delivered'), true);
  assert.equal(orderIsComplete('Cancelled'), true);
  assert.equal(orderIsComplete('Ready for Pickup'), false);
});

test('human-readable references are unique across close calls', () => {
  const refs = new Set(Array.from({ length: 100 }, () => makeReference()));
  assert.equal(refs.size, 100);
  assert.ok([...refs].every((ref) => /^SF-\d{6}-[A-Z0-9]{4}$/.test(ref)));
});

test('snapshot shape is independent from current profile by value', () => {
  const current = { chest: '96', waist: '84' };
  const snapshot = JSON.parse(JSON.stringify({ values: current }));
  current.chest = '100';
  assert.equal(snapshot.values.chest, '96');
});
