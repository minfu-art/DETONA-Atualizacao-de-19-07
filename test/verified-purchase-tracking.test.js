import test from 'node:test';
import assert from 'node:assert/strict';
import { VerifiedPurchaseTracking, purchaseEvent } from '../app/js/services/verifiedPurchaseTracking.js';

const userId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const contestId = 'pm_pe_2027';
const context = { userId, orderId, contestId };
const approved = { id: orderId, user_id: userId, contest_id: contestId, provider: 'mercado_pago',
  provider_payment_id: '123456', status: 'approved', paid_at: '2026-10-23T15:00:00Z', amount_cents: 2490, currency: 'BRL' };

function setup({ order = approved, error = null, send = async () => true, storage } = {}) {
  const values = new Map();
  const calls = [];
  const filters = [];
  const store = storage || { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  // Reset the known pending reference as a new checkout would.
  store.setItem?.(`detona.purchaseTracking.v1.${userId}`, JSON.stringify({ orderId, contestId, createdAt: 1000, sent: false }));
  const query = { select(fields) { calls.push(fields); return this; },
    eq(key, value) { filters.push([key, value]); return this; }, async maybeSingle() { return { data: order, error }; } };
  const getClient = async () => ({ from(table) { assert.equal(table, 'commerce_orders'); return query; } });
  return { tracking: new VerifiedPurchaseTracking({ getClient, storage: store, now: () => 1000, send }),
    store, getClient, calls, filters };
}

test('only a canonical approved payment can produce Purchase, using the server price', () => {
  assert.deepEqual(purchaseEvent(approved, context), { eventId: `detona.purchase.${orderId}`,
    payload: { content_ids: [contestId], content_type: 'product', value: 24.9, currency: 'BRL', num_items: 1 } });
  for (const change of [{ status: 'pending' }, { status: 'cancelled' }, { status: 'refunded' },
    { status: 'rejected' }, { status: 'charged_back' }, { user_id: 'other-user' }, { id: 'other-order' },
    { contest_id: 'other-course' }, { provider: 'local_demo' }, { paid_at: null },
    { provider_payment_id: null }, { amount_cents: -1 }, { amount_cents: 24.9 }, { currency: 'USD' }]) {
    assert.equal(purchaseEvent({ ...approved, ...change }, context), null, JSON.stringify(change));
  }
});

test('server confirmation, owner filter, concurrent refresh and reload produce one event', async () => {
  const events = [];
  const { tracking, store, getClient, filters } = setup({ send: async (e) => { events.push(e); return true; } });
  await Promise.all([tracking.check(userId), tracking.check(userId)]);
  tracking.remember(context); // Recovering the same pending checkout must not reset its sent marker.
  const reloaded = new VerifiedPurchaseTracking({ getClient, storage: store, now: () => 1000,
    send: async (e) => { events.push(e); return true; } });
  assert.equal(await reloaded.check(userId), false);
  assert.equal(events.length, 1);
  assert.deepEqual(filters, [['id', orderId], ['user_id', userId]]);
  assert.equal('user_id' in events[0].payload, false);
});

test('pending payment and database failure do not emit or mark a purchase', async () => {
  for (const config of [{ order: { ...approved, status: 'pending' } }, { error: new Error('offline') }, { order: null }]) {
    let sends = 0;
    const { tracking, store } = setup({ ...config, send: async () => { sends++; return true; } });
    assert.equal(await tracking.check(userId), false);
    assert.equal(sends, 0);
    assert.equal(JSON.parse(store.getItem(tracking.key(userId))).sent, false);
  }
});

test('a blocked/unavailable Pixel does not block purchase and can be retried', async () => {
  let attempts = 0;
  const { tracking } = setup({ send: async () => { attempts++; if (attempts === 1) throw new Error('blocked'); return attempts > 2; } });
  assert.equal(await tracking.check(userId), false);
  assert.equal(await tracking.check(userId), false);
  assert.equal(await tracking.check(userId), true);
  assert.equal(await tracking.check(userId), false);
});

test('old checkout references and malformed references do not query or send', async () => {
  const { tracking, store, calls } = setup();
  for (const pending of [{ ...context, createdAt: -8 * 86400000 }, { ...context, orderId: 'forged', createdAt: 1000 }]) {
    store.setItem(tracking.key(userId), JSON.stringify(pending));
    assert.equal(await tracking.check(userId), false);
  }
  assert.equal(calls.length, 0);
});
