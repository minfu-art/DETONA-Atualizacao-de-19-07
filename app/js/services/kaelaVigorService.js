import { localDateKey } from '../core/localDate.js';
import {
  dailyHabitStatus,
  getHabitCatalogItem,
  isHabitPlannedOn,
  MAX_CONSISTENCY_SHIELDS,
} from '../core/habitSystem.js';
import { progressRepository } from '../repositories/progressRepository.js';

export const KAELA = Object.freeze({
  id: 'kaela',
  name: 'Kaela — Guardiã do Vigor',
  role: 'Hábitos, constância, corpo, mente, retomada e disciplina sustentável.',
  asset: 'assets/helpers/kaela-vigor.webp',
  fallbackAsset: 'assets/mentor/mentora.png?v1',
  assetPending: true,
});

export const CONSISTENCY_LEDGER_KEY = 'habit_consistency_shield_v1';

function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDateKey(value);
}

function startOfWeek(date) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return localDateKey(value);
}

export function chooseKaelaGuidance(state = {}) {
  const cards = state.cards || [];
  const configuration = state.configuration || {};
  const consistency = state.consistency || {};
  const pending = cards.filter((card) => !card.completed);
  const important = pending.find((card) => card.catalog?.category === 'study') || pending[0];
  const almost = state.total > 0 && state.doneCount >= Math.max(1, Math.ceil(state.total * 0.4));
  const returned = consistency.comebackCount > 0 && consistency.streakCurrent === 1;

  if (state.allDone && state.total > 0) {
    return {
      priority: 1,
      code: 'all_completed',
      title: 'Rituais concluídos',
      message: 'Você cuidou de todos os rituais de hoje. Leve essa base para o estudo.',
      actionLabel: 'Concluir preparação',
      action: 'home',
    };
  }
  if (returned) {
    return {
      priority: 2,
      code: 'comeback',
      title: 'Você voltou',
      message: 'Você voltou depois de um dia difícil. Isso também é disciplina.',
      actionLabel: 'Ver meus rituais',
      action: 'rituals',
    };
  }
  if (almost && important) {
    return {
      priority: 3,
      code: 'almost',
      title: 'Falta pouco',
      message: `Você já concluiu ${state.doneCount} de ${state.total} rituais. Falta ${important.catalog?.label || 'mais um passo'}.`,
      actionLabel: 'Marcar hábito',
      action: 'mark',
      definitionId: important.definition.id,
    };
  }
  if (important) {
    return {
      priority: 4,
      code: 'pending',
      title: 'Um passo sustentável',
      message: `${important.catalog?.label || 'Seu próximo ritual'} ainda está pendente. Faça a versão possível de hoje.`,
      actionLabel: 'Marcar hábito',
      action: 'mark',
      definitionId: important.definition.id,
    };
  }
  if (!configuration.configured) {
    return {
      priority: 5,
      code: 'configuration',
      title: 'Rituais do seu jeito',
      message: 'Escolha os hábitos que fazem sentido para sua rotina. Você pode mudar tudo depois.',
      actionLabel: 'Configurar hábitos',
      action: 'configure',
    };
  }
  return {
    priority: 6,
    code: 'general',
    title: 'Disciplina sustentável',
    message: 'Seu corpo sustenta a mente que enfrentará a prova.',
    actionLabel: 'Ver meus rituais',
    action: 'rituals',
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
    return {
      ...status,
      protected: protectedSet.has(date),
      state: status.minimumReached
        ? 'completed'
        : protectedSet.has(date)
          ? 'protected'
          : status.planned > 0
            ? 'missed'
            : 'unplanned',
    };
  });
}

export function habitRoutineEntries(definitions = [], date = localDateKey()) {
  const unique = new Map();
  for (const definition of definitions) {
    if (!definition.reminderTime || !isHabitPlannedOn(definition, date)) continue;
    const catalog = getHabitCatalogItem(definition.habitId);
    const id = `habit-reminder:${definition.id}:${date}`;
    unique.set(id, {
      id,
      definitionId: definition.id,
      date,
      time: definition.reminderTime,
      title: catalog?.label || definition.habitId,
      source: 'habit_reminder',
      status: 'planned',
    });
  }
  return [...unique.values()].sort((a, b) => a.time.localeCompare(b.time));
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

  // Somente dias anteriores são encerrados automaticamente.
  for (const state of dailyStates.filter((item) => item.date < today).sort((a, b) => a.date.localeCompare(b.date))) {
    if (evaluatedSet.has(state.date) || state.planned === 0) continue;
    if (!state.minimumReached && next.shields > 0) {
      next.shields -= 1;
      protectedSet.add(state.date);
    }
    evaluatedSet.add(state.date);
  }

  // Uma semana encerrada com 6 ou 7 dias cumpridos gera um escudo uma única vez.
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

export async function refreshKaelaConsistency(state, repository = progressRepository) {
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
