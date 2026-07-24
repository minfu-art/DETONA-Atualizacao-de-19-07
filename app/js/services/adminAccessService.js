import { getSupabaseClient } from '../supabase/client.js';

export const ADMIN_CONTEST_ID = 'pc_al_2026';

const SAFE_ERROR_MESSAGES = Object.freeze({
  400: 'Os dados enviados são inválidos.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não possui permissão para administrar acessos.',
  404: 'O aluno ou acesso solicitado não foi encontrado.',
});

export class AdminAccessServiceError extends Error {
  constructor(status, message = null) {
    super(message || SAFE_ERROR_MESSAGES[status] || 'Não foi possível concluir a operação administrativa.');
    this.name = 'AdminAccessServiceError';
    this.status = status || 500;
  }
}

function functionErrorStatus(error) {
  const status = Number(error?.context?.status || error?.status || 0);
  return Number.isInteger(status) && status >= 400 ? status : 500;
}

export class AdminAccessService {
  constructor({ clientProvider = getSupabaseClient } = {}) {
    this.clientProvider = clientProvider;
  }

  async invoke(action, input = {}) {
    const client = await this.clientProvider();
    if (!client) throw new AdminAccessServiceError(503, 'O serviço administrativo está indisponível.');

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (sessionError || !accessToken) throw new AdminAccessServiceError(401);

    const { data, error } = await client.functions.invoke('admin-access', {
      body: { action, ...input },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (error) throw new AdminAccessServiceError(functionErrorStatus(error));
    if (data?.error) throw new AdminAccessServiceError(Number(data.error.status) || 500);
    return data;
  }

  async listUsers({ search = '', page = 1, pageSize = 20 } = {}) {
    return this.invoke('list_users', { search, page, pageSize });
  }

  async grantAccess(userId, contestId = ADMIN_CONTEST_ID) {
    return this.invoke('grant_access', { targetUserId: userId, contestId });
  }

  async revokeAccess(userId, contestId = ADMIN_CONTEST_ID) {
    return this.invoke('revoke_access', { targetUserId: userId, contestId });
  }

  async reactivateAccess(userId, contestId = ADMIN_CONTEST_ID) {
    return this.invoke('reactivate_access', { targetUserId: userId, contestId });
  }
}

export const adminAccessService = new AdminAccessService();
