import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAllowedOrigins, handleCorsPreflight, isAllowedOrigin, jsonResponse } from '../_shared/cors.js';
import {
  ASSISTED_PACKAGE_SCHEMA_VERSION,
  validateAssistedCoursePackage,
  validateAssistedFactoryRequest,
} from './core.js';

const BUCKET = 'course-factory-sources';
const MAX_BODY_BYTES = 15_000_000;
const origins = createAllowedOrigins(Deno.env.get('ADMIN_ALLOWED_ORIGINS'));
const response = (status: number, body: unknown, origin = '') => jsonResponse(status, body, origin, origins);

async function requireDeveloper(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('invalid_session');
  const url = Deno.env.get('SUPABASE_URL')!;
  const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await identity.auth.getUser();
  if (error || !data.user) throw new Error('invalid_session');
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (profileError) throw new Error('identity_lookup_failed');
  if (profile?.role !== 'developer') throw new Error('developer_required');
  return { admin, user: data.user };
}

async function ownedDraft(admin: any, draftId: string, userId: string) {
  const { data, error } = await admin.from('course_factory_drafts').select('*')
    .eq('id', draftId).eq('created_by', userId).single();
  if (error || !data) throw new Error('course_draft_not_found');
  return data;
}

async function draftEnvelope(admin: any, draftId: string, userId: string) {
  const draft = await ownedDraft(admin, draftId, userId);
  const [sourceResult, questionResult, auditResult] = await Promise.all([
    admin.from('course_factory_sources')
      .select('id,course_draft_id,source_type,category,file_name,mime_type,byte_size,status,page_count,extraction_error,created_at,updated_at')
      .eq('course_draft_id', draftId).order('created_at'),
    admin.from('course_factory_draft_questions')
      .select('source_question_id,subtopic_id,microknowledge_ids,payload,traces,batch_name,order_index')
      .eq('course_draft_id', draftId).order('order_index').limit(25),
    admin.from('course_factory_audit_events')
      .select('id,action,package_hash,metadata,created_at')
      .eq('course_draft_id', draftId).order('created_at', { ascending: false }).limit(50),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (questionResult.error) throw questionResult.error;
  if (auditResult.error) throw auditResult.error;
  return {
    draft,
    sources: sourceResult.data || [],
    question_samples: questionResult.data || [],
    audit_events: auditResult.data || [],
  };
}

function previewCurriculum(draft: any) {
  const roleId = draft.identity?.position_id || `role_${draft.identity?.contest_id || 'course'}`;
  const rows = [{
    id: roleId, source_id: roleId, parent_id: null, parent_source_id: null,
    type: 'role', name: draft.identity?.position || 'Cargo', description: '', order_index: 0, status: 'draft',
  }];
  const append = (node: any, parentId: string, type: string) => {
    rows.push({
      id: node.id, source_id: node.id, parent_id: parentId, parent_source_id: parentId,
      type, name: node.title, description: node.description || '', order_index: node.order || 0, status: 'draft',
    });
  };
  for (const discipline of draft.curriculum || []) {
    append(discipline, roleId, 'discipline');
    for (const topic of discipline.topics || []) {
      append(topic, discipline.id, 'topic');
      for (const subtopic of topic.subtopics || []) append(subtopic, topic.id, 'subtopic');
    }
  }
  return rows;
}

function previewQuestionSource(payload: any) {
  const rawEntries = Array.isArray(payload?.traces) && payload.traces.length
    ? payload.traces
    : (Array.isArray(payload?.source) ? payload.source : [payload?.source]);
  return rawEntries.map((entry: any) => {
    if (typeof entry === 'string') return entry.trim();
    if (!entry || typeof entry !== 'object') return '';
    const name = entry.source_name || entry.title || entry.source_id || '';
    const location = entry.location || (entry.page_number ? `página ${entry.page_number}` : '');
    const traceStatus = entry.trace_status === 'missing' ? 'rastreabilidade ausente declarada' : '';
    return [name, location, traceStatus].filter(Boolean).join(' · ');
  }).filter(Boolean).join(' | ');
}

async function draftPreviewPackage(admin: any, draftId: string, userId: string) {
  const draft = await ownedDraft(admin, draftId, userId);
  if (!['package_imported', 'map_approved'].includes(draft.status) || draft.validation_report?.valid !== true) {
    throw new Error('package_not_ready');
  }
  const questions = [];
  for (let from = 0; from < Number(draft.question_count || 0); from += 1000) {
    const { data, error } = await admin.from('course_factory_draft_questions')
      .select('payload,order_index').eq('course_draft_id', draftId)
      .order('order_index').range(from, from + 999);
    if (error) throw error;
    questions.push(...(data || []).map(({ payload }: any) => {
      const source = previewQuestionSource(payload);
      return {
        ...payload,
        source,
        fonte: source,
        concursoId: draft.identity.contest_id,
        contest_id: draft.identity.contest_id,
        topicoEditalId: payload.subtopic_id,
        enunciado: payload.statement,
        alternativas: payload.options,
        respostaCorreta: payload.correct_answer,
        explicacao: payload.explanation,
        situacao: 'draft',
      };
    }));
  }
  const course = draft.package_metadata?.course || {};
  return {
    id: `${draft.identity.contest_id}-assisted-preview`,
    contestId: draft.identity.contest_id,
    version: `assisted-${draft.revision}-${String(draft.package_hash).slice(0, 12)}`,
    contentHash: draft.package_hash,
    metadata: {
      ...(draft.package_metadata?.metadata || {}),
      contest_id: draft.identity.contest_id,
      position_id: draft.identity.position_id,
      offering_id: draft.identity.offering_id,
      exam_date: draft.identity.exam_date,
      code: course.code || draft.identity.contest_id,
      name: draft.identity.contest_name,
      role: draft.identity.position,
      description: course.description || 'Curso importado pela Course Factory.',
      icon: course.code || 'DT',
      course_draft_id: draft.id,
    },
    curriculum: previewCurriculum(draft),
    questions,
    previewOnly: true,
    publicationBlocked: true,
  };
}

function publicValidation(report: any) {
  return {
    valid: report.valid,
    errors: report.errors,
    warnings: report.warnings,
    counts: report.counts,
    coverage: report.coverage,
    package_hash: report.package_hash,
  };
}

function homologationCourseSummary(draft: any) {
  const curriculum = Array.isArray(draft.curriculum) ? draft.curriculum : [];
  const course = draft.package_metadata?.course || {};
  let topicCount = 0;
  let subtopicCount = 0;
  for (const discipline of curriculum) {
    const topics = Array.isArray(discipline?.topics) ? discipline.topics : [];
    topicCount += topics.length;
    for (const topic of topics) subtopicCount += Array.isArray(topic?.subtopics) ? topic.subtopics.length : 0;
  }
  return {
    draftId: draft.id,
    contestId: draft.identity?.contest_id,
    code: course.code || draft.identity?.contest_id,
    name: draft.identity?.contest_name || course.name,
    role: draft.identity?.position || course.position,
    description: course.description || 'Curso em homologação na Course Factory.',
    organization: draft.identity?.organization || course.organization,
    examBoard: draft.identity?.board || course.board,
    examDate: draft.identity?.exam_date || course.exam_date,
    disciplineCount: curriculum.length,
    topicCount,
    subtopicCount,
    questionCount: Number(draft.question_count || 0),
    previewOnly: true,
    publicationStatus: 'testing',
    salesStatus: 'unavailable',
  };
}

function errorStatus(message: string) {
  if (message === 'course_factory_unavailable') return 503;
  if (message === 'invalid_session') return 401;
  if (message === 'developer_required' || message === 'origin_not_allowed') return 403;
  if (message === 'course_draft_not_found') return 404;
  if (/duplicate|23505/.test(message)) return 409;
  if (/payload_too_large|file_size/.test(message)) return 413;
  return 400;
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : 'invalid_request';
  const safe = new Set([
    'invalid_session', 'developer_required', 'origin_not_allowed', 'request_not_allowed',
    'payload_too_large', 'course_draft_not_found', 'source_not_found', 'draft_sources_locked',
    'draft_locked', 'package_not_ready', 'pdf_signature_invalid', 'upload_size_mismatch',
    'action_not_allowed', 'unexpected_field', 'required_field_missing', 'invalid_request',
  ]);
  if (safe.has(message) || /^[a-z][a-z0-9_]{1,80}_(?:invalid|required|locked|mismatch|disabled|allowed)$/.test(message)) return message;
  return 'course_factory_unavailable';
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const preflight = handleCorsPreflight(request, origins);
  if (preflight) return preflight;
  try {
    if (!isAllowedOrigin(origin, origins)) throw new Error('origin_not_allowed');
    if (request.method !== 'POST') throw new Error('request_not_allowed');
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw new Error('payload_too_large');
    const { admin, user } = await requireDeveloper(request);
    const body = validateAssistedFactoryRequest(await request.json());

    if (body.action === 'capabilities') {
      return response(200, {
        mode: 'assisted',
        automaticAI: false,
        openAIKeyRequired: false,
        paidAIRequestsEnabled: false,
        schemaVersion: ASSISTED_PACKAGE_SCHEMA_VERSION,
        persistence: 'supabase_staging_private',
        publicationEnabled: false,
      }, origin);
    }
    if (body.action === 'list_drafts') {
      const { data, error } = await admin.from('course_factory_drafts')
        .select('id,status,identity,package_hash,validation_report,coverage,question_count,revision,approved_at,created_at,updated_at')
        .eq('created_by', user.id).order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      return response(200, { drafts: data || [] }, origin);
    }
    if (body.action === 'list_homologation_courses') {
      const { data, error } = await admin.from('course_factory_drafts')
        .select('id,status,identity,curriculum,package_metadata,validation_report,question_count,updated_at')
        .eq('created_by', user.id)
        .in('status', ['package_imported', 'map_approved'])
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const seen = new Set();
      const courses = (data || [])
        .filter((draft: any) => draft.validation_report?.valid === true)
        .map(homologationCourseSummary)
        .filter((course: any) => {
          if (!course.contestId || seen.has(course.contestId)) return false;
          seen.add(course.contestId);
          return true;
        });
      return response(200, { courses }, origin);
    }
    if (body.action === 'create_draft') {
      const { data, error } = await admin.from('course_factory_drafts').insert({ created_by: user.id, status: 'sources' }).select('*').single();
      if (error) throw error;
      return response(201, { draft: data, sources: [], question_samples: [], audit_events: [] }, origin);
    }
    if (body.action === 'get_draft') return response(200, await draftEnvelope(admin, body.draftId, user.id), origin);
    if (body.action === 'get_preview_package') {
      return response(200, { package: await draftPreviewPackage(admin, body.draftId, user.id) }, origin);
    }

    const draft = await ownedDraft(admin, body.draftId, user.id);
    if (body.action === 'create_signed_upload') {
      if (['package_imported', 'map_approved'].includes(draft.status)) throw new Error('draft_sources_locked');
      const sourceId = crypto.randomUUID();
      const storagePath = `${user.id}/${body.draftId}/${sourceId}.pdf`;
      const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
      if (signedError) throw signedError;
      const { data: source, error } = await admin.from('course_factory_sources').insert({
        id: sourceId,
        course_draft_id: body.draftId,
        uploaded_by: user.id,
        source_type: body.source.sourceType,
        category: body.source.category,
        file_name: body.source.name,
        mime_type: body.source.mimeType,
        byte_size: body.source.size,
        storage_path: storagePath,
      }).select('id,course_draft_id,source_type,category,file_name,mime_type,byte_size,status,created_at').single();
      if (error) throw error;
      return response(201, { source, upload: { bucket: BUCKET, path: signed.path, token: signed.token } }, origin);
    }
    if (body.action === 'complete_upload') {
      if (['package_imported', 'map_approved'].includes(draft.status)) throw new Error('draft_sources_locked');
      const { data: source, error } = await admin.from('course_factory_sources').select('*')
        .eq('id', body.sourceId).eq('course_draft_id', body.draftId).eq('status', 'awaiting_upload').single();
      if (error) throw new Error('source_not_found');
      const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(source.storage_path);
      if (downloadError) throw downloadError;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length !== Number(source.byte_size)) throw new Error('upload_size_mismatch');
      if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('pdf_signature_invalid');
      const { data: updated, error: updateError } = await admin.from('course_factory_sources')
        .update({ status: 'uploaded', updated_at: new Date().toISOString() }).eq('id', source.id)
        .select('id,course_draft_id,source_type,category,file_name,mime_type,byte_size,status,created_at,updated_at').single();
      if (updateError) throw updateError;
      return response(200, { source: updated }, origin);
    }
    if (body.action === 'remove_source') {
      if (['package_imported', 'map_approved'].includes(draft.status)) throw new Error('draft_sources_locked');
      const { data: source, error } = await admin.from('course_factory_sources').select('id,storage_path')
        .eq('id', body.sourceId).eq('course_draft_id', body.draftId).single();
      if (error) throw new Error('source_not_found');
      const { error: storageError } = await admin.storage.from(BUCKET).remove([source.storage_path]);
      if (storageError) throw storageError;
      const { error: deleteError } = await admin.from('course_factory_sources').delete().eq('id', source.id);
      if (deleteError) throw deleteError;
      return response(200, { removed: true }, origin);
    }
    if (body.action === 'validate_package' || body.action === 'import_package') {
      if (draft.status === 'map_approved') throw new Error('draft_locked');
      const { data: sources, error: sourcesError } = await admin.from('course_factory_sources').select('*')
        .eq('course_draft_id', body.draftId).order('created_at');
      if (sourcesError) throw sourcesError;
      const validation = await validateAssistedCoursePackage(body.package, { uploadedSources: sources || [] });
      if (body.action === 'validate_package') return response(200, { report: publicValidation(validation) }, origin);
      if (!validation.valid) return response(422, { error: 'package_invalid', report: publicValidation(validation) }, origin);
      const report = publicValidation(validation);
      const packageMetadata = {
        operation_id: validation.normalized.operation_id,
        course: validation.normalized.course,
        metadata: validation.normalized.metadata,
        counts: validation.counts,
        automatic_ai: false,
      };
      const { error } = await admin.rpc('import_course_factory_assisted_package', {
        p_draft_id: body.draftId,
        p_actor_user_id: user.id,
        p_identity: validation.identity,
        p_curriculum: validation.normalized.curriculum_tree,
        p_edital_map: validation.normalized.edital_map,
        p_microknowledges: validation.normalized.microknowledges,
        p_sources_manifest: validation.normalized.sources,
        p_package_metadata: packageMetadata,
        p_validation_report: report,
        p_coverage: validation.coverage,
        p_package_hash: validation.package_hash,
        p_questions: validation.normalized.questions,
      });
      if (error) throw error;
      return response(200, await draftEnvelope(admin, body.draftId, user.id), origin);
    }
    if (body.action === 'approve_map') {
      if (draft.status !== 'package_imported' || draft.validation_report?.valid !== true) throw new Error('package_not_ready');
      const { error } = await admin.rpc('approve_course_factory_assisted_map', {
        p_draft_id: body.draftId,
        p_actor_user_id: user.id,
      });
      if (error) throw error;
      return response(200, {
        ...(await draftEnvelope(admin, body.draftId, user.id)),
        publicationEnabled: false,
        nextStage: 'publication_preparation',
      }, origin);
    }
    throw new Error('action_not_allowed');
  } catch (error) {
    const message = publicError(error);
    return response(errorStatus(message), { error: message }, origin);
  }
});
