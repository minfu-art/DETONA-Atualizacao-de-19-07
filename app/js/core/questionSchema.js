export const QUESTION_SCHEMA_VERSION = 3;
export const QUESTION_STATUS = Object.freeze({ ACTIVE: 'ativa', REVIEW: 'revisao', ARCHIVED: 'arquivada' });

export const QUESTION_REVIEW_OVERRIDES = Object.freeze({
  q_import_002: 'enunciado duplicado com origem divergente',
  q_import_056: 'enunciado duplicado com origem divergente',
  q_import_070: 'enunciado duplicado com origem divergente',
  q_import_125: 'enunciado duplicado com origem divergente',
  q_lote_q_import_0251: 'gabarito B incompatível com alternativas D/E',
  q_lote_q_import_0443: 'gabarito E incompatível com alternativas A-D',
});

const SENSITIVE_QUERY_KEYS = /^(?:utm_.+|fbclid|gclid|email|e-mail|username|user|userid|user_id|uid|token|access_token|auth|session|sessionid|session_id|code)$/i;

export function normalizeComparableText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function stableQuestionId(item = {}) {
  const basis = [item.enunciado, item.statement, item.topicoEditalId, item.subtopic_id, item.disciplina, item.discipline_id]
    .map(normalizeComparableText).join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i += 1) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `q_auto_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function sanitizeSensitiveText(value) {
  if (value == null) return { value: '', changed: false };
  let text = String(value);
  const before = text;
  text = text.replace(/\b\d{11}\s*-\s*[\p{Ll}]+(?:\s+[\p{Ll}]+){1,2}\b/gu, '[identificador removido]');
  text = text.replace(/https?:\/\/[^\s<>'"\])]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      for (const key of [...url.searchParams.keys()]) {
        if (SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.delete(key);
      }
      url.username = '';
      url.password = '';
      url.hash = '';
      return url.toString();
    } catch {
      return raw;
    }
  });
  return { value: text.replace(/\s{2,}/g, ' ').trim(), changed: text !== before };
}

export function normalizeOptions(rawOptions, format) {
  if (format === 'certo_errado') return ['Certo', 'Errado'];
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions.map((option, index) => {
    if (typeof option === 'string') return sanitizeSensitiveText(option).value;
    const letter = option?.id || option?.letter || option?.letra || String.fromCharCode(65 + index);
    const text = option?.text ?? option?.texto ?? option?.label ?? option?.value ?? '';
    return `${String(letter).trim().toUpperCase()}) ${sanitizeSensitiveText(text).value}`.trim();
  }).filter(Boolean);
}

export function optionLetters(options = []) {
  return options.map((option, index) => {
    const match = String(option).trim().match(/^([A-Z])(?:\)|\.|\s|-)/i);
    return match ? match[1].toUpperCase() : String.fromCharCode(65 + index);
  });
}

export function normalizeAnswer(rawAnswer, format, options = []) {
  if (format === 'certo_errado') {
    if (rawAnswer === true || rawAnswer === false) return { value: rawAnswer, valid: true };
    const text = String(rawAnswer ?? '').trim();
    if (/^(true|certo|c|sim|1)$/i.test(text)) return { value: true, valid: true };
    if (/^(false|errado|e|nao|não|0)$/i.test(text)) return { value: false, valid: true };
    return { value: null, valid: false };
  }

  const letters = optionLetters(options);
  const raw = String(rawAnswer ?? '').trim();
  const upper = raw.toUpperCase();
  if (letters.includes(upper)) return { value: upper, valid: true };
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (numeric === 0 && letters.length) return { value: letters[0], valid: true };
  }
  const normalizedRaw = normalizeComparableText(raw.replace(/^[A-E]\)\s*/i, ''));
  const exactIndex = options.findIndex((option) => normalizeComparableText(String(option).replace(/^[A-E]\)\s*/i, '')) === normalizedRaw);
  if (normalizedRaw && exactIndex >= 0) return { value: letters[exactIndex], valid: true };
  return { value: raw || null, valid: false };
}

function metadataFromOriginal(item) {
  const excluded = new Set([
    'id', 'statement', 'enunciado', 'options', 'alternativas', 'correct_answer', 'correct_option', 'respostaCorreta',
    'explanation', 'explicacao', 'resolucao', 'source', 'fonte', 'created_at', 'createdAt', 'updated_at', 'updatedAt',
    'porqueCorreta', 'porqueAlternativaA', 'porqueAlternativaB', 'porqueAlternativaC', 'porqueAlternativaD',
    'porqueAlternativaE', 'pegadinhaDaBanca', 'dicaDeMemorizacao', 'resumo', 'referencias',
  ]);
  const metadata = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (!excluded.has(key) && value !== undefined) metadata[key] = value;
  }
  return metadata;
}

export function normalizeQuestion(item = {}, context = {}) {
  const format = item.format === 'multipla_escolha' ? 'multipla_escolha' : 'certo_errado';
  const statementResult = sanitizeSensitiveText(item.enunciado ?? item.statement ?? '');
  const explanationResult = sanitizeSensitiveText(item.explicacao ?? item.explanation ?? item.resolucao ?? 'Sem resolução.');
  const sourceResult = sanitizeSensitiveText(item.fonte ?? item.source ?? '');
  const options = normalizeOptions(item.alternativas ?? item.options, format);
  const answer = normalizeAnswer(item.respostaCorreta ?? item.correct_option ?? item.correct_answer, format, options);
  const id = String(item.id || '').trim() || stableQuestionId(item);
  const topicId = context.topicoEditalId || item.topicoEditalId || item.subtopic_id || '';
  const discipline = context.disciplina || item.disciplina || item.discipline || item.discipline_id || '';
  const explicitReview = QUESTION_REVIEW_OVERRIDES[id];
  const structurallyValid = Boolean(statementResult.value && topicId && options.length >= 2 && answer.valid);
  const status = explicitReview || !structurallyValid ? QUESTION_STATUS.REVIEW : (item.situacao || item.status || QUESTION_STATUS.ACTIVE);
  const createdAt = item.createdAt || item.created_at || context.now || '1970-01-01T00:00:00.000Z';
  const updatedAt = item.updatedAt || item.updated_at || createdAt;
  const fonte = sourceResult.value;
  const enrichedText = (key) => sanitizeSensitiveText(item[key] ?? '').value;
  const referencias = (Array.isArray(item.referencias) ? item.referencias : (item.referencias ? [item.referencias] : []))
    .map((reference) => sanitizeSensitiveText(reference).value).filter(Boolean);
  const metadata = { ...metadataFromOriginal(item), ...(item.metadata || {}) };
  if (explicitReview) metadata.reviewReason = explicitReview;
  else if (!answer.valid) metadata.reviewReason = 'gabarito incompatível ou ausente';
  else if (!statementResult.value || !topicId || options.length < 2) metadata.reviewReason = 'estrutura obrigatória incompleta';

  return {
    id,
    concursoId: context.concursoId || item.concursoId || item.contest_id || 'pc_al_2026',
    orgao: item.orgao || item.agency || '',
    instituicao: item.instituicao || item.institution || '',
    cargo: item.cargo || item.role || '',
    banca: item.banca || item.board || '',
    ano: item.ano || item.year || null,
    disciplina: discipline,
    assunto: item.assunto || item.subject || '',
    topicoEditalId: topicId,
    topicoEdital: context.topicoEdital || item.topicoEdital || item.subtopic_name || '',
    enunciado: statementResult.value,
    alternativas: options,
    respostaCorreta: answer.value,
    explicacao: explanationResult.value,
    porqueCorreta: enrichedText('porqueCorreta'),
    porqueAlternativaA: enrichedText('porqueAlternativaA'),
    porqueAlternativaB: enrichedText('porqueAlternativaB'),
    porqueAlternativaC: enrichedText('porqueAlternativaC'),
    porqueAlternativaD: enrichedText('porqueAlternativaD'),
    porqueAlternativaE: enrichedText('porqueAlternativaE'),
    pegadinhaDaBanca: enrichedText('pegadinhaDaBanca'),
    dicaDeMemorizacao: enrichedText('dicaDeMemorizacao'),
    resumo: enrichedText('resumo'),
    referencias,
    dificuldade: item.dificuldade || item.difficulty || item.difficulty_level || 'nao_informada',
    situacao: status,
    fonte,
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    version: QUESTION_SCHEMA_VERSION,
    createdAt,
    updatedAt,
    metadata,
    idOriginal: item.id || null,
    sourceSanitized: item.sourceSanitized === true || item.metadata?.sanitizedSource === true
      || statementResult.changed || explanationResult.changed || sourceResult.changed
      || options.some((option, index) => option !== String((item.alternativas ?? item.options ?? [])[index] ?? option)),
    subtopic_id: topicId,
    format,
    statement: statementResult.value,
    options,
    correct_answer: answer.value,
    explanation: explanationResult.value,
    explanation_extension_version: 1,
    is_user_created: item.is_user_created === true,
    created_at: createdAt,
    source_subtopic: item.source_subtopic || item.subtopic_id || null,
  };
}

/** Questões sintéticas de seed legadas (`demo_*` / enunciado [DEMO …]) — fora do banco real. */
export function isDemoQuestion(question) {
  if (!question) return false;
  const id = String(question.id || '');
  if (id.startsWith('demo_')) return true;
  const statement = String(question.statement || question.enunciado || '');
  if (/^\s*\[DEMO\b/i.test(statement)) return true;
  if (question.metadata?.demo === true || question.is_demo === true) return true;
  return false;
}

export function isQuestionEligible(question) {
  if (isDemoQuestion(question)) return false;
  return question?.situacao !== QUESTION_STATUS.REVIEW
    && question?.situacao !== QUESTION_STATUS.ARCHIVED
    && Boolean(question?.statement && question?.subtopic_id)
    && Array.isArray(question?.options)
    && question.options.length >= 2
    && normalizeAnswer(question.correct_answer, question.format, question.options).valid;
}

export function analyzeQuestionCollection(questions = []) {
  const ids = new Map();
  const statements = new Map();
  let valid = 0; let review = 0; let invalidAnswers = 0; let invalidOptions = 0;
  let missingDiscipline = 0; let missingSubject = 0; let missingTopic = 0; let sanitizedSources = 0;
  for (const question of questions) {
    ids.set(question.id, (ids.get(question.id) || 0) + 1);
    const key = normalizeComparableText(question.statement || question.enunciado);
    if (key) statements.set(key, (statements.get(key) || 0) + 1);
    if (question.situacao === QUESTION_STATUS.REVIEW) review += 1;
    else if (isQuestionEligible(question)) valid += 1;
    if (!Array.isArray(question.options) || question.options.length < 2) invalidOptions += 1;
    if (!normalizeAnswer(question.correct_answer, question.format, question.options).valid) invalidAnswers += 1;
    if (!question.disciplina) missingDiscipline += 1;
    if (!question.assunto) missingSubject += 1;
    if (!question.subtopic_id) missingTopic += 1;
    if (question.sourceSanitized) sanitizedSources += 1;
  }
  return {
    total: questions.length, valid, review,
    duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })),
    duplicateStatements: [...statements.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    invalidAnswers, invalidOptions, missingDiscipline, missingSubject, missingTopic, sanitizedSources,
  };
}
