/**
 * Questões DEMO fora do banco utilizável.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isDemoQuestion, isQuestionEligible } from '../js/core/questionSchema.js';
import { buildDemoQuestions, buildSeedEntities } from '../js/data/editalSeed.js';
import { createQuestionRepository } from '../js/repositories/questionRepository.js';

test('isDemoQuestion detecta id, enunciado e flags', () => {
  assert.equal(isDemoQuestion({ id: 'demo_port_1_0', statement: 'x', options: ['C', 'E'], correct_answer: true }), true);
  assert.equal(isDemoQuestion({ id: 'real_1', statement: '[DEMO 1] algo', options: ['C', 'E'], correct_answer: true }), true);
  assert.equal(isDemoQuestion({ id: 'real_2', statement: 'Questão real', is_demo: true }), true);
  assert.equal(isDemoQuestion({ id: 'real_3', statement: 'Questão real', metadata: { demo: true } }), true);
  assert.equal(isDemoQuestion({ id: 'q_ok', statement: 'Conteúdo real CEBRASPE', options: ['Certo', 'Errado'], correct_answer: true }), false);
});

test('demo nunca é elegível para batalha/contagem', () => {
  const { subtopics } = buildSeedEntities();
  const demos = buildDemoQuestions(subtopics);
  for (const d of demos.slice(0, 20)) {
    assert.equal(isQuestionEligible({
      ...d,
      situacao: 'ativa',
      statement: d.statement,
      options: d.options,
      correct_answer: d.correct_answer,
    }), false);
  }
});

test('repositório listar exclui demo por padrão', async () => {
  const legacy = [
    { id: 'demo_x_0', statement: '[DEMO] x', subtopic_id: 'port_1', questionSource: 'legacy' },
    { id: 'real_leg', statement: 'Real legado', subtopic_id: 'port_1', questionSource: 'legacy' },
  ];
  const repo = createQuestionRepository({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ disciplinas: [] }),
    }),
    legacyLoader: async () => legacy,
    modeLoader: () => 'legacy',
  });
  const normal = await repo.listar();
  assert.deepEqual(normal.map((q) => q.id), ['real_leg']);
  const withDemo = await repo.listar({ includeDemo: true });
  assert.equal(withDemo.length, 2);
});
