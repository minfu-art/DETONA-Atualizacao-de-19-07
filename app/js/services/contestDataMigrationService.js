import { DB_VERSION, STORES } from '../core/types.js';
import { getAll, importFullSnapshotAtomically, legacyUserDatabaseName } from '../core/db.js';

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function databaseExists(name) {
  if (typeof indexedDB.databases !== 'function') return true;
  return (await indexedDB.databases()).some((database) => database.name === name);
}

async function readPhase3Snapshot(userId) {
  const name = legacyUserDatabaseName(userId);
  if (!(await databaseExists(name))) return null;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains(STORES.player)) return null;
    const rows = {};
    for (const store of Object.values(STORES)) {
      rows[store] = db.objectStoreNames.contains(store)
        ? await requestPromise(db.transaction(store, 'readonly').objectStore(store).getAll())
        : [];
    }
    if (!rows[STORES.player].length) return null;
    return {
      app: 'DETONA_CONCURSOS',
      version: db.version,
      exported_at: new Date().toISOString(),
      player: rows[STORES.player][0],
      disciplines: rows[STORES.disciplines], subtopics: rows[STORES.subtopics],
      questions: rows[STORES.questions], verticalized: rows[STORES.verticalized],
      routines: rows[STORES.routines], dailyLogs: rows[STORES.dailyLogs],
      mvpCards: rows[STORES.mvpCards], wellbeingHabits: rows[STORES.wellbeingHabits],
      wellbeingLogs: rows[STORES.wellbeingLogs], reviewQueue: rows[STORES.reviewQueue], meta: rows[STORES.meta],
    };
  } finally {
    db.close();
  }
}

export class ContestDataMigrationService {
  constructor({ source = { read: readPhase3Snapshot }, target = null } = {}) {
    this.source = source;
    this.target = target || {
      hasData: async (userId, contestId) => (await getAll(STORES.player, userId, contestId)).length > 0,
      write: (snapshot, userId, contestId) => importFullSnapshotAtomically(snapshot, userId, contestId),
    };
  }

  async ensureCompatibility(userId, contestId) {
    if (contestId !== 'pc_al_2026') return { migrated: false, reason: 'not_legacy_module' };
    if (await this.target.hasData(userId, contestId)) return { migrated: false, reason: 'target_not_empty' };
    const snapshot = await this.source.read(userId);
    if (!snapshot) return { migrated: false, reason: 'no_phase3_data' };
    await this.target.write(snapshot, userId, contestId);
    return { migrated: true };
  }
}
