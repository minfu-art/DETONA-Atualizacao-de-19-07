import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_POLICY = Object.freeze({
  schema_version: 1,
  targets: { simple: 8, standard: 12, complex: 16 },
  complexity: {
    standard_threshold: 1.75,
    complex_threshold: 3.5,
    weights: { rules: 1, exceptions: 2, applications: 1.25, competencies: 1.5, required_knowledge: 0.5 },
  },
  coverage_sequence: ['conceito', 'compreensao', 'aplicacao', 'aplicacao', 'diferenciacao', 'caso_concreto', 'excecao', 'integracao'],
  difficulty_sequence: ['facil', 'media', 'media', 'media', 'media', 'dificil', 'dificil', 'media'],
  format: 'multipla_escolha',
});

export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

export function shortHash(value, size = 14) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, size);
}

export async function listQuestionFiles(bundlePath) {
  const directory = path.join(bundlePath, 'questions');
  let names = [];
  try { names = await readdir(directory); } catch { return []; }
  return names.filter((name) => name.endsWith('.json')).sort().map((name) => path.join(directory, name));
}

export async function loadBundle(bundlePath) {
  const [courseDoc, curriculumDoc, knowledgeDoc, editalMapDoc, sourceDoc, questionFiles] = await Promise.all([
    readJson(path.join(bundlePath, 'course.json')),
    readJson(path.join(bundlePath, 'curriculum.json')),
    readJson(path.join(bundlePath, 'microknowledge.json')),
    readJson(path.join(bundlePath, 'edital-map.json')),
    readJson(path.join(bundlePath, 'sources.json')),
    listQuestionFiles(bundlePath),
  ]);
  const batches = await Promise.all(questionFiles.map(readJson));
  return {
    bundlePath,
    course: courseDoc.course || courseDoc,
    curriculum: curriculumDoc.nodes || [],
    microknowledges: knowledgeDoc.microknowledges || [],
    editalMap: editalMapDoc.edital_map || [],
    sources: sourceDoc.sources || [],
    batches,
    questionFiles,
    questions: batches.flatMap((batch) => batch.questions || []),
  };
}

export function classifyComplexity(mapItem, microknowledgeCount, policy = DEFAULT_POLICY) {
  const weights = policy.complexity?.weights || DEFAULT_POLICY.complexity.weights;
  const total = Object.entries(weights).reduce((sum, [field, weight]) => {
    return sum + (Array.isArray(mapItem?.[field]) ? mapItem[field].length : 0) * Number(weight || 0);
  }, 0);
  const perKnowledge = total / Math.max(1, microknowledgeCount);
  if (perKnowledge >= Number(policy.complexity?.complex_threshold ?? 3.5)) return 'complex';
  if (perKnowledge >= Number(policy.complexity?.standard_threshold ?? 1.75)) return 'standard';
  return 'simple';
}

export function buildCoverage(bundle, policy = DEFAULT_POLICY) {
  const mapsBySubtopic = new Map(bundle.editalMap.map((item) => [item.subtopic_id, item]));
  const mksBySubtopic = Map.groupBy(bundle.microknowledges, (item) => item.subtopic_id);
  const counts = new Map(bundle.microknowledges.map((item) => [item.id, 0]));
  for (const question of bundle.questions) {
    for (const id of question.microknowledge_ids || []) if (counts.has(id)) counts.set(id, counts.get(id) + 1);
  }
  return bundle.microknowledges.map((mk) => {
    const mapItem = mapsBySubtopic.get(mk.subtopic_id) || {};
    const complexity = classifyComplexity(mapItem, (mksBySubtopic.get(mk.subtopic_id) || []).length, policy);
    const target = Number(policy.targets?.[complexity] ?? DEFAULT_POLICY.targets[complexity]);
    const current = counts.get(mk.id) || 0;
    return {
      microknowledge_id: mk.id,
      subtopic_id: mk.subtopic_id,
      title: mk.title,
      complexity,
      target,
      current,
      deficit: Math.max(0, target - current),
      coverage_pct: target ? Math.min(100, Math.round((current / target) * 10000) / 100) : 100,
    };
  });
}

function weightedContractSpec(current, policy) {
  const dimensions = policy.coverage_sequence?.length ? policy.coverage_sequence : DEFAULT_POLICY.coverage_sequence;
  const difficulties = policy.difficulty_sequence?.length ? policy.difficulty_sequence : DEFAULT_POLICY.difficulty_sequence;
  return {
    coverage_dimension: dimensions[current % dimensions.length],
    difficulty: difficulties[current % difficulties.length],
    format: policy.format || DEFAULT_POLICY.format,
  };
}

export function planContracts(bundle, { limit = 100, policy = DEFAULT_POLICY } = {}) {
  const coverage = buildCoverage(bundle, policy);
  const open = coverage.filter(({ deficit }) => deficit > 0)
    .sort((a, b) => a.coverage_pct - b.coverage_pct || b.deficit - a.deficit || a.microknowledge_id.localeCompare(b.microknowledge_id));
  const byId = new Map(open.map((item) => [item.microknowledge_id, { ...item, planned: 0 }]));
  const contracts = [];
  const max = Math.max(0, Number(limit) || 0);
  let progress = true;
  while (contracts.length < max && progress) {
    progress = false;
    for (const item of open) {
      if (contracts.length >= max) break;
      const state = byId.get(item.microknowledge_id);
      if (state.planned >= state.deficit) continue;
      progress = true;
      const ordinal = state.current + state.planned + 1;
      const spec = weightedContractSpec(ordinal - 1, policy);
      const seed = `${bundle.course.contest_id}:${bundle.course.position_id}:${item.microknowledge_id}:${ordinal}`;
      const token = shortHash(seed, 16);
      contracts.push({
        contract_id: `ct_${token}`,
        question_id: `qf_${token}`,
        status: 'PLANNED',
        contest_id: bundle.course.contest_id,
        position_id: bundle.course.position_id,
        offering_id: bundle.course.offering_id,
        subtopic_id: item.subtopic_id,
        microknowledge_id: item.microknowledge_id,
        microknowledge_title: item.title,
        complexity: item.complexity,
        target_questions: item.target,
        existing_questions_before_plan: item.current,
        ordinal_for_microknowledge: ordinal,
        ...spec,
        objective: `Avaliar ${item.title} por meio da dimensão cognitiva ${spec.coverage_dimension}, sem repetir enunciados ou raciocínios já existentes.`,
      });
      state.planned += 1;
    }
  }
  return {
    schema_version: 1,
    kind: 'detona_question_contract_batch',
    course: {
      contest_id: bundle.course.contest_id,
      position_id: bundle.course.position_id,
      offering_id: bundle.course.offering_id,
      slug: bundle.course.slug,
      name: bundle.course.name,
    },
    requested: max,
    planned: contracts.length,
    remaining_deficit_before_plan: coverage.reduce((sum, item) => sum + item.deficit, 0),
    contracts,
  };
}

function exactKeys(value, allowed) {
  return Object.keys(value || {}).filter((key) => !allowed.includes(key));
}

export function validateQuestionBatch(bundle, batch) {
  const errors = [];
  const warnings = [];
  const nodeById = new Map(bundle.curriculum.map((node) => [node.id, node]));
  const mkById = new Map(bundle.microknowledges.map((mk) => [mk.id, mk]));
  const sourceIds = new Set(bundle.sources.map((source) => source.id));
  const existingIds = new Set(bundle.questions.map((q) => q.id));
  const existingStatements = new Set(bundle.questions.map((q) => normalizeText(q.statement)).filter(Boolean));
  const localIds = new Set();
  const localStatements = new Set();
  const allowed = ['id', 'subtopic_id', 'microknowledge_ids', 'statement', 'options', 'correct_answer', 'explanation', 'difficulty', 'format', 'source', 'is_trick', 'traces'];

  if (!batch || typeof batch !== 'object' || !Array.isArray(batch.questions) || !batch.questions.length) {
    errors.push({ code: 'BATCH_INVALID', path: 'batch.questions', message: 'O lote deve possuir ao menos uma questão.' });
    return { valid: false, errors, warnings, counts: { questions: 0 } };
  }
  batch.questions.forEach((q, index) => {
    const base = `questions[${index}]`;
    for (const key of exactKeys(q, allowed)) errors.push({ code: 'UNEXPECTED_FIELD', path: `${base}.${key}`, message: 'Campo fora do contrato canônico.' });
    if (!q.id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(q.id)) errors.push({ code: 'ID_INVALID', path: `${base}.id`, message: 'ID ausente ou inválido.' });
    else if (existingIds.has(q.id) || localIds.has(q.id)) errors.push({ code: 'ID_DUPLICATE', path: `${base}.id`, message: 'ID de questão duplicado.' });
    localIds.add(q.id);

    const subtopic = nodeById.get(q.subtopic_id);
    if (!subtopic || subtopic.type !== 'subtopic') errors.push({ code: 'SUBTOPIC_INVALID', path: `${base}.subtopic_id`, message: 'Subtópico inexistente.' });
    const refs = Array.isArray(q.microknowledge_ids) ? q.microknowledge_ids : [];
    if (!refs.length) errors.push({ code: 'MICROKNOWLEDGE_REQUIRED', path: `${base}.microknowledge_ids`, message: 'Vincule ao menos um microconhecimento.' });
    if (new Set(refs).size !== refs.length) errors.push({ code: 'MICROKNOWLEDGE_DUPLICATE', path: `${base}.microknowledge_ids`, message: 'Microconhecimento repetido na questão.' });
    for (const id of refs) {
      const mk = mkById.get(id);
      if (!mk) errors.push({ code: 'MICROKNOWLEDGE_UNKNOWN', path: `${base}.microknowledge_ids`, message: `Microconhecimento inexistente: ${id}` });
      else if (mk.subtopic_id !== q.subtopic_id) errors.push({ code: 'MICROKNOWLEDGE_LINK_INVALID', path: `${base}.microknowledge_ids`, message: 'Microconhecimento pertence a outro subtópico.' });
    }

    const statement = String(q.statement || '').trim();
    if (!statement) errors.push({ code: 'STATEMENT_REQUIRED', path: `${base}.statement`, message: 'Enunciado obrigatório.' });
    const normalized = normalizeText(statement);
    if (normalized && (existingStatements.has(normalized) || localStatements.has(normalized))) errors.push({ code: 'STATEMENT_DUPLICATE', path: `${base}.statement`, message: 'Enunciado duplicado.' });
    localStatements.add(normalized);

    const options = Array.isArray(q.options) ? q.options : [];
    if (options.length === 1) errors.push({ code: 'OPTIONS_INVALID', path: `${base}.options`, message: 'Múltipla escolha exige ao menos duas alternativas.' });
    const labels = options.map((option, optionIndex) => String(option?.label ?? String.fromCharCode(65 + optionIndex)).toUpperCase());
    if (new Set(labels).size !== labels.length) errors.push({ code: 'OPTION_LABEL_DUPLICATE', path: `${base}.options`, message: 'Rótulo de alternativa duplicado.' });
    if (options.some((option) => typeof option !== 'object' || !String(option.text || '').trim())) errors.push({ code: 'OPTION_TEXT_INVALID', path: `${base}.options`, message: 'Alternativa sem texto.' });
    const answer = String(q.correct_answer ?? '').toUpperCase();
    if (options.length && !labels.includes(answer)) errors.push({ code: 'ANSWER_INVALID', path: `${base}.correct_answer`, message: 'Gabarito não corresponde às alternativas.' });
    if (!options.length && !['C', 'E', 'CERTO', 'ERRADO', 'TRUE', 'FALSE'].includes(answer)) errors.push({ code: 'ANSWER_INVALID', path: `${base}.correct_answer`, message: 'Gabarito Certo/Errado inválido.' });
    if (!String(q.explanation || '').trim()) errors.push({ code: 'EXPLANATION_REQUIRED', path: `${base}.explanation`, message: 'Explicação obrigatória.' });

    if (!Array.isArray(q.traces) || !q.traces.length) errors.push({ code: 'TRACE_REQUIRED', path: `${base}.traces`, message: 'Rastreabilidade obrigatória.' });
    else for (const [traceIndex, trace] of q.traces.entries()) {
      const tracePath = `${base}.traces[${traceIndex}]`;
      if (!sourceIds.has(trace?.source_id)) errors.push({ code: 'TRACE_SOURCE_UNKNOWN', path: `${tracePath}.source_id`, message: 'Fonte de rastreabilidade inexistente.' });
      if (!['available', 'missing'].includes(trace?.trace_status)) errors.push({ code: 'TRACE_STATUS_INVALID', path: `${tracePath}.trace_status`, message: 'Use available ou missing.' });
      if (trace?.trace_status === 'available' && (!Number.isInteger(Number(trace.page_number)) || Number(trace.page_number) < 1 || !String(trace.excerpt || '').trim())) errors.push({ code: 'TRACE_AVAILABLE_INVALID', path: tracePath, message: 'Trace disponível exige página e excerto.' });
      if (trace?.trace_status === 'missing' && !String(trace.note || '').trim()) errors.push({ code: 'TRACE_MISSING_NOTE_REQUIRED', path: tracePath, message: 'Trace ausente exige justificativa.' });
    }
  });
  return { valid: errors.length === 0, errors, warnings, counts: { questions: batch.questions.length } };
}

export function validateSemanticAudit(batch, audit) {
  const errors = [];
  if (!audit || audit.status !== 'APPROVED') errors.push('semantic_audit_not_approved');
  if (audit?.batch_name !== batch?.name) errors.push('semantic_audit_batch_mismatch');
  const byId = new Map((audit?.questions || []).map((item) => [item.id, item]));
  for (const question of batch?.questions || []) {
    const item = byId.get(question.id);
    if (!item) { errors.push(`semantic_audit_missing:${question.id}`); continue; }
    if (item.verdict !== 'APPROVED') errors.push(`semantic_audit_rejected:${question.id}`);
    const checks = item.checks || {};
    for (const check of ['single_correct_answer', 'explanation_consistent', 'within_scope', 'distractors_plausible', 'not_semantic_duplicate']) {
      if (checks[check] !== true) errors.push(`semantic_check_failed:${question.id}:${check}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function nextQuestionFile(bundlePath, batchName) {
  const files = await listQuestionFiles(bundlePath);
  const highest = files.reduce((max, file) => {
    const match = path.basename(file).match(/^(\d+)-/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  const safe = String(batchName || 'lote').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'lote';
  return path.join(bundlePath, 'questions', `${String(highest + 1).padStart(3, '0')}-${safe}.json`);
}

export async function promoteBatch({ bundle, batchPath, auditPath }) {
  const batch = await readJson(batchPath);
  const deterministic = validateQuestionBatch(bundle, batch);
  if (!deterministic.valid) throw new Error(`batch_validation_failed:${deterministic.errors[0]?.code || 'unknown'}`);
  const audit = await readJson(auditPath);
  const semantic = validateSemanticAudit(batch, audit);
  if (!semantic.valid) throw new Error(`semantic_audit_failed:${semantic.errors[0]}`);
  const target = await nextQuestionFile(bundle.bundlePath, batch.name);
  await copyFile(batchPath, target);
  return { target, batch, deterministic, semantic };
}

export function coverageSummary(rows) {
  const total = rows.length;
  const complete = rows.filter(({ deficit }) => deficit === 0).length;
  const requiredQuestions = rows.reduce((sum, item) => sum + item.target, 0);
  const creditedQuestions = rows.reduce((sum, item) => sum + Math.min(item.current, item.target), 0);
  return {
    microknowledges: total,
    complete,
    incomplete: total - complete,
    knowledge_coverage_pct: total ? Math.round((complete / total) * 10000) / 100 : 100,
    question_coverage_pct: requiredQuestions ? Math.round((creditedQuestions / requiredQuestions) * 10000) / 100 : 100,
    required_questions: requiredQuestions,
    credited_questions: creditedQuestions,
    remaining_questions: Math.max(0, requiredQuestions - creditedQuestions),
  };
}
