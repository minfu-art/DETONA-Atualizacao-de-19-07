import { STORES } from '../core/types.js';
import { getMasterySpheres } from '../core/ssot.js';
import { migrateSubtopicMastery } from '../core/mastery.js';
import { buildEmblemCatalog } from '../data/emblemCatalog.js';
import { progressRepository } from '../repositories/progressRepository.js';

export const EARNED_EMBLEMS_KEY = 'earned_emblems_v1';

function unique(values) {
  return new Set(values.filter(Boolean)).size;
}

function completedOfficialBattles(subtopics, metaRows) {
  const journals = metaRows
    .map((row) => row?.value && row.key?.startsWith('battle_finalization:') ? row.value : row)
    .filter((row) => String(row?.key || '').startsWith('battle_finalization:'));
  const journalIds = new Set(journals.map((row) => row.battleId).filter(Boolean));
  const completedJournals = journals
    .filter((row) => row.status === 'completed')
    .map((row) => row.battleId);
  const legacyIds = subtopics.flatMap((subtopic) => {
    const history = subtopic.attempt_history || subtopic.historicoTentativas || subtopic.historico || [];
    return history
      .map((attempt) => attempt?.battleId)
      .filter((battleId) => battleId && !journalIds.has(battleId));
  });
  return unique([...completedJournals, ...legacyIds]);
}

export function collectEmblemMetrics({
  player = {},
  subtopics = [],
  verticalized = [],
  dailyLogs = [],
  metaRows = [],
} = {}) {
  const normalizedSubtopics = subtopics.map(migrateSubtopicMastery);
  const subtopicMap = Object.fromEntries(normalizedSubtopics.map((subtopic) => [subtopic.id, subtopic]));
  const masteredSubtopics = normalizedSubtopics.filter((subtopic) => subtopic.best_accuracy >= 100).length;
  const fulfilledDates = unique(dailyLogs
    .filter((log) => log.status === 'cumprido')
    .map((log) => log.date));
  const allSpheresComplete = normalizedSubtopics.length > 0
    && masteredSubtopics === normalizedSubtopics.length
    && verticalized.length > 0
    && verticalized.every((item) => getMasterySpheres(item, subtopicMap[item.subtopic_id]).complete);

  return {
    missions: completedOfficialBattles(normalizedSubtopics, metaRows),
    focus: fulfilledDates,
    consistency: Math.max(Number(player.best_streak) || 0, Number(player.streak_days) || 0),
    domain: masteredSubtopics,
    domainAll: allSpheresComplete ? 1 : 0,
  };
}

export function normalizeEarnedState(value) {
  const items = Array.isArray(value?.items) ? value.items : [];
  const seen = new Set();
  return {
    version: 1,
    items: items.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  };
}

export function evaluateEmblems(catalog, metrics, earnedState, unlockedAt = new Date().toISOString()) {
  const state = normalizeEarnedState(earnedState);
  const earnedIds = new Set(state.items.map((item) => item.id));
  const unlocked = [];
  for (const emblem of catalog) {
    const value = Number(metrics[emblem.metric]) || 0;
    if (value < emblem.threshold || earnedIds.has(emblem.id)) continue;
    const item = {
      id: emblem.id,
      unlocked_at: unlockedAt,
      source_metric: emblem.metric,
      source_value: value,
    };
    state.items.push(item);
    unlocked.push(item);
    earnedIds.add(emblem.id);
  }
  return { state, unlocked };
}

export function decorateEmblems(catalog, earnedState, metrics) {
  const earnedById = new Map(normalizeEarnedState(earnedState).items.map((item) => [item.id, item]));
  return catalog.map((emblem) => {
    const earned = earnedById.get(emblem.id);
    const current = Number(metrics[emblem.metric]) || 0;
    return {
      ...emblem,
      earned: Boolean(earned),
      unlocked_at: earned?.unlocked_at || null,
      current: Math.min(current, emblem.threshold),
      progress: Math.min(100, Math.round((current / emblem.threshold) * 100)),
    };
  });
}

export async function refreshEmblems({
  repository = progressRepository,
  daysUntilExam = 120,
  now = () => new Date(),
} = {}) {
  const [players, subtopics, verticalized, dailyLogs, metaRows, stored] = await Promise.all([
    repository.getAll(STORES.player),
    repository.getAll(STORES.subtopics),
    repository.getAll(STORES.verticalized),
    repository.getAll(STORES.dailyLogs),
    repository.getAll(STORES.meta),
    repository.getMeta(EARNED_EMBLEMS_KEY),
  ]);
  const unlockableCatalog = buildEmblemCatalog(daysUntilExam);
  const metrics = collectEmblemMetrics({
    player: players[0],
    subtopics,
    verticalized,
    dailyLogs,
    metaRows,
  });
  const previous = normalizeEarnedState(stored);
  const result = evaluateEmblems(unlockableCatalog, metrics, previous, now().toISOString());
  if (result.unlocked.length) await repository.setMeta(EARNED_EMBLEMS_KEY, result.state);
  const visibleIds = new Set(unlockableCatalog.map((emblem) => emblem.id));
  const earnedIds = new Set(result.state.items.map((item) => item.id));
  // Um marco de constância já conquistado continua visível mesmo quando a prova se aproxima.
  const catalog = [
    ...unlockableCatalog,
    ...buildEmblemCatalog(120).filter((emblem) => earnedIds.has(emblem.id) && !visibleIds.has(emblem.id)),
  ];
  return {
    catalog,
    metrics,
    state: result.state,
    unlocked: result.unlocked,
    emblems: decorateEmblems(catalog, result.state, metrics),
  };
}
