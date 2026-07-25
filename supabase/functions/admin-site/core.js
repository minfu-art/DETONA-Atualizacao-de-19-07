export const SITE_ACTIONS = Object.freeze(['list_pages', 'save_page', 'save_block', 'reorder_blocks', 'publish_page', 'archive_page']);
export function assertSiteAction(action) {
  if (!SITE_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}
export function containsUnsafeMarkup(value) {
  return /<(?:script|iframe|object|embed|style)\b/i.test(JSON.stringify(value || {}));
}
