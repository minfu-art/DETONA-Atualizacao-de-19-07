import { getSupabaseClient } from '../supabase/client.js';

export const COURSE_FACTORY_SOURCE_CATEGORIES = Object.freeze([
  ['apostila', 'Apostila'], ['legislacao', 'Legislação'], ['manual', 'Manual'],
  ['material_curso', 'Material do curso'], ['referencia', 'Referência'], ['outro', 'Outro'],
]);

const FACTORY_FUNCTION = 'course-factory-assisted';
const FACTORY_ERRORS = Object.freeze({
  automatic_ai_disabled: 'IA AUTOMÁTICA DESATIVADA',
  package_invalid: 'O pacote possui erros. Corrija-os antes da importação.',
  official_edital_required: 'Envie o edital oficial antes de importar.',
  course_draft_not_found: 'Rascunho não encontrado.',
  source_not_found: 'Fonte não encontrada.',
  draft_sources_locked: 'As fontes ficam bloqueadas após a importação do pacote.',
  draft_locked: 'Este rascunho já foi aprovado.',
  package_not_ready: 'Importe e valide um pacote antes de aprovar o mapa.',
  pdf_signature_invalid: 'O arquivo enviado não é um PDF válido.',
  upload_size_mismatch: 'O arquivo recebido não corresponde ao upload iniciado.',
  developer_required: 'A Course Factory exige uma conta developer.',
  invalid_session: 'Sua sessão expirou. Entre novamente.',
  origin_not_allowed: 'Este endereço de Preview ainda não está autorizado.',
  payload_too_large: 'O pacote ultrapassa o limite de 15 MB.',
});

export function precheckCourseFactoryPdf(file) {
  if (!file) throw new Error('Selecione um PDF.');
  if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name || '')) throw new Error('Use somente arquivos PDF.');
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error('Cada PDF deve ter no máximo 20 MB.');
  return { name: file.name, mimeType: 'application/pdf', size: file.size };
}

function parseJson(text, label) {
  try { return JSON.parse(text); } catch { throw new Error(`${label} não contém JSON válido.`); }
}

function fileBase(file) {
  const relative = String(file.webkitRelativePath || file.name || '').replaceAll('\\', '/');
  return relative.split('/').pop().toLocaleLowerCase('pt-BR');
}

function listPayload(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

export async function assembleAssistedCoursePackage(files) {
  const selected = [...(files || [])];
  if (!selected.length) throw new Error('Selecione o pacote JSON ou a pasta do curso.');
  if (selected.length > 510) throw new Error('O pacote possui arquivos demais.');
  if (selected.reduce((sum, file) => sum + Number(file.size || 0), 0) > 14 * 1024 * 1024) throw new Error('O pacote JSON deve ter no máximo 14 MB.');
  const entries = [];
  for (const file of selected) {
    if (!/\.json$/i.test(file.name || '') && file.type !== 'application/json') continue;
    entries.push({ file, base: fileBase(file), value: parseJson(await file.text(), file.name) });
  }
  if (!entries.length) throw new Error('Nenhum arquivo JSON foi encontrado.');
  if (entries.length === 1 && entries[0].value?.course && entries[0].value?.curriculum) return entries[0].value;

  const get = (...names) => entries.find(({ base }) => names.includes(base))?.value;
  const courseFile = get('course.json', 'contest.json');
  const curriculumFile = get('curriculum.json');
  const sourcesFile = get('sources.json');
  const mapFile = get('edital-map.json', 'edital_map.json');
  const knowledgeFile = get('microknowledge.json', 'microknowledges.json');
  const metadataFile = get('metadata.json') || {};
  const questionEntries = entries.filter(({ file, base }) => {
    const relative = String(file.webkitRelativePath || '').replaceAll('\\', '/').toLocaleLowerCase('pt-BR');
    return relative.includes('/questions/') || /^questions?[-_.]/.test(base) || /^lote[-_.]/.test(base);
  });
  const envelope = courseFile || {};
  const course = envelope.course || envelope.contest || envelope;
  return {
    schema_version: Number(envelope.schema_version || 1),
    operation_id: envelope.operation_id || course.operation_id || '',
    course,
    sources: listPayload(sourcesFile, ['sources', 'items']),
    curriculum: curriculumFile?.curriculum || curriculumFile || { nodes: [] },
    edital_map: listPayload(mapFile, ['edital_map', 'items']),
    microknowledges: listPayload(knowledgeFile, ['microknowledges', 'items']),
    question_batches: questionEntries.map(({ base, value }) => ({
      name: value.name || base.replace(/\.json$/i, ''),
      questions: listPayload(value, ['questions', 'questoes', 'items']),
    })),
    metadata: metadataFile.metadata || metadataFile,
  };
}

async function functionErrorPayload(error, data) {
  if (data?.error) return data;
  try {
    const payload = await error?.context?.clone?.().json?.();
    if (payload?.error) return payload;
  } catch {
    // A mensagem pública abaixo continua segura.
  }
  return { error: String(error?.message || 'course_factory_unavailable') };
}

export function mapCourseFactoryError(code) {
  const clean = String(code || '').split(':')[0];
  return FACTORY_ERRORS[clean] || 'Course Factory indisponível. Tente novamente em instantes.';
}

export class AdminCourseFactoryService {
  constructor({ getClient = getSupabaseClient } = {}) { this.getClient = getClient; }

  async #invoke(action, payload = {}) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend da Course Factory indisponível.');
    const { data, error } = await client.functions.invoke(FACTORY_FUNCTION, { body: { action, ...payload } });
    if (error || data?.error) {
      const details = await functionErrorPayload(error, data);
      const mapped = new Error(mapCourseFactoryError(details.error));
      mapped.code = details.error;
      mapped.report = details.report || null;
      throw mapped;
    }
    return { client, data };
  }

  async capabilities() { return (await this.#invoke('capabilities')).data; }
  async listDrafts() { return (await this.#invoke('list_drafts')).data.drafts || []; }
  async createDraft() { return (await this.#invoke('create_draft')).data; }
  async getDraft(draftId) { return (await this.#invoke('get_draft', { draftId })).data; }

  async uploadSource(draftId, file, { sourceType, category }) {
    const checked = precheckCourseFactoryPdf(file);
    const { client, data } = await this.#invoke('create_signed_upload', {
      draftId, source: { sourceType, category, ...checked },
    });
    try {
      const { error } = await client.storage.from(data.upload.bucket)
        .uploadToSignedUrl(data.upload.path, data.upload.token, file, { contentType: checked.mimeType });
      if (error) throw new Error('Falha ao armazenar o PDF.');
      return (await this.#invoke('complete_upload', { draftId, sourceId: data.source.id })).data.source;
    } catch (error) {
      await this.removeSource(draftId, data.source.id).catch(() => {});
      throw error;
    }
  }

  async removeSource(draftId, sourceId) { return (await this.#invoke('remove_source', { draftId, sourceId })).data; }
  async validatePackage(draftId, coursePackage) { return (await this.#invoke('validate_package', { draftId, package: coursePackage })).data.report; }
  async importPackage(draftId, coursePackage) { return (await this.#invoke('import_package', { draftId, package: coursePackage })).data; }
  async approveMap(draftId) { return (await this.#invoke('approve_map', { draftId })).data; }
}

export const adminCourseFactoryService = new AdminCourseFactoryService();
