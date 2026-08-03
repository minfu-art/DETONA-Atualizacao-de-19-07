export const HOME_HABIT_STATES = Object.freeze({
  NO_CONFIGURATION: 'NO_CONFIGURATION',
  CONFIGURED_NO_HABITS_TODAY: 'CONFIGURED_NO_HABITS_TODAY',
  SCHEDULED_TODAY: 'SCHEDULED_TODAY',
  COMPLETED_TODAY: 'COMPLETED_TODAY',
});

export const HOME_MENTOR_OWNERS = Object.freeze({
  KAELY: 'kaely',
  RANKED: 'ranked',
  OFFICIAL: 'official',
  AUTOMATIC: 'automatic',
});

export function resolveHomeHabitState(configuration = {}, cards = [], date = new Date()) {
  void date;
  if (configuration?.configured === false) return HOME_HABIT_STATES.NO_CONFIGURATION;
  const enabledDefinitions = (configuration?.definitions || [])
    .filter((definition) => definition?.enabled !== false);
  if (enabledDefinitions.length === 0) return HOME_HABIT_STATES.NO_CONFIGURATION;

  const scheduledCards = Array.isArray(cards) ? cards : [];
  if (scheduledCards.length === 0) return HOME_HABIT_STATES.CONFIGURED_NO_HABITS_TODAY;
  if (scheduledCards.every((card) => card?.completed)) return HOME_HABIT_STATES.COMPLETED_TODAY;
  return HOME_HABIT_STATES.SCHEDULED_TODAY;
}

export function resolveHomeMentorOwner({
  habitState,
  rankedSelection = null,
  officialAnnouncement = null,
  kaelyPriority = false,
} = {}) {
  if (rankedSelection) return HOME_MENTOR_OWNERS.RANKED;
  if (officialAnnouncement) return HOME_MENTOR_OWNERS.OFFICIAL;
  if (habitState === HOME_HABIT_STATES.NO_CONFIGURATION || kaelyPriority) {
    return HOME_MENTOR_OWNERS.KAELY;
  }
  return HOME_MENTOR_OWNERS.AUTOMATIC;
}
