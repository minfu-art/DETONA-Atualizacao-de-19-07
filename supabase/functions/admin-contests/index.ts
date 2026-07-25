import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  OPERATIONAL_CAPABILITIES,
  sanitizedAuditMetadata,
  validateAdminContestRequest,
} from './core.js';

const allowedOrigins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean));
const json = (status: number, payload: unknown, origin = '') => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': allowedOrigins.has(origin) ? origin : '',
    vary: 'Origin',
  },
});

async function audit(admin: any, actorId: string, record: {
  contestId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from('admin_audit_log').insert({
    actor_user_id: actorId,
    contest_id: record.contestId || null,
    module: 'contests',
    action: record.action,
    target_type: record.targetType,
    target_id: record.targetId || null,
    metadata: sanitizedAuditMetadata(record.metadata),
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return allowedOrigins.has(origin) ? json(204, {}, origin) : json(403, { error: 'origin_not_allowed' });
  if (request.method !== 'POST' || !allowedOrigins.has(origin)) return json(403, { error: 'request_not_allowed' });
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json(401, { error: 'invalid_session' }, origin);
    if (Number(request.headers.get('content-length') || 0) > 2_100_000) return json(413, { error: 'payload_too_large' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await identity.auth.getUser();
    if (userError || !userData.user) return json(401, { error: 'invalid_session' }, origin);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'developer') return json(403, { error: 'developer_required' }, origin);
    const body = validateAdminContestRequest(await request.json());
    const { action } = body;

    if (action === 'list_contests') {
      let query = admin.from('admin_contests').select('*').order('created_at');
      if (body.search) query = query.or(`code.ilike.%${body.search}%,name.ilike.%${body.search}%,role.ilike.%${body.search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return json(200, { contests: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'get_contest') {
      const [{ data: contest, error }, curriculum, questions] = await Promise.all([
        admin.from('admin_contests').select('*').eq('id', body.contestId).single(),
        admin.from('admin_curriculum_nodes').select('id', { count: 'exact', head: true }).eq('contest_id', body.contestId),
        admin.from('editorial_questions').select('id', { count: 'exact', head: true }).eq('contest_id', body.contestId),
      ]);
      if (error) throw error;
      return json(200, {
        contest,
        counts: { curriculum: curriculum.count || 0, questions: questions.count || 0 },
        capabilities: OPERATIONAL_CAPABILITIES,
      }, origin);
    }
    if (action === 'list_curriculum') {
      const { data, error } = await admin.from('admin_curriculum_nodes').select('*')
        .eq('contest_id', body.contestId).order('order_index');
      if (error) throw error;
      return json(200, { nodes: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'list_audit') {
      const from = (body.page - 1) * body.pageSize;
      let query = admin.from('admin_audit_log').select('*').order('created_at', { ascending: false })
        .range(from, from + body.pageSize - 1);
      if (body.contestId) query = query.eq('contest_id', body.contestId);
      const { data, error } = await query;
      if (error) throw error;
      return json(200, { rows: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'create_contest' || action === 'update_contest') {
      const query = action === 'create_contest'
        ? admin.from('admin_contests').insert(body.contest).select('*').single()
        : admin.from('admin_contests').update(body.contest).eq('id', body.contest.id).select('*').single();
      const { data: contest, error } = await query;
      if (error?.code === '23505') return json(409, { error: 'contest_id_code_or_slug_exists' }, origin);
      if (error) throw error;
      await audit(admin, userData.user.id, {
        contestId: contest.id,
        action,
        targetType: 'contest',
        targetId: contest.id,
        metadata: { code: contest.code, content_status: contest.content_status, sales_status: contest.sales_status },
      });
      return json(action === 'create_contest' ? 201 : 200, { contest, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'save_curriculum_node') {
      const payload = { ...body.node, contest_id: body.contestId };
      const query = body.node.id
        ? admin.from('admin_curriculum_nodes').update(payload).eq('id', body.node.id).eq('contest_id', body.contestId)
        : admin.from('admin_curriculum_nodes').insert(payload);
      const { data, error } = await query.select('*').single();
      if (error) throw error;
      await audit(admin, userData.user.id, { contestId: body.contestId, action, targetType: 'curriculum_node', targetId: data.id });
      return json(200, { node: data }, origin);
    }
    if (action === 'reorder_curriculum') {
      for (let index = 0; index < body.orderedIds.length; index += 1) {
        const { error } = await admin.from('admin_curriculum_nodes').update({ order_index: index })
          .eq('id', body.orderedIds[index]).eq('contest_id', body.contestId);
        if (error) throw error;
      }
      await audit(admin, userData.user.id, { contestId: body.contestId, action, targetType: 'curriculum', targetId: body.contestId });
      return json(200, { updated: body.orderedIds.length }, origin);
    }
    const next = action === 'publish'
      ? { content_status: 'ready', published_at: new Date().toISOString() }
      : action === 'suspend'
        ? { sales_status: 'suspended' }
        : { content_status: 'archived', archived_at: new Date().toISOString() };
    const { data: contest, error } = await admin.from('admin_contests').update(next)
      .eq('id', body.contestId).select('*').single();
    if (error) throw error;
    await audit(admin, userData.user.id, { contestId: body.contestId, action, targetType: 'contest', targetId: body.contestId });
    return json(200, { contest, capabilities: OPERATIONAL_CAPABILITIES }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return json(400, { error: message }, origin);
  }
});
