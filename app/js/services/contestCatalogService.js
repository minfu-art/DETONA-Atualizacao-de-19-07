import { CONTEST_CATALOG } from '../contest/contestCatalog.js';
import { getSupabaseClient } from '../supabase/client.js';

export function normalizeDynamicContest(contest) {
  const normalized = {
    id: String(contest.id || ''),
    code: String(contest.code || ''),
    name: String(contest.name || ''),
    role: String(contest.role || ''),
    description: String(contest.description || ''),
    color: String(contest.color || '#7c6af5'),
    accent: String(contest.accent || '#ff8a1f'),
    icon: String(contest.icon || contest.code || ''),
    priceCents: Number(contest.priceCents ?? contest.price_cents ?? 0),
    currency: String(contest.currency || 'BRL'),
    contentStatus: contest.contentStatus || contest.content_status || 'preparing',
    salesStatus: contest.salesStatus || contest.sales_status || 'coming_soon',
    examDate: contest.examDate || contest.exam_date || null,
    coverAsset: contest.coverAsset || contest.cover_asset || null,
    organization: String(contest.organization || contest.name || ''),
    careerArea: String(contest.careerArea || contest.career_area || 'other'),
    careerSubarea: contest.careerSubarea || contest.career_subarea || null,
    subtopicCount: Number(contest.subtopicCount ?? contest.subtopic_count ?? 0),
    questionCount: Number(contest.questionCount ?? contest.question_count ?? 0),
    source: contest.source || 'dynamic_catalog',
  };
  if (!normalized.id || !normalized.code || !normalized.name) throw new Error('Concurso dinâmico inválido.');
  return normalized;
}

export class ContestCatalogService {
  constructor({ getClient = getSupabaseClient, fallback = CONTEST_CATALOG } = {}) {
    this.getClient = getClient;
    this.fallback = fallback.map((contest) => ({ ...contest, source: 'static_fallback' }));
    this.cache = null;
  }

  async list({ refresh = false } = {}) {
    if (this.cache && !refresh) return structuredClone(this.cache);
    try {
      const client = await this.getClient();
      if (!client) throw new Error('backend_unavailable');
      const { data, error } = await client.functions.invoke('student-content', { body: { action: 'list_catalog' } });
      if (error || data?.error || !Array.isArray(data?.contests)) throw new Error(data?.error || 'backend_unavailable');
      this.cache = data.contests.map(normalizeDynamicContest)
        .filter((contest) => !['draft', 'archived'].includes(contest.contentStatus));
      return structuredClone(this.cache);
    } catch {
      return structuredClone(this.fallback);
    }
  }

  async getById(contestId, options) {
    return (await this.list(options)).find(({ id }) => id === contestId) || null;
  }

  clear() {
    this.cache = null;
  }
}

export const contestCatalogService = new ContestCatalogService();
