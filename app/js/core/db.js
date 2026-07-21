/**
 * IndexedDB — Única Fonte de Verdade (SSOT)
 * Todas as telas leem/escrevem via este módulo. Nunca recalcular progresso fora daqui.
 */
import { DB_NAME, DB_VERSION, STORES } from './types.js';
import { requireActiveUserId } from '../auth/activeUser.js';
import { requireActiveContestId } from '../contest/activeContest.js';
import { createBackupEnvelope, prepareRestoreCollections, normalizeBackupPayload, BACKUP_COLLECTIONS } from './backupSchema.js';
import { normalizeQuestion } from './questionSchema.js';

const openDatabases = new Map();

export function legacyUserDatabaseName(userId) {
  return `${DB_NAME}__user__${encodeURIComponent(userId)}`;
}

export function contestDatabaseName(userId, contestId) {
  return `${legacyUserDatabaseName(userId)}__contest__${encodeURIComponent(contestId)}`;
}

function openDB(userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const contextKey = `${userId}:${contestId}`;
  const existing = openDatabases.get(contextKey);
  if (existing) {
    if (existing.version === DB_VERSION) return Promise.resolve(existing);
    try { existing.close(); } catch { /* ignore */ }
    openDatabases.delete(contextKey);
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(contestDatabaseName(userId, contestId), DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      openDatabases.set(contextKey, db);
      db.onversionchange = () => {
        try { db.close(); } catch { /* ignore */ }
        openDatabases.delete(contextKey);
      };
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.player)) {
        db.createObjectStore(STORES.player, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.disciplines)) {
        db.createObjectStore(STORES.disciplines, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.subtopics)) {
        const s = db.createObjectStore(STORES.subtopics, { keyPath: 'id' });
        s.createIndex('discipline_id', 'discipline_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.questions)) {
        const q = db.createObjectStore(STORES.questions, { keyPath: 'id' });
        q.createIndex('subtopic_id', 'subtopic_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.verticalized)) {
        const v = db.createObjectStore(STORES.verticalized, { keyPath: 'id' });
        v.createIndex('subtopic_id', 'subtopic_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.routines)) {
        db.createObjectStore(STORES.routines, { keyPath: 'day_of_week' });
      }
      if (!db.objectStoreNames.contains(STORES.dailyLogs)) {
        db.createObjectStore(STORES.dailyLogs, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORES.mvpCards)) {
        const m = db.createObjectStore(STORES.mvpCards, { keyPath: 'id' });
        m.createIndex('subtopic_id', 'subtopic_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.wellbeingHabits)) {
        db.createObjectStore(STORES.wellbeingHabits, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.wellbeingLogs)) {
        const w = db.createObjectStore(STORES.wellbeingLogs, { keyPath: 'id' });
        w.createIndex('date', 'date', { unique: false });
        w.createIndex('habit_id', 'habit_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.reviewQueue)) {
        const review = db.createObjectStore(STORES.reviewQueue, { keyPath: 'questionId' });
        review.createIndex('subtopicId', 'subtopicId', { unique: false });
        review.createIndex('disciplineId', 'disciplineId', { unique: false });
        review.createIndex('nextReviewAt', 'nextReviewAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
      // Rotina Inteligente V2 (DB_VERSION >= 4)
      if (!db.objectStoreNames.contains(STORES.routineProfiles)) {
        db.createObjectStore(STORES.routineProfiles, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.routineBlocks)) {
        const blocks = db.createObjectStore(STORES.routineBlocks, { keyPath: 'id' });
        blocks.createIndex('date', 'date', { unique: false });
        blocks.createIndex('status', 'status', { unique: false });
        blocks.createIndex('seriesId', 'seriesId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.studySessions)) {
        const sess = db.createObjectStore(STORES.studySessions, { keyPath: 'id' });
        sess.createIndex('blockId', 'blockId', { unique: false });
        sess.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.routineDailyStates)) {
        db.createObjectStore(STORES.routineDailyStates, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.routineWeeklyReviews)) {
        const wr = db.createObjectStore(STORES.routineWeeklyReviews, { keyPath: 'id' });
        wr.createIndex('weekStart', 'weekStart', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.routineAchievements)) {
        db.createObjectStore(STORES.routineAchievements, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.routineDistractions)) {
        const dist = db.createObjectStore(STORES.routineDistractions, { keyPath: 'id' });
        dist.createIndex('sessionId', 'sessionId', { unique: false });
        dist.createIndex('date', 'at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.routineReminderSettings)) {
        db.createObjectStore(STORES.routineReminderSettings, { keyPath: 'id' });
      }
    };
  });
}

function tx(storeNames, mode = 'readonly', userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  return openDB(userId, contestId).then((db) => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readonly', userId, contestId);
  return reqToPromise(t.objectStore(store).getAll());
}

export async function getById(store, id, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readonly', userId, contestId);
  return reqToPromise(t.objectStore(store).get(id));
}

export async function put(store, value, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readwrite', userId, contestId);
  await reqToPromise(t.objectStore(store).put(value));
  return value;
}

export async function putMany(store, values, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readwrite', userId, contestId);
  const os = t.objectStore(store);
  for (const v of values) os.put(v);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(values);
    t.onerror = (e) => reject(e.target?.error || t.error || new Error('Transaction failed'));
  });
}

export async function remove(store, id, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readwrite', userId, contestId);
  await reqToPromise(t.objectStore(store).delete(id));
}

export async function clearStore(store, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readwrite', userId, contestId);
  await reqToPromise(t.objectStore(store).clear());
}

export async function getByIndex(store, indexName, value, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readonly', userId, contestId);
  const idx = t.objectStore(store).index(indexName);
  return reqToPromise(idx.getAll(value));
}

export async function countByIndex(store, indexName, value, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const t = await tx([store], 'readonly', userId, contestId);
  const idx = t.objectStore(store).index(indexName);
  return reqToPromise(idx.count(value));
}

export async function getMeta(key, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const row = await getById(STORES.meta, key, userId, contestId);
  return row ? row.value : null;
}

export async function setMeta(key, value, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  return put(STORES.meta, { key, value }, userId, contestId);
}

/** Snapshot completo para Kafra / debug */
export async function exportFullSnapshot(userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const [
    player, disciplines, subtopics, questions, verticalized, routines, dailyLogs, mvpCards,
    wellbeingHabits, wellbeingLogs, reviewQueue, meta,
    routineProfiles, routineBlocks, studySessions, routineDailyStates,
    routineWeeklyReviews, routineAchievements, routineDistractions, routineReminderSettings,
  ] =
    await Promise.all([
      getAll(STORES.player, userId, contestId), getAll(STORES.disciplines, userId, contestId),
      getAll(STORES.subtopics, userId, contestId), getAll(STORES.questions, userId, contestId),
      getAll(STORES.verticalized, userId, contestId), getAll(STORES.routines, userId, contestId),
      getAll(STORES.dailyLogs, userId, contestId), getAll(STORES.mvpCards, userId, contestId),
      getAll(STORES.wellbeingHabits, userId, contestId), getAll(STORES.wellbeingLogs, userId, contestId),
      getAll(STORES.reviewQueue, userId, contestId),
      getAll(STORES.meta, userId, contestId),
      getAll(STORES.routineProfiles, userId, contestId),
      getAll(STORES.routineBlocks, userId, contestId),
      getAll(STORES.studySessions, userId, contestId),
      getAll(STORES.routineDailyStates, userId, contestId),
      getAll(STORES.routineWeeklyReviews, userId, contestId),
      getAll(STORES.routineAchievements, userId, contestId),
      getAll(STORES.routineDistractions, userId, contestId),
      getAll(STORES.routineReminderSettings, userId, contestId),
    ]);
  return createBackupEnvelope({
    player: player[0] || null,
    disciplines,
    subtopics,
    questions: questions.map((question) => normalizeQuestion(question)),
    verticalized,
    routines,
    dailyLogs,
    mvpCards,
    wellbeingHabits,
    wellbeingLogs,
    reviewQueue,
    meta,
    routineProfiles,
    routineBlocks,
    studySessions,
    routineDailyStates,
    routineWeeklyReviews,
    routineAchievements,
    routineDistractions,
    routineReminderSettings,
  }, contestId);
}

async function readCurrentCollections(userId, contestId) {
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) collections[name] = await getAll(name, userId, contestId);
  return collections;
}

/** Valida tudo antes e substitui todas as coleções em uma única transação atômica. */
export async function importFullSnapshot(data, userId = requireActiveUserId(), contestId = requireActiveContestId()) {
  const temporaryCopy = await readCurrentCollections(userId, contestId);
  const { collections } = prepareRestoreCollections(data, temporaryCopy, contestId);
  const db = await openDB(userId, contestId);
  const transaction = db.transaction(BACKUP_COLLECTIONS, 'readwrite');
  for (const storeName of BACKUP_COLLECTIONS) {
    const objectStore = transaction.objectStore(storeName);
    objectStore.clear();
    for (const row of collections[storeName]) objectStore.put(row);
  }
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onabort = () => reject(new Error('Restauração cancelada; os dados anteriores foram preservados.'));
    transaction.onerror = () => reject(new Error('Falha na restauração; os dados anteriores foram preservados.'));
  });
}

/** Importacao transacional usada pela migracao legada: tudo ou nada. */
export async function importFullSnapshotAtomically(data, userId, contestId) {
  const normalized = normalizeBackupPayload(data);
  const incoming = normalized.collections;
  const stores = Object.values(STORES);
  const db = await openDB(userId, contestId);
  const transaction = db.transaction(stores, 'readwrite');
  const rows = {
    [STORES.player]: incoming.player || [],
    [STORES.disciplines]: incoming.disciplines || [],
    [STORES.subtopics]: incoming.subtopics || [],
    [STORES.questions]: incoming.questions || [],
    [STORES.verticalized]: incoming.verticalized || [],
    [STORES.routines]: incoming.routines || [],
    [STORES.dailyLogs]: incoming.dailyLogs || [],
    [STORES.mvpCards]: incoming.mvpCards || [],
    [STORES.wellbeingHabits]: incoming.wellbeingHabits || [],
    [STORES.wellbeingLogs]: incoming.wellbeingLogs || [],
    [STORES.reviewQueue]: incoming.reviewQueue || [],
    [STORES.meta]: incoming.meta || [],
  };
  for (const store of stores) {
    const objectStore = transaction.objectStore(store);
    objectStore.clear();
    for (const row of rows[store]) objectStore.put(row);
  }
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(data);
    transaction.onabort = () => reject(transaction.error || new Error('Migracao abortada'));
    transaction.onerror = () => reject(transaction.error || new Error('Falha na migracao'));
  });
}

export async function isSeeded() {
  return (await getMeta('seeded')) === true;
}

export { STORES, openDB };
