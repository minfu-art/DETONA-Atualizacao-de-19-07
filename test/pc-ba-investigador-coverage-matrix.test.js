import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCoverageMatrix } from '../scripts/generate-pc-ba-investigador-coverage-matrix.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftDir = path.join(root, 'course-drafts', 'pc-ba-2026-investigador');
const requiredFields = [
  'knowledge_name',
  'knowledge_type',
  'canonical_scope',
  'discipline_id',
  'topic_id',
  'subtopic_id',
  'fragment_id',
  'microknowledge_id',
  'student_must_know',
  'student_must_be_able_to',
  'prerequisites',
  'common_misconceptions',
  'assessment_dimensions',
  'question_roles',
  'complexity',
  'source_requirement',
  'editorial_status',
  'normative_status',
  'dynamic_status',
  'question_generation_status',
  'recommended_minimum_exposures',
  'recommended_question_diversity',
  'requires_case_question',
  'requires_exception_question',
  'requires_integration_question',
];

async function bytes(relative) {
  return readFile(path.join(draftDir, relative));
}

async function json(relative) {
  return JSON.parse((await bytes(relative)).toString('utf8'));
}

async function rebuild() {
  const boundMapBytes = await bytes('knowledge-map.bound.v2.json');
  return buildCoverageMatrix({
    boundMap: JSON.parse(boundMapBytes.toString('utf8')),
    bundle: await json('bundle.draft.json'),
    boundMapBytes,
  });
}

function flattenBoundMap(map) {
  return map.disciplines
    .flatMap((discipline) => discipline.fragments)
    .flatMap((fragment) => fragment.microknowledges);
}

test('matriz de cobertura e relatórios são determinísticos', async () => {
  const generated = await rebuild();
  assert.deepEqual(await json('knowledge-coverage-matrix.v1.json'), generated.matrix);
  assert.deepEqual(await json('knowledge-coverage-stats.json'), generated.stats);
  assert.deepEqual(await json('knowledge-review-queue.json'), generated.reviewQueue);
  assert.deepEqual(await json('knowledge-coverage-exceptions.json'), generated.exceptions);
});

test('matriz contém 2.545 contratos completos e IDs únicos em 420 fragmentos', async () => {
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  assert.equal(matrix.entries.length, 2545);
  assert.equal(new Set(matrix.entries.map(({ microknowledge_id }) => microknowledge_id)).size, 2545);
  assert.equal(new Set(matrix.entries.map(({ fragment_id }) => fragment_id)).size, 420);
  assert.equal(new Set(matrix.entries.map(({ discipline_id }) => discipline_id)).size, 14);
  assert.equal(new Set(matrix.entries.map(({ topic_id }) => topic_id)).size, 161);
  assert.equal(new Set(matrix.entries.map(({ subtopic_id }) => subtopic_id).filter(Boolean)).size, 296);
  for (const entry of matrix.entries) {
    for (const field of requiredFields) assert.ok(Object.hasOwn(entry, field), `${entry.microknowledge_id}: ${field}`);
    assert.ok(entry.student_must_know.length >= 2);
    assert.ok(entry.student_must_be_able_to.length >= 1 && entry.student_must_be_able_to.length <= 4);
    assert.ok(entry.common_misconceptions.length >= 1);
  }
});

test('IDs e bindings canônicos são cópias exatas da Fase 2', async () => {
  const source = flattenBoundMap(await json('knowledge-map.bound.v2.json'));
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  const byId = new Map(source.map((item) => [item.microknowledge_id, item]));
  for (const entry of matrix.entries) {
    const original = byId.get(entry.microknowledge_id);
    assert.ok(original);
    assert.equal(entry.discipline_id, original.discipline_id);
    assert.equal(entry.topic_id, original.topic_id);
    assert.equal(entry.subtopic_id, original.subtopic_id);
    assert.equal(entry.fragment_id, original.fragment_id);
    assert.equal(entry.canonical_scope, original.canonical_scope);
    assert.equal(entry.provenance.canonical_binding_method, original.canonical_binding_method);
    assert.equal(entry.provenance.canonical_binding_confidence, original.canonical_binding_confidence);
  }
});

test('fonte da Fase 2 é referenciada por hash e não é alterada', async () => {
  const sourceBytes = await bytes('knowledge-map.bound.v2.json');
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  assert.equal(matrix.source.sha256, createHash('sha256').update(sourceBytes).digest('hex'));
  assert.equal(matrix.source.artifact, 'knowledge-map.bound.v2.json');
});

test('competências são selecionadas da fonte sem atribuição indiscriminada', async () => {
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  let reducedSelections = 0;
  for (const entry of matrix.entries) {
    const sourceCompetencies = entry.provenance.source_competencies;
    assert.ok(entry.student_must_be_able_to.every((ability) => sourceCompetencies.includes(ability)));
    assert.ok(entry.student_must_be_able_to.length <= 4);
    if (entry.student_must_be_able_to.length < sourceCompetencies.length) reducedSelections += 1;
  }
  assert.equal(reducedSelections, 2545);
});

test('planejamento usa somente dimensões, papéis e complexidades permitidos', async () => {
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  const dimensions = new Set([
    'recognition', 'conceptual_understanding', 'application', 'discrimination',
    'exception_handling', 'case_analysis', 'calculation', 'interpretation',
  ]);
  const roles = new Set(['diagnostic', 'teaching', 'reinforcement', 'retention', 'discrimination', 'integration']);
  const complexities = new Set(['atomic', 'simple', 'moderate', 'complex']);
  for (const entry of matrix.entries) {
    assert.ok(entry.assessment_dimensions.every((value) => dimensions.has(value)));
    assert.ok(entry.question_roles.every((value) => roles.has(value)));
    assert.ok(complexities.has(entry.complexity));
    assert.ok(entry.recommended_minimum_exposures >= 2 && entry.recommended_minimum_exposures <= 6);
    assert.ok(entry.recommended_question_diversity >= 2 && entry.recommended_question_diversity <= 5);
  }
  assert.equal(new Set(matrix.entries.map(({ complexity }) => complexity)).size, 4);
  assert.ok(new Set(matrix.entries.map(({ recommended_minimum_exposures }) => recommended_minimum_exposures)).size > 1);
});

test('as três categorias pendentes e requisitos de fonte são preservados', async () => {
  const stats = await json('knowledge-coverage-stats.json');
  assert.deepEqual(stats.by_source_requirement, {
    dynamic_verified_source: 24,
    official_normative_source: 576,
    provided_map_and_course_sources: 1945,
  });
  assert.deepEqual(stats.by_editorial_status, {
    pending_dynamic_source: 24,
    pending_official_source: 576,
    review_required: 1945,
  });
  assert.equal(stats.totals.question_generation_blocked, 2545);
  assert.equal(stats.totals.questions_generated, 0);
});

test('filas são completas, separadas e sem duplicidade', async () => {
  const review = await json('knowledge-review-queue.json');
  assert.deepEqual(review.summary, {
    editorial_review: 1945,
    official_normative_validation: 576,
    dynamic_source_verification: 24,
    total: 2545,
  });
  const ids = Object.values(review.queues).flatMap((queue) => queue.map(({ microknowledge_id }) => microknowledge_id));
  assert.equal(ids.length, 2545);
  assert.equal(new Set(ids).size, 2545);
});

test('18 unidades penais topic-scoped continuam aceitas sem subtopic_id artificial', async () => {
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  const exceptions = await json('knowledge-coverage-exceptions.json');
  const topicScoped = matrix.entries.filter(({ canonical_scope }) => canonical_scope === 'topic');
  assert.equal(topicScoped.length, 18);
  assert.ok(topicScoped.every(({ subtopic_id }) => subtopic_id === null));
  assert.equal(exceptions.summary.accepted_topic_scoped_microknowledges, 18);
  assert.equal(exceptions.accepted_structural_exceptions[0].affected_fragments.length, 2);
});

test('exceções não mesclam redundâncias aparentes nem inventam pré-requisitos', async () => {
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  const exceptions = await json('knowledge-coverage-exceptions.json');
  assert.ok(exceptions.apparent_redundancies.length > 0);
  assert.ok(exceptions.apparent_redundancies.every(({ status }) => status.includes('no_merge_authorized')));
  assert.equal(exceptions.summary.missing_evaluable_competencies, 0);
  assert.ok(matrix.entries.every(({ prerequisites }) => prerequisites.length === 0));
  assert.equal(exceptions.planning_constraints[0].code, 'PREREQUISITE_GRAPH_NOT_INFERRED');
});

test('nenhuma questão ou autorização operacional é criada', async () => {
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  const bundle = await json('bundle.draft.json');
  const forbiddenQuestionFields = ['prompt', 'stem', 'alternatives', 'options', 'answer', 'correct_answer', 'explanation'];
  for (const entry of matrix.entries) {
    assert.equal(entry.question_generation_status, 'blocked');
    assert.equal(entry.provenance.source_question_generation_allowed, false);
    for (const field of forbiddenQuestionFields) assert.equal(Object.hasOwn(entry, field), false);
  }
  assert.deepEqual(matrix.operational_safety, {
    import_authorized: false,
    publication_authorized: false,
    question_generation_authorized: false,
    production_changes_authorized: false,
  });
  assert.equal(bundle.questions.length, 0);
  assert.ok(Object.values(bundle.authorization).every((value) => value === false));
});

test('artefatos permanecem isolados de Escrivão, Delegado e do runtime PC AL', async () => {
  const matrixText = (await bytes('knowledge-coverage-matrix.v1.json')).toString('utf8');
  const catalog = await readFile(path.join(root, 'app', 'js', 'contest', 'contestCatalog.js'), 'utf8');
  assert.doesNotMatch(matrixText, /pc_ba_2026_escrivao_policia_civil/);
  assert.doesNotMatch(matrixText, /pc_ba_2026_delegado_policia_civil/);
  assert.match(catalog, /id:\s*['"]pc_al_2026['"]/);
  assert.doesNotMatch(catalog, /pc_ba_2026/);
});
