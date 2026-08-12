export const STUDENT_HISTORY_KEY = 'detonaStudentLevel';
export const STUDENT_HISTORY_HOME = 'home';
export const STUDENT_HISTORY_INTERNAL = 'internal';

export function studentHistoryTransition({
  screen,
  currentScreen,
  currentLevel = null,
  fromHistory = false,
} = {}) {
  if (screen === STUDENT_HISTORY_HOME) {
    if (!fromHistory && currentScreen && currentScreen !== STUDENT_HISTORY_HOME
      && currentLevel === STUDENT_HISTORY_INTERNAL) {
      return { action: 'back' };
    }
    return { action: 'replace', level: STUDENT_HISTORY_HOME };
  }

  if (currentLevel === STUDENT_HISTORY_HOME) {
    return { action: 'push', level: STUDENT_HISTORY_INTERNAL };
  }
  if (currentLevel === STUDENT_HISTORY_INTERNAL) {
    return { action: 'replace', level: STUDENT_HISTORY_INTERNAL };
  }
  return { action: 'seed', level: STUDENT_HISTORY_INTERNAL };
}

export function shouldReturnHomeFromHistory({ level, currentScreen } = {}) {
  return level === STUDENT_HISTORY_HOME
    && Boolean(currentScreen)
    && currentScreen !== STUDENT_HISTORY_HOME;
}
