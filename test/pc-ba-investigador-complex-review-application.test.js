import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildReviewedMatrix } from '../scripts/apply-pc-ba-investigador-complex-review.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftDir = path.join(root, 'course-drafts', 'pc-ba-2026-investigador');

async function bytes(relative) {
  return readFile(path.join(draftDir, relative));
}

async function json(relative) {
  return JSON.parse((await bytes(relative)).toString('utf8'));
}

async function rebuild() {
  const matrixBytes = await bytes('knowledge-coverage-matrix.v1.json');
  const proposalsBytes = await bytes('reviews/complex-review-round-1.proposals.json');
  return buildReviewedMatrix({
    matrix: JSON.parse(matrixBytes.toString('utf8')),
    proposals: JSON.parse(proposalsBytes.toString('utf8')),
    matrixBytes,
    proposalsBytes,
  });
}

test('aplicação aprovada e artefatos V1.1 são determinísticos', async () => {
  const generated = await rebuild();
  assert.deepEqual(await json('knowledge-coverage-matrix.reviewed.v1.1.json'), generated.reviewedMatrix);
  assert.deepEqual(await json('knowledge-coverage-stats.reviewed.v1.1.json'), generated.stats);
  assert.deepEqual(await json('knowledge-review-queue.reviewed.v1.1.json'), generated.reviewQueue);
  assert.deepEqual(await json('reviews/complex-review-round-1.application-report.json'), generated.applicationReport);
});

test('matriz V1 permanece fonte imutável e identificada por hash', async () => {
  const matrixBytes = await bytes('knowledge-coverage-matrix.v1.json');
  const reviewed = await json('knowledge-coverage-matrix.reviewed.v1.1.json');
  assert.equal(reviewed.parent_source.sha256, createHash('sha256').update(matrixBytes).digest('hex'));
  assert.equal(reviewed.parent_source.artifact, 'knowledge-coverage-matrix.v1.json');
  assert.equal(reviewed.schema_version, 'detona_knowledge_coverage_matrix_reviewed_v1_1');
});

test('2.545 IDs e todos os bindings permanecem idênticos', async () => {
  const original = await json('knowledge-coverage-matrix.v1.json');
  const reviewed = await json('knowledge-coverage-matrix.reviewed.v1.1.json');
  const originalById = new Map(original.entries.map((entry) => [entry.microknowledge_id, entry]));
  assert.equal(reviewed.entries.length, 2545);
  assert.equal(new Set(reviewed.entries.map(({ microknowledge_id }) => microknowledge_id)).size, 2545);
  assert.equal(new Set(reviewed.entries.map(({ fragment_id }) => fragment_id)).size, 420);
  for (const entry of reviewed.entries) {
    const source = originalById.get(entry.microknowledge_id);
    assert.ok(source);
    for (const field of ['discipline_id', 'topic_id', 'subtopic_id', 'fragment_id', 'canonical_scope']) {
      assert.equal(entry[field], source[field]);
    }
  }
});

test('somente os 19 aprovados recebem metadados editoriais', async () => {
  const original = await json('knowledge-coverage-matrix.v1.json');
  const reviewed = await json('knowledge-coverage-matrix.reviewed.v1.1.json');
  const proposals = await json('reviews/complex-review-round-1.proposals.json');
  const proposalIds = new Set(proposals.proposals.map(({ microknowledge_id }) => microknowledge_id));
  const originalById = new Map(original.entries.map((entry) => [entry.microknowledge_id, entry]));
  assert.equal(reviewed.entries.filter(({ editorial_review }) => editorial_review).length, 19);
  for (const entry of reviewed.entries) {
    if (proposalIds.has(entry.microknowledge_id)) {
      assert.equal(entry.editorial_review.status, 'approved_proposal_applied');
    } else {
      assert.deepEqual(entry, originalById.get(entry.microknowledge_id));
    }
  }
});

test('renomes, complexidades e requisitos de fonte aprovados são exatos', async () => {
  const reviewed = await json('knowledge-coverage-matrix.reviewed.v1.1.json');
  const report = await json('reviews/complex-review-round-1.application-report.json');
  assert.equal(report.applied.renamed_microknowledges.length, 3);
  assert.equal(report.applied.complexity_changes.length, 12);
  assert.equal(report.applied.source_requirement_changes.length, 3);
  const names = new Map(reviewed.entries.map((entry) => [entry.microknowledge_id, entry.knowledge_name]));
  assert.equal(names.get('pc_ba_2026_inv_mk_8b8b36d783808b'), 'integração de tabelas, gráficos, planilhas e organogramas em apresentações');
  assert.equal(names.get('pc_ba_2026_inv_mk_954ae40cdb8847'), 'riscos e implicações de segurança associados à Deep Web e à Dark Web');
  assert.equal(names.get('pc_ba_2026_inv_mk_d4ba457a960ed7'), 'implicações médico-legais da cronotanatognose, comoriência e premoriência');
  for (const change of report.applied.source_requirement_changes) {
    const entry = reviewed.entries.find(({ microknowledge_id }) => microknowledge_id === change.microknowledge_id);
    assert.equal(entry.source_requirement, 'official_normative_source');
    assert.equal(entry.normative_status, 'validation_required');
    assert.equal(entry.editorial_status, 'pending_official_source');
  }
});

test('estatísticas e filas refletem a revisão aprovada', async () => {
  const stats = await json('knowledge-coverage-stats.reviewed.v1.1.json');
  const queue = await json('knowledge-review-queue.reviewed.v1.1.json');
  assert.deepEqual(stats.by_complexity, {
    atomic: 822,
    complex: 7,
    moderate: 456,
    simple: 1260,
  });
  assert.deepEqual(queue.summary, {
    editorial_review: 1942,
    official_normative_validation: 579,
    dynamic_source_verification: 24,
    total: 2545,
  });
  assert.equal(stats.totals.human_reviewed, 19);
});

test('merge candidato não remove nem cria microknowledge_id', async () => {
  const reviewed = await json('knowledge-coverage-matrix.reviewed.v1.1.json');
  const report = await json('reviews/complex-review-round-1.application-report.json');
  const candidate = reviewed.entries.find(({ microknowledge_id }) => microknowledge_id === 'pc_ba_2026_inv_mk_3b3541bc03569c');
  assert.deepEqual(candidate.editorial_review.merge_candidate_with, ['pc_ba_2026_inv_mk_9afa6a99e8c965']);
  assert.equal(report.deliberately_not_applied.merge_operations, 0);
  assert.equal(report.deliberately_not_applied.removed_microknowledge_ids, 0);
  assert.equal(report.deliberately_not_applied.created_microknowledge_ids, 0);
});

test('2.545 contratos permanecem bloqueados e nenhuma questão é criada', async () => {
  const reviewed = await json('knowledge-coverage-matrix.reviewed.v1.1.json');
  const stats = await json('knowledge-coverage-stats.reviewed.v1.1.json');
  assert.ok(reviewed.entries.every(({ question_generation_status }) => question_generation_status === 'blocked'));
  assert.ok(Object.values(reviewed.operational_safety).every((value) => value === false));
  assert.equal(stats.totals.question_generation_blocked, 2545);
  assert.equal(stats.totals.questions_generated, 0);
});

test('revisão V1.1 permanece isolada de Escrivão, Delegado e PC AL', async () => {
  const reviewedText = (await bytes('knowledge-coverage-matrix.reviewed.v1.1.json')).toString('utf8');
  const catalog = await readFile(path.join(root, 'app', 'js', 'contest', 'contestCatalog.js'), 'utf8');
  assert.doesNotMatch(reviewedText, /pc_ba_2026_escrivao_policia_civil/);
  assert.doesNotMatch(reviewedText, /pc_ba_2026_delegado_policia_civil/);
  assert.match(catalog, /id:\s*['"]pc_al_2026['"]/);
  assert.doesNotMatch(catalog, /pc_ba_2026/);
});
