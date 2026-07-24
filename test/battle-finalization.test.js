import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  finalizeBattle,
  validateOfficialBattleSession,
} from '../app/js/core/battle.js';
import { recalculateEditalSSOT } from '../app/js/core/ssot.js';
import { STORES } from '../app/js/core/types.js';
import { setActiveContestId } from '../app/js/contest/activeContest.js';
import { recordBattleReviewEvents } from '../app/js/services/reviewService.js';
import { createHybridProgressAdapter } from '../app/js/supabase/hybridProgressAdapter.js';

function session({
  id = 'battle-1',
  correct = 5,
  finished = true,
  answered = 10,
  questionCount = 10,
  resultCount = 10,
} = {}) {
  const questions = Array.from({ length: questionCount }, (_, index) => ({
    id: `q${index + 1}`,
    subtopic_id: 'sub-1',
    format: 'certo_errado',
    correct_answer: true,
    statement: `Questão ${index + 1}`,
    explanation: 'Explicação',
  }));
  const results = Array.from({ length: resultCount }, (_, index) => ({
    questionId: `q${index + 1}`,
    userAnswer: index < correct,
    correct: index < correct,
    confidence: index % 2 ? 'normal' : 'high',
  }));
  return {
    id,
    subtopic_id: 'sub-1',
    questions,
    results,
    correct,
    answered,
    finished,
    maxCombo: correct,
  };
}

function memoryRepository(overrides = {}) {
  const rows = {
    [STORES.player]: [{ id: 'player-1', streak_days: 0, last_study_date: null }],
    [STORES.subtopics]: [{
      id: 'sub-1',
      discipline_id: 'disc-1',
      enemy_name: 'Alvo',
      best_accuracy: 0,
      attempts_count: 0,
    }],
    [STORES.disciplines]: [{ id: 'disc-1', order: 1 }],
    [STORES.verticalized]: [{
      id: 'v_sub-1',
      subtopic_id: 'sub-1',
      theory_status: 'concluido',
      review_count: 1,
    }],
    [STORES.routines]: [{ day_of_week: 4, goal_type: 'questoes', goal_amount: 30, enabled: true }],
    [STORES.dailyLogs]: [],
    [STORES.mvpCards]: [],
    [STORES.reviewQueue]: [],
    [STORES.meta]: [],
    ...overrides,
  };
  const writes = [];
  const keyFor = (store, value) => {
    if (store === STORES.dailyLogs) return value.date;
    if (store === STORES.reviewQueue) return value.questionId;
    if (store === STORES.routines) return value.day_of_week;
    if (store === STORES.meta) return value.key;
    return value.id;
  };
  return {
    rows,
    writes,
    async getAll(store) {
      return rows[store] || [];
    },
    async getById(store, id) {
      return (rows[store] || []).find((value) => String(keyFor(store, value)) === String(id)) || null;
    },
    async put(store, value) {
      rows[store] ||= [];
      const key = keyFor(store, value);
      const index = rows[store].findIndex((item) => String(keyFor(store, item)) === String(key));
      if (index >= 0) rows[store][index] = structuredClone(value);
      else rows[store].push(structuredClone(value));
      writes.push({ store, value: structuredClone(value) });
      return value;
    },
    async putMany(store, values) {
      for (const value of values) await this.put(store, value);
      return values;
    },
  };
}

function dependencies(repository, date = '2026-07-23T12:00:00.000Z') {
  let reviewCalls = 0;
  return {
    get reviewCalls() { return reviewCalls; },
    options: {
      repository,
      now: () => new Date(date),
      reviewRecorder: async (battle, subtopic, previous, now, repo) => {
        reviewCalls += 1;
        let added = 0;
        for (const result of battle.results.filter((item) => !item.correct)) {
          const existing = await repo.getById(STORES.reviewQueue, result.questionId);
          await repo.put(STORES.reviewQueue, {
            ...(existing || {}),
            questionId: result.questionId,
            subtopicId: subtopic.id,
            status: 'pending',
            updated_at: now.toISOString(),
          });
          if (!existing) added += 1;
        }
        return added;
      },
      recalculate: async (repo) => ({ player: (await repo.getAll(STORES.player))[0] }),
    },
  };
}

test('validação rejeita sessão não finalizada', () => {
  assert.throws(() => validateOfficialBattleSession(session({ finished: false })), { code: 'BATTLE_NOT_FINISHED' });
});

test('validação rejeita nove respostas', () => {
  assert.throws(() => validateOfficialBattleSession(session({ answered: 9 })), { code: 'BATTLE_ANSWERS_INVALID' });
});

test('validação rejeita nove questões sem acessar o repositório', async () => {
  let repositoryCalls = 0;
  const repository = {
    async getAll() { repositoryCalls += 1; return []; },
    async getById() { repositoryCalls += 1; return null; },
    async put() { repositoryCalls += 1; },
    async putMany() { repositoryCalls += 1; },
  };
  await assert.rejects(
    finalizeBattle(session({ questionCount: 9, resultCount: 9, answered: 9 }), { repository }),
    { code: 'BATTLE_QUESTIONS_INVALID' },
  );
  assert.equal(repositoryCalls, 0);
});

test('validação rejeita nove resultados', () => {
  assert.throws(() => validateOfficialBattleSession(session({ resultCount: 9 })), { code: 'BATTLE_RESULTS_INVALID' });
});

test('validação rejeita questão duplicada', () => {
  const value = session();
  value.questions[9].id = value.questions[0].id;
  assert.throws(() => validateOfficialBattleSession(value), { code: 'BATTLE_DUPLICATE_QUESTION' });
});

test('validação rejeita resultado duplicado', () => {
  const value = session();
  value.results[9].questionId = value.results[0].questionId;
  assert.throws(() => validateOfficialBattleSession(value), { code: 'BATTLE_DUPLICATE_RESULT' });
});

test('validação rejeita resultado de questão externa', () => {
  const value = session();
  value.results[9].questionId = 'externa';
  assert.throws(() => validateOfficialBattleSession(value), { code: 'BATTLE_EXTERNAL_RESULT' });
});

test('validação rejeita questões de subtópicos diferentes', () => {
  const value = session();
  value.questions[9].subtopic_id = 'sub-2';
  assert.throws(() => validateOfficialBattleSession(value), { code: 'BATTLE_MIXED_SUBTOPICS' });
});

test('validação rejeita total de acertos divergente', () => {
  const value = session({ correct: 5 });
  value.correct = 6;
  assert.throws(() => validateOfficialBattleSession(value), { code: 'BATTLE_CORRECT_MISMATCH' });
});

test('batalhas válidas preservam melhor domínio e calculam histórico completo', async () => {
  const repository = memoryRepository();

  const firstDeps = dependencies(repository, '2026-07-23T12:00:00.000Z');
  const first = await finalizeBattle(session({ id: 'battle-5', correct: 5 }), firstDeps.options);
  let subtopic = repository.rows[STORES.subtopics][0];
  assert.equal(first.newResult, 50);
  assert.equal(subtopic.best_accuracy, 50);
  assert.equal(subtopic.stars, 2.5);
  assert.equal(subtopic.attempts_count, 1);
  assert.equal(subtopic.attempt_history[0].battleId, 'battle-5');
  assert.equal(subtopic.attempt_history[0].answers.length, 10);
  assert.deepEqual(subtopic.attempt_history[0].answers[0], {
    questionId: 'q1', userAnswer: true, correct: true, confidence: 'high',
  });

  await finalizeBattle(
    session({ id: 'battle-3', correct: 3 }),
    dependencies(repository, '2026-07-24T12:00:00.000Z').options,
  );
  subtopic = repository.rows[STORES.subtopics][0];
  assert.equal(subtopic.best_accuracy, 50);
  assert.equal(subtopic.stars, 2.5);
  assert.equal(subtopic.last_attempt_percentage, 30);
  assert.equal(subtopic.answers_total, 20);
  assert.equal(subtopic.correct_total, 8);
  assert.equal(subtopic.incorrect_total, 12);
  assert.equal(subtopic.unique_questions_answered, 10);
  assert.equal(subtopic.repeated_answers, 10);
  assert.equal(subtopic.historical_accuracy, 40);
  assert.notEqual(subtopic.historical_accuracy, subtopic.best_accuracy);

  await finalizeBattle(
    session({ id: 'battle-8', correct: 8 }),
    dependencies(repository, '2026-07-25T12:00:00.000Z').options,
  );
  subtopic = repository.rows[STORES.subtopics][0];
  assert.equal(subtopic.best_accuracy, 80);
  assert.equal(subtopic.stars, 4);
  assert.equal(subtopic.attempts_count, 3);
});

test('finalização concede XP separado do LV e registra tempo na disciplina', async () => {
  const repository = memoryRepository();
  repository.rows[STORES.player][0] = {
    ...repository.rows[STORES.player][0],
    level: 40,
    mastery_pct: 40,
    xp_level: 1,
    xp: 0,
  };
  const value = session({ id: 'xp-time-battle', correct: 5 });
  value.startedAt = '2026-07-23T11:40:00.000Z';
  value.activeSeconds = 1200;

  const summary = await finalizeBattle(value, dependencies(repository).options);
  const player = repository.rows[STORES.player][0];
  const activity = repository.rows[STORES.studySessions][0];

  assert.equal(summary.xpEarned, 105);
  assert.equal(player.level, 40);
  assert.equal(player.xp_level, 2);
  assert.equal(player.xp, 5);
  assert.equal(activity.durationSeconds, 1200);
  assert.equal(activity.subjectId, 'disc-1');
  assert.equal(activity.subtopicId, 'sub-1');
  assert.equal(summary.activityMinutes, 20);
});

test('battleId repetido é bloqueado após reload sem duplicar efeitos', async () => {
  const repository = memoryRepository();
  const deps = dependencies(repository);
  const value = session({ id: 'persistent-battle', correct: 5 });
  await finalizeBattle(value, deps.options);
  const before = {
    attempts: repository.rows[STORES.subtopics][0].attempts_count,
    log: structuredClone(repository.rows[STORES.dailyLogs][0]),
    review: structuredClone(repository.rows[STORES.reviewQueue]),
    reviewCalls: deps.reviewCalls,
  };

  const reloadDeps = dependencies(repository);
  await assert.rejects(
    finalizeBattle(structuredClone(value), reloadDeps.options),
    { code: 'BATTLE_ALREADY_FINALIZED' },
  );
  assert.equal(repository.rows[STORES.subtopics][0].attempts_count, before.attempts);
  assert.deepEqual(repository.rows[STORES.dailyLogs][0], before.log);
  assert.deepEqual(repository.rows[STORES.reviewQueue], before.review);
  assert.equal(reloadDeps.reviewCalls, 0);
});

test('dois cliques simultâneos são bloqueados em memória', async () => {
  const repository = memoryRepository();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const options = {
    repository,
    now: () => new Date('2026-07-23T12:00:00.000Z'),
    reviewRecorder: async () => {
      await waiting;
      return 0;
    },
    recalculate: async (repo) => ({ player: (await repo.getAll(STORES.player))[0] }),
  };
  const value = session({ id: 'double-click' });
  const first = finalizeBattle(value, options);
  await assert.rejects(finalizeBattle(structuredClone(value), options), { code: 'BATTLE_FINALIZATION_IN_PROGRESS' });
  release();
  await first;
  assert.equal(repository.rows[STORES.subtopics][0].attempts_count, 1);
});

test('journal retoma finalização parcial sem duplicar efeitos', async () => {
  setActiveContestId('pc_al_2026');
  const repository = memoryRepository();
  const originalPut = repository.put.bind(repository);
  let reviewWrites = 0;
  let failReviewOnce = true;
  let ssotCalls = 0;
  repository.put = async (store, value) => {
    if (store === STORES.reviewQueue) {
      reviewWrites += 1;
      if (failReviewOnce && reviewWrites === 2) {
        failReviewOnce = false;
        throw new Error('review unavailable');
      }
    }
    return originalPut(store, value);
  };
  const options = {
    repository,
    now: () => new Date('2026-07-23T12:00:00.000Z'),
    reviewRecorder: recordBattleReviewEvents,
    recalculate: async (repo) => {
      ssotCalls += 1;
      return { player: (await repo.getAll(STORES.player))[0] };
    },
  };
  const value = session({ id: 'resumable-battle', correct: 5 });
  const journalKey = 'battle_finalization:resumable-battle';

  await assert.rejects(finalizeBattle(value, options), /review unavailable/);
  let journal = await repository.getById(STORES.meta, journalKey);
  assert.equal(journal.status, 'processing');
  assert.equal(journal.steps.mastery, true);
  assert.equal(journal.steps.review, false);
  assert.equal(repository.rows[STORES.subtopics][0].attempts_count, 1);
  assert.equal(repository.rows[STORES.dailyLogs].length, 0);

  await finalizeBattle(structuredClone(value), options);
  journal = await repository.getById(STORES.meta, journalKey);
  const subtopic = repository.rows[STORES.subtopics][0];
  const log = repository.rows[STORES.dailyLogs][0];
  const player = repository.rows[STORES.player][0];
  assert.equal(subtopic.attempts_count, 1);
  assert.equal(subtopic.attempt_history.length, 1);
  assert.equal(repository.rows[STORES.reviewQueue].length, 5);
  assert.ok(repository.rows[STORES.reviewQueue].every((item) => (
    item.reviewHistory.length === 1
    && item.processed_battle_ids.includes('resumable-battle')
  )));
  assert.equal(log.completed_amount, 10);
  assert.equal(log.domain_challenges_completed, 1);
  assert.deepEqual(log.processed_battle_ids, ['resumable-battle']);
  assert.equal(player.streak_days, 1);
  assert.equal(player.last_study_date, '2026-07-23');
  assert.equal(ssotCalls, 1);
  assert.equal(journal.status, 'completed');
  assert.ok(Object.values(journal.steps).every(Boolean));
  assert.equal(journal.completed_at, '2026-07-23T12:00:00.000Z');

  await assert.rejects(
    finalizeBattle(structuredClone(value), options),
    { code: 'BATTLE_ALREADY_FINALIZED' },
  );
  assert.equal(repository.rows[STORES.subtopics][0].attempts_count, 1);
  assert.equal(repository.rows[STORES.dailyLogs][0].completed_amount, 10);
  assert.equal(repository.rows[STORES.player][0].streak_days, 1);
  assert.equal(ssotCalls, 1);
});

test('retry após falha no checkpoint do player não duplica streak', async () => {
  const repository = memoryRepository();
  const originalPut = repository.put.bind(repository);
  const journalKey = 'battle_finalization:player-checkpoint';
  let failPlayerCheckpoint = true;
  let ssotCalls = 0;
  repository.put = async (store, value) => {
    if (
      failPlayerCheckpoint
      && store === STORES.meta
      && value.key === journalKey
      && value.steps?.player === true
      && value.steps?.ssot === false
    ) {
      failPlayerCheckpoint = false;
      throw new Error('journal checkpoint unavailable');
    }
    return originalPut(store, value);
  };
  const options = {
    ...dependencies(repository).options,
    recalculate: async (repo) => {
      ssotCalls += 1;
      return { player: (await repo.getAll(STORES.player))[0] };
    },
  };
  const value = session({ id: 'player-checkpoint', correct: 5 });

  await assert.rejects(finalizeBattle(value, options), /journal checkpoint unavailable/);
  let journal = await repository.getById(STORES.meta, journalKey);
  assert.equal(journal.status, 'processing');
  assert.equal(journal.steps.dailyLog, true);
  assert.equal(journal.steps.player, false);
  assert.equal(repository.rows[STORES.player][0].streak_days, 1);

  await finalizeBattle(structuredClone(value), options);
  journal = await repository.getById(STORES.meta, journalKey);
  assert.equal(repository.rows[STORES.player][0].streak_days, 1);
  assert.equal(repository.rows[STORES.dailyLogs][0].completed_amount, 10);
  assert.equal(repository.rows[STORES.dailyLogs][0].domain_challenges_completed, 1);
  assert.equal(ssotCalls, 1);
  assert.equal(journal.status, 'completed');
});

test('SSOT usa o repositório para todas as gravações acadêmicas', async () => {
  const repository = memoryRepository();
  const updatedAt = '2026-07-23T12:00:00.000Z';
  await recalculateEditalSSOT(repository, { updatedAt });
  const stores = new Set(repository.writes.map((entry) => entry.store));
  for (const store of [STORES.player, STORES.subtopics, STORES.disciplines, STORES.verticalized]) {
    assert.ok(stores.has(store), `gravação ausente em ${store}`);
    assert.equal(repository.rows[store][0].updated_at, updatedAt);
  }
});

test('SSOT não reenvia centenas de registros quando nada acadêmico mudou', async () => {
  const repository = memoryRepository();
  await recalculateEditalSSOT(repository, { updatedAt: '2026-07-23T12:00:00.000Z' });
  repository.writes.length = 0;

  const result = await recalculateEditalSSOT(repository, {
    updatedAt: '2026-07-23T12:05:00.000Z',
  });

  assert.deepEqual(result.writes, {
    player: 0,
    subtopics: 0,
    verticalized: 0,
    disciplines: 0,
  });
  assert.equal(repository.writes.length, 0);
});

test('battle.js não grava progresso diretamente no IndexedDB', async () => {
  const source = await readFile(new URL('../app/js/core/battle.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/db\.js['"]/);
  assert.match(source, /repository\.put\(STORES\.subtopics/);
  assert.match(source, /repository\.put\(STORES\.dailyLogs/);
  assert.match(source, /repository\.put\(STORES\.player/);
});

test('falha da nuvem preserva a gravação local e envia operação para outbox', async () => {
  const localRows = [];
  const queued = [];
  const adapter = createHybridProgressAdapter({
    local: {
      async put(store, value) {
        localRows.push({ store, value });
        return value;
      },
    },
    cloud: {
      async upsertRecord() {
        throw new Error('cloud unavailable');
      },
    },
    cloudEnabled: () => true,
    online: () => true,
    enqueue: (entry) => queued.push(entry),
  });
  const value = { id: 'sub-1', best_accuracy: 50, updated_at: '2026-07-23T12:00:00.000Z' };
  await adapter.put(STORES.subtopics, value, 'user-1', 'pc_al_2026');
  assert.deepEqual(localRows, [{ store: STORES.subtopics, value }]);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].collection, STORES.subtopics);
  assert.deepEqual(queued[0].value, value);
});
