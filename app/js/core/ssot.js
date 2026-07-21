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
import { STORES, getAll, getById, put, putMany } from './db.js';
import { computeMemoryTemperature, effectiveStars } from './memory.js';
import { isQuestionEligible } from './questionSchema.js';
import { applyGlobalMasteryToPlayer, averageSubtopicMastery, migrateSubtopicMastery } from './mastery.js';
import { questionService } from '../services/questionService.js';

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

/**
 * Recalcula edital_completion_pct a partir de verticalized + subtopics.
 * Também sincroniza questions_done / accuracy e memory_temperature.
 * @returns {Promise<{ pct: number, complete: number, total: number, player: object }>}
 */
export async function recalculateEditalSSOT() {
  const [items, subtopics, playerList, disciplines] = await Promise.all([
    getAll(STORES.verticalized),
    getAll(STORES.subtopics),
    getAll(STORES.player),
    getAll(STORES.disciplines),
  ]);

  const currentPlayer = playerList[0];
  if (!currentPlayer) return { pct: 0, complete: 0, total: 0, player: null };

  const normalizedSubs = subtopics.map((subtopic) => {
    const migrated = migrateSubtopicMastery(subtopic);
    migrated.memory_temperature = computeMemoryTemperature(migrated.last_studied_at);
    return migrated;
  });
  const subMap = Object.fromEntries(normalizedSubs.map((s) => [s.id, s]));
  let completeCount = 0;

  for (const item of items) {
    const sub = subMap[item.subtopic_id];
    if (sub) {
      const newQuestionsDone = (sub.attempts_count || 0) > 0;
      const newAccuracy = sub.best_accuracy || 0;
      if (item.questions_done !== newQuestionsDone || item.accuracy !== newAccuracy) {
        item.questions_done = newQuestionsDone;
        item.accuracy = newAccuracy;
      }
    }
    const spheres = getMasterySpheres(item, sub);
    if (spheres.complete) completeCount += 1;
  }

  const pct = calculateEditalCompletionPercentage(completeCount, items.length);

  // Disciplinas: completed_subtopics = subtópicos com 3+ estrelas efetivas
  const discUpdates = disciplines.map((d) => {
    const subs = normalizedSubs.filter((s) => s.discipline_id === d.id);
    const done = subs.filter((s) => effectiveStars(s) >= 3).length;
    return { ...d, total_subtopics: subs.length, completed_subtopics: done, mastery_pct: averageSubtopicMastery(subs) };
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

  await put(STORES.player, player);
  if (normalizedSubs.length) await putMany(STORES.subtopics, normalizedSubs);
  if (items.length) await putMany(STORES.verticalized, items);
  if (discUpdates.length) await putMany(STORES.disciplines, discUpdates);

  return { pct, complete: completeCount, total: items.length, player };
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
    map[q.subtopic_id] = (map[q.subtopic_id] || 0) + 1;
  }
  return map;
}

export const MIN_QUESTIONS_BATTLE = 10;

export function isItemComplete(item, subtopic) {
  return getMasterySpheres(item, subtopic).complete;
}
