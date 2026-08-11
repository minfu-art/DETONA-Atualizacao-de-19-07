import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { normalizePaymentStatus, verifyMercadoPagoSignature } from './core.js';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || '';
const webhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') || '';
const mode = Deno.env.get('CHECKOUT_MODE') === 'production' ? 'production' : 'test';
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const response = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const sha256 = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' });
  if (!accessToken || !webhookSecret) return response(503, { error: 'WEBHOOK_NOT_CONFIGURED' });
  try {
    const requestUrl = new URL(request.url);
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) : {};
    const dataId = requestUrl.searchParams.get('data.id') || body?.data?.id;
    const requestId = request.headers.get('x-request-id') || '';
    const valid = await verifyMercadoPagoSignature({
      xSignature: request.headers.get('x-signature') || '',
      xRequestId: requestId,
      dataId,
      secret: webhookSecret,
    });
    if (!valid) return response(401, { error: 'INVALID_SIGNATURE' });
    if (body?.type !== 'payment') return response(200, { ignored: true });

    const providerResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(dataId))}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const payment = await providerResponse.json();
    if (!providerResponse.ok) throw new Error('PAYMENT_LOOKUP_FAILED');
    if ((mode === 'production') !== Boolean(payment.live_mode)) throw new Error('PAYMENT_ENVIRONMENT_MISMATCH');
    const orderId = String(payment.external_reference || '');
    const amountCents = Math.round(Number(payment.transaction_amount) * 100);
    const eventId = String(body.id || `${body.action || 'payment'}:${dataId}:${payment.date_last_updated || ''}`);
    const { data, error } = await admin.rpc('apply_verified_commerce_payment', {
      p_provider: 'mercado_pago',
      p_event_id: eventId,
      p_event_type: String(body.action || 'payment.updated'),
      p_order_id: orderId,
      p_provider_payment_id: String(payment.id),
      p_payment_status: normalizePaymentStatus(payment.status, payment.status_detail),
      p_amount_cents: amountCents,
      p_currency: String(payment.currency_id || ''),
      p_payload_sha256: await sha256(raw),
    });
    if (error) throw error;
    return response(200, { received: true, result: data?.[0] || null });
  } catch {
    return response(500, { error: 'WEBHOOK_PROCESSING_FAILED' });
  }
});
