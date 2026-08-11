import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createAllowedOrigins, handleCorsPreflight, isAllowedOrigin, jsonResponse } from '../_shared/cors.js';
import { assertPurchasableContest, checkoutPreference, selectCheckoutUrl, validateCheckoutRequest } from './core.js';

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

    let { data: order, error: orderError } = await admin.from('commerce_orders').select('*')
      .eq('user_id', auth.user.id).eq('idempotency_key', body.requestId).maybeSingle();
    if (orderError) throw orderError;
    if (order && order.contest_id !== contest.id) return respond(409, { error: 'IDEMPOTENCY_CONFLICT' }, origin);
    if (!order) {
      const recent = await admin.from('commerce_orders').select('*')
        .eq('user_id', auth.user.id).eq('contest_id', contest.id).eq('status', 'pending')
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (recent.error) throw recent.error;
      order = recent.data;
    }
    if (order?.checkout_url && order.status === 'pending') {
      return respond(200, { checkout: { id: order.id, status: 'redirect', redirectUrl: order.checkout_url } }, origin);
    }
    if (!order) {
      const created = await admin.from('commerce_orders').insert({
        user_id: auth.user.id,
        contest_id: contest.id,
        provider: 'mercado_pago',
        idempotency_key: body.requestId,
        amount_cents: contest.price_cents,
        currency: contest.currency,
        status: 'pending',
      }).select('*').single();
      if (created.error) throw created.error;
      order = created.data;
    }

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'x-idempotency-key': body.requestId,
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
    const redirectUrl = selectCheckoutUrl(preference, mode);
    const saved = await admin.from('commerce_orders').update({
      provider_preference_id: String(preference.id),
      checkout_url: redirectUrl,
      expires_at: preference.expiration_date_to || null,
    }).eq('id', order.id).eq('status', 'pending');
    if (saved.error) throw saved.error;
    return respond(200, { checkout: { id: order.id, status: 'redirect', redirectUrl } }, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'CHECKOUT_FAILED';
    const publicCodes = new Set([
      'CONTEST_NOT_FOUND', 'CONTEST_NOT_AVAILABLE', 'CONTEST_PRICE_INVALID',
      'INVALID_JSON', 'INVALID_CONTEST', 'INVALID_REQUEST_ID',
      'RETURN_URL_INVALID', 'WEBHOOK_URL_INVALID', 'CHECKOUT_URL_INVALID',
      'PROVIDER_CHECKOUT_FAILED',
    ]);
    const safeCode = publicCodes.has(code) ? code : 'CHECKOUT_FAILED';
    const status = safeCode === 'CONTEST_NOT_FOUND' ? 404
      : safeCode.startsWith('CONTEST_') || safeCode.startsWith('INVALID_') ? 400 : 502;
    return respond(status, { error: safeCode }, origin);
  }
});
