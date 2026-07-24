import { STORES } from '../core/types.js';
import { localDateKey, previousLocalDateKey } from '../core/localDate.js';
import { progressRepository } from '../repositories/progressRepository.js';

function streakEventKey(eventId) {
  return `study_day_event:${eventId}`;
}

export function applyStudyDayToPlayer(player, occurredAt = new Date()) {
  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const today = localDateKey(date);
  const yesterday = previousLocalDateKey(date);
  const previous = player.last_study_date || null;

  if (previous !== today) {
    player.streak_days = previous === yesterday
      ? Math.max(0, Number(player.streak_days) || 0) + 1
      : 1;
    player.last_study_date = today;
  }
  player.best_streak = Math.max(
    Number(player.best_streak) || 0,
    Number(player.streak_days) || 0,
  );
  return player;
}

export async function applyValidStudyDay({
  eventId,
  occurredAt = new Date(),
  valid = true,
  source = 'academic_activity',
} = {}, {
  repository = progressRepository,
} = {}) {
  const normalizedId = String(eventId || '').trim();
  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  if (!normalizedId || !valid || Number.isNaN(date.getTime())) {
    return { applied: false, valid: false, player: null, date: null };
  }

  const key = streakEventKey(normalizedId);
  const stored = await repository.getById(STORES.meta, key);
  const players = await repository.getAll(STORES.player);
  const player = players[0] || null;
  if (!player) {
    return { applied: false, valid: true, player: null, date: localDateKey(date) };
  }
  if (stored?.status === 'completed') {
    return { applied: false, valid: true, player, date: stored.date };
  }

  applyStudyDayToPlayer(player, date);
  const occurredIso = date.toISOString();
  player.updated_at = occurredIso;
  await repository.put(STORES.player, player);
  await repository.put(STORES.meta, {
    key,
    eventId: normalizedId,
    source,
    date: localDateKey(date),
    status: 'completed',
    completed_at: occurredIso,
    updated_at: occurredIso,
  });
  return { applied: true, valid: true, player, date: localDateKey(date) };
}
