import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('course-drafts/pc-pe-2026-agente');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('plano do Mapa Mestre cobre as 11 disciplinas sem autorizar produção', async () => {
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
  assert.equal(plan.acceptance_criteria.canonical_subtopics_covered, 188);
  assert.equal(plan.operational_safety.question_generation_authorized, false);
  assert.equal(plan.operational_safety.import_authorized, false);
  assert.equal(plan.operational_safety.publication_authorized, false);
});
