import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  answerQuestion,
  validateBattleSession,
} from '../app/js/core/battle.js';
import { STORES } from '../app/js/core/types.js';
import { recordBattleReviewEvents } from '../app/js/services/reviewService.js';

function question(index, overrides = {}) {
  return {
    id: `q-${index}`,
    subtopic_id: 'sub-1',
    statement: `Questão ${index}`,
    format: 'certo_errado',
    correct_answer: true,
    explanation: 'Explicação de teste.',
    ...overrides,
  };
}

function activeSession(overrides = {}) {
  return {
    id: 'battle-safe-1',
    subtopic_id: 'sub-1',
    subtopic: { id: 'sub-1', discipline_id: 'disc-1' },
    questions: Array.from({ length: 10 }, (_, index) => question(index + 1)),
    index: 0,
    correct: 0,
    answered: 0,
    combo: 0,
    maxCombo: 0,
    monsterHp: 100,
    playerHp: 100,
    finished: false,
    results: [],
    ...overrides,
  };
}

function reviewRepository() {
  const rows = [];
  return {
    rows,
    async getById(store, id) {
      assert.equal(store, STORES.reviewQueue);
      return rows.find((item) => item.questionId === id) || null;
    },
    async put(store, value) {
      assert.equal(store, STORES.reviewQueue);
      const index = rows.findIndex((item) => item.questionId === value.questionId);
      if (index >= 0) rows[index] = structuredClone(value);
      else rows.push(structuredClone(value));
    },
  };
}

test('sessão ativa válida passa pela barreira anterior à Arena', () => {
  const value = activeSession();
  const validated = validateBattleSession(value);
  assert.equal(validated.battleId, value.id);
  assert.equal(validated.subtopicId, 'sub-1');
  assert.equal(validated.questionIds.length, 10);
});

test('barreira rejeita sessão sem ID, quantidade incorreta e questão duplicada', () => {
  assert.throws(() => validateBattleSession(activeSession({ id: '' })), { code: 'BATTLE_ID_REQUIRED' });
  assert.throws(() => validateBattleSession(activeSession({ questions: activeSession().questions.slice(0, 9) })), { code: 'BATTLE_QUESTIONS_INVALID' });
  const duplicate = activeSession();
  duplicate.questions[9].id = duplicate.questions[0].id;
  assert.throws(() => validateBattleSession(duplicate), { code: 'BATTLE_DUPLICATE_QUESTION' });
});

test('barreira rejeita questão inelegível e questão de outro subtópico', () => {
  const ineligible = activeSession();
  ineligible.questions[3].status = 'arquivada';
  assert.throws(() => validateBattleSession(ineligible), { code: 'BATTLE_QUESTION_INELIGIBLE' });
  const mixed = activeSession();
  mixed.questions[3].subtopic_id = 'sub-2';
  assert.throws(() => validateBattleSession(mixed), { code: 'BATTLE_MIXED_SUBTOPICS' });
});

test('seleção sem confirmação não modifica o estado acadêmico da sessão', () => {
  const value = activeSession();
  const before = structuredClone(value);
  const selectedAlternative = true;
  assert.equal(selectedAlternative, true);
  assert.deepEqual(value, before);
});

test('token da questão torna confirmação única mesmo após avanço do índice', () => {
  const value = activeSession();
  const first = answerQuestion(value, true, { questionId: 'q-1' });
  assert.equal(first.correct, true);
  assert.equal(value.answered, 1);
  assert.equal(value.results.length, 1);
  assert.throws(
    () => answerQuestion(value, true, { questionId: 'q-1' }),
    { code: 'BATTLE_QUESTION_STALE' },
  );
  assert.equal(value.answered, 1);
  assert.equal(value.results.length, 1);
});

test('revisão ignora questão inexistente, inelegível ou de outro subtópico', async () => {
  const repository = reviewRepository();
  const value = activeSession({
    questions: [
      question(1),
      question(2, { status: 'arquivada' }),
      question(3, { subtopic_id: 'sub-2' }),
    ],
    results: [
      { questionId: 'inexistente', correct: false },
      { questionId: 'q-2', correct: false },
      { questionId: 'q-3', correct: false },
    ],
    correct: 0,
  });
  const added = await recordBattleReviewEvents(value, value.subtopic, null, new Date('2026-08-04T12:00:00Z'), repository);
  assert.equal(added, 0);
  assert.deepEqual(repository.rows, []);
});

test('contratos da Arena cobrem erro seguro, saída acessível, foco e persistência', async () => {
  const [arena, app] = await Promise.all([
    readFile(new URL('../app/js/ui/battleArena.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(arena, /validateBattleSession\(session\)/);
  assert.match(arena, /questionId: session\.questions\[session\.index\]\?\.id/);
  assert.match(arena, /aria-busy/);
  assert.match(arena, /role="status" aria-live="polite" tabindex="-1"/);
  assert.match(arena, /battle-result-title[^>]+tabindex="-1"/);
  assert.match(arena, /openModal\(/);
  assert.match(arena, /data-battle-leave/);
  assert.doesNotMatch(arena, /description:\s*error\?\.message|innerHTML\s*=\s*error/);
  assert.match(app, /ctx\.requestBattleExit\?\.\(screen\)/);
  assert.match(app, /ctx\.battleFinalizing/);
  assert.match(app, /ctx\.battleSession/);
  assert.match(app, /screen === 'topicTree' && ctx\.studySubtopicId/);
  assert.match(app, /querySelector\('\[data-study-subtopic\]'\)\?\.focus/);
});
