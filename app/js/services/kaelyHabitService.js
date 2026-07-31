import { localDateKey } from '../core/localDate.js';
import {
  HABIT_RECORD_TYPES,
  dailyHabitStatus,
  getHabitCatalogItem,
  isHabitPlannedOn,
  MAX_CONSISTENCY_SHIELDS,
} from '../core/habitSystem.js';
import { localPersonalRepository as progressRepository } from '../repositories/localPersonalRepository.js';

export const KAELY = Object.freeze({
  id: 'kaely',
  name: 'Kaely',
  title: 'Mentora da Resistência',
  fullName: 'Kaely — Mentora da Resistência',
  role: 'Sono, hidratação, movimento, pausas, recuperação e constância sustentável.',
  asset: 'assets/mentors/kaely-resistance.webp',
  fallbackAsset: 'assets/mentor/mentora.png?v1',
  assetPending: false,
});

export const CONSISTENCY_LEDGER_KEY = 'habit_consistency_shield_v1';
const WEEK_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDateKey(value);
}

export function startOfWeek(date) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - value.getDay());
  return localDateKey(value);
}

function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function logFor(definition, date, logs = []) {
  return logs.find((log) => (
    (log.habitDefinitionId || log.habit_id) === definition.id
    && (log.localDate || log.date) === date
  )) || null;
}

function visibleHabitName(definition, catalog) {
  if (definition.habitId === 'medication' && definition.discreteMode) return 'Medicação';
  return definition.privateLabel || catalog?.label || definition.habitId;
}

export function chooseKaelyGuidance(state = {}, nextHabit = null) {
  const cards = state.cards || [];
  const configuration = state.configuration || {};
  const consistency = state.consistency || {};
  const pending = cards.filter((card) => !card.completed && card.status !== 'skipped');
  const important = nextHabit?.card || pending[0];
  const returned = consistency.comebackCount > 0 && consistency.streakCurrent === 1;

  if (state.allDone && state.total > 0) {
    return {
      code: 'all_completed',
      title: 'Dia registrado',
      message: 'Todos os hábitos planejados para hoje foram registrados.',
      actionLabel: 'Ver histórico',
      action: 'history',
    };
  }
  if (returned) {
    return {
      code: 'comeback',
      title: 'Continuidade retomada',
      message: 'Ontem não aconteceu. Hoje a continuidade pode recomeçar.',
      actionLabel: 'Ver próximo hábito',
      action: 'agenda',
    };
  }
  if (important) {
    const label = important.catalog?.label || important.habit?.name || 'Próximo hábito';
    const time = important.definition?.reminderTime || important.plannedTime;
    return {
      code: 'pending',
      title: 'Hábitos que sustentam sua evolução',
      message: time ? `${label} está programado para ${time}.` : `${label} é o próximo passo possível.`,
      actionLabel: important.definition?.recordType === HABIT_RECORD_TYPES.QUANTITATIVE
        ? important.definition?.habitId === 'water' ? 'Adicionar um copo' : 'Informar valor'
        : important.definition?.habitId === 'sleep_schedule' ? 'Informar sono'
          : important.definition?.habitId === 'exercise' ? 'Iniciar treino'
            : `Confirmar ${label.toLocaleLowerCase('pt-BR')}`,
      action: 'record',
      definitionId: important.definition?.id,
    };
  }
  if (!configuration.configured) {
    return {
      code: 'configuration',
      title: 'Hábitos do seu jeito',
      message: 'Escolha os hábitos que deseja acompanhar. Você poderá ajustar tudo depois.',
      actionLabel: 'Configurar hábitos',
      action: 'configure',
    };
  }
  return {
    code: 'general',
    title: 'Hábitos que sustentam sua evolução',
    message: 'Seu corpo sustenta a mente que enfrentará a prova.',
    actionLabel: 'Ver meus hábitos',
    action: 'habits',
  };
}

export function buildHabitCalendar({
  definitions = [],
  logs = [],
  today = localDateKey(),
  minimumPercent = 60,
  days = 30,
  protectedDates = [],
} = {}) {
  const protectedSet = new Set(protectedDates);
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = addDays(today, index - days + 1);
    const status = dailyHabitStatus({ definitions, logs, date, minimumPercent });
    const dateLogs = logs.filter((log) => (log.localDate || log.date) === date);
    const partial = dateLogs.filter((log) => log.status === 'partial' || log.status === 'minimum').length;
    const skipped = dateLogs.filter((log) => log.status === 'skipped').length;
    return {
      ...status,
      partial,
      skipped,
      protected: protectedSet.has(date),
      state: status.allCompleted
        ? 'completed'
        : status.completed > 0 || partial > 0
          ? 'partial'
          : protectedSet.has(date)
            ? 'protected'
            : status.planned > 0
              ? 'missed'
              : 'unplanned',
    };
  });
}

export function buildWeekStrip({
  definitions = [],
  logs = [],
  selectedDate = localDateKey(),
  today = localDateKey(),
  minimumPercent = 60,
} = {}) {
  const first = startOfWeek(selectedDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(first, index);
    const status = dailyHabitStatus({ definitions, logs, date, minimumPercent });
    return {
      ...status,
      date,
      label: WEEK_LABELS[new Date(`${date}T12:00:00`).getDay()],
      isToday: date === today,
      selected: date === selectedDate,
      delayed: date < today && status.planned > status.completed,
    };
  });
}

export function habitRoutineEntries(definitions = [], date = localDateKey(), logs = []) {
  const uniqueDefinitions = [...new Map(
    definitions.map((definition) => [definition.id, definition]),
  ).values()];
  return uniqueDefinitions
    .filter((definition) => isHabitPlannedOn(definition, date))
    .map((definition) => {
      const catalog = getHabitCatalogItem(definition.habitId);
      const log = logFor(definition, date, logs);
      const plannedTime = log?.plannedTime || definition.reminderTime || definition.desiredSleepTime || definition.desiredWakeTime;
      return {
        id: `habit-reminder:${definition.id}:${date}`,
        definitionId: definition.id,
        definition,
        catalog,
        date,
        time: plannedTime || null,
        title: visibleHabitName(definition, catalog),
        category: catalog?.category || 'wellbeing',
        source: definition.recordType === HABIT_RECORD_TYPES.AUTOMATIC ? 'automático' : 'programação pessoal',
        status: log?.status || (log?.completed ? 'completed' : 'planned'),
        log,
      };
    })
    .sort((a, b) => {
      if (!a.time && b.time) return 1;
      if (a.time && !b.time) return -1;
      return String(a.time || '').localeCompare(String(b.time || ''))
        || Number(a.definition.orderIndex) - Number(b.definition.orderIndex);
    });
}

export function agendaState(entry, { now = new Date(), today = localDateKey(now) } = {}) {
  if (entry.status === 'completed') return 'concluído';
  if (entry.status === 'partial') return 'parcial';
  if (entry.status === 'minimum') return 'mínimo possível';
  if (entry.status === 'skipped') return 'ignorado hoje';
  if (entry.date < today) return 'não realizado';
  const planned = timeToMinutes(entry.time);
  const current = now.getHours() * 60 + now.getMinutes();
  if (entry.date === today && planned != null && planned < current) return 'atrasado';
  if (entry.date === today && planned != null) return 'próximo';
  return entry.time ? 'programado' : 'sem horário';
}

export function nextHabitFromAgenda(entries = [], options = {}) {
  return entries.find((entry) => !['completed', 'skipped'].includes(entry.status)
    && !['concluído', 'ignorado hoje'].includes(agendaState(entry, options))) || null;
}

export function buildHabitHistory({
  definitions = [],
  logs = [],
  today = localDateKey(),
  minimumPercent = 60,
} = {}) {
  const weekStart = startOfWeek(today);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const states = days.map((date) => dailyHabitStatus({ definitions, logs, date, minimumPercent }));
  const partialDates = new Set(logs
    .filter((log) => days.includes(log.localDate || log.date)
      && ['partial', 'minimum'].includes(log.status))
    .map((log) => log.localDate || log.date));
  const planned = states.reduce((sum, state) => sum + state.planned, 0);
  const completed = states.reduce((sum, state) => sum + state.completed, 0);
  const byHabit = definitions.map((definition) => {
    const catalog = getHabitCatalogItem(definition.habitId);
    const plannedDates = days.filter((date) => isHabitPlannedOn(definition, date) && date <= today);
    const completedDates = plannedDates.filter((date) => logFor(definition, date, logs)?.completed);
    return {
      definitionId: definition.id,
      label: visibleHabitName(definition, catalog),
      planned: plannedDates.length,
      completed: completedDates.length,
      rate: plannedDates.length ? Math.round(completedDates.length / plannedDates.length * 100) : 0,
    };
  }).filter((item) => item.planned > 0);
  const sorted = [...byHabit].sort((a, b) => b.rate - a.rate || b.completed - a.completed);
  return {
    planned,
    completed,
    rate: planned ? Math.round(completed / planned * 100) : 0,
    completeDays: states.filter((state) => state.allCompleted).length,
    partialDays: states.filter((state) => !state.allCompleted
      && (state.completed > 0 || partialDates.has(state.date))).length,
    emptyDays: states.filter((state) => state.planned > 0 && state.completed === 0).length,
    mostConsistent: sorted[0] || null,
    needsAttention: sorted.at(-1) || null,
    byHabit,
  };
}

export function buildHabitAnalysis({
  definitions = [],
  logs = [],
  today = localDateKey(),
  days = 30,
} = {}) {
  const dates = Array.from({ length: days }, (_, index) => addDays(today, index - days + 1));
  return definitions.map((definition) => {
    const catalog = getHabitCatalogItem(definition.habitId);
    const plannedDates = dates.filter((date) => isHabitPlannedOn(definition, date));
    const habitLogs = plannedDates.map((date) => ({ date, log: logFor(definition, date, logs) }));
    const completed = habitLogs.filter(({ log }) => log?.completed).length;
    const partial = habitLogs.filter(({ log }) => ['partial', 'minimum'].includes(log?.status)).length;
    const missesByDay = new Map();
    habitLogs.filter(({ log }) => !log?.completed).forEach(({ date }) => {
      const day = WEEK_LABELS[new Date(`${date}T12:00:00`).getDay()];
      missesByDay.set(day, (missesByDay.get(day) || 0) + 1);
    });
    const frequentTime = habitLogs
      .map(({ log }) => log?.actualTime)
      .filter(Boolean)
      .sort()[0] || null;
    const weakDays = [...missesByDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([day]) => day);
    return {
      definitionId: definition.id,
      label: visibleHabitName(definition, catalog),
      planned: plannedDates.length,
      completed,
      partial,
      missed: Math.max(0, plannedDates.length - completed - partial),
      rate: plannedDates.length ? Math.round(completed / plannedDates.length * 100) : 0,
      frequentTime,
      weakDays,
      suggestion: weakDays.length
        ? `Os registros faltam mais em ${weakDays.join(' e ')}. Revise o horário ou a janela nesses dias.`
        : 'Mantenha a programação que está funcionando para você.',
    };
  });
}

export function evaluateConsistencyLedger({
  ledger = {},
  dailyStates = [],
  today = localDateKey(),
} = {}) {
  const next = {
    shields: Math.min(MAX_CONSISTENCY_SHIELDS, Math.max(0, Number(ledger.shields) || 0)),
    protectedDates: [...new Set(ledger.protectedDates || [])],
    awardedWeeks: [...new Set(ledger.awardedWeeks || [])],
    evaluatedDates: [...new Set(ledger.evaluatedDates || [])],
    updatedAt: ledger.updatedAt || null,
  };
  const byDate = new Map(dailyStates.map((state) => [state.date, state]));
  const protectedSet = new Set(next.protectedDates);
  const evaluatedSet = new Set(next.evaluatedDates);

  for (const state of dailyStates.filter((item) => item.date < today).sort((a, b) => a.date.localeCompare(b.date))) {
    if (evaluatedSet.has(state.date) || state.planned === 0) continue;
    if (!state.minimumReached && next.shields > 0) {
      next.shields -= 1;
      protectedSet.add(state.date);
    }
    evaluatedSet.add(state.date);
  }

  const thisWeek = startOfWeek(today);
  const priorWeek = addDays(thisWeek, -7);
  if (!next.awardedWeeks.includes(priorWeek)) {
    const fulfilled = Array.from({ length: 7 }, (_, index) => byDate.get(addDays(priorWeek, index)))
      .filter((state) => state?.minimumReached).length;
    if (fulfilled >= 6) {
      next.shields = Math.min(MAX_CONSISTENCY_SHIELDS, next.shields + 1);
      next.awardedWeeks.push(priorWeek);
    }
  }
  next.protectedDates = [...protectedSet].sort();
  next.evaluatedDates = [...evaluatedSet].sort();
  return next;
}

export async function refreshKaelyConsistency(state, repository = progressRepository) {
  const previous = await repository.getMeta(CONSISTENCY_LEDGER_KEY) || {};
  const dailyStates = buildHabitCalendar({
    definitions: state.configuration.definitions.filter((item) => item.enabled !== false),
    logs: state.logs,
    today: state.date,
    minimumPercent: state.configuration.minimumPercent,
    days: 45,
    protectedDates: previous.protectedDates,
  });
  const next = evaluateConsistencyLedger({ ledger: previous, dailyStates, today: state.date });
  if (JSON.stringify(previous) !== JSON.stringify(next)) {
    next.updatedAt = new Date().toISOString();
    await repository.setMeta(CONSISTENCY_LEDGER_KEY, next);
  }
  return next;
}
