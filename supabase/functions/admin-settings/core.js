export const SETTINGS_ACTIONS = Object.freeze(['list_settings', 'update_setting']);
export function assertSettingsAction(action) {
  if (!SETTINGS_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}
