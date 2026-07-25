import { CONTEST_CATALOG } from '../contest/contestCatalog.js';
import { getSupabaseClient } from '../supabase/client.js';
import { READ_ONLY_CAPABILITIES, hasWriteCapability, normalizeAdminCapabilities } from './adminCapabilities.js';

export const CONTENT_STATUSES = Object.freeze(['draft', 'preparing', 'ready', 'archived']);
export const SALES_STATUSES = Object.freeze(['unavailable', 'coming_soon', 'available', 'suspended']);

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
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id) || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) throw new Error('ID ou slug inválido.');
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
  };
}

export class AdminContestService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async #invoke(action, payload = {}) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend administrativo indisponível.');
    const { data, error } = await client.functions.invoke('admin-contests', { body: { action, ...payload } });
    if (error || data?.error) {
      if (data?.error === 'contest_id_code_or_slug_exists') throw new Error('ID, código ou slug já cadastrado.');
      throw new Error(data?.error || error?.message || 'Módulo de concursos indisponível.');
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
        capabilities: { ...READ_ONLY_CAPABILITIES },
        writable: false,
        bootstrapRequired,
      };
    };
    try {
      const result = await this.#invoke('list_contests', { search });
      const rows = Array.isArray(result.contests) ? result.contests : [];
      if (!rows.length) return fallback(true);
      const capabilities = normalizeAdminCapabilities(result.capabilities, READ_ONLY_CAPABILITIES);
      return { rows, source: 'administrative_table', capabilities, writable: hasWriteCapability(capabilities), bootstrapRequired: false };
    } catch {
      return fallback(false);
    }
  }

  async getContest(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    return this.#invoke('get_contest', { contestId });
  }

  async createContest(input) {
    return this.#invoke('create_contest', { contest: validateAdminContest(input) });
  }

  async updateContest(input) {
    return this.#invoke('update_contest', { contest: validateAdminContest(input) });
  }

  async saveContest(input) {
    const contest = validateAdminContest(input);
    const existing = await this.getContest(contest.id).catch(() => null);
    return existing ? this.updateContest(contest) : this.createContest(contest);
  }

  async transitionContest(contestId, action) {
    if (!['publish', 'suspend', 'archive'].includes(action)) throw new Error('Ação inválida.');
    return this.#invoke(action, { contestId });
  }
}

export const adminContestService = new AdminContestService();
