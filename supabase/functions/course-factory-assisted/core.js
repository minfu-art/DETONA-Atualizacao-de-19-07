import {
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeText,
  safeUuid,
} from '../_shared/adminValidation.js';

export const ASSISTED_FACTORY_ACTIONS = Object.freeze([
  'capabilities', 'list_drafts', 'create_draft', 'get_draft',
  'get_preview_package',
  'create_signed_upload', 'complete_upload', 'remove_source',
  'validate_package', 'import_package', 'approve_map',
]);

export const ASSISTED_PACKAGE_SCHEMA_VERSION = 1;
export const ASSISTED_SOURCE_CATEGORIES = Object.freeze([
  'edital', 'apostila', 'legislacao', 'manual', 'material_curso', 'referencia', 'outro',
]);

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const HTML = /<\/?[a-z][^>]*>/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonical(value));
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function integer(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label}_invalid`);
  return parsed;
}

export function validateAssistedFactoryRequest(input) {
  const body = assertPlainObject(input);
  const action = safeEnum(body.action, ASSISTED_FACTORY_ACTIONS, 'action');
  if (['capabilities', 'list_drafts', 'create_draft'].includes(action)) {
    assertExactKeys(body, ['action']);
    return { action };
  }
  const draftId = safeUuid(body.draftId, 'course_draft_id');
  if (['get_draft', 'get_preview_package', 'approve_map'].includes(action)) {
    assertExactKeys(body, ['action', 'draftId'], ['draftId']);
    return { action, draftId };
  }
  if (['validate_package', 'import_package'].includes(action)) {
    assertExactKeys(body, ['action', 'draftId', 'package'], ['draftId', 'package']);
    return { action, draftId, package: assertPlainObject(body.package, 'course_package') };
  }
  if (action === 'create_signed_upload') {
    assertExactKeys(body, ['action', 'draftId', 'source'], ['draftId', 'source']);
    const source = assertExactKeys(body.source, ['sourceType', 'category', 'name', 'mimeType', 'size'], ['sourceType', 'category', 'name', 'mimeType', 'size']);
    const sourceType = safeEnum(source.sourceType, ['official_edital', 'complementary'], 'source_type');
    const category = safeEnum(source.category, ASSISTED_SOURCE_CATEGORIES, 'category');
    if (sourceType === 'official_edital' && category !== 'edital') throw new Error('official_category_invalid');
    const name = safeText(source.name, 'file_name', 180);
    if (!/\.pdf$/i.test(name) || source.mimeType !== 'application/pdf') throw new Error('pdf_required');
    return {
      action, draftId,
      source: { sourceType, category, name, mimeType: 'application/pdf', size: integer(source.size, 'file_size', 1, 20_971_520) },
    };
  }
  assertExactKeys(body, ['action', 'draftId', 'sourceId'], ['draftId', 'sourceId']);
  return { action, draftId, sourceId: safeUuid(body.sourceId, 'source_id') };
}

function collector() {
  const errors = [];
  const warnings = [];
  const issue = (target, code, path, message) => target.push({ code, path, message });
  return {
    errors, warnings,
    error: (code, path, message) => issue(errors, code, path, message),
    warn: (code, path, message) => issue(warnings, code, path, message),
  };
}

function object(value, path, audit) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    audit.error('OBJECT_REQUIRED', path, 'O campo deve ser um objeto.');
    return {};
  }
  return value;
}

function exact(value, allowed, path, audit) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) audit.error('UNEXPECTED_FIELD', `${path}.${key}`, 'Campo não previsto no contrato canônico.');
  }
}

function text(value, path, audit, max = 500, { optional = false } = {}) {
  const clean = String(value ?? '').trim();
  if (!clean && optional) return '';
  if (!clean || clean.length > max || HTML.test(clean) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)) {
    audit.error('TEXT_INVALID', path, `Texto obrigatório inválido ou acima de ${max} caracteres.`);
    return clean.slice(0, max);
  }
  return clean;
}

function id(value, path, audit) {
  const clean = text(value, path, audit, 160);
  if (clean && !ID.test(clean)) audit.error('ID_INVALID', path, 'Use letras, números, hífen ou sublinhado.');
  return clean;
}

function confidence(value, path, audit) {
  if (value == null || value === '') return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    audit.error('CONFIDENCE_INVALID', path, 'A confiança deve estar entre 0 e 1.');
    return 0;
  }
  return Math.round(parsed * 1000) / 1000;
}

function sourceTraces(raw, path, audit, sourceIndex, { required = true } = {}) {
  if (!Array.isArray(raw)) {
    if (required) audit.error('TRACE_REQUIRED', path, 'Informe ao menos uma rastreabilidade de fonte.');
    return [];
  }
  if (required && !raw.length) audit.error('TRACE_REQUIRED', path, 'Informe ao menos uma rastreabilidade de fonte.');
  return raw.slice(0, 50).map((entry, index) => {
    const tracePath = `${path}[${index}]`;
    const value = object(entry, tracePath, audit);
    exact(value, ['source_id', 'trace_status', 'page_number', 'excerpt', 'location', 'note'], tracePath, audit);
    const sourceId = id(value.source_id, `${tracePath}.source_id`, audit);
    const source = sourceIndex.get(sourceId);
    if (!source) audit.error('TRACE_SOURCE_UNKNOWN', `${tracePath}.source_id`, 'A fonte não existe em sources.json.');
    const traceStatus = ['available', 'missing'].includes(value.trace_status) ? value.trace_status : 'invalid';
    if (traceStatus === 'invalid') audit.error('TRACE_STATUS_INVALID', `${tracePath}.trace_status`, 'Use available ou missing.');
    const page = Number(value.page_number);
    if (traceStatus === 'available' && (!Number.isInteger(page) || page < 1 || page > 5000)) {
      audit.error('TRACE_PAGE_INVALID', `${tracePath}.page_number`, 'Rastreabilidade disponível exige uma página válida.');
    }
    if (Number.isInteger(page) && source?.page_count && page > source.page_count) audit.error('TRACE_PAGE_OUT_OF_RANGE', `${tracePath}.page_number`, 'Página acima do total declarado.');
    const excerpt = text(value.excerpt, `${tracePath}.excerpt`, audit, 600, { optional: traceStatus === 'missing' });
    const location = text(value.location, `${tracePath}.location`, audit, 300, { optional: true });
    const note = text(value.note, `${tracePath}.note`, audit, 600, { optional: traceStatus !== 'missing' });
    if (traceStatus === 'missing' && !note) audit.error('TRACE_MISSING_NOTE_REQUIRED', `${tracePath}.note`, 'Explique por que a rastreabilidade está ausente.');
    return {
      source_id: sourceId,
      source_name: source?.file_name || sourceId,
      source_type: source?.source_type || 'unknown',
      trace_status: traceStatus,
      page_number: Number.isInteger(page) ? page : null,
      excerpt,
      location,
      note,
    };
  });
}

function normalizeAnswer(value, options, path, audit) {
  if (typeof value === 'boolean') return value;
  const clean = String(value ?? '').trim();
  if (!clean) {
    audit.error('QUESTION_ANSWER_REQUIRED', path, 'Gabarito obrigatório.');
    return '';
  }
  const labels = new Set(options.map((option, index) => String(option?.label ?? option?.id ?? String.fromCharCode(65 + index)).toUpperCase()));
  const binaryAnswers = ['C', 'E', 'CERTO', 'ERRADO', 'TRUE', 'FALSE'];
  if ((labels.size && !labels.has(clean.toUpperCase())) || (!labels.size && !binaryAnswers.includes(clean.toUpperCase()))) {
    audit.error('QUESTION_ANSWER_INVALID', path, 'O gabarito não corresponde às alternativas.');
  }
  return clean;
}

function pct(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function buildCurriculumTree(nodes) {
  const children = new Map();
  for (const node of nodes) {
    const key = node.parent_id || '__root__';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  for (const rows of children.values()) rows.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pt-BR'));
  const roles = (children.get('__root__') || []).filter(({ type }) => type === 'role');
  return roles.flatMap((role) => (children.get(role.id) || []).filter(({ type }) => type === 'discipline').map((discipline) => ({
    ...discipline,
    topics: (children.get(discipline.id) || []).filter(({ type }) => type === 'topic').map((topic) => ({
      ...topic,
      subtopics: (children.get(topic.id) || []).filter(({ type }) => type === 'subtopic'),
    })),
  })));
}

export async function validateAssistedCoursePackage(rawPackage, { uploadedSources = [] } = {}) {
  const audit = collector();
  const root = object(structuredClone(rawPackage), 'package', audit);
  exact(root, [
    'schema_version', 'operation_id', 'course', 'sources', 'curriculum',
    'edital_map', 'microknowledges', 'question_batches', 'metadata',
  ], 'package', audit);
  if (root.schema_version !== ASSISTED_PACKAGE_SCHEMA_VERSION) {
    audit.error('SCHEMA_VERSION_INVALID', 'package.schema_version', 'Use schema_version 1.');
  }
  const operationId = String(root.operation_id || '').trim();
  if (!OPERATION_ID.test(operationId)) audit.error('OPERATION_ID_INVALID', 'package.operation_id', 'operation_id inválido.');

  const courseRaw = object(root.course, 'package.course', audit);
  exact(courseRaw, [
    'contest_id', 'position_id', 'offering_id', 'code', 'slug', 'name', 'organization',
    'position', 'board', 'year', 'exam_date', 'exam_format', 'description',
  ], 'package.course', audit);
  const course = {
    contest_id: id(courseRaw.contest_id, 'package.course.contest_id', audit),
    position_id: id(courseRaw.position_id, 'package.course.position_id', audit),
    offering_id: id(courseRaw.offering_id, 'package.course.offering_id', audit),
    code: text(courseRaw.code, 'package.course.code', audit, 30),
    slug: id(courseRaw.slug, 'package.course.slug', audit),
    name: text(courseRaw.name, 'package.course.name', audit, 180),
    organization: text(courseRaw.organization, 'package.course.organization', audit, 180),
    position: text(courseRaw.position, 'package.course.position', audit, 180),
    board: text(courseRaw.board, 'package.course.board', audit, 120, { optional: true }),
    year: text(courseRaw.year, 'package.course.year', audit, 4, { optional: true }),
    exam_date: text(courseRaw.exam_date, 'package.course.exam_date', audit, 10, { optional: true }),
    exam_format: text(courseRaw.exam_format, 'package.course.exam_format', audit, 600, { optional: true }),
    description: text(courseRaw.description, 'package.course.description', audit, 800),
  };
  if (course.year && !/^20\d{2}$/.test(course.year)) audit.error('YEAR_INVALID', 'package.course.year', 'Ano deve possuir quatro dígitos.');
  if (course.exam_date && (!/^\d{4}-\d{2}-\d{2}$/.test(course.exam_date) || Number.isNaN(Date.parse(`${course.exam_date}T00:00:00Z`)))) {
    audit.error('EXAM_DATE_INVALID', 'package.course.exam_date', 'Use YYYY-MM-DD.');
  }

  const sourcesRaw = Array.isArray(root.sources) ? root.sources : [];
  if (!sourcesRaw.length || sourcesRaw.length > 100) audit.error('SOURCES_INVALID', 'package.sources', 'Informe de 1 a 100 fontes.');
  const sourceIds = new Set();
  const sourceNames = new Set();
  const sources = sourcesRaw.slice(0, 100).map((entry, index) => {
    const path = `package.sources[${index}]`;
    const value = object(entry, path, audit);
    exact(value, ['id', 'source_type', 'category', 'title', 'file_name', 'page_count', 'availability', 'url', 'sha256'], path, audit);
    const sourceId = id(value.id, `${path}.id`, audit);
    if (sourceIds.has(sourceId)) audit.error('SOURCE_ID_DUPLICATE', `${path}.id`, 'ID de fonte duplicado.');
    sourceIds.add(sourceId);
    const availability = ['uploaded_pdf', 'external_reference', 'reference_only'].includes(value.availability) ? value.availability : 'invalid';
    if (availability === 'invalid') audit.error('SOURCE_AVAILABILITY_INVALID', `${path}.availability`, 'Disponibilidade da fonte inválida.');
    const fileName = text(value.file_name, `${path}.file_name`, audit, 180, { optional: availability !== 'uploaded_pdf' });
    if (fileName && !/\.pdf$/i.test(fileName)) audit.error('SOURCE_FILE_TYPE_INVALID', `${path}.file_name`, 'Arquivos de fonte devem ser PDFs.');
    if (availability === 'uploaded_pdf' && !fileName) audit.error('SOURCE_FILE_REQUIRED', `${path}.file_name`, 'Fonte enviada exige o nome do PDF.');
    const lowered = fileName.toLocaleLowerCase('pt-BR');
    if (lowered && sourceNames.has(lowered)) audit.error('SOURCE_NAME_DUPLICATE', `${path}.file_name`, 'Nome de fonte duplicado.');
    if (lowered) sourceNames.add(lowered);
    const sourceType = ['official_edital', 'complementary'].includes(value.source_type) ? value.source_type : 'invalid';
    if (sourceType === 'invalid') audit.error('SOURCE_TYPE_INVALID', `${path}.source_type`, 'Tipo de fonte inválido.');
    const category = ASSISTED_SOURCE_CATEGORIES.includes(value.category) ? value.category : 'outro';
    if (!ASSISTED_SOURCE_CATEGORIES.includes(value.category)) audit.error('SOURCE_CATEGORY_INVALID', `${path}.category`, 'Categoria inválida.');
    const pageCount = value.page_count == null ? null : Number(value.page_count);
    if (pageCount != null && (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 5000)) audit.error('SOURCE_PAGE_COUNT_INVALID', `${path}.page_count`, 'Total de páginas inválido.');
    const url = text(value.url, `${path}.url`, audit, 1000, { optional: true });
    if (url && !/^https:\/\//i.test(url)) audit.error('SOURCE_URL_INVALID', `${path}.url`, 'Use uma URL HTTPS.');
    const sourceHash = text(value.sha256, `${path}.sha256`, audit, 64, { optional: true }).toLowerCase();
    if (sourceHash && !/^[a-f0-9]{64}$/.test(sourceHash)) audit.error('SOURCE_HASH_INVALID', `${path}.sha256`, 'SHA-256 inválido.');
    return {
      id: sourceId, source_type: sourceType, category,
      title: text(value.title, `${path}.title`, audit, 1600),
      file_name: fileName, page_count: pageCount, availability, url, sha256: sourceHash,
    };
  });
  if (sources.filter(({ source_type: type }) => type === 'official_edital').length !== 1) {
    audit.error('OFFICIAL_EDITAL_REQUIRED', 'package.sources', 'Declare exatamente um edital oficial.');
  }
  const uploadedNames = new Set(uploadedSources.filter(({ status }) => ['uploaded', 'extracted'].includes(status))
    .map(({ file_name: name }) => String(name).toLocaleLowerCase('pt-BR')));
  if (!uploadedNames.size) audit.error('UPLOADED_SOURCE_REQUIRED', 'package.sources', 'Envie ao menos o edital oficial em PDF antes de importar o pacote.');
  for (const [index, source] of sources.entries()) {
    if (source.availability === 'uploaded_pdf' && !uploadedNames.has(source.file_name.toLocaleLowerCase('pt-BR'))) {
      audit.error('SOURCE_FILE_NOT_UPLOADED', `package.sources[${index}].file_name`, 'O PDF declarado ainda não foi enviado neste rascunho.');
    }
  }
  if (!sources.some(({ source_type: type, availability }) => type === 'official_edital' && availability === 'uploaded_pdf')) {
    audit.error('OFFICIAL_EDITAL_UPLOAD_REQUIRED', 'package.sources', 'O edital oficial deve ser uma fonte uploaded_pdf.');
  }
  const sourceIndex = new Map(sources.map((source) => [source.id, source]));

  const curriculumRaw = object(root.curriculum, 'package.curriculum', audit);
  exact(curriculumRaw, ['nodes'], 'package.curriculum', audit);
  const nodesRaw = Array.isArray(curriculumRaw.nodes) ? curriculumRaw.nodes : [];
  if (!nodesRaw.length || nodesRaw.length > 10_000) audit.error('CURRICULUM_INVALID', 'package.curriculum.nodes', 'Currículo vazio ou acima de 10.000 nós.');
  const nodeIds = new Set();
  const nodes = nodesRaw.slice(0, 10_000).map((entry, index) => {
    const path = `package.curriculum.nodes[${index}]`;
    const value = object(entry, path, audit);
    exact(value, ['id', 'parent_id', 'type', 'title', 'description', 'order', 'confidence', 'traces'], path, audit);
    const nodeId = id(value.id, `${path}.id`, audit);
    if (nodeIds.has(nodeId)) audit.error('CURRICULUM_ID_DUPLICATE', `${path}.id`, 'ID curricular duplicado.');
    nodeIds.add(nodeId);
    const type = ['role', 'discipline', 'topic', 'subtopic'].includes(value.type) ? value.type : 'invalid';
    if (type === 'invalid') audit.error('CURRICULUM_TYPE_INVALID', `${path}.type`, 'Tipo curricular inválido.');
    const order = Number(value.order ?? index);
    if (!Number.isInteger(order) || order < 0 || order > 100_000) audit.error('CURRICULUM_ORDER_INVALID', `${path}.order`, 'Ordem curricular inválida.');
    return {
      id: nodeId,
      parent_id: value.parent_id == null || value.parent_id === '' ? null : id(value.parent_id, `${path}.parent_id`, audit),
      type,
      title: text(value.title, `${path}.title`, audit, 1600),
      description: text(value.description, `${path}.description`, audit, 1200, { optional: true }),
      order: Number.isInteger(order) ? order : index,
      confidence: confidence(value.confidence, `${path}.confidence`, audit),
      traces: sourceTraces(value.traces, `${path}.traces`, audit, sourceIndex),
    };
  });
  const nodeIndex = new Map(nodes.map((node) => [node.id, node]));
  const expectedParent = { role: null, discipline: 'role', topic: 'discipline', subtopic: 'topic' };
  for (const [index, node] of nodes.entries()) {
    if (node.type === 'role' && node.parent_id) audit.error('ROLE_PARENT_INVALID', `package.curriculum.nodes[${index}].parent_id`, 'Cargo não possui pai.');
    if (node.type !== 'role') {
      const parent = nodeIndex.get(node.parent_id);
      if (!parent) audit.error('CURRICULUM_PARENT_MISSING', `package.curriculum.nodes[${index}].parent_id`, 'Nó pai inexistente.');
      else if (parent.type !== expectedParent[node.type]) audit.error('CURRICULUM_PARENT_TYPE_INVALID', `package.curriculum.nodes[${index}].parent_id`, 'Tipo do nó pai incompatível.');
    }
  }
  for (const type of ['role', 'discipline', 'topic', 'subtopic']) {
    if (!nodes.some((node) => node.type === type)) audit.error('CURRICULUM_LEVEL_EMPTY', 'package.curriculum.nodes', `O nível ${type} está vazio.`);
  }
  if (nodes.filter(({ type }) => type === 'role').length !== 1) audit.error('CURRICULUM_ROLE_INVALID', 'package.curriculum.nodes', 'Declare exatamente um cargo raiz.');
  const subtopics = nodes.filter(({ type }) => type === 'subtopic');
  const subtopicIds = new Set(subtopics.map(({ id: nodeId }) => nodeId));

  const knowledgeRaw = Array.isArray(root.microknowledges) ? root.microknowledges : [];
  if (!knowledgeRaw.length || knowledgeRaw.length > 50_000) audit.error('MICROKNOWLEDGES_INVALID', 'package.microknowledges', 'Informe os microconhecimentos do mapa.');
  const knowledgeIds = new Set();
  const microknowledges = knowledgeRaw.slice(0, 50_000).map((entry, index) => {
    const path = `package.microknowledges[${index}]`;
    const value = object(entry, path, audit);
    exact(value, ['id', 'subtopic_id', 'title', 'scope_origin', 'confidence', 'traces'], path, audit);
    const knowledgeId = id(value.id, `${path}.id`, audit);
    if (knowledgeIds.has(knowledgeId)) audit.error('MICROKNOWLEDGE_ID_DUPLICATE', `${path}.id`, 'ID de microconhecimento duplicado.');
    knowledgeIds.add(knowledgeId);
    const subtopicId = id(value.subtopic_id, `${path}.subtopic_id`, audit);
    if (!subtopicIds.has(subtopicId)) audit.error('MICROKNOWLEDGE_SUBTOPIC_INVALID', `${path}.subtopic_id`, 'Subtópico inexistente.');
    const scopeOrigin = ['official', 'complementary'].includes(value.scope_origin) ? value.scope_origin : 'invalid';
    if (scopeOrigin === 'invalid') audit.error('MICROKNOWLEDGE_SCOPE_INVALID', `${path}.scope_origin`, 'Origem do escopo inválida.');
    const traces = sourceTraces(value.traces, `${path}.traces`, audit, sourceIndex);
    if (scopeOrigin === 'official' && !traces.some(({ source_type: type }) => type === 'official_edital')) {
      audit.error('OFFICIAL_SCOPE_WITHOUT_EDITAL', `${path}.traces`, 'Escopo oficial precisa citar o edital.');
    }
    if (scopeOrigin === 'complementary' && !traces.some(({ source_type: type }) => type === 'complementary')) {
      audit.error('COMPLEMENTARY_SCOPE_WITHOUT_SOURCE', `${path}.traces`, 'Conteúdo complementar precisa citar material de apoio.');
    }
    return {
      id: knowledgeId,
      subtopic_id: subtopicId,
      title: text(value.title, `${path}.title`, audit, 400),
      scope_origin: scopeOrigin,
      confidence: confidence(value.confidence, `${path}.confidence`, audit),
      traces,
    };
  });
  const knowledgeIndex = new Map(microknowledges.map((item) => [item.id, item]));

  const mapRaw = Array.isArray(root.edital_map) ? root.edital_map : [];
  if (!mapRaw.length || mapRaw.length > 10_000) audit.error('EDITAL_MAP_INVALID', 'package.edital_map', 'Mapa do Edital vazio ou acima do limite.');
  const mappedSubtopics = new Set();
  const mapIds = new Set();
  const linkedKnowledges = new Set();
  const editalMap = mapRaw.slice(0, 10_000).map((entry, index) => {
    const path = `package.edital_map[${index}]`;
    const value = object(entry, path, audit);
    exact(value, [
      'id', 'subtopic_id', 'scope', 'essential_concepts', 'rules', 'exceptions',
      'applications', 'competencies', 'required_knowledge', 'microknowledge_ids',
      'confidence', 'traces',
    ], path, audit);
    const mapId = id(value.id, `${path}.id`, audit);
    if (mapIds.has(mapId)) audit.error('MAP_ID_DUPLICATE', `${path}.id`, 'ID do mapa duplicado.');
    mapIds.add(mapId);
    const subtopicId = id(value.subtopic_id, `${path}.subtopic_id`, audit);
    if (!subtopicIds.has(subtopicId)) audit.error('MAP_SUBTOPIC_INVALID', `${path}.subtopic_id`, 'Subtópico inexistente.');
    if (mappedSubtopics.has(subtopicId)) audit.error('MAP_SUBTOPIC_DUPLICATE', `${path}.subtopic_id`, 'Subtópico repetido no mapa.');
    mappedSubtopics.add(subtopicId);
    const knowledgeRefs = Array.isArray(value.microknowledge_ids) ? value.microknowledge_ids.map((entryId, refIndex) => id(entryId, `${path}.microknowledge_ids[${refIndex}]`, audit)) : [];
    if (!knowledgeRefs.length) audit.error('MAP_MICROKNOWLEDGE_REQUIRED', `${path}.microknowledge_ids`, 'Cada subtópico precisa de microconhecimento.');
    for (const knowledgeId of knowledgeRefs) {
      const knowledge = knowledgeIndex.get(knowledgeId);
      if (!knowledge) audit.error('MAP_MICROKNOWLEDGE_UNKNOWN', `${path}.microknowledge_ids`, `Microconhecimento inexistente: ${knowledgeId}.`);
      else if (knowledge.subtopic_id !== subtopicId) audit.error('MAP_MICROKNOWLEDGE_LINK_INVALID', `${path}.microknowledge_ids`, 'Microconhecimento pertence a outro subtópico.');
      if (linkedKnowledges.has(knowledgeId)) audit.error('MAP_MICROKNOWLEDGE_DUPLICATE', `${path}.microknowledge_ids`, 'Microconhecimento vinculado mais de uma vez.');
      linkedKnowledges.add(knowledgeId);
    }
    const traces = sourceTraces(value.traces, `${path}.traces`, audit, sourceIndex);
    if (!traces.some(({ source_type: type }) => type === 'official_edital')) audit.error('MAP_WITHOUT_EDITAL', `${path}.traces`, 'O mapa precisa citar o edital oficial.');
    const list = (field, max = 200) => {
      if (!Array.isArray(value[field])) {
        audit.error('MAP_LIST_INVALID', `${path}.${field}`, 'Campo deve ser uma lista.');
        return [];
      }
      return value[field].slice(0, max).map((item, itemIndex) => text(item, `${path}.${field}[${itemIndex}]`, audit, 400));
    };
    const subtopic = nodeIndex.get(subtopicId);
    const topic = nodeIndex.get(subtopic?.parent_id);
    const discipline = nodeIndex.get(topic?.parent_id);
    return {
      id: mapId,
      discipline_id: discipline?.id || '', discipline_title: discipline?.title || '',
      topic_id: topic?.id || '', topic_title: topic?.title || '',
      subtopic_id: subtopicId, subtopic_title: subtopic?.title || '',
      scope: text(value.scope, `${path}.scope`, audit, 1600),
      essential_concepts: list('essential_concepts'), rules: list('rules'), exceptions: list('exceptions'),
      applications: list('applications'), competencies: list('competencies'), required_knowledge: list('required_knowledge'),
      microknowledge_ids: knowledgeRefs,
      confidence: confidence(value.confidence, `${path}.confidence`, audit),
      traces,
    };
  });
  for (const subtopic of subtopics) if (!mappedSubtopics.has(subtopic.id)) audit.error('MAP_SUBTOPIC_MISSING', 'package.edital_map', `Subtópico sem mapa: ${subtopic.id}.`);
  for (const knowledge of microknowledges) if (!linkedKnowledges.has(knowledge.id)) audit.error('MICROKNOWLEDGE_UNLINKED', 'package.edital_map', `Microconhecimento sem mapa: ${knowledge.id}.`);

  const questionBatchesRaw = Array.isArray(root.question_batches) ? root.question_batches : [];
  if (questionBatchesRaw.length > 500) audit.error('QUESTION_BATCHES_LIMIT', 'package.question_batches', 'Máximo de 500 lotes.');
  if (!questionBatchesRaw.length) audit.warn('QUESTIONS_EMPTY', 'package.question_batches', 'O pacote ainda não possui banco de questões.');
  const questionIds = new Set();
  const batchNames = new Set();
  const statements = new Set();
  const knowledgeWithQuestions = new Set();
  const subtopicsWithQuestions = new Set();
  const questionRows = [];
  questionBatchesRaw.slice(0, 500).forEach((entry, batchIndex) => {
    const path = `package.question_batches[${batchIndex}]`;
    const batch = object(entry, path, audit);
    exact(batch, ['name', 'questions'], path, audit);
    const batchName = text(batch.name, `${path}.name`, audit, 160);
    const comparableBatchName = batchName.toLocaleLowerCase('pt-BR');
    if (batchNames.has(comparableBatchName)) audit.error('QUESTION_BATCH_NAME_DUPLICATE', `${path}.name`, 'Nome de lote duplicado.');
    batchNames.add(comparableBatchName);
    if (!Array.isArray(batch.questions) || !batch.questions.length || batch.questions.length > 1000) {
      audit.error('QUESTION_BATCH_INVALID', `${path}.questions`, 'Cada lote deve possuir de 1 a 1.000 questões.');
      return;
    }
    batch.questions.forEach((entryQuestion, questionIndex) => {
      const questionPath = `${path}.questions[${questionIndex}]`;
      const value = object(entryQuestion, questionPath, audit);
      exact(value, [
        'id', 'subtopic_id', 'microknowledge_ids', 'statement', 'options', 'correct_answer',
        'explanation', 'difficulty', 'format', 'source', 'is_trick', 'traces',
      ], questionPath, audit);
      const questionId = id(value.id, `${questionPath}.id`, audit);
      if (questionIds.has(questionId)) audit.error('QUESTION_ID_DUPLICATE', `${questionPath}.id`, 'ID de questão duplicado.');
      questionIds.add(questionId);
      const subtopicId = id(value.subtopic_id, `${questionPath}.subtopic_id`, audit);
      if (!subtopicIds.has(subtopicId)) audit.error('QUESTION_SUBTOPIC_INVALID', `${questionPath}.subtopic_id`, 'Subtópico inexistente.');
      else subtopicsWithQuestions.add(subtopicId);
      const knowledgeRefs = Array.isArray(value.microknowledge_ids) ? value.microknowledge_ids.map((entryId, refIndex) => id(entryId, `${questionPath}.microknowledge_ids[${refIndex}]`, audit)) : [];
      if (!knowledgeRefs.length) audit.error('QUESTION_MICROKNOWLEDGE_REQUIRED', `${questionPath}.microknowledge_ids`, 'Vincule a questão a ao menos um microconhecimento.');
      if (new Set(knowledgeRefs).size !== knowledgeRefs.length) audit.error('QUESTION_MICROKNOWLEDGE_DUPLICATE', `${questionPath}.microknowledge_ids`, 'Vínculo de microconhecimento duplicado.');
      for (const knowledgeId of knowledgeRefs) {
        const knowledge = knowledgeIndex.get(knowledgeId);
        if (!knowledge) audit.error('QUESTION_MICROKNOWLEDGE_UNKNOWN', `${questionPath}.microknowledge_ids`, `Microconhecimento inexistente: ${knowledgeId}.`);
        else if (knowledge.subtopic_id !== subtopicId) audit.error('QUESTION_MICROKNOWLEDGE_LINK_INVALID', `${questionPath}.microknowledge_ids`, 'Microconhecimento pertence a outro subtópico.');
        else knowledgeWithQuestions.add(knowledgeId);
      }
      const statement = text(value.statement, `${questionPath}.statement`, audit, 10_000);
      const comparable = statement.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
      if (comparable && statements.has(comparable)) audit.error('QUESTION_STATEMENT_DUPLICATE', `${questionPath}.statement`, 'Enunciado duplicado.');
      statements.add(comparable);
      const options = Array.isArray(value.options) ? value.options.slice(0, 20).map((option, optionIndex) => {
        const optionPath = `${questionPath}.options[${optionIndex}]`;
        if (typeof option === 'string') return text(option, optionPath, audit, 2000);
        const optionValue = object(option, optionPath, audit);
        exact(optionValue, ['label', 'text'], optionPath, audit);
        return {
          label: text(optionValue.label, `${optionPath}.label`, audit, 12),
          text: text(optionValue.text, `${optionPath}.text`, audit, 2000),
        };
      }) : [];
      if (value.options != null && !Array.isArray(value.options)) audit.error('QUESTION_OPTIONS_INVALID', `${questionPath}.options`, 'Alternativas devem ser uma lista.');
      if (options.length === 1) audit.error('QUESTION_OPTIONS_INVALID', `${questionPath}.options`, 'Questões objetivas devem ter ao menos duas alternativas; use lista vazia para Certo/Errado.');
      const optionLabels = options.map((option, optionIndex) => String(option?.label ?? String.fromCharCode(65 + optionIndex)).toLocaleUpperCase('pt-BR'));
      if (new Set(optionLabels).size !== optionLabels.length) audit.error('QUESTION_OPTION_DUPLICATE', `${questionPath}.options`, 'Rótulo de alternativa duplicado.');
      const traces = sourceTraces(value.traces, `${questionPath}.traces`, audit, sourceIndex);
      const normalized = {
        id: questionId,
        contest_id: course.contest_id,
        subtopic_id: subtopicId,
        microknowledge_ids: knowledgeRefs,
        statement,
        options,
        correct_answer: normalizeAnswer(value.correct_answer, options, `${questionPath}.correct_answer`, audit),
        explanation: text(value.explanation, `${questionPath}.explanation`, audit, 20_000),
        difficulty: text(value.difficulty, `${questionPath}.difficulty`, audit, 40, { optional: true }),
        format: text(value.format, `${questionPath}.format`, audit, 60, { optional: true }),
        source: value.source ?? null,
        is_trick: Boolean(value.is_trick),
        traces,
        status: 'draft',
      };
      questionRows.push({
        source_question_id: questionId, subtopic_id: subtopicId, microknowledge_ids: knowledgeRefs,
        payload: normalized, traces, batch_name: batchName, order_index: questionRows.length,
      });
    });
  });

  const coverage = {
    subtopics_total: subtopics.length,
    subtopics_mapped: mappedSubtopics.size,
    edital_map_pct: pct(mappedSubtopics.size, subtopics.length),
    microknowledges_total: microknowledges.length,
    microknowledges_with_questions: knowledgeWithQuestions.size,
    microknowledge_question_pct: pct(knowledgeWithQuestions.size, microknowledges.length),
    subtopics_with_questions: subtopicsWithQuestions.size,
    subtopic_question_pct: pct(subtopicsWithQuestions.size, subtopics.length),
    questions_total: questionRows.length,
  };
  const counts = {
    roles: nodes.filter(({ type }) => type === 'role').length,
    disciplines: nodes.filter(({ type }) => type === 'discipline').length,
    topics: nodes.filter(({ type }) => type === 'topic').length,
    subtopics: subtopics.length,
    microknowledges: microknowledges.length,
    question_batches: questionBatchesRaw.length,
    questions: questionRows.length,
    sources: sources.length,
  };
  const curriculumTree = buildCurriculumTree(nodes);
  const mapWithKnowledge = editalMap.map((item) => ({
    ...item,
    microknowledges: item.microknowledge_ids.map((knowledgeId) => knowledgeIndex.get(knowledgeId)).filter(Boolean),
  }));
  const identity = {
    contest_name: course.name,
    organization: course.organization,
    position: course.position,
    board: course.board,
    year: course.year,
    exam_date: course.exam_date,
    exam_format: course.exam_format,
    contest_id: course.contest_id,
    position_id: course.position_id,
    offering_id: course.offering_id,
    slug: course.slug,
  };
  const normalized = {
    schema_version: ASSISTED_PACKAGE_SCHEMA_VERSION,
    operation_id: operationId,
    course,
    sources,
    curriculum_nodes: nodes,
    curriculum_tree: curriculumTree,
    edital_map: mapWithKnowledge,
    microknowledges,
    questions: questionRows,
    metadata: root.metadata && typeof root.metadata === 'object' && !Array.isArray(root.metadata) ? root.metadata : {},
  };
  if (root.metadata != null && (!root.metadata || typeof root.metadata !== 'object' || Array.isArray(root.metadata))) {
    audit.error('METADATA_INVALID', 'package.metadata', 'Metadados devem formar um objeto JSON.');
  }
  const missingTraceRecords = [
    ...nodes.flatMap(({ traces }) => traces),
    ...microknowledges.flatMap(({ traces }) => traces),
    ...editalMap.flatMap(({ traces }) => traces),
    ...questionRows.flatMap(({ traces }) => traces),
  ].filter(({ trace_status: status }) => status === 'missing').length;
  counts.missing_trace_records = missingTraceRecords;
  if (missingTraceRecords) audit.warn(
    'TRACEABILITY_MISSING_DECLARED',
    'package',
    `${missingTraceRecords} vínculo(s) preservado(s) com rastreabilidade ausente explicitamente declarada.`,
  );
  const packageHash = await sha256(stableJson(normalized));
  return {
    valid: audit.errors.length === 0,
    errors: audit.errors,
    warnings: audit.warnings,
    counts,
    coverage,
    package_hash: packageHash,
    normalized,
    identity,
  };
}
