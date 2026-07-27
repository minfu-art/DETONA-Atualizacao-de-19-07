import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { inspectImageBytes } from '../../supabase/functions/admin-media/core.js';

const MAX_NODES = 10_000;
const MAX_QUESTIONS_PER_BATCH = 1_000;
const MAX_QUESTION_FILES = 500;
const MAX_JSON_BYTES = 2_000_000;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const SAFE_OPERATION_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/i;
const SAFE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const HTML = /<\/?[a-z][^>]*>/i;
const LEVELS = Object.freeze([
  ['roles', 'role'],
  ['disciplines', 'discipline'],
  ['topics', 'topic'],
  ['subtopics', 'subtopic'],
]);

export const ASSET_SLOTS = Object.freeze({
  battle_avatar: Object.freeze({ basename: 'battle-avatar', required: true, transparency: true }),
  success: Object.freeze({ basename: 'success', required: false, transparency: true }),
  error: Object.freeze({ basename: 'error', required: false, transparency: true }),
  attention: Object.freeze({ basename: 'attention', required: false, transparency: true }),
  cover: Object.freeze({ basename: 'cover', required: false, transparency: false }),
});

function fail(message, details = {}) {
  const error = new Error(message);
  error.code = 'COURSE_PROVISION_INVALID';
  error.details = details;
  throw error;
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} deve ser um objeto.`);
  return value;
}

function exactKeys(value, allowed, required, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) fail(`${label}: campo inesperado (${unexpected[0]}).`);
  const missing = required.filter((key) => value[key] == null || value[key] === '');
  if (missing.length) fail(`${label}: campo obrigatório ausente (${missing[0]}).`);
}

function text(value, label, max) {
  const clean = String(value ?? '').trim();
  if (!clean || clean.length > max || HTML.test(clean)) fail(`${label} inválido.`);
  return clean;
}

function safeId(value, label) {
  const clean = text(value, label, 80);
  if (!SAFE_ID.test(clean)) fail(`${label} inválido.`);
  return clean;
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

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

async function readJson(filePath, label) {
  let metadata;
  try {
    metadata = await stat(filePath);
  } catch {
    fail(`${label} não encontrado.`, { file: path.basename(filePath) });
  }
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_JSON_BYTES) {
    fail(`${label} possui tamanho inválido.`);
  }
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    fail(`${label} não contém JSON válido.`);
  }
}

export function validateContestManifest(raw, { mode = 'validate' } = {}) {
  const manifest = plainObject(structuredClone(raw), 'contest.json');
  exactKeys(manifest, ['schema_version', 'operation_id', 'contest'], ['schema_version', 'operation_id', 'contest'], 'contest.json');
  if (manifest.schema_version !== 1) fail('contest.json: schema_version deve ser 1.');
  if (!SAFE_OPERATION_ID.test(String(manifest.operation_id || ''))) fail('operation_id inválido.');
  const contest = plainObject(manifest.contest, 'contest');
  exactKeys(contest, [
    'id', 'code', 'slug', 'name', 'role', 'description', 'content_status',
    'sales_status', 'price_cents', 'currency', 'exam_date', 'color', 'accent',
    'icon', 'cover_asset',
  ], ['id', 'code', 'slug', 'name', 'role', 'description'], 'contest');

  const examDate = contest.exam_date == null || contest.exam_date === '' ? null : String(contest.exam_date);
  if (examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || Number.isNaN(Date.parse(`${examDate}T00:00:00Z`)))) {
    fail('exam_date inválida.');
  }
  const priceCents = Number(contest.price_cents ?? 0);
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) fail('price_cents inválido.');
  const contentStatus = String(contest.content_status || 'preparing');
  const salesStatus = String(contest.sales_status || 'unavailable');
  if (!['draft', 'preparing', 'ready', 'archived'].includes(contentStatus)) fail('content_status inválido.');
  if (!['unavailable', 'coming_soon', 'available', 'suspended'].includes(salesStatus)) fail('sales_status inválido.');
  if (mode !== 'verify' && priceCents !== 0) fail('Novo provisionamento exige price_cents = 0.');
  if (mode !== 'verify' && !['draft', 'preparing'].includes(contentStatus)) {
    fail('Novo provisionamento exige content_status draft ou preparing.');
  }
  if (mode !== 'verify' && salesStatus !== 'unavailable') fail('Novo provisionamento exige sales_status unavailable.');
  const currency = String(contest.currency || 'BRL').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail('currency inválida.');
  const color = String(contest.color || '#7c6af5');
  const accent = String(contest.accent || '#ff8a1f');
  if (!/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(accent)) fail('Cores inválidas.');

  return Object.freeze({
    schemaVersion: 1,
    operationId: String(manifest.operation_id),
    contest: Object.freeze({
      id: safeId(contest.id, 'contest.id'),
      code: text(contest.code, 'contest.code', 30),
      slug: safeId(contest.slug, 'contest.slug'),
      name: text(contest.name, 'contest.name', 160),
      role: text(contest.role, 'contest.role', 160),
      description: text(contest.description, 'contest.description', 600),
      price_cents: priceCents,
      currency,
      color,
      accent,
      icon: text(contest.icon || contest.code, 'contest.icon', 30),
      cover_asset: contest.cover_asset ? text(contest.cover_asset, 'contest.cover_asset', 500) : null,
      content_status: contentStatus,
      sales_status: salesStatus,
      exam_date: examDate,
    }),
  });
}

export function validateCurriculum(raw, contestId) {
  const payload = plainObject(structuredClone(raw), 'curriculum.json');
  exactKeys(payload, ['schema_version', 'contest_id', 'roles'], ['schema_version', 'contest_id', 'roles'], 'curriculum.json');
  if (payload.schema_version !== 1) fail('curriculum.json: schema_version deve ser 1.');
  if (String(payload.contest_id) !== contestId) fail('curriculum.json pertence a outro concurso.');
  if (!Array.isArray(payload.roles) || !payload.roles.length) fail('curriculum.json deve conter ao menos um cargo.');

  const ids = new Set();
  const nodes = [];
  const counts = { roles: 0, disciplines: 0, topics: 0, subtopics: 0 };
  const visit = (items, depth, parentSourceId = null) => {
    const [collection, type] = LEVELS[depth] || [];
    if (!collection || !Array.isArray(items)) fail('Hierarquia curricular inválida.');
    items.forEach((rawNode, index) => {
      const node = plainObject(rawNode, type);
      const childCollection = LEVELS[depth + 1]?.[0];
      exactKeys(node, ['id', 'name', 'description', 'order', ...(childCollection ? [childCollection] : [])], ['id', 'name'], type);
      const id = safeId(node.id, `${type}.id`);
      if (ids.has(id)) fail(`ID curricular duplicado: ${id}.`);
      ids.add(id);
      const order = Number(node.order ?? index);
      if (!Number.isInteger(order) || order < 0 || order > 100_000) fail(`Ordem inválida em ${id}.`);
      nodes.push({
        source_id: id,
        parent_source_id: parentSourceId,
        type,
        name: text(node.name, `${type}.name`, 240),
        description: node.description ? text(node.description, `${type}.description`, 1000) : null,
        order_index: order,
      });
      counts[collection] += 1;
      if (nodes.length > MAX_NODES) fail(`Currículo excede ${MAX_NODES} nós.`);
      if (childCollection) {
        if (!Array.isArray(node[childCollection]) || !node[childCollection].length) {
          fail(`${id} deve possuir ${childCollection}.`);
        }
        visit(node[childCollection], depth + 1, id);
      }
    });
  };
  visit(payload.roles, 0);
  return Object.freeze({ schemaVersion: 1, contestId, nodes: Object.freeze(nodes), counts: Object.freeze(counts) });
}

function questionArray(raw, filename) {
  const payload = Array.isArray(raw) ? raw : raw?.questions || raw?.questoes || raw?.items;
  if (!Array.isArray(payload) || !payload.length || payload.length > MAX_QUESTIONS_PER_BATCH) {
    fail(`${filename}: deve conter de 1 a ${MAX_QUESTIONS_PER_BATCH} questões.`);
  }
  return payload;
}

function answerKind(value) {
  if (value === true) return 'C';
  if (value === false) return 'E';
  const clean = String(value ?? '').trim().toLowerCase();
  if (['c', 'certo', 'true'].includes(clean)) return 'C';
  if (['e', 'errado', 'false'].includes(clean)) return 'E';
  return null;
}

function normalizeQuestion(raw, contestId, subtopicIds, filename, index, allIds) {
  const item = plainObject(raw, `${filename}#${index + 1}`);
  const id = safeId(item.id || item.question_id, `${filename}#${index + 1}.id`);
  if (allIds.has(id)) fail(`ID de questão duplicado entre lotes: ${id}.`);
  allIds.add(id);
  if (item.contest_id && String(item.contest_id) !== contestId) fail(`${filename}#${index + 1}: contest_id incorreto.`);
  const subtopicId = safeId(item.subtopic_id || item.topicoEditalId, `${filename}#${index + 1}.subtopic_id`);
  if (!subtopicIds.has(subtopicId)) fail(`${filename}#${index + 1}: subtópico inexistente (${subtopicId}).`);
  const statement = text(item.statement || item.enunciado, `${filename}#${index + 1}.statement`, 10_000);
  const explanation = text(item.explanation || item.explicacao, `${filename}#${index + 1}.explanation`, 20_000);
  const answer = item.correct_answer ?? item.respostaCorreta;
  const kind = answerKind(answer);
  if (!kind) fail(`${filename}#${index + 1}: gabarito C/E inválido.`);
  const options = item.options || item.alternativas || [];
  if (!Array.isArray(options)) fail(`${filename}#${index + 1}: options deve ser uma lista.`);
  return Object.freeze({
    ...item,
    id,
    contest_id: contestId,
    subtopic_id: subtopicId,
    statement,
    options,
    correct_answer: answer,
    explanation,
    status: 'draft',
    _answer_kind: kind,
  });
}

async function loadQuestionBatches(bundleDir, contestId, subtopicIds) {
  const questionsDir = path.join(bundleDir, 'questions');
  let entries = [];
  try {
    entries = await readdir(questionsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (files.length > MAX_QUESTION_FILES) fail(`O bundle excede ${MAX_QUESTION_FILES} lotes.`);
  const allIds = new Set();
  const batches = [];
  for (const filename of files) {
    if (!SAFE_FILE.test(filename)) fail(`Nome de lote inseguro: ${filename}.`);
    const raw = await readJson(path.join(questionsDir, filename), `questions/${filename}`);
    const questions = questionArray(raw, filename)
      .map((item, index) => normalizeQuestion(item, contestId, subtopicIds, filename, index, allIds));
    batches.push(Object.freeze({
      filename,
      batchName: filename.replace(/\.json$/i, ''),
      questions: Object.freeze(questions),
      hash: sha256(stableJson(questions.map(({ _answer_kind, ...question }) => question))),
    }));
  }
  return Object.freeze(batches);
}

async function findAsset(assetsDir, basename, required) {
  const candidates = [];
  for (const extension of ['png', 'webp']) {
    const filePath = path.join(assetsDir, `${basename}.${extension}`);
    try {
      if ((await stat(filePath)).isFile()) candidates.push(filePath);
    } catch {
      // Optional candidate is absent.
    }
  }
  if (candidates.length > 1) fail(`Forneça somente um formato para assets/${basename}.`);
  if (!candidates.length && required) fail(`Asset obrigatório ausente: assets/${basename}.png ou .webp.`);
  return candidates[0] || null;
}

async function loadAssets(bundleDir) {
  const assetsDir = path.join(bundleDir, 'assets');
  const assets = {};
  for (const [slot, definition] of Object.entries(ASSET_SLOTS)) {
    const filePath = await findAsset(assetsDir, definition.basename, definition.required);
    if (!filePath) continue;
    const name = path.basename(filePath);
    if (!SAFE_FILE.test(name)) fail(`Nome de asset inseguro: ${name}.`);
    const bytes = await readFile(filePath);
    const mimeType = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/webp';
    let inspected;
    try {
      inspected = inspectImageBytes(bytes, mimeType);
    } catch {
      fail(`Asset inválido ou não suportado: ${name}.`);
    }
    if (inspected.width < 1 || inspected.height < 1 || inspected.width > 8192 || inspected.height > 8192
      || inspected.width * inspected.height > 16_777_216) fail(`Dimensões inválidas em ${name}.`);
    if (definition.transparency && !inspected.hasTransparency) fail(`${name} precisa possuir transparência.`);
    assets[slot] = Object.freeze({
      slot,
      name,
      filePath,
      mimeType,
      size: bytes.length,
      width: inspected.width,
      height: inspected.height,
      hasTransparency: inspected.hasTransparency,
      hash: sha256(bytes),
      bytes,
    });
  }
  return Object.freeze(assets);
}

export async function loadCourseBundle(bundlePath, { mode = 'validate' } = {}) {
  const bundleDir = path.resolve(bundlePath || '');
  let metadata;
  try {
    metadata = await stat(bundleDir);
  } catch {
    fail('Diretório do bundle não encontrado.');
  }
  if (!metadata.isDirectory()) fail('--bundle deve apontar para um diretório.');
  const manifest = validateContestManifest(
    await readJson(path.join(bundleDir, 'contest.json'), 'contest.json'),
    { mode },
  );
  const curriculum = validateCurriculum(
    await readJson(path.join(bundleDir, 'curriculum.json'), 'curriculum.json'),
    manifest.contest.id,
  );
  const subtopicIds = new Set(curriculum.nodes.filter(({ type }) => type === 'subtopic').map(({ source_id }) => source_id));
  const questions = await loadQuestionBatches(bundleDir, manifest.contest.id, subtopicIds);
  const assets = await loadAssets(bundleDir);
  const questionCount = questions.reduce((sum, batch) => sum + batch.questions.length, 0);
  const distribution = questions.flatMap(({ questions: rows }) => rows)
    .reduce((result, question) => {
      result[question._answer_kind] += 1;
      return result;
    }, { C: 0, E: 0 });
  const hashInput = {
    schema_version: 1,
    operation_id: manifest.operationId,
    contest: manifest.contest,
    curriculum: curriculum.nodes,
    questions: questions.map(({ filename, hash }) => ({ filename, hash })),
    assets: Object.fromEntries(Object.entries(assets).map(([slot, asset]) => [slot, asset.hash])),
  };
  return Object.freeze({
    bundleDir,
    operationId: manifest.operationId,
    contest: manifest.contest,
    curriculum,
    questionBatches: questions,
    assets,
    questionCount,
    distribution: Object.freeze(distribution),
    bundleHash: sha256(stableJson(hashInput)),
  });
}

export function publicBundleSummary(bundle) {
  return {
    operation_id: bundle.operationId,
    bundle_hash: bundle.bundleHash,
    contest: bundle.contest,
    curriculum: bundle.curriculum.counts,
    curriculum_nodes: bundle.curriculum.nodes.length,
    question_batches: bundle.questionBatches.length,
    questions: bundle.questionCount,
    answer_distribution: bundle.distribution,
    assets: Object.fromEntries(Object.entries(bundle.assets).map(([slot, asset]) => [slot, {
      file: asset.name,
      bytes: asset.size,
      dimensions: `${asset.width}x${asset.height}`,
      transparency: asset.hasTransparency,
      sha256: asset.hash,
    }])),
  };
}
