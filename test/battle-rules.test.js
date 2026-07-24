import test from 'node:test';
import assert from 'node:assert/strict';

import {
  answerQuestion,
  applyStudyStreak,
} from '../app/js/core/battle.js';

function battleSession(answers) {
  return {
    questions: answers.map((correct_answer, index) => ({
      id: `q_${index}`,
      format: 'certo_errado',
      correct_answer,
      explanation: 'Teste',
      statement: `Questão ${index + 1}`,
    })),
    index: 0,
    correct: 0,
    answered: 0,
    combo: 0,
    maxCombo: 0,
    monsterHp: 100,
    playerHp: 100,
    finished: false,
    results: [],
  };
}

function player(overrides = {}) {
  return {
    streak_days: 0,
    last_study_date: null,
    streak_embers: false,
    rescue_missions_pending: 0,
    ...overrides,
  };
}

test('dez acertos mantêm combo visual sem conceder XP', () => {
  const session = battleSession(Array(10).fill(true));
  let lastResult;

  for (let i = 0; i < 10; i++) {
    lastResult = answerQuestion(session, true);
  }

  assert.equal(session.correct, 10);
  assert.equal(session.combo, 10);
  assert.equal(session.maxCombo, 10);
  assert.equal(session.comboXp, undefined);
  assert.equal(session.xpEarned, undefined);
  assert.equal(session.monsterHp, 0);
  assert.equal(lastResult.critical, true);
  assert.equal(session.finished, true);
});

test('erro zera o combo e reduz o HP visual do jogador', () => {
  const session = battleSession([true, false]);
  answerQuestion(session, true);
  const result = answerQuestion(session, true);

  assert.equal(result.correct, false);
  assert.equal(session.combo, 0);
  assert.equal(session.maxCombo, 1);
  assert.equal(session.playerHp, 92);
});

test('primeiro dia de estudo inicia sequência em um', () => {
  const result = applyStudyStreak(player(), '2026-07-13', '2026-07-12');
  assert.equal(result.streak_days, 1);
  assert.equal(result.last_study_date, '2026-07-13');
});

test('estudo em dia consecutivo incrementa a sequência', () => {
  const result = applyStudyStreak(player({
    streak_days: 4,
    last_study_date: '2026-07-12',
  }), '2026-07-13', '2026-07-12');

  assert.equal(result.streak_days, 5);
  assert.equal(result.streak_embers, false);
});

test('dia perdido reinicia a sequência atual e preserva o recorde', () => {
  const result = applyStudyStreak(player({
    streak_days: 4,
    best_streak: 7,
    last_study_date: '2026-07-10',
  }), '2026-07-13', '2026-07-12');

  assert.equal(result.streak_days, 1);
  assert.equal(result.best_streak, 7);
  assert.equal(result.streak_embers, false);
  assert.equal(result.rescue_missions_pending, 0);
  assert.equal(result.last_study_date, '2026-07-13');
});

test('dia consecutivo elimina estado legado de brasas sem duplicar sequência', () => {
  const result = applyStudyStreak(player({
    streak_days: 4,
    last_study_date: '2026-07-12',
    streak_embers: true,
    rescue_missions_pending: 1,
  }), '2026-07-13', '2026-07-12');

  assert.equal(result.streak_days, 5);
  assert.equal(result.streak_embers, false);
  assert.equal(result.rescue_missions_pending, 0);
});

test('nova batalha no mesmo dia não altera sequência nem resgate', () => {
  const result = applyStudyStreak(player({
    streak_days: 4,
    last_study_date: '2026-07-13',
    streak_embers: true,
    rescue_missions_pending: 1,
  }), '2026-07-13', '2026-07-12');

  assert.equal(result.streak_days, 4);
  assert.equal(result.streak_embers, true);
  assert.equal(result.rescue_missions_pending, 1);
});
