import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertEditorialAction } from './core.js';

const origins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').map((v) => v.trim()).filter(Boolean));
const respond = (status: number, payload: unknown, origin = '') => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': origins.has(origin) ? origin : '', vary: 'Origin' },
});

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return origins.has(origin) ? respond(204, {}, origin) : respond(403, { error: 'origin_not_allowed' });
  try {
    if (!origins.has(origin) || request.method !== 'POST') return respond(403, { error: 'request_not_allowed' }, origin);
    const auth = request.headers.get('authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: userData } = await identity.auth.getUser();
    if (!userData.user) return respond(401, { error: 'invalid_session' }, origin);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'developer') return respond(403, { error: 'developer_required' }, origin);
    const body = await request.json();
    const action = assertEditorialAction(body.action);
    if (action === 'list_questions') {
      const { data, error } = await admin.from('editorial_questions').select('id,contest_id,status,difficulty,created_at')
        .eq('contest_id', body.contestId).limit(100);
      if (error) throw error;
      return respond(200, { questions: data }, origin);
    }
    // Mutações serão habilitadas após a validação operacional do schema e Storage.
    return respond(409, { error: 'mutation_not_enabled' }, origin);
  } catch {
    return respond(400, { error: 'invalid_request' }, origin);
  }
});
