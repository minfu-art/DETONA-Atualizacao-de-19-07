import test from 'node:test';
import assert from 'node:assert/strict';

import { LibraryService } from '../app/js/services/libraryService.js';
import { ContestDataMigrationService } from '../app/js/services/contestDataMigrationService.js';

class MemoryEntitlements {
  constructor() { this.items = new Map(); }
  async find(userId, contestId) { return this.items.get(`${userId}:${contestId}`); }
  async save(value) { this.items.set(value.id, structuredClone(value)); return value; }
  async listByUser(userId) { return [...this.items.values()].filter((value) => value.userId === userId); }
}

test('conta existente recebe PC AL na biblioteca sem criar outro usuario', async () => {
  const service = new LibraryService({ entitlements: new MemoryEntitlements() });
  const user = { id: 'user-1', name: 'Ana', enabledModules: ['pc_al_2026'] };
  const library = await service.getLibrary(user);
  assert.equal(library.find((item) => item.contest.id === 'pc_al_2026').owned, true);
  assert.equal(library.find((item) => item.contest.id === 'pf_2026').owned, false);
});

test('compra por adapter adiciona novo concurso a mesma biblioteca', async () => {
  const entitlements = new MemoryEntitlements();
  const purchases = [];
  const checkout = { purchase: async ({ userId, contest }) => {
    purchases.push({ userId, contestId: contest.id });
    return { id: 'purchase-1', status: 'paid' };
  } };
  const service = new LibraryService({ entitlements, checkout, now: () => new Date('2026-07-14T12:00:00Z') });
  const user = { id: 'user-1', name: 'Ana', enabledModules: ['pc_al_2026'] };
  await service.purchase(user, 'pf_2026');
  const library = await service.getLibrary(user);
  assert.equal(library.find((item) => item.contest.id === 'pf_2026').owned, true);
  assert.deepEqual(purchases, [{ userId: 'user-1', contestId: 'pf_2026' }]);
});

test('direitos de concursos permanecem isolados entre contas', async () => {
  const entitlements = new MemoryEntitlements();
  const checkout = { purchase: async () => ({ id: 'purchase-1', status: 'paid' }) };
  const service = new LibraryService({ entitlements, checkout });
  await service.purchase({ id: 'user-1' }, 'prf_2026');
  assert.equal(await service.canAccess('user-1', 'prf_2026'), true);
  assert.equal(await service.canAccess('user-2', 'prf_2026'), false);
});

test('migracao da fase 3 ocorre somente para o modulo PC AL vazio', async () => {
  const writes = [];
  const service = new ContestDataMigrationService({
    source: { read: async () => ({ app: 'DETONA_CONCURSOS', player: { id: 'player', xp: 888 } }) },
    target: {
      hasData: async () => false,
      write: async (snapshot, userId, contestId) => writes.push({ snapshot, userId, contestId }),
    },
  });
  assert.deepEqual(await service.ensureCompatibility('user-1', 'pf_2026'), { migrated: false, reason: 'not_legacy_module' });
  assert.deepEqual(await service.ensureCompatibility('user-1', 'pc_al_2026'), { migrated: true });
  assert.equal(writes[0].snapshot.player.xp, 888);
  assert.equal(writes[0].contestId, 'pc_al_2026');
});
