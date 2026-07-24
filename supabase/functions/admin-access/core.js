export const ADMIN_ACTIONS = Object.freeze([
  'list_users',
  'grant_access',
  'revoke_access',
  'reactivate_access',
]);

export const ADMIN_CONTESTS = Object.freeze(['pc_al_2026']);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s@._+\-]*$/u;
const ACTION_FIELDS = Object.freeze({
  list_users: new Set(['action', 'search', 'page', 'pageSize']),
  grant_access: new Set(['action', 'targetUserId', 'contestId']),
  revoke_access: new Set(['action', 'targetUserId', 'contestId']),
  reactivate_access: new Set(['action', 'targetUserId', 'contestId']),
});

export class AdminAccessError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AdminAccessError';
    this.status = status;
    this.code = code;
  }
}

function integer(value, fallback, label, minimum, maximum) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AdminAccessError(400, 'INVALID_INPUT', `${label} inválido.`);
  }
  return parsed;
}

function rejectUnexpectedFields(input, action) {
  const allowed = ACTION_FIELDS[action];
  const unexpected = Object.keys(input).find((field) => !allowed.has(field));
  if (unexpected) {
    throw new AdminAccessError(400, 'INVALID_INPUT', 'A solicitação contém campos não permitidos.');
  }
}

export function validateAdminPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AdminAccessError(400, 'INVALID_JSON', 'Envie um objeto JSON válido.');
  }

  const action = String(input.action || '');
  if (!ADMIN_ACTIONS.includes(action)) {
    throw new AdminAccessError(400, 'INVALID_ACTION', 'Ação administrativa inválida.');
  }
  rejectUnexpectedFields(input, action);

  if (action === 'list_users') {
    const search = String(input.search || '').trim();
    if (search.length > 100 || !SEARCH_PATTERN.test(search)) {
      throw new AdminAccessError(400, 'INVALID_SEARCH', 'Pesquisa inválida.');
    }
    return {
      action,
      search,
      page: integer(input.page, 1, 'Página', 1, 100000),
      pageSize: integer(input.pageSize, 20, 'Tamanho da página', 1, 50),
    };
  }

  const targetUserId = String(input.targetUserId || '');
  const contestId = String(input.contestId || '');
  if (!UUID_PATTERN.test(targetUserId)) {
    throw new AdminAccessError(400, 'INVALID_USER', 'Aluno inválido.');
  }
  if (!ADMIN_CONTESTS.includes(contestId)) {
    throw new AdminAccessError(400, 'INVALID_CONTEST', 'Concurso não permitido.');
  }
  return { action, targetUserId, contestId };
}

function safeEntitlement(entitlement) {
  if (!entitlement) return null;
  return {
    contestId: entitlement.contest_id || entitlement.contestId || null,
    status: entitlement.status || null,
    grantedAt: entitlement.granted_at || entitlement.grantedAt || null,
    source: entitlement.source || null,
  };
}

export function sanitizeAdminUser(row) {
  return {
    userId: row.id || row.userId,
    name: row.name || '',
    email: row.email || '',
    role: row.role || 'student',
    createdAt: row.created_at || row.createdAt || null,
    entitlement: safeEntitlement(row.entitlement),
  };
}

export function sanitizeAccessResult(row) {
  return {
    userId: row.user_id || row.userId,
    contestId: row.contest_id || row.contestId,
    status: row.status,
    grantedAt: row.granted_at || row.grantedAt || null,
    source: row.source || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function jsonResponse(status, payload, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders,
    },
  });
}

function bearerToken(request) {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new AdminAccessError(401, 'UNAUTHORIZED', 'Sessão ausente ou inválida.');
  return match[1];
}

/**
 * Núcleo testável da Edge Function. As dependências privilegiadas são injetadas
 * somente pelo index.ts e nunca chegam ao navegador.
 */
export function createAdminAccessHandler({
  resolveIdentity,
  repository,
  corsHeaders = {},
}) {
  return async function adminAccessHandler(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }, corsHeaders);
    }

    try {
      let identity;
      try {
        identity = await resolveIdentity(bearerToken(request));
      } catch {
        throw new AdminAccessError(401, 'UNAUTHORIZED', 'Sessão ausente ou inválida.');
      }
      if (!identity?.userId) {
        throw new AdminAccessError(401, 'UNAUTHORIZED', 'Sessão ausente ou inválida.');
      }
      if (identity.role !== 'developer') {
        throw new AdminAccessError(403, 'FORBIDDEN', 'Acesso restrito à equipe autorizada.');
      }

      let rawPayload;
      try {
        rawPayload = await request.json();
      } catch {
        throw new AdminAccessError(400, 'INVALID_JSON', 'Envie um JSON válido.');
      }
      const payload = validateAdminPayload(rawPayload);

      if (payload.action === 'list_users') {
        const result = await repository.listUsers(payload);
        return jsonResponse(200, {
          users: (result.users || []).map(sanitizeAdminUser),
          total: Number(result.total || 0),
          page: payload.page,
          pageSize: payload.pageSize,
        }, corsHeaders);
      }

      if (!(await repository.userExists(payload.targetUserId))) {
        throw new AdminAccessError(404, 'USER_NOT_FOUND', 'Aluno não encontrado.');
      }
      if (
        payload.action !== 'grant_access'
        && !(await repository.entitlementExists(payload.targetUserId, payload.contestId))
      ) {
        throw new AdminAccessError(404, 'ACCESS_NOT_FOUND', 'Acesso não encontrado.');
      }

      const access = await repository.changeAccess({
        actorUserId: identity.userId,
        ...payload,
      });
      return jsonResponse(200, { access: sanitizeAccessResult(access) }, corsHeaders);
    } catch (error) {
      if (error instanceof AdminAccessError) {
        return jsonResponse(error.status, {
          error: { code: error.code, message: error.message },
        }, corsHeaders);
      }
      return jsonResponse(500, {
        error: {
          code: 'OPERATION_FAILED',
          message: 'Não foi possível concluir a operação administrativa.',
        },
      }, corsHeaders);
    }
  };
}
