import { CONTEST_CATALOG } from '../contest/contestCatalog.js';
import { getSupabaseClient } from '../supabase/client.js';
import { isLocalDevelopment } from '../config/appEnvironment.js';

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
    examBoard: String(contest.examBoard || contest.exam_board || contest.banca || ''),
    careerArea: String(contest.careerArea || contest.career_area || 'other'),
    careerSubarea: contest.careerSubarea || contest.career_subarea || null,
    metadata: contest.metadata && typeof contest.metadata === 'object' ? structuredClone(contest.metadata) : null,
    subtopicCount: Number(contest.subtopicCount ?? contest.subtopic_count ?? 0),
    questionCount: Number(contest.questionCount ?? contest.question_count ?? 0),
    interestCount: Math.max(0, Number(contest.interestCount ?? contest.interest_count ?? 0) || 0),
    interested: contest.interested === true,
    interestGoal: (() => {
      const value = Number(contest.interestGoal ?? contest.interest_goal);
      return Number.isInteger(value) && value > 0 ? value : null;
    })(),
    source: contest.source || 'dynamic_catalog',
  };
  if (normalized.id === 'pc_al_2026') {
    normalized.subtopicCount ||= 137;
    normalized.questionCount ||= 6480;
  }
  if (normalized.id === 'pc_ba_2026') {
    normalized.subtopicCount ||= 296;
    normalized.questionCount ||= 1267;
  }
  if (normalized.id === 'pm_ba_2026') {
    normalized.subtopicCount ||= 213;
  }
  if (normalized.id === 'pm_al_2026') {
    normalized.subtopicCount ||= 161;
    normalized.questionCount ||= 71;
  }
  if (normalized.id === 'pc_pe_2026') {
    normalized.subtopicCount ||= 188;
    normalized.questionCount ||= 317;
  }
  if (!normalized.id || !normalized.code || !normalized.name) throw new Error('Concurso dinâmico inválido.');
  return normalized;
}

export class ContestCatalogService {
  constructor({
    getClient = getSupabaseClient,
    fallback = CONTEST_CATALOG,
    allowFallback = isLocalDevelopment,
  } = {}) {
    this.getClient = getClient;
    this.fallback = fallback.map((contest) => ({ ...contest, source: 'static_fallback' }));
    this.allowFallback = allowFallback;
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
        .filter((contest) => contest.contentStatus !== 'archived'
          && (contest.salesStatus === 'monitoring' || contest.contentStatus !== 'draft'));
      return structuredClone(this.cache);
    } catch (error) {
      if (this.cache) return structuredClone(this.cache);
      if (this.allowFallback()) return structuredClone(this.fallback);
      const unavailable = new Error('Catálogo temporariamente indisponível. Verifique sua conexão e tente novamente.');
      unavailable.code = 'CATALOG_UNAVAILABLE';
      unavailable.cause = error;
      throw unavailable;
    }
  }

  async getById(contestId, options) {
    return (await this.list(options)).find(({ id }) => id === contestId) || null;
  }

  async setInterest(contestId, interested) {
    const client = await this.getClient();
    if (!client) throw new Error('backend_unavailable');
    const { data, error } = await client.functions.invoke('student-content', {
      body: { action: 'set_interest', contestId: String(contestId), interested: interested === true },
    });
    if (error || data?.error) {
      const reason = data?.error || 'interest_unavailable';
      throw new Error(reason === 'interest_not_available'
        ? 'Este concurso não aceita novos interesses no momento.'
        : 'Não foi possível registrar seu interesse agora.');
    }
    if (!data || data.contestId !== contestId || typeof data.interested !== 'boolean') throw new Error('interest_response_invalid');
    this.cache = null;
    return {
      contestId: data.contestId,
      interested: data.interested,
      interestCount: Math.max(0, Number(data.interestCount) || 0),
    };
  }

  clear() {
    this.cache = null;
  }
}

export const contestCatalogService = new ContestCatalogService();
