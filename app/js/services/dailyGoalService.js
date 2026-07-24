import { STORES } from '../core/types.js';
import { localDateKey } from '../core/localDate.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { grantXpEvent, XP_REWARDS } from './academicProgressService.js';

export const DAILY_GOAL_TYPES = Object.freeze(['questoes', 'batalhas', 'tempo']);

export function normalizeDailyGoalType(value) {
  return DAILY_GOAL_TYPES.includes(value) ? value : 'questoes';
}

function activityAmount(goalType, activity) {
  const type = String(activity.type || '');
  if (goalType === 'questoes') {
    if (type !== 'battle' && type !== 'review') return 0;
    return Math.max(0, Number(activity.questionCount) || 0);
  }
  if (goalType === 'batalhas') {
    return type === 'battle' ? Math.min(1, Math.max(0, Number(activity.battleCount) || 0)) : 0;
  }
  if (goalType === 'tempo') {
    return Math.max(0, Number(activity.activeMinutes) || 0);
  }
  return 0;
}

function statusFor(amount, planned) {
  if (planned > 0 && amount >= planned) return 'cumprido';
  if (amount > 0) return 'parcial';
  return 'pendente';
}

async function routineForDate(repository, date) {
  const routines = await repository.getAll(STORES.routines);
  const dayOfWeek = date.getDay();
  return routines.find((item) => (
    Number(item.day_of_week) === dayOfWeek && item.enabled !== false
  )) || {
    day_of_week: dayOfWeek,
    enabled: true,
    goal_type: 'questoes',
    goal_amount: 30,
  };
}

async function ensureGoalBonus(log, repository, occurredIso) {
  if (log.status !== 'cumprido') return { granted: false, player: null };
  const eventId = `daily_goal:${log.date}`;
  const result = await grantXpEvent({
    eventId,
    type: 'daily_goal_completed',
    amount: XP_REWARDS.DAILY_GOAL_COMPLETED,
    occurredAt: occurredIso,
  }, { repository });
  if (log.meta_bonus_granted !== true) {
    log.meta_bonus_granted = true;
    log.daily_goal_xp_event_id = eventId;
    log.xp_earned = (Number(log.xp_earned) || 0) + (result.granted ? XP_REWARDS.DAILY_GOAL_COMPLETED : 0);
    log.updated_at = occurredIso;
    await repository.put(STORES.dailyLogs, log);
  }
  return result;
}

export async function applyDailyGoalActivity(activity = {}, {
  repository = progressRepository,
} = {}) {
  const eventId = String(activity.eventId || '').trim();
  const occurred = activity.occurredAt instanceof Date
    ? activity.occurredAt
    : new Date(activity.occurredAt || Date.now());
  if (!eventId || Number.isNaN(occurred.getTime())) {
    throw new Error('DAILY_GOAL_EVENT_REQUIRED');
  }

  const date = localDateKey(occurred);
  const occurredIso = occurred.toISOString();
  const routine = await routineForDate(repository, occurred);
  const goalType = normalizeDailyGoalType(routine.goal_type);
  const plannedAmount = routine.enabled === false
    ? 0
    : Math.max(0, Number(routine.goal_amount) || 0);
  let log = await repository.getById(STORES.dailyLogs, date);
  if (!log) {
    log = {
      date,
      goal_type: goalType,
      planned_amount: plannedAmount,
      completed_amount: 0,
      status: 'pendente',
      xp_earned: 0,
      meta_bonus_granted: false,
      processed_event_ids: [],
      processed_battle_ids: [],
      processed_review_ids: [],
      processed_focus_ids: [],
    };
  }

  log.goal_type = normalizeDailyGoalType(log.goal_type || goalType);
  if (log.planned_amount == null) log.planned_amount = plannedAmount;
  const processed = [...new Set(log.processed_event_ids || [])];
  const previousAmount = Math.max(0, Number(log.completed_amount) || 0);
  const previousStatus = log.status || statusFor(previousAmount, Number(log.planned_amount) || 0);

  if (processed.includes(eventId)) {
    const bonus = await ensureGoalBonus(log, repository, occurredIso);
    return {
      applied: false,
      completedNow: false,
      goalType: log.goal_type,
      previousAmount,
      completedAmount: previousAmount,
      plannedAmount: Number(log.planned_amount) || 0,
      status: log.status,
      log,
      bonus,
    };
  }

  const delta = activityAmount(log.goal_type, activity);
  const completedAmount = previousAmount + delta;
  log.completed_amount = completedAmount;
  log.status = statusFor(completedAmount, Number(log.planned_amount) || 0);
  log.processed_event_ids = [...processed, eventId].slice(-1000);
  if (activity.type === 'battle') {
    const battleId = eventId.replace(/^battle:/, '');
    log.processed_battle_ids = [...new Set([...(log.processed_battle_ids || []), battleId])];
    if (delta > 0) log.domain_challenges_completed = (Number(log.domain_challenges_completed) || 0) + 1;
  } else if (activity.type === 'review') {
    log.processed_review_ids = [...new Set([
      ...(log.processed_review_ids || []),
      eventId.replace(/^review:/, ''),
    ])];
  } else if (activity.type === 'focus' || activity.type === 'block') {
    log.processed_focus_ids = [...new Set([...(log.processed_focus_ids || []), eventId])];
  }
  log.updated_at = occurredIso;
  await repository.put(STORES.dailyLogs, log);

  const completedNow = previousStatus !== 'cumprido' && log.status === 'cumprido';
  const bonus = await ensureGoalBonus(log, repository, occurredIso);
  return {
    applied: true,
    completedNow,
    goalType: log.goal_type,
    previousAmount,
    completedAmount,
    plannedAmount: Number(log.planned_amount) || 0,
    status: log.status,
    log,
    bonus,
  };
}
