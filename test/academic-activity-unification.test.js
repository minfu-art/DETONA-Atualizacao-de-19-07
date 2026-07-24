import test from 'node:test';
import assert from 'node:assert/strict';
import { STORES } from '../app/js/core/types.js';
import { localDateKey } from '../app/js/core/localDate.js';
import { applyDailyGoalActivity } from '../app/js/services/dailyGoalService.js';
import {
  applyStudyDayToPlayer,
  applyValidStudyDay,
} from '../app/js/services/studyStreakService.js';
import {
  answerReviewQuestion,
  finalizeReviewSession,
} from '../app/js/services/reviewService.js';
import { createReviewItem } from '../app/js/core/reviewQueue.js';
import { setActiveContestId } from '../app/js/contest/activeContest.js';
import {
  collectEmblemMetrics,
  lifetimeXpFromPlayer,
  refreshEmblems,
} from '../app/js/services/emblemService.js';

function keyFor(store, value) {
  if (store === STORES.dailyLogs) return value.date;
  if (store === STORES.meta) return value.key;
  if (store === STORES.studySessions) return value.id;
  if (store === STORES.routines) return value.id || String(value.day_of_week);
  if (store === STORES.subtopics || store === STORES.verticalized || store === STORES.player) return value.id;
  return value.id || value.key || value.questionId;
}

function memoryRepository(seed = {}) {
  const rows = Object.fromEntries(Object.values(STORES).map((store) => [
    store,
    structuredClone(seed[store] || []),
  ]));
  const metaValues = new Map(Object.entries(seed.metaValues || {}));
  return {
    rows,
    metaValues,
    async getAll(store) { return structuredClone(rows[store] || []); },
    async getById(store, id) {
      return structuredClone((rows[store] || []).find((item) => String(keyFor(store, item)) === String(id)) || null);
    },
    async put(store, value) {
      const list = rows[store] || (rows[store] = []);
      const key = keyFor(store, value);
      const index = list.findIndex((item) => String(keyFor(store, item)) === String(key));
      if (index >= 0) list[index] = structuredClone(value);
      else list.push(structuredClone(value));
      return structuredClone(value);
    },
    async putMany(store, values) {
      for (const value of values) await this.put(store, value);
    },
    async getMeta(key) { return structuredClone(metaValues.get(key) ?? null); },
    async setMeta(key, value) {
      metaValues.set(key, structuredClone(value));
      return structuredClone(value);
    },
  };
}

function player(overrides = {}) {
  return {
    id: 'player-1',
    xp: 0,
    xp_level: 1,
    level: 37,
    mastery_pct: 42,
    best_accuracy: 80,
    stars: 4,
    streak_days: 0,
    best_streak: 0,
    last_study_date: null,
    ...overrides,
  };
}

function repoForGoal(goalType, goalAmount = 10, extra = {}) {
  const occurred = new Date(2026, 6, 23, 20, 0, 0);
  return {
    occurred,
    repository: memoryRepository({
      [STORES.player]: [player(extra.player)],
      [STORES.routines]: [{
        id: 'routine',
        day_of_week: occurred.getDay(),
        enabled: true,
        goal_type: goalType,
        goal_amount: goalAmount,
      }],
      ...extra.seed,
    }),
  };
}

function reviewSession(overrides = {}) {
  return {
    id: 'review_123e4567-e89b-12d3-a456-426614174000',
    contestId: 'pc_al_2026',
    items: [{ subtopicId: 's1', disciplineId: 'd1', memoryState: 'fria', nextReviewAt: '2026-07-25T12:00:00Z' }],
    questions: [{ id: 'q1' }],
    index: 0,
    correct: 1,
    errors: 0,
    results: [{
      eventId: 'review:review_123:q1',
      questionId: 'q1',
      correct: true,
      memoryState: 'fria',
      previousMemoryState: 'morna',
    }],
    finished: true,
    startedAt: '2026-07-23T20:00:00.000Z',
    lastActiveAt: '2026-07-23T20:02:00.000Z',
    finishedAt: '2026-07-23T20:02:00.000Z',
    activeSeconds: 120,
    ...overrides,
  };
}

test('1. localDateKey preserva a data civil perto da meia-noite', () => {
  assert.equal(localDateKey(new Date(2026, 6, 23, 23, 59, 59)), '2026-07-23');
  assert.equal(localDateKey(new Date(2026, 6, 24, 0, 0, 1)), '2026-07-24');
});

test('2. batalha em meta de questões acrescenta o total real respondido', async () => {
  const { repository, occurred } = repoForGoal('questoes', 30);
  const result = await applyDailyGoalActivity({
    eventId: 'battle:b1', type: 'battle', questionCount: 10, battleCount: 1, activeMinutes: 3, occurredAt: occurred,
  }, { repository });
  assert.equal(result.completedAmount, 10);
  assert.equal(result.goalType, 'questoes');
});

test('3. batalha em meta de batalhas acrescenta exatamente um', async () => {
  const { repository, occurred } = repoForGoal('batalhas', 3);
  const result = await applyDailyGoalActivity({
    eventId: 'battle:b1', type: 'battle', questionCount: 10, battleCount: 7, activeMinutes: 3, occurredAt: occurred,
  }, { repository });
  assert.equal(result.completedAmount, 1);
});

test('4 e 9. meta de tempo usa minutos ativos e nunca converte questões', async () => {
  const { repository, occurred } = repoForGoal('tempo', 30);
  const result = await applyDailyGoalActivity({
    eventId: 'battle:b1', type: 'battle', questionCount: 10, battleCount: 1, activeMinutes: 4, occurredAt: occurred,
  }, { repository });
  assert.equal(result.completedAmount, 4);
  assert.notEqual(result.completedAmount, 10);
});

test('5. revisão em meta de questões usa a quantidade revisada', async () => {
  const { repository, occurred } = repoForGoal('questoes', 20);
  const result = await applyDailyGoalActivity({
    eventId: 'review:r1', type: 'review', questionCount: 6, activeMinutes: 2, occurredAt: occurred,
  }, { repository });
  assert.equal(result.completedAmount, 6);
});

test('6 e 7. revisão usa minutos na meta de tempo e não altera meta de batalhas', async () => {
  const time = repoForGoal('tempo', 20);
  const timeResult = await applyDailyGoalActivity({
    eventId: 'review:r1', type: 'review', questionCount: 6, activeMinutes: 3, occurredAt: time.occurred,
  }, { repository: time.repository });
  assert.equal(timeResult.completedAmount, 3);

  const battles = repoForGoal('batalhas', 2);
  const battleResult = await applyDailyGoalActivity({
    eventId: 'review:r1', type: 'review', questionCount: 6, activeMinutes: 3, occurredAt: battles.occurred,
  }, { repository: battles.repository });
  assert.equal(battleResult.completedAmount, 0);
});

test('8. foco válido alimenta somente meta de tempo', async () => {
  const { repository, occurred } = repoForGoal('tempo', 30);
  const result = await applyDailyGoalActivity({
    eventId: 'focus:f1', type: 'focus', questionCount: 0, activeMinutes: 15, occurredAt: occurred,
  }, { repository });
  assert.equal(result.completedAmount, 15);
});

test('10 e 11. bônus de 150 XP ocorre somente ao cruzar a meta e não repete no retry', async () => {
  const { repository, occurred } = repoForGoal('questoes', 10);
  const input = {
    eventId: 'battle:b1', type: 'battle', questionCount: 10, battleCount: 1, activeMinutes: 2, occurredAt: occurred,
  };
  const first = await applyDailyGoalActivity(input, { repository });
  const retry = await applyDailyGoalActivity(input, { repository });
  assert.equal(first.completedNow, true);
  assert.equal(retry.applied, false);
  assert.equal(lifetimeXpFromPlayer(repository.rows[STORES.player][0]), 150);
  assert.equal(repository.rows[STORES.meta].filter((item) => item.key === 'xp_event:daily_goal:2026-07-23').length, 1);
});

test('12 a 18. revisão finalizada é idempotente e altera somente XP/progresso operacional', async () => {
  const repository = memoryRepository({
    [STORES.player]: [player({ best_streak: 3 })],
    [STORES.routines]: [{ id: 'routine', day_of_week: 4, enabled: true, goal_type: 'questoes', goal_amount: 30 }],
    [STORES.subtopics]: [{ id: 's1', best_accuracy: 80, stars: 4, attempts_count: 3 }],
    [STORES.verticalized]: [{ id: 'v_s1', subtopic_id: 's1', review_count: 1 }],
  });
  const before = structuredClone(repository.rows[STORES.subtopics][0]);
  const first = await finalizeReviewSession(reviewSession(), { repository, now: () => new Date('2026-07-23T20:02:00Z') });
  const retry = await finalizeReviewSession(reviewSession(), { repository, now: () => new Date('2026-07-23T20:02:00Z') });
  const afterPlayer = repository.rows[STORES.player][0];
  assert.equal(first.reviewed, 1);
  assert.equal(retry.applied, false);
  assert.equal(afterPlayer.xp, 20);
  assert.equal(afterPlayer.level, 37);
  assert.equal(repository.rows[STORES.studySessions].length, 1);
  assert.equal(repository.rows[STORES.verticalized][0].review_count, 1);
  assert.deepEqual(repository.rows[STORES.subtopics][0], before);
});

test('14. retry da mesma resposta de revisão não duplica review_count', async () => {
  setActiveContestId('pc_al_2026');
  const queueItem = createReviewItem({
    questionId: 'q1',
    contestId: 'pc_al_2026',
    subtopicId: 's1',
    disciplineId: 'd1',
    difficulty: 3,
    source: 'battle',
  }, { now: new Date('2026-07-22T12:00:00Z'), reason: 'incorrect' });
  const repository = memoryRepository({
    [STORES.reviewQueue]: [queueItem],
    [STORES.subtopics]: [{ id: 's1', discipline_id: 'd1', best_accuracy: 80, stars: 4 }],
    [STORES.verticalized]: [{ id: 'v_s1', subtopic_id: 's1', review_count: 0 }],
  });
  const makeSession = () => ({
    id: 'review_same',
    items: [structuredClone(queueItem)],
    questions: [{ id: 'q1', format: 'certo_errado', correct_answer: true, explanation: 'ok' }],
    index: 0,
    correct: 0,
    errors: 0,
    results: [],
    finished: false,
    startedAt: '2026-07-23T20:00:00Z',
    lastActiveAt: '2026-07-23T20:00:00Z',
    activeSeconds: 0,
  });
  const first = await answerReviewQuestion(
    makeSession(),
    true,
    new Date('2026-07-23T20:01:00Z'),
    { repository },
  );
  const retry = await answerReviewQuestion(
    makeSession(),
    true,
    new Date('2026-07-23T20:01:00Z'),
    { repository },
  );
  assert.equal(first.applied, true);
  assert.equal(retry.applied, false);
  assert.equal(repository.rows[STORES.verticalized][0].review_count, 1);
});

test('19. segunda atividade válida no mesmo dia não aumenta a sequência', async () => {
  const repository = memoryRepository({ [STORES.player]: [player()] });
  const occurredAt = new Date(2026, 6, 23, 10);
  await applyValidStudyDay({ eventId: 'battle:1', occurredAt, valid: true }, { repository });
  await applyValidStudyDay({ eventId: 'review:1', occurredAt: new Date(2026, 6, 23, 20), valid: true }, { repository });
  assert.equal(repository.rows[STORES.player][0].streak_days, 1);
});

test('20. atividade no dia seguinte aumenta a sequência', async () => {
  const repository = memoryRepository({ [STORES.player]: [player()] });
  await applyValidStudyDay({ eventId: 'battle:1', occurredAt: new Date(2026, 6, 23, 10), valid: true }, { repository });
  await applyValidStudyDay({ eventId: 'battle:2', occurredAt: new Date(2026, 6, 24, 10), valid: true }, { repository });
  assert.equal(repository.rows[STORES.player][0].streak_days, 2);
});

test('21. perda da sequência reinicia a atual e mantém best_streak', () => {
  const result = applyStudyDayToPlayer(player({
    streak_days: 8, best_streak: 12, last_study_date: '2026-07-20',
  }), new Date(2026, 6, 23, 10));
  assert.equal(result.streak_days, 1);
  assert.equal(result.best_streak, 12);
});

test('22. atividade inválida não aumenta sequência', async () => {
  const repository = memoryRepository({ [STORES.player]: [player()] });
  const result = await applyValidStudyDay({
    eventId: 'focus:invalid', occurredAt: new Date(2026, 6, 23, 10), valid: false,
  }, { repository });
  assert.equal(result.applied, false);
  assert.equal(repository.rows[STORES.player][0].streak_days, 0);
});

test('23. métrica de constância usa o melhor streak histórico', () => {
  const metrics = collectEmblemMetrics({ player: player({ streak_days: 2, best_streak: 15 }) });
  assert.equal(metrics.consistency, 15);
});

test('24. insígnias evoluem depois de métricas válidas sem duplicar desbloqueios', async () => {
  const repository = memoryRepository({
    [STORES.player]: [player({ best_streak: 30, streak_days: 1 })],
  });
  const first = await refreshEmblems({ repository, daysUntilExam: 120 });
  const second = await refreshEmblems({ repository, daysUntilExam: 120 });
  assert.ok(first.unlocked.some((item) => item.id.startsWith('consistency_')));
  assert.equal(second.unlocked.length, 0);
});

test('25. reload preserva XP, tempo, meta, streak e insígnias', async () => {
  const repository = memoryRepository({
    [STORES.player]: [player({ best_streak: 3 })],
    [STORES.routines]: [{ id: 'routine', day_of_week: 4, enabled: true, goal_type: 'questoes', goal_amount: 1 }],
  });
  await finalizeReviewSession(reviewSession(), { repository, now: () => new Date('2026-07-23T20:02:00Z') });
  const snapshot = structuredClone(repository.rows);
  const reloaded = memoryRepository({ ...snapshot, metaValues: Object.fromEntries(repository.metaValues) });
  assert.equal(lifetimeXpFromPlayer(reloaded.rows[STORES.player][0]), 170);
  assert.equal(reloaded.rows[STORES.player][0].streak_days, 1);
  assert.equal(reloaded.rows[STORES.dailyLogs][0].status, 'cumprido');
  assert.equal(reloaded.rows[STORES.studySessions][0].durationSeconds, 120);
  assert.ok(reloaded.metaValues.get('earned_emblems_v1')?.items?.length > 0);
});

test('27. dois usuários não compartilham progresso', async () => {
  const userA = repoForGoal('questoes', 10);
  const userB = repoForGoal('questoes', 10);
  await applyDailyGoalActivity({
    eventId: 'battle:a', type: 'battle', questionCount: 10, battleCount: 1, activeMinutes: 2, occurredAt: userA.occurred,
  }, { repository: userA.repository });
  assert.equal(lifetimeXpFromPlayer(userA.repository.rows[STORES.player][0]), 150);
  assert.equal(userB.repository.rows[STORES.player][0].xp, 0);
  assert.equal(userB.repository.rows[STORES.dailyLogs].length, 0);
});
