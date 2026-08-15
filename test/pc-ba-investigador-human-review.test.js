import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildHumanReview } from '../scripts/generate-pc-ba-investigador-human-review.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftDir = path.join(root, 'course-drafts', 'pc-ba-2026-investigador');
const recommendations = new Set([
  'keep', 'merge_candidate', 'split_candidate', 'rename_candidate',
  'source_required', 'human_decision_required',
]);
const requiredReviewFields = [
  'microknowledge_id', 'discipline', 'topic', 'subtopic', 'fragment',
  'knowledge_name', 'student_must_know', 'student_must_be_able_to',
  'common_misconceptions', 'assessment_dimensions', 'complexity',
  'review_reasons', 'recommendation', 'decision_status',
];

async function bytes(relative) {
  return readFile(path.join(draftDir, relative));
}

async function json(relative) {
  return JSON.parse((await bytes(relative)).toString('utf8'));
}

async function rebuild() {
  const matrixBytes = await bytes('knowledge-coverage-matrix.v1.json');
  const exceptionsBytes = await bytes('knowledge-coverage-exceptions.json');
  return buildHumanReview({
    matrix: JSON.parse(matrixBytes.toString('utf8')),
    exceptions: JSON.parse(exceptionsBytes.toString('utf8')),
    boundMap: await json('knowledge-map.bound.v2.json'),
    matrixBytes,
    exceptionsBytes,
  });
}

test('fila humana, estatísticas e baseline são determinísticos', async () => {
  const generated = await rebuild();
  assert.deepEqual(await json('human-review-queue.v1.json'), generated.queue);
  assert.deepEqual(await json('human-review-stats.json'), generated.stats);
  assert.deepEqual(await json('study-plan-hardening-baseline-report.json'), generated.baselineReport);
});

test('inventários preservam integralmente as sete prioridades solicitadas', async () => {
  const queue = await json('human-review-queue.v1.json');
  const inventories = queue.priority_inventories;
  assert.equal(inventories.complex.length, 19);
  assert.equal(inventories.broad_scope.length, 48);
  assert.equal(inventories.apparent_duplicate_groups.length, 96);
  assert.equal(inventories.official_normative_validation.length, 576);
  assert.equal(inventories.dynamic_verified_source.length, 24);
  assert.equal(inventories.moderate.length, 444);
  assert.equal(inventories.simple_atomic_discipline_sample.length, 236);
  assert.deepEqual(queue.review_policy.order.map(({ rank }) => rank), [1, 2, 3, 4, 5, 6, 7]);
});

test('fila deduplicada possui IDs únicos, ordem crescente e todos os motivos', async () => {
  const queue = await json('human-review-queue.v1.json');
  const entries = queue.deduplicated_microknowledge_queue;
  assert.equal(entries.length, 1176);
  assert.equal(new Set(entries.map(({ microknowledge_id }) => microknowledge_id)).size, entries.length);
  for (let index = 1; index < entries.length; index += 1) {
    assert.ok(entries[index - 1].review_priority.rank <= entries[index].review_priority.rank);
  }
  assert.ok(entries.some(({ review_reasons }) => review_reasons.length > 1));
});

test('cada item apresenta o contrato e contexto canônico necessários para revisão', async () => {
  const queue = await json('human-review-queue.v1.json');
  for (const entry of queue.deduplicated_microknowledge_queue) {
    for (const field of requiredReviewFields) assert.ok(Object.hasOwn(entry, field), `${entry.microknowledge_id}: ${field}`);
    assert.ok(entry.discipline.id && entry.discipline.name);
    assert.ok(entry.topic.id && entry.topic.name);
    assert.ok(entry.fragment.id && entry.fragment.name);
    assert.ok(Array.isArray(entry.student_must_know) && entry.student_must_know.length >= 2);
    assert.ok(Array.isArray(entry.student_must_be_able_to) && entry.student_must_be_able_to.length >= 1);
    assert.ok(Array.isArray(entry.common_misconceptions) && entry.common_misconceptions.length >= 1);
    assert.ok(Array.isArray(entry.assessment_dimensions) && entry.assessment_dimensions.length >= 1);
    assert.ok(recommendations.has(entry.recommendation));
    assert.equal(entry.decision_status, 'pending_human_review');
  }
});

test('grupos repetidos são candidatos contextuais sem merge automático', async () => {
  const queue = await json('human-review-queue.v1.json');
  for (const group of queue.priority_inventories.apparent_duplicate_groups) {
    assert.equal(group.recommendation, 'merge_candidate');
    assert.equal(group.action_authorized, false);
    assert.ok(group.members.length > 1);
    assert.ok(group.members.every(({ microknowledge_id }) => microknowledge_id));
    assert.ok(new Set(group.members.map(({ fragment }) => fragment.id)).size > 1);
  }
});

test('amostragem é estratificada e segue a regra determinística declarada', async () => {
  const stats = await json('human-review-stats.json');
  assert.equal(stats.sampling.source_order_preserved, true);
  assert.equal(stats.sampling.policy, '10_percent_rounded_up_with_minimum_5_per_available_discipline_and_complexity');
  for (const stratum of stats.sampling.strata) {
    assert.ok(['simple', 'atomic'].includes(stratum.complexity));
    assert.equal(stratum.target, Math.min(stratum.population, Math.max(5, Math.ceil(stratum.population * 0.1))));
    assert.equal(stratum.selected, stratum.target);
  }
  assert.equal(stats.sampling.strata.reduce((sum, stratum) => sum + stratum.selected, 0), 236);
});

test('matriz de contratos permanece somente como fonte imutável', async () => {
  const matrixBytes = await bytes('knowledge-coverage-matrix.v1.json');
  const queue = await json('human-review-queue.v1.json');
  const matrix = JSON.parse(matrixBytes.toString('utf8'));
  assert.equal(queue.sources.coverage_matrix.sha256, createHash('sha256').update(matrixBytes).digest('hex'));
  assert.equal(matrix.entries.length, 2545);
  assert.ok(matrix.entries.every(({ question_generation_status }) => question_generation_status === 'blocked'));
  assert.equal(queue.operational_safety.contracts_changed, false);
});

test('nenhuma decisão, questão ou ação operacional foi autorizada', async () => {
  const queue = await json('human-review-queue.v1.json');
  const stats = await json('human-review-stats.json');
  assert.ok(Object.values(queue.operational_safety).every((value) => value === false));
  assert.equal(stats.decisions_applied, 0);
  assert.equal(stats.contracts_changed, 0);
  assert.equal(stats.questions_generated, 0);
  const serialized = JSON.stringify(queue);
  assert.doesNotMatch(serialized, /"prompt"\s*:/);
  assert.doesNotMatch(serialized, /"correct_answer"\s*:/);
});

test('relatório prova as duas falhas no workspace e no snapshot limpo do HEAD', async () => {
  const report = await json('study-plan-hardening-baseline-report.json');
  assert.equal(report.repository_head, '4951e9dc3451b9cd8ac5a53bfd81301e110ec164');
  assert.equal(report.classification, 'preexisting_at_clean_head');
  assert.deepEqual(report.evidence.workspace_run.result, { tests: 12, passed: 10, failed: 2 });
  assert.deepEqual(report.evidence.clean_head_snapshot_run.result, { tests: 12, passed: 10, failed: 2 });
  assert.equal(report.evidence.clean_head_snapshot_run.pc_ba_phase_files_present, false);
  assert.equal(report.failures.length, 2);
  assert.ok(report.failures.every(({ classification }) => classification === 'preexisting_at_clean_head'));
  assert.equal(report.conclusion.introduced_by_pc_ba_phase_3, false);
  assert.equal(report.conclusion.fix_included_in_phase_3_5, false);
});

test('fila continua isolada de Escrivão, Delegado e runtime PC AL', async () => {
  const queueText = (await bytes('human-review-queue.v1.json')).toString('utf8');
  const catalog = await readFile(path.join(root, 'app', 'js', 'contest', 'contestCatalog.js'), 'utf8');
  assert.doesNotMatch(queueText, /pc_ba_2026_escrivao_policia_civil/);
  assert.doesNotMatch(queueText, /pc_ba_2026_delegado_policia_civil/);
  assert.match(catalog, /id:\s*['"]pc_al_2026['"]/);
  assert.doesNotMatch(catalog, /pc_ba_2026/);
});

test('primeira rodada revisa os 19 complexos apenas como propostas', async () => {
  const proposals = await json('reviews/complex-review-round-1.proposals.json');
  const queue = await json('human-review-queue.v1.json');
  const matrix = await json('knowledge-coverage-matrix.v1.json');
  const expectedIds = new Set(queue.priority_inventories.complex.map(({ microknowledge_id }) => microknowledge_id));
  const proposalIds = new Set(proposals.proposals.map(({ microknowledge_id }) => microknowledge_id));
  assert.equal(proposals.reviewed_microknowledges, 19);
  assert.equal(proposals.proposals.length, 19);
  assert.deepEqual(proposalIds, expectedIds);
  assert.deepEqual(proposals.summary.recommendations, {
    keep: 8,
    merge_candidate: 1,
    split_candidate: 0,
    rename_candidate: 3,
    source_required: 6,
    human_decision_required: 1,
  });
  assert.deepEqual(proposals.summary.complexity_assessment, {
    remain_complex: 7,
    moderate_candidate: 12,
  });
  assert.ok(proposals.proposals.every(({ automatic_action_authorized }) => automatic_action_authorized === false));
  assert.ok(Object.values(proposals.operational_safety).every((value) => value === false));
  assert.ok(matrix.entries.every(({ question_generation_status }) => question_generation_status === 'blocked'));
  const mergeProposal = proposals.proposals.find(({ recommendation }) => recommendation === 'merge_candidate');
  assert.ok(mergeProposal.merge_candidate_with.every((id) => matrix.entries.some(({ microknowledge_id }) => microknowledge_id === id)));
});
