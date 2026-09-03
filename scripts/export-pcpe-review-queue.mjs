#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftRoot = path.join(repo, 'course-drafts', 'pc-pe-2027-agente');
const reviewPath = path.join(draftRoot, 'material-question-extraction', 'review', 'needs-review.json');
const curriculumPath = path.join(draftRoot, 'course-bundle', 'curriculum.json');
const outputPath = path.join(draftRoot, 'material-question-extraction', 'review', 'review-queue.csv');

const [reviewPayload, curriculum] = await Promise.all([
  readFile(reviewPath, 'utf8').then(JSON.parse),
  readFile(curriculumPath, 'utf8').then(JSON.parse),
]);

const subtopics = new Map();
for (const role of curriculum.roles || []) {
  for (const discipline of role.disciplines || []) {
    for (const topic of discipline.topics || []) {
      for (const subtopic of topic.subtopics || []) {
        subtopics.set(subtopic.id, {
          discipline: discipline.name,
          topic: topic.name,
          subtopic: subtopic.name,
        });
      }
    }
  }
}

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""').replace(/\s+/g, ' ').trim()}"`;
const headers = [
  'id',
  'pasta_origem',
  'arquivo_origem',
  'paginas',
  'formato',
  'motivos_revisao',
  'disciplina_sugerida',
  'topico_sugerido',
  'subtopico_sugerido',
  'confianca',
  'margem',
  'enunciado',
];

const rows = (reviewPayload.questions || []).map((question) => {
  const metadata = question.metadata || {};
  const suggestion = subtopics.get(question.subtopic_id) || {};
  const sourceFile = String(metadata.source_file || '');
  return [
    question.id,
    sourceFile.split('/')[0],
    sourceFile,
    (metadata.source_pages || []).join('-'),
    question.format,
    (metadata.review_reasons || []).join('|'),
    suggestion.discipline,
    suggestion.topic,
    suggestion.subtopic,
    metadata.mapping_confidence,
    metadata.mapping_margin,
    question.statement,
  ].map(quote).join(',');
});

await writeFile(outputPath, `\uFEFF${headers.map(quote).join(',')}\n${rows.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ output: outputPath, rows: rows.length }));
