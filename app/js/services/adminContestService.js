import { CONTEST_CATALOG } from '../contest/contestCatalog.js';
import { getSupabaseClient } from '../supabase/client.js';

export const CONTENT_STATUSES = Object.freeze(['draft', 'preparing', 'ready', 'archived']);
export const SALES_STATUSES = Object.freeze(['unavailable', 'coming_soon', 'available', 'suspended']);

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

export function validateAdminContest(input = {}) {
  const required = (value, label, max = 160) => {
    const clean = String(value || '').trim();
    if (!clean || clean.length > max) throw new Error(`${label} inválido.`);
    return clean;
  };
  const status = String(input.content_status || 'draft');
  const sales = String(input.sales_status || 'unavailable');
  if (!CONTENT_STATUSES.includes(status)) throw new Error('Estado de conteúdo inválido.');
  if (!SALES_STATUSES.includes(sales)) throw new Error('Estado comercial inválido.');
  return {
    id: required(input.id, 'ID', 80),
    code: required(input.code, 'Código', 30),
    slug: required(input.slug, 'Slug', 100),
    name: required(input.name, 'Nome'),
    role: required(input.role, 'Cargo'),
    description: required(input.description, 'Descrição', 600),
    price_cents: Math.max(0, Number.parseInt(input.price_cents || 0, 10)),
    currency: required(input.currency || 'BRL', 'Moeda', 3),
    color: required(input.color || '#7c6af5', 'Cor', 20),
    accent: required(input.accent || '#ff8a1f', 'Destaque', 20),
    icon: required(input.icon || input.code, 'Ícone', 30),
    content_status: status,
    sales_status: sales,
    exam_date: input.exam_date || null,
  };
}

export class AdminContestService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async #invoke(action, payload = {}) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend administrativo indisponível.');
    const { data, error } = await client.functions.invoke('admin-contests', {
      body: { action, ...payload },
    });
    if (error || data?.error) throw new Error('Módulo de concursos ainda não publicado no staging.');
    return data;
  }

  async listContests({ search = '' } = {}) {
    try {
      const result = await this.#invoke('list_contests', { search });
      return { rows: result.contests || [], source: 'administrative_table', writable: true };
    } catch {
      const needle = String(search).trim().toLocaleLowerCase('pt-BR');
      const rows = CONTEST_CATALOG.map(staticContest).filter((contest) =>
        !needle || `${contest.code} ${contest.name} ${contest.role}`.toLocaleLowerCase('pt-BR').includes(needle));
      return { rows, source: 'static_catalog', writable: false };
    }
  }

  async saveContest(input) {
    return this.#invoke('save_contest', { contest: validateAdminContest(input) });
  }

  async transitionContest(contestId, action) {
    if (!['publish', 'suspend', 'archive'].includes(action)) throw new Error('Ação inválida.');
    return this.#invoke(action, { contestId });
  }
}

export const adminContestService = new AdminContestService();
