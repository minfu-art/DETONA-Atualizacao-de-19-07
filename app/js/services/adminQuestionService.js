import { normalizeComparableText, normalizeQuestion } from '../core/questionSchema.js';
import { getSupabaseClient } from '../supabase/client.js';

export const EDITORIAL_STATUSES = Object.freeze(['draft', 'technical_review', 'approved', 'published', 'archived']);
export const EDITORIAL_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['technical_review', 'archived']),
  technical_review: Object.freeze(['draft', 'approved', 'archived']),
  approved: Object.freeze(['technical_review', 'archived']),
  published: Object.freeze([]),
  archived: Object.freeze([]),
});

export function canEditEditorialQuestion(question) {
  return ['draft', 'technical_review'].includes(String(question?.status || ''));
}

export function canTransitionEditorialSelection(questions, targetStatus) {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  const statuses = new Set(questions.map(({ status }) => String(status || '')));
  if (statuses.size !== 1) return false;
  const [status] = statuses;
  return EDITORIAL_TRANSITIONS[status]?.includes(targetStatus) === true;
}

const EDITORIAL_ERROR_MESSAGES = Object.freeze({
  question_subtopic_not_found: 'O subtópico informado não foi encontrado no currículo deste concurso.',
  question_subtopic_wrong_contest: 'O subtópico informado pertence a outro concurso.',
  question_id_exists: 'Uma ou mais questões deste lote já foram importadas.',
  question_id_duplicate: 'O lote possui IDs de questão repetidos.',
  question_id_missing: 'Uma ou mais questões estão sem ID.',
  question_contest_mismatch: 'Uma ou mais questões pertencem a outro concurso.',
  question_subtopic_missing: 'Uma ou mais questões estão sem subtópico.',
  question_statement_missing: 'Uma ou mais questões estão sem enunciado.',
  question_explanation_missing: 'Uma ou mais questões estão sem explicação.',
  question_answer_invalid: 'Uma ou mais questões estão sem gabarito válido.',
  contest_not_found: 'O concurso selecionado não foi encontrado.',
  developer_required: 'Esta operação exige um perfil de desenvolvedor.',
  invalid_session: 'Sua sessão expirou. Entre novamente.',
  questions_invalid: 'O lote contém questões inválidas. Corrija os itens indicados e valide novamente.',
  payload_too_large: 'O lote excede o limite de tamanho permitido.',
  audit_failure: 'A importação não foi concluída porque o registro de auditoria falhou.',
  question_import_database_error: 'A importação precisa de uma correção segura do banco antes de continuar.',
  origin_not_allowed: 'Este endereço de Preview não está autorizado no ambiente de homologação.',
  question_edit_not_allowed: 'Esta questão não pode mais ser editada no estado atual.',
  question_selection_changed: 'A seleção mudou no backend. Atualize a lista e tente novamente.',
  question_status_mismatch: 'As questões selecionadas não possuem o mesmo estado no backend.',
});

export function normalizeEditorialErrorCode(value) {
  const code = String(value?.code || value?.error || value?.message || value || '').trim();
  const normalized = code.toLowerCase();
  if (EDITORIAL_ERROR_MESSAGES[code]) return code;
  if (code === '23505' || /duplicate key|already exists/.test(normalized)) return 'question_id_exists';
  if (code === '42702' || /column reference.+ambiguous/.test(normalized)) return 'question_import_database_error';
  if (/audit/.test(normalized)) return 'audit_failure';
  return '';
}

export async function extractEditorialErrorCode(error, data) {
  const direct = normalizeEditorialErrorCode(data) || normalizeEditorialErrorCode(error);
  if (direct) return direct;
  const context = error?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const payload = await context.clone().json();
      return normalizeEditorialErrorCode(payload);
    } catch {
      return '';
    }
  }
  return '';
}

export async function editorialErrorMessage(error, data) {
  const code = await extractEditorialErrorCode(error, data);
  return EDITORIAL_ERROR_MESSAGES[code] || 'Operação editorial indisponível. Tente novamente.';
}

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
    if (error || data?.error) throw new Error(await editorialErrorMessage(error, data));
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

  async listVersions(contestId) {
    return this.#invoke('list_versions', { contestId });
  }

  async validateBatch(contestId, questions) {
    return this.#invoke('validate_batch', { contestId, questions });
  }

  async importDraft(contestId, batch, options = {}) {
    const validation = validateEditorialBatch(batch, { contestId, knownIds: options.knownIds, knownSubtopicIds: options.knownSubtopicIds });
    if (!validation.valid) return validation;
    const remoteValidation = await this.validateBatch(contestId, validation.questions);
    if (!remoteValidation.valid) {
      return {
        ...validation,
        ...remoteValidation,
        total: validation.total,
        questions: validation.questions,
      };
    }
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
