import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deliverDueHabitReminders,
  findDueHabitReminders,
  habitNotificationContent,
  normalizeHabitReminder,
  notificationPermissionStatus,
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
