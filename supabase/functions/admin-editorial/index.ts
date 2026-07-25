import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { READ_ONLY_CAPABILITIES } from '../_shared/adminValidation.js';
import { validateEditorialRequest } from './core.js';

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
    if (!auth.startsWith('Bearer ')) return respond(401, { error: 'invalid_session' }, origin);
    if (Number(request.headers.get('content-length') || 0) > 2_100_000) return respond(413, { error: 'payload_too_large' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: userData } = await identity.auth.getUser();
    if (!userData.user) return respond(401, { error: 'invalid_session' }, origin);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'developer') return respond(403, { error: 'developer_required' }, origin);
    const body = validateEditorialRequest(await request.json());
    const { action } = body;
    if (action === 'list_questions') {
      const from = (body.page - 1) * body.pageSize;
      let query = admin.from('editorial_questions').select('id,contest_id,status,difficulty,created_at')
        .eq('contest_id', body.contestId).range(from, from + body.pageSize - 1);
      if (body.status) query = query.eq('status', body.status);
      if (body.search) query = query.ilike('id', `%${body.search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return respond(200, { questions: data, capabilities: READ_ONLY_CAPABILITIES }, origin);
    }
    // Mutações serão habilitadas após a validação operacional do schema e Storage.
    return respond(409, { error: 'mutation_not_enabled' }, origin);
  } catch {
    return respond(400, { error: 'invalid_request' }, origin);
  }
});
