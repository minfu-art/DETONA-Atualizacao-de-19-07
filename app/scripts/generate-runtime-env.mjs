import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY nunca pode ser exposta no runtime do navegador.');
}

const appEnv = String(process.env.APP_ENV || 'development').toLowerCase();
if (!['development', 'staging', 'production'].includes(appEnv)) throw new Error('APP_ENV inválido.');
const cloudMode = appEnv === 'development' ? String(process.env.CLOUD_MODE || 'off') : 'hybrid';
const url = String(process.env.SUPABASE_URL || '');
const anonKey = String(process.env.SUPABASE_ANON_KEY || '');
const checkoutProvider = String(process.env.CHECKOUT_PROVIDER || 'disabled').trim().toLowerCase();
if (!['disabled', 'mercado_pago'].includes(checkoutProvider)) throw new Error('CHECKOUT_PROVIDER inválido.');
if (appEnv !== 'development' && (!url.startsWith('https://') || !anonKey)) {
  throw new Error('Staging/produção exigem SUPABASE_URL e SUPABASE_ANON_KEY.');
}

const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
const buildEnvironment = vercelEnv === 'production'
  ? 'production'
  : vercelEnv === 'preview'
    ? 'preview'
    : 'local';
const rawCommitSha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '').trim();
const buildCommitSha = /^[a-f0-9]{7,40}$/i.test(rawCommitSha) ? rawCommitSha.toLowerCase() : '';
const buildGitRef = String(process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || '')
  .trim()
  .slice(0, 160);
const buildTime = new Date(process.env.DETONA_BUILD_TIME || Date.now());
if (Number.isNaN(buildTime.getTime())) throw new Error('DETONA_BUILD_TIME inválido.');

const values = {
  APP_ENV: appEnv,
  CLOUD_MODE: cloudMode,
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_JS_URL: String(process.env.SUPABASE_JS_URL || ''),
  CHECKOUT_PROVIDER: checkoutProvider,
  PUBLIC_COURSES_URL: String(process.env.PUBLIC_COURSES_URL || 'https://detonaconcursos.com/').trim(),
  BUILD_ENVIRONMENT: buildEnvironment,
  BUILD_COMMIT_SHA: buildCommitSha,
  BUILD_GIT_REF: buildGitRef,
  BUILD_TIME: buildTime.toISOString(),
};
const output = `/* Gerado no build; não adicionar segredos. */\nglobalThis.__DETONA_ENV__ = Object.freeze(${JSON.stringify(values, null, 2)});\n`;
writeFileSync(resolve(import.meta.dirname, '../env.runtime.js'), output, 'utf8');
console.log(`Runtime configurado para ${appEnv}.`);
