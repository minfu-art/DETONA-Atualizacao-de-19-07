import { getSupabaseClient } from '../supabase/client.js';

export const COURSE_FACTORY_SOURCE_CATEGORIES = Object.freeze([
  ['apostila', 'Apostila'],
  ['legislacao', 'Legislação'],
  ['manual', 'Manual'],
  ['material_curso', 'Material do curso'],
  ['referencia', 'Referência'],
  ['outro', 'Outro'],
]);

const FACTORY_ERRORS = Object.freeze({
  ai_not_configured: 'IA NÃO CONFIGURADA',
  official_edital_required: 'Envie o edital oficial antes de analisar.',
  official_category_invalid: 'O edital oficial deve usar a categoria Edital.',
  course_draft_not_found: 'Rascunho não encontrado.',
  source_not_found: 'Fonte não encontrada.',
  draft_locked: 'Este rascunho está bloqueado durante a análise ou após aprovação.',
  proposal_not_editable: 'A proposta ainda não está disponível para edição.',
  proposal_not_ready: 'O mapa ainda não está pronto para aprovação.',
  proposal_incomplete: 'Currículo ou Mapa do Edital incompleto.',
  pdf_signature_invalid: 'O arquivo enviado não é um PDF válido.',
  pdf_extraction_failed: 'Não foi possível extrair o PDF. Consulte o status das páginas.',
  upload_size_mismatch: 'O arquivo recebido não corresponde ao upload iniciado.',
  sources_total_size_invalid: 'O conjunto de PDFs ultrapassa o limite de 40 MB.',
  developer_required: 'A Course Factory exige uma conta developer.',
  invalid_session: 'Sua sessão expirou. Entre novamente.',
  origin_not_allowed: 'Este endereço de Preview ainda não está autorizado.',
});

export function precheckCourseFactoryPdf(file) {
  if (!file) throw new Error('Selecione um PDF.');
  if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name || '')) throw new Error('Use somente arquivos PDF.');
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error('Cada PDF deve ter no máximo 20 MB.');
  return { name: file.name, mimeType: 'application/pdf', size: file.size };
}

async function readFunctionError(error, data) {
  if (data?.error) return String(data.error);
  try {
    const payload = await error?.context?.clone?.().json?.();
    if (payload?.error) return String(payload.error);
  } catch {
    // A mensagem pública abaixo continua segura.
  }
  return String(error?.message || 'course_factory_unavailable');
}

export function mapCourseFactoryError(code) {
  const clean = String(code || '').split(':')[0];
  return FACTORY_ERRORS[clean] || 'Course Factory indisponível. Tente novamente em instantes.';
}

export class AdminCourseFactoryService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async #invoke(action, payload = {}) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend da Course Factory indisponível.');
    const { data, error } = await client.functions.invoke('course-factory-ai', { body: { action, ...payload } });
    if (error || data?.error) {
      const code = await readFunctionError(error, data);
      const mapped = new Error(mapCourseFactoryError(code));
      mapped.code = code;
      throw mapped;
    }
    return { client, data };
  }

  async capabilities() {
    const { data } = await this.#invoke('capabilities');
    return data;
  }

  async listDrafts() {
    const { data } = await this.#invoke('list_drafts');
    return data.drafts || [];
  }

  async createDraft() {
    const { data } = await this.#invoke('create_draft');
    return data;
  }

  async getDraft(draftId) {
    const { data } = await this.#invoke('get_draft', { draftId });
    return data;
  }

  async uploadSource(draftId, file, { sourceType, category }) {
    const checked = precheckCourseFactoryPdf(file);
    const { client, data } = await this.#invoke('create_signed_upload', {
      draftId,
      source: { sourceType, category, ...checked },
    });
    try {
      const { error } = await client.storage.from(data.upload.bucket)
        .uploadToSignedUrl(data.upload.path, data.upload.token, file, { contentType: checked.mimeType });
      if (error) throw new Error('Falha ao armazenar o PDF.');
      const { data: completed } = await this.#invoke('complete_upload', { draftId, sourceId: data.source.id });
      return completed.source;
    } catch (error) {
      await this.removeSource(draftId, data.source.id).catch(() => {});
      throw error;
    }
  }

  async removeSource(draftId, sourceId) {
    const { data } = await this.#invoke('remove_source', { draftId, sourceId });
    return data;
  }

  async analyzeSources(draftId) {
    const { data } = await this.#invoke('analyze_sources', { draftId });
    return data;
  }

  async saveProposal(draftId, proposal) {
    const { data } = await this.#invoke('save_proposal', { draftId, proposal });
    return data;
  }

  async approveMap(draftId) {
    const { data } = await this.#invoke('approve_map', { draftId });
    return data;
  }
}

export const adminCourseFactoryService = new AdminCourseFactoryService();
