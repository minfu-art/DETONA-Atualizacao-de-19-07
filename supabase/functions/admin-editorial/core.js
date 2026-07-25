export const EDITORIAL_ACTIONS = Object.freeze([
  'list_questions', 'validate_batch', 'import_draft', 'transition',
  'generate_snapshot', 'publish_snapshot', 'rollback_snapshot',
]);

export function assertEditorialAction(action) {
  if (!EDITORIAL_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}

export function assertEditorialTransition(from, to) {
  const transitions = {
    draft: ['technical_review', 'archived'],
    technical_review: ['draft', 'approved', 'archived'],
    approved: ['technical_review', 'published', 'archived'],
    published: ['archived'],
    archived: ['draft'],
  };
  if (!transitions[from]?.includes(to)) throw new Error('transition_not_allowed');
  return to;
}
