import { getSupabaseClient } from '../supabase/client.js';

const PUBLICATION_ERROR_MESSAGES = Object.freeze({
  publication_checklist_incomplete: 'Ainda existem pendências no checklist de publicação.',
  package_version_or_content_exists: 'Já existe um pacote com esta versão ou com o mesmo conteúdo.',
  package_version_exists: 'Esta versão já está em uso. Informe uma nova versão.',
  publication_confirmation_invalid: 'Confirmação incorreta. Digite exatamente o código do concurso mostrado na tela.',
  unpublish_confirmation_invalid: 'Confirmação incorreta. Digite exatamente o código do concurso mostrado na tela.',
  restore_confirmation_invalid: 'Confirmação incorreta. Digite exatamente o código do concurso mostrado na tela.',
  generated_package_not_found: 'Este pacote não está mais disponível para publicação. Atualize a página.',
  question_snapshot_not_found: 'O snapshot de questões deste pacote não está disponível.',
  visual_assets_invalid: 'Uma ou mais artes do pacote não estão publicadas ou não pertencem a este concurso.',
  contest_not_found: 'O concurso selecionado não foi encontrado.',
  developer_required: 'Esta operação exige uma conta developer.',
  invalid_session: 'Sua sessão expirou. Entre novamente.',
  origin_not_allowed: 'Este endereço de Preview não está autorizado no staging.',
});

export function normalizePublicationErrorCode(value) {
  const code = String(value?.code || value?.error || value?.message || value || '').trim();
  return PUBLICATION_ERROR_MESSAGES[code] ? code : '';
}

export async function publicationErrorMessage(error, data) {
  let code = normalizePublicationErrorCode(data) || normalizePublicationErrorCode(error);
  const context = error?.context;
  if (!code && context && typeof context.clone === 'function') {
    try {
      code = normalizePublicationErrorCode(await context.clone().json());
    } catch {
      code = '';
    }
  }
  return PUBLICATION_ERROR_MESSAGES[code] || 'Não foi possível concluir a operação. Atualize a página e tente novamente.';
}

export function validateContentVersion(value) {
  const clean = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(clean)) throw new Error('Versão inválida.');
  return clean;
}

export function validatePackageConfirmation(value, expectedCode) {
  const confirmation = String(value || '').trim();
  const code = String(expectedCode || '').trim();
  if (!code || confirmation !== code) {
    throw new Error(`Digite exatamente ${code || 'o código do concurso'} para confirmar.`);
  }
  return confirmation;
}

export class AdminPublicationService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async #invoke(action, payload) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend de publicação indisponível.');
    const { data, error } = await client.functions.invoke('admin-contests', { body: { action, ...payload } });
    if (error || data?.error) {
      const checklist = data?.checklist ? ` (${Object.entries(data.checklist).filter(([, ok]) => !ok).map(([key]) => key).join(', ')})` : '';
      throw new Error(`${await publicationErrorMessage(error, data)}${checklist}`);
    }
    return data;
  }

  validate(contestId) {
    return this.#invoke('validate_publication', { contestId });
  }

  list(contestId) {
    return this.#invoke('list_content_packages', { contestId });
  }

  generate(contestId, version) {
    return this.#invoke('generate_content_package', { contestId, version: validateContentVersion(version) });
  }

  preview(contestId, packageId) {
    return this.#invoke('preview_content_package', { contestId, packageId });
  }

  publish(contestId, packageId, confirmation) {
    return this.#invoke('publish_content_package', { contestId, packageId, confirmation: String(confirmation || '').trim() });
  }

  unpublish(contestId, packageId, confirmation) {
    return this.#invoke('unpublish_content_package', { contestId, packageId, confirmation: String(confirmation || '').trim() });
  }

  restore(contestId, packageId, confirmation) {
    return this.#invoke('restore_content_package', { contestId, packageId, confirmation: String(confirmation || '').trim() });
  }

  rollback(contestId, packageId) {
    return this.#invoke('rollback_content_package', { contestId, packageId });
  }
}

export const adminPublicationService = new AdminPublicationService();
