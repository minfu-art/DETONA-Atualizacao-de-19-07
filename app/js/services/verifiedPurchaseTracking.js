import { getSupabaseClient } from '../supabase/client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const memory = new Map();

export function purchaseEvent(order, { userId, orderId, contestId }) {
  if (!order || order.id !== orderId || order.user_id !== userId || order.contest_id !== contestId
    || order.provider !== 'mercado_pago' || order.status !== 'approved'
    || !order.provider_payment_id || !Number.isFinite(Date.parse(order.paid_at))
    || !Number.isSafeInteger(order.amount_cents) || order.amount_cents <= 0 || order.currency !== 'BRL') return null;
  return {
    eventId: `detona.purchase.${order.id}`,
    payload: { content_ids: [order.contest_id], content_type: 'product',
      value: order.amount_cents / 100, currency: order.currency, num_items: 1 },
  };
}

// Stores only checkout references. Prices and payment status always come from the server.
export class VerifiedPurchaseTracking {
  constructor({ getClient = getSupabaseClient, storage, now = Date.now, send } = {}) {
    this.getClient = getClient;
    this.storage = storage;
    this.now = now;
    this.send = send;
    this.inFlight = new Set();
  }

  key(userId) { return `detona.purchaseTracking.v1.${userId}`; }

  read(userId) {
    const key = this.key(userId);
    let saved;
    try { saved = this.storage?.getItem(key); } catch { /* Use the session fallback. */ }
    try { return JSON.parse(saved || memory.get(key) || 'null'); }
    catch { return null; }
  }

  write(userId, value) {
    const key = this.key(userId);
    const serialized = JSON.stringify(value);
    memory.set(key, serialized);
    try { this.storage?.setItem(key, serialized); } catch { /* Tracking must never block checkout. */ }
  }

  remember({ userId, contestId, orderId }) {
    if (!UUID.test(userId || '') || !UUID.test(orderId || '') || !contestId) return;
    const previous = this.read(userId);
    if (previous?.orderId === orderId) return;
    this.write(userId, { orderId, contestId, createdAt: this.now(), sent: false });
  }

  async check(userId) {
    if (!UUID.test(userId || '') || this.inFlight.has(userId) || typeof this.send !== 'function') return false;
    const pending = this.read(userId);
    if (!pending || pending.sent || !UUID.test(pending.orderId || '')
      || !Number.isFinite(pending.createdAt) || pending.createdAt > this.now()
      || this.now() - pending.createdAt > MAX_AGE) return false;
    this.inFlight.add(userId);
    try {
      const client = await this.getClient();
      if (!client) return false;
      // RLS also restricts this query to the signed-in owner. No service-role key.
      const { data, error } = await client.from('commerce_orders')
        .select('id,user_id,contest_id,provider,provider_payment_id,status,paid_at,amount_cents,currency')
        .eq('id', pending.orderId).eq('user_id', userId).maybeSingle();
      if (error) return false;
      const event = purchaseEvent(data, { userId, ...pending });
      if (!event || await this.send(event) !== true) return false;
      // A second purchase could have started while the first was being checked.
      if (this.read(userId)?.orderId === pending.orderId) this.write(userId, { ...pending, sent: true });
      return true;
    } catch { return false; }
    finally { this.inFlight.delete(userId); }
  }
}
