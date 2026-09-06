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
const checkoutExperience = String(process.env.CHECKOUT_EXPERIENCE || 'redirect').trim().toLowerCase();
const mercadoPagoPublicKey = String(process.env.MERCADO_PAGO_PUBLIC_KEY || '').trim();
const googleAuthEnabled = String(process.env.AUTH_GOOGLE_ENABLED || 'false').trim().toLowerCase();
if (!['disabled', 'mercado_pago'].includes(checkoutProvider)) throw new Error('CHECKOUT_PROVIDER inválido.');
if (!['redirect', 'embedded'].includes(checkoutExperience)) throw new Error('CHECKOUT_EXPERIENCE inválido.');
if (checkoutExperience === 'embedded' && checkoutProvider !== 'mercado_pago') {
  throw new Error('Checkout incorporado exige CHECKOUT_PROVIDER=mercado_pago.');
}
if (checkoutExperience === 'embedded' && !mercadoPagoPublicKey) {
  throw new Error('Checkout incorporado exige MERCADO_PAGO_PUBLIC_KEY.');
}
if (!['true', 'false'].includes(googleAuthEnabled)) throw new Error('AUTH_GOOGLE_ENABLED inválido.');
if (appEnv !== 'development' && (!url.startsWith('https://') || !anonKey)) {
  throw new Error('Staging/produção exigem SUPABASE_URL e SUPABASE_ANON_KEY.');
}

const values = {
  APP_ENV: appEnv,
  CLOUD_MODE: cloudMode,
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: anonKey,
  AUTH_GOOGLE_ENABLED: googleAuthEnabled === 'true',
  SUPABASE_JS_URL: String(process.env.SUPABASE_JS_URL || ''),
  CHECKOUT_PROVIDER: checkoutProvider,
  CHECKOUT_EXPERIENCE: checkoutExperience,
  MERCADO_PAGO_PUBLIC_KEY: mercadoPagoPublicKey,
  PUBLIC_COURSES_URL: String(process.env.PUBLIC_COURSES_URL || 'https://detonaconcursos.com/').trim(),
};
const output = `/* Gerado no build; não adicionar segredos. */\nglobalThis.__DETONA_ENV__ = Object.freeze(${JSON.stringify(values, null, 2)});\n`;
writeFileSync(resolve(import.meta.dirname, '../env.runtime.js'), output, 'utf8');
console.log(`Runtime configurado para ${appEnv}.`);
