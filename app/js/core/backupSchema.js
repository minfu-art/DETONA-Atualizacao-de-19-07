export const BACKUP_VERSION = 4;
export const APP_VERSION = 'phase6-routine-intelligent-v2';
export const BACKUP_COLLECTIONS = Object.freeze([
  'player', 'disciplines', 'subtopics', 'questions', 'verticalized', 'routines',
  'dailyLogs', 'mvpCards', 'wellbeingHabits', 'wellbeingLogs', 'reviewQueue', 'meta',
  // Rotina Inteligente V2
  'routineProfiles', 'routineBlocks', 'studySessions', 'routineDailyStates',
  'routineWeeklyReviews', 'routineAchievements', 'routineDistractions', 'routineReminderSettings',
]);

const clone = (value) => value == null ? value : structuredClone(value);
const COLLECTION_KEYS = Object.freeze({
  player: 'id', disciplines: 'id', subtopics: 'id', questions: 'id', verticalized: 'id',
  routines: 'day_of_week', dailyLogs: 'date', mvpCards: 'id', wellbeingHabits: 'id',
  wellbeingLogs: 'id', reviewQueue: 'questionId', meta: 'key',
  routineProfiles: 'id', routineBlocks: 'id', studySessions: 'id', routineDailyStates: 'id',
  routineWeeklyReviews: 'id', routineAchievements: 'id', routineDistractions: 'id',
  routineReminderSettings: 'id',
});

export function createBackupEnvelope(snapshot, contestId) {
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    const value = name === 'player' ? (snapshot.player ? [snapshot.player] : []) : (snapshot[name] || []);
    collections[name] = clone(value);
  }
  return {
    app: 'DETONA_CONCURSOS',
    backupVersion: BACKUP_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: { contestId },
    collections,
  };
}

function legacyCollections(data) {
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    if (name === 'player' && Object.prototype.hasOwnProperty.call(data, 'player')) {
      collections.player = data.player ? [data.player] : [];
    } else if (Object.prototype.hasOwnProperty.call(data, name)) {
      collections[name] = data[name];
    }
  }
  return collections;
}

export function normalizeBackupPayload(data) {
  if (!data || typeof data !== 'object' || data.app !== 'DETONA_CONCURSOS') throw new Error('Formato de backup inválido.');
  const version = data.backupVersion ?? data.version ?? 1;
  if (!Number.isInteger(Number(version)) || Number(version) < 1 || Number(version) > BACKUP_VERSION) {
    throw new Error('Versão de backup não suportada.');
  }
  const collections = data.collections && typeof data.collections === 'object' ? data.collections : legacyCollections(data);
  for (const [name, rows] of Object.entries(collections)) {
    if (!BACKUP_COLLECTIONS.includes(name)) continue;
    if (!Array.isArray(rows)) throw new Error(`Coleção inválida: ${name}.`);
    if (rows.some((row) => !row || typeof row !== 'object')) throw new Error(`Registro inválido na coleção: ${name}.`);
    const key = COLLECTION_KEYS[name];
    if (rows.some((row) => row[key] === undefined || row[key] === null || row[key] === '')) {
      throw new Error(`Registro sem chave na coleção: ${name}.`);
    }
    if (name === 'questions' && rows.some((row) =>
      !(row.statement || row.enunciado)
      || !(row.subtopic_id || row.topicoEditalId)
      || !Array.isArray(row.options || row.alternativas)
      || (row.options || row.alternativas).length < 2
      || (row.correct_answer ?? row.respostaCorreta) == null)) {
      throw new Error('Backup contém questão estruturalmente inválida.');
    }
  }
  return {
    app: data.app,
    backupVersion: Number(version),
    appVersion: data.appVersion || 'legacy',
    exportedAt: data.exportedAt || data.exported_at || null,
    metadata: { ...(data.metadata || {}), contestId: data.metadata?.contestId || data.contest_id || null },
    collections,
  };
}

export function prepareRestoreCollections(payload, currentCollections, expectedContestId) {
  const normalized = normalizeBackupPayload(payload);
  const backupContestId = normalized.metadata.contestId;
  if (backupContestId && expectedContestId && backupContestId !== expectedContestId) {
    throw new Error('Este backup pertence a outro concurso.');
  }
  const prepared = {};
  for (const name of BACKUP_COLLECTIONS) {
    const hasIncoming = Object.prototype.hasOwnProperty.call(normalized.collections, name);
    // coleções novas ausentes em backup antigo → [] (não apaga progresso legado)
    prepared[name] = clone(hasIncoming ? normalized.collections[name] : (currentCollections[name] || []));
  }
  if (!prepared.player.length || !prepared.player[0]?.id) throw new Error('Backup sem perfil de jogador válido.');
  return { normalized, collections: prepared };
}

export function applyRestorePlanInMemory(currentCollections, payload, expectedContestId) {
  return prepareRestoreCollections(payload, clone(currentCollections), expectedContestId).collections;
}
