/**
 * Variáveis de ambiente do app (sem bundler).
 *
 * Produção (Vercel): preencha aqui ou injete window.__DETONA_ENV__ no index
 * antes do módulo principal. Nunca inclua credenciais administrativas no cliente.
 *
 * localStorage overrides: detona.supabaseUrl, detona.supabaseAnonKey, detona.cloudMode
 */

const injected = (typeof globalThis !== 'undefined' && globalThis.__DETONA_ENV__) || {};

export const ENV = Object.freeze({
  /** development | staging | production */
  APP_ENV: String(injected.APP_ENV || 'development').trim().toLowerCase(),
  /** URL do projeto Supabase (https://xxxx.supabase.co) */
  SUPABASE_URL: String(injected.SUPABASE_URL || '').trim(),
  /** Chave anon (pública, protegida por RLS) */
  SUPABASE_ANON_KEY: String(injected.SUPABASE_ANON_KEY || '').trim(),
  /**
   * off | hybrid
   * off = comportamento atual (só local)
   * hybrid = auth Supabase + sync de progresso (IndexedDB continua SSOT offline)
   */
  CLOUD_MODE: String(injected.CLOUD_MODE || 'off').trim().toLowerCase(),
  /** CDN do @supabase/supabase-js (ESM) */
  SUPABASE_JS_URL:
    String(injected.SUPABASE_JS_URL || '').trim()
    || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm',
});
