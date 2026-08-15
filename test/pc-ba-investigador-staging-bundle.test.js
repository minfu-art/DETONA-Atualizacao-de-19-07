import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildStagingArtifacts } from '../scripts/build-pc-ba-investigador-staging-bundle.mjs';
import { loadCourseBundle } from '../scripts/course-provisioner/bundle.mjs';

const root = new URL('../course-drafts/pc-ba-2026-investigador/', import.meta.url);

test('bundle de staging preserva currículo e adapta o lote rico sem perder microknowledge_id', async () => {
  const canonical = JSON.parse(await readFile(new URL('sources/curriculum.canonical.json', root), 'utf8'));
  const authoringBatch = JSON.parse(await readFile(new URL('question-authoring/pcba_inv_dadm_08_01_lote_001.v2.json', root), 'utf8'));
  const result = buildStagingArtifacts({ canonical, authoringBatch });
  assert.equal(result.curriculum.roles[0].disciplines.length, 14);
  assert.equal(result.curriculum.roles[0].disciplines.flatMap(({ topics }) => topics).length, 161);
  assert.equal(result.curriculum.roles[0].disciplines.flatMap(({ topics }) => topics)
    .flatMap(({ subtopics }) => subtopics).length, 296);
  assert.equal(result.questions.questions.length, 20);
  assert.ok(result.questions.questions.every(({ primary_microknowledge_id, options, explanation_structured }) => (
    primary_microknowledge_id && options.length === 5 && explanation_structured.option_analysis.E
  )));
});

test('bundle permanece indisponível enquanto o runtime V2 e a revisão editorial não estiverem prontos', async () => {
  const canonical = JSON.parse(await readFile(new URL('sources/curriculum.canonical.json', root), 'utf8'));
  const authoringBatch = JSON.parse(await readFile(new URL('question-authoring/pcba_inv_dadm_08_01_lote_001.v2.json', root), 'utf8'));
  const result = buildStagingArtifacts({ canonical, authoringBatch });
  assert.equal(result.contest.contest.sales_status, 'unavailable');
  assert.equal(result.contest.contest.price_cents, 0);
  assert.equal(result.learningEngine.learning_engine_version, 'knowledge_engine_v2');
  assert.equal(result.learningEngine.runtime_ready, false);
  assert.equal(result.learningEngine.staging_import_allowed, false);
  assert.equal(result.learningEngine.production_publication_allowed, false);
  assert.ok(result.learningEngine.blockers.length >= 4);
});

test('bundle materializado passa no validador local e equilibra gabaritos A-E', async () => {
  const bundle = await loadCourseBundle(fileURLToPath(new URL('staging-bundle/', root)));
  assert.deepEqual(bundle.curriculum.counts, { roles: 1, disciplines: 14, topics: 161, subtopics: 296 });
  assert.equal(bundle.questionCount, 20);
  assert.deepEqual(bundle.distribution, { C: 4, E: 4, A: 4, B: 4, D: 4 });
  assert.equal(bundle.assets.battle_avatar.hasTransparency, true);
  assert.equal(bundle.assets.cover.width, 1536);
});
