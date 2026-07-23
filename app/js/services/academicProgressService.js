import { STORES } from '../core/types.js';
import { applyXp, comboBonus } from '../core/progression.js';
import { progressRepository } from '../repositories/progressRepository.js';

export const XP_REWARDS = Object.freeze({
  CORRECT_ANSWER: 10,
  OFFICIAL_BATTLE_COMPLETED: 25,
  REVIEW_COMPLETED: 20,
  DAILY_GOAL_COMPLETED: 150,
  FOCUS_15_MIN: 20,
  FOCUS_30_MIN: 45,
  FOCUS_60_MIN: 100,
});

function eventKey(eventId) {
  return `xp_event:${eventId}`;
}

export function focusXpForMinutes(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (value >= 60) return XP_REWARDS.FOCUS_60_MIN;
  if (value >= 30) return XP_REWARDS.FOCUS_30_MIN;
  if (value >= 15) return XP_REWARDS.FOCUS_15_MIN;
  return 0;
}

export function battleXpBreakdown({
  correct = 0,
  maxCombo = 0,
  dailyGoalCompleted = false,
} = {}) {
  const breakdown = {
    correctAnswers: Math.max(0, Number(correct) || 0) * XP_REWARDS.CORRECT_ANSWER,
    battleCompleted: XP_REWARDS.OFFICIAL_BATTLE_COMPLETED,
    combo: comboBonus(maxCombo),
    dailyGoal: dailyGoalCompleted ? XP_REWARDS.DAILY_GOAL_COMPLETED : 0,
  };
  return {
    ...breakdown,
    total: Object.values(breakdown).reduce((sum, amount) => sum + amount, 0),
  };
}

/**
 * Concede XP uma única vez. O ID do evento fica no jogador e em um journal
 * versionado no store meta, permitindo retry sem duplicar a recompensa.
 */
export async function grantXpEvent({
  eventId,
  type,
  amount,
  occurredAt = new Date().toISOString(),
  breakdown = null,
}, {
  repository = progressRepository,
} = {}) {
  const normalizedId = String(eventId || '').trim();
  const normalizedAmount = Math.max(0, Number(amount) || 0);
  if (!normalizedId || !normalizedAmount) {
    return { granted: false, total: 0, player: null, event: null };
  }

  const key = eventKey(normalizedId);
  const stored = await repository.getById(STORES.meta, key);
  if (stored?.status === 'completed') {
    const player = (await repository.getAll(STORES.player))[0] || null;
    return { granted: false, total: Number(stored.amount) || 0, player, event: stored };
  }

  const event = {
    key,
    eventId: normalizedId,
    type: String(type || 'academic_activity'),
    amount: normalizedAmount,
    breakdown: breakdown ? structuredClone(breakdown) : null,
    status: 'processing',
    started_at: stored?.started_at || occurredAt,
    updated_at: occurredAt,
    completed_at: null,
  };
  if (!stored) await repository.put(STORES.meta, structuredClone(event));

  const player = (await repository.getAll(STORES.player))[0];
  if (!player) throw new Error('PLAYER_REQUIRED_FOR_XP');
  const processed = [...new Set(player.processed_xp_event_ids || [])];
  let granted = false;
  if (!processed.includes(normalizedId)) {
    applyXp(player, normalizedAmount);
    player.processed_xp_event_ids = [...processed, normalizedId].slice(-1000);
    player.updated_at = occurredAt;
    await repository.put(STORES.player, player);
    granted = true;
  }

  event.status = 'completed';
  event.updated_at = occurredAt;
  event.completed_at = occurredAt;
  await repository.put(STORES.meta, structuredClone(event));
  return { granted, total: normalizedAmount, player, event };
}

export async function grantBattleXp(input, options = {}) {
  const breakdown = battleXpBreakdown(input);
  return grantXpEvent({
    eventId: `battle:${input.battleId}`,
    type: 'official_battle_completed',
    amount: breakdown.total,
    occurredAt: input.occurredAt,
    breakdown,
  }, options);
}

export function battleActivityRecord({
  battleId,
  contestId = null,
  disciplineId,
  subtopicId,
  startedAt,
  finishedAt,
  activeSeconds,
}) {
  const seconds = Math.max(0, Math.min(6 * 60 * 60, Math.round(Number(activeSeconds) || 0)));
  const date = String(finishedAt || startedAt || new Date().toISOString()).slice(0, 10);
  return {
    id: `academic_battle:${battleId}`,
    type: 'battle',
    contestId,
    blockId: null,
    date,
    subjectId: disciplineId,
    disciplineId,
    subtopicId,
    startedAt: startedAt || finishedAt,
    endedAt: finishedAt,
    finishedAt,
    durationSeconds: seconds,
    elapsedSeconds: seconds,
    status: 'completed',
    valid: seconds > 0,
    source: 'official_battle',
    updatedAt: finishedAt,
  };
}

export async function recordBattleActivity(input, {
  repository = progressRepository,
} = {}) {
  const record = battleActivityRecord(input);
  await repository.put(STORES.studySessions, record);
  return record;
}
