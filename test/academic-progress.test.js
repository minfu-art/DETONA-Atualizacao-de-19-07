import test from 'node:test';
import assert from 'node:assert/strict';

import {
  battleActivityRecord,
  battleXpBreakdown,
  focusXpForMinutes,
  grantXpEvent,
} from '../app/js/services/academicProgressService.js';
import { STORES } from '../app/js/core/types.js';

function memoryRepository() {
  const rows = {
    [STORES.player]: [{
      id: 'player_1',
      level: 40,
      mastery_pct: 40,
      xp_level: 1,
      xp: 0,
      edital_completion_pct: 0,
    }],
    [STORES.meta]: [],
  };
  const keyFor = (store, value) => store === STORES.meta ? value.key : value.id;
  return {
    rows,
    async getAll(store) {
      return rows[store] || [];
    },
    async getById(store, id) {
      return (rows[store] || []).find((value) => keyFor(store, value) === id) || null;
    },
    async put(store, value) {
      rows[store] ||= [];
      const key = keyFor(store, value);
      const index = rows[store].findIndex((item) => keyFor(store, item) === key);
      if (index >= 0) rows[store][index] = structuredClone(value);
      else rows[store].push(structuredClone(value));
      return value;
    },
  };
}

test('catálogo oficial de XP calcula batalha sem misturar LV acadêmico', () => {
  assert.deepEqual(battleXpBreakdown({
    correct: 8,
    maxCombo: 5,
    dailyGoalCompleted: false,
  }), {
    correctAnswers: 80,
    battleCompleted: 25,
    combo: 30,
    dailyGoal: 0,
    total: 135,
  });
  assert.equal(focusXpForMinutes(14), 0);
  assert.equal(focusXpForMinutes(15), 20);
  assert.equal(focusXpForMinutes(30), 45);
  assert.equal(focusXpForMinutes(60), 100);
});

test('journal de XP impede recompensa duplicada no retry', async () => {
  const repository = memoryRepository();
  const first = await grantXpEvent({
    eventId: 'battle:one',
    type: 'official_battle_completed',
    amount: 135,
    occurredAt: '2026-07-23T12:00:00.000Z',
  }, { repository });
  const retry = await grantXpEvent({
    eventId: 'battle:one',
    type: 'official_battle_completed',
    amount: 135,
    occurredAt: '2026-07-23T12:00:01.000Z',
  }, { repository });

  assert.equal(first.granted, true);
  assert.equal(retry.granted, false);
  assert.equal(repository.rows[STORES.player][0].level, 40);
  assert.equal(repository.rows[STORES.player][0].xp_level, 2);
  assert.equal(repository.rows[STORES.player][0].xp, 35);
  assert.deepEqual(repository.rows[STORES.player][0].processed_xp_event_ids, ['battle:one']);
});

test('atividade acadêmica registra tempo, disciplina e subtópico da batalha', () => {
  const record = battleActivityRecord({
    battleId: 'b-1',
    disciplineId: 'port',
    subtopicId: 'port_1',
    startedAt: '2026-07-23T12:00:00.000Z',
    finishedAt: '2026-07-23T12:20:00.000Z',
    activeSeconds: 1200,
  });
  assert.equal(record.durationSeconds, 1200);
  assert.equal(record.subjectId, 'port');
  assert.equal(record.subtopicId, 'port_1');
  assert.equal(record.valid, true);
  assert.equal(record.source, 'official_battle');
});
