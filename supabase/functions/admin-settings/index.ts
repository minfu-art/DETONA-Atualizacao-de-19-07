import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { READ_ONLY_CAPABILITIES } from '../_shared/adminValidation.js';
import { validateSettingsRequest } from './core.js';
const origins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').map((v) => v.trim()).filter(Boolean));
const reply = (status: number, body: unknown, origin = '') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origins.has(origin) ? origin : '', vary: 'Origin' } });
Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return origins.has(origin) ? reply(204, {}, origin) : reply(403, { error: 'origin_not_allowed' });
  try {
    if (!origins.has(origin) || request.method !== 'POST') return reply(403, { error: 'request_not_allowed' }, origin);
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'invalid_session' }, origin);
    if (Number(request.headers.get('content-length') || 0) > 100_000) return reply(413, { error: 'payload_too_large' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: auth } = await identity.auth.getUser();
    const { data: profile } = auth.user ? await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle() : { data: null };
    if (profile?.role !== 'developer') return reply(403, { error: 'developer_required' }, origin);
    const body = validateSettingsRequest(await request.json()); const { action } = body;
    if (action === 'list_settings') {
      const { data, error } = await admin.from('platform_settings').select('key,value_type,value,updated_at');
      if (error) throw error; return reply(200, { settings: data, capabilities: READ_ONLY_CAPABILITIES }, origin);
    }
    return reply(409, { error: 'mutation_not_enabled' }, origin);
  } catch { return reply(400, { error: 'invalid_request' }, origin); }
});
