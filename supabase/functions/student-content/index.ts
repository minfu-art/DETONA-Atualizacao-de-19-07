import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAllowedOrigins, handleCorsPreflight, isAllowedOrigin, jsonResponse } from '../_shared/cors.js';
import { normalizeCatalogContest, validateStudentContentRequest } from './core.js';

const allowedOrigins = createAllowedOrigins(
  Deno.env.get('STUDENT_ALLOWED_ORIGINS') || Deno.env.get('ADMIN_ALLOWED_ORIGINS'),
);
const respond = (status: number, payload: unknown, origin = '') => (
  jsonResponse(status, payload, origin, allowedOrigins)
);

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const preflight = handleCorsPreflight(request, allowedOrigins);
  if (preflight) return preflight;
  try {
    if (!isAllowedOrigin(origin, allowedOrigins)) return respond(403, { error: 'origin_not_allowed' });
    if (request.method !== 'POST') return respond(403, { error: 'request_not_allowed' }, origin);
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return respond(401, { error: 'invalid_session' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await identity.auth.getUser();
    if (authError || !auth.user) return respond(401, { error: 'invalid_session' }, origin);
    const body = validateStudentContentRequest(await request.json());
    if (body.action === 'list_catalog') {
      const { data, error } = await admin.from('admin_contests').select('*')
        .neq('content_status', 'archived')
        .in('sales_status', ['available', 'coming_soon'])
        .order('created_at');
      if (error) throw error;
      const contests = await Promise.all((data || []).map(async (contest: { id: string }) => {
        const [subtopics, questions] = await Promise.all([
          admin.from('admin_curriculum_nodes').select('id', { count: 'exact', head: true })
            .eq('contest_id', contest.id).eq('type', 'subtopic').neq('status', 'archived'),
          admin.from('question_publication_versions').select('item_count')
            .eq('contest_id', contest.id).in('status', ['generated', 'published'])
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (subtopics.error) throw subtopics.error;
        if (questions.error) throw questions.error;
        return normalizeCatalogContest({
          ...contest,
          subtopic_count: subtopics.count || 0,
          question_count: questions.data?.item_count || 0,
        });
      }));
      return respond(200, { contests }, origin);
    }
    const { data: entitlement } = await admin.from('contest_entitlements').select('status')
      .eq('user_id', auth.user.id).eq('contest_id', body.contestId).eq('status', 'active').maybeSingle();
    if (!entitlement) return respond(403, { error: 'entitlement_required' }, origin);
    const { data: contentPackage, error: packageError } = await admin.from('contest_content_packages').select('*')
      .eq('contest_id', body.contestId).eq('status', 'published').maybeSingle();
    if (packageError) throw packageError;
    if (!contentPackage) {
      if (body.contestId === 'pc_al_2026') return respond(200, { legacyStatic: true, contestId: body.contestId }, origin);
      return respond(503, {
        error: 'content_temporarily_unavailable',
        contestId: body.contestId,
      }, origin);
    }
    const [{ data: questionVersion, error: versionError }, { data: questionItems, error: questionError }] = await Promise.all([
      admin.from('question_publication_versions').select('id,contest_id,content_hash,item_count,status')
        .eq('id', contentPackage.questions_version_id).eq('contest_id', body.contestId).eq('status', 'published').single(),
      admin.from('question_publication_items').select('payload,order_index')
        .eq('version_id', contentPackage.questions_version_id).eq('contest_id', body.contestId).order('order_index'),
    ]);
    if (versionError) throw versionError;
    if (questionError) throw questionError;
    if (!questionItems?.length || questionItems.length !== questionVersion.item_count) {
      throw new Error('published_question_snapshot_invalid');
    }
    const assetIds = Object.values(contentPackage.visual_config || {}).filter(Boolean);
    const { data: assets, error: assetError } = assetIds.length
      ? await admin.from('media_assets').select('id,storage_path').eq('contest_id', body.contestId).in('id', assetIds)
      : { data: [], error: null };
    if (assetError) throw assetError;
    const { data: signed, error: signedError } = assets.length
      ? await admin.storage.from('admin-media').createSignedUrls(assets.map(({ storage_path }: { storage_path: string }) => storage_path), 3600)
      : { data: [], error: null };
    if (signedError) throw signedError;
    const urlByPath = new Map((signed || []).map((item: { path: string; signedUrl: string }) => [item.path, item.signedUrl]));
    const pathById = new Map(assets.map((item: { id: string; storage_path: string }) => [item.id, item.storage_path]));
    const visualConfig = Object.fromEntries(Object.entries(contentPackage.visual_config || {}).map(([key, id]) => {
      const path = pathById.get(String(id));
      return [key, path ? urlByPath.get(path) || null : null];
    }));
    return respond(200, {
      package: {
        id: contentPackage.id,
        contestId: contentPackage.contest_id,
        version: contentPackage.version,
        metadata: contentPackage.metadata,
        curriculum: contentPackage.curriculum_snapshot,
        questions: questionItems.map(({ payload }: { payload: unknown }) => payload),
        questionsVersionId: questionVersion.id,
        questionsHash: questionVersion.content_hash,
        visualConfig,
        contentHash: contentPackage.content_hash,
      },
    }, origin);
  } catch (error) {
    return respond(400, { error: error instanceof Error ? error.message : 'invalid_request' }, origin);
  }
});
