import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_${name}`);
  return path.resolve(process.argv[index + 1]);
}

const runtimePath = argument('runtime');
const knowledgePath = argument('knowledge-map');
const sourceCatalogPath = argument('source-catalog');
const outputPath = argument('output');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const [runtime, knowledgeMap, sourceCatalog] = await Promise.all([
  readJson(runtimePath), readJson(knowledgePath), readJson(sourceCatalogPath),
]);

const OFFICIAL_SOURCE_ID = 'pc_ba_2026_edital_abertura_saeb_02_2026';
const missingTrace = (sourceId = OFFICIAL_SOURCE_ID, location = '') => [{
  source_id: sourceId,
  trace_status: 'missing',
  location,
  note: 'Rastreabilidade antiga sem página e excerto exatos verificáveis; vínculo histórico preservado sem invenção.',
}];

function sourceCategory(source) {
  if (source.source_id === OFFICIAL_SOURCE_ID) return 'edital';
  if (/manual/i.test(source.source_type)) return 'manual';
  if (/normative|case_law/i.test(source.source_type)) return 'legislacao';
  if (/didactic|educational/i.test(source.source_type)) return 'material_curso';
  return 'referencia';
}

const sources = sourceCatalog.sources.map((source) => ({
  id: source.source_id,
  source_type: source.source_id === OFFICIAL_SOURCE_ID ? 'official_edital' : 'complementary',
  category: sourceCategory(source),
  title: source.title,
  file_name: source.file_name || '',
  page_count: source.page_count || null,
  availability: source.source_id === OFFICIAL_SOURCE_ID
    ? 'uploaded_pdf'
    : source.availability === 'public_web' ? 'external_reference' : 'reference_only',
  url: source.url || '',
  sha256: source.sha256 || '',
}));

const curriculumNodes = runtime.curriculum.map((node) => ({
  id: node.id,
  parent_id: node.parent_id,
  type: node.type,
  title: node.name,
  description: node.description || '',
  order: node.order_index,
  confidence: 1,
  traces: missingTrace(OFFICIAL_SOURCE_ID, 'Edital SAEB nº 02/2026, conteúdo programático geral nas páginas 12–15.'),
}));

const allFragments = knowledgeMap.disciplines.flatMap((discipline) => discipline.fragments || []);
const allMicroknowledges = allFragments.flatMap((fragment) => fragment.microknowledges || []);
const validMicroknowledges = allMicroknowledges.filter(({ subtopic_id: subtopicId }) => Boolean(subtopicId));
const orphanMicroknowledges = allMicroknowledges.filter(({ subtopic_id: subtopicId }) => !subtopicId);
const microknowledges = validMicroknowledges.map((item) => ({
  id: item.microknowledge_id,
  subtopic_id: item.subtopic_id,
  title: item.name,
  scope_origin: 'official',
  confidence: item.canonical_binding_confidence ?? 1,
  traces: missingTrace(OFFICIAL_SOURCE_ID, 'Decomposição pedagógica vinculada ao texto oficial; página individual não registrada no artefato legado.'),
}));

const fragmentsBySubtopic = new Map();
for (const fragment of allFragments.filter(({ subtopic_id: subtopicId }) => Boolean(subtopicId))) {
  if (!fragmentsBySubtopic.has(fragment.subtopic_id)) fragmentsBySubtopic.set(fragment.subtopic_id, []);
  fragmentsBySubtopic.get(fragment.subtopic_id).push(fragment);
}
const subtopics = curriculumNodes.filter(({ type }) => type === 'subtopic');
const editalMap = subtopics.map((subtopic) => {
  const fragments = fragmentsBySubtopic.get(subtopic.id) || [];
  const items = fragments.flatMap((fragment) => fragment.microknowledges || []).filter(({ subtopic_id: subtopicId }) => subtopicId === subtopic.id);
  return {
    id: `map_${subtopic.id}`,
    subtopic_id: subtopic.id,
    scope: subtopic.title,
    essential_concepts: items.map(({ name }) => name),
    rules: [],
    exceptions: [],
    applications: [],
    competencies: [...new Set(items.flatMap(({ competencies }) => competencies || []))],
    required_knowledge: items.map(({ name }) => name),
    microknowledge_ids: items.map(({ microknowledge_id: id }) => id),
    confidence: Math.min(...items.map(({ canonical_binding_confidence: confidence }) => confidence ?? 1)),
    traces: missingTrace(OFFICIAL_SOURCE_ID, 'Mapa legado vinculado ao subtópico oficial; página individual não registrada.'),
  };
});

const sourceIds = new Set(sources.map(({ id }) => id));
const questionBatches = new Map();
for (const question of runtime.questions) {
  const batchName = question.source_batch || 'questions-imported';
  if (!questionBatches.has(batchName)) questionBatches.set(batchName, []);
  const references = (question.source || []).filter(({ source_id: sourceId }) => sourceIds.has(sourceId));
  questionBatches.get(batchName).push({
    id: question.id,
    subtopic_id: question.subtopic_id,
    microknowledge_ids: [question.primary_microknowledge_id, ...(question.secondary_microknowledge_ids || [])].filter(Boolean),
    statement: question.statement,
    options: question.options || [],
    correct_answer: question.correct_answer,
    explanation: question.explanation,
    difficulty: question.difficulty || '',
    format: question.format || '',
    source: question.source || null,
    is_trick: Boolean(question.is_trick),
    traces: references.length
      ? references.map((reference) => missingTrace(reference.source_id, reference.location || '')[0])
      : missingTrace(),
  });
}

const duplicateCount = (values) => values.length - new Set(values).size;
const nodeIds = new Set(curriculumNodes.map(({ id }) => id));
const validKnowledgeIds = new Set(microknowledges.map(({ id }) => id));
const questions = [...questionBatches.values()].flat();
const invalidQuestions = questions.filter((question) => (
  !nodeIds.has(question.subtopic_id)
  || !question.microknowledge_ids.length
  || question.microknowledge_ids.some((id) => !validKnowledgeIds.has(id))
));
const audit = {
  generated_at: new Date().toISOString(),
  source_artifacts: {
    runtime: path.basename(runtimePath),
    knowledge_map: path.basename(knowledgePath),
    source_catalog: path.basename(sourceCatalogPath),
  },
  curriculum: {
    roles: curriculumNodes.filter(({ type }) => type === 'role').length,
    disciplines: curriculumNodes.filter(({ type }) => type === 'discipline').length,
    topics: curriculumNodes.filter(({ type }) => type === 'topic').length,
    subtopics: subtopics.length,
    duplicate_ids: duplicateCount(curriculumNodes.map(({ id }) => id)),
    orphan_nodes: curriculumNodes.filter((node) => node.parent_id && !nodeIds.has(node.parent_id)).length,
  },
  microknowledges: {
    found: allMicroknowledges.length,
    valid: microknowledges.length,
    orphan: orphanMicroknowledges.length,
    duplicate: duplicateCount(allMicroknowledges.map(({ microknowledge_id: id }) => id)),
    orphan_items: orphanMicroknowledges.map((item) => ({
      id: item.microknowledge_id, topic_id: item.topic_id, title: item.name,
      reason: 'Artefato legado vinculado apenas ao tópico; contrato canônico exige subtópico.',
    })),
  },
  questions: {
    found: questions.length,
    valid: questions.length - invalidQuestions.length,
    invalid: invalidQuestions.length,
    duplicate: duplicateCount(questions.map(({ id }) => id)),
    unlinked: invalidQuestions.length,
  },
  sources: { found: sources.length, explicit_missing_traceability: true },
};

const course = {
  schema_version: 1,
  operation_id: 'pc-ba-2026-investigador-assisted-v1',
  course: {
    contest_id: 'pc_ba_2026',
    position_id: 'pc_ba_2026_investigador_policia_civil',
    offering_id: 'pc_ba_2026_investigador',
    code: 'PC BA',
    slug: 'pc-ba-2026-investigador',
    name: 'PC BA 2026 — Investigador de Polícia Civil',
    organization: 'Polícia Civil do Estado da Bahia',
    position: 'Investigador de Polícia Civil',
    board: runtime.metadata?.board || '',
    year: '2026',
    exam_date: '2026-12-06',
    exam_format: runtime.metadata?.exam_format || 'Prova objetiva',
    description: 'Curso PC BA reconstruído pelo contrato canônico genérico da Course Factory.',
  },
};
const metadata = {
  producer: 'ChatGPT/Codex — modo assistido sem API',
  generated_at: audit.generated_at,
  source_runtime_version: runtime.version,
  source_runtime_hash: runtime.contentHash,
  publication_blocked: true,
  sales_blocked: true,
  legacy_audit: audit,
};

await rm(outputPath, { recursive: true, force: true });
await mkdir(path.join(outputPath, 'questions'), { recursive: true });
await Promise.all([
  writeJson(path.join(outputPath, 'course.json'), course),
  writeJson(path.join(outputPath, 'sources.json'), { sources }),
  writeJson(path.join(outputPath, 'curriculum.json'), { nodes: curriculumNodes }),
  writeJson(path.join(outputPath, 'edital-map.json'), { edital_map: editalMap }),
  writeJson(path.join(outputPath, 'microknowledge.json'), { microknowledges }),
  writeJson(path.join(outputPath, 'metadata.json'), { metadata }),
  writeJson(path.join(outputPath, 'audit.json'), audit),
  ...[...questionBatches.entries()].map(([name, batchQuestions], index) => writeJson(
    path.join(outputPath, 'questions', `${String(index + 1).padStart(3, '0')}-${name.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 100)}.json`),
    { name, questions: batchQuestions },
  )),
]);

console.log(JSON.stringify({ output: outputPath, audit, question_batches: questionBatches.size }, null, 2));
