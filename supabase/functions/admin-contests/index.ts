import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  READ_ONLY_CAPABILITIES,
  sanitizedAuditMetadata,
  validateAdminContestRequest,
} from './core.js';

const allowedOrigins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').map((v) => v.trim()).filter(Boolean));
const json = (status: number, payload: unknown, origin = '') => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': allowedOrigins.has(origin) ? origin : '',
    'vary': 'Origin',
  },
});

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return allowedOrigins.has(origin) ? json(204, {}, origin) : json(403, { error: 'origin_not_allowed' });
  if (request.method !== 'POST' || !allowedOrigins.has(origin)) return json(403, { error: 'request_not_allowed' });
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json(401, { error: 'invalid_session' }, origin);
    if (Number(request.headers.get('content-length') || 0) > 100_000) return json(413, { error: 'payload_too_large' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const identity = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await identity.auth.getUser();
    if (userError || !userData.user) return json(401, { error: 'invalid_session' }, origin);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'developer') return json(403, { error: 'developer_required' }, origin);
    const body = validateAdminContestRequest(await request.json());
    const { action } = body;

    if (action === 'list_contests') {
      let query = admin.from('admin_contests').select('*').order('created_at');
      if (body.search) query = query.or(`code.ilike.%${body.search}%,name.ilike.%${body.search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return json(200, { contests: data, capabilities: READ_ONLY_CAPABILITIES }, origin);
    }
    if (action === 'list_curriculum') {
      const { data, error } = await admin.from('admin_curriculum_nodes').select('*').eq('contest_id', body.contestId).order('order_index');
      if (error) throw error;
      return json(200, { nodes: data, capabilities: READ_ONLY_CAPABILITIES }, origin);
    }
    if (action === 'list_audit') {
      const from = (body.page - 1) * body.pageSize;
      let query = admin.from('admin_audit_log').select('*').order('created_at', { ascending: false }).range(from, from + body.pageSize - 1);
      if (body.contestId) query = query.eq('contest_id', body.contestId);
      const { data, error } = await query;
      if (error) throw error;
      return json(200, { rows: data, capabilities: READ_ONLY_CAPABILITIES }, origin);
    }
    // Mutações ficam fechadas até validação operacional da migration no staging.
    await admin.from('admin_audit_log').insert({
      actor_user_id: userData.user.id,
      contest_id: body.contestId || body.contest?.id || null,
      module: 'contests',
      action,
      target_type: action.includes('curriculum') ? 'curriculum_node' : 'contest',
      target_id: body.contestId || body.contest?.id || body.node?.id || null,
      metadata: sanitizedAuditMetadata({ requested_action: action }),
    });
    return json(409, { error: 'mutation_not_enabled' }, origin);
  } catch {
    return json(400, { error: 'invalid_request' }, origin);
  }
});
