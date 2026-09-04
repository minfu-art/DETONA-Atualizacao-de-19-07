const DATA_VERSION = '2026.08.17.1';
const PM_AL_DATA_VERSION = '2026.08.31.1';
const PC_PE_DATA_VERSION = '2026.09.03.2';

export const STATIC_PUBLISHED_PACKAGES = Object.freeze({
  pc_ba_2026: Object.freeze({
    baseUrl: `data/course-factory/pc-ba-2026-investigador-runtime.json?v=${DATA_VERSION}`,
    patchUrls: Object.freeze([
      `data/course-factory/published/pc-ba-2026-investigador-patch-001.json?v=${DATA_VERSION}`,
    ]),
    version: DATA_VERSION,
    contentHash: '9a9040bfb3db0a5552e8b3cf421a318cf972e56a463493a6e2c2fd16efdfd95a',
    expectedQuestionCount: 1267,
    expectedSubtopicCount: 296,
    metadataOverride: Object.freeze({
      code: 'PC BA',
      name: 'PC BA 2026 — Investigador de Polícia Civil',
      role: 'Investigador de Polícia Civil',
      content_status: 'ready',
      sales_status: 'available',
      price_cents: 6990,
      currency: 'BRL',
      status_label: 'PUBLICADO',
    }),
  }),
  pm_al_2026: Object.freeze({
    baseUrl: `data/course-factory/pm-al-2026-soldado-runtime.json?v=${PM_AL_DATA_VERSION}`,
    patchUrls: Object.freeze([
      `data/course-factory/published/pm-al-2026-soldado-patch-001.json?v=${PM_AL_DATA_VERSION}`,
    ]),
    version: PM_AL_DATA_VERSION,
    contentHash: '588a184b953401247c55f6b637274bd8e7bbae2c116c19b54a834fe2e924d182',
    expectedQuestionCount: 83,
    expectedSubtopicCount: 161,
    metadataOverride: Object.freeze({
      code: 'PM AL',
      name: 'PM AL — Jornada de Resgate para Soldado',
      role: 'Soldado do Quadro de Praças',
      content_status: 'ready',
      sales_status: 'available',
      price_cents: 1499,
      currency: 'BRL',
      status_label: 'PUBLICADO · BANCO EM EXPANSÃO',
    }),
  }),
  pc_pe_2026: Object.freeze({
    baseUrl: `data/course-factory/pc-pe-2026-agente-runtime.json?v=${PC_PE_DATA_VERSION}`,
    patchUrls: Object.freeze([
      `data/course-factory/published/pc-pe-2026-agente-patch-001.json?v=${PC_PE_DATA_VERSION}`,
      `data/course-factory/published/pc-pe-2026-agente-patch-002.json?v=${PC_PE_DATA_VERSION}`,
    ]),
    version: PC_PE_DATA_VERSION,
    contentHash: '1ffabec888e59f8293ed062af90b8978670d21f93cf86b0256b6061b05b989b7',
    expectedQuestionCount: 1318,
    expectedSubtopicCount: 188,
    salesBlocked: false,
    metadataOverride: Object.freeze({
      code: 'PC PE',
      name: 'PC PE 2027 — Agente de Polícia',
      role: 'Agente de Polícia',
      content_status: 'ready',
      sales_status: 'available',
      price_cents: 2490,
      currency: 'BRL',
      status_label: 'PUBLICADO · BANCO EM EXPANSÃO',
    }),
  }),
});

async function fetchJson(url, fetchImpl = globalThis.fetch?.bind(globalThis)) {
  if (!fetchImpl) throw new Error('Carregamento do curso indisponível.');
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Pacote publicado indisponível (HTTP ${response.status}).`);
  return response.json();
}

function composePublishedPackage(contestId, entry, basePackage, patches) {
  if (basePackage?.contestId !== contestId) throw new Error('Pacote-base publicado inválido.');
  const curriculum = structuredClone(basePackage.curriculum || []).map((node) => ({ ...node, status: 'active' }));
  const nodeById = new Map(curriculum.map((node) => [node.source_id || node.id, node]));
  const questionIds = new Set();
  const questions = structuredClone(basePackage.questions || []);
  for (const question of questions) {
    if (!question?.id || questionIds.has(question.id)) throw new Error('Questão-base publicada inválida.');
    questionIds.add(question.id);
  }

  function ancestors(subtopicId) {
    const result = { topicId: null, disciplineId: null };
    let node = nodeById.get(subtopicId);
    while (node?.parent_source_id || node?.parent_id) {
      node = nodeById.get(node.parent_source_id || node.parent_id);
      if (!node) break;
      if (node.type === 'topic') result.topicId = node.source_id || node.id;
      if (node.type === 'discipline') {
        result.disciplineId = node.source_id || node.id;
        break;
      }
    }
    return result;
  }

  for (const patch of patches) {
    for (const question of patch?.questions || []) {
      if (!question?.id || questionIds.has(question.id) || !nodeById.has(question.subtopic_id)) {
        throw new Error('Incremento de questões publicado inválido.');
      }
      const { topicId, disciplineId } = ancestors(question.subtopic_id);
      const [primaryMicroknowledgeId = null, ...secondaryMicroknowledgeIds] = question.microknowledge_ids || [];
      questions.push({
        ...question,
        contest_id: contestId,
        discipline_id: disciplineId,
        topic_id: topicId,
        primary_microknowledge_id: primaryMicroknowledgeId,
        secondary_microknowledge_ids: secondaryMicroknowledgeIds,
        source_batch: patch.name || 'course-factory',
        concursoId: contestId,
        enunciado: question.statement,
        alternativas: question.options,
        respostaCorreta: question.correct_answer,
        explicacao: question.explanation,
        tipo: question.format,
        situacao: 'publicada',
      });
      questionIds.add(question.id);
    }
  }

  const subtopicCount = curriculum.filter((node) => node.type === 'subtopic').length;
  if (questions.length !== entry.expectedQuestionCount || subtopicCount !== entry.expectedSubtopicCount) {
    throw new Error('Contagens do pacote publicado divergentes.');
  }
  return {
    ...structuredClone(basePackage),
    id: `${contestId}_${entry.version.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    version: entry.version,
    contentHash: entry.contentHash,
    metadata: {
      ...structuredClone(basePackage.metadata || {}),
      id: contestId,
      ...(entry.metadataOverride || {}),
      question_count: questions.length,
      subtopic_count: subtopicCount,
    },
    curriculum,
    questions,
    previewOnly: false,
    publicationBlocked: false,
    salesBlocked: entry.salesBlocked === true,
  };
}

export class PublishedCoursePackageService {
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), registry = STATIC_PUBLISHED_PACKAGES } = {}) {
    this.fetchImpl = fetchImpl;
    this.registry = registry;
    this.promises = new Map();
  }

  has(contestId) {
    return Boolean(this.registry[String(contestId || '')]);
  }

  async load(contestId) {
    const id = String(contestId || '');
    const entry = this.registry[id];
    if (!entry) throw new Error('Curso publicado desconhecido.');
    if (!this.promises.has(id)) {
      this.promises.set(id, Promise.all([
        fetchJson(entry.baseUrl, this.fetchImpl),
        ...entry.patchUrls.map((url) => fetchJson(url, this.fetchImpl)),
      ]).then(([basePackage, ...patches]) => composePublishedPackage(id, entry, basePackage, patches)));
    }
    const runtime = await this.promises.get(id);
    if (runtime?.contestId !== id || runtime.previewOnly === true || runtime.publicationBlocked === true
      || runtime.metadata?.content_status !== 'ready') {
      this.promises.delete(id);
      throw new Error('Pacote publicado inválido.');
    }
    return structuredClone(runtime);
  }
}

export const publishedCoursePackageService = new PublishedCoursePackageService();
