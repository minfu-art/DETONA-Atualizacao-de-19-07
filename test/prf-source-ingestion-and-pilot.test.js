import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { validateAssistedCoursePackage } from '../supabase/functions/course-factory-assisted/core.js';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('ingestão cataloga integralmente o pacote local da PRF sem autorizar publicação', async () => {
  const report = await readJson('sources/source-ingestion-report.v1.json');
  assert.equal(report.contest_id, 'prf_2026');
  assert.equal(report.summary.pdf_count, 183);
  assert.equal(report.summary.page_count, 19676);
  assert.equal(report.summary.canonical_disciplines_represented, 13);
  assert.deepEqual(report.summary.missing_canonical_disciplines, ['Língua Estrangeira']);
  assert.equal(report.summary.blocked_count, 1);
  assert.equal(report.summary.duplicate_file_groups, 1);
  assert.equal(report.question_generation_authorized, true);
  assert.equal(report.publication_authorized, false);
  assert.equal(report.sources.length, report.summary.pdf_count);
  assert.equal(report.sources.filter(({ status }) => status.startsWith('blocked_')).length, 1);
  assert.equal(report.sources.some(({ relative_path, status }) => relative_path.endsWith('/,.pdf') && status === 'blocked_invalid_filename'), true);
});

test('piloto de Português fecha microconhecimento, três modos de questão e rastreabilidade', async () => {
  const file = 'production/portuguese-regency-crase-pilot.v1.json';
  const raw = await readFile(path.join(root, file), 'utf8');
  const pilot = JSON.parse(raw);
  const questions = pilot.question_batches.flatMap(({ questions: items }) => items);
  const known = new Set(pilot.microknowledges.map(({ id }) => id));
  assert.equal(pilot.microknowledges.length, 8);
  assert.equal(questions.length, 24);
  assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, questions.length);
  assert.equal(pilot.metadata.source_questions_copied, false);
  assert.equal(pilot.metadata.authorial_questions, true);
  assert.equal(pilot.metadata.publication_blocked, true);
  assert.equal(pilot.metadata.import_blocked, true);
  assert.doesNotMatch(raw, /09880248457|thallysson/i);

  for (const microknowledge of pilot.microknowledges) {
    const linked = questions.filter(({ microknowledge_ids: ids }) => ids.includes(microknowledge.id));
    assert.equal(linked.length, 3, microknowledge.id);
    assert.deepEqual(new Set(linked.map(({ difficulty }) => difficulty)), new Set(['facil', 'media', 'dificil']));
    assert.equal(linked.filter(({ is_trick: isTrick }) => isTrick).length, 1);
    assert.ok(microknowledge.traces.some(({ source_id: sourceId }) => sourceId === 'prf_2021_edital_abertura'));
    assert.ok(microknowledge.traces.some(({ source_id: sourceId }) => sourceId === 'prf_pdf_bf5410c46bd3'));
  }
  assert.ok(questions.every(({ correct_answer: answer }) => answer === 'C' || answer === 'E'));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 40));
  assert.ok(questions.every(({ microknowledge_ids: ids }) => ids.length === 1 && known.has(ids[0])));

  const uploadedSources = pilot.sources
    .filter(({ file_name: fileName }) => fileName)
    .map(({ file_name: fileName }) => ({ file_name: fileName, status: 'uploaded' }));
  const validation = await validateAssistedCoursePackage(pilot, { uploadedSources });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.counts.microknowledges, 8);
  assert.equal(validation.counts.questions, 24);
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
  assert.equal(validation.coverage.subtopic_question_pct, 100);
});
