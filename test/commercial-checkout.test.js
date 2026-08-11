import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertPurchasableContest,
  checkoutPreference,
  selectCheckoutUrl,
  validateCheckoutRequest,
} from '../supabase/functions/commercial-checkout/core.js';
import {
  hmacSha256Hex,
  normalizePaymentStatus,
  signatureManifest,
  verifyMercadoPagoSignature,
} from '../supabase/functions/commercial-webhook/core.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('checkout valida entrada e deriva preço exclusivamente do concurso', () => {
  const input = validateCheckoutRequest({
    contestId: 'pc_al_2026', requestId: '11111111-1111-4111-8111-111111111111', amountCents: 1,
  });
  assert.deepEqual(input, { contestId: 'pc_al_2026', requestId: '11111111-1111-4111-8111-111111111111' });
  assert.throws(() => assertPurchasableContest({ content_status: 'ready', sales_status: 'available', price_cents: 0, currency: 'BRL' }), /PRICE/);
});

test('preferência usa URLs HTTPS fixas e referência interna do pedido', () => {
  const contest = assertPurchasableContest({
    id: 'pc_al_2026', name: 'PC AL', content_status: 'ready', sales_status: 'available', price_cents: 14990, currency: 'BRL',
  });
  const value = checkoutPreference({
    order: { id: 'order-id', amount_cents: 14990 }, contest, payerEmail: 'student@example.test',
    returnBaseUrl: 'https://staging.example/index.html', notificationUrl: 'https://project.supabase.co/functions/v1/commercial-webhook',
  });
  assert.equal(value.external_reference, 'order-id');
  assert.equal(value.items[0].unit_price, 149.9);
  assert.match(value.back_urls.success, /checkout=success/);
  assert.equal(selectCheckoutUrl({ sandbox_init_point: 'https://www.mercadopago.com.br/test' }, 'test'), 'https://www.mercadopago.com.br/test');
  assert.throws(() => selectCheckoutUrl({ sandbox_init_point: 'https://evil.example/test' }, 'test'), /CHECKOUT_URL_INVALID/);
});

test('webhook exige HMAC oficial e normaliza somente estados conhecidos', async () => {
  const secret = 'test-secret';
  const timestamp = '1704908010';
  const manifest = signatureManifest('999', 'request-1', timestamp);
  const signature = await hmacSha256Hex(secret, manifest);
  assert.equal(await verifyMercadoPagoSignature({
    xSignature: `ts=${timestamp},v1=${signature}`, xRequestId: 'request-1', dataId: '999', secret,
  }), true);
  assert.equal(normalizePaymentStatus('approved'), 'approved');
  assert.equal(normalizePaymentStatus('in_process'), 'pending');
  assert.equal(normalizePaymentStatus('refunded'), 'refunded');
});

test('migration mantém webhook privado, idempotente e entitlement server-side', async () => {
  const migration = await source('supabase/migrations/20260811193000_secure_commercial_checkout.sql');
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all on table public\.payment_webhook_events from public, anon, authenticated/i);
  assert.match(migration, /unique \(user_id, idempotency_key\)/i);
  assert.match(migration, /commerce_orders_provider_preference_uidx/i);
  assert.match(migration, /on conflict \(provider, event_id\) do nothing/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /mercado_pago_checkout/i);
  assert.match(migration, /revoke all on function public\.apply_verified_commerce_payment[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).*authenticated/i);
});

test('segredos do provedor não entram no runtime do navegador', async () => {
  const [runtime, env, checkout] = await Promise.all([
    source('app/scripts/generate-runtime-env.mjs'), source('app/js/config/env.js'), source('app/js/services/checkoutService.js'),
  ]);
  assert.doesNotMatch(runtime, /MERCADO_PAGO_ACCESS_TOKEN|MERCADO_PAGO_WEBHOOK_SECRET/);
  assert.doesNotMatch(env, /MERCADO_PAGO_ACCESS_TOKEN|MERCADO_PAGO_WEBHOOK_SECRET/);
  assert.doesNotMatch(checkout, /MERCADO_PAGO_ACCESS_TOKEN|MERCADO_PAGO_WEBHOOK_SECRET/);
});
