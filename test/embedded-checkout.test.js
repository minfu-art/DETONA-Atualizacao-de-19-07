import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { MercadoPagoEmbeddedCheckout } from '../app/js/services/mercadoPagoEmbeddedCheckout.js';
import {
  paymentPayload,
  publicPaymentResult,
  validateEmbeddedPaymentRequest,
} from '../supabase/functions/commercial-payment/core.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const orderId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';

test('Pix incorporado ignora preço e email enviados pelo navegador', () => {
  const request = validateEmbeddedPaymentRequest({
    orderId,
    contestId: 'pc_pe_2026',
    requestId,
    selectedPaymentMethod: 'bank_transfer',
    formData: {
      payment_method_id: 'pix',
      transaction_amount: 0.01,
      payer: { email: 'invasor@example.test', identification: { type: 'CPF', number: '123.456.789-00' } },
    },
  });
  const payload = paymentPayload({
    request,
    order: { id: orderId, amount_cents: 2490, currency: 'BRL' },
    contest: { id: 'pc_pe_2026', name: 'PC PE 2027' },
    payerEmail: 'aluno@example.test',
    notificationUrl: 'https://project.supabase.co/functions/v1/commercial-webhook',
  });
  assert.equal(payload.transaction_amount, 24.9);
  assert.equal(payload.payer.email, 'aluno@example.test');
  assert.equal(payload.payment_method_id, 'pix');
  assert.equal(payload.external_reference, orderId);
  assert.equal(new URL(payload.notification_url).searchParams.get('source_news'), 'webhooks');
});

test('cartão exige token e carteira Mercado Pago não é aceita', () => {
  assert.throws(() => validateEmbeddedPaymentRequest({
    orderId, contestId: 'pc_pe_2026', requestId, selectedPaymentMethod: 'mercado_pago',
    formData: { payment_method_id: 'account_money', payer: { identification: { type: 'CPF', number: '12345678900' } } },
  }), /PAYMENT_METHOD_NOT_ALLOWED/);
  assert.throws(() => validateEmbeddedPaymentRequest({
    orderId, contestId: 'pc_pe_2026', requestId, selectedPaymentMethod: 'credit_card',
    formData: { payment_method_id: 'visa', installments: 1, payer: { identification: { type: 'CPF', number: '12345678900' } } },
  }), /INVALID_CARD_TOKEN/);
});

test('resposta pública não devolve token, documento nem payload bruto', () => {
  const result = publicPaymentResult({
    id: 123,
    status: 'pending',
    payment_method_id: 'pix',
    token: 'segredo',
    payer: { identification: { number: '12345678900' } },
    point_of_interaction: { transaction_data: { qr_code: 'pix-code', qr_code_base64: 'YWJj' } },
  });
  assert.equal(result.pix.code, 'pix-code');
  assert.doesNotMatch(JSON.stringify(result), /segredo|12345678900/);
});

test('Payment Brick mostra somente cartão e Pix e envia uma cobrança idempotente', async () => {
  let settings;
  let invocation;
  class FakeMercadoPago {
    bricks() {
      return { create: async (_type, _container, value) => {
        settings = value;
        return { unmount: async () => {} };
      } };
    }
  }
  const checkout = new MercadoPagoEmbeddedCheckout({
    publicKey: 'TEST-public-key',
    experience: 'embedded',
    mercadoPagoFactory: FakeMercadoPago,
    idFactory: () => requestId,
    getClient: async () => ({ functions: { invoke: async (name, options) => {
      invocation = { name, options };
      return { data: { payment: { id: '77', status: 'pending', paymentMethodId: 'pix', pix: { code: 'abc' } } } };
    } } }),
  });
  await checkout.mount({
    containerId: 'payment',
    checkout: { id: orderId, amountCents: 2490, currency: 'BRL', payerEmail: 'aluno@example.test' },
    contestId: 'pc_pe_2026',
  });
  assert.deepEqual(settings.customization.paymentMethods, {
    creditCard: 'all', debitCard: 'all', prepaidCard: 'all', bankTransfer: 'all',
  });
  assert.equal('mercadoPago' in settings.customization.paymentMethods, false);
  await settings.callbacks.onSubmit({
    selectedPaymentMethod: 'bank_transfer',
    formData: { payment_method_id: 'pix', payer: { identification: { type: 'CPF', number: '12345678900' } } },
  });
  assert.equal(invocation.name, 'commercial-payment');
  assert.equal(invocation.options.body.requestId, requestId);
  assert.equal(invocation.options.body.orderId, orderId);
});

test('feature flag mantém redirect como padrão e entitlement continua no webhook', async () => {
  const [runtime, checkout, payment, webhook, migration, ui] = await Promise.all([
    source('app/scripts/generate-runtime-env.mjs'),
    source('supabase/functions/commercial-checkout/index.ts'),
    source('supabase/functions/commercial-payment/index.ts'),
    source('supabase/functions/commercial-webhook/index.ts'),
    source('supabase/migrations/20260906100000_embedded_checkout_payment_claim.sql'),
    source('app/js/ui/library.js'),
  ]);
  assert.match(runtime, /CHECKOUT_EXPERIENCE \|\| 'redirect'/);
  assert.match(checkout, /body\.experience === 'embedded' && embeddedCheckoutOrigins\.has\(origin\)/);
  assert.match(payment, /embeddedCheckoutOrigins\.has\(origin\)/);
  assert.match(payment, /x-idempotency-key': input\.requestId/);
  assert.doesNotMatch(payment, /apply_verified_commerce_payment/);
  assert.match(webhook, /apply_verified_commerce_payment/);
  assert.match(migration, /revoke all on function public\.claim_commerce_payment_attempt[\s\S]*from public, anon, authenticated/);
  assert.match(ui, /embeddedCheckout \? null : reserveCheckoutBrowserWindow\(\)/);
});
