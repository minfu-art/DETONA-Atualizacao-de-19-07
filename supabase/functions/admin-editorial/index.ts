import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OPERATIONAL_CAPABILITIES } from '../_shared/adminValidation.js';
import { createAllowedOrigins, handleCorsPreflight, jsonResponse } from '../_shared/cors.js';
import {
  assertEditorialTransition,
  sanitizedEditorialErrorCode,
  validateEditorialRequest,
  validateRemoteEditorialBatch,
} from './core.js';

const origins = createAllowedOrigins(Deno.env.get('ADMIN_ALLOWED_ORIGINS'));
const respond = (status: number, payload: unknown, origin = '') => (
  jsonResponse(status, payload, origin, origins)
);

async function audit(admin: any, actorId: string, contestId: string, action: string, targetId: string, metadata = {}) {
  const { error } = await admin.from('admin_audit_log').insert({
    actor_user_id: actorId, contest_id: contestId, module: 'editorial',
    action, target_type: 'question_content', target_id: targetId, metadata,
  });
  if (error) throw new Error('audit_failure');
}

const questionId = (question: Record<string, unknown>) => (
  String(question.id || question.question_id || '').trim()
);

const questionSubtopicId = (question: Record<string, unknown>) => (
  String(question.subtopic_id || question.topicoEditalId || '').trim()
);

async function validateBatch(admin: any, contestId: string, questions: Record<string, unknown>[]) {
  const questionIds = [...new Set(questions.map(questionId).filter(Boolean))];
  const subtopicIds = [...new Set(questions.map(questionSubtopicId).filter(Boolean))];
  const contestQuery = admin.from('admin_contests').select('id').eq('id', contestId).maybeSingle();
  const curriculumQuery = subtopicIds.length
    ? admin.from('admin_curriculum_nodes').select('source_id,contest_id,type').in('source_id', subtopicIds).eq('type', 'subtopic')
    : Promise.resolve({ data: [], error: null });
  const existingQuery = questionIds.length
    ? admin.from('editorial_questions').select('source_question_id,contest_id')
      .eq('contest_id', contestId).in('source_question_id', questionIds)
    : Promise.resolve({ data: [], error: null });
  const [contestResult, curriculumResult, existingResult] = await Promise.all([
    contestQuery,
    curriculumQuery,
    existingQuery,
  ]);
  if (contestResult.error) throw contestResult.error;
  if (curriculumResult.error) throw curriculumResult.error;
  if (existingResult.error) throw existingResult.error;
  return validateRemoteEditorialBatch({
    contestId,
    questions,
    contestExists: Boolean(contestResult.data),
    curriculumNodes: curriculumResult.data || [],
    existingQuestions: existingResult.data || [],
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const preflight = handleCorsPreflight(request, origins);
  if (preflight) return preflight;
  try {
    if (!origins.has(origin)) return respond(403, { error: 'origin_not_allowed' });
    if (request.method !== 'POST') return respond(403, { error: 'request_not_allowed' }, origin);
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return respond(401, { error: 'invalid_session' }, origin);
    if (Number(request.headers.get('content-length') || 0) > 2_100_000) return respond(413, { error: 'payload_too_large' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: userData } = await identity.auth.getUser();
    if (!userData.user) return respond(401, { error: 'invalid_session' }, origin);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'developer') return respond(403, { error: 'developer_required' }, origin);
    const body = validateEditorialRequest(await request.json());
    const { action } = body;

    if (action === 'list_questions') {
      const from = (body.page - 1) * body.pageSize;
      let query = admin.from('editorial_questions')
        .select('id,source_question_id,contest_id,status,difficulty,statement,explanation,curriculum_node_id,batch_id,version,created_at')
        .eq('contest_id', body.contestId).order('created_at', { ascending: false }).range(from, from + body.pageSize - 1);
      if (body.status) query = query.eq('status', body.status);
      if (body.search) query = query.or(`source_question_id.ilike.%${body.search}%,statement.ilike.%${body.search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return respond(200, { questions: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'list_batches') {
      const { data, error } = await admin.from('question_batches').select('*').eq('contest_id', body.contestId).order('created_at', { ascending: false });
      if (error) throw error;
      return respond(200, { batches: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'validate_batch' || action === 'import_draft') {
      const validation = await validateBatch(admin, body.contestId, body.questions);
      if (action === 'validate_batch') return respond(200, validation, origin);
      if (!validation.valid) return respond(422, { error: 'questions_invalid', ...validation }, origin);
    }
    if (action === 'import_draft') {
      const { data: batchId, error } = await admin.rpc('admin_import_question_draft', {
        target_contest_id: body.contestId,
        batch_name: body.batchName,
        imported_questions: body.questions,
        actor_id: userData.user.id,
      });
      if (error) throw error;
      return respond(201, { batchId, imported: body.questions.length }, origin);
    }
    if (action === 'update_draft') {
      const { data: node, error: nodeError } = await admin.from('admin_curriculum_nodes').select('id')
        .eq('contest_id', body.contestId).eq('source_id', body.question.subtopic_id).eq('type', 'subtopic').single();
      if (nodeError) throw nodeError;
      const sourceId = body.question.id;
      const { data, error } = await admin.from('editorial_questions').update({
        statement: body.question.statement,
        options: body.question.options || [],
        correct_answer: body.question.correct_answer,
        explanation: body.question.explanation,
        difficulty: body.question.difficulty || null,
        source: body.question.source || null,
        is_trick: body.question.is_trick === true,
        curriculum_node_id: node.id,
        payload: body.question,
        version: 2,
      }).eq('contest_id', body.contestId).eq('source_question_id', sourceId).eq('status', 'draft').select('*').single();
      if (error) throw error;
      await audit(admin, userData.user.id, body.contestId, action, sourceId);
      return respond(200, { question: data }, origin);
    }
    if (action === 'delete_draft') {
      const { data, error } = await admin.from('editorial_questions').delete().eq('contest_id', body.contestId)
        .in('source_question_id', body.questionIds).eq('status', 'draft').select('source_question_id');
      if (error) throw error;
      await audit(admin, userData.user.id, body.contestId, action, body.contestId, { count: data.length });
      return respond(200, { deleted: data.length }, origin);
    }
    if (action === 'transition') {
      const { data: rows, error: readError } = await admin.from('editorial_questions').select('source_question_id,status')
        .eq('contest_id', body.contestId).in('source_question_id', body.questionIds);
      if (readError) throw readError;
      rows.forEach((row: { status: string }) => assertEditorialTransition(row.status, body.status));
      const { data, error } = await admin.from('editorial_questions').update({
        status: body.status,
        reviewer_id: ['technical_review', 'approved'].includes(body.status) ? userData.user.id : null,
      }).eq('contest_id', body.contestId).in('source_question_id', body.questionIds).select('source_question_id,status');
      if (error) throw error;
      await audit(admin, userData.user.id, body.contestId, action, body.contestId, { count: data.length, status: body.status });
      return respond(200, { questions: data }, origin);
    }
    if (action === 'generate_snapshot') {
      const { data, error } = await admin.rpc('admin_generate_question_snapshot', {
        target_contest_id: body.contestId,
        snapshot_version: body.version,
        actor_id: userData.user.id,
      });
      if (error) throw error;
      return respond(201, { version: data }, origin);
    }
    return respond(409, { error: 'snapshot_publication_managed_by_content_package' }, origin);
  } catch (error) {
    return respond(400, { error: sanitizedEditorialErrorCode(error) }, origin);
  }
});
