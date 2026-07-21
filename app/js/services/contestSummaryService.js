import { getAll } from '../core/db.js';
import { STORES } from '../core/types.js';

export class ContestSummaryService {
  async get(userId, contestId) {
    const players = await getAll(STORES.player, userId, contestId);
    const player = players[0];
    if (!player) return null;
    return {
      level: player.level ?? 0,
      xp: player.xp || 0,
      editalCompletionPct: player.mastery_pct || 0,
      streakDays: player.streak_days || 0,
      lastAccessAt: player.last_study_date || null,
    };
  }
}
