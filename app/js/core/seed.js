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

export function buildDynamicSeedEntities(contentPackage) {
  if (!contentPackage?.version || !Array.isArray(contentPackage.curriculum)) throw new Error('Pacote curricular inválido.');
  const nodesById = new Map(contentPackage.curriculum.map((node) => [node.id, node]));
  const disciplines = contentPackage.curriculum.filter(({ type }) => type === 'discipline').map((node, index) => ({
    id: node.source_id,
    name: node.name,
    icon: contentPackage.metadata?.icon || 'DT',
    biome: node.description || node.name,
    total_subtopics: contentPackage.curriculum.filter((candidate) => {
      let parent = nodesById.get(candidate.parent_id);
      while (parent && parent.type !== 'discipline') parent = nodesById.get(parent.parent_id);
      return candidate.type === 'subtopic' && parent?.id === node.id;
    }).length,
    completed_subtopics: 0,
    order: node.order_index ?? index,
    content_version: contentPackage.version,
  }));
  const subtopics = contentPackage.curriculum.filter(({ type }) => type === 'subtopic').map((node, index) => {
    let parent = nodesById.get(node.parent_id);
    while (parent && parent.type !== 'discipline') parent = nodesById.get(parent.parent_id);
    if (!parent) throw new Error(`Subtópico sem disciplina: ${node.source_id}.`);
    return {
      id: node.source_id,
      discipline_id: parent.source_id,
      name: node.name,
      edital_numbering: String(node.order_index ?? index + 1),
      enemy_name: `Guardião de ${node.name}`,
      enemy_sprite: `enemy-${(index % 16) + 1}`,
      stars: 0,
      best_accuracy: 0,
      attempts_count: 0,
      attempt_history: [],
      best_attempt_question_ids: [],
      memory_temperature: 'congelado',
      last_studied_at: null,
      content_version: contentPackage.version,
    };
  });
  const verticalized = subtopics.map((subtopic, index) => ({
    id: `v_${subtopic.id}`,
    subtopic_id: subtopic.id,
    edital_numbering: subtopic.edital_numbering || String(index + 1),
    title: subtopic.name,
    theory_status: 'nao_iniciado',
    review_count: 0,
    last_review_date: null,
    questions_done: false,
    accuracy: 0,
    content_version: contentPackage.version,
  }));
  const questions = (contentPackage.questions || []).map((question) => ({
    ...question,
    concursoId: contentPackage.contestId,
    contest_id: contentPackage.contestId,
    questionSource: 'dynamic',
    content_version: contentPackage.version,
  }));
  return { disciplines, subtopics, verticalized, questions };
}

async function ensureDynamicCatalog(contentPackage) {
  const incoming = buildDynamicSeedEntities(contentPackage);
  const [disciplines, subtopics, verticalized] = await Promise.all([
    getAll(STORES.disciplines), getAll(STORES.subtopics), getAll(STORES.verticalized),
  ]);
  const byId = (rows) => new Map(rows.map((row) => [String(row.id), row]));
  const disciplineMap = byId(disciplines);
  const subtopicMap = byId(subtopics);
  const verticalizedMap = byId(verticalized);
  await Promise.all([
    putMany(STORES.disciplines, incoming.disciplines.map((row) => ({
      ...row, ...(disciplineMap.get(row.id) || {}), name: row.name, biome: row.biome,
      total_subtopics: row.total_subtopics, order: row.order, content_version: row.content_version,
    }))),
    putMany(STORES.subtopics, incoming.subtopics.map((row) => ({
      ...row, ...(subtopicMap.get(row.id) || {}), name: row.name, discipline_id: row.discipline_id,
      edital_numbering: row.edital_numbering, content_version: row.content_version,
    }))),
    putMany(STORES.verticalized, incoming.verticalized.map((row) => ({
      ...row, ...(verticalizedMap.get(row.id) || {}), title: row.title,
      edital_numbering: row.edital_numbering, content_version: row.content_version,
    }))),
    putMany(STORES.questions, incoming.questions),
    setMeta('content_version', contentPackage.version),
    setMeta('content_hash', contentPackage.contentHash),
  ]);
  return incoming;
}

export async function ensureSeed({ contentPackage = null } = {}) {
  const seeded = await isSeeded();
  const players = await getAll(STORES.player);
  if (!players[0]) {
    const player = defaultPlayer();
    if (contentPackage?.metadata?.exam_date) player.exam_date = contentPackage.metadata.exam_date;
    await put(STORES.player, player);
  }

  const [routines, wellbeing] = await Promise.all([
    getAll(STORES.routines),
    getAll(STORES.wellbeingHabits),
  ]);
  if (!routines.length) await putMany(STORES.routines, defaultRoutines());
  if (!wellbeing.length) await putMany(STORES.wellbeingHabits, defaultWellbeingHabits());

  // A flag `seeded` pode chegar da nuvem antes do catálogo local. O conteúdo
  // estático é conferido sempre; somente registros ausentes são inseridos.
  if (contentPackage?.version && contentPackage.contestId !== 'pc_al_2026') await ensureDynamicCatalog(contentPackage);
  else await ensureStaticCatalog();

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
