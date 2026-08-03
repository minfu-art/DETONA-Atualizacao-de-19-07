import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHybridProgressAdapter, sanitizeOutboxEntries } from '../app/js/supabase/hybridProgressAdapter.js';
import { ProgressCloud } from '../app/js/supabase/progressCloud.js';
import { SYNC_COLLECTIONS, shouldSyncCloudOperation } from '../app/js/supabase/collectionKeys.js';
import { LOCAL_ONLY_META_PREFIXES } from '../app/js/privacy/localPersonalData.js';
import { LocalPersonalRepository } from '../app/js/repositories/localPersonalRepository.js';

function memoryAdapter() {
  const data = new Map();
  const bucket = (store, user, contest) => {
    const key = `${user}|${contest}|${store}`;
    if (!data.has(key)) data.set(key, new Map());
    return data.get(key);
  };
  const idOf = (store, value) => store === 'meta' ? value.key : value.id;
  return {
    data,
    getAll: async (store, user, contest) => [...bucket(store, user, contest).values()],
    getById: async (store, id, user, contest) => bucket(store, user, contest).get(id) || null,
    getByIndex: async () => [],
    put: async (store, value, user, contest) => { bucket(store, user, contest).set(idOf(store, value), value); return value; },
    putMany: async (store, values, user, contest) => { for (const value of values) bucket(store, user, contest).set(idOf(store, value), value); return values; },
    remove: async (store, id, user, contest) => bucket(store, user, contest).delete(id),
    clearStore: async (store, user, contest) => bucket(store, user, contest).clear(),
    getMeta: async (key, user, contest) => bucket('meta', user, contest).get(key)?.value ?? null,
    setMeta: async (key, value, user, contest) => { bucket('meta', user, contest).set(key, { key, value }); return value; },
  };
}

test('hábitos e bem-estar não pertencem ao conjunto sincronizado', () => {
  assert.equal(SYNC_COLLECTIONS.includes('wellbeingHabits'), false);
  assert.equal(SYNC_COLLECTIONS.includes('wellbeingLogs'), false);
  for (const prefix of LOCAL_ONLY_META_PREFIXES) {
    assert.equal(shouldSyncCloudOperation({ collection: 'meta', recordKey: `${prefix}sample` }), false);
  }
});

test('adaptador híbrido persiste hábitos apenas localmente mesmo online', async () => {
  const calls = [];
  const local = {
    put: async (_store, value) => value,
    putMany: async (_store, values) => values,
    remove: async () => {},
    clearStore: async () => {},
    getAll: async () => [],
    getById: async () => null,
    getByIndex: async () => [],
    getMeta: async () => null,
  };
  const cloud = {
    upsertRecord: async (...args) => calls.push(args),
    upsertMany: async (...args) => calls.push(args),
    deleteRecord: async (...args) => calls.push(args),
    clearCollection: async (...args) => calls.push(args),
  };
  const adapter = createHybridProgressAdapter({ local, cloud, cloudEnabled: () => true, online: () => true });
  await adapter.put('wellbeingHabits', { id: 'habit:water' }, 'u1', 'c1');
  await adapter.put('wellbeingLogs', { id: 'log:water' }, 'u1', 'c1');
  await adapter.setMeta('kaely_consistency_v1', { streak: 2 }, 'u1', 'c1');
  assert.deepEqual(calls, []);
});

test('outbox antiga é sanitizada sem remover operações acadêmicas', () => {
  const clean = sanitizeOutboxEntries([
    { op: 'upsert', collection: 'wellbeingLogs', value: { id: 'private' } },
    { op: 'upsert', collection: 'meta', value: { key: 'habit_reminder_settings_v1' } },
    { op: 'upsert', collection: 'subtopics', value: { id: 'academic' } },
  ]);
  assert.deepEqual(clean.map((entry) => entry.collection), ['subtopics']);
});

test('reload no mesmo dispositivo preserva e outro dispositivo começa vazio', async () => {
  const localDevice = memoryAdapter();
  const context = { getUserId: () => 'u1' };
  const contest = { getContestId: () => 'c1' };
  const first = new LocalPersonalRepository({ adapter: localDevice, userContext: context, contestContext: contest });
  await first.put('wellbeingHabits', { id: 'habit:water', target: 8 });
  const reload = new LocalPersonalRepository({ adapter: localDevice, userContext: context, contestContext: contest });
  assert.equal((await reload.getAll('wellbeingHabits')).length, 1);
  const otherDevice = new LocalPersonalRepository({ adapter: memoryAdapter(), userContext: context, contestContext: contest });
  assert.deepEqual(await otherDevice.getAll('wellbeingHabits'), []);
});

test('exclusão local remove somente dados pessoais e preserva progresso acadêmico', async () => {
  const adapter = memoryAdapter();
  const context = { getUserId: () => 'u1' };
  const contest = { getContestId: () => 'c1' };
  const repository = new LocalPersonalRepository({ adapter, userContext: context, contestContext: contest });
  await adapter.put('subtopics', { id: 'academic', stars: 3 }, 'u1', 'c1');
  await repository.put('wellbeingLogs', { id: 'private-log' });
  await repository.setMeta('kaely_consistency_v1', { streak: 4 });
  await repository.clearPersonalData();
  assert.deepEqual(await repository.getAll('wellbeingLogs'), []);
  assert.equal(await repository.getMeta('kaely_consistency_v1'), null);
  assert.equal((await adapter.getAll('subtopics', 'u1', 'c1')).length, 1);
});

test('cliente de nuvem recusa gravação pessoal antes de obter Supabase', async () => {
  let clientRequested = false;
  const cloud = new ProgressCloud({ getClient: async () => { clientRequested = true; return {}; } });
  await assert.rejects(() => cloud.upsertRecord('u1', 'c1', 'wellbeingLogs', { id: 'private' }), /LOCAL_ONLY_COLLECTION/);
  await assert.rejects(() => cloud.deleteRecord('u1', 'c1', 'meta', 'local_notification_sample'), /LOCAL_ONLY_COLLECTION/);
  assert.equal(clientRequested, false);
});

test('interface declara privacidade local, exclusão seletiva e não usa Push remoto', async () => {
  const [ui, privacy, reminders, app, sw] = await Promise.all([
    readFile(new URL('../app/js/ui/wellbeingUI.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/core/habitSystem.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/services/habitReminderService.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/sw.js', import.meta.url), 'utf8'),
  ]);
  assert.match(privacy, /somente neste dispositivo/);
  assert.match(ui, /Apagar meus dados pessoais deste dispositivo/);
  assert.match(ui, /Ativar notificações/);
  assert.match(reminders, /showNotification/);
  assert.doesNotMatch(`${reminders}\n${app}\n${sw}`, /PushManager|pushManager|subscribe\s*\(/);
  assert.match(sw, /notificationclick/);
});

test('fallback atômico restaura hábitos e metadados quando lembretes falham', async () => {
  const adapter = memoryAdapter();
  const originalSetMeta = adapter.setMeta;
  let failOnce = true;
  adapter.setMeta = async (key, value, user, contest) => {
    if (key === 'habit_reminder_settings_v1' && failOnce) {
      failOnce = false;
      throw new Error('REMINDER_WRITE_FAILED');
    }
    return originalSetMeta(key, value, user, contest);
  };
  const repository = new LocalPersonalRepository({
    adapter,
    userContext: { getUserId: () => 'u1' },
    contestContext: { getContestId: () => 'c1' },
  });
  await repository.put('wellbeingHabits', { id: 'habit:water', target: 4 });
  await repository.setMeta('personalized_habits_config_v1', { configured: false });
  const beforeRows = await repository.getAll('wellbeingHabits');
  const beforeConfig = await repository.getMeta('personalized_habits_config_v1');

  await assert.rejects(() => repository.putManyAndMetaAtomic('wellbeingHabits', [
    { id: 'habit:water', target: 8 },
  ], [
    { key: 'personalized_habits_config_v1', value: { configured: true } },
    { key: 'habit_reminder_settings_v1', value: [{ habitDefinitionId: 'habit:water' }] },
  ]), /REMINDER_WRITE_FAILED/);

  assert.deepEqual(await repository.getAll('wellbeingHabits'), beforeRows);
  assert.deepEqual(await repository.getMeta('personalized_habits_config_v1'), beforeConfig);
  assert.equal(await repository.getMeta('habit_reminder_settings_v1'), null);
});
