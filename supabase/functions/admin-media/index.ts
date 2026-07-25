import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertMediaAction } from './core.js';
const origins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').map((v) => v.trim()).filter(Boolean));
const response = (status: number, body: unknown, origin = '') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origins.has(origin) ? origin : '', vary: 'Origin' } });
Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return origins.has(origin) ? response(204, {}, origin) : response(403, { error: 'origin_not_allowed' });
  try {
    if (!origins.has(origin)) return response(403, { error: 'origin_not_allowed' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('authorization') || '' } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: auth } = await identity.auth.getUser();
    const { data: profile } = auth.user ? await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle() : { data: null };
    if (profile?.role !== 'developer') return response(403, { error: 'developer_required' }, origin);
    const body = await request.json(); const action = assertMediaAction(body.action);
    if (action === 'list_collections') {
      const { data, error } = await admin.from('avatar_collections').select('*').or(`contest_id.eq.${body.contestId},contest_id.is.null`);
      if (error) throw error; return response(200, { collections: data }, origin);
    }
    return response(409, { error: 'mutation_not_enabled' }, origin);
  } catch { return response(400, { error: 'invalid_request' }, origin); }
});
