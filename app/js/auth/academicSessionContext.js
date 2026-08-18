const RESET_FIELDS = Object.freeze({
  battleSession: null,
  reviewSession: null,
  reviewFilters: null,
  disciplineId: null,
  returnToTree: null,
  studyTopicId: null,
  studySubtopicId: null,
  studyReturnContext: null,
  profileSection: null,
  requestReviewExit: null,
  allowReviewExit: false,
  rankedEventSession: null,
  rankedEventResult: null,
  rankedEventId: null,
  rankedCompletionNotice: null,
  requestRankedExit: null,
  allowRankedExit: false,
  clearRankedTimer: null,
  contest: null,
  contentPackage: null,
  user: null,
  screen: 'auth',
});

const CONTEST_TRANSIENT_FIELDS = Object.freeze({
  battleSession: null,
  reviewSession: null,
  reviewFilters: null,
  disciplineId: null,
  returnToTree: null,
  studyTopicId: null,
  studySubtopicId: null,
  studyReturnContext: null,
  requestBattleExit: null,
  allowBattleExit: false,
  battleFinalizing: false,
  requestReviewExit: null,
  allowReviewExit: false,
  rankedEventSession: null,
  rankedEventResult: null,
  rankedEventId: null,
  rankedCompletionNotice: null,
  requestRankedExit: null,
  allowRankedExit: false,
  clearRankedTimer: null,
});

/**
 * Remove somente estado acadêmico transitório da interface.
 * O progresso persistente continua preservado no banco escopado por usuário/concurso.
 */
export function resetAcademicSessionContext(context) {
  if (!context || typeof context !== 'object') return context;
  context.clearRankedTimer?.();
  Object.assign(context, RESET_FIELDS);
  return context;
}

export function resetContestTransientContext(context) {
  if (!context || typeof context !== 'object') return context;
  context.clearRankedTimer?.();
  Object.assign(context, CONTEST_TRANSIENT_FIELDS);
  return context;
}
