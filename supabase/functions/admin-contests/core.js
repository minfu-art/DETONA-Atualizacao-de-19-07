export const ADMIN_CONTEST_ACTIONS = Object.freeze([
  'list_contests', 'save_contest', 'publish', 'suspend', 'archive',
  'list_curriculum', 'save_curriculum_node', 'reorder_curriculum', 'list_audit',
]);

export function assertAdminContestAction(action) {
  if (!ADMIN_CONTEST_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}

export function sanitizedAuditMetadata(input = {}) {
  const blocked = /password|token|jwt|secret|service.?role|authorization/i;
  return Object.fromEntries(Object.entries(input)
    .filter(([key]) => !blocked.test(key))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]));
}
