import test from 'node:test';
import assert from 'node:assert/strict';
import { bindOnlineFlush, createDeferredSyncTask } from '../js/supabase/syncService.js';

function deferredHarness(initialScreen = 'home') {
  let screen = initialScreen;
  let current = true;
  let syncCalls = 0;
  let pushCalls = 0;
  const callbacks = [];
  const task = createDeferredSyncTask({
    schedule: (callback) => callbacks.push(callback),
    isCurrent: () => current,
    shouldDefer: () => ['battle', 'review', 'rankedEvent'].includes(screen),
    run: async () => {
      syncCalls += 1;
      pushCalls += 1;
      return true;
    },
  });
  return {
    task,
    callbacks,
    syncCalls: () => syncCalls,
    pushCalls: () => pushCalls,
    setScreen: (value) => { screen = value; },
    invalidate: () => { current = false; },
  };
}

for (const interactiveScreen of ['battle', 'review', 'rankedEvent']) {
  test(`manutencao remota aguarda a saida de ${interactiveScreen}`, async () => {
    const harness = deferredHarness();
    assert.equal(harness.task.request(), true);
    harness.setScreen(interactiveScreen);
    await harness.callbacks.shift()();

    assert.equal(harness.syncCalls(), 0);
    assert.equal(harness.pushCalls(), 0);
    assert.equal(harness.task.isPending(), true);
    assert.equal(harness.task.request(), false);
    assert.equal(harness.callbacks.length, 0);

    harness.setScreen('home');
    assert.equal(harness.task.request(), true);
    await harness.callbacks.shift()();
    assert.equal(harness.syncCalls(), 1);
    assert.equal(harness.pushCalls(), 1);
    assert.equal(harness.task.isPending(), false);
  });
}

test('manutencao pendente nao executa depois da troca de concurso', async () => {
  const harness = deferredHarness();
  harness.task.request();
  harness.invalidate();
  await harness.callbacks.shift()();

  assert.equal(harness.syncCalls(), 0);
  assert.equal(harness.pushCalls(), 0);
  assert.equal(harness.task.isPending(), false);
  assert.equal(harness.task.request(), false);
});

test('manutencao pendente nao executa depois do logout', async () => {
  const harness = deferredHarness('review');
  assert.equal(harness.task.request(), false);
  harness.invalidate();
  assert.equal(harness.task.request(), false);
  assert.equal(harness.syncCalls(), 0);
  assert.equal(harness.pushCalls(), 0);
  assert.equal(harness.task.isPending(), false);
});

test('tela nao interativa executa uma vez sem duplicar agendamentos', async () => {
  const harness = deferredHarness('home');
  assert.equal(harness.task.request(), true);
  assert.equal(harness.task.request(), false);
  assert.equal(harness.task.request(), false);
  assert.equal(harness.callbacks.length, 1);

  await harness.callbacks.shift()();
  assert.equal(harness.syncCalls(), 1);
  assert.equal(harness.pushCalls(), 1);
  assert.equal(harness.task.request(), false);
});

test('reconexao durante batalha adia a outbox e retoma ao voltar para tela segura', async () => {
  let screen = 'battle';
  const scope = { userId: 'student-a', contestId: 'pc_al_2026' };
  const listeners = new Map();
  const flushed = [];
  const windowRef = {
    addEventListener: (event, handler) => listeners.set(event, handler),
    removeEventListener: (event) => listeners.delete(event),
  };
  const binding = bindOnlineFlush({
    canFlush: () => !['battle', 'review', 'rankedEvent'].includes(screen),
    getScope: () => scope,
    flush: async (value) => { flushed.push({ ...value }); },
    windowRef,
  });

  await listeners.get('online')();
  assert.equal(binding.isPending(), true);
  assert.deepEqual(flushed, []);

  screen = 'home';
  await binding.flushWhenSafe();
  assert.equal(binding.isPending(), false);
  assert.deepEqual(flushed, [scope]);
  await binding.flushWhenSafe();
  assert.equal(flushed.length, 1);
  binding.dispose();
});

test('outbox adiada e descartada ao trocar de concurso ou sair da conta', async () => {
  let screen = 'review';
  let scope = { userId: 'student-a', contestId: 'pc_al_2026' };
  const listeners = new Map();
  let flushes = 0;
  const binding = bindOnlineFlush({
    canFlush: () => screen === 'home',
    getScope: () => scope,
    flush: async () => { flushes += 1; },
    windowRef: {
      addEventListener: (event, handler) => listeners.set(event, handler),
      removeEventListener: (event) => listeners.delete(event),
    },
  });

  await listeners.get('online')();
  scope = { userId: 'student-a', contestId: 'pp_pe_2027' };
  screen = 'home';
  assert.deepEqual(await binding.flushWhenSafe(), { skipped: true, stale: true });
  assert.equal(flushes, 0);

  screen = 'review';
  await listeners.get('online')();
  scope = { userId: null, contestId: null };
  screen = 'home';
  assert.deepEqual(await binding.flushWhenSafe(), { skipped: true, stale: true });
  assert.equal(flushes, 0);
  binding.dispose();
});
