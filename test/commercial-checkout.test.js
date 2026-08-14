import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertPurchasableContest,
  checkoutPreference,
  resolveReservedCheckout,
  selectCheckoutUrl,
  validateCheckoutRequest,
} from '../supabase/functions/commercial-checkout/core.js';
import {
  hmacSha256Hex,
  normalizePaymentStatus,
  parseMercadoPagoNotification,
  paymentIdsFromMerchantOrder,
  resolveMerchantOrderPayments,
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
  assert.equal(new URL(value.notification_url).searchParams.get('source_news'), 'webhooks');
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
  await assert.rejects(() => verifyMercadoPagoSignature({
    xSignature: '', xRequestId: 'request-1', dataId: '999', secret,
  }), /INVALID_SIGNATURE/);
});

test('webhook distingue payment moderno de merchant_order legado e rejeita IDs inválidos', () => {
  assert.deepEqual(parseMercadoPagoNotification({
    requestUrl: 'https://project.supabase.co/functions/v1/commercial-webhook?data.id=123',
    body: { type: 'payment' },
  }), { kind: 'payment', dataId: '123' });
  assert.deepEqual(parseMercadoPagoNotification({
    requestUrl: 'https://project.supabase.co/functions/v1/commercial-webhook?id=456&topic=merchant_order',
    body: {},
  }), { kind: 'merchant_order', merchantOrderId: '456' });
  assert.deepEqual(parseMercadoPagoNotification({
    requestUrl: 'https://project.supabase.co/functions/v1/commercial-webhook',
    body: { type: 'unknown' },
  }), { kind: 'ignored' });
  assert.throws(() => parseMercadoPagoNotification({
    requestUrl: 'https://project.supabase.co/functions/v1/commercial-webhook?id=456x&topic=merchant_order',
    body: {},
  }), /INVALID_NOTIFICATION_ID/);
  assert.throws(() => parseMercadoPagoNotification({
    requestUrl: 'https://project.supabase.co/functions/v1/commercial-webhook?data.id=../123',
    body: { type: 'payment' },
  }), /INVALID_NOTIFICATION_ID/);
});

test('merchant_order filtra pagamentos e consulta cada pagamento canônico antes da RPC', async () => {
  assert.deepEqual(paymentIdsFromMerchantOrder({
    payments: [{ id: 11 }, { id: '11' }, { id: '12' }, { id: 'invalid' }, null],
  }), ['11', '12']);

  const calls = [];
  const payments = await resolveMerchantOrderPayments('43630046030', {
    fetchMerchantOrder: async (id) => {
      calls.push(`merchant_order:${id}`);
      return { id, external_reference: 'must-not-be-used', payments: [{ id: 11 }, { id: '11' }, { id: 12 }] };
    },
    fetchPayment: async (id) => {
      calls.push(`payment:${id}`);
      return { id, external_reference: `canonical-order-${id}` };
    },
  });

  assert.deepEqual(calls, ['merchant_order:43630046030', 'payment:11', 'payment:12']);
  assert.deepEqual(payments.map((payment) => payment.external_reference), ['canonical-order-11', 'canonical-order-12']);
});

test('merchant_order sem pagamentos termina sem consultar payment', async () => {
  let paymentLookups = 0;
  const payments = await resolveMerchantOrderPayments('43630046030', {
    fetchMerchantOrder: async () => ({ payments: [] }),
    fetchPayment: async () => { paymentLookups += 1; },
  });
  assert.deepEqual(payments, []);
  assert.equal(paymentLookups, 0);
});

test('caminho legado usa external_reference do pagamento e evento idempotente', async () => {
  const webhook = await source('supabase/functions/commercial-webhook/index.ts');
  assert.match(webhook, /p_order_id:\s*orderId/);
  assert.match(webhook, /const orderId = String\(payment\.external_reference \|\| ''\)/);
  assert.doesNotMatch(webhook, /p_order_id:\s*notification\.merchantOrderId/);
  assert.match(webhook, /merchant_order:\$\{notification\.merchantOrderId\}:payment:\$\{String\(payment\.id\)\}/);
});

test('duas solicitações simultâneas reutilizam um pedido e criam uma preferência', async () => {
  const activeOrder = {
    id: 'order-shared', status: 'pending', checkout_url: null,
  };
  let reservationCount = 0;
  let preferenceCount = 0;
  const requestIds = ['request-concurrent-a', 'request-concurrent-b'];
  const reservedRequestIds = [];
  const reserve = async (requestId) => {
    reservedRequestIds.push(requestId);
    return ({
    order: { ...activeOrder },
    preferenceClaimed: reservationCount++ === 0,
    });
  };
  const execute = async (requestId) => resolveReservedCheckout(await reserve(requestId), {
    pollAttempts: 20,
    pollIntervalMs: 1,
    wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    readOrder: async () => ({ ...activeOrder }),
    createPreference: async () => {
      preferenceCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { id: 'preference-shared', redirectUrl: 'https://www.mercadopago.com.br/shared', expiresAt: null };
    },
    savePreference: async (_orderId, preference) => {
      activeOrder.checkout_url = preference.redirectUrl;
    },
    releaseClaim: async () => {},
  });

  const [first, second] = await Promise.all(requestIds.map(execute));
  assert.equal(first.id, 'order-shared');
  assert.equal(second.id, 'order-shared');
  assert.equal(first.redirectUrl, second.redirectUrl);
  assert.equal(preferenceCount, 1);
  assert.deepEqual(reservedRequestIds.sort(), requestIds);
});

test('checkout antigo com URL e sem expiração explícita continua sendo reutilizado', async () => {
  let preferenceCount = 0;
  const result = await resolveReservedCheckout({
    order: {
      id: 'order-existing',
      status: 'pending',
      checkout_url: 'https://www.mercadopago.com.br/existing',
      provider_preference_id: 'preference-existing',
      expires_at: null,
      created_at: '2020-01-01T00:00:00.000Z',
    },
    preferenceClaimed: false,
  }, {
    createPreference: async () => {
      preferenceCount += 1;
      throw new Error('UNEXPECTED_PROVIDER_CALL');
    },
    readOrder: async () => { throw new Error('UNEXPECTED_ORDER_POLL'); },
    savePreference: async () => {},
    releaseClaim: async () => {},
  });

  assert.equal(result.id, 'order-existing');
  assert.equal(result.redirectUrl, 'https://www.mercadopago.com.br/existing');
  assert.equal(preferenceCount, 0);
});

test('migration separa reserva stale de checkout criado e respeita expires_at', async () => {
  const migration = await source('supabase/migrations/20260811193000_secure_commercial_checkout.sql');
  const expiryRule = migration.match(/update public\.commerce_orders orders[\s\S]*?where orders\.user_id = p_user_id[\s\S]*?\n\s*\);/i)?.[0] || '';

  assert.match(expiryRule, /expires_at is not null and orders\.expires_at <= now\(\)/i);
  assert.match(expiryRule, /expires_at is null[\s\S]*checkout_url is null[\s\S]*provider_preference_id is null[\s\S]*created_at < now\(\) - interval '5 minutes'/i);
  assert.doesNotMatch(expiryRule, /expires_at is null\s+and orders\.created_at/i);
});

test('matriz de validade cobre reserva abandonada, preferência ativa e expiração explícita', () => {
  const now = Date.parse('2026-08-11T12:00:00.000Z');
  const isExpired = (order) => order.status === 'pending' && (
    (order.expires_at != null && Date.parse(order.expires_at) <= now)
    || (
      order.expires_at == null
      && order.checkout_url == null
      && order.provider_preference_id == null
      && Date.parse(order.created_at) < now - (5 * 60 * 1000)
    )
  );
  const old = '2026-08-11T11:54:59.000Z';

  assert.equal(isExpired({ status: 'pending', created_at: old, checkout_url: null, provider_preference_id: null, expires_at: null }), true);
  assert.equal(isExpired({ status: 'pending', created_at: old, checkout_url: 'https://www.mercadopago.com.br/active', provider_preference_id: null, expires_at: null }), false);
  assert.equal(isExpired({ status: 'pending', created_at: old, checkout_url: null, provider_preference_id: 'preference-active', expires_at: null }), false);
  assert.equal(isExpired({ status: 'pending', created_at: old, checkout_url: 'https://www.mercadopago.com.br/active', provider_preference_id: 'preference-active', expires_at: '2026-08-11T12:01:00.000Z' }), false);
  assert.equal(isExpired({ status: 'pending', created_at: old, checkout_url: 'https://www.mercadopago.com.br/expired', provider_preference_id: 'preference-expired', expires_at: '2026-08-11T11:59:59.000Z' }), true);
});

test('migration mantém webhook privado, idempotente e entitlement server-side', async () => {
  const migration = await source('supabase/migrations/20260811193000_secure_commercial_checkout.sql');
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all on table public\.payment_webhook_events from public, anon, authenticated/i);
  assert.match(migration, /unique \(user_id, idempotency_key\)/i);
  assert.match(migration, /commerce_orders_provider_preference_uidx/i);
  assert.match(migration, /commerce_orders_one_pending_per_contest_uidx[\s\S]*where status = 'pending'/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /preference_claim_token/i);
  assert.match(migration, /now\(\) - interval '5 minutes'/i);
  assert.match(migration, /reserve_commerce_order[\s\S]*to service_role/i);
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
