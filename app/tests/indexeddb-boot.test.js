import test from 'node:test';
import assert from 'node:assert/strict';

import { openIndexedDatabase } from '../js/core/indexedDb.js';
import { upgradeContestDatabase } from '../js/core/db.js';
import { initializationFailure, recoverStaleRuntime } from '../js/core/runtimeRecovery.js';
import { STORES } from '../js/core/types.js';

function namedError(name, message = name) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function scriptedFactory(scripts) {
  let calls = 0;
  return {
    get calls() { return calls; },
    open() {
      const request = { result: null, error: null, transaction: { abort() {} } };
      const script = scripts[Math.min(calls, scripts.length - 1)];
      calls += 1;
      queueMicrotask(() => script(request));
      return request;
    },
  };
}

test('IndexedDB abre normalmente e entrega a conexao', async () => {
  const database = { version: 4, close() {} };
  const factory = scriptedFactory([(request) => {
    request.result = database;
    request.onsuccess();
  }]);
  assert.equal(await openIndexedDatabase({ name: 'normal', version: 4, factory }), database);
  assert.equal(factory.calls, 1);
});

test('upgrade preserva stores legados e cria apenas stores ausentes', async () => {
  const existing = new Set([STORES.player]);
  const created = [];
  const database = {
    objectStoreNames: { contains: (name) => existing.has(name) },
    createObjectStore(name) {
      assert.notEqual(name, STORES.player, 'store legado nao pode ser recriado');
      existing.add(name);
      created.push(name);
      return { createIndex() {} };
    },
    close() {},
  };
  const factory = scriptedFactory([(request) => {
    request.result = database;
    request.onupgradeneeded({ oldVersion: 3, newVersion: 4 });
    request.onsuccess();
  }]);
  await openIndexedDatabase({ name: 'legacy', version: 4, factory, upgrade: upgradeContestDatabase });
  assert.equal(existing.has(STORES.player), true);
  assert.equal(created.includes(STORES.routineProfiles), true);
  assert.deepEqual([...existing].sort(), Object.values(STORES).sort());
});

test('bloqueio recuperavel conclui sem apagar o banco', async () => {
  let blocked = 0;
  const database = { close() {} };
  const factory = scriptedFactory([(request) => {
    request.onblocked();
    setTimeout(() => {
      request.result = database;
      request.onsuccess();
    }, 2);
  }]);
  assert.equal(await openIndexedDatabase({
    name: 'blocked', version: 4, factory, blockedTimeoutMs: 30, onBlocked: () => { blocked += 1; },
  }), database);
  assert.equal(blocked, 1);
  assert.equal(factory.calls, 1);
});

test('erro transitorio repete uma vez sem excluir dados', async () => {
  const database = { close() {} };
  const factory = scriptedFactory([
    (request) => { request.error = namedError('AbortError'); request.onerror(); },
    (request) => { request.result = database; request.onsuccess(); },
  ]);
  assert.equal(await openIndexedDatabase({ name: 'retry', version: 4, factory, retryDelayMs: 0 }), database);
  assert.equal(factory.calls, 2);
  assert.equal(typeof factory.deleteDatabase, 'undefined');
});

test('ausencia real de IndexedDB retorna codigo explicito', async () => {
  await assert.rejects(
    () => openIndexedDatabase({ name: 'missing', version: 4, factory: null }),
    (error) => error.code === 'IDB_UNAVAILABLE',
  );
});

test('VersionError atualiza somente shell/cache uma vez e preserva conteudo', async () => {
  const deleted = [];
  let reloads = 0;
  let updates = 0;
  const memory = new Map();
  const sessionStorageRef = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const dependencies = {
    navigatorRef: {
      onLine: true,
      serviceWorker: { getRegistration: async () => ({ update: async () => { updates += 1; } }) },
    },
    locationRef: { reload: () => { reloads += 1; } },
    sessionStorageRef,
    cacheStorage: {
      keys: async () => ['detona-v123-old', 'detona-contest-content:user:contest:v1', 'foreign-cache'],
      delete: async (key) => { deleted.push(key); },
    },
  };
  const error = Object.assign(namedError('VersionError'), { code: 'IDB_VERSION_CONFLICT' });
  assert.equal(await recoverStaleRuntime(error, dependencies), true);
  assert.deepEqual(deleted, ['detona-v123-old']);
  assert.equal(updates, 1);
  assert.equal(reloads, 1);
  assert.equal(await recoverStaleRuntime(error, dependencies), false, 'nao pode criar loop de reload');
});

test('falha de catalogo nunca e apresentada como falha do IndexedDB', () => {
  const catalog = initializationFailure(Object.assign(new Error('Catalogo indisponivel'), { code: 'CATALOG_UNAVAILABLE' }));
  const storage = initializationFailure(Object.assign(new Error('Banco indisponivel'), { code: 'IDB_UNAVAILABLE' }));
  assert.match(catalog.title, /biblioteca/i);
  assert.doesNotMatch(catalog.title, /dados locais|IndexedDB/i);
  assert.match(storage.title, /dados locais/i);
});
