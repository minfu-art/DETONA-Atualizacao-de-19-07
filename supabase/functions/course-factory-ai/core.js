import {
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeText,
  safeUuid,
} from '../_shared/adminValidation.js';

export const COURSE_FACTORY_AI_PROVIDER = 'OpenAI';
export const DEFAULT_COURSE_FACTORY_MODEL = 'gpt-5.6-terra';
export const SOURCE_CATEGORIES = Object.freeze([
  'edital', 'apostila', 'legislacao', 'manual', 'material_curso', 'referencia', 'outro',
]);
export const COURSE_FACTORY_ACTIONS = Object.freeze([
  'capabilities', 'list_drafts', 'create_draft', 'get_draft', 'create_signed_upload',
  'complete_upload', 'remove_source', 'analyze_sources', 'save_proposal', 'approve_map',
]);

function integer(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label}_invalid`);
  return parsed;
}

function optionalText(value, label, max) {
  const clean = String(value ?? '').trim();
  return clean ? safeText(clean, label, max) : '';
}

function confidence(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`${label}_invalid`);
  return Math.round(parsed * 1000) / 1000;
}

function optionalTechnicalId(value, label, generated, { slug = false } = {}) {
  const clean = String(value ?? '').trim();
  if (!clean) return generated;
  const pattern = slug ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/ : /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
  if (clean.length > 80 || !pattern.test(clean)) throw new Error(`${label}_invalid`);
  return clean;
}

export function slugifyCourseIdentity(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
}

export function buildDeterministicCourseIds(identity = {}) {
  const year = String(identity.year || identity.exam_date || '').match(/\b(20\d{2})\b/)?.[1] || '';
  const contestBase = slugifyCourseIdentity(`${identity.organization || identity.contest_name || 'concurso'} ${year}`);
  const positionBase = slugifyCourseIdentity(identity.position || 'cargo');
  if (!contestBase || !positionBase) throw new Error('identity_insufficient_for_ids');
  const contestId = contestBase.replaceAll('-', '_');
  const positionId = `${contestId}_${positionBase.replaceAll('-', '_')}`.slice(0, 80);
  return {
    contest_id: contestId,
    position_id: positionId,
    offering_id: positionId,
    slug: `${contestBase}-${positionBase}`.slice(0, 80),
  };
}

export function validateCourseFactoryRequest(input) {
  const body = assertPlainObject(input);
  const action = safeEnum(body.action, COURSE_FACTORY_ACTIONS, 'action');
  if (action === 'capabilities' || action === 'list_drafts' || action === 'create_draft') {
    assertExactKeys(body, ['action']);
    return { action };
  }
  const draftId = safeUuid(body.draftId, 'course_draft_id');
  if (action === 'get_draft' || action === 'analyze_sources' || action === 'approve_map') {
    assertExactKeys(body, ['action', 'draftId'], ['draftId']);
    return { action, draftId };
  }
  if (action === 'create_signed_upload') {
    assertExactKeys(body, ['action', 'draftId', 'source'], ['draftId', 'source']);
    const source = assertExactKeys(body.source, ['sourceType', 'category', 'name', 'mimeType', 'size'], ['sourceType', 'category', 'name', 'mimeType', 'size']);
    const sourceType = safeEnum(source.sourceType, ['official_edital', 'complementary'], 'source_type');
    const category = safeEnum(source.category, SOURCE_CATEGORIES, 'category');
    if (sourceType === 'official_edital' && category !== 'edital') throw new Error('official_category_invalid');
    const name = safeText(source.name, 'file_name', 180);
    if (!/\.pdf$/i.test(name)) throw new Error('file_extension_invalid');
    if (source.mimeType !== 'application/pdf') throw new Error('mime_type_invalid');
    return {
      action,
      draftId,
      source: {
        sourceType,
        category,
        name,
        mimeType: 'application/pdf',
        size: integer(source.size, 'file_size', 1, 20_971_520),
      },
    };
  }
  if (action === 'complete_upload' || action === 'remove_source') {
    assertExactKeys(body, ['action', 'draftId', 'sourceId'], ['draftId', 'sourceId']);
    return { action, draftId, sourceId: safeUuid(body.sourceId, 'source_id') };
  }
  if (action === 'save_proposal') {
    assertExactKeys(body, ['action', 'draftId', 'proposal'], ['draftId', 'proposal']);
    return { action, draftId, proposal: assertPlainObject(body.proposal, 'proposal') };
  }
  throw new Error('action_not_allowed');
}

function traceSchema() {
  return {
    type: 'object', additionalProperties: false,
    properties: {
      source_name: { type: 'string' }, page_number: { type: 'integer', minimum: 1 }, excerpt: { type: 'string' },
    },
    required: ['source_name', 'page_number', 'excerpt'],
  };
}

function stringArray() {
  return { type: 'array', items: { type: 'string' } };
}

export function courseFactoryAnalysisSchema() {
  const trace = traceSchema();
  const tracedNode = (childrenName = null, children = null) => ({
    type: 'object', additionalProperties: false,
    properties: {
      title: { type: 'string' }, order: { type: 'integer', minimum: 1 }, confidence: { type: 'number', minimum: 0, maximum: 1 }, traces: { type: 'array', items: trace },
      ...(childrenName ? { [childrenName]: { type: 'array', items: children } } : {}),
    },
    required: ['title', 'order', 'confidence', 'traces', ...(childrenName ? [childrenName] : [])],
  });
  const subtopic = tracedNode();
  const topic = tracedNode('subtopics', subtopic);
  const discipline = tracedNode('topics', topic);
  const microknowledge = {
    type: 'object', additionalProperties: false,
    properties: {
      title: { type: 'string' }, scope_origin: { type: 'string', enum: ['official', 'complementary'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, traces: { type: 'array', items: trace },
    }, required: ['title', 'scope_origin', 'confidence', 'traces'],
  };
  const mapItem = {
    type: 'object', additionalProperties: false,
    properties: {
      discipline_title: { type: 'string' }, topic_title: { type: 'string' }, subtopic_title: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      scope: { type: 'string' }, essential_concepts: stringArray(), rules: stringArray(), exceptions: stringArray(),
      applications: stringArray(), competencies: stringArray(), required_knowledge: stringArray(),
      microknowledges: { type: 'array', items: microknowledge }, traces: { type: 'array', items: trace },
    },
    required: ['discipline_title', 'topic_title', 'subtopic_title', 'confidence', 'scope', 'essential_concepts', 'rules', 'exceptions', 'applications', 'competencies', 'required_knowledge', 'microknowledges', 'traces'],
  };
  return {
    type: 'object', additionalProperties: false,
    properties: {
      identity: {
        type: 'object', additionalProperties: false,
        properties: {
          contest_name: { type: 'string' }, organization: { type: 'string' }, position: { type: 'string' }, board: { type: 'string' },
          year: { type: 'string' }, exam_date: { type: 'string' }, exam_format: { type: 'string' }, observations: stringArray(),
          confidence: { type: 'number', minimum: 0, maximum: 1 }, traces: { type: 'array', items: trace },
        },
        required: ['contest_name', 'organization', 'position', 'board', 'year', 'exam_date', 'exam_format', 'observations', 'confidence', 'traces'],
      },
      curriculum: { type: 'array', items: discipline },
      edital_map: { type: 'array', items: mapItem },
      relevant_observations: stringArray(),
    },
    required: ['identity', 'curriculum', 'edital_map', 'relevant_observations'],
  };
}

function normalizeTrace(trace, sourceLookup) {
  const sourceName = safeText(trace?.source_name, 'trace_source_name', 180);
  const source = sourceLookup.get(sourceName.toLocaleLowerCase('pt-BR'));
  if (!source) throw new Error('trace_source_unknown');
  const pageNumber = integer(trace?.page_number, 'trace_page_number', 1, Number(source.page_count || 5000));
  return {
    source_id: source.id,
    source_name: source.file_name,
    source_type: source.source_type,
    page_number: pageNumber,
    excerpt: safeText(trace?.excerpt, 'trace_excerpt', 500),
  };
}

function normalizeTraces(value, lookup, { required = true } = {}) {
  const traces = Array.isArray(value) ? value.map((trace) => normalizeTrace(trace, lookup)) : [];
  if (required && !traces.length) throw new Error('trace_required');
  return traces;
}

function requireOfficialTrace(traces, label) {
  if (!traces.some(({ source_type: type }) => type === 'official_edital')) throw new Error(`${label}_without_edital`);
  return traces;
}

function normalizeTitles(values, label, maxItems = 100) {
  if (!Array.isArray(values) || values.length > maxItems) throw new Error(`${label}_invalid`);
  return values.map((value) => safeText(value, label, 300));
}

export function normalizeCourseFactoryProposal(raw, sources) {
  const sourceLookup = new Map((sources || []).map((source) => [String(source.file_name).toLocaleLowerCase('pt-BR'), source]));
  if (!sourceLookup.size) throw new Error('sources_required');
  const value = assertPlainObject(raw, 'analysis');
  const identityRaw = assertPlainObject(value.identity, 'identity');
  const identity = {
    contest_name: safeText(identityRaw.contest_name, 'contest_name', 180),
    organization: safeText(identityRaw.organization, 'organization', 180),
    position: safeText(identityRaw.position, 'position', 180),
    board: optionalText(identityRaw.board, 'board', 100),
    year: optionalText(identityRaw.year, 'year', 4),
    exam_date: optionalText(identityRaw.exam_date, 'exam_date', 10),
    exam_format: optionalText(identityRaw.exam_format, 'exam_format', 500),
    observations: normalizeTitles(identityRaw.observations || [], 'identity_observation', 50),
    confidence: confidence(identityRaw.confidence, 'identity_confidence'),
    traces: requireOfficialTrace(normalizeTraces(identityRaw.traces, sourceLookup), 'identity'),
  };
  if (identity.exam_date && !/^\d{4}-\d{2}-\d{2}$/.test(identity.exam_date)) throw new Error('exam_date_invalid');
  const generatedIds = buildDeterministicCourseIds(identity);
  Object.assign(identity, {
    contest_id: optionalTechnicalId(identityRaw.contest_id, 'contest_id', generatedIds.contest_id),
    position_id: optionalTechnicalId(identityRaw.position_id, 'position_id', generatedIds.position_id),
    offering_id: optionalTechnicalId(identityRaw.offering_id, 'offering_id', generatedIds.offering_id),
    slug: optionalTechnicalId(identityRaw.slug, 'slug', generatedIds.slug, { slug: true }),
  });

  if (!Array.isArray(value.curriculum) || !value.curriculum.length || value.curriculum.length > 100) throw new Error('curriculum_invalid');
  const curriculum = value.curriculum.map((disciplineRaw, disciplineIndex) => {
    const discipline = assertPlainObject(disciplineRaw, 'discipline');
    const topics = Array.isArray(discipline.topics) ? discipline.topics : [];
    if (!topics.length || topics.length > 300) throw new Error('topics_invalid');
    return {
      title: safeText(discipline.title, 'discipline_title', 200), order: disciplineIndex + 1,
      confidence: confidence(discipline.confidence, 'discipline_confidence'),
      traces: requireOfficialTrace(normalizeTraces(discipline.traces, sourceLookup), 'discipline'),
      topics: topics.map((topicRaw, topicIndex) => {
        const topic = assertPlainObject(topicRaw, 'topic');
        const subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : [];
        if (!subtopics.length || subtopics.length > 500) throw new Error('subtopics_invalid');
        return {
          title: safeText(topic.title, 'topic_title', 250), order: topicIndex + 1,
          confidence: confidence(topic.confidence, 'topic_confidence'),
          traces: requireOfficialTrace(normalizeTraces(topic.traces, sourceLookup), 'topic'),
          subtopics: subtopics.map((subtopicRaw, subtopicIndex) => ({
            title: safeText(subtopicRaw.title, 'subtopic_title', 300), order: subtopicIndex + 1,
            confidence: confidence(subtopicRaw.confidence, 'subtopic_confidence'),
            traces: requireOfficialTrace(normalizeTraces(subtopicRaw.traces, sourceLookup), 'subtopic'),
          })),
        };
      }),
    };
  });

  const subtopicKeys = new Set(curriculum.flatMap((discipline) => discipline.topics.flatMap((topic) => (
    topic.subtopics.map((subtopic) => `${discipline.title}\u0000${topic.title}\u0000${subtopic.title}`.toLocaleLowerCase('pt-BR'))
  ))));
  if (!Array.isArray(value.edital_map) || !value.edital_map.length || value.edital_map.length > 5000) throw new Error('edital_map_invalid');
  const mappedKeys = new Set();
  const editalMap = value.edital_map.map((itemRaw) => {
    const item = assertPlainObject(itemRaw, 'edital_map_item');
    const disciplineTitle = safeText(item.discipline_title, 'map_discipline', 200);
    const topicTitle = safeText(item.topic_title, 'map_topic', 250);
    const subtopicTitle = safeText(item.subtopic_title, 'map_subtopic', 300);
    const key = `${disciplineTitle}\u0000${topicTitle}\u0000${subtopicTitle}`.toLocaleLowerCase('pt-BR');
    if (!subtopicKeys.has(key)) throw new Error('map_subtopic_unlinked');
    if (mappedKeys.has(key)) throw new Error('map_subtopic_duplicated');
    mappedKeys.add(key);
    const traces = requireOfficialTrace(normalizeTraces(item.traces, sourceLookup), 'map_scope');
    const microknowledges = Array.isArray(item.microknowledges) ? item.microknowledges.map((knowledge) => {
      const scopeOrigin = safeEnum(knowledge.scope_origin, ['official', 'complementary'], 'scope_origin');
      const knowledgeTraces = normalizeTraces(knowledge.traces, sourceLookup);
      if (scopeOrigin === 'official' && !knowledgeTraces.some(({ source_type: type }) => type === 'official_edital')) throw new Error('official_scope_without_edital');
      if (scopeOrigin === 'complementary' && !knowledgeTraces.some(({ source_type: type }) => type === 'complementary')) throw new Error('complementary_scope_without_material');
      return { title: safeText(knowledge.title, 'microknowledge', 300), scope_origin: scopeOrigin, confidence: confidence(knowledge.confidence, 'microknowledge_confidence'), traces: knowledgeTraces };
    }) : [];
    return {
      discipline_title: disciplineTitle, topic_title: topicTitle, subtopic_title: subtopicTitle,
      confidence: confidence(item.confidence, 'map_confidence'),
      scope: safeText(item.scope, 'scope', 1200),
      essential_concepts: normalizeTitles(item.essential_concepts || [], 'essential_concept'),
      rules: normalizeTitles(item.rules || [], 'rule'),
      exceptions: normalizeTitles(item.exceptions || [], 'exception'),
      applications: normalizeTitles(item.applications || [], 'application'),
      competencies: normalizeTitles(item.competencies || [], 'competency'),
      required_knowledge: normalizeTitles(item.required_knowledge || [], 'required_knowledge'),
      microknowledges,
      traces,
    };
  });
  if (mappedKeys.size !== subtopicKeys.size || [...subtopicKeys].some((key) => !mappedKeys.has(key))) {
    throw new Error('map_subtopic_missing');
  }
  const counts = {
    disciplines: curriculum.length,
    topics: curriculum.reduce((sum, discipline) => sum + discipline.topics.length, 0),
    subtopics: curriculum.reduce((sum, discipline) => sum + discipline.topics.reduce((total, topic) => total + topic.subtopics.length, 0), 0),
    knowledges: editalMap.reduce((sum, item) => sum + item.microknowledges.length, 0),
  };
  return {
    identity, curriculum, edital_map: editalMap,
    analysis_summary: { counts, relevant_observations: normalizeTitles(value.relevant_observations || [], 'relevant_observation', 100) },
  };
}

export function extractResponseJson(response) {
  const outputs = Array.isArray(response?.output) ? response.output : [];
  for (const output of outputs) {
    for (const content of output?.content || []) {
      if (content.type === 'refusal') throw new Error('ai_refused');
      if (content.type === 'output_text' && content.text) return JSON.parse(content.text);
    }
  }
  if (typeof response?.output_text === 'string' && response.output_text) return JSON.parse(response.output_text);
  throw new Error('ai_output_missing');
}
