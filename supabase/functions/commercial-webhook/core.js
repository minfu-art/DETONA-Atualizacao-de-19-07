export function signatureParts(value) {
  const parts = Object.fromEntries(String(value || '').split(',').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }));
  if (!/^\d+$/.test(parts.ts || '') || !/^[0-9a-f]{64}$/i.test(parts.v1 || '')) throw new Error('INVALID_SIGNATURE');
  return { timestamp: parts.ts, signature: parts.v1.toLowerCase() };
}

export function signatureManifest(dataId, requestId, timestamp) {
  if (!dataId || !requestId || !timestamp) throw new Error('INVALID_SIGNATURE_INPUT');
  return `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${timestamp};`;
}

export async function hmacSha256Hex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyMercadoPagoSignature({ xSignature, xRequestId, dataId, secret }) {
  const { timestamp, signature } = signatureParts(xSignature);
  const expected = await hmacSha256Hex(secret, signatureManifest(dataId, xRequestId, timestamp));
  return constantTimeEqual(signature, expected);
}

export async function verifyMercadoPagoSignatures({ xSignature, xRequestId, dataId, secrets }) {
  const candidates = [...new Set((Array.isArray(secrets) ? secrets : [])
    .map((secret) => String(secret || '').trim())
    .filter(Boolean))];
  for (const secret of candidates) {
    if (await verifyMercadoPagoSignature({ xSignature, xRequestId, dataId, secret })) return true;
  }
  return false;
}

const NUMERIC_ID = /^\d+$/;

function requiredNumericId(value) {
  const id = String(value ?? '').trim();
  if (!NUMERIC_ID.test(id)) throw new Error('INVALID_NOTIFICATION_ID');
  return id;
}

export function parseMercadoPagoNotification({ requestUrl, body }) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
  const topic = String(url.searchParams.get('topic') || body?.topic || '').toLowerCase();

  if (topic === 'merchant_order') {
    return {
      kind: 'merchant_order',
      merchantOrderId: requiredNumericId(url.searchParams.get('id') || body?.id),
    };
  }

  const type = String(body?.type || url.searchParams.get('type') || '').toLowerCase();
  if (type === 'payment') {
    return {
      kind: 'payment',
      dataId: requiredNumericId(url.searchParams.get('data.id') || body?.data?.id),
    };
  }

  return { kind: 'ignored' };
}

export function paymentIdsFromMerchantOrder(merchantOrder) {
  const ids = [];
  const seen = new Set();
  for (const payment of Array.isArray(merchantOrder?.payments) ? merchantOrder.payments : []) {
    const id = String(payment?.id ?? '').trim();
    if (!NUMERIC_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function resolveMerchantOrderPayments(merchantOrderId, { fetchMerchantOrder, fetchPayment }) {
  const canonicalMerchantOrderId = requiredNumericId(merchantOrderId);
  const merchantOrder = await fetchMerchantOrder(canonicalMerchantOrderId);
  const payments = [];
  for (const paymentId of paymentIdsFromMerchantOrder(merchantOrder)) {
    payments.push(await fetchPayment(paymentId));
  }
  return payments;
}

const SAFE_WEBHOOK_ERROR_CODES = new Set([
  'INVALID_NOTIFICATION_ID',
  'INVALID_SIGNATURE',
  'INVALID_SIGNATURE_INPUT',
  'MERCHANT_ORDER_LOOKUP_FAILED',
  'PAYMENT_LOOKUP_FAILED',
  'PAYMENT_ENVIRONMENT_MISMATCH',
  'PAYMENT_RPC_FAILED',
]);

export function webhookErrorCode(error) {
  const code = error instanceof Error ? error.message : '';
  return SAFE_WEBHOOK_ERROR_CODES.has(code) ? code : 'UNEXPECTED_ERROR';
}

export function paymentMatchesCheckoutMode(payment, mode) {
  const liveMode = payment?.live_mode === true;
  const payerEmail = String(payment?.payer?.email || '').trim().toLowerCase();
  const testBuyer = /^[^@]+@testuser\.com$/.test(payerEmail);
  if (mode === 'production') return liveMode && !testBuyer;
  return !liveMode || testBuyer;
}

export function normalizePaymentStatus(status, statusDetail = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'approved') return 'approved';
  if (value === 'pending' || value === 'in_process' || value === 'authorized') return 'pending';
  if (value === 'cancelled') return 'cancelled';
  if (value === 'refunded') return 'refunded';
  if (value === 'charged_back') return 'charged_back';
  if (value === 'rejected') return 'rejected';
  if (String(statusDetail).toLowerCase() === 'expired' || value === 'expired') return 'expired';
  return 'pending';
}
