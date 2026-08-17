import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getDocument } from 'npm:pdfjs-dist@6.2.108/legacy/build/pdf.mjs';
import { createAllowedOrigins, handleCorsPreflight, isAllowedOrigin, jsonResponse } from '../_shared/cors.js';
import {
  COURSE_FACTORY_AI_PROVIDER,
  DEFAULT_COURSE_FACTORY_MODEL,
  courseFactoryAnalysisSchema,
  extractResponseJson,
  normalizeCourseFactoryProposal,
  validateCourseFactoryRequest,
} from './core.js';
import { CourseFactoryAIService } from './courseFactoryAIService.js';

const BUCKET = 'course-factory-sources';
const MAX_TOTAL_SOURCE_BYTES = 41_943_040;
const origins = createAllowedOrigins(Deno.env.get('ADMIN_ALLOWED_ORIGINS'));
const response = (status: number, body: unknown, origin = '') => jsonResponse(status, body, origin, origins);

function safeModel() {
  const configured = String(Deno.env.get('COURSE_FACTORY_OPENAI_MODEL') || DEFAULT_COURSE_FACTORY_MODEL).trim();
  return /^gpt-[a-z0-9.-]{1,60}$/i.test(configured) ? configured : DEFAULT_COURSE_FACTORY_MODEL;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunkSize)));
  }
  return btoa(binary);
}

async function requireDeveloper(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('invalid_session');
  const url = Deno.env.get('SUPABASE_URL')!;
  const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await identity.auth.getUser();
  if (authError || !auth.user) throw new Error('invalid_session');
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== 'developer') throw new Error('developer_required');
  return { admin, user: auth.user };
}

async function ownedDraft(admin: any, draftId: string, userId: string) {
  const { data, error } = await admin.from('course_factory_drafts').select('*').eq('id', draftId).eq('created_by', userId).single();
  if (error || !data) throw new Error('course_draft_not_found');
  return data;
}

async function draftEnvelope(admin: any, draftId: string, userId: string) {
  const draft = await ownedDraft(admin, draftId, userId);
  const [{ data: sources, error: sourceError }, { data: runs, error: runError }] = await Promise.all([
    admin.from('course_factory_sources').select('id,course_draft_id,source_type,category,file_name,mime_type,byte_size,status,page_count,extraction_error,created_at,updated_at')
      .eq('course_draft_id', draftId).order('created_at', { ascending: true }),
    admin.from('course_factory_analysis_runs').select('id,status,provider,model,response_id,source_count,error_code,created_at,completed_at')
      .eq('course_draft_id', draftId).order('created_at', { ascending: false }).limit(10),
  ]);
  if (sourceError) throw sourceError;
  if (runError) throw runError;
  return { draft, sources: sources || [], analysis_runs: runs || [] };
}

async function extractPdfPages(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: bytes, disableWorker: true, useSystemFonts: true });
  const document = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    try {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => String(item.str || '')).join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ page_number: pageNumber, extracted_text: text, status: text ? 'extracted' : 'empty', error_message: null });
      page.cleanup();
    } catch (error) {
      pages.push({ page_number: pageNumber, extracted_text: '', status: 'error', error_message: error instanceof Error ? error.message.slice(0, 500) : 'page_extraction_failed' });
    }
  }
  await loadingTask.destroy();
  return pages;
}

async function extractAndPersist(admin: any, draftId: string, source: any) {
  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(source.storage_path);
  if (downloadError) throw downloadError;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length !== Number(source.byte_size)) throw new Error('upload_size_mismatch');
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('pdf_signature_invalid');
  let pages;
  try {
    pages = await extractPdfPages(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'pdf_extraction_failed';
    await admin.from('course_factory_sources').update({ status: 'extraction_error', extraction_error: message, updated_at: new Date().toISOString() }).eq('id', source.id);
    throw new Error('pdf_extraction_failed');
  }
  await admin.from('course_factory_source_pages').delete().eq('source_id', source.id);
  for (let index = 0; index < pages.length; index += 100) {
    const { error } = await admin.from('course_factory_source_pages').insert(pages.slice(index, index + 100).map((page: any) => ({
      course_draft_id: draftId, source_id: source.id, ...page,
    })));
    if (error) throw error;
  }
  const pageErrors = pages.filter(({ status }: any) => status === 'error');
  const { error: updateError } = await admin.from('course_factory_sources').update({
    status: pageErrors.length === pages.length ? 'extraction_error' : 'extracted',
    page_count: pages.length,
    extraction_error: pageErrors.length ? `${pageErrors.length} página(s) com erro de extração.` : null,
    updated_at: new Date().toISOString(),
  }).eq('id', source.id);
  if (updateError) throw updateError;
  return { ...source, page_count: pages.length, bytes, pages };
}

function analysisPrompt(sources: any[]) {
  const inventory = sources.map((source) => (
    `- ${source.file_name}: source_type=${source.source_type}; category=${source.category}; pages=${source.page_count}`
  )).join('\n');
  return `Você é o serviço de análise editorial da Course Factory do DETONA CONCURSOS.
Analise prioritariamente o EDITAL OFICIAL e use materiais complementares apenas como apoio.
Retorne exclusivamente o JSON exigido pelo schema.

REGRAS OBRIGATÓRIAS:
- Não invente informação ausente.
- Toda identidade, disciplina, tópico, subtópico e item do mapa precisa de ao menos uma citação com source_name, page_number e excerpt.
- Para cada identidade, nó curricular, item do mapa e microconhecimento, informe confidence entre 0 e 1.
- Identidade, currículo e escopo do mapa precisam citar o EDITAL OFICIAL; apoio complementar nunca substitui essa prova.
- source_name deve ser exatamente um nome do inventário abaixo.
- Conteúdo complementar não pode ampliar silenciosamente o edital: marque microconhecimento vindo apenas de apoio como scope_origin="complementary".
- O currículo representa o escopo oficial; não introduza disciplina apenas porque aparece em apostila.
- exam_date deve usar YYYY-MM-DD ou string vazia quando ausente.
- year deve usar quatro dígitos ou string vazia quando ausente.
- O Mapa do Edital deve detalhar escopo, conceitos, regras, exceções, aplicações, competências, conhecimentos necessários e microconhecimentos; não apenas repetir subtópicos.

FONTES DISPONÍVEIS:
${inventory}`;
}

async function callOpenAI(sources: any[]) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('ai_not_configured');
  const model = safeModel();
  const content: any[] = [{ type: 'input_text', text: analysisPrompt(sources) }];
  for (const source of sources) {
    content.push({
      type: 'input_file',
      filename: source.file_name,
      file_data: `data:application/pdf;base64,${bytesToBase64(source.bytes)}`,
      detail: source.source_type === 'official_edital' ? 'high' : 'low',
    });
  }
  const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [{ role: 'user', content }],
      reasoning: { effort: 'medium' },
      max_output_tokens: 64_000,
      text: { format: { type: 'json_schema', name: 'course_factory_analysis', strict: true, schema: courseFactoryAnalysisSchema() } },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const payload = await openAIResponse.json();
  if (!openAIResponse.ok) throw new Error(`ai_request_failed:${String(payload?.error?.code || openAIResponse.status)}`);
  return { payload, model, parsed: extractResponseJson(payload) };
}

function courseFactoryAIService() {
  return new CourseFactoryAIService({ analyzeSources: callOpenAI });
}

function errorStatus(message: string) {
  if (message === 'invalid_session') return 401;
  if (message === 'developer_required' || message === 'origin_not_allowed') return 403;
  if (message === 'course_draft_not_found') return 404;
  if (message === 'ai_not_configured') return 503;
  if (/duplicate|one_official|23505/.test(message)) return 409;
  if (/payload_too_large|file_size/.test(message)) return 413;
  if (/ai_request_failed|pdf_extraction_failed/.test(message)) return 422;
  return 400;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const preflight = handleCorsPreflight(request, origins);
  if (preflight) return preflight;
  try {
    if (!isAllowedOrigin(origin, origins)) throw new Error('origin_not_allowed');
    if (request.method !== 'POST') throw new Error('request_not_allowed');
    if (Number(request.headers.get('content-length') || 0) > 2_000_000) throw new Error('payload_too_large');
    const { admin, user } = await requireDeveloper(request);
    const body = validateCourseFactoryRequest(await request.json());

    if (body.action === 'capabilities') {
      return response(200, {
        aiConfigured: false,
        automaticAI: false,
        paidAIRequestsEnabled: false,
        provider: COURSE_FACTORY_AI_PROVIDER,
        model: safeModel(),
        persistence: 'supabase_staging_private',
        publicationEnabled: false,
      }, origin);
    }
    if (body.action === 'list_drafts') {
      const { data, error } = await admin.from('course_factory_drafts')
        .select('id,status,identity,analysis_summary,ai_provider,ai_model,revision,approved_at,created_at,updated_at')
        .eq('created_by', user.id).order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      return response(200, { drafts: data || [] }, origin);
    }
    if (body.action === 'create_draft') {
      const { data, error } = await admin.from('course_factory_drafts').insert({ created_by: user.id }).select('*').single();
      if (error) throw error;
      return response(201, { draft: data, sources: [], analysis_runs: [] }, origin);
    }
    if (body.action === 'get_draft') return response(200, await draftEnvelope(admin, body.draftId, user.id), origin);

    const draft = await ownedDraft(admin, body.draftId, user.id);
    if (body.action === 'create_signed_upload') {
      if (draft.status === 'analyzing' || draft.status === 'map_approved') throw new Error('draft_locked');
      const sourceId = crypto.randomUUID();
      const path = `${user.id}/${body.draftId}/${sourceId}.pdf`;
      const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (signError) throw signError;
      const { data: source, error } = await admin.from('course_factory_sources').insert({
        id: sourceId, course_draft_id: body.draftId, uploaded_by: user.id,
        source_type: body.source.sourceType, category: body.source.category,
        file_name: body.source.name, mime_type: body.source.mimeType,
        byte_size: body.source.size, storage_path: path,
      }).select('id,course_draft_id,source_type,category,file_name,mime_type,byte_size,status,created_at').single();
      if (error) throw error;
      return response(201, { source, upload: { bucket: BUCKET, path: signed.path, token: signed.token } }, origin);
    }
    if (body.action === 'complete_upload') {
      if (draft.status === 'analyzing' || draft.status === 'map_approved') throw new Error('draft_locked');
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
      if (draft.status === 'analyzing' || draft.status === 'map_approved') throw new Error('draft_locked');
      const { data: source, error } = await admin.from('course_factory_sources').select('id,storage_path')
        .eq('id', body.sourceId).eq('course_draft_id', body.draftId).single();
      if (error) throw new Error('source_not_found');
      const { error: storageError } = await admin.storage.from(BUCKET).remove([source.storage_path]);
      if (storageError) throw storageError;
      const { error: deleteError } = await admin.from('course_factory_sources').delete().eq('id', source.id);
      if (deleteError) throw deleteError;
      return response(200, { removed: true }, origin);
    }
    if (body.action === 'save_proposal') {
      if (!['proposed', 'analysis_failed'].includes(draft.status)) throw new Error('proposal_not_editable');
      const { data: sources, error: sourceError } = await admin.from('course_factory_sources').select('*').eq('course_draft_id', body.draftId);
      if (sourceError) throw sourceError;
      const normalized = normalizeCourseFactoryProposal(body.proposal, sources || []);
      const { data: updated, error } = await admin.from('course_factory_drafts').update({
        ...normalized, status: 'proposed', revision: Number(draft.revision || 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', body.draftId).select('*').single();
      if (error) throw error;
      return response(200, { draft: updated }, origin);
    }
    if (body.action === 'approve_map') {
      if (draft.status !== 'proposed') throw new Error('proposal_not_ready');
      if (!Array.isArray(draft.curriculum) || !draft.curriculum.length || !Array.isArray(draft.edital_map) || !draft.edital_map.length) throw new Error('proposal_incomplete');
      const now = new Date().toISOString();
      const { data: updated, error } = await admin.from('course_factory_drafts').update({
        status: 'map_approved', approved_at: now, approved_by: user.id, updated_at: now,
      }).eq('id', body.draftId).eq('status', 'proposed').select('*').single();
      if (error) throw error;
      return response(200, { draft: updated, publicationEnabled: false, nextPhase: 'question_planning' }, origin);
    }
    if (body.action === 'analyze_sources') {
      throw new Error('automatic_ai_disabled');
      /* Arquitetura preservada para eventual decisão futura do proprietário.
         O fluxo oficial atual usa course-factory-assisted e nunca alcança o provedor. */
      if (draft.status === 'analyzing' || draft.status === 'map_approved') throw new Error('draft_locked');
      if (!Deno.env.get('OPENAI_API_KEY')) throw new Error('ai_not_configured');
      const { data: sourceData, error: sourceError } = await admin.from('course_factory_sources').select('*')
        .eq('course_draft_id', body.draftId).in('status', ['uploaded', 'extracted', 'extraction_error']).order('created_at');
      if (sourceError) throw sourceError;
      const sourceRows = sourceData || [];
      if (!sourceRows.some(({ source_type: type }: any) => type === 'official_edital')) throw new Error('official_edital_required');
      if (sourceRows.reduce((sum: number, source: any) => sum + Number(source.byte_size), 0) > MAX_TOTAL_SOURCE_BYTES) throw new Error('sources_total_size_invalid');
      const model = safeModel();
      const { data: run, error: runError } = await admin.from('course_factory_analysis_runs').insert({
        course_draft_id: body.draftId, requested_by: user.id, status: 'running', provider: COURSE_FACTORY_AI_PROVIDER,
        model, source_count: sourceRows.length,
      }).select('*').single();
      if (runError) throw runError;
      await admin.from('course_factory_drafts').update({ status: 'analyzing', updated_at: new Date().toISOString() }).eq('id', body.draftId);
      try {
        const extracted = [];
        for (const source of sourceRows) extracted.push(await extractAndPersist(admin, body.draftId, source));
        const aiService = courseFactoryAIService();
        const ai = await aiService.analyzeSources(extracted);
        const proposal = aiService.composeProposal(ai.parsed);
        const normalized = normalizeCourseFactoryProposal(proposal, extracted);
        const now = new Date().toISOString();
        const { data: updated, error: updateError } = await admin.from('course_factory_drafts').update({
          ...normalized, status: 'proposed', ai_provider: COURSE_FACTORY_AI_PROVIDER, ai_model: ai.model,
          revision: Number(draft.revision || 0) + 1, updated_at: now,
        }).eq('id', body.draftId).select('*').single();
        if (updateError) throw updateError;
        await admin.from('course_factory_analysis_runs').update({ status: 'completed', response_id: ai.payload.id || null, completed_at: now }).eq('id', run.id);
        return response(200, { draft: updated, sources: extracted.map(({ bytes, pages, ...source }) => source) }, origin);
      } catch (error) {
        const errorCode = error instanceof Error ? error.message.slice(0, 300) : 'analysis_failed';
        const now = new Date().toISOString();
        await Promise.all([
          admin.from('course_factory_analysis_runs').update({ status: 'failed', error_code: errorCode, completed_at: now }).eq('id', run.id),
          admin.from('course_factory_drafts').update({ status: 'analysis_failed', updated_at: now }).eq('id', body.draftId),
        ]);
        throw error;
      }
    }
    throw new Error('action_not_allowed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return response(errorStatus(message), { error: message }, origin);
  }
});
