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

async function hashJson(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function publicationInputs(admin: any, contestId: string) {
  const [contestResult, curriculumResult, questionResult] = await Promise.all([
    admin.from('admin_contests').select('*').eq('id', contestId).single(),
    admin.from('admin_curriculum_nodes').select('id,source_id,parent_id,type,name,description,order_index,status')
      .eq('contest_id', contestId).order('order_index'),
    admin.from('question_publication_versions').select('*').eq('contest_id', contestId)
      .in('status', ['generated', 'published']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (contestResult.error) throw contestResult.error;
  if (curriculumResult.error) throw curriculumResult.error;
  if (questionResult.error) throw questionResult.error;
  const contest = contestResult.data;
  const curriculum = curriculumResult.data || [];
  const questions = questionResult.data;
  const checklist = {
    general: Boolean(contest.name && contest.role && contest.description && contest.slug),
    curriculum: curriculum.some((node: { type: string }) => node.type === 'subtopic'),
    questions: Boolean(questions?.item_count > 0),
    appearance: Boolean(contest.battle_avatar_asset_id),
    version: Boolean(questions?.version),
  };
  return { contest, curriculum, questions, checklist, ready: Object.values(checklist).every(Boolean) };
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
    if (action === 'list_curriculum' || action === 'get_curriculum_tree') {
      const { data, error } = await admin.from('admin_curriculum_nodes').select('*')
        .eq('contest_id', body.contestId).order('order_index');
      if (error) throw error;
      return json(200, { nodes: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'validate_curriculum_import') {
      return json(200, {
        valid: true,
        count: body.nodes.length,
        counts: body.nodes.reduce((result: Record<string, number>, node: { type: string }) => {
          result[node.type] = (result[node.type] || 0) + 1;
          return result;
        }, {}),
      }, origin);
    }
    if (action === 'import_curriculum_draft' || action === 'replace_curriculum_draft') {
      const { data, error } = await admin.rpc('admin_replace_curriculum_draft', {
        target_contest_id: body.contestId,
        imported_nodes: body.nodes,
        allow_replace: action === 'replace_curriculum_draft',
      });
      if (error) throw error;
      await audit(admin, userData.user.id, {
        contestId: body.contestId,
        action,
        targetType: 'curriculum',
        targetId: body.contestId,
        metadata: { schema_version: body.schemaVersion, node_count: body.nodes.length },
      });
      return json(200, { imported: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
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
    if (action === 'validate_publication') {
      const inputs = await publicationInputs(admin, body.contestId);
      return json(200, { ready: inputs.ready, checklist: inputs.checklist }, origin);
    }
    if (action === 'list_content_packages') {
      const { data, error } = await admin.from('contest_content_packages').select('id,contest_id,version,content_hash,status,created_at,published_at')
        .eq('contest_id', body.contestId).order('created_at', { ascending: false });
      if (error) throw error;
      return json(200, { packages: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'generate_content_package') {
      const inputs = await publicationInputs(admin, body.contestId);
      if (!inputs.ready) return json(409, { error: 'publication_checklist_incomplete', checklist: inputs.checklist }, origin);
      const metadata = {
        id: inputs.contest.id,
        code: inputs.contest.code,
        slug: inputs.contest.slug,
        name: inputs.contest.name,
        role: inputs.contest.role,
        description: inputs.contest.description,
        exam_date: inputs.contest.exam_date,
        price_cents: inputs.contest.price_cents,
        currency: inputs.contest.currency,
        color: inputs.contest.color,
        accent: inputs.contest.accent,
        icon: inputs.contest.icon,
        sales_status: inputs.contest.sales_status,
      };
      const visualConfig = {
        battle_avatar: inputs.contest.battle_avatar_asset_id,
        success: inputs.contest.success_asset_id,
        error: inputs.contest.error_asset_id,
        attention: inputs.contest.attention_asset_id,
        cover: inputs.contest.cover_media_asset_id,
      };
      const content = { metadata, curriculum: inputs.curriculum, questionsVersionId: inputs.questions.id, visualConfig };
      const contentHash = await hashJson(content);
      const { data, error } = await admin.from('contest_content_packages').insert({
        contest_id: body.contestId,
        version: body.version,
        metadata,
        curriculum_snapshot: inputs.curriculum,
        questions_version_id: inputs.questions.id,
        visual_config: visualConfig,
        content_hash: contentHash,
        status: 'generated',
        created_by: userData.user.id,
      }).select('*').single();
      if (error?.code === '23505') return json(409, { error: 'package_version_or_content_exists' }, origin);
      if (error) throw error;
      await audit(admin, userData.user.id, {
        contestId: body.contestId, action, targetType: 'content_package', targetId: data.id,
        metadata: { version: data.version, content_hash: contentHash },
      });
      return json(201, { package: data }, origin);
    }
    if (action === 'preview_content_package') {
      const { data, error } = await admin.from('contest_content_packages').select('*')
        .eq('id', body.packageId).eq('contest_id', body.contestId).single();
      if (error) throw error;
      return json(200, { package: data }, origin);
    }
    if (action === 'publish_content_package') {
      const { data: contest, error: contestError } = await admin.from('admin_contests').select('code').eq('id', body.contestId).single();
      if (contestError) throw contestError;
      if (body.confirmation !== contest.code) return json(422, { error: 'publication_confirmation_invalid' }, origin);
      const inputs = await publicationInputs(admin, body.contestId);
      if (!inputs.ready) return json(409, { error: 'publication_checklist_incomplete', checklist: inputs.checklist }, origin);
      const { error: archiveError } = await admin.from('contest_content_packages').update({ status: 'archived' })
        .eq('contest_id', body.contestId).eq('status', 'published');
      if (archiveError) throw archiveError;
      const publishedAt = new Date().toISOString();
      const { data, error } = await admin.from('contest_content_packages').update({ status: 'published', published_at: publishedAt })
        .eq('id', body.packageId).eq('contest_id', body.contestId).eq('status', 'generated').select('*').single();
      if (error) throw error;
      await Promise.all([
        admin.from('admin_contests').update({ content_status: 'ready', published_at: publishedAt }).eq('id', body.contestId),
        admin.from('question_publication_versions').update({ status: 'published', published_at: publishedAt, published_by: userData.user.id })
          .eq('id', data.questions_version_id),
      ]);
      await audit(admin, userData.user.id, {
        contestId: body.contestId, action, targetType: 'content_package', targetId: data.id,
        metadata: { version: data.version, content_hash: data.content_hash },
      });
      return json(200, { package: data }, origin);
    }
    if (action === 'rollback_content_package') {
      const { data: target, error: targetError } = await admin.from('contest_content_packages').select('*')
        .eq('id', body.packageId).eq('contest_id', body.contestId).in('status', ['archived', 'rolled_back']).single();
      if (targetError) throw targetError;
      const { error: rollbackError } = await admin.from('contest_content_packages').update({ status: 'rolled_back' })
        .eq('contest_id', body.contestId).eq('status', 'published');
      if (rollbackError) throw rollbackError;
      const { data, error } = await admin.from('contest_content_packages').update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', target.id).select('*').single();
      if (error) throw error;
      await audit(admin, userData.user.id, {
        contestId: body.contestId, action, targetType: 'content_package', targetId: data.id,
        metadata: { restored_version: data.version },
      });
      return json(200, { package: data }, origin);
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
