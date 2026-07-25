export const MEDIA_ACTIONS = Object.freeze(['list_collections', 'create_collection', 'save_stage', 'register_asset', 'publish_collection']);
export function assertMediaAction(action) {
  if (!MEDIA_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}
export function safeStoragePath(path) {
  const value = String(path || '');
  if (!/^[a-zA-Z0-9/_-]+\.(png|webp)$/.test(value) || value.includes('..')) throw new Error('invalid_storage_path');
  return value;
}
