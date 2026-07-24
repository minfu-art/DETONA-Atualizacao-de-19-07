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
if (appEnv !== 'development' && (!url.startsWith('https://') || !anonKey)) {
  throw new Error('Staging/produção exigem SUPABASE_URL e SUPABASE_ANON_KEY.');
}

const values = {
  APP_ENV: appEnv,
  CLOUD_MODE: cloudMode,
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_JS_URL: String(process.env.SUPABASE_JS_URL || ''),
};
const output = `/* Gerado no build; não adicionar segredos. */\nglobalThis.__DETONA_ENV__ = Object.freeze(${JSON.stringify(values, null, 2)});\n`;
writeFileSync(resolve(import.meta.dirname, '../env.runtime.js'), output, 'utf8');
console.log(`Runtime configurado para ${appEnv}.`);
