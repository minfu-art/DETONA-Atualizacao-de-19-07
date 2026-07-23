import test from 'node:test';
import assert from 'node:assert/strict';

import { missingSeedRows } from '../app/js/core/seed.js';
import { shouldSyncCloudRecord } from '../app/js/supabase/collectionKeys.js';
import { createHybridProgressAdapter } from '../app/js/supabase/hybridProgressAdapter.js';

test('flag remota de seed não impede a reconstrução do catálogo local ausente', () => {
  const seed = [{ id: 'port' }, { id: 'penal' }, { id: 'rlm' }];
  assert.deepEqual(missingSeedRows(seed, [{ id: 'port' }]), [
    { id: 'penal' },
    { id: 'rlm' },
  ]);
  assert.deepEqual(missingSeedRows(seed, seed), []);
});

test('sincronização separa progresso do catálogo oficial de questões', () => {
  assert.equal(shouldSyncCloudRecord('player', { id: 'player_1' }), true);
  assert.equal(shouldSyncCloudRecord('questions', { id: 'oficial', is_user_created: false }), false);
  assert.equal(shouldSyncCloudRecord('questions', { id: 'forja', is_user_created: true }), true);
});

test('adapter híbrido mantém questões oficiais locais e envia somente questões da Forja', async () => {
  const localWrites = [];
  const cloudWrites = [];
  const adapter = createHybridProgressAdapter({
    local: {
      async putMany(store, values) {
        localWrites.push({ store, values: structuredClone(values) });
        return values;
      },
    },
    cloud: {
      async upsertMany(userId, contestId, store, values) {
        cloudWrites.push({ userId, contestId, store, values: structuredClone(values) });
      },
    },
    cloudEnabled: () => true,
    online: () => true,
  });
  const official = { id: 'q-oficial', is_user_created: false };
  const forged = { id: 'q-forja', is_user_created: true };

  await adapter.putMany('questions', [official, forged], 'user-1', 'pc_al_2026');

  assert.deepEqual(localWrites[0].values, [official, forged]);
  assert.deepEqual(cloudWrites[0].values, [forged]);
});
