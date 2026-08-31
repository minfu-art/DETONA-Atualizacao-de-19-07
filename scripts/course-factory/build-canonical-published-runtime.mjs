import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_${name}`);
  return process.argv[index + 1];
}

const bundlePath = path.resolve(argument('bundle'));
const outputPath = path.resolve(argument('output'));
const version = String(argument('version')).trim();
const priceCents = Number(argument('price-cents'));
if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(version)) throw new Error('invalid_version');
if (!Number.isInteger(priceCents) || priceCents < 1) throw new Error('invalid_price_cents');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const [courseDocument, curriculumDocument, microknowledgeDocument, auditDocument] = await Promise.all([
  readJson(path.join(bundlePath, 'course.json')),
  readJson(path.join(bundlePath, 'curriculum.json')),
  readJson(path.join(bundlePath, 'microknowledge.json')),
  readJson(path.join(bundlePath, 'audit.json')),
]);
const course = courseDocument.course;
const canonicalNodes = curriculumDocument.nodes || [];
const microknowledges = microknowledgeDocument.microknowledges || [];
if (!course?.contest_id || !course?.offering_id) throw new Error('invalid_course_identity');
if (!canonicalNodes.length) throw new Error('curriculum_empty');

const nodeIds = new Set(canonicalNodes.map(({ id }) => id));
if (nodeIds.size !== canonicalNodes.length) throw new Error('duplicate_curriculum_node');
const knowledgeIds = new Set(microknowledges.map(({ id }) => id));
if (knowledgeIds.size !== microknowledges.length) throw new Error('duplicate_microknowledge');

const questionDirectory = path.join(bundlePath, 'questions');
const questionFiles = (await readdir(questionDirectory)).filter((file) => file.endsWith('.json')).sort();
const batches = await Promise.all(questionFiles.map((file) => readJson(path.join(questionDirectory, file))));
const canonicalQuestions = batches.flatMap((batch) => (batch.questions || []).map((question) => ({
  ...question,
  source_batch: batch.name || path.basename(questionDirectory),
})));
const questionIds = new Set(canonicalQuestions.map(({ id }) => id));
if (!canonicalQuestions.length || questionIds.size !== canonicalQuestions.length) throw new Error('invalid_question_ids');
if (auditDocument.validation?.semantic_question_audit !== 'approved'
  || Number(auditDocument.validation?.approved_questions) !== canonicalQuestions.length
  || Number(auditDocument.validation?.rejected_questions) !== 0) {
  throw new Error('semantic_audit_not_approved');
}

const curriculum = canonicalNodes.map((node) => ({
  id: node.id,
  source_id: node.id,
  parent_id: node.parent_id,
  parent_source_id: node.parent_id,
  type: node.type,
  name: node.title,
  description: node.description || '',
  order_index: Number(node.order) || 0,
  status: 'active',
}));
const nodeById = new Map(curriculum.map((node) => [node.source_id, node]));

function ancestors(subtopicId) {
  const result = { topicId: null, disciplineId: null };
  let node = nodeById.get(subtopicId);
  while (node?.parent_source_id) {
    node = nodeById.get(node.parent_source_id);
    if (!node) break;
    if (node.type === 'topic') result.topicId = node.source_id;
    if (node.type === 'discipline') {
      result.disciplineId = node.source_id;
      break;
    }
  }
  return result;
}

const questions = canonicalQuestions.map((question) => {
  if (!nodeIds.has(question.subtopic_id)) throw new Error(`question_subtopic_invalid:${question.id}`);
  if (!Array.isArray(question.microknowledge_ids) || !question.microknowledge_ids.length
    || question.microknowledge_ids.some((id) => !knowledgeIds.has(id))) {
    throw new Error(`question_microknowledge_invalid:${question.id}`);
  }
  const { topicId, disciplineId } = ancestors(question.subtopic_id);
  const [primaryMicroknowledgeId, ...secondaryMicroknowledgeIds] = question.microknowledge_ids;
  return {
    ...question,
    contest_id: course.contest_id,
    discipline_id: disciplineId,
    topic_id: topicId,
    primary_microknowledge_id: primaryMicroknowledgeId,
    secondary_microknowledge_ids: secondaryMicroknowledgeIds,
    concursoId: course.contest_id,
    enunciado: question.statement,
    alternativas: question.options,
    respostaCorreta: question.correct_answer,
    explicacao: question.explanation,
    tipo: question.format,
    situacao: 'publicada',
  };
});

const contentHash = createHash('sha256').update(JSON.stringify({ curriculum, questions })).digest('hex');
const runtime = {
  id: `${course.offering_id}_${version.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
  contestId: course.contest_id,
  version,
  contentHash,
  metadata: {
    id: course.contest_id,
    code: course.code,
    slug: course.slug,
    name: course.name,
    role: course.position,
    description: `${course.description} Banco inicial em expansão.`,
    organization: course.organization,
    board: course.board,
    exam_date: course.exam_date,
    content_status: 'ready',
    sales_status: 'available',
    price_cents: priceCents,
    currency: 'BRL',
    status_label: 'PUBLICADO',
    question_count: questions.length,
    subtopic_count: curriculum.filter(({ type }) => type === 'subtopic').length,
  },
  curriculum,
  questions,
  previewOnly: false,
  publicationBlocked: false,
  salesBlocked: false,
};

await writeFile(outputPath, `${JSON.stringify(runtime)}\n`, 'utf8');
console.log(JSON.stringify({
  output: outputPath,
  contestId: runtime.contestId,
  version,
  contentHash,
  curriculum: curriculum.length,
  questions: questions.length,
}, null, 2));
