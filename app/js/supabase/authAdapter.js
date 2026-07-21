/**
 * Bridge de autenticação Supabase ↔ AuthService local.
 *
 * Quando a nuvem está ligada, register/login usam Supabase Auth e
 * materializam um "user" no formato AppUser + profile row.
 * Sessão: persistida pelo client Supabase; activeUserId = auth.uid().
 */
import { getSupabaseClient } from './client.js';
import { isCloudEnabled } from '../config/cloudConfig.js';
import { clearActiveUserId, setActiveUserId } from '../auth/activeUser.js';
import { USER_ROLES } from '../auth/authService.js';

const DEFAULT_MODULES = ['pc_al_2026'];
const DEFAULT_PREFERENCES = { theme: 'dark', soundEnabled: true };

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function mapProfileToUser(profile, authUser) {
  return {
    id: profile?.id || authUser.id,
    name: profile?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Aluno',
    email: profile?.email || authUser.email || '',
    createdAt: profile?.created_at || authUser.created_at || new Date().toISOString(),
    lastAccessAt: profile?.last_access_at || new Date().toISOString(),
    enabledModules: Array.isArray(profile?.enabled_modules) && profile.enabled_modules.length
      ? profile.enabled_modules
      : [...DEFAULT_MODULES],
    preferences: profile?.preferences && typeof profile.preferences === 'object'
      ? profile.preferences
      : { ...DEFAULT_PREFERENCES },
    role: profile?.role === USER_ROLES.DEVELOPER ? USER_ROLES.DEVELOPER : USER_ROLES.STUDENT,
    cloudAuth: true,
    localAuthDemo: false,
  };
}

export class SupabaseAuthAdapter {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  isAvailable() {
    return isCloudEnabled();
  }

  async #client() {
    const client = await this.getClient();
    if (!client) throw new Error('Supabase não configurado. Veja docs/SUPABASE.md');
    return client;
  }

  async #fetchProfile(userId) {
    const client = await this.#client();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async #ensureProfile(authUser, { name } = {}) {
    const client = await this.#client();
    const existing = await this.#fetchProfile(authUser.id);
    if (existing) {
      await client
        .from('profiles')
        .update({
          last_access_at: new Date().toISOString(),
          ...(name ? { name: String(name).trim() } : {}),
        })
        .eq('id', authUser.id);
      return this.#fetchProfile(authUser.id);
    }

    const row = {
      id: authUser.id,
      name: String(name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Aluno').trim(),
      email: authUser.email || '',
      role: USER_ROLES.STUDENT,
      enabled_modules: DEFAULT_MODULES,
      preferences: DEFAULT_PREFERENCES,
      created_at: new Date().toISOString(),
      last_access_at: new Date().toISOString(),
    };
    const { error } = await client.from('profiles').upsert(row);
    if (error) throw error;
    return row;
  }

  async #activate(authUser, profile) {
    const user = mapProfileToUser(profile, authUser);
    setActiveUserId(user.id);
    return user;
  }

  async register({ name, email, password }) {
    const cleanName = String(name || '').trim();
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = String(password || '');
    if (cleanName.length < 2) throw new Error('Informe seu nome.');
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Informe um e-mail valido.');
    if (cleanPassword.length < 8) throw new Error('A senha deve ter ao menos 8 caracteres.');
    if (!/[A-Za-z]/.test(cleanPassword)) throw new Error('A senha deve conter ao menos uma letra.');
    if (!/\d/.test(cleanPassword)) throw new Error('A senha deve conter ao menos um numero.');
    if (/\s/.test(cleanPassword)) throw new Error('A senha nao pode conter espacos.');

    const client = await this.#client();
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: { data: { name: cleanName } },
    });
    if (error) throw new Error(error.message || 'Falha no cadastro.');
    if (!data.user) throw new Error('Cadastro criado. Verifique o e-mail se a confirmação estiver ativa.');

    // se o projeto exige confirmação de e-mail, session pode ser null
    if (!data.session) {
      return {
        id: data.user.id,
        name: cleanName,
        email: cleanEmail,
        pendingEmailConfirmation: true,
        cloudAuth: true,
      };
    }

    const profile = await this.#ensureProfile(data.user, { name: cleanName });
    return this.#activate(data.user, profile);
  }

  async login({ email, password }) {
    const client = await this.#client();
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: String(password || ''),
    });
    if (error) throw new Error('E-mail ou senha invalidos.');
    if (!data.user) throw new Error('E-mail ou senha invalidos.');

    const profile = await this.#ensureProfile(data.user);
    return this.#activate(data.user, profile);
  }

  async restoreSession() {
    const client = await this.#client();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const session = data?.session;
    if (!session?.user) {
      clearActiveUserId();
      return null;
    }
    const profile = await this.#ensureProfile(session.user);
    return this.#activate(session.user, profile);
  }

  async logout() {
    try {
      const client = await this.getClient();
      if (client) await client.auth.signOut();
    } finally {
      clearActiveUserId();
    }
  }

  async updateProfileFields(userId, fields) {
    const client = await this.#client();
    const { error } = await client.from('profiles').update({
      ...fields,
      last_access_at: new Date().toISOString(),
    }).eq('id', userId);
    if (error) throw error;
  }
}

export const supabaseAuthAdapter = new SupabaseAuthAdapter();
