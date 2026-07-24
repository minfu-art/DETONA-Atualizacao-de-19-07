import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resetAcademicSessionContext } from '../app/js/auth/academicSessionContext.js';
import { ProgressRepository } from '../app/js/repositories/progressRepository.js';
import { LibraryService } from '../app/js/services/libraryService.js';
import {
  createHybridProgressAdapter,
  flushOutbox,
  pullAndMergeProgress,
} from '../app/js/supabase/hybridProgressAdapter.js';
import { recordKeyFor, SYNC_COLLECTIONS } from '../app/js/supabase/collectionKeys.js';
import { loadNavState, saveNavState } from '../app/js/core/editalUiModel.js';

const CONTEST = 'pc_al_2026';

class ScopedMemoryAdapter {
  constructor() {
    this.scopes = new Map();
  }

  bucket(store, userId, contestId) {
    const scope = `${userId}\u0000${contestId}\u0000${store}`;
    if (!this.scopes.has(scope)) this.scopes.set(scope, new Map());
    return this.scopes.get(scope);
  }

  key(store, value) {
    return recordKeyFor(store, value) || String(value?.id ?? value?.key);
  }

  async getAll(store, userId, contestId) {
    return [...this.bucket(store, userId, contestId).values()].map((value) => structuredClone(value));
  }

  async getById(store, id, userId, contestId) {
    return structuredClone(this.bucket(store, userId, contestId).get(String(id)) || null);
  }

  async put(store, value, userId, contestId) {
    this.bucket(store, userId, contestId).set(this.key(store, value), structuredClone(value));
    return value;
  }

  async putMany(store, values, userId, contestId) {
    for (const value of values) await this.put(store, value, userId, contestId);
    return values;
  }

  async remove(store, id, userId, contestId) {
    this.bucket(store, userId, contestId).delete(String(id));
  }

  async clearStore(store, userId, contestId) {
    this.bucket(store, userId, contestId).clear();
  }

  async getByIndex(store, indexName, value, userId, contestId) {
    return (await this.getAll(store, userId, contestId))
      .filter((row) => row?.[indexName] === value);
  }

  async getMeta(key, userId, contestId) {
    return (await this.getById('meta', key, userId, contestId))?.value ?? null;
  }

  async setMeta(key, value, userId, contestId) {
    return this.put('meta', { key, value }, userId, contestId);
  }
}

function scopedHarness() {
  const adapter = new ScopedMemoryAdapter();
  let userId = 'student-a';
  let contestId = CONTEST;
  const repository = new ProgressRepository({
    adapter,
    userContext: { getUserId: () => userId },
    contestContext: { getContestId: () => contestId },
  });
  return {
    adapter,
    repository,
    setUser(value) { userId = value; },
    setContest(value) { contestId = value; },
  };
}

async function assertStoreIsolation(store, rowA, rowB) {
  const harness = scopedHarness();
  await harness.repository.put(store, rowA);
  harness.setUser('student-b');
  assert.deepEqual(await harness.repository.getAll(store), []);
  await harness.repository.put(store, rowB);
  harness.setUser('student-a');
  assert.deepEqual(await harness.repository.getAll(store), [rowA]);
  harness.setUser('student-b');
  assert.deepEqual(await harness.repository.getAll(store), [rowB]);
}

test('1. aluno A e aluno B possuem players diferentes', async () => {
  await assertStoreIsolation(
    'player',
    { id: 'player', name: 'A', onboarded: true },
    { id: 'player', name: 'B', onboarded: false },
  );
});

test('2. domínio e estrelas não cruzam usuários', async () => {
  await assertStoreIsolation(
    'subtopics',
    { id: 'port-1', discipline_id: 'port', best_accuracy: 90, stars: 4 },
    { id: 'port-1', discipline_id: 'port', best_accuracy: 0, stars: 0 },
  );
  await assertStoreIsolation(
    'disciplines',
    { id: 'port', mastery_pct: 45 },
    { id: 'port', mastery_pct: 0 },
  );
  await assertStoreIsolation(
    'verticalized',
    { id: 'vertical-port-1', subtopic_id: 'port-1', theory_status: 'concluido' },
    { id: 'vertical-port-1', subtopic_id: 'port-1', theory_status: 'nao_iniciado' },
  );
  await assertStoreIsolation(
    'mvpCards',
    { id: 'card-port-1', subtopic_id: 'port-1' },
    { id: 'card-port-2', subtopic_id: 'port-2' },
  );
});

test('3. XP e eventos de XP não cruzam usuários', async () => {
  await assertStoreIsolation(
    'player',
    { id: 'player', xp: 450, processed_xp_event_ids: ['battle:a'] },
    { id: 'player', xp: 0, processed_xp_event_ids: [] },
  );
});

test('4. dailyLogs e metas diárias não cruzam usuários', async () => {
  await assertStoreIsolation(
    'dailyLogs',
    { date: '2026-07-23', completed_amount: 2, processed_battle_ids: ['a'] },
    { date: '2026-07-23', completed_amount: 0, processed_battle_ids: [] },
  );
});

test('5. reviewQueue não cruza usuários', async () => {
  await assertStoreIsolation(
    'reviewQueue',
    { questionId: 'q-1', status: 'pending', repetitions: 2 },
    { questionId: 'q-1', status: 'pending', repetitions: 0 },
  );
});

test('6. studySessions e tempo de estudo não cruzam usuários', async () => {
  const routineStores = [
    ['routines', { day_of_week: 1, minutes: 60 }, { day_of_week: 1, minutes: 20 }],
    ['routineProfiles', { id: 'profile', weeklyMinutes: 300 }, { id: 'profile', weeklyMinutes: 60 }],
    ['routineBlocks', { id: 'block-1', status: 'completed' }, { id: 'block-1', status: 'planned' }],
    ['studySessions', { id: 'session-1', disciplineId: 'port', activeSeconds: 1200 }, { id: 'session-1', disciplineId: 'port', activeSeconds: 0 }],
    ['routineDailyStates', { id: '2026-07-23', completed: 2 }, { id: '2026-07-23', completed: 0 }],
    ['routineWeeklyReviews', { id: '2026-W30', adherence: 80 }, { id: '2026-W30', adherence: 0 }],
    ['routineAchievements', { id: 'focus-1', earned: true }, { id: 'focus-1', earned: false }],
    ['routineDistractions', { id: 'd-1', sessionId: 'session-1' }, { id: 'd-2', sessionId: 'session-2' }],
    ['routineReminderSettings', { id: 'settings', enabled: true }, { id: 'settings', enabled: false }],
  ];
  for (const [store, rowA, rowB] of routineStores) {
    await assertStoreIsolation(store, rowA, rowB);
  }
});

test('7. meta e journals de batalha/revisão não cruzam usuários', async () => {
  await assertStoreIsolation(
    'meta',
    { key: 'battle_finalization:b-1', status: 'completed' },
    { key: 'review_finalization:r-1', status: 'processing' },
  );
});

test('8. progresso de insígnias não cruza usuários', async () => {
  await assertStoreIsolation(
    'meta',
    { key: 'earned_emblems_v1', value: [{ id: 'journey-1' }] },
    { key: 'earned_emblems_v1', value: [] },
  );
});

test('9. questões criadas pelo usuário permanecem no próprio escopo', async () => {
  await assertStoreIsolation(
    'questions',
    { id: 'custom-1', is_user_created: true, statement: 'Questão A' },
    { id: 'custom-2', is_user_created: true, statement: 'Questão B' },
  );
});

test('10. troca de conta remove dados acadêmicos transitórios da interface', () => {
  const context = {
    user: { id: 'student-a' },
    contest: { id: CONTEST },
    battleSession: { id: 'battle-a' },
    reviewSession: { id: 'review-a' },
    reviewFilters: { due: true },
    disciplineId: 'port',
    profileSection: 'emblems',
  };
  resetAcademicSessionContext(context);
  assert.deepEqual(context, {
    user: null,
    contest: null,
    battleSession: null,
    reviewSession: null,
    reviewFilters: null,
    disciplineId: null,
    profileSection: null,
    returnToTree: null,
    screen: 'auth',
  });
});

test('11. logout limpa usuário, concurso e contexto acadêmico sem apagar progresso', async () => {
  const harness = scopedHarness();
  await harness.repository.put('player', { id: 'player', xp: 100 });
  const context = { user: { id: 'student-a' }, contest: { id: CONTEST }, battleSession: { id: 'a' } };
  resetAcademicSessionContext(context);
  assert.equal(context.user, null);
  assert.equal(context.contest, null);
  assert.equal(context.battleSession, null);
  assert.deepEqual(await harness.repository.getAll('player'), [{ id: 'player', xp: 100 }]);
});

test('12. outbox mantém user_id e contest_id e drena somente o escopo ativo', async () => {
  const enqueued = [];
  const local = new ScopedMemoryAdapter();
  const hybrid = createHybridProgressAdapter({
    local,
    cloudEnabled: () => true,
    online: () => false,
    enqueue: (entry) => enqueued.push(entry),
  });
  await hybrid.put('player', { id: 'player' }, 'student-a', CONTEST);
  await hybrid.put('player', { id: 'player' }, 'student-b', CONTEST);
  assert.deepEqual(enqueued.map(({ userId, contestId }) => ({ userId, contestId })), [
    { userId: 'student-a', contestId: CONTEST },
    { userId: 'student-b', contestId: CONTEST },
  ]);

  const queued = [
    { op: 'upsert', userId: 'student-a', contestId: CONTEST, collection: 'player', value: { id: 'player' } },
    { op: 'upsert', userId: 'student-b', contestId: CONTEST, collection: 'player', value: { id: 'player' } },
  ];
  let remaining = null;
  const writes = [];
  const result = await flushOutbox({
    userId: 'student-b',
    contestId: CONTEST,
    read: () => structuredClone(queued),
    write: (rows) => { remaining = rows; },
    cloudEnabled: () => true,
    online: () => true,
    cloud: {
      async upsertRecord(userId, contestId) { writes.push({ userId, contestId }); },
    },
  });
  assert.deepEqual(writes, [{ userId: 'student-b', contestId: CONTEST }]);
  assert.deepEqual(remaining, [queued[0]]);
  assert.equal(result.flushed, 1);
});

test('13. pull da nuvem não mistura usuários ou concursos', async () => {
  const local = new ScopedMemoryAdapter();
  const cloud = {
    async pullCollections(userId, contestId) {
      const map = Object.fromEntries(SYNC_COLLECTIONS.map((store) => [store, []]));
      map.player = [{ id: 'player', owner: userId, contest: contestId }];
      return map;
    },
  };
  await pullAndMergeProgress('student-a', CONTEST, { local, cloud, cloudEnabled: () => true });
  await pullAndMergeProgress('student-b', 'other_contest', { local, cloud, cloudEnabled: () => true });
  assert.equal((await local.getAll('player', 'student-a', CONTEST))[0].owner, 'student-a');
  assert.equal((await local.getAll('player', 'student-b', 'other_contest'))[0].owner, 'student-b');
  assert.deepEqual(await local.getAll('player', 'student-b', CONTEST), []);
});

class MemoryEntitlements {
  constructor(rows = []) {
    this.rows = rows;
  }
  async listByUser(userId) { return this.rows.filter((row) => row.userId === userId); }
  async find(userId, contestId) {
    return this.rows.find((row) => row.userId === userId && row.contestId === contestId) || null;
  }
}

test('14. aluno sem entitlement não acessa PC/AL', async () => {
  const library = new LibraryService({
    entitlements: new MemoryEntitlements(),
    allowLocalGrants: () => false,
  });
  assert.equal(await library.canAccess('student-b', CONTEST), false);
});

test('15. aluno com entitlement acessa somente o concurso autorizado', async () => {
  const library = new LibraryService({
    entitlements: new MemoryEntitlements([
      { userId: 'student-b', contestId: CONTEST, status: 'active' },
    ]),
    allowLocalGrants: () => false,
  });
  assert.equal(await library.canAccess('student-b', CONTEST), true);
  assert.equal(await library.canAccess('student-b', 'pf_2026'), false);
  assert.equal(await library.canAccess('student-a', CONTEST), false);
});

test('16. RLS nega leitura e escrita cruzada por auth.uid()', () => {
  const sql = readFileSync(new URL('../supabase/migrations/003_explicit_data_api_access.sql', import.meta.url), 'utf8');
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`create policy progress_${operation}_own[\\s\\S]*?auth\\.uid\\(\\)\\) = user_id`, 'i'));
  }
  assert.match(sql, /revoke all privileges on table public\.progress_records from anon/i);
});

test('17. reload preserva somente o progresso do usuário ativo e navegação é escopada', async () => {
  const harness = scopedHarness();
  await harness.repository.put('player', { id: 'player', xp: 700 });
  harness.setUser('student-b');
  await harness.repository.put('player', { id: 'player', xp: 25 });
  assert.deepEqual(await harness.repository.getAll('player'), [{ id: 'player', xp: 25 }]);

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  saveNavState(CONTEST, { lastDisciplineId: 'port', lastSubtopicId: 'port-1', sort: 'progresso' }, storage, 'student-a');
  saveNavState(CONTEST, { lastDisciplineId: 'adm', lastSubtopicId: 'adm-1', sort: 'nome' }, storage, 'student-b');
  assert.equal(loadNavState(CONTEST, storage, 'student-a').lastDisciplineId, 'port');
  assert.equal(loadNavState(CONTEST, storage, 'student-b').lastDisciplineId, 'adm');
});
