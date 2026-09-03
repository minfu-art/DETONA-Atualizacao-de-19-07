#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const sourcePath = path.join(root, 'course-drafts', 'pc-pe-2027-agente', 'course-bundle', 'questions', '002-pcpe-agente-2027-reuso-banco-interno.json');
const baseRuntimePath = path.join(root, 'app', 'data', 'course-factory', 'pc-pe-2026-agente-runtime.json');
const outputPath = path.join(root, 'app', 'data', 'course-factory', 'published', 'pc-pe-2026-agente-patch-001.json');

const [sourceBatch, baseRuntime] = await Promise.all([
  readFile(sourcePath, 'utf8').then(JSON.parse),
  readFile(baseRuntimePath, 'utf8').then(JSON.parse),
]);

if (baseRuntime.contestId !== 'pc_pe_2026' || baseRuntime.questions?.length !== 100) {
  throw new Error('Pacote-base PC PE inesperado.');
}

const validSubtopics = new Set(
  baseRuntime.curriculum
    .filter(({ type }) => type === 'subtopic')
    .map(({ source_id: sourceId, id }) => sourceId || id),
);
const existingIds = new Set(baseRuntime.questions.map(({ id }) => id));
const existingStatements = new Set(baseRuntime.questions.map(({ statement }) => String(statement).trim().toLowerCase()));

const questions = sourceBatch.questions.map((question, index) => {
  const subtopicId = question.subtopic_id.replaceAll('pc_pe_2027', 'pc_pe_2026');
  const id = `pc_pe_2026_agente_reuso_${String(index + 1).padStart(4, '0')}`;
  if (!validSubtopics.has(subtopicId)) throw new Error(`Subtópico publicado inexistente: ${subtopicId}`);
  if (existingIds.has(id)) throw new Error(`ID já publicado: ${id}`);
  if (existingStatements.has(question.statement.trim().toLowerCase())) throw new Error(`Enunciado já publicado: ${id}`);
  return {
    id,
    subtopic_id: subtopicId,
    microknowledge_ids: [],
    statement: question.statement,
    options: [],
    correct_answer: question.correct_answer ? 'C' : 'E',
    explanation: question.explanation,
    difficulty: 'media',
    format: 'certo_errado',
    source: question.source,
    is_trick: false,
    traces: [
      {
        source_id: `detona_internal_${question.provenance.source_question_id.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        trace_status: 'missing',
        location: question.provenance.source_exam || 'Cadastro editorial interno DETONA.',
        note: `Reuso interno do item ${question.provenance.source_question_id}; enquadramento PC PE revisado antes desta publicação.`,
      },
    ],
    provenance: {
      ...question.provenance,
      mapped_from_contest_id: 'pc_pe_2027',
      published_contest_id: 'pc_pe_2026',
      publication_batch: 'pcpe-reuso-interno-001',
    },
  };
});

if (questions.length !== 217) throw new Error(`Quantidade inesperada: ${questions.length}`);
if (new Set(questions.map(({ id }) => id)).size !== questions.length) throw new Error('IDs duplicados no incremento.');
if (new Set(questions.map(({ statement }) => statement.trim().toLowerCase())).size !== questions.length) {
  throw new Error('Enunciados duplicados no incremento.');
}

const patch = {
  name: 'pcpe-reuso-interno-001',
  version: '2026.09.03.1',
  contest_id: 'pc_pe_2026',
  publication_status: 'published',
  questions,
};
const curriculum = baseRuntime.curriculum.map((node) => ({ ...node, status: 'active' }));
const contentHash = createHash('sha256')
  .update(JSON.stringify({ curriculum, questions: [...baseRuntime.questions, ...questions] }))
  .digest('hex');

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(patch, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  outputPath,
  version: patch.version,
  contentHash,
  baseQuestions: baseRuntime.questions.length,
  patchQuestions: questions.length,
  totalQuestions: baseRuntime.questions.length + questions.length,
  coveredSubtopics: new Set([...baseRuntime.questions, ...questions].map(({ subtopic_id: id }) => id)).size,
}, null, 2)}\n`);
