import { localPersonalRepository } from '../repositories/localPersonalRepository.js';
import { getHabitCatalogItem } from '../core/habitSystem.js';
import { localDateKey } from '../core/localDate.js';

export const HABIT_REMINDER_META_KEY = 'habit_reminder_settings_v1';
export const REMINDER_LEAD_OPTIONS = Object.freeze([0, 5, 10, 15, 30]);

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function timezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch { return 'local'; }
}

export function normalizeHabitReminder(value = {}, now = new Date().toISOString()) {
  const catalog = getHabitCatalogItem(String(value.habitDefinitionId || value.habitId || '').replace(/^habit:/, ''));
  const sensitive = Boolean(catalog?.isMedicalSensitive);
  return {
    habitDefinitionId: String(value.habitDefinitionId || `habit:${value.habitId || ''}`),
    enabled: value.enabled === true && validTime(value.time),
    time: validTime(value.time) ? value.time : null,
    activeDays: [...new Set((value.activeDays || []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort(),
    leadMinutes: REMINDER_LEAD_OPTIONS.includes(Number(value.leadMinutes)) ? Number(value.leadMinutes) : 0,
    discrete: sensitive ? value.discrete !== false : Boolean(value.discrete),
    lastDeliveredKey: value.lastDeliveredKey || null,
    snoozedUntil: value.snoozedUntil || null,
    timezone: value.timezone || timezone(),
    updatedAt: now,
  };
}

export async function getHabitReminderSettings(repository = localPersonalRepository) {
  const rows = await repository.getMeta(HABIT_REMINDER_META_KEY);
  return (Array.isArray(rows) ? rows : []).map((row) => normalizeHabitReminder(row, row.updatedAt));
}

export async function saveHabitReminderSettings(settings = [], repository = localPersonalRepository) {
  const previous = new Map((await getHabitReminderSettings(repository)).map((row) => [row.habitDefinitionId, row]));
  const rows = settings.map((value) => normalizeHabitReminder({
    ...previous.get(value.habitDefinitionId),
    ...value,
  }));
  await repository.setMeta(HABIT_REMINDER_META_KEY, rows);
  return rows;
}

export function notificationPermissionStatus(scope = globalThis) {
  if (!scope?.Notification || !scope?.navigator?.serviceWorker) return 'unsupported';
  if (scope.Notification.permission === 'granted') return 'granted';
  if (scope.Notification.permission === 'denied') return 'denied';
  return 'default';
}

export async function requestHabitNotificationPermission(scope = globalThis) {
  if (notificationPermissionStatus(scope) === 'unsupported') return 'unsupported';
  return scope.Notification.requestPermission();
}

function scheduledAt(setting, now) {
  const [hours, minutes] = setting.time.split(':').map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);
  return scheduled;
}

export function findDueHabitReminders(settings = [], now = new Date()) {
  const date = localDateKey(now);
  const day = now.getDay();
  return settings.filter((setting) => {
    if (!setting.enabled || !setting.time || !setting.activeDays.includes(day)) return false;
    if (setting.snoozedUntil && Date.parse(setting.snoozedUntil) > now.getTime()) return false;
    const scheduled = scheduledAt(setting, now);
    const dueAt = scheduled.getTime() - setting.leadMinutes * 60000;
    const expiresAt = scheduled.getTime() + 60 * 60000;
    const deliveryKey = `${setting.habitDefinitionId}:${date}:${setting.time}`;
    return now.getTime() >= dueAt && now.getTime() <= expiresAt && setting.lastDeliveredKey !== deliveryKey;
  }).map((setting) => ({
    ...setting,
    deliveryKey: `${setting.habitDefinitionId}:${date}:${setting.time}`,
  }));
}

export function habitNotificationContent(reminder, label = 'Hábito programado') {
  if (reminder.discrete) {
    return { title: 'Lembrete do DETONA', body: 'Você tem um hábito programado para agora.' };
  }
  return { title: 'Hora do seu hábito', body: `${label} está programado para agora.` };
}

async function updateReminder(reminder, patch, repository) {
  const settings = await getHabitReminderSettings(repository);
  const next = settings.map((row) => row.habitDefinitionId === reminder.habitDefinitionId
    ? normalizeHabitReminder({ ...row, ...patch })
    : row);
  await repository.setMeta(HABIT_REMINDER_META_KEY, next);
  return next;
}

export function snoozeHabitReminder(reminder, minutes = 10, repository = localPersonalRepository) {
  return updateReminder(reminder, {
    snoozedUntil: new Date(Date.now() + minutes * 60000).toISOString(),
    lastDeliveredKey: null,
  }, repository);
}

export function dismissHabitReminder(reminder, repository = localPersonalRepository) {
  return updateReminder(reminder, { lastDeliveredKey: reminder.deliveryKey, snoozedUntil: null }, repository);
}

export async function deliverDueHabitReminders({
  now = new Date(),
  repository = localPersonalRepository,
  onInternal = null,
  registration = null,
  scope = globalThis,
} = {}) {
  const settings = await getHabitReminderSettings(repository);
  const due = findDueHabitReminders(settings, now);
  for (const reminder of due) {
    const catalog = getHabitCatalogItem(reminder.habitDefinitionId.replace(/^habit:/, ''));
    const content = habitNotificationContent(reminder, catalog?.label);
    onInternal?.({ ...reminder, ...content, label: catalog?.label || 'Hábito programado' });
    if (notificationPermissionStatus(scope) === 'granted') {
      const sw = registration || await scope.navigator.serviceWorker.ready;
      await sw.showNotification(content.title, {
        body: content.body,
        tag: `detona-habit-${reminder.habitDefinitionId}`,
        renotify: false,
        data: { route: 'wellbeing' },
        actions: [{ action: 'open-habits', title: 'Abrir Hábitos' }],
      });
    }
    await dismissHabitReminder(reminder, repository);
  }
  return due;
}

export function isIosStandalone(scope = globalThis) {
  const ios = /iphone|ipad|ipod/i.test(scope?.navigator?.userAgent || '');
  const standalone = scope?.matchMedia?.('(display-mode: standalone)')?.matches || scope?.navigator?.standalone === true;
  return { ios, standalone: Boolean(standalone) };
}
