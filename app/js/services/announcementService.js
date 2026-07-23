import { getSupabaseClient } from '../supabase/client.js';

export const ANNOUNCEMENT_CATEGORIES = Object.freeze([
  'event',
  'update',
  'maintenance',
  'focus',
  'study_tip',
  'official_notice',
]);
export const ANNOUNCEMENT_PRIORITIES = Object.freeze(['normal', 'high', 'urgent']);
export const ANNOUNCEMENT_AUDIENCES = Object.freeze(['all', 'contest']);
export const ANNOUNCEMENT_CTA_TYPES = Object.freeze(['none', 'internal_route', 'external_url']);
export const ANNOUNCEMENT_ROUTES = Object.freeze([
  'home',
  'map',
  'edital',
  'expedition',
  'performance',
  'wellbeing',
  'profile',
  'review',
]);

const HTML_PATTERN = /<[^>]*>/;
const PRIORITY_ORDER = Object.freeze({ urgent: 0, high: 1, normal: 2 });

function requiredText(value, label, maxLength) {
  const clean = String(value || '').trim();
  if (!clean) throw new Error(`${label} é obrigatório.`);
  if (clean.length > maxLength) throw new Error(`${label} excede ${maxLength} caracteres.`);
  if (HTML_PATTERN.test(clean)) throw new Error(`${label} não aceita HTML.`);
  return clean;
}

function optionalText(value, label) {
  if (value == null || value === '') return null;
  const clean = String(value).trim();
  if (HTML_PATTERN.test(clean)) throw new Error(`${label} não aceita HTML.`);
  return clean || null;
}

function allowedValue(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} inválido.`);
  return value;
}

function isoDate(value, label, { optional = false } = {}) {
  if ((value == null || value === '') && optional) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} inválido.`);
  return date.toISOString();
}

export function validateAnnouncementInput(input = {}) {
  const audienceType = allowedValue(input.audience_type || 'all', ANNOUNCEMENT_AUDIENCES, 'Público');
  const ctaType = allowedValue(input.cta_type || 'none', ANNOUNCEMENT_CTA_TYPES, 'Tipo de botão');
  const contestId = optionalText(input.contest_id, 'Concurso');
  if (audienceType === 'contest' && !contestId) throw new Error('Aviso de concurso exige um concurso.');
  if (audienceType === 'all' && contestId) throw new Error('Aviso global não aceita concurso.');

  const startsAt = isoDate(input.starts_at || new Date(), 'Início');
  const endsAt = isoDate(input.ends_at, 'Encerramento', { optional: true });
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new Error('Encerramento deve ser posterior ao início.');
  }

  if (!Array.isArray(input.suggestions ?? [])) throw new Error('Sugestões devem ser uma lista.');
  if ((input.suggestions ?? []).length > 5) throw new Error('Informe no máximo cinco sugestões.');
  const suggestions = (input.suggestions ?? []).map((value) => requiredText(value, 'Sugestão', 300));

  let ctaLabel = optionalText(input.cta_label, 'Texto do botão');
  let ctaValue = optionalText(input.cta_value, 'Destino do botão');
  if (ctaType === 'none') {
    ctaLabel = null;
    ctaValue = null;
  } else {
    if (!ctaLabel || !ctaValue) throw new Error('Botão exige texto e destino.');
    if (ctaType === 'internal_route' && !ANNOUNCEMENT_ROUTES.includes(ctaValue)) {
      throw new Error('Rota interna não permitida.');
    }
    if (ctaType === 'external_url') {
      let url;
      try {
        url = new URL(ctaValue);
      } catch {
        throw new Error('URL externa inválida.');
      }
      if (url.protocol !== 'https:') throw new Error('URL externa deve começar com https://.');
    }
  }

  return {
    title: requiredText(input.title, 'Título', 80),
    summary: requiredText(input.summary, 'Resumo', 180),
    body: requiredText(input.body, 'Mensagem', 4000),
    category: allowedValue(input.category, ANNOUNCEMENT_CATEGORIES, 'Categoria'),
    priority: allowedValue(input.priority || 'normal', ANNOUNCEMENT_PRIORITIES, 'Prioridade'),
    audience_type: audienceType,
    contest_id: contestId,
    suggestions,
    cta_type: ctaType,
    cta_label: ctaLabel,
    cta_value: ctaValue,
    starts_at: startsAt,
    ends_at: endsAt,
    is_pinned: Boolean(input.is_pinned),
  };
}

function isActive(row, now) {
  return row?.is_published
    && !row.archived_at
    && new Date(row.starts_at) <= now
    && (!row.ends_at || new Date(row.ends_at) > now);
}

function compareAnnouncements(a, b) {
  if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) return a.is_pinned ? -1 : 1;
  const priority = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
  if (priority) return priority;
  return new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0);
}

function assertResult(result, fallback) {
  if (result?.error) throw new Error(result.error.message || fallback);
  return result?.data ?? null;
}

export class AnnouncementService {
  constructor({
    getClient = getSupabaseClient,
    now = () => new Date(),
    getUserId = async (client) => {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      return data?.user?.id || null;
    },
  } = {}) {
    this.getClient = getClient;
    this.now = now;
    this.getUserId = getUserId;
  }

  async #client() {
    const client = await this.getClient();
    if (!client) throw new Error('Supabase não está disponível neste ambiente.');
    return client;
  }

  async listActiveAnnouncements({ userId, contestId } = {}) {
    if (!userId) throw new Error('Usuário é obrigatório.');
    const client = await this.#client();
    const now = this.now();
    const announcementsResult = await client
      .from('announcements')
      .select('*')
      .eq('is_published', true)
      .is('archived_at', null)
      .lte('starts_at', now.toISOString())
      .or(`ends_at.is.null,ends_at.gt.${now.toISOString()}`);
    const announcements = assertResult(announcementsResult, 'Falha ao carregar avisos.') || [];

    const readsResult = await client
      .from('announcement_reads')
      .select('announcement_id,read_at,dismissed_at')
      .eq('user_id', userId);
    const reads = assertResult(readsResult, 'Falha ao carregar leituras.') || [];
    const readMap = new Map(reads.map((read) => [read.announcement_id, read]));

    return announcements
      .filter((row) => isActive(row, now))
      .filter((row) => row.audience_type === 'all' || row.contest_id === contestId)
      .map((row) => ({ ...row, read: readMap.get(row.id) || null }))
      .filter((row) => !row.read?.dismissed_at)
      .sort(compareAnnouncements);
  }

  async getCurrentHomeAnnouncement(params) {
    const rows = await this.listActiveAnnouncements(params);
    return rows.find((row) => row.priority === 'urgent' && row.is_pinned)
      || rows.find((row) => row.is_pinned)
      || rows.find((row) => row.priority === 'urgent' && !row.read?.read_at)
      || rows
        .filter((row) => !row.read?.read_at)
        .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))[0]
      || null;
  }

  async getAnnouncementById(id) {
    const client = await this.#client();
    const result = await client.from('announcements').select('*').eq('id', id).maybeSingle();
    return assertResult(result, 'Falha ao carregar aviso.');
  }

  async markAnnouncementRead(userId, announcementId) {
    if (!userId || !announcementId) throw new Error('Usuário e aviso são obrigatórios.');
    const client = await this.#client();
    const timestamp = this.now().toISOString();
    const result = await client.from('announcement_reads').upsert(
      { user_id: userId, announcement_id: announcementId, read_at: timestamp },
      { onConflict: 'user_id,announcement_id' },
    ).select().single();
    return assertResult(result, 'Falha ao registrar leitura.');
  }

  async dismissAnnouncement(userId, announcementId) {
    if (!userId || !announcementId) throw new Error('Usuário e aviso são obrigatórios.');
    const client = await this.#client();
    const timestamp = this.now().toISOString();
    const result = await client.from('announcement_reads').upsert(
      {
        user_id: userId,
        announcement_id: announcementId,
        read_at: timestamp,
        dismissed_at: timestamp,
      },
      { onConflict: 'user_id,announcement_id' },
    ).select().single();
    return assertResult(result, 'Falha ao dispensar aviso.');
  }

  async listAdminAnnouncements() {
    const client = await this.#client();
    const result = await client.from('announcements').select('*').order('created_at', { ascending: false });
    return assertResult(result, 'Falha ao listar avisos.') || [];
  }

  async createAnnouncement(input) {
    const client = await this.#client();
    const userId = await this.getUserId(client);
    if (!userId) throw new Error('Sessão administrativa inválida.');
    const payload = { ...validateAnnouncementInput(input), created_by: userId, is_published: false };
    const result = await client.from('announcements').insert(payload).select().single();
    return assertResult(result, 'Falha ao criar aviso.');
  }

  async updateAnnouncement(id, input) {
    const client = await this.#client();
    const payload = validateAnnouncementInput(input);
    const result = await client.from('announcements').update(payload).eq('id', id).select().single();
    return assertResult(result, 'Falha ao atualizar aviso.');
  }

  async publishAnnouncement(id) {
    const client = await this.#client();
    const timestamp = this.now().toISOString();
    const result = await client.from('announcements').update({
      is_published: true,
      published_at: timestamp,
      archived_at: null,
    }).eq('id', id).select().single();
    return assertResult(result, 'Falha ao publicar aviso.');
  }

  async archiveAnnouncement(id) {
    const client = await this.#client();
    const result = await client.from('announcements').update({
      is_published: false,
      archived_at: this.now().toISOString(),
    }).eq('id', id).select().single();
    return assertResult(result, 'Falha ao arquivar aviso.');
  }
}

export const announcementService = new AnnouncementService();
export const listActiveAnnouncements = (params) => announcementService.listActiveAnnouncements(params);
export const getCurrentHomeAnnouncement = (params) => announcementService.getCurrentHomeAnnouncement(params);
export const getAnnouncementById = (id) => announcementService.getAnnouncementById(id);
export const markAnnouncementRead = (userId, id) => announcementService.markAnnouncementRead(userId, id);
export const dismissAnnouncement = (userId, id) => announcementService.dismissAnnouncement(userId, id);
export const listAdminAnnouncements = () => announcementService.listAdminAnnouncements();
export const createAnnouncement = (input) => announcementService.createAnnouncement(input);
export const updateAnnouncement = (id, input) => announcementService.updateAnnouncement(id, input);
export const publishAnnouncement = (id) => announcementService.publishAnnouncement(id);
export const archiveAnnouncement = (id) => announcementService.archiveAnnouncement(id);
