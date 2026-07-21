/**
 * Bootstrap do banco: seed do edital + player + rotinas + pacote de questões
 * Não semeia questões DEMO — apenas pacotes reais (JSON / import).
 */
import { STORES, put, putMany, setMeta, isSeeded, getAll } from './db.js';
import { buildSeedEntities, defaultPlayer, defaultRoutines, defaultWellbeingHabits } from '../data/editalSeed.js';
import { recalculateEditalSSOT } from './ssot.js';
import { ensureQuestionPack, migrateStoredQuestions, removeDemoQuestions } from './questionImport.js';
import { ensureWellbeingHabits } from './wellbeing.js';
import { ensureReviewQueueMigration } from '../services/reviewService.js';

export async function ensureSeed() {
  if (!(await isSeeded())) {
    const { disciplines, subtopics, verticalized } = buildSeedEntities();
    const player = defaultPlayer();
    const routines = defaultRoutines();
    const wellbeing = defaultWellbeingHabits();

    await put(STORES.player, player);
    await putMany(STORES.disciplines, disciplines);
    await putMany(STORES.subtopics, subtopics);
    await putMany(STORES.verticalized, verticalized);
    await putMany(STORES.routines, routines);
    await putMany(STORES.wellbeingHabits, wellbeing);
    // Sem questões demo: o banco vem dos packs JSON + Forja do usuário.
    await setMeta('seeded', true);
    await setMeta('seed_version', 4);
    await setMeta('demo_questions', false);
    await setMeta('wellbeing_seeded', true);
    await recalculateEditalSSOT();
  }

  try {
    // Remove demos legadas de bases já seedadas e garante packs reais.
    await removeDemoQuestions();
    await ensureQuestionPack();
    await migrateStoredQuestions();
  } catch (e) {
    console.warn('question bootstrap', e);
  }

  try {
    await ensureWellbeingHabits();
  } catch (e) {
    console.warn('ensureWellbeingHabits', e);
  }

  try {
    await ensureReviewQueueMigration();
  } catch (e) {
    console.warn('ensureReviewQueueMigration', e);
  }

  const players = await getAll(STORES.player);
  return players[0] || null;
}

export async function getPlayer() {
  const list = await getAll(STORES.player);
  return list[0] || null;
}
