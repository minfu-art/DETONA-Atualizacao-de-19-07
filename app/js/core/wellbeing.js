/**
 * Hábitos e constância — offline-first, isolado por usuário e concurso.
 * REGRA: este módulo nunca concede XP, nível, estrelas, domínio ou progresso de edital.
 */
import { STORES } from './types.js';
import { localPersonalRepository as progressRepository } from '../repositories/localPersonalRepository.js';
import { localDateKey } from './localDate.js';
import {
  DEFAULT_MINIMUM_PERCENT,
  HABIT_CATALOG,
  HABIT_RECORD_TYPES,
  HABIT_SOURCES,
  MAX_ACTIVE_HABITS,
  applyAcademicAutomation,
  calculateDailyVigor,
  calculateHabitConsistency,
  createHabitDailyLog,
  createHabitDefinition,
  dailyHabitStatus,
  getHabitCatalogItem,
  habitDailyLogId,
  migrateLegacyWellbeing,
  validateHabitSelection,
} from './habitSystem.js';

export const VIGOR_FULL_DAY = 1;
const MIGRATION_KEY = 'personalized_habits_migrated_v1';
const MODEL_MIGRATION_KEY = 'personalized_habits_model_v2';
const CONFIG_KEY = 'personalized_habits_config_v1';
const MINIMUM_KEY = 'personalized_habits_minimum_percent';

function scope(repository = progressRepository) {
  return { userId: repository.userId(), contestId: repository.contestId() };
}

function isDefinition(row) {
  return Boolean(row?.habitId && row?.id?.startsWith('habit:'));
}

function normalizeDefinition(row, userId, contestId) {
  const normalized = createHabitDefinition({
    ...row,
    userId,
    contestId,
    now: row.createdAt || row.created_at || new Date().toISOString(),
  });
  normalized.createdAt = row.createdAt || row.created_at || normalized.createdAt;
  normalized.updatedAt = row.updatedAt || row.updated_at || normalized.updatedAt;
  return normalized;
}

export async function ensureWellbeingHabits(repository = progressRepository) {
  const existing = await repository.getAll(STORES.wellbeingHabits);
  if (existing.some(isDefinition)) {
    const { userId, contestId } = scope(repository);
    const definitions = existing.filter(isDefinition).map((row) => normalizeDefinition(row, userId, contestId));
    if (!await repository.getMeta(MODEL_MIGRATION_KEY)) {
      await repository.putMany(STORES.wellbeingHabits, definitions);
      await repository.setMeta(MODEL_MIGRATION_KEY, {
        completedAt: new Date().toISOString(),
        normalizedDefinitions: definitions.length,
      });
    }
    return definitions;
  }

  if (await repository.getMeta(MIGRATION_KEY)) return [];
  const oldLogs = await repository.getAll(STORES.wellbeingLogs);
  const { userId, contestId } = scope(repository);
  const migrated = migrateLegacyWellbeing({
    habits: existing,
    logs: oldLogs,
    userId,
    contestId,
    now: new Date().toISOString(),
  });

  if (migrated.definitions.length) {
    await repository.putMany(STORES.wellbeingHabits, migrated.definitions);
    await repository.putMany(STORES.wellbeingLogs, migrated.logs);
  }
  await repository.setMeta(MIGRATION_KEY, {
    completedAt: new Date().toISOString(),
    convertedDefinitions: migrated.definitions.length,
    convertedLogs: migrated.logs.length,
    ignoredHabitIds: migrated.ignoredHabitIds,
  });
  return migrated.definitions;
}

export async function getHabitConfiguration(repository = progressRepository) {
  const definitions = await ensureWellbeingHabits(repository);
  const stored = await repository.getMeta(CONFIG_KEY);
  return {
    configured: Boolean(stored?.configured),
    skipped: Boolean(stored?.skipped),
    definitions: definitions.sort((a, b) => a.orderIndex - b.orderIndex),
    catalog: HABIT_CATALOG,
    minimumPercent: Number(await repository.getMeta(MINIMUM_KEY)) || DEFAULT_MINIMUM_PERCENT,
  };
}

export async function saveHabitConfiguration({
  selections = [],
  minimumPercent = DEFAULT_MINIMUM_PERCENT,
  skipped = false,
} = {}, repository = progressRepository) {
  const ids = selections.map((item) => item.habitId);
  const validation = validateHabitSelection(ids);
  if (!validation.canSave) throw new Error('HABIT_ACTIVE_LIMIT');
  if (new Set(ids).size !== ids.length) throw new Error('HABIT_DUPLICATE');
  for (const selection of selections) {
    const catalog = getHabitCatalogItem(selection.habitId);
    if (!catalog) throw new Error('HABIT_NOT_FOUND');
    if (!Array.isArray(selection.activeDays) || selection.activeDays.length === 0) {
      const error = new Error('HABIT_ACTIVE_DAYS_REQUIRED');
      error.habitId = selection.habitId;
      error.field = 'activeDays';
      throw error;
    }
    if (selection.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(selection.reminderTime)) {
      const error = new Error('HABIT_TIME_INVALID');
      error.habitId = selection.habitId;
      error.field = 'reminderTime';
      throw error;
    }
    if (!catalog.allowedTargets.includes(Number(selection.target))) {
      const error = new Error('HABIT_TARGET_INVALID');
      error.habitId = selection.habitId;
      error.field = 'target';
      throw error;
    }
  }
  const { userId, contestId } = scope(repository);
  const previous = await ensureWellbeingHabits(repository);
  const previousMap = new Map(previous.map((item) => [item.habitId, item]));
  const now = new Date().toISOString();
  const definitions = selections.slice(0, MAX_ACTIVE_HABITS).map((selection, index) => {
    const old = previousMap.get(selection.habitId);
    const next = createHabitDefinition({
      ...old,
      ...selection,
      userId,
      contestId,
      orderIndex: index,
      enabled: selection.enabled !== false,
      now,
    });
    if (old?.createdAt) next.createdAt = old.createdAt;
    return next;
  });
  const selected = new Set(definitions.map((item) => item.habitId));
  const disabled = previous
    .filter((item) => !selected.has(item.habitId))
    .map((item) => ({ ...item, enabled: false, updatedAt: now }));

  if (definitions.length || disabled.length) {
    await repository.putMany(STORES.wellbeingHabits, [...definitions, ...disabled]);
  }
  await repository.setMeta(CONFIG_KEY, {
    configured: !skipped,
    skipped: Boolean(skipped),
    updatedAt: now,
  });
  await repository.setMeta(MINIMUM_KEY, Math.max(1, Math.min(100, Number(minimumPercent) || DEFAULT_MINIMUM_PERCENT)));
  return getHabitConfiguration(repository);
}

export async function skipHabitConfiguration(repository = progressRepository) {
  return saveHabitConfiguration({ selections: [], skipped: true }, repository);
}

function normalizeStoredLog(log) {
  return {
    ...log,
    habitDefinitionId: log.habitDefinitionId || log.habit_id,
    localDate: log.localDate || log.date,
    completedValue: Number(log.completedValue ?? log.amount_done) || 0,
    actualValue: Number(log.actualValue ?? log.completedValue ?? log.amount_done) || 0,
    plannedValue: Number(log.plannedValue) || null,
    plannedTime: log.plannedTime || null,
    originalPlannedTime: log.originalPlannedTime || null,
    actualTime: log.actualTime || null,
    status: log.status || (log.completed ? 'completed' : Number(log.completedValue ?? log.amount_done) > 0 ? 'partial' : 'planned'),
    note: log.note || null,
  };
}

async function syncAcademicHabits(definitions, logs, date, repository) {
  const [dailyLog, routineBlocks, reviewQueue] = await Promise.all([
    repository.getById(STORES.dailyLogs, date),
    repository.getAll(STORES.routineBlocks),
    repository.getAll(STORES.reviewQueue),
  ]);
  const todayBlocks = routineBlocks.filter((block) => (block.date || block.blockDate) === date);
  const reviewsCompleted = todayBlocks.filter((block) => (
    ['revisao', 'revisao_fila'].includes(block.activityType) && block.status === 'completed'
  )).length + reviewQueue.filter((item) => (
    String(item.lastReviewedAt || '').slice(0, 10) === date
  )).length;
  const priorityCompleted = todayBlocks.some((block) => (
    block.status === 'completed' && (block.isPriority || block.priority === 'primary')
  ));
  const nextLogs = applyAcademicAutomation({
    definitions,
    logs,
    date,
    signals: {
      questionsCompleted: Number(dailyLog?.completed_amount) || 0,
      reviewsCompleted,
      priorityCompleted,
    },
  });
  const existing = new Map(logs.map((log) => [log.id, JSON.stringify(log)]));
  const changed = nextLogs.filter((log) => existing.get(log.id) !== JSON.stringify(log));
  if (changed.length) await repository.putMany(STORES.wellbeingLogs, changed);
  return nextLogs;
}

export async function getHabitSystemState(date = localDateKey(), repository = progressRepository) {
  const configuration = await getHabitConfiguration(repository);
  const definitions = configuration.definitions.filter((item) => item.enabled !== false);
  let logs = (await repository.getAll(STORES.wellbeingLogs)).map(normalizeStoredLog);
  logs = await syncAcademicHabits(definitions, logs, date, repository);
  const status = dailyHabitStatus({
    definitions,
    logs,
    date,
    minimumPercent: configuration.minimumPercent,
  });
  const consistency = calculateHabitConsistency({
    definitions,
    logs,
    today: date,
    minimumPercent: configuration.minimumPercent,
  });
  const todayLogs = new Map(logs
    .filter((log) => log.localDate === date)
    .map((log) => [log.habitDefinitionId, log]));
  const cards = definitions
    .filter((definition) => {
      const day = new Date(`${date}T12:00:00`).getDay();
      return definition.activeDays.includes(day);
    })
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((definition) => {
      const catalog = getHabitCatalogItem(definition.habitId);
      const log = todayLogs.get(definition.id) || createHabitDailyLog({
        definition,
        localDate: date,
        completedValue: 0,
      });
      const done = Number(log.completedValue) || 0;
      const target = Number(definition.target) || 1;
      return {
        definition,
        catalog,
        habit: {
          id: definition.id,
          habitId: definition.habitId,
          name: catalog?.label || definition.habitId,
          icon: catalog?.icon || '•',
          unit: definition.unit,
          daily_target: target,
          category: catalog?.category || 'wellbeing',
          enabled: definition.enabled,
        },
        log,
        done,
        target,
        pct: Math.min(100, Math.round((done / target) * 100)),
        completed: Boolean(log.completed),
        status: log.status || (log.completed ? 'completed' : done > 0 ? 'partial' : 'planned'),
        plannedTime: log.plannedTime || definition.reminderTime,
        actualTime: log.actualTime || null,
        automatic: log.source === HABIT_SOURCES.ACADEMIC_AUTO,
      };
    });
  return {
    date,
    cards,
    logs,
    configuration,
    consistency,
    doneCount: status.completed,
    total: status.planned,
    allDone: status.allCompleted,
    minimumReached: status.minimumReached,
    vigor: Number(await repository.getMeta('wellbeing_vigor')) || 0,
  };
}

export async function getTodayWellbeingState(repository = progressRepository) {
  const state = await getHabitSystemState(localDateKey(), repository);
  return { ...state, today: state.date };
}

export function logId(habitId, date) {
  const definitionId = String(habitId).startsWith('habit:') ? habitId : `habit:${habitId}`;
  return habitDailyLogId(definitionId, date);
}

export async function setHabitAmountForDate(
  definitionId,
  amount,
  date = localDateKey(),
  details = {},
  repository = progressRepository,
) {
  const definitions = await ensureWellbeingHabits(repository);
  const definition = definitions.find((item) => item.id === definitionId || item.habitId === definitionId);
  if (!definition) throw new Error('Hábito não encontrado');
  const existing = await repository.getById(STORES.wellbeingLogs, habitDailyLogId(definition.id, date));
  const row = createHabitDailyLog({
    definition,
    localDate: date,
    completedValue: amount,
    source: HABIT_SOURCES.MANUAL,
    plannedTime: details.plannedTime || existing?.plannedTime || definition.reminderTime,
    originalPlannedTime: details.originalPlannedTime || existing?.originalPlannedTime,
    actualTime: details.actualTime,
    status: details.status,
    note: details.note,
    quality: details.quality,
    skipReason: details.skipReason,
  });
  await repository.put(STORES.wellbeingLogs, row);
  if (date === localDateKey()) return grantVigorIfReady(repository);
  return { saved: true, row };
}

export async function setHabitAmount(definitionId, amount, repository = progressRepository) {
  return setHabitAmountForDate(definitionId, amount, localDateKey(), {}, repository);
}

export async function incrementHabitForDate(
  definitionId,
  delta = 1,
  date = localDateKey(),
  repository = progressRepository,
) {
  const id = String(definitionId).startsWith('habit:') ? definitionId : `habit:${definitionId}`;
  const existing = await repository.getById(STORES.wellbeingLogs, habitDailyLogId(id, date));
  return setHabitAmountForDate(
    id,
    Math.max(0, (Number(existing?.completedValue ?? existing?.amount_done) || 0) + delta),
    date,
    {},
    repository,
  );
}

export async function incrementHabit(definitionId, delta = 1, repository = progressRepository) {
  return incrementHabitForDate(definitionId, delta, localDateKey(), repository);
}

export async function toggleHabitForDate(definitionId, date = localDateKey(), repository = progressRepository) {
  const definitions = await ensureWellbeingHabits(repository);
  const definition = definitions.find((item) => item.id === definitionId || item.habitId === definitionId);
  if (!definition) throw new Error('Hábito não encontrado');
  const existing = await repository.getById(
    STORES.wellbeingLogs,
    habitDailyLogId(definition.id, date),
  );
  const done = existing?.completed ? 0 : definition.target;
  return setHabitAmountForDate(definition.id, done, date, {
    actualTime: done ? new Date().toTimeString().slice(0, 5) : null,
  }, repository);
}

export async function toggleHabit(definitionId, repository = progressRepository) {
  return toggleHabitForDate(definitionId, localDateKey(), repository);
}

export const HOME_HABIT_QUICK_ACTIONS = Object.freeze({
  TOGGLE: 'toggle',
  INCREMENT_WATER: 'increment_water',
  OPEN_RECORD: 'open_record',
  READ_ONLY: 'read_only',
});

export function resolveHomeHabitQuickAction(card = {}) {
  const definition = card.definition || {};
  const recordType = definition.recordType || card.catalog?.recordType;
  if (card.automatic || recordType === HABIT_RECORD_TYPES.AUTOMATIC) {
    return { type: HOME_HABIT_QUICK_ACTIONS.READ_ONLY, mutates: false };
  }
  if (definition.habitId === 'water') {
    return { type: HOME_HABIT_QUICK_ACTIONS.INCREMENT_WATER, delta: 1, mutates: true };
  }
  if (recordType === HABIT_RECORD_TYPES.BOOLEAN) {
    return { type: HOME_HABIT_QUICK_ACTIONS.TOGGLE, mutates: true };
  }
  return { type: HOME_HABIT_QUICK_ACTIONS.OPEN_RECORD, mutates: false };
}

export async function performHomeHabitQuickAction(card, {
  date = localDateKey(),
  repository = progressRepository,
  increment = incrementHabitForDate,
  toggle = toggleHabitForDate,
  openRecord = null,
} = {}) {
  const definitionId = card?.definition?.id || card?.habit?.id;
  if (!definitionId) throw new Error('Hábito não encontrado');
  const action = resolveHomeHabitQuickAction(card);

  if (action.type === HOME_HABIT_QUICK_ACTIONS.READ_ONLY) {
    return { ...action, handled: false, definitionId };
  }
  if (action.type === HOME_HABIT_QUICK_ACTIONS.OPEN_RECORD) {
    openRecord?.(definitionId);
    return { ...action, handled: true, definitionId };
  }
  if (action.type === HOME_HABIT_QUICK_ACTIONS.INCREMENT_WATER) {
    await increment(definitionId, 1, date, repository);
    return { ...action, handled: true, definitionId };
  }

  await toggle(definitionId, date, repository);
  return { ...action, handled: true, definitionId };
}

export async function skipHabitForDate(definitionId, date = localDateKey(), repository = progressRepository) {
  return setHabitAmountForDate(definitionId, 0, date, {
    status: 'skipped',
    skipReason: 'Exceção somente para este dia',
  }, repository);
}

export async function recordHabitDetails(definitionId, details = {}, date = localDateKey(), repository = progressRepository) {
  const value = Number(details.actualValue ?? details.completedValue) || 0;
  return setHabitAmountForDate(definitionId, value, date, details, repository);
}

export async function completeMicroPractice(definitionId, amount = null, repository = progressRepository) {
  const definitions = await ensureWellbeingHabits(repository);
  const definition = definitions.find((item) => item.id === definitionId || item.habitId === definitionId);
  if (!definition) throw new Error('Hábito não encontrado');
  const catalog = getHabitCatalogItem(definition.habitId);
  const toggleUnits = ['registro', 'planejamento', 'missão'];
  if (toggleUnits.includes(definition.unit)) return toggleHabit(definition.id, repository);
  const step = amount ?? (catalog?.id === 'exercise' ? 5 : 1);
  return incrementHabit(definition.id, step, repository);
}

export async function grantVigorIfReady(repository = progressRepository) {
  const state = await getTodayWellbeingState(repository);
  const dailyKey = `habit_vigor_daily:${state.today}`;
  const previousBest = Number(await repository.getMeta(dailyKey)) || 0;
  const consolidated = calculateDailyVigor({
    status: state.consistency.today,
    comeback: state.consistency.comebackCount > 0 && state.consistency.streakCurrent === 1,
  });
  if (consolidated <= previousBest) {
    return { vigor: 0, granted: false, already: true, totalVigor: state.vigor, bonus: 0 };
  }
  const difference = Number((consolidated - previousBest).toFixed(2));
  const next = Number((state.vigor + difference).toFixed(2));
  await repository.setMeta(dailyKey, consolidated);
  await repository.setMeta('wellbeing_vigor', next);
  return { vigor: difference, granted: difference > 0, totalVigor: next, bonus: 0 };
}

export async function grantWellbeingBonusIfReady(repository = progressRepository) {
  const result = await grantVigorIfReady(repository);
  return { ...result, bonus: 0, leveledUp: false };
}

export async function spendVigor(amount = 1, repository = progressRepository) {
  const value = Math.max(0, Number(amount) || 0);
  const previous = Number(await repository.getMeta('wellbeing_vigor')) || 0;
  if (previous < value) throw new Error('Vigor insuficiente.');
  const next = Number((previous - value).toFixed(2));
  await repository.setMeta('wellbeing_vigor', next);
  return { spent: value, totalVigor: next };
}

export const WELLBEING_ACADEMIC_SIDE_EFFECTS = Object.freeze({
  grantsXp: false,
  changesLevel: false,
  changesStars: false,
  changesMastery: false,
  changesEdital: false,
  canConvertVigorToXp: false,
  evolvesCharacter: false,
});

export const HABIT_COLORS = {
  study: '#f59e0b',
  wellbeing: '#a78bfa',
  agua: '#38bdf8',
  exercicio: '#4ade80',
  alimentacao: '#fb923c',
  meditacao: '#a78bfa',
  sono: '#818cf8',
  outro: '#94a3b8',
};
