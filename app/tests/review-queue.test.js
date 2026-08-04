import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyReviewEvent, applyReviewHistoryToSubtopic, calculateNextReviewAt,
  calculateReviewPriority, createReviewItem, migrateLegacyReviewItems,
  selectReviewItems,
} from '../js/core/reviewQueue.js';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const input = (id = 'q1', contestId = 'pc_al') => ({
  questionId: id, contestId, subtopicId: 'sub1', disciplineId: 'disc1', difficulty: 'media', source: 'bank',
});
const question = (id = 'q1') => ({
  id, subtopic_id: 'sub1', topicoEditalId: 'sub1', disciplina: 'disc1', statement: `Questão ${id}`,
  format: 'certo_errado', options: ['Certo', 'Errado'], correct_answer: true, situacao: 'ativa',
});
const selectionContext = (ids, overrides = {}) => ({
  questions: ids.map(question),
  subtopics: [{ id: 'sub1', discipline_id: 'disc1' }],
  contestId: 'pc_al',
  isQuestionEligible: () => true,
  ...overrides,
});

test('erro adiciona questão à revisão', () => {
  const item = applyReviewEvent(null, input(), { now: NOW, correct: false, reason: 'incorrect', subtopicMastery: 100 });
  assert.equal(item.questionId, 'q1');
  assert.equal(item.errorCount, 1);
  assert.equal(item.memoryState, 'quente');
  assert.equal(new Date(item.nextReviewAt) - NOW, 86400000);
});

test('erro repetido atualiza o mesmo item sem criar duplicata lógica', () => {
  const first = applyReviewEvent(null, input(), { now: NOW, correct: false, reason: 'incorrect' });
  const repeated = applyReviewEvent(first, input(), { now: new Date(NOW.getTime() + 1000), correct: false, reason: 'incorrect' });
  assert.equal(repeated.questionId, first.questionId);
  assert.equal(repeated.errorCount, 2);
  assert.equal(repeated.reviewHistory.length, 2);
});

test('erro repetido aumenta prioridade', () => {
  const first = applyReviewEvent(null, input(), { now: NOW, correct: false, reason: 'incorrect', subtopicMastery: 50 });
  const repeated = applyReviewEvent(first, input(), { now: NOW, correct: false, reason: 'incorrect', subtopicMastery: 50 });
  assert.ok(repeated.priorityScore > first.priorityScore);
});

test('acerto após erro muda estado para morna', () => {
  const hot = applyReviewEvent(null, input(), { now: NOW, correct: false, reason: 'incorrect' });
  const warm = applyReviewEvent(hot, input(), { now: NOW, correct: true, isReview: true });
  assert.equal(warm.memoryState, 'morna');
  assert.equal(warm.correctAfterErrorCount, 1);
});

test('sequência de acertos avança quente para morna, fria e congelada', () => {
  let item = applyReviewEvent(null, input(), { now: NOW, correct: false, reason: 'incorrect' });
  const states = [];
  for (let index = 0; index < 5; index += 1) {
    item = applyReviewEvent(item, input(), { now: new Date(NOW.getTime() + (index + 1) * 86400000), correct: true, isReview: true });
    states.push(item.memoryState);
  }
  assert.deepEqual(states, ['morna', 'fria', 'fria', 'fria', 'congelada']);
  assert.equal(item.status, 'frozen');
});

test('novo erro reaquece questão consolidada', () => {
  let item = { ...createReviewItem(input(), { now: NOW, reason: 'incorrect' }), consecutiveCorrect: 5, memoryState: 'congelada', status: 'frozen' };
  item = applyReviewEvent(item, input(), { now: NOW, correct: false, reason: 'incorrect' });
  assert.equal(item.memoryState, 'quente');
  assert.equal(item.status, 'scheduled');
  assert.equal(item.consecutiveCorrect, 0);
});

test('agendamento usa um dia civil após erro inicial ou recorrente', () => {
  const first = calculateNextReviewAt({ errorCount: 0, difficulty: 3 }, { now: NOW, correct: false, subtopicMastery: 100 });
  const recurrent = calculateNextReviewAt({ errorCount: 1, difficulty: 3 }, { now: NOW, correct: false, subtopicMastery: 100 });
  assert.equal(new Date(first) - NOW, 86400000);
  assert.equal(new Date(recurrent) - NOW, 86400000);
});

test('agendamento de acertos preserva o calendário 6, 15 e 30 dias', () => {
  const days = [0, 1, 2, 3, 4].map((consecutiveCorrect) =>
    (new Date(calculateNextReviewAt({ consecutiveCorrect, errorCount: 0, difficulty: 3 }, { now: NOW, correct: true, subtopicMastery: 100 })) - NOW) / 86400000);
  assert.deepEqual(days, [6, 15, 30, 30, 30]);
});

test('priorityScore favorece vencidas, recorrentes, difíceis e baixo domínio', () => {
  const base = { ...createReviewItem(input(), { now: NOW, reason: 'incorrect' }), nextReviewAt: '2026-07-16T12:00:00.000Z' };
  const low = calculateReviewPriority(base, { now: NOW, subtopicMastery: 90 });
  const high = calculateReviewPriority({ ...base, nextReviewAt: '2026-07-14T12:00:00.000Z', errorCount: 4, difficulty: 5 }, { now: NOW, subtopicMastery: 20 });
  assert.ok(high > low);
});

test('seleção respeita vencimento e prioridade', () => {
  const future = { ...createReviewItem(input('future'), { now: NOW, reason: 'incorrect' }), nextReviewAt: '2026-07-20T12:00:00.000Z' };
  const due = { ...createReviewItem(input('due'), { now: NOW, reason: 'incorrect' }), nextReviewAt: '2026-07-14T12:00:00.000Z' };
  const selected = selectReviewItems([future, due], { ...selectionContext(['future', 'due']), now: NOW, masteryBySubtopic: { sub1: 50 } });
  assert.equal(selected[0].questionId, 'due');
});

test('sessão limita dez e não repete questão', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ ...createReviewItem(input(`q${index}`), { now: NOW, reason: 'incorrect' }), nextReviewAt: NOW.toISOString() }));
  items.push(structuredClone(items[0]));
  const selected = selectReviewItems(items, { ...selectionContext(Array.from({ length: 12 }, (_, index) => `q${index}`)), now: NOW, limit: 10 });
  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map((item) => item.questionId)).size, 10);
});

test('sessão não mistura concursos', () => {
  const selected = selectReviewItems([
    { ...createReviewItem(input('pc', 'pc_al'), { now: NOW, reason: 'incorrect' }), nextReviewAt: NOW.toISOString() },
    createReviewItem(input('pf', 'pf'), { now: NOW, reason: 'incorrect' }),
  ], { ...selectionContext(['pc', 'pf']), now: NOW });
  assert.deepEqual(selected.map((item) => item.questionId), ['pc']);
});

test('revisão atualiza histórico sem alterar LV nem domínio oficial', () => {
  const subtopic = { id: 'sub1', best_accuracy: 80, stars: 4, attempts_count: 3, level: 22, question_history: {} };
  const next = applyReviewHistoryToSubtopic(subtopic, { questionId: 'q1', correct: true, at: NOW.toISOString(), memoryState: 'morna' });
  assert.equal(next.best_accuracy, 80);
  assert.equal(next.stars, 4);
  assert.equal(next.attempts_count, 3);
  assert.equal(next.level, 22);
  assert.equal(next.question_history.q1.reviewAttempts, 1);
});

test('migração preserva IDs e datas antigas sem inventar tentativas', () => {
  const migrated = migrateLegacyReviewItems([{
    id: 'sub1', discipline_id: 'disc1', best_accuracy: 40,
    review_question_ids: ['q1'], question_history: { q1: { lastAnsweredAt: '2026-07-01T10:00:00.000Z', incorrectCount: 3 } },
  }], [{ ...question('q1'), dificuldade: 'dificil' }], { contestId: 'pc_al', now: NOW, isQuestionEligible: () => true });
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].source, 'migration');
  assert.equal(migrated[0].lastErrorAt, '2026-07-01T10:00:00.000Z');
  assert.equal(migrated[0].errorCount, 3);
  assert.deepEqual(migrated[0].reviewHistory, []);
});

test('item congelado permanece no histórico e pode ser reativado', () => {
  let item = applyReviewEvent(null, input(), { now: NOW, correct: false, reason: 'incorrect' });
  for (let index = 0; index < 5; index += 1) item = applyReviewEvent(item, input(), { now: NOW, correct: true, isReview: true });
  assert.equal(item.status, 'frozen');
  assert.equal(item.reviewHistory.length, 6);
  const reheated = applyReviewEvent(item, input(), { now: NOW, correct: false, reason: 'incorrect' });
  assert.equal(reheated.status, 'scheduled');
  assert.equal(reheated.reviewHistory.length, 7);
});
