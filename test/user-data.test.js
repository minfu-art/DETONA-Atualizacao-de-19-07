import test from 'node:test';
import assert from 'node:assert/strict';

import { ProgressRepository } from '../app/js/repositories/progressRepository.js';
import { LegacyDataMigrationService } from '../app/js/services/legacyDataMigrationService.js';

class MemoryProgressAdapter {
  constructor() { this.users = new Map(); }
  bucket(userId, contestId, store) {
    if (!this.users.has(userId)) this.users.set(userId, new Map());
    const contests = this.users.get(userId);
    if (!contests.has(contestId)) contests.set(contestId, new Map());
    const stores = contests.get(contestId);
    if (!stores.has(store)) stores.set(store, new Map());
    return stores.get(store);
  }
  async put(store, value, userId, contestId) {
    this.bucket(userId, contestId, store).set(value.id, structuredClone(value));
    return value;
  }
  async getAll(store, userId, contestId) {
    return [...this.bucket(userId, contestId, store).values()].map((value) => structuredClone(value));
  }
}

test('repositorio de progresso isola integralmente os dados entre usuarios', async () => {
  const adapter = new MemoryProgressAdapter();
  let active = 'user-a';
  let activeContest = 'pc-al';
  const repository = new ProgressRepository({
    adapter,
    userContext: { getUserId: () => active },
    contestContext: { getContestId: () => activeContest },
  });

  await repository.put('player', { id: 'player', xp: 900, level: 9 });
  active = 'user-b';
  assert.deepEqual(await repository.getAll('player'), []);
  await repository.put('player', { id: 'player', xp: 10, level: 1 });

  active = 'user-a';
  assert.deepEqual(await repository.getAll('player'), [{ id: 'player', xp: 900, level: 9 }]);
  active = 'user-b';
  assert.deepEqual(await repository.getAll('player'), [{ id: 'player', xp: 10, level: 1 }]);
});

test('o mesmo usuario possui progresso isolado em cada concurso', async () => {
  const adapter = new MemoryProgressAdapter();
  let contest = 'pc_al_2026';
  const repository = new ProgressRepository({
    adapter,
    userContext: { getUserId: () => 'user-1' },
    contestContext: { getContestId: () => contest },
  });
  await repository.put('player', { id: 'player', xp: 450, level: 5 });
  contest = 'pf_2026';
  assert.deepEqual(await repository.getAll('player'), []);
  await repository.put('player', { id: 'player', xp: 20, level: 1 });
  contest = 'pc_al_2026';
  assert.equal((await repository.getAll('player'))[0].xp, 450);
});

test('migracao copia dados legados para o primeiro usuario sem sobrescrever destino', async () => {
  const legacy = { app: 'DETONA_CONCURSOS', player: { id: 'player', xp: 777 }, meta: [{ key: 'seeded', value: true }] };
  const targets = new Map();
  const service = new LegacyDataMigrationService({
    source: { read: async () => structuredClone(legacy) },
    target: {
      hasData: async (userId) => targets.has(userId),
      write: async (snapshot, userId) => targets.set(userId, structuredClone(snapshot)),
      read: async (userId) => structuredClone(targets.get(userId)),
    },
  });

  const first = await service.migrateToFirstUser('user-1');
  assert.equal(first.migrated, true);
  assert.deepEqual(targets.get('user-1'), legacy);

  targets.set('user-2', { player: { id: 'player', xp: 12 } });
  const protectedTarget = await service.migrateToFirstUser('user-2');
  assert.deepEqual(protectedTarget, { migrated: false, reason: 'target_not_empty' });
  assert.equal(targets.get('user-2').player.xp, 12);
});
