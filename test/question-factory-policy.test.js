import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_POLICY,
  buildCoverage,
  planContracts,
} from '../scripts/question-factory/core.mjs';

const policyUrl = new URL('../scripts/question-factory/policies/default.json', import.meta.url);

function fixtureBundle() {
  return {
    course: {
      contest_id: 'fixture_2026',
      position_id: 'fixture_role',
      offering_id: 'fixture_offering',
      slug: 'fixture-course',
      name: 'Fixture Course',
    },
    editalMap: [
      {
        subtopic_id: 'sub_simple',
        rules: [], exceptions: [], applications: [], competencies: [], required_knowledge: [],
      },
      {
        subtopic_id: 'sub_standard',
        rules: ['r1', 'r2'], exceptions: [], applications: [], competencies: [], required_knowledge: [],
      },
      {
        subtopic_id: 'sub_complex',
        rules: [], exceptions: ['e1', 'e2'], applications: [], competencies: [], required_knowledge: [],
      },
    ],
    microknowledges: [
      { id: 'mk_simple', subtopic_id: 'sub_simple', title: 'Conhecimento simples' },
      { id: 'mk_standard', subtopic_id: 'sub_standard', title: 'Conhecimento padrão' },
      { id: 'mk_complex', subtopic_id: 'sub_complex', title: 'Conhecimento complexo' },
    ],
    questions: [],
  };
}

test('política canônica e fallback JS permanecem sincronizados em 1/2/3', async () => {
  const configured = JSON.parse(await readFile(policyUrl, 'utf8'));
  assert.equal(configured.strategy, 'coverage_first');
  assert.deepEqual(configured.targets, { simple: 1, standard: 2, complex: 3 });
  assert.deepEqual(DEFAULT_POLICY.targets, configured.targets);
  assert.equal(DEFAULT_POLICY.strategy, configured.strategy);
  assert.deepEqual(DEFAULT_POLICY.coverage_sequence.slice(0, 3), ['conceito', 'aplicacao', 'excecao']);
  assert.deepEqual(DEFAULT_POLICY.coverage_sequence, configured.coverage_sequence);
});

test('coverage-first exige 1/2/3 questões conforme complexidade', () => {
  const rows = buildCoverage(fixtureBundle(), DEFAULT_POLICY);
  const byId = new Map(rows.map((row) => [row.microknowledge_id, row]));
  assert.equal(byId.get('mk_simple').complexity, 'simple');
  assert.equal(byId.get('mk_simple').target, 1);
  assert.equal(byId.get('mk_standard').complexity, 'standard');
  assert.equal(byId.get('mk_standard').target, 2);
  assert.equal(byId.get('mk_complex').complexity, 'complex');
  assert.equal(byId.get('mk_complex').target, 3);
});

test('planejamento prioriza amplitude antes de aprofundar o mesmo microconhecimento', () => {
  const plan = planContracts(fixtureBundle(), { limit: 3, policy: DEFAULT_POLICY });
  assert.equal(plan.planned, 3);
  assert.equal(new Set(plan.contracts.map(({ microknowledge_id: id }) => id)).size, 3);
  assert.ok(plan.contracts.every(({ ordinal_for_microknowledge: ordinal }) => ordinal === 1));
  assert.ok(plan.contracts.every(({ coverage_dimension: dimension }) => dimension === 'conceito'));
});
