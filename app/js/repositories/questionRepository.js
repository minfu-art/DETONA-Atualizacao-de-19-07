import { STORES, getAll } from '../core/db.js';
import { getQuestionSourceMode, QUESTION_INDEX_URL, QUESTION_SOURCE_MODES } from '../config/questionSourceConfig.js';
import {
  hasCompleteMultipleChoiceOptions,
  isDemoQuestion,
  normalizeAnswer,
  normalizeComparableText,
  normalizeQuestionFormat,
} from '../core/questionSchema.js';
import { isDynamicContestContent } from '../contest/contestRuntime.js';

const clone = (value) => value == null ? value : structuredClone(value);
const textKey = (value) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');

function canonicalStatementKey(question) {
  let key = normalizeComparableText(question?.enunciado || question?.statement || '');
  key = key.replace(/^\d+\s*[.)]\s*/, '');
  key = key.replace(/^\([^)]*(?:cebraspe|cespe|fgv|fcc|vunesp|ibfc|quadrix|aocp)[^)]*\)\s*/, '');
  return key.length >= 60 ? key : '';
}

function questionQuality(question) {
  const format = normalizeQuestionFormat(question?.tipo || question?.format);
  const options = question?.alternativas || question?.options || [];
  let score = Math.min(300, String(question?.enunciado || question?.statement || '').trim().length);
  if (format === 'multipla_escolha' && hasCompleteMultipleChoiceOptions(options)) score += 1000;
  if (format === 'certo_errado') score += 1000;
  if (normalizeAnswer(question?.respostaCorreta ?? question?.correct_answer, format, options).valid) score += 200;
  for (const field of ['banca', 'ano', 'assunto', 'explicacao', 'explanation']) {
    if (question?.[field]) score += 10;
  }
  return score;
}

function preferBestStatementVersion(questions = []) {
  const result = [];
  const positions = new Map();
  for (const question of questions) {
    const contest = textKey(question?.concursoId || question?.contest_id || '');
    const statement = canonicalStatementKey(question);
    if (!statement) {
      result.push(question);
      continue;
    }
    const key = `${contest}|${statement}`;
    if (!positions.has(key)) {
      positions.set(key, result.length);
      result.push(question);
      continue;
    }
    const position = positions.get(key);
    if (questionQuality(question) > questionQuality(result[position])) result[position] = question;
  }
  return result;
}

export function createQuestionRepository({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  legacyLoader = () => getAll(STORES.questions),
  modeLoader = getQuestionSourceMode,
  indexUrl = QUESTION_INDEX_URL,
} = {}) {
  let indexCache = null;
  const disciplineCache = new Map();

  async function carregarIndice() {
    if (indexCache) return clone(indexCache);
    if (!fetchImpl) throw new Error('Carregamento JSON indisponível neste ambiente.');
    const response = await fetchImpl(indexUrl);
    if (!response.ok) throw new Error(`Índice de questões indisponível (HTTP ${response.status}).`);
    indexCache = await response.json();
    return clone(indexCache);
  }

  async function carregarDisciplina(disciplinaId) {
    const key = String(disciplinaId);
    if (disciplineCache.has(key)) return clone(disciplineCache.get(key));
    const index = await carregarIndice();
    const entry = (index.disciplinas || []).find((item) => item.id === key || item.disciplinaId === key);
    if (!entry) return [];
    const response = await fetchImpl(entry.arquivo);
    if (!response.ok) throw new Error(`Banco ${key} indisponível (HTTP ${response.status}).`);
    const payload = await response.json();
    const questions = Array.isArray(payload) ? payload : (payload.questoes || payload.questions || []);
    disciplineCache.set(key, questions);
    return clone(questions);
  }

  async function jsonQuestions() {
    const index = await carregarIndice();
    const batches = await Promise.all((index.disciplinas || []).map((item) => carregarDisciplina(item.id || item.disciplinaId)));
    return batches.flat();
  }

  async function listar(filtros = {}) {
    const dynamic = isDynamicContestContent();
    const mode = dynamic ? QUESTION_SOURCE_MODES.LEGACY : (filtros.mode || modeLoader());
    const legacy = mode === QUESTION_SOURCE_MODES.JSON ? [] : (await legacyLoader()).filter((item) => item.questionSource !== 'json');
    const json = mode === QUESTION_SOURCE_MODES.LEGACY ? [] : await jsonQuestions();
    const unique = new Map();
    // Compatibilidade: no híbrido, um ID legado já existente continua prevalecendo.
    for (const question of [...legacy, ...json]) if (!unique.has(String(question.id))) unique.set(String(question.id), question);
    let result = preferBestStatementVersion([...unique.values()]);
    // Banco real: exclui questões DEMO por padrão (use includeDemo: true só para auditoria).
    if (filtros.includeDemo !== true) {
      result = result.filter((item) => !isDemoQuestion(item));
    }
    const filters = {
      concursoId: ['concursoId', 'contest_id'], cargoId: ['cargoId', 'cargo_id'],
      disciplinaId: ['disciplinaId', 'disciplina', 'discipline_id'], assunto: ['assunto', 'subject'],
      subtopico: ['subtopico', 'topicoEdital', 'subtopic_name'], subtopicId: ['subtopic_id', 'topicoEditalId'],
    };
    for (const [filter, fields] of Object.entries(filters)) {
      if (filtros[filter] == null || filtros[filter] === '') continue;
      const expected = textKey(filtros[filter]);
      result = result.filter((item) => fields.some((field) => textKey(item[field]) === expected));
    }
    return clone(result);
  }

  async function buscarPorId(id, filtros = {}) {
    return (await listar(filtros)).find((item) => String(item.id) === String(id)) || null;
  }

  const filterMethod = (name) => (value, filtros = {}) => listar({ ...filtros, [name]: value });

  async function selecionarAleatorias(quantidade, filtros = {}) {
    const shuffled = (await listar(filtros)).map((item) => ({ item, order: Math.random() }))
      .sort((a, b) => a.order - b.order).map(({ item }) => item);
    return shuffled.slice(0, Math.max(0, Number(quantidade) || 0));
  }

  async function selecionarSemRepeticao(quantidade, filtros = {}, idsExcluidos = []) {
    const excluded = new Set(idsExcluidos.map(String));
    const available = (await listar(filtros)).filter((item) => !excluded.has(String(item.id)));
    return available.map((item) => ({ item, order: Math.random() })).sort((a, b) => a.order - b.order)
      .slice(0, Math.max(0, Number(quantidade) || 0)).map(({ item }) => item);
  }

  return {
    carregarIndice, carregarDisciplina, listar, buscarPorId,
    filtrarPorConcurso: filterMethod('concursoId'), filtrarPorCargo: filterMethod('cargoId'),
    filtrarPorDisciplina: filterMethod('disciplinaId'), filtrarPorAssunto: filterMethod('assunto'),
    filtrarPorSubtopico: filterMethod('subtopico'), selecionarAleatorias, selecionarSemRepeticao,
    limparCache() { indexCache = null; disciplineCache.clear(); },
  };
}

export const questionRepository = createQuestionRepository();
export const carregarIndice = (...args) => questionRepository.carregarIndice(...args);
export const carregarDisciplina = (...args) => questionRepository.carregarDisciplina(...args);
export const listar = (...args) => questionRepository.listar(...args);
export const buscarPorId = (...args) => questionRepository.buscarPorId(...args);
export const filtrarPorConcurso = (...args) => questionRepository.filtrarPorConcurso(...args);
export const filtrarPorCargo = (...args) => questionRepository.filtrarPorCargo(...args);
export const filtrarPorDisciplina = (...args) => questionRepository.filtrarPorDisciplina(...args);
export const filtrarPorAssunto = (...args) => questionRepository.filtrarPorAssunto(...args);
export const filtrarPorSubtopico = (...args) => questionRepository.filtrarPorSubtopico(...args);
export const selecionarAleatorias = (...args) => questionRepository.selecionarAleatorias(...args);
export const selecionarSemRepeticao = (...args) => questionRepository.selecionarSemRepeticao(...args);
