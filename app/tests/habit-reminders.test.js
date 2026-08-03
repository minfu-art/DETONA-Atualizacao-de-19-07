import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHabitReminderQueue,
  deliverDueHabitReminders,
  findDueHabitReminders,
  habitNotificationContent,
  isIosStandalone,
  normalizeHabitReminder,
  notificationPermissionStatus,
  requestHabitNotificationPermission,
  snoozeHabitReminder,
} from '../js/services/habitReminderService.js';

test('normaliza lembrete com antecedência, dias e modo discreto sensível', () => {
  const reminder = normalizeHabitReminder({
    habitDefinitionId: 'habit:medication',
    enabled: true,
    time: '10:00',
    activeDays: [4, 4, 2],
    leadMinutes: 15,
  }, '2026-07-31T12:00:00.000Z');
  assert.deepEqual(reminder.activeDays, [2, 4]);
  assert.equal(reminder.leadMinutes, 15);
  assert.equal(reminder.discrete, true);
});

test('detecta lembrete no horário com antecedência e evita repetição', () => {
  const now = new Date('2026-07-30T09:50:00');
  const setting = normalizeHabitReminder({
    habitDefinitionId: 'habit:water', enabled: true, time: '10:00', activeDays: [4], leadMinutes: 10,
  });
  const [due] = findDueHabitReminders([setting], now);
  assert.ok(due);
  assert.equal(findDueHabitReminders([{ ...due, lastDeliveredKey: due.deliveryKey }], now).length, 0);
});

test('modo discreto não revela o hábito no conteúdo', () => {
  const content = habitNotificationContent({ discrete: true }, 'Medicação pessoal');
  assert.doesNotMatch(`${content.title} ${content.body}`, /medica/i);
  assert.match(content.body, /hábito programado/i);
});

test('permissão é apenas consultada e não solicitada implicitamente', () => {
  let requested = false;
  const scope = {
    Notification: { permission: 'default', requestPermission: () => { requested = true; } },
    navigator: { serviceWorker: {} },
  };
  assert.equal(notificationPermissionStatus(scope), 'default');
  assert.equal(requested, false);
});

test('entrega interna ocorre uma vez e notificação depende de permissão concedida', async () => {
  let stored = [{
    habitDefinitionId: 'habit:water', enabled: true, time: '10:00', activeDays: [4], leadMinutes: 0,
    discrete: false, lastDeliveredKey: null, snoozedUntil: null,
  }];
  const repository = {
    getMeta: async () => stored,
    setMeta: async (_key, value) => { stored = value; },
  };
  let internal = 0;
  let device = 0;
  const deniedScope = { Notification: { permission: 'default' }, navigator: { serviceWorker: {} } };
  await deliverDueHabitReminders({
    now: new Date('2026-07-30T10:00:00'), repository, scope: deniedScope, onInternal: () => { internal += 1; },
  });
  await deliverDueHabitReminders({
    now: new Date('2026-07-30T10:01:00'), repository, scope: deniedScope, onInternal: () => { internal += 1; },
  });
  assert.equal(internal, 1);
  assert.equal(device, 0);

  stored[0].lastDeliveredKey = null;
  const grantedScope = { Notification: { permission: 'granted' }, navigator: { serviceWorker: {} } };
  await deliverDueHabitReminders({
    now: new Date('2026-07-30T10:02:00'), repository, scope: grantedScope,
    registration: { showNotification: async () => { device += 1; } },
  });
  assert.equal(device, 1);
});

test('fila mantém ordem, deduplica e só apresenta um lembrete por vez', () => {
  const presented = [];
  const queue = createHabitReminderQueue({
    onPresent: (reminder, state) => presented.push([reminder.deliveryKey, state.pendingCount, state.markPresented]),
  });
  const first = { habitDefinitionId: 'habit:water', deliveryKey: 'water:1' };
  const second = { habitDefinitionId: 'habit:exercise', deliveryKey: 'exercise:1' };
  assert.equal(queue.enqueue(first), true);
  assert.equal(queue.enqueue(second), false);
  assert.equal(queue.enqueue(second), false);
  assert.equal(queue.pendingCount(), 2);
  assert.deepEqual(presented, [['water:1', 1, false]]);
  queue.advance();
  assert.deepEqual(presented.at(-1), ['exercise:1', 1, true]);
  assert.equal(queue.current(), second);
});

test('lembrete enfileirado invisível não é marcado como entregue', async () => {
  let stored = [normalizeHabitReminder({
    habitDefinitionId: 'habit:water', enabled: true, time: '10:00', activeDays: [4],
  })];
  const repository = {
    getMeta: async () => stored,
    setMeta: async (_key, value) => { stored = value; },
  };
  let deviceNotifications = 0;
  await deliverDueHabitReminders({
    now: new Date('2026-07-30T10:00:00'), repository,
    scope: { Notification: { permission: 'granted' }, navigator: { serviceWorker: {} } },
    registration: { showNotification: async () => { deviceNotifications += 1; } },
    onInternal: () => false,
  });
  assert.equal(stored[0].lastDeliveredKey, null);
  assert.equal(deviceNotifications, 0);
});

test('snooze de 10 minutos usa o novo horário mesmo após a janela original', async () => {
  let stored = [normalizeHabitReminder({
    habitDefinitionId: 'habit:water', enabled: true, time: '23:55', activeDays: [4],
  })];
  const repository = {
    getMeta: async () => stored,
    setMeta: async (_key, value) => { stored = value; return value; },
  };
  const original = { ...stored[0], deliveryKey: 'habit:water:2026-07-30:23:55' };
  await snoozeHabitReminder(original, 10, repository, new Date('2026-07-30T23:58:00-03:00'));
  assert.equal(findDueHabitReminders(stored, new Date('2026-07-31T00:07:59-03:00')).length, 0);
  assert.equal(findDueHabitReminders(stored, new Date('2026-07-31T00:08:00-03:00')).length, 1);
  assert.match(findDueHabitReminders(stored, new Date('2026-07-31T00:08:00-03:00'))[0].deliveryKey, /snooze/);
});

test('múltiplos snoozes substituem a referência e persistem após reinício', async () => {
  let stored = [normalizeHabitReminder({
    habitDefinitionId: 'habit:exercise', enabled: true, time: '18:00', activeDays: [4],
  })];
  const repository = {
    getMeta: async () => stored,
    setMeta: async (_key, value) => { stored = value; return value; },
  };
  await snoozeHabitReminder(stored[0], 10, repository, new Date('2026-07-30T18:00:00-03:00'));
  await snoozeHabitReminder(stored[0], 10, repository, new Date('2026-07-30T18:05:00-03:00'));
  const restartedSettings = structuredClone(stored);
  assert.equal(findDueHabitReminders(restartedSettings, new Date('2026-07-30T18:14:59-03:00')).length, 0);
  assert.equal(findDueHabitReminders(restartedSettings, new Date('2026-07-30T18:15:00-03:00')).length, 1);
});

test('snooze funciona em offset de verão sem depender da janela original', async () => {
  let stored = [normalizeHabitReminder({
    habitDefinitionId: 'habit:water', enabled: true, time: '01:55', activeDays: [0], timezone: 'America/New_York',
  })];
  const repository = {
    getMeta: async () => stored,
    setMeta: async (_key, value) => { stored = value; return value; },
  };
  const beforeTransition = new Date('2026-03-08T01:58:00-05:00');
  await snoozeHabitReminder(stored[0], 10, repository, beforeTransition);
  assert.equal(findDueHabitReminders(stored, new Date(beforeTransition.getTime() + 10 * 60000)).length, 1);
});

test('permissões distinguem granted, denied, default e unsupported', () => {
  const scope = (permission) => ({ Notification: { permission }, navigator: { serviceWorker: {} } });
  assert.equal(notificationPermissionStatus(scope('granted')), 'granted');
  assert.equal(notificationPermissionStatus(scope('denied')), 'denied');
  assert.equal(notificationPermissionStatus(scope('default')), 'default');
  assert.equal(notificationPermissionStatus({ navigator: {} }), 'unsupported');
});

test('iPhone fora do standalone recebe orientação antes de qualquer solicitação', async () => {
  let requests = 0;
  const iphone = {
    Notification: { permission: 'default', requestPermission: async () => { requests += 1; return 'granted'; } },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone)', serviceWorker: {} },
    matchMedia: () => ({ matches: false }),
  };
  assert.deepEqual(isIosStandalone(iphone), { ios: true, standalone: false });
  assert.equal(await requestHabitNotificationPermission(iphone), 'ios_requires_standalone');
  assert.equal(requests, 0);
});

test('falha de showNotification é registrada e não repete a cada minuto', async () => {
  let stored = [normalizeHabitReminder({
    habitDefinitionId: 'habit:water', enabled: true, time: '10:00', activeDays: [4],
  })];
  const repository = {
    getMeta: async () => stored,
    setMeta: async (_key, value) => { stored = value; },
  };
  let attempts = 0;
  const options = {
    repository,
    scope: { Notification: { permission: 'granted' }, navigator: { serviceWorker: {} } },
    registration: { showNotification: async () => { attempts += 1; throw new Error('DEVICE_FAILURE'); } },
  };
  await deliverDueHabitReminders({ ...options, now: new Date('2026-07-30T10:00:00') });
  await deliverDueHabitReminders({ ...options, now: new Date('2026-07-30T10:01:00') });
  assert.equal(attempts, 1);
  assert.match(stored[0].lastFailedKey, /habit:water/);
});
