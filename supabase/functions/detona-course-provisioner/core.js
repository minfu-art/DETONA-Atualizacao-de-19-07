import { validateContestRecord, validateAdminContestRequest } from '../admin-contests/core.js';
import { validateEditorialRequest } from '../admin-editorial/core.js';
import { inspectImageBytes, validateMediaRequest } from '../admin-media/core.js';
import { assertExactKeys, assertPlainObject, safeEnum, safeId, safeText } from '../_shared/adminValidation.js';

export const COURSE_PROVISION_ACTIONS = Object.freeze([
  'validate_course_bundle',
  'apply_course_bundle',
  'verify_course_bundle',
  'get_course_operation',
]);

const ASSET_SLOTS = Object.freeze(['battle_avatar', 'success', 'error', 'attention', 'cover']);
const OPERATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_ASSET_BYTES = 8_388_608;
const MAX_BATCHES = 500;

export class CourseOperatorError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CourseOperatorError';
    this.status = status;
    this.code = code;
  }
}

function reject(code, message, status = 400) {
  throw new CourseOperatorError(status, code, message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonical(value));
}

export async function sha256(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function decodeBase64(value, label) {
  const clean = String(value || '');
  if (!clean || clean.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) reject('ASSET_INVALID', `${label} possui conteúdo inválido.`);
  try {
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) reject('ASSET_INVALID', `${label} excede 8 MB.`);
    return bytes;
  } catch {
    reject('ASSET_INVALID', `${label} possui conteúdo inválido.`);
  }
}

function operationId(value) {
  const clean = String(value || '');
  if (!OPERATION_PATTERN.test(clean)) reject('OPERATION_ID_INVALID', 'operation_id inválido.');
  return clean;
}

function validateQuestion(raw, contestId, subtopicIds, batchName, index) {
  const question = assertExactKeys(assertPlainObject(raw), [
    'id', 'question_id', 'contest_id', 'subtopic_id', 'topicoEditalId',
    'statement', 'enunciado', 'options', 'alternativas', 'correct_answer',
    'respostaCorreta', 'explanation', 'explicacao', 'difficulty', 'dificuldade',
    'source', 'is_trick',
  ]);
  const id = safeId(question.id || question.question_id, 'question_id');
  if (question.contest_id && question.contest_id !== contestId) {
    reject('QUESTION_CONTEST_MISMATCH', `${batchName}#${index + 1} pertence a outro concurso.`);
  }
  const subtopicId = safeId(question.subtopic_id || question.topicoEditalId, 'subtopic_id');
  if (!subtopicIds.has(subtopicId)) {
    reject('QUESTION_SUBTOPIC_INVALID', `${batchName}#${index + 1} aponta para subtópico inexistente.`);
  }
  const statement = safeText(question.statement || question.enunciado, 'statement', 10_000);
  const explanation = safeText(question.explanation || question.explicacao, 'explanation', 20_000);
  const correctAnswer = question.correct_answer ?? question.respostaCorreta;
  const answer = typeof correctAnswer === 'boolean'
    ? correctAnswer
    : ['c', 'certo', 'true'].includes(String(correctAnswer).toLowerCase()) ? true
      : ['e', 'errado', 'false'].includes(String(correctAnswer).toLowerCase()) ? false : null;
  if (answer == null) reject('QUESTION_ANSWER_INVALID', `${batchName}#${index + 1} possui gabarito inválido.`);
  const options = question.options || question.alternativas || [];
  if (!Array.isArray(options)) reject('QUESTION_OPTIONS_INVALID', `${batchName}#${index + 1} possui alternativas inválidas.`);
  return {
    id,
    contest_id: contestId,
    subtopic_id: subtopicId,
    statement,
    options,
    correct_answer: answer,
    explanation,
    difficulty: question.difficulty ?? question.dificuldade ?? null,
    source: question.source ?? null,
    is_trick: Boolean(question.is_trick),
  };
}

async function validateAssets(rawAssets) {
  if (!Array.isArray(rawAssets) || !rawAssets.length || rawAssets.length > ASSET_SLOTS.length) {
    reject('ASSETS_INVALID', 'O bundle deve possuir de um a cinco assets.');
  }
  const slots = new Set();
  const assets = [];
  for (const raw of rawAssets) {
    const asset = assertExactKeys(assertPlainObject(raw), [
      'slot', 'name', 'mime_type', 'content_base64',
    ], ['slot', 'name', 'mime_type', 'content_base64']);
    const slot = safeEnum(asset.slot, ASSET_SLOTS, 'asset_slot');
    if (slots.has(slot)) reject('ASSET_DUPLICATE', `Asset duplicado: ${slot}.`);
    slots.add(slot);
    const name = safeText(asset.name, 'asset_name', 180);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|webp)$/.test(name)) reject('ASSET_NAME_INVALID', 'Nome de asset inseguro.');
    const mimeType = safeEnum(asset.mime_type, ['image/png', 'image/webp'], 'asset_mime');
    const bytes = decodeBase64(asset.content_base64, name);
    let inspected;
    try {
      inspected = inspectImageBytes(bytes, mimeType);
    } catch {
      reject('ASSET_INVALID', `${name} não é uma imagem suportada.`);
    }
    if (inspected.width > 8192 || inspected.height > 8192
      || inspected.width * inspected.height > 16_777_216) reject('ASSET_DIMENSIONS_INVALID', `${name} possui dimensões inválidas.`);
    if (slot !== 'cover' && !inspected.hasTransparency) reject('ASSET_TRANSPARENCY_REQUIRED', `${name} precisa de transparência.`);
    validateMediaRequest({
      action: 'create_signed_upload',
      contestId: 'validation_only',
      file: { name, mimeType, size: bytes.length },
    });
    assets.push({
      slot,
      name,
      mime_type: mimeType,
      bytes,
      size: bytes.length,
      width: inspected.width,
      height: inspected.height,
      has_transparency: inspected.hasTransparency,
      hash: await sha256(bytes),
    });
  }
  if (!slots.has('battle_avatar')) reject('BATTLE_AVATAR_REQUIRED', 'O avatar principal é obrigatório.');
  return assets;
}

export async function validateCourseBundle(rawBundle) {
  const bundle = assertExactKeys(assertPlainObject(rawBundle), [
    'schema_version', 'operation_id', 'contest', 'curriculum', 'question_batches', 'assets',
  ], ['schema_version', 'operation_id', 'contest', 'curriculum', 'question_batches', 'assets']);
  if (bundle.schema_version !== 1) reject('SCHEMA_VERSION_INVALID', 'schema_version deve ser 1.');
  const contest = validateContestRecord(bundle.contest);
  if (contest.price_cents !== 0 || !['draft', 'preparing'].includes(contest.content_status)
    || contest.sales_status !== 'unavailable') {
    reject('UNSAFE_CONTEST_STATE', 'O curso deve permanecer sem preço, indisponível e em preparação.');
  }
  const curriculumRaw = assertExactKeys(assertPlainObject(bundle.curriculum), [
    'schema_version', 'contest_id', 'nodes',
  ], ['schema_version', 'contest_id', 'nodes']);
  if (curriculumRaw.contest_id !== contest.id) reject('CURRICULUM_CONTEST_MISMATCH', 'Currículo pertence a outro concurso.');
  const curriculumRequest = validateAdminContestRequest({
    action: 'validate_curriculum_import',
    contestId: contest.id,
    schemaVersion: curriculumRaw.schema_version,
    nodes: curriculumRaw.nodes,
  });
  const subtopicIds = new Set(curriculumRequest.nodes.filter(({ type }) => type === 'subtopic').map(({ source_id }) => source_id));
  const batchesRaw = bundle.question_batches;
  if (!Array.isArray(batchesRaw) || batchesRaw.length > MAX_BATCHES) reject('BATCHES_INVALID', 'Lotes de questões inválidos.');
  const questionIds = new Set();
  const questionBatches = batchesRaw.map((raw, batchIndex) => {
    const batch = assertExactKeys(assertPlainObject(raw), ['name', 'questions'], ['name', 'questions']);
    const name = safeText(batch.name, 'batch_name', 160);
    if (!Array.isArray(batch.questions) || !batch.questions.length || batch.questions.length > 1000) {
      reject('BATCH_INVALID', `${name} possui quantidade inválida de questões.`);
    }
    const questions = batch.questions.map((question, index) => {
      const normalized = validateQuestion(question, contest.id, subtopicIds, name, index);
      if (questionIds.has(normalized.id)) reject('QUESTION_DUPLICATE', `ID de questão duplicado: ${normalized.id}.`);
      questionIds.add(normalized.id);
      return normalized;
    });
    validateEditorialRequest({
      action: 'validate_batch',
      contestId: contest.id,
      batchName: name,
      questions,
    });
    return { name, questions, order: batchIndex };
  });
  const assets = await validateAssets(bundle.assets);
  const operation = operationId(bundle.operation_id);
  const hashInput = {
    schema_version: 1,
    operation_id: operation,
    contest,
    curriculum: curriculumRequest.nodes,
    question_batches: questionBatches,
    assets: assets.map(({ slot, name, mime_type, hash }) => ({ slot, name, mime_type, hash })),
  };
  return {
    schema_version: 1,
    operation_id: operation,
    contest,
    curriculum: {
      schema_version: 1,
      contest_id: contest.id,
      nodes: curriculumRequest.nodes,
    },
    question_batches: questionBatches,
    assets,
    bundle_hash: await sha256(stableJson(hashInput)),
    summary: {
      operation_id: operation,
      contest_id: contest.id,
      code: contest.code,
      slug: contest.slug,
      curriculum_nodes: curriculumRequest.nodes.length,
      roles: curriculumRequest.nodes.filter(({ type }) => type === 'role').length,
      disciplines: curriculumRequest.nodes.filter(({ type }) => type === 'discipline').length,
      topics: curriculumRequest.nodes.filter(({ type }) => type === 'topic').length,
      subtopics: subtopicIds.size,
      batches: questionBatches.length,
      questions: questionBatches.reduce((total, batch) => total + batch.questions.length, 0),
      assets: assets.map(({ slot, name, size, width, height, hash }) => ({ slot, name, size, width, height, hash })),
    },
  };
}

export function validateCourseOperatorPayload(input) {
  const payload = assertPlainObject(input);
  const action = String(payload.action || '');
  if (!COURSE_PROVISION_ACTIONS.includes(action)) reject('ACTION_INVALID', 'Ação inválida.');
  if (action === 'get_course_operation') {
    assertExactKeys(payload, ['action', 'environment', 'operation_id'], ['action', 'environment', 'operation_id']);
    return {
      action,
      environment: safeEnum(payload.environment, ['staging'], 'environment'),
      operation_id: operationId(payload.operation_id),
    };
  }
  if (action === 'apply_course_bundle') {
    assertExactKeys(payload, [
      'action', 'environment', 'operation_id', 'bundle', 'confirmation_token', 'confirmation',
    ], ['action', 'environment', 'operation_id', 'bundle', 'confirmation_token', 'confirmation']);
    return {
      action,
      environment: safeEnum(payload.environment, ['staging'], 'environment'),
      operation_id: operationId(payload.operation_id),
      bundle: payload.bundle,
      confirmation_token: safeText(payload.confirmation_token, 'confirmation_token', 256),
      confirmation: safeText(payload.confirmation, 'confirmation', 240),
    };
  }
  assertExactKeys(payload, ['action', 'environment', 'bundle'], ['action', 'environment', 'bundle']);
  return {
    action,
    environment: safeEnum(payload.environment, ['staging'], 'environment'),
    bundle: payload.bundle,
  };
}

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function bearer(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match?.[1]) reject('UNAUTHORIZED', 'Sessão ausente ou inválida.', 401);
  return match[1];
}

function publicOperation(operation) {
  return {
    operation_id: operation.operation_id,
    contest_id: operation.contest_id,
    bundle_hash: operation.bundle_hash,
    status: operation.status,
    summary: operation.summary || {},
    report: operation.report || {},
    steps: operation.steps || {},
    error_code: operation.error_code || null,
    created_at: operation.created_at,
    updated_at: operation.updated_at,
    completed_at: operation.completed_at || null,
  };
}

export function createCourseOperatorHandler({
  resolveIdentity,
  repository,
  orchestrator,
  corsHeaders = {},
  tokenFactory = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
}) {
  return async function courseOperatorHandler(request) {
    if (request.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }, corsHeaders);
    try {
      const identity = await resolveIdentity(bearer(request));
      if (!identity?.userId) reject('UNAUTHORIZED', 'Sessão ausente ou inválida.', 401);
      if (identity.role !== 'developer') reject('FORBIDDEN', 'Acesso restrito à equipe autorizada.', 403);
      if (!(await repository.consumeRateLimit(identity.userId))) reject('RATE_LIMITED', 'Limite temporário excedido.', 429);
      let raw;
      try { raw = await request.json(); } catch { reject('INVALID_JSON', 'Envie um JSON válido.'); }
      const payload = validateCourseOperatorPayload(raw);

      if (payload.action === 'get_course_operation') {
        const operation = await repository.getOperation(payload.operation_id, identity.userId);
        if (!operation) reject('OPERATION_NOT_FOUND', 'Operação não encontrada.', 404);
        return json(200, { operation: publicOperation(operation) }, corsHeaders);
      }

      const bundle = await validateCourseBundle(payload.bundle);
      if (payload.action === 'verify_course_bundle') {
        const report = await orchestrator.inspect(bundle, identity);
        return json(200, { result: report.exact ? 'COURSE_PROVISION_READY' : 'COURSE_PROVISION_PARTIAL', bundle: bundle.summary, report }, corsHeaders);
      }

      if (payload.action === 'validate_course_bundle') {
        const report = await orchestrator.inspect(bundle, identity);
        if (report.conflicts?.length) {
          return json(409, { result: 'COURSE_PROVISION_INVALID', bundle: bundle.summary, report }, corsHeaders);
        }
        const confirmationToken = tokenFactory();
        const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
        await repository.saveValidation({
          actorUserId: identity.userId,
          bundle,
          report,
          confirmationTokenHash: await sha256(confirmationToken),
          expiresAt,
        });
        return json(200, {
          result: 'COURSE_PROVISION_VALID',
          bundle: bundle.summary,
          report,
          confirmation_token: confirmationToken,
          confirmation_expires_at: expiresAt,
          required_confirmation: `CONFIRMAR CRIAÇÃO ${bundle.contest.code} NO STAGING`,
        }, corsHeaders);
      }

      if (payload.operation_id !== bundle.operation_id) reject('OPERATION_MISMATCH', 'operation_id não corresponde ao bundle.');
      const expectedConfirmation = `CONFIRMAR CRIAÇÃO ${bundle.contest.code} NO STAGING`;
      if (payload.confirmation !== expectedConfirmation) reject('CONFIRMATION_REQUIRED', 'Confirmação explícita inválida.', 409);
      const operation = await repository.getOperation(payload.operation_id, identity.userId);
      if (!operation) reject('OPERATION_NOT_FOUND', 'Valide o bundle antes do apply.', 404);
      if (operation.status === 'completed') {
        return json(200, { result: 'COURSE_PROVISION_ALREADY_APPLIED', operation: publicOperation(operation) }, corsHeaders);
      }
      if (operation.bundle_hash !== bundle.bundle_hash) reject('BUNDLE_TOKEN_MISMATCH', 'O token pertence a outro bundle.', 409);
      const claimed = await repository.claimOperation({
        operationId: payload.operation_id,
        actorUserId: identity.userId,
        bundleHash: bundle.bundle_hash,
        confirmationTokenHash: await sha256(payload.confirmation_token),
      });
      if (!claimed) reject('CONFIRMATION_TOKEN_INVALID', 'Token inválido, expirado ou já utilizado.', 409);
      try {
        const result = await orchestrator.apply(bundle, identity, async (steps) => {
          await repository.updateProgress(payload.operation_id, identity.userId, steps);
        });
        const completed = await repository.completeOperation(payload.operation_id, identity.userId, result);
        return json(200, { result: 'COURSE_PROVISION_READY', operation: publicOperation(completed), report: result }, corsHeaders);
      } catch (error) {
        await repository.failOperation(payload.operation_id, identity.userId, error?.code || 'COURSE_PROVISION_PARTIAL');
        throw error;
      }
    } catch (error) {
      if (error instanceof CourseOperatorError) {
        return json(error.status, { error: { code: error.code, message: error.message } }, corsHeaders);
      }
      return json(500, {
        error: { code: 'COURSE_PROVISION_FAILED', message: 'Não foi possível concluir a operação.' },
      }, corsHeaders);
    }
  };
}

export function isHash(value) {
  return HASH_PATTERN.test(String(value || ''));
}
