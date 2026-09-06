import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createAllowedOrigins, handleCorsPreflight, isAllowedOrigin, jsonResponse } from '../_shared/cors.js';
import {
  paymentPayload,
  publicPaymentResult,
  validateEmbeddedPaymentRequest,
} from './core.js';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// O Checkout Transparente permanece em homologação e usa uma credencial de
// teste separada. A credencial de produção nunca é usada por esta função.
const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN_TEST') || '';
const notificationUrl = Deno.env.get('CHECKOUT_WEBHOOK_URL') || '';
const allowedOrigins = createAllowedOrigins(Deno.env.get('STUDENT_ALLOWED_ORIGINS'));
const embeddedCheckoutOrigins = createAllowedOrigins(Deno.env.get('EMBEDDED_CHECKOUT_ALLOWED_ORIGINS'));
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const respond = (status: number, payload: unknown, origin = '') => jsonResponse(status, payload, origin, allowedOrigins);

const providerPayment = async (paymentId: string) => {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error('PAYMENT_LOOKUP_FAILED');
  return payload;
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const preflight = handleCorsPreflight(request, allowedOrigins);
  if (preflight) return preflight;
  let claimedOrderId = '';
  let claimToken = '';
  let preserveClaim = false;
  try {
    if (!isAllowedOrigin(origin, allowedOrigins)) return respond(403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (request.method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' }, origin);
    if (!embeddedCheckoutOrigins.has(origin) || !accessToken || !notificationUrl) {
      return respond(503, { error: 'EMBEDDED_CHECKOUT_NOT_CONFIGURED' }, origin);
    }
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return respond(401, { error: 'INVALID_SESSION' }, origin);
    const identity = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await identity.auth.getUser();
    if (authError || !auth.user) return respond(401, { error: 'INVALID_SESSION' }, origin);
    const input = validateEmbeddedPaymentRequest(await request.json());

    const claim = await admin.rpc('claim_commerce_payment_attempt', {
      p_order_id: input.orderId,
      p_user_id: auth.user.id,
      p_request_id: input.requestId,
    });
    if (claim.error) {
      if (String(claim.error.message || '').includes('commerce_order_not_found')) {
        return respond(404, { error: 'ORDER_NOT_FOUND' }, origin);
      }
      throw claim.error;
    }
    const order = claim.data?.order;
    if (!order || order.contest_id !== input.contestId) {
      return respond(409, { error: 'ORDER_CONTEXT_MISMATCH' }, origin);
    }
    if (order.status !== 'pending') return respond(409, { error: 'ORDER_NOT_PENDING' }, origin);
    if (!claim.data?.paymentClaimed) {
      if (!order.provider_payment_id) return respond(409, { error: 'PAYMENT_INITIALIZING' }, origin);
      return respond(200, { payment: publicPaymentResult(await providerPayment(order.provider_payment_id)) }, origin);
    }
    claimedOrderId = order.id;
    claimToken = input.requestId;

    const { data: rawContest, error: contestError } = await admin.from('admin_contests')
      .select('id,name,price_cents,currency,content_status,sales_status').eq('id', input.contestId).maybeSingle();
    if (contestError) throw contestError;
    if (!rawContest || rawContest.price_cents !== order.amount_cents || rawContest.currency !== order.currency) {
      throw new Error('ORDER_PRICE_MISMATCH');
    }
    const regularSale = rawContest.content_status === 'ready' && rawContest.sales_status === 'available';
    const preorderSale = rawContest.content_status === 'preparing' && rawContest.sales_status === 'preorder';
    if (!regularSale && !preorderSale) throw new Error('CONTEST_NOT_AVAILABLE');

    let providerResponse: Response;
    let provider: unknown;
    try {
      providerResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'x-idempotency-key': input.requestId,
        },
        body: JSON.stringify(paymentPayload({
          request: input,
          order,
          contest: rawContest,
          payerEmail: auth.user.email || '',
          notificationUrl,
        })),
      });
      provider = await providerResponse.json();
    } catch {
      preserveClaim = true;
      throw new Error('PAYMENT_STATUS_UNKNOWN');
    }
    if (!providerResponse.ok) throw new Error('PROVIDER_PAYMENT_REJECTED');
    // A partir daqui o provedor pode já ter cobrado. A trava só é liberada após
    // salvar o ID; qualquer retry reutiliza a mesma chave idempotente.
    preserveClaim = true;
    const payment = publicPaymentResult(provider);
    const saved = await admin.from('commerce_orders').update({
      provider_payment_id: payment.id,
      payment_claim_token: null,
      payment_claimed_at: null,
    }).eq('id', order.id).eq('status', 'pending')
      .eq('payment_claim_token', input.requestId).select('id').single();
    if (saved.error) throw saved.error;
    claimedOrderId = '';
    claimToken = '';
    preserveClaim = false;
    return respond(200, { payment }, origin);
  } catch (error) {
    if (claimedOrderId && claimToken && !preserveClaim) {
      await admin.from('commerce_orders').update({
        payment_claim_token: null,
        payment_claimed_at: null,
      }).eq('id', claimedOrderId).eq('payment_claim_token', claimToken);
    }
    const code = error instanceof Error ? error.message : 'PAYMENT_FAILED';
    const publicCodes = new Set([
      'INVALID_JSON', 'INVALID_ORDER', 'INVALID_CONTEST', 'INVALID_REQUEST_ID',
      'INVALID_PAYMENT_DATA', 'INVALID_PAYMENT_METHOD', 'PAYMENT_METHOD_NOT_ALLOWED',
      'INVALID_PAYER_IDENTIFICATION', 'INVALID_CARD_TOKEN', 'INVALID_INSTALLMENTS',
      'ORDER_PRICE_INVALID', 'WEBHOOK_URL_INVALID', 'INVALID_PROVIDER_PAYMENT',
      'ORDER_PRICE_MISMATCH', 'CONTEST_NOT_AVAILABLE', 'PROVIDER_PAYMENT_REJECTED',
      'PAYMENT_LOOKUP_FAILED',
      'PAYMENT_STATUS_UNKNOWN',
    ]);
    const safeCode = publicCodes.has(code) ? code : 'PAYMENT_FAILED';
    const status = safeCode.startsWith('INVALID_') || safeCode === 'PAYMENT_METHOD_NOT_ALLOWED' ? 400
      : ['ORDER_PRICE_MISMATCH', 'CONTEST_NOT_AVAILABLE'].includes(safeCode) ? 409 : 502;
    return respond(status, { error: safeCode }, origin);
  }
});
