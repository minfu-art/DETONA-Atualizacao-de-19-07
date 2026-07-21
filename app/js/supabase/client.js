/**
 * Cliente Supabase lazy (só carrega o SDK quando a nuvem está habilitada).
 */
import { ENV } from '../config/env.js';
import { getCloudConfig, isCloudEnabled } from '../config/cloudConfig.js';

let clientPromise = null;
let createClientFn = null;

async function loadCreateClient() {
  if (createClientFn) return createClientFn;
  const mod = await import(/* @vite-ignore */ ENV.SUPABASE_JS_URL);
  createClientFn = mod.createClient;
  if (typeof createClientFn !== 'function') {
    throw new Error('Falha ao carregar @supabase/supabase-js (createClient ausente).');
  }
  return createClientFn;
}

/**
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient|null>}
 */
export async function getSupabaseClient() {
  if (!isCloudEnabled()) return null;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const { url, anonKey } = getCloudConfig();
    const createClient = await loadCreateClient();
    return createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'detona.supabase.auth',
      },
    });
  })();

  try {
    return await clientPromise;
  } catch (err) {
    clientPromise = null;
    throw err;
  }
}

/** Força recriação do client (ex.: após trocar credenciais). */
export function resetSupabaseClient() {
  clientPromise = null;
}

export async function getSupabaseSession() {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}
