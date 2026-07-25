import { getSupabaseClient } from '../supabase/client.js';

export const ADMIN_SETTING_DEFINITIONS = Object.freeze({
  platform_name: { type: 'string', defaultValue: 'DETONA CONCURSOS' },
  logo_url: { type: 'url', defaultValue: null },
  support_email: { type: 'email', defaultValue: null },
  whatsapp: { type: 'string', defaultValue: null },
  terms_url: { type: 'url', defaultValue: null },
  privacy_url: { type: 'url', defaultValue: null },
  maintenance_mode: { type: 'boolean', defaultValue: false },
  signup_enabled: { type: 'boolean', defaultValue: true },
  email_confirmation_enabled: { type: 'boolean', defaultValue: true },
  minimum_app_version: { type: 'string', defaultValue: '1.0.0' },
  pwa_enabled: { type: 'boolean', defaultValue: true },
  notifications_enabled: { type: 'boolean', defaultValue: false },
});

export function validateAdminSetting(key, value) {
  const definition = ADMIN_SETTING_DEFINITIONS[key];
  if (!definition) throw new Error('Configuração não permitida.');
  if (definition.type === 'boolean' && typeof value !== 'boolean') throw new Error('Valor booleano inválido.');
  if (definition.type === 'email' && value != null && !/^\S+@\S+\.\S+$/.test(String(value))) throw new Error('E-mail inválido.');
  if (definition.type === 'url' && value != null) {
    const url = new URL(String(value));
    if (url.protocol !== 'https:') throw new Error('A URL deve usar HTTPS.');
  }
  if (definition.type === 'string' && value != null && String(value).length > 300) throw new Error('Texto excede o limite.');
  return { key, type: definition.type, value };
}

export class AdminSettingsService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async list(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    const client = await this.getClient();
    if (client) {
      const { data, error } = await client.functions.invoke('admin-settings', {
        body: { action: 'list_settings', contestId },
      });
      if (!error && !data?.error) return { rows: data.settings || [], writable: true };
    }
    return {
      rows: Object.entries(ADMIN_SETTING_DEFINITIONS).map(([key, definition]) => ({
        key, type: definition.type, value: definition.defaultValue, source: 'typed_default',
      })),
      writable: false,
    };
  }
}

export const adminSettingsService = new AdminSettingsService();
