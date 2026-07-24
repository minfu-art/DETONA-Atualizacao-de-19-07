/**
 * Chaves primárias das coleções de progresso (alinhado a backupSchema.COLLECTION_KEYS).
 */
export const COLLECTION_KEYS = Object.freeze({
  player: 'id',
  disciplines: 'id',
  subtopics: 'id',
  questions: 'id',
  verticalized: 'id',
  routines: 'day_of_week',
  dailyLogs: 'date',
  mvpCards: 'id',
  wellbeingHabits: 'id',
  wellbeingLogs: 'id',
  reviewQueue: 'questionId',
  meta: 'key',
  routineProfiles: 'id',
  routineBlocks: 'id',
  studySessions: 'id',
  routineDailyStates: 'id',
  routineWeeklyReviews: 'id',
  routineAchievements: 'id',
  routineDistractions: 'id',
  routineReminderSettings: 'id',
});

/** Coleções sincronizadas com a nuvem (questões do usuário opcional; catálogo fica em JSON). */
export const SYNC_COLLECTIONS = Object.freeze([
  'player',
  'disciplines',
  'subtopics',
  'verticalized',
  'routines',
  'dailyLogs',
  'mvpCards',
  'wellbeingHabits',
  'wellbeingLogs',
  'reviewQueue',
  'meta',
  'routineProfiles',
  'routineBlocks',
  'studySessions',
  'routineDailyStates',
  'routineWeeklyReviews',
  'routineAchievements',
  'routineDistractions',
  'routineReminderSettings',
  // questões criadas pelo aluno (forge); catálogo oficial não sobe por padrão
  'questions',
]);

/**
 * O catálogo oficial de questões é versionado em JSON e nunca deve trafegar
 * como progresso do aluno. Somente questões criadas na Forja pertencem à
 * sincronização híbrida.
 */
export function shouldSyncCloudRecord(collection, value) {
  if (collection !== 'questions') return SYNC_COLLECTIONS.includes(collection);
  return value?.is_user_created === true;
}

export function recordKeyFor(collection, value) {
  const keyField = COLLECTION_KEYS[collection];
  if (!keyField || value == null) return null;
  const key = value[keyField];
  if (key === undefined || key === null || key === '') return null;
  return String(key);
}
