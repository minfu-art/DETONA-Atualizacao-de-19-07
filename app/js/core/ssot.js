/**
 * SSOT — Algoritmo central de cálculo do Edital
 *
 * REGRA: Um item VerticalizedItem só é 100% concluído se as 3 esferas estiverem acesas:
 *   1. Teoria = 'concluido'
 *   2. Revisão = review_count >= 1
 *   3. Combate = Subtopic.stars >= 3  (equivale a >70% nas faixas de estrelas)
 *
 * edital_completion_pct = (itens_completos / total_itens) * 100
 * Este valor é gravado em Player.edital_completion_pct e alimenta Home + trava Nv 91.
 */
import { STORES, getAll } from './db.js';
import { computeMemoryTemperature, effectiveStars } from './memory.js';
import { isQuestionEligible } from './questionSchema.js';
import { applyGlobalMasteryToPlayer, averageSubtopicMastery, migrateSubtopicMastery } from './mastery.js';
import { questionService } from '../services/questionService.js';
import { progressRepository } from '../repositories/progressRepository.js';

/**
 * Esferas de maestria de um item (derivado do estado atual).
 * @param {import('./types.js').VerticalizedItem} item
 * @param {import('./types.js').Subtopic} subtopic
 */
export function getMasterySpheres(item, subtopic) {
  const theoryOn = item.theory_status === 'concluido';
  const reviewOn = (item.review_count || 0) >= 1;
  const stars = subtopic ? effectiveStars(subtopic) : 0;
  const combatOn = stars >= 3;
  const complete = theoryOn && reviewOn && combatOn;
  return { theoryOn, reviewOn, combatOn, complete, stars };
}

/**
 * Percentual do edital, com o mesmo arredondamento usado pelo SSOT.
 * Extraído como função pura para proteger a regra sem depender do IndexedDB.
 */
export function calculateEditalCompletionPercentage(completeCount, totalItems) {
  const total = totalItems || 1;
  return Math.round((completeCount / total) * 10000) / 100;
}

function canonicalRecord(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => canonicalRecord(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value)
    .filter((entryKey) => !(entryKey === 'updated_at' && key === ''))
    .sort()
    .map((entryKey) => [entryKey, canonicalRecord(value[entryKey], entryKey)]));
}

export function academicRecordChanged(current, next) {
  return JSON.stringify(canonicalRecord(current)) !== JSON.stringify(canonicalRecord(next));
}

/**
 * Recalcula edital_completion_pct a partir de verticalized + subtopics.
 * Também sincroniza questions_done / accuracy e memory_temperature.
 * @returns {Promise<{ pct: number, complete: number, total: number, player: object }>}
 */
export async function recalculateEditalSSOT(repository = progressRepository, { updatedAt = new Date().toISOString() } = {}) {
  const [items, subtopics, playerList, disciplines] = await Promise.all([
    repository.getAll(STORES.verticalized),
    repository.getAll(STORES.subtopics),
    repository.getAll(STORES.player),
    repository.getAll(STORES.disciplines),
  ]);

  const currentPlayer = playerList[0];
  if (!currentPlayer) return { pct: 0, complete: 0, total: 0, player: null };

  const subtopicUpdates = [];
  const normalizedSubs = subtopics.map((subtopic) => {
    const migrated = migrateSubtopicMastery(subtopic);
    migrated.memory_temperature = computeMemoryTemperature(migrated.last_studied_at);
    if (academicRecordChanged(subtopic, migrated)) {
      migrated.updated_at = updatedAt;
      subtopicUpdates.push(migrated);
    }
    return migrated;
  });
  const subMap = Object.fromEntries(normalizedSubs.map((s) => [s.id, s]));
  let completeCount = 0;

  const itemUpdates = [];
  const normalizedItems = items.map((item) => {
    const next = { ...item };
    const sub = subMap[item.subtopic_id];
    if (sub) {
      const newQuestionsDone = (sub.attempts_count || 0) > 0;
      const newAccuracy = sub.best_accuracy || 0;
      next.questions_done = newQuestionsDone;
      next.accuracy = newAccuracy;
    }
    const spheres = getMasterySpheres(next, sub);
    if (spheres.complete) completeCount += 1;
    if (academicRecordChanged(item, next)) {
      next.updated_at = updatedAt;
      itemUpdates.push(next);
    }
    return next;
  });

  const pct = calculateEditalCompletionPercentage(completeCount, normalizedItems.length);

  // Disciplinas: completed_subtopics = subtópicos com 3+ estrelas efetivas
  const discUpdates = [];
  const normalizedDisciplines = disciplines.map((d) => {
    const subs = normalizedSubs.filter((s) => s.discipline_id === d.id);
    const done = subs.filter((s) => effectiveStars(s) >= 3).length;
    const next = {
      ...d,
      total_subtopics: subs.length,
      completed_subtopics: done,
      mastery_pct: averageSubtopicMastery(subs),
    };
    if (academicRecordChanged(d, next)) {
      next.updated_at = updatedAt;
      discUpdates.push(next);
    }
    return next;
  });

  const player = applyGlobalMasteryToPlayer(currentPlayer, normalizedSubs);
  player.edital_completion_pct = pct;
  if (pct >= 100 && !player.celebration_shown) {
    // flag de disparo da celebração (UI consome)
    player._pending_celebration = true;
  }
  if (pct >= 100) {
    player.endgame_mode = true;
  }

  if (academicRecordChanged(currentPlayer, player)) {
    player.updated_at = updatedAt;
    await repository.put(STORES.player, player);
  }
  if (subtopicUpdates.length) await repository.putMany(STORES.subtopics, subtopicUpdates);
  if (itemUpdates.length) await repository.putMany(STORES.verticalized, itemUpdates);
  if (discUpdates.length) await repository.putMany(STORES.disciplines, discUpdates);

  return {
    pct,
    complete: completeCount,
    total: normalizedItems.length,
    player,
    writes: {
      player: academicRecordChanged(currentPlayer, player) ? 1 : 0,
      subtopics: subtopicUpdates.length,
      verticalized: itemUpdates.length,
      disciplines: discUpdates.length,
    },
    disciplines: normalizedDisciplines,
  };
}

/**
 * Radar de competências por disciplina (média de estrelas + accuracy).
 */
export async function getRadarStats() {
  const [disciplines, subtopics] = await Promise.all([
    getAll(STORES.disciplines),
    getAll(STORES.subtopics),
  ]);
  return disciplines
    .sort((a, b) => a.order - b.order)
    .map((d) => {
      const subs = subtopics.filter((s) => s.discipline_id === d.id).map(migrateSubtopicMastery);
      if (!subs.length) {
        return { id: d.id, name: d.name, icon: d.icon, proficiency: 0, avgStars: 0, avgAccuracy: 0 };
      }
      const avgStars = subs.reduce((a, s) => a + effectiveStars(s), 0) / subs.length;
      const avgAccuracy = averageSubtopicMastery(subs);
      // Barra da disciplina = média direta do melhor percentual de seus subtópicos.
      const proficiency = Math.round(avgAccuracy * 100) / 100;
      return {
        id: d.id,
        name: d.name,
        icon: d.icon,
        proficiency,
        avgStars: Math.round(avgStars * 10) / 10,
        avgAccuracy,
        masteryExact: avgAccuracy,
      };
    });
}

/**
 * Contagem de questões por subtópico (para Forja / trava de batalha).
 */
export async function getQuestionCounts() {
  const questions = await questionService.listar();
  const map = {};
  for (const q of questions) {
    if (!isQuestionEligible(q)) continue;
    const sid = q.subtopic_id || q.topicoEditalId;
    if (!sid) continue;
    map[sid] = (map[sid] || 0) + 1;
  }
  return map;
}

export const MIN_QUESTIONS_BATTLE = 10;

export function isItemComplete(item, subtopic) {
  return getMasterySpheres(item, subtopic).complete;
}
