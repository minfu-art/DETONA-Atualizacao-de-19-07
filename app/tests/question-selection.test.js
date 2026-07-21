import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_QUESTION_COUNT, questionPriority, selectIntelligentQuestions,
} from '../js/core/questionSelection.js';

const now = new Date('2026-07-15T12:00:00.000Z');
const daysAgo = (days) => new Date(now.getTime() - days * 86400000).toISOString();
const question = (id, subtopic = 'sub_1') => ({
  id, subtopic_id: subtopic, situacao: 'ativa', format: 'certo_errado',
  statement: `Questão ${id}`, options: ['Certo', 'Errado'], correct_answer: true,
});

test('prioridade segue inéditas, antigas, erradas, corretas antigas e recentes', () => {
  const history = {
    antiga: { attempts: 1, lastAnsweredAt: daysAgo(40), lastCorrect: true },
    errada: { attempts: 1, lastAnsweredAt: daysAgo(2), lastCorrect: false, incorrectCount: 1 },
    correta_antiga: { attempts: 1, lastAnsweredAt: daysAgo(10), lastCorrect: true },
    recente: { attempts: 1, lastAnsweredAt: daysAgo(1), lastCorrect: true },
  };
  assert.deepEqual([
    questionPriority(question('inedita'), history, now).tier,
    questionPriority(question('antiga'), history, now).tier,
    questionPriority(question('errada'), history, now).tier,
    questionPriority(question('correta_antiga'), history, now).tier,
    questionPriority(question('recente'), history, now).tier,
  ], [1, 2, 3, 4, 5]);
});

test('seleção inteligente retorna dez questões únicas do subtópico', () => {
  const pool = Array.from({ length: 30 }, (_, index) => question(`q_${index}`));
  pool.push(question('q_0'));
  pool.push(question('intrusa', 'sub_2'));
  const selected = selectIntelligentQuestions(pool, {}, CHALLENGE_QUESTION_COUNT, now, 'sub_1', () => 0);
  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map((item) => item.id)).size, 10);
  assert.ok(selected.every((item) => item.subtopic_id === 'sub_1'));
});

test('questões nunca respondidas vêm antes das já vistas', () => {
  const pool = [question('vista'), question('nova_1'), question('nova_2')];
  const selected = selectIntelligentQuestions(pool, {
    vista: { attempts: 2, lastAnsweredAt: daysAgo(50), lastCorrect: false, incorrectCount: 2 },
  }, 3, now, 'sub_1', () => 0);
  assert.deepEqual(selected.map((item) => item.id), ['nova_1', 'nova_2', 'vista']);
});

test('questões empatadas na mesma prioridade são sorteadas', () => {
  const pool = [question('q_a'), question('q_b'), question('q_c')];
  const randomValues = [0.9, 0.1, 0.5];
  const selected = selectIntelligentQuestions(pool, {}, 3, now, 'sub_1', () => randomValues.shift());
  assert.deepEqual(selected.map((item) => item.id), ['q_b', 'q_c', 'q_a']);
});
