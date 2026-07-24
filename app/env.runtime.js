/* Desenvolvimento local seguro por padrão.
 * Em staging/produção este arquivo deve ser gerado pelo hosting, sem service_role.
 */
globalThis.__DETONA_ENV__ = Object.freeze({
  APP_ENV: 'development',
  CLOUD_MODE: 'off',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
});
