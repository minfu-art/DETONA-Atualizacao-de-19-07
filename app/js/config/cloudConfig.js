/**
 * Configuração de nuvem (Supabase).
 * Desligada por padrão: o app continua 100% local (IndexedDB).
 *
 * Preencha SUPABASE_URL e SUPABASE_ANON_KEY em env.js (ou overrides via localStorage).
 * Ver docs/SUPABASE.md
 */

import { ENV } from './env.js';

export const CLOUD_MODES = Object.freeze({
  /** Só IndexedDB + auth local (padrão atual). */
  OFF: 'off',
  /** Auth e progresso no Supabase, com cache local. */
  HYBRID: 'hybrid',
});

const STORAGE_MODE_KEY = 'detona.cloudMode';
const STORAGE_URL_KEY = 'detona.supabaseUrl';
const STORAGE_KEY_KEY = 'detona.supabaseAnonKey';

export function getCloudMode() {
  const override = globalThis?.localStorage?.getItem?.(STORAGE_MODE_KEY);
  if (override && Object.values(CLOUD_MODES).includes(override)) return override;
  const fromEnv = ENV.CLOUD_MODE;
  if (fromEnv && Object.values(CLOUD_MODES).includes(fromEnv)) return fromEnv;
  return CLOUD_MODES.OFF;
}

export function setCloudMode(mode) {
  if (!Object.values(CLOUD_MODES).includes(mode)) {
    throw new TypeError(`Modo de nuvem inválido: ${mode}`);
  }
  globalThis?.localStorage?.setItem?.(STORAGE_MODE_KEY, mode);
  return mode;
}

export function getSupabaseUrl() {
  return (
    globalThis?.localStorage?.getItem?.(STORAGE_URL_KEY)
    || ENV.SUPABASE_URL
    || ''
  ).trim();
}

export function getSupabaseAnonKey() {
  return (
    globalThis?.localStorage?.getItem?.(STORAGE_KEY_KEY)
    || ENV.SUPABASE_ANON_KEY
    || ''
  ).trim();
}

/** True se URL+chave estão preenchidos (mesmo com CLOUD_MODE=off). */
export function hasSupabaseCredentials() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(url && key && url.startsWith('http'));
}

/** Nuvem ativa de fato: modo hybrid + credenciais. */
export function isCloudEnabled() {
  return getCloudMode() === CLOUD_MODES.HYBRID && hasSupabaseCredentials();
}

export function getCloudConfig() {
  return {
    mode: getCloudMode(),
    enabled: isCloudEnabled(),
    url: getSupabaseUrl(),
    anonKey: getSupabaseAnonKey(),
    hasCredentials: hasSupabaseCredentials(),
  };
}
