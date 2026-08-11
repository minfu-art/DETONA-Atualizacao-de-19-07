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
