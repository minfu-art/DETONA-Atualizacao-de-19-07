const DEFAULT_ORIGIN = 'https://detona-staging-git-fix-p0-foundation-min-fu-projetos.vercel.app';
const DEFAULT_STAGING_REF = 'folnsdtmaiksjqqsohjx';
const BLOCKED_ERROR_PATTERN = /password|token|jwt|secret|service.?role|authorization|apikey/i;

function safeErrorCode(value) {
  const code = String(value?.error?.code || value?.error || value?.code || value?.message || 'remote_operation_failed');
  return BLOCKED_ERROR_PATTERN.test(code) ? 'remote_operation_failed' : code.slice(0, 160);
}

export function validateStagingConfig(config) {
  if (config.environment !== 'staging') throw Object.assign(new Error('Produção é bloqueada pelo provisionador.'), { code: 'COURSE_PROVISION_BLOCKED' });
  let url;
  try {
    url = new URL(config.supabaseUrl);
  } catch {
    throw Object.assign(new Error('DETONA_SUPABASE_URL inválida.'), { code: 'COURSE_PROVISION_BLOCKED' });
  }
  const expectedRef = config.stagingProjectRef || DEFAULT_STAGING_REF;
  if (url.protocol !== 'https:' || url.hostname !== `${expectedRef}.supabase.co`) {
    throw Object.assign(new Error('O destino não corresponde ao projeto Supabase staging autorizado.'), { code: 'COURSE_PROVISION_BLOCKED' });
  }
  if (!config.anonKey) throw Object.assign(new Error('DETONA_SUPABASE_ANON_KEY ausente.'), { code: 'COURSE_PROVISION_BLOCKED' });
  const origin = new URL(config.origin || DEFAULT_ORIGIN);
  if (origin.protocol !== 'https:' || !/^detona-staging-(?:[a-z0-9]{9}|git-fix-p0-foundation)-min-fu-projetos\.vercel\.app$/.test(origin.hostname)) {
    throw Object.assign(new Error('DETONA_ADMIN_ORIGIN não é um Preview autorizado.'), { code: 'COURSE_PROVISION_BLOCKED' });
  }
  return { ...config, supabaseUrl: url.origin, origin: origin.origin, stagingProjectRef: expectedRef };
}

async function authenticateWithPassword(config, fetcher) {
  if (!config.email || !config.password) return null;
  const response = await fetcher(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw Object.assign(new Error('Autenticação administrativa temporária falhou.'), { code: 'COURSE_PROVISION_BLOCKED' });
  }
  return payload.access_token;
}

export class AdminEdgeClient {
  constructor(config, { fetcher = globalThis.fetch } = {}) {
    if (typeof fetcher !== 'function') throw new Error('fetch indisponível.');
    this.config = validateStagingConfig(config);
    this.fetcher = fetcher;
    this.accessToken = config.accessToken || null;
  }

  async authenticate() {
    if (!this.accessToken) this.accessToken = await authenticateWithPassword(this.config, this.fetcher);
    if (!this.accessToken) {
      throw Object.assign(new Error('Defina DETONA_ADMIN_ACCESS_TOKEN ou credenciais temporárias em variáveis de ambiente locais.'), {
        code: 'COURSE_PROVISION_BLOCKED',
      });
    }
    return true;
  }

  async invoke(functionName, body) {
    await this.authenticate();
    const response = await this.fetcher(`${this.config.supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        authorization: `Bearer ${this.accessToken}`,
        origin: this.config.origin,
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-client-info': 'detona-course-provisioner/1',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      const error = new Error(`Operação protegida recusada: ${safeErrorCode(payload)}.`);
      error.code = safeErrorCode(payload);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  contests(action, payload = {}) {
    return this.invoke('admin-contests', { action, ...payload });
  }

  editorial(action, payload = {}) {
    return this.invoke('admin-editorial', { action, ...payload });
  }

  media(action, payload = {}) {
    return this.invoke('admin-media', { action, ...payload });
  }

  async uploadSigned(signed, asset) {
    await this.authenticate();
    const encodedPath = String(signed.path).split('/').map(encodeURIComponent).join('/');
    const url = `${this.config.supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(signed.bucket)}/${encodedPath}?token=${encodeURIComponent(signed.token)}`;
    const response = await this.fetcher(url, {
      method: 'PUT',
      headers: {
        apikey: this.config.anonKey,
        authorization: `Bearer ${this.accessToken}`,
        'content-type': asset.mimeType,
        'cache-control': 'no-store',
        'x-upsert': 'false',
      },
      body: asset.bytes,
    });
    if (!response.ok) {
      const error = new Error('Falha no upload assinado.');
      error.code = 'signed_upload_failed';
      throw error;
    }
    return true;
  }
}

export function configFromEnvironment(environment, env = process.env) {
  return {
    environment,
    supabaseUrl: env.DETONA_SUPABASE_URL || env.SUPABASE_URL || '',
    anonKey: env.DETONA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
    accessToken: env.DETONA_ADMIN_ACCESS_TOKEN || '',
    email: env.DETONA_ADMIN_EMAIL || '',
    password: env.DETONA_ADMIN_PASSWORD || '',
    origin: env.DETONA_ADMIN_ORIGIN || DEFAULT_ORIGIN,
    stagingProjectRef: env.DETONA_STAGING_PROJECT_REF || DEFAULT_STAGING_REF,
  };
}
