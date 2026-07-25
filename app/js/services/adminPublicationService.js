import { getSupabaseClient } from '../supabase/client.js';

export function validateContentVersion(value) {
  const clean = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(clean)) throw new Error('Versão inválida.');
  return clean;
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
      throw new Error(`${data?.error || error?.message || 'Operação de publicação indisponível'}${checklist}`);
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

  rollback(contestId, packageId) {
    return this.#invoke('rollback_content_package', { contestId, packageId });
  }
}

export const adminPublicationService = new AdminPublicationService();
