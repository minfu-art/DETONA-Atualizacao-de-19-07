import { getSupabaseClient } from './client.js';

function toApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    contestId: row.contest_id,
    status: row.status,
    source: row.source,
    grantedAt: row.granted_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseEntitlementRepository {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async #client() {
    const client = await this.getClient();
    if (!client) throw new Error('Supabase é obrigatório para consultar acessos neste ambiente.');
    return client;
  }

  async listByUser(userId) {
    const client = await this.#client();
    const { data, error } = await client.from('contest_entitlements').select('*').eq('user_id', userId);
    if (error) throw error;
    return (data || []).map(toApp);
  }

  async find(userId, contestId) {
    const client = await this.#client();
    const { data, error } = await client.from('contest_entitlements').select('*')
      .eq('user_id', userId).eq('contest_id', contestId).maybeSingle();
    if (error) throw error;
    return toApp(data);
  }

  async save() {
    throw new Error('Entitlements comerciais só podem ser alterados pelo backend privilegiado.');
  }
}
