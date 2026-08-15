import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPilotBatch } from '../scripts/generate-pc-ba-investigador-pilot-questions.mjs';
import { validateQuestionBatchV2 } from '../scripts/validate-pc-ba-question-batch.mjs';

const root = new URL('../course-drafts/pc-ba-2026-investigador/', import.meta.url);

test('lote piloto AOCP possui 20 questões, cinco alternativas e distribuição 6/10/4', async () => {
  const catalog = JSON.parse(await readFile(new URL('sources/source-catalog.v2.json', root), 'utf8'));
  const readiness = JSON.parse(await readFile(new URL('source-readiness.v1.json', root), 'utf8'));
  const batch = buildPilotBatch();
  const validation = validateQuestionBatchV2({ batch, catalog, readiness });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.deepEqual(validation.difficulty, { facil: 6, intermediaria: 10, dificil: 4 });
  assert.equal(new Set(batch.questions.map(({ question_id }) => question_id)).size, 20);
  assert.ok(batch.questions.every(({ options, correct_option }) => options.length === 5
    && options.map(({ label }) => label).join('') === 'ABCDE'
    && 'ABCDE'.includes(correct_option)));
});

test('cada questão aponta para microconhecimento autorizado e explica todos os distratores', async () => {
  const readiness = JSON.parse(await readFile(new URL('source-readiness.v1.json', root), 'utf8'));
  const allowed = new Set(readiness.entries.filter(({ authoring_allowed }) => authoring_allowed)
    .map(({ microknowledge_id }) => microknowledge_id));
  const batch = buildPilotBatch();
  for (const question of batch.questions) {
    assert.ok(allowed.has(question.primary_microknowledge_id));
    assert.deepEqual(Object.keys(question.explanation.option_analysis), ['A', 'B', 'C', 'D', 'E']);
    assert.ok(question.source_references.length >= 1);
    assert.equal(question.status, 'rascunho_revisar');
  }
  assert.equal(batch.validation.reviewed, false);
  assert.ok(batch.validation.blocking_errors.length);
});
