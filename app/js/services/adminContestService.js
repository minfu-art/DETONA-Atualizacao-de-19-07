import { CONTEST_CATALOG } from '../contest/contestCatalog.js';
import { getSupabaseClient } from '../supabase/client.js';
import { READ_ONLY_CAPABILITIES, hasWriteCapability, normalizeAdminCapabilities } from './adminCapabilities.js';

export const CONTENT_STATUSES = Object.freeze(['draft', 'preparing', 'ready', 'archived']);
export const SALES_STATUSES = Object.freeze(['unavailable', 'coming_soon', 'available', 'suspended']);
export const CAREER_AREAS = Object.freeze([
  'police_security', 'administrative', 'fiscal_control',
  'courts_legal', 'health_education', 'armed_forces',
]);
export const COURSE_FACTORY_UNAVAILABLE_MESSAGE = 'Fábrica de Concursos indisponível neste ambiente. O backend administrativo ainda não foi ativado.';

const ADMIN_ERROR_MESSAGES = Object.freeze({
  function_unavailable: 'A função administrativa ainda não foi publicada no staging.',
  cors: 'Este endereço de Preview ainda não está autorizado no backend.',
  invalid_session: 'Sua sessão expirou. Entre novamente.',
  developer_required: 'Esta conta não possui permissão de administrador.',
  schema_unavailable: 'A estrutura da Fábrica de Concursos ainda não foi aplicada no staging.',
  duplicate: 'ID, código ou slug já cadastrado.',
});

export function mapAdminContestError(error, data = null) {
  const code = String(data?.error || error?.code || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.context?.status || error?.status || 0);
  const combined = `${code} ${name} ${message}`;
  if (code === 'contest_id_code_or_slug_exists' || status === 409 || /duplicate|already exists|23505/.test(combined)) {
    return ADMIN_ERROR_MESSAGES.duplicate;
  }
  if (code === 'invalid_session' || status === 401 || /invalid[_ ]session|jwt.*(?:expired|invalid)/.test(combined)) {
    return ADMIN_ERROR_MESSAGES.invalid_session;
  }
  if (code === 'developer_required' || status === 403 && /developer|permission|forbidden/.test(combined)) {
    return ADMIN_ERROR_MESSAGES.developer_required;
  }
  if (code === 'origin_not_allowed' || /cors|origin_not_allowed/.test(combined)) {
    return ADMIN_ERROR_MESSAGES.cors;
  }
  if (/relation .* does not exist|schema cache|rpc.*not found|pgrst20[245]|42p01|42883/.test(combined)) {
    return ADMIN_ERROR_MESSAGES.schema_unavailable;
  }
  if (status === 404 || /function.*not found|functionshttperror.*404|failed to send a request to the edge function/.test(combined)) {
    return ADMIN_ERROR_MESSAGES.function_unavailable;
  }
  return 'Módulo de concursos indisponível. Tente novamente em instantes.';
}

export function slugifyContest(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function suggestContestIdentity({ code, name, exam_date: examDate } = {}) {
  const year = String(examDate || '').slice(0, 4);
  const base = slugifyContest(code || name);
  const slug = year && !base.endsWith(year) ? `${base}-${year}` : base;
  return { slug, id: slug.replaceAll('-', '_') };
}

function staticContest(contest) {
  return {
    id: contest.id,
    code: contest.code,
    slug: contest.id.replaceAll('_', '-'),
    name: contest.name,
    role: contest.role,
    description: contest.description,
    price_cents: contest.priceCents,
    currency: contest.currency,
    color: contest.color,
    accent: contest.accent,
    icon: contest.icon,
    cover_asset: null,
    content_status: contest.contentStatus,
    sales_status: contest.contentStatus === 'ready' ? 'available' : 'coming_soon',
    landing_page_id: null,
    exam_date: null,
    career_area: contest.careerArea || null,
    career_subarea: contest.careerSubarea || null,
    source: 'static_catalog',
  };
}

function required(value, label, max = 160) {
  const clean = String(value || '').trim();
  if (!clean || clean.length > max || /<\/?[a-z][^>]*>/i.test(clean)) throw new Error(`${label} inválido.`);
  return clean;
}

export function validateAdminContest(input = {}) {
  const contentStatus = String(input.content_status || 'draft');
  const salesStatus = String(input.sales_status || 'unavailable');
  if (!CONTENT_STATUSES.includes(contentStatus)) throw new Error('Estado de conteúdo inválido.');
  if (!SALES_STATUSES.includes(salesStatus)) throw new Error('Estado comercial inválido.');
  const price = Number.parseInt(input.price_cents ?? 0, 10);
  if (!Number.isInteger(price) || price < 0 || price > 100_000_000) throw new Error('Preço inválido.');
  const color = required(input.color || '#7c6af5', 'Cor', 20);
  const accent = required(input.accent || '#ff8a1f', 'Destaque', 20);
  if (!/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('Cor inválida.');
  const examDate = input.exam_date || null;
  if (examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || Number.isNaN(Date.parse(`${examDate}T00:00:00Z`)))) {
    throw new Error('Data inválida.');
  }
  const slug = required(input.slug, 'Slug', 80);
  const id = required(input.id, 'ID', 80);
  const careerArea = String(input.career_area || '').trim() || null;
  const careerSubarea = String(input.career_subarea || '').trim() || null;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id) || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) throw new Error('ID ou slug inválido.');
  if (careerArea && !CAREER_AREAS.includes(careerArea)) throw new Error('Área de carreira inválida.');
  if (careerSubarea && !/^[a-z0-9][a-z0-9_-]*$/i.test(careerSubarea)) throw new Error('Subárea inválida.');
  return {
    id,
    code: required(input.code, 'Código', 30),
    slug,
    name: required(input.name, 'Nome'),
    role: required(input.role, 'Cargo'),
    description: required(input.description, 'Descrição', 600),
    price_cents: price,
    currency: required(input.currency || 'BRL', 'Moeda', 3).toUpperCase(),
    color,
    accent,
    icon: required(input.icon || input.code, 'Ícone', 30),
    cover_asset: String(input.cover_asset || '').trim() || null,
    content_status: contentStatus,
    sales_status: salesStatus,
    exam_date: examDate,
    career_area: careerArea,
    career_subarea: careerSubarea,
  };
}

export class AdminContestService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
    this.capabilities = { ...READ_ONLY_CAPABILITIES };
  }

  #setCapabilities(capabilities) {
    this.capabilities = normalizeAdminCapabilities(capabilities, READ_ONLY_CAPABILITIES);
    return this.capabilities;
  }

  #requireCapability(capability, capabilities = this.capabilities) {
    if (capabilities?.[capability] !== true) throw new Error(COURSE_FACTORY_UNAVAILABLE_MESSAGE);
  }

  async #invoke(action, payload = {}) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend administrativo indisponível.');
    const { data, error } = await client.functions.invoke('admin-contests', { body: { action, ...payload } });
    if (error || data?.error) {
      throw new Error(mapAdminContestError(error, data));
    }
    return data;
  }

  async listContests({ search = '' } = {}) {
    const fallback = (bootstrapRequired = false) => {
      const needle = String(search).trim().toLocaleLowerCase('pt-BR');
      const rows = CONTEST_CATALOG.map(staticContest).filter((contest) =>
        !needle || `${contest.code} ${contest.name} ${contest.role}`.toLocaleLowerCase('pt-BR').includes(needle));
      return {
        rows,
        source: 'static_catalog',
        capabilities: this.#setCapabilities(READ_ONLY_CAPABILITIES),
        writable: false,
        bootstrapRequired,
      };
    };
    try {
      const result = await this.#invoke('list_contests', { search });
      const rows = Array.isArray(result.contests) ? result.contests : [];
      if (!rows.length) return fallback(true);
      const capabilities = this.#setCapabilities(result.capabilities);
      return { rows, source: 'administrative_table', capabilities, writable: hasWriteCapability(capabilities), bootstrapRequired: false };
    } catch {
      return fallback(false);
    }
  }

  async getContest(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    return this.#invoke('get_contest', { contestId });
  }

  async createContest(input, { capabilities = this.capabilities } = {}) {
    this.#requireCapability('create', capabilities);
    return this.#invoke('create_contest', { contest: validateAdminContest(input) });
  }

  async updateContest(input, { capabilities = this.capabilities } = {}) {
    this.#requireCapability('update', capabilities);
    return this.#invoke('update_contest', { contest: validateAdminContest(input) });
  }

  async saveContest(input, { capabilities = this.capabilities } = {}) {
    if (capabilities?.create !== true && capabilities?.update !== true) {
      throw new Error(COURSE_FACTORY_UNAVAILABLE_MESSAGE);
    }
    const contest = validateAdminContest(input);
    const existing = await this.getContest(contest.id).catch(() => null);
    return existing
      ? this.updateContest(contest, { capabilities })
      : this.createContest(contest, { capabilities });
  }

  async transitionContest(contestId, action, { capabilities = this.capabilities } = {}) {
    if (!['publish', 'suspend', 'archive'].includes(action)) throw new Error('Ação inválida.');
    this.#requireCapability(action === 'archive' ? 'archive' : action === 'publish' ? 'publish' : 'update', capabilities);
    return this.#invoke(action, { contestId });
  }
}

export const adminContestService = new AdminContestService();
