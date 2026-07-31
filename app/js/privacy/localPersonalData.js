export const LOCAL_ONLY_COLLECTIONS = Object.freeze([
  'wellbeingHabits',
  'wellbeingLogs',
]);

export const LOCAL_ONLY_META_PREFIXES = Object.freeze([
  'personalized_habits_',
  'wellbeing_',
  'habit_',
  'kaely_',
  'local_notification_',
]);

const localCollections = new Set(LOCAL_ONLY_COLLECTIONS);

export function isLocalOnlyCollection(collection) {
  return localCollections.has(String(collection || ''));
}

export function isLocalOnlyMetaKey(key) {
  const value = String(key || '');
  return LOCAL_ONLY_META_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function isLocalOnlyRecord(collection, valueOrKey) {
  if (isLocalOnlyCollection(collection)) return true;
  if (collection !== 'meta') return false;
  const key = typeof valueOrKey === 'object' ? valueOrKey?.key : valueOrKey;
  return isLocalOnlyMetaKey(key);
}
