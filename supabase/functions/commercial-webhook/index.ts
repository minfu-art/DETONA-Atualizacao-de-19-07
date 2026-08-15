import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  normalizePaymentStatus,
  parseMercadoPagoNotification,
  paymentMatchesCheckoutMode,
  resolveMerchantOrderPayments,
  verifyMercadoPagoSignatures,
  webhookErrorCode,
} from './core.js';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || '';
const legacyWebhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') || '';
const webhookSecrets = [
  Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET_TEST') || legacyWebhookSecret,
  Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET_PRODUCTION') || legacyWebhookSecret,
].filter(Boolean);
const mode = Deno.env.get('CHECKOUT_MODE') === 'production' ? 'production' : 'test';
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const response = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const sha256 = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

const providerJson = async (path: string, failureCode: string) => {
  const providerResponse = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await providerResponse.json();
  if (!providerResponse.ok) throw new Error(failureCode);
  return payload;
};

const applyPayment = async (payment: Record<string, unknown>, event: {
  id: string;
  type: string;
  payloadSha256: string;
}) => {
  if (!paymentMatchesCheckoutMode(payment, mode)) throw new Error('PAYMENT_ENVIRONMENT_MISMATCH');
  const orderId = String(payment.external_reference || '');
  const amountCents = Math.round(Number(payment.transaction_amount) * 100);
  const { data, error } = await admin.rpc('apply_verified_commerce_payment', {
    p_provider: 'mercado_pago',
    p_event_id: event.id,
    p_event_type: event.type,
    p_order_id: orderId,
    p_provider_payment_id: String(payment.id),
    p_payment_status: normalizePaymentStatus(payment.status, payment.status_detail),
    p_amount_cents: amountCents,
    p_currency: String(payment.currency_id || ''),
    p_payload_sha256: event.payloadSha256,
  });
  if (error) throw new Error('PAYMENT_RPC_FAILED');
  return data?.[0] || null;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' });
  if (!accessToken || webhookSecrets.length === 0) return response(503, { error: 'WEBHOOK_NOT_CONFIGURED' });
  try {
    const requestUrl = new URL(request.url);
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) : {};
    const notification = parseMercadoPagoNotification({ requestUrl, body });
    if (notification.kind === 'ignored') return response(200, { ignored: true });
    const payloadSha256 = await sha256(raw);

    if (notification.kind === 'payment') {
      const requestId = request.headers.get('x-request-id') || '';
      const valid = await verifyMercadoPagoSignatures({
        xSignature: request.headers.get('x-signature') || '',
        xRequestId: requestId,
        dataId: notification.dataId,
        secrets: webhookSecrets,
      });
      if (!valid) return response(401, { error: 'INVALID_SIGNATURE' });

      const payment = await providerJson(
        `/v1/payments/${encodeURIComponent(notification.dataId)}`,
        'PAYMENT_LOOKUP_FAILED',
      );
      const result = await applyPayment(payment, {
        id: String(body.id || `${body.action || 'payment'}:${notification.dataId}:${payment.date_last_updated || ''}`),
        type: String(body.action || 'payment.updated'),
        payloadSha256,
      });
      return response(200, { received: true, result });
    }

    // Legacy IPN is only a lookup hint. Access is based exclusively on canonical,
    // authenticated payment responses fetched below, never on merchant_order fields.
    const payments = await resolveMerchantOrderPayments(notification.merchantOrderId, {
      fetchMerchantOrder: (merchantOrderId: string) => providerJson(
        `/merchant_orders/${encodeURIComponent(merchantOrderId)}`,
        'MERCHANT_ORDER_LOOKUP_FAILED',
      ),
      fetchPayment: (paymentId: string) => providerJson(
        `/v1/payments/${encodeURIComponent(paymentId)}`,
        'PAYMENT_LOOKUP_FAILED',
      ),
    });
    const results = [];
    for (const payment of payments) {
      results.push(await applyPayment(payment, {
        id: `merchant_order:${notification.merchantOrderId}:payment:${String(payment.id)}:${String(payment.date_last_updated || '')}`,
        type: 'merchant_order.payment.updated',
        payloadSha256,
      }));
    }
    return response(200, { received: true, payments: payments.length, results });
  } catch (error) {
    console.error('commercial-webhook', webhookErrorCode(error));
    return response(500, { error: 'WEBHOOK_PROCESSING_FAILED' });
  }
});
