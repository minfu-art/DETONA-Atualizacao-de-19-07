import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createAllowedOrigins, handleCorsPreflight, isAllowedOrigin, jsonResponse } from '../_shared/cors.js';
import {
  assertPurchasableContest,
  checkoutPreference,
  resolveReservedCheckout,
  selectCheckoutUrl,
  validateCheckoutRequest,
} from './core.js';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || '';
const mode = Deno.env.get('CHECKOUT_MODE') === 'production' ? 'production' : 'test';
const returnBaseUrl = Deno.env.get('CHECKOUT_RETURN_BASE_URL') || '';
const notificationUrl = Deno.env.get('CHECKOUT_WEBHOOK_URL') || '';
const allowedOrigins = createAllowedOrigins(Deno.env.get('STUDENT_ALLOWED_ORIGINS'));
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const respond = (status: number, payload: unknown, origin = '') => jsonResponse(status, payload, origin, allowedOrigins);

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const preflight = handleCorsPreflight(request, allowedOrigins);
  if (preflight) return preflight;
  try {
    if (!isAllowedOrigin(origin, allowedOrigins)) return respond(403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (request.method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' }, origin);
    if (!accessToken || !returnBaseUrl || !notificationUrl) {
      return respond(503, { error: 'CHECKOUT_NOT_CONFIGURED' }, origin);
    }
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return respond(401, { error: 'INVALID_SESSION' }, origin);
    const identity = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await identity.auth.getUser();
    if (authError || !auth.user) return respond(401, { error: 'INVALID_SESSION' }, origin);
    const body = validateCheckoutRequest(await request.json());

    const { data: entitlement, error: entitlementError } = await admin.from('contest_entitlements').select('id')
      .eq('user_id', auth.user.id).eq('contest_id', body.contestId).eq('status', 'active').maybeSingle();
    if (entitlementError) throw entitlementError;
    if (entitlement) return respond(409, { error: 'ALREADY_ENTITLED' }, origin);

    const { data: rawContest, error: contestError } = await admin.from('admin_contests')
      .select('id,name,price_cents,currency,content_status,sales_status').eq('id', body.contestId).maybeSingle();
    if (contestError) throw contestError;
    const contest = assertPurchasableContest(rawContest);

    const reserved = await admin.rpc('reserve_commerce_order', {
      p_user_id: auth.user.id,
      p_contest_id: contest.id,
      p_provider: 'mercado_pago',
      p_idempotency_key: body.requestId,
      p_amount_cents: contest.price_cents,
      p_currency: contest.currency,
    });
    if (reserved.error) {
      if (String(reserved.error.message || '').includes('idempotency_conflict')) {
        return respond(409, { error: 'IDEMPOTENCY_CONFLICT' }, origin);
      }
      throw reserved.error;
    }

    const checkout = await resolveReservedCheckout(reserved.data, {
      readOrder: async (orderId) => {
        const result = await admin.from('commerce_orders').select('*').eq('id', orderId).single();
        if (result.error) throw result.error;
        return result.data;
      },
      createPreference: async (order) => {
        const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
            // Todas as chamadas concorrentes do mesmo pedido usam a mesma chave no provedor.
            'x-idempotency-key': order.id,
          },
          body: JSON.stringify(checkoutPreference({
            order,
            contest,
            payerEmail: auth.user.email || '',
            returnBaseUrl,
            notificationUrl,
          })),
        });
        const preference = await preferenceResponse.json();
        if (!preferenceResponse.ok) throw new Error('PROVIDER_CHECKOUT_FAILED');
        return {
          id: String(preference.id),
          redirectUrl: selectCheckoutUrl(preference, mode),
          expiresAt: preference.expiration_date_to || null,
        };
      },
      savePreference: async (orderId, preference) => {
        const saved = await admin.from('commerce_orders').update({
          provider_preference_id: preference.id,
          checkout_url: preference.redirectUrl,
          expires_at: preference.expiresAt,
          preference_claim_token: null,
          preference_claimed_at: null,
        }).eq('id', orderId).eq('status', 'pending')
          .eq('preference_claim_token', body.requestId).select('id').single();
        if (saved.error) throw saved.error;
      },
      releaseClaim: async (orderId) => {
        await admin.from('commerce_orders').update({
          preference_claim_token: null,
          preference_claimed_at: null,
        }).eq('id', orderId).eq('preference_claim_token', body.requestId);
      },
    });
    return respond(200, { checkout }, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'CHECKOUT_FAILED';
    const publicCodes = new Set([
      'CONTEST_NOT_FOUND', 'CONTEST_NOT_AVAILABLE', 'CONTEST_PRICE_INVALID',
      'INVALID_JSON', 'INVALID_CONTEST', 'INVALID_REQUEST_ID',
      'RETURN_URL_INVALID', 'WEBHOOK_URL_INVALID', 'CHECKOUT_URL_INVALID',
      'PROVIDER_CHECKOUT_FAILED', 'ORDER_NOT_PENDING', 'CHECKOUT_INITIALIZING',
    ]);
    const safeCode = publicCodes.has(code) ? code : 'CHECKOUT_FAILED';
    const status = safeCode === 'CONTEST_NOT_FOUND' ? 404
      : ['ORDER_NOT_PENDING', 'CHECKOUT_INITIALIZING'].includes(safeCode) ? 409
      : safeCode.startsWith('CONTEST_') || safeCode.startsWith('INVALID_') ? 400 : 502;
    return respond(status, { error: safeCode }, origin);
  }
});
