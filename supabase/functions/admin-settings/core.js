import {
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeHttpsUrl,
  safeId,
  safeText,
} from '../_shared/adminValidation.js';

export const SETTINGS_ACTIONS = Object.freeze(['list_settings', 'update_setting']);
export function assertSettingsAction(action) {
  if (!SETTINGS_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}

const SETTING_TYPES = ['string', 'boolean', 'email', 'url'];
const SETTING_KEYS = [
  'platform_name', 'logo_url', 'support_email', 'whatsapp', 'terms_url',
  'privacy_url', 'maintenance_mode', 'signup_enabled', 'email_confirmation_enabled',
  'minimum_app_version', 'pwa_enabled', 'notifications_enabled',
];

export function validateSettingsRequest(input) {
  const body = assertPlainObject(input);
  const action = assertSettingsAction(body.action);
  if (action === 'list_settings') {
    assertExactKeys(body, ['action', 'contestId'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id') };
  }
  assertExactKeys(body, ['action', 'contestId', 'setting'], ['contestId', 'setting']);
  const setting = assertExactKeys(body.setting, ['key', 'type', 'value'], ['key', 'type', 'value']);
  if (!SETTING_KEYS.includes(setting.key)) throw new Error('setting_key_invalid');
  const type = safeEnum(setting.type, SETTING_TYPES, 'setting_type');
  let value = setting.value;
  if (type === 'boolean' && typeof value !== 'boolean') throw new Error('setting_value_invalid');
  if (type === 'string') value = safeText(value, 'setting_value', 300);
  if (type === 'email' && (!/^\S+@\S+\.\S+$/.test(String(value)) || String(value).length > 254)) throw new Error('setting_value_invalid');
  if (type === 'url') value = safeHttpsUrl(value, 'setting_value');
  return { action, contestId: safeId(body.contestId, 'contest_id'), setting: { key: setting.key, type, value } };
}
