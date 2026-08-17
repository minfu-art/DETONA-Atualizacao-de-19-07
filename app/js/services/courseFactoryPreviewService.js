export const PC_BA_CONTEST_ID = 'pc_ba_2026';
export const PC_BA_POSITION_ID = 'pc_ba_2026_investigador_policia_civil';
export const PC_BA_OFFERING_ID = 'pc_ba_2026_investigador';
export const COURSE_FACTORY_PREVIEW_PARAM = 'coursePreview';

const DATA_VERSION = '758aa86295c6';
const MANIFEST_URL = `data/course-factory/pc-ba-2026-investigador-manifest.json?v=${DATA_VERSION}`;
const RUNTIME_URL = `data/course-factory/pc-ba-2026-investigador-runtime.json?v=${DATA_VERSION}`;

export const PC_BA_ADMIN_CONTEST = Object.freeze({
  id: PC_BA_CONTEST_ID,
  code: 'PC BA',
  slug: 'pc-ba-2026-investigador',
  name: 'PC BA 2026 — Investigador de Polícia Civil',
  role: 'Investigador de Polícia Civil',
  description: 'Curso em homologação na Fábrica de Cursos do DETONA.',
  price_cents: 0,
  currency: 'BRL',
  color: '#24104f',
  accent: '#37d6ff',
  icon: 'PCBA',
  cover_asset: null,
  content_status: 'preparing',
  sales_status: 'unavailable',
  exam_date: '2026-12-06',
  career_area: 'police_security',
  career_subarea: 'civil_police',
  position_id: PC_BA_POSITION_ID,
  offering_id: PC_BA_OFFERING_ID,
  source: 'course_factory_preview',
  status_label: 'EM TESTE',
  publication_blocked: true,
  interest_goal: null,
  interest_count: 0,
});

export function requestedCoursePreview(search = globalThis.location?.search || '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''));
  const contestId = String(params.get(COURSE_FACTORY_PREVIEW_PARAM) || '').trim();
  return contestId === PC_BA_CONTEST_ID ? contestId : null;
}

export function isCourseFactoryStudentPreview(search) {
  return requestedCoursePreview(search) === PC_BA_CONTEST_ID;
}

export function courseFactoryStudentPreviewUrl({ screen = 'home' } = {}) {
  const params = new URLSearchParams({ [COURSE_FACTORY_PREVIEW_PARAM]: PC_BA_CONTEST_ID });
  if (screen && screen !== 'home') params.set('screen', screen);
  return `index.html?${params}`;
}

async function fetchJson(url, fetchImpl = globalThis.fetch?.bind(globalThis)) {
  if (!fetchImpl) throw new Error('Carregamento local indisponível.');
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Dados da PC BA indisponíveis (HTTP ${response.status}).`);
  return response.json();
}

export class CourseFactoryPreviewService {
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
    this.fetchImpl = fetchImpl;
    this.manifestPromise = null;
    this.runtimePromise = null;
  }

  async loadManifest() {
    this.manifestPromise ||= fetchJson(MANIFEST_URL, this.fetchImpl);
    return structuredClone(await this.manifestPromise);
  }

  async loadRuntimePackage(contestId) {
    if (contestId !== PC_BA_CONTEST_ID) throw new Error('Curso de homologação desconhecido.');
    this.runtimePromise ||= fetchJson(RUNTIME_URL, this.fetchImpl);
    const runtime = await this.runtimePromise;
    if (runtime.contestId !== contestId || runtime.previewOnly !== true || runtime.publicationBlocked !== true) {
      throw new Error('Pacote de homologação inválido.');
    }
    return structuredClone(runtime);
  }

  studentContest() {
    return {
      id: PC_BA_ADMIN_CONTEST.id,
      code: PC_BA_ADMIN_CONTEST.code,
      name: PC_BA_ADMIN_CONTEST.name,
      role: PC_BA_ADMIN_CONTEST.role,
      description: PC_BA_ADMIN_CONTEST.description,
      color: PC_BA_ADMIN_CONTEST.color,
      accent: PC_BA_ADMIN_CONTEST.accent,
      icon: PC_BA_ADMIN_CONTEST.icon,
      priceCents: 0,
      currency: 'BRL',
      contentStatus: 'ready',
      salesStatus: 'unavailable',
      examDate: PC_BA_ADMIN_CONTEST.exam_date,
      careerArea: PC_BA_ADMIN_CONTEST.career_area,
      careerSubarea: PC_BA_ADMIN_CONTEST.career_subarea,
      subtopicCount: 296,
      questionCount: 1247,
      previewOnly: true,
    };
  }
}

export const courseFactoryPreviewService = new CourseFactoryPreviewService();
