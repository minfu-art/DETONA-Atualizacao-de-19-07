import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertSiteAction } from './core.js';
const origins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').map((v) => v.trim()).filter(Boolean));
const reply = (status: number, body: unknown, origin = '') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origins.has(origin) ? origin : '', vary: 'Origin' } });
Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return origins.has(origin) ? reply(204, {}, origin) : reply(403, { error: 'origin_not_allowed' });
  try {
    if (!origins.has(origin)) return reply(403, { error: 'origin_not_allowed' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('authorization') || '' } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: auth } = await identity.auth.getUser();
    const { data: profile } = auth.user ? await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle() : { data: null };
    if (profile?.role !== 'developer') return reply(403, { error: 'developer_required' }, origin);
    const body = await request.json(); const action = assertSiteAction(body.action);
    if (action === 'list_pages') {
      const { data, error } = await admin.from('landing_pages').select('*').eq('contest_id', body.contestId);
      if (error) throw error; return reply(200, { pages: data }, origin);
    }
    return reply(409, { error: 'mutation_not_enabled' }, origin);
  } catch { return reply(400, { error: 'invalid_request' }, origin); }
});
