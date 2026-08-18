import { isDeveloperUser } from '../auth/authService.js';
import { APP_ENVIRONMENTS, getAppEnvironment } from '../config/appEnvironment.js';
import { getSupabaseClient } from '../supabase/client.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function deterministicTheme(contestId) {
  let hash = 0;
  for (const character of String(contestId)) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return {
    color: `hsl(${hue} 58% 28%)`,
    accent: `hsl(${(hue + 62) % 360} 86% 62%)`,
  };
}

export function canListHomologationCourses(user, environment = getAppEnvironment()) {
  return environment === APP_ENVIRONMENTS.STAGING && isDeveloperUser(user);
}

export function normalizeHomologationCourse(row = {}) {
  const contestId = text(row.contestId || row.contest_id);
  const draftId = text(row.draftId || row.draft_id);
  if (!SAFE_ID.test(contestId) || !/^[0-9a-f-]{36}$/i.test(draftId)) return null;
  const theme = deterministicTheme(contestId);
  return {
    id: contestId,
    code: text(row.code, contestId.toUpperCase()),
    name: text(row.name, contestId),
    role: text(row.role),
    description: text(row.description, 'Curso em homologação na Course Factory.'),
    organization: text(row.organization),
    examBoard: text(row.examBoard || row.exam_board),
    examDate: text(row.examDate || row.exam_date) || null,
    color: text(row.color, theme.color),
    accent: text(row.accent, theme.accent),
    icon: text(row.icon, text(row.code, 'DT').replace(/\s+/g, '').slice(0, 5)),
    coverAsset: null,
    priceCents: 0,
    currency: 'BRL',
    contentStatus: 'ready',
    salesStatus: 'unavailable',
    publicationStatus: 'testing',
    subtopicCount: Math.max(0, Number(row.subtopicCount || row.subtopic_count) || 0),
    questionCount: Math.max(0, Number(row.questionCount || row.question_count) || 0),
    disciplineCount: Math.max(0, Number(row.disciplineCount || row.discipline_count) || 0),
    topicCount: Math.max(0, Number(row.topicCount || row.topic_count) || 0),
    courseDraftId: draftId,
    previewOnly: true,
    publicationBlocked: true,
    source: 'course_factory_homologation',
  };
}

export class HomologationCourseService {
  constructor({ getClient = getSupabaseClient, environment = getAppEnvironment } = {}) {
    this.getClient = getClient;
    this.environment = environment;
  }

  canList(user) {
    return canListHomologationCourses(user, this.environment());
  }

  async listForAdmin(user) {
    if (!this.canList(user)) return [];
    const client = await this.getClient();
    if (!client) return [];
    const { data, error } = await client.functions.invoke('course-factory-assisted', {
      body: { action: 'list_homologation_courses' },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Cursos de homologação indisponíveis.');
    return (Array.isArray(data?.courses) ? data.courses : [])
      .map(normalizeHomologationCourse)
      .filter(Boolean);
  }
}

export const homologationCourseService = new HomologationCourseService();
