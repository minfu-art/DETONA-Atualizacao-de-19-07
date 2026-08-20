import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('plano do Mapa Mestre cobre as 14 disciplinas e mantém produção condicionada', async () => {
  const [plan, curriculum] = await Promise.all([
    readJson('master-knowledge-map-plan.v1.json'),
    readJson('course-bundle/curriculum.json'),
  ]);
  const role = curriculum.roles[0];
  const byName = new Map(role.disciplines.map((discipline) => [discipline.name, discipline]));
  assert.equal(plan.identity.contest_id, curriculum.contest_id);
  assert.equal(plan.discipline_plan.length, role.disciplines.length);
  for (const item of plan.discipline_plan) {
    const discipline = byName.get(item.name);
    assert.ok(discipline, `Disciplina ausente no currículo: ${item.name}`);
    assert.equal(item.topics, discipline.topics.length);
    assert.equal(item.subtopics, discipline.topics.flatMap((topic) => topic.subtopics).length);
    assert.ok(item.fragments_range[0] <= item.fragments_range[1]);
    assert.ok(item.microknowledges_range[0] <= item.microknowledges_range[1]);
  }
  const fragmentTotals = plan.discipline_plan.reduce((acc, item) => [acc[0] + item.fragments_range[0], acc[1] + item.fragments_range[1]], [0, 0]);
  const microTotals = plan.discipline_plan.reduce((acc, item) => [acc[0] + item.microknowledges_range[0], acc[1] + item.microknowledges_range[1]], [0, 0]);
  assert.deepEqual(fragmentTotals, [plan.planning_range.learning_fragments_min, plan.planning_range.learning_fragments_max]);
  assert.deepEqual(microTotals, [plan.planning_range.microknowledges_min, plan.planning_range.microknowledges_max]);
  assert.equal(plan.acceptance_criteria.canonical_subtopics_covered, 246);
  assert.equal(plan.critical_reconciliation.question_generation_blocked_until_complete, true);
  assert.equal(plan.operational_safety.source_ingestion_completed, true);
  assert.equal(plan.operational_safety.question_generation_authorized, true);
  assert.equal(plan.operational_safety.question_generation_scope, 'noncritical_or_officially_reconciled_content_only');
  assert.equal(plan.operational_safety.import_authorized, false);
  assert.equal(plan.operational_safety.publication_authorized, false);
});
