const RESET_FIELDS = Object.freeze({
  battleSession: null,
  reviewSession: null,
  reviewFilters: null,
  disciplineId: null,
  returnToTree: null,
  profileSection: null,
  contest: null,
  user: null,
  screen: 'auth',
});

/**
 * Remove somente estado acadêmico transitório da interface.
 * O progresso persistente continua preservado no banco escopado por usuário/concurso.
 */
export function resetAcademicSessionContext(context) {
  if (!context || typeof context !== 'object') return context;
  Object.assign(context, RESET_FIELDS);
  return context;
}
