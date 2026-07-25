import { normalizeComparableText, normalizeQuestion } from '../core/questionSchema.js';
import { getSupabaseClient } from '../supabase/client.js';

export const EDITORIAL_STATUSES = Object.freeze(['draft', 'technical_review', 'approved', 'published', 'archived']);

export function parseQuestionItems(raw) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const items = Array.isArray(payload) ? payload : payload?.questions || payload?.questoes || payload?.items;
  if (!Array.isArray(items)) throw new Error('O lote deve conter uma lista de questões.');
  return items;
}

export function validateEditorialBatch(raw, { contestId, knownIds = [], knownSubtopicIds = [] } = {}) {
  if (!contestId) throw new Error('contestId é obrigatório.');
  const items = parseQuestionItems(raw);
  if (!items.length || items.length > 1_000) throw new Error('O lote deve conter de 1 a 1.000 questões.');
  const ids = new Set(knownIds.map(String));
  const subtopics = new Set(knownSubtopicIds.map(String));
  const statements = new Map();
  const errors = [];
  const warnings = [];
  const questions = items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`#${index + 1}: questão inválida.`);
      return {};
    }
    if (item.contest_id && String(item.contest_id) !== contestId) errors.push(`#${index + 1}: contest_id incorreto.`);
    const question = normalizeQuestion(item, {
      concursoId: contestId,
      topicoEditalId: item.topicoEditalId || item.subtopic_id,
      disciplina: item.disciplina || item.discipline_id,
      now: new Date().toISOString(),
    });
    if (!question.statement) errors.push(`#${index + 1}: enunciado obrigatório.`);
    const subtopicId = String(question.subtopic_id || question.topicoEditalId || '');
    if (!subtopicId) errors.push(`#${index + 1}: subtópico obrigatório.`);
    else if (subtopics.size && !subtopics.has(subtopicId)) errors.push(`#${index + 1}: subtópico inexistente (${subtopicId}).`);
    if (!question.id) errors.push(`#${index + 1}: ID obrigatório.`);
    else if (ids.has(String(question.id))) errors.push(`#${index + 1}: ID repetido (${question.id}).`);
    ids.add(String(question.id));
    if (!question.explanation || question.explanation === 'Sem resolução.') errors.push(`#${index + 1}: explicação obrigatória.`);
    if (question.correct_answer == null || question.situacao === 'revisao') errors.push(`#${index + 1}: gabarito ou estrutura inválida.`);
    const comparable = normalizeComparableText(question.statement);
    if (comparable && statements.has(comparable)) warnings.push(`#${index + 1}: enunciado semelhante ao item ${statements.get(comparable)}.`);
    else if (comparable) statements.set(comparable, index + 1);
    return { ...question, contest_id: contestId, subtopic_id: subtopicId, status: 'draft' };
  });
  return { valid: errors.length === 0, total: questions.length, questions, errors, warnings };
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

  async #invoke(action, payload) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend editorial indisponível.');
    const { data, error } = await client.functions.invoke('admin-editorial', { body: { action, ...payload } });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Operação editorial indisponível.');
    return data;
  }

  async getPublishedSummary(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    if (contestId !== 'pc_al_2026') return { count: 0, files: 0, source: 'dynamic_package' };
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

  async listQuestions(contestId, filters = {}) {
    return this.#invoke('list_questions', { contestId, search: filters.search || '', status: filters.status || null, page: filters.page || 1, pageSize: filters.pageSize || 50 });
  }

  async listBatches(contestId) {
    return this.#invoke('list_batches', { contestId });
  }

  async importDraft(contestId, batch, options = {}) {
    const validation = validateEditorialBatch(batch, { contestId, knownIds: options.knownIds, knownSubtopicIds: options.knownSubtopicIds });
    if (!validation.valid) return validation;
    const result = await this.#invoke('import_draft', {
      contestId,
      batchName: options.batchName || `Importação ${new Date().toISOString()}`,
      questions: validation.questions,
    });
    return { ...validation, ...result };
  }

  async updateDraft(contestId, question) {
    return this.#invoke('update_draft', { contestId, question });
  }

  async deleteDraft(contestId, questionIds) {
    return this.#invoke('delete_draft', { contestId, questionIds });
  }

  async transition(questionIds, status, contestId) {
    if (!EDITORIAL_STATUSES.includes(status)) throw new Error('Estado editorial inválido.');
    return this.#invoke('transition', { contestId, questionIds, status });
  }

  async generateSnapshot(contestId, version) {
    return this.#invoke('generate_snapshot', { contestId, version });
  }

  async publishSnapshot(contestId, versionId) {
    return this.#invoke('publish_snapshot', { contestId, versionId });
  }
}

export const adminQuestionService = new AdminQuestionService();
