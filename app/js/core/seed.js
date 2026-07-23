/**
 * Bootstrap do banco: edital local + jogador + rotinas + banco de questões.
 * O catálogo oficial é reconstruído a partir dos arquivos versionados.
 */
import { STORES, put, putMany, setMeta, isSeeded, getAll } from './db.js';
import {
  buildSeedEntities,
  defaultPlayer,
  defaultRoutines,
  defaultWellbeingHabits,
} from '../data/editalSeed.js';
import { migrateStoredQuestions, removeDemoQuestions } from './questionImport.js';
import { ensureWellbeingHabits } from './wellbeing.js';
import { ensureReviewQueueMigration } from '../services/reviewService.js';

export function missingSeedRows(seedRows = [], existingRows = [], key = 'id') {
  const existingKeys = new Set(existingRows.map((row) => String(row?.[key])));
  return seedRows.filter((row) => !existingKeys.has(String(row?.[key])));
}

async function ensureStaticCatalog() {
  const { disciplines, subtopics, verticalized } = buildSeedEntities();
  const [storedDisciplines, storedSubtopics, storedVerticalized] = await Promise.all([
    getAll(STORES.disciplines),
    getAll(STORES.subtopics),
    getAll(STORES.verticalized),
  ]);
  const missingDisciplines = missingSeedRows(disciplines, storedDisciplines);
  const missingSubtopics = missingSeedRows(subtopics, storedSubtopics);
  const missingVerticalized = missingSeedRows(verticalized, storedVerticalized);

  if (missingDisciplines.length) await putMany(STORES.disciplines, missingDisciplines);
  if (missingSubtopics.length) await putMany(STORES.subtopics, missingSubtopics);
  if (missingVerticalized.length) await putMany(STORES.verticalized, missingVerticalized);

  return {
    disciplines: missingDisciplines.length,
    subtopics: missingSubtopics.length,
    verticalized: missingVerticalized.length,
  };
}

export async function ensureSeed() {
  const seeded = await isSeeded();
  const players = await getAll(STORES.player);
  if (!players[0]) await put(STORES.player, defaultPlayer());

  const [routines, wellbeing] = await Promise.all([
    getAll(STORES.routines),
    getAll(STORES.wellbeingHabits),
  ]);
  if (!routines.length) await putMany(STORES.routines, defaultRoutines());
  if (!wellbeing.length) await putMany(STORES.wellbeingHabits, defaultWellbeingHabits());

  // A flag `seeded` pode chegar da nuvem antes do catálogo local. O conteúdo
  // estático é conferido sempre; somente registros ausentes são inseridos.
  await ensureStaticCatalog();

  if (!seeded) {
    await setMeta('seeded', true);
    await setMeta('seed_version', 5);
    await setMeta('demo_questions', false);
    await setMeta('wellbeing_seeded', true);
  }

  try {
    await removeDemoQuestions();
    await migrateStoredQuestions();
  } catch (error) {
    console.warn('question bootstrap', error);
  }

  try {
    await ensureWellbeingHabits();
  } catch (error) {
    console.warn('ensureWellbeingHabits', error);
  }

  try {
    await ensureReviewQueueMigration();
  } catch (error) {
    console.warn('ensureReviewQueueMigration', error);
  }

  const currentPlayers = await getAll(STORES.player);
  return currentPlayers[0] || null;
}

export async function getPlayer() {
  const list = await getAll(STORES.player);
  return list[0] || null;
}
