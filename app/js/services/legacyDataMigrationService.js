import { DB_NAME, DB_VERSION, STORES } from '../core/types.js';
import { exportFullSnapshot, getAll, importFullSnapshotAtomically } from '../core/db.js';

async function legacyDatabaseExists() {
  if (typeof indexedDB.databases !== 'function') return true;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === DB_NAME);
}

function openLegacyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLegacySnapshot() {
  if (!(await legacyDatabaseExists())) return null;
  const db = await openLegacyDatabase();
  try {
    const read = async (store) => {
      if (!db.objectStoreNames.contains(store)) return [];
      const transaction = db.transaction(store, 'readonly');
      return requestPromise(transaction.objectStore(store).getAll());
    };
    const rows = {};
    for (const store of Object.values(STORES)) rows[store] = await read(store);
    const hasData = Object.values(rows).some((items) => items.length > 0);
    if (!hasData) return null;
    return {
      version: db.version,
      exported_at: new Date().toISOString(),
      app: 'DETONA_CONCURSOS',
      player: rows[STORES.player][0] || null,
      disciplines: rows[STORES.disciplines],
      subtopics: rows[STORES.subtopics],
      questions: rows[STORES.questions],
      verticalized: rows[STORES.verticalized],
      routines: rows[STORES.routines],
      dailyLogs: rows[STORES.dailyLogs],
      mvpCards: rows[STORES.mvpCards],
      wellbeingHabits: rows[STORES.wellbeingHabits],
      wellbeingLogs: rows[STORES.wellbeingLogs],
      reviewQueue: rows[STORES.reviewQueue],
      meta: rows[STORES.meta],
    };
  } finally {
    db.close();
  }
}

export class LegacyDataMigrationService {
  constructor({ source = { read: readLegacySnapshot }, target = null } = {}) {
    this.source = source;
    this.target = target || {
      hasData: async (userId) => (await getAll(STORES.player, userId, 'pc_al_2026')).length > 0,
      write: (snapshot, userId) => importFullSnapshotAtomically(snapshot, userId, 'pc_al_2026'),
      read: (userId) => exportFullSnapshot(userId, 'pc_al_2026'),
    };
  }

  async migrateToFirstUser(userId) {
    if (await this.target.hasData(userId)) return { migrated: false, reason: 'target_not_empty' };
    const snapshot = await this.source.read();
    if (!snapshot) return { migrated: false, reason: 'no_legacy_data' };
    await this.target.write(snapshot, userId);
    return { migrated: true, snapshot: await this.target.read(userId) };
  }
}
