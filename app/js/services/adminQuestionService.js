import { normalizeComparableText, normalizeQuestion } from '../core/questionSchema.js';
import { getSupabaseClient } from '../supabase/client.js';

export const EDITORIAL_STATUSES = Object.freeze([
  'draft', 'technical_review', 'approved', 'published', 'archived',
]);

function parseItems(raw) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const items = Array.isArray(payload) ? payload : payload?.questions || payload?.items;
  if (!Array.isArray(items)) throw new Error('O lote deve conter uma lista de questões.');
  return items;
}

export function validateEditorialBatch(raw, { contestId, knownIds = [] } = {}) {
  if (!contestId) throw new Error('contestId é obrigatório.');
  const items = parseItems(raw);
  const ids = new Set(knownIds.map(String));
  const statements = new Map();
  const errors = [];
  const warnings = [];
  const questions = items.map((item, index) => {
    const question = normalizeQuestion(item, {
      concursoId: contestId,
      topicoEditalId: item.topicoEditalId || item.subtopic_id,
      disciplina: item.disciplina || item.discipline_id,
      now: new Date().toISOString(),
    });
    if (!question.statement) errors.push(`#${index + 1}: enunciado obrigatório.`);
    if (!question.subtopic_id) errors.push(`#${index + 1}: subtópico obrigatório.`);
    if (ids.has(question.id)) errors.push(`#${index + 1}: ID repetido (${question.id}).`);
    ids.add(question.id);
    if (!question.explanation || question.explanation === 'Sem resolução.') {
      errors.push(`#${index + 1}: explicação obrigatória.`);
    }
    if (question.situacao === 'revisao') errors.push(`#${index + 1}: gabarito ou estrutura inválida.`);
    const comparable = normalizeComparableText(question.statement);
    if (statements.has(comparable)) warnings.push(`#${index + 1}: enunciado semelhante ao item ${statements.get(comparable)}.`);
    else statements.set(comparable, index + 1);
    return question;
  });
  return {
    valid: errors.length === 0,
    total: questions.length,
    questions,
    errors,
    warnings,
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createQuestionSnapshot(questions, { contestId, version } = {}) {
  if (!contestId || !version) throw new Error('Concurso e versão são obrigatórios.');
  const body = JSON.stringify(questions);
  return {
    contestId,
    version,
    count: questions.length,
    hash: await sha256(body),
    generatedAt: new Date().toISOString(),
    body,
  };
}

export class AdminQuestionService {
  constructor({ getClient = getSupabaseClient, fetcher = globalThis.fetch } = {}) {
    this.getClient = getClient;
    this.fetcher = fetcher;
  }

  async getPublishedSummary(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    if (contestId !== 'pc_al_2026') return { count: 0, files: 0, source: 'published_json' };
    const response = await this.fetcher('./data/questions/index.json');
    if (!response.ok) throw new Error('Índice publicado indisponível.');
    const index = await response.json();
    return {
      count: Number(index.quantidade || 0),
      files: Array.isArray(index.disciplinas) ? index.disciplinas.length : 0,
      source: 'published_json',
      version: index.versao || index.version || null,
    };
  }

  async #invoke(action, payload) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend editorial indisponível.');
    const { data, error } = await client.functions.invoke('admin-editorial', { body: { action, ...payload } });
    if (error || data?.error) throw new Error('Backend editorial preparado, mas ainda não publicado no staging.');
    return data;
  }

  async importDraft(contestId, batch) {
    const validation = validateEditorialBatch(batch, { contestId });
    if (!validation.valid) return validation;
    return this.#invoke('import_draft', { contestId, questions: validation.questions });
  }

  async transition(questionIds, status, contestId) {
    if (!EDITORIAL_STATUSES.includes(status)) throw new Error('Estado editorial inválido.');
    return this.#invoke('transition', { contestId, questionIds, status });
  }

  async publishSnapshot(snapshot) {
    return this.#invoke('publish_snapshot', { snapshot: { ...snapshot, body: undefined } });
  }
}

export const adminQuestionService = new AdminQuestionService();
