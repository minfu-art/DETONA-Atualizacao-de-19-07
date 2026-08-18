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
const previewPath = path.resolve(argument('preview-runtime'));
const outputPath = path.resolve(argument('output'));
const version = String(argument('version')).trim();
if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(version)) throw new Error('invalid_version');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const [courseDocument, previewRuntime, curriculumDocument] = await Promise.all([
  readJson(path.join(bundlePath, 'course.json')),
  readJson(previewPath),
  readJson(path.join(bundlePath, 'curriculum.json')),
]);
const course = courseDocument.course;
if (!course?.contest_id || previewRuntime.contestId !== course.contest_id) throw new Error('contest_mismatch');

const questionDirectory = path.join(bundlePath, 'questions');
const questionFiles = (await readdir(questionDirectory)).filter((file) => file.endsWith('.json')).sort();
const batches = await Promise.all(questionFiles.map((file) => readJson(path.join(questionDirectory, file))));
const canonicalQuestions = batches.flatMap((batch) => batch.questions || []);
const existingById = new Map((previewRuntime.questions || []).map((question) => [question.id, question]));

const nodeById = new Map((previewRuntime.curriculum || []).map((node) => [node.source_id || node.id, node]));
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

function runtimeQuestion(question, batchName) {
  const previous = existingById.get(question.id);
  if (previous) return previous;
  const { topicId, disciplineId } = ancestors(question.subtopic_id);
  const [primaryMicroknowledgeId = null, ...secondaryMicroknowledgeIds] = question.microknowledge_ids || [];
  return {
    ...question,
    contest_id: course.contest_id,
    discipline_id: disciplineId,
    topic_id: topicId,
    primary_microknowledge_id: primaryMicroknowledgeId,
    secondary_microknowledge_ids: secondaryMicroknowledgeIds,
    source_batch: batchName,
    concursoId: course.contest_id,
    enunciado: question.statement,
    alternativas: question.options,
    respostaCorreta: question.correct_answer,
    explicacao: question.explanation,
    tipo: question.format,
    situacao: 'publicada',
  };
}

const questions = [];
const seenQuestionIds = new Set();
for (const batch of batches) {
  for (const question of batch.questions || []) {
    if (!question?.id || seenQuestionIds.has(question.id)) throw new Error(`duplicate_question:${question?.id || 'missing'}`);
    seenQuestionIds.add(question.id);
    questions.push(runtimeQuestion(question, batch.name || 'course-factory'));
  }
}
if (questions.length !== canonicalQuestions.length || questions.length < 1) throw new Error('question_count_invalid');

const canonicalNodeIds = new Set((curriculumDocument.nodes || []).map((node) => node.id));
for (const question of questions) {
  if (!canonicalNodeIds.has(question.subtopic_id)) throw new Error(`question_subtopic_invalid:${question.id}`);
}

const curriculum = (previewRuntime.curriculum || []).map((node) => ({ ...node, status: 'active' }));
const content = { curriculum, questions };
const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
const runtime = {
  id: `${course.offering_id}_${version.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
  contestId: course.contest_id,
  version,
  contentHash,
  metadata: {
    ...previewRuntime.metadata,
    id: course.contest_id,
    code: course.code,
    slug: course.slug,
    name: course.name,
    role: course.position,
    description: course.description,
    content_status: 'ready',
    sales_status: 'available',
    price_cents: 6990,
    currency: 'BRL',
    status_label: 'PUBLICADO',
    question_count: questions.length,
    subtopic_count: curriculum.filter((node) => node.type === 'subtopic').length,
  },
  curriculum,
  questions,
  previewOnly: false,
  publicationBlocked: false,
  salesBlocked: false,
};

await writeFile(outputPath, `${JSON.stringify(runtime)}\n`, 'utf8');
console.log(JSON.stringify({ output: outputPath, contestId: runtime.contestId, version, contentHash, questions: questions.length }));
