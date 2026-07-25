import { getSupabaseClient } from '../supabase/client.js';

export class AdminAuditService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async list({ contestId, page = 1, pageSize = 30 } = {}) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend administrativo indisponível.');
    const { data, error } = await client.functions.invoke('admin-contests', {
      body: { action: 'list_audit', contestId: contestId || null, page, pageSize },
    });
    if (error || data?.error) throw new Error('Auditoria consolidada preparada para a próxima fase.');
    return data;
  }
}

export const adminAuditService = new AdminAuditService();
