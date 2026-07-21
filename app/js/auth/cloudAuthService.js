/**
 * AuthService com fallback: Supabase (hybrid) ou IndexedDB local.
 * Mantém a mesma API pública de AuthService.
 */
import { AuthService, canAccessDeveloperRoute, canAccessInternalRoute, isDeveloperUser, USER_ROLES } from './authService.js';
import { isCloudEnabled } from '../config/cloudConfig.js';
import { supabaseAuthAdapter } from '../supabase/authAdapter.js';
import { clearActiveUserId } from './activeUser.js';

export class CloudAwareAuthService {
  constructor({
    localAuth = new AuthService(),
    cloudAuth = supabaseAuthAdapter,
    cloudEnabled = isCloudEnabled,
  } = {}) {
    this.localAuth = localAuth;
    this.cloudAuth = cloudAuth;
    this.cloudEnabled = cloudEnabled;
    this.currentUser = null;
    this.mode = 'local';
  }

  #useCloud() {
    return this.cloudEnabled() && this.cloudAuth?.isAvailable?.() !== false;
  }

  async register(input) {
    if (this.#useCloud()) {
      const user = await this.cloudAuth.register(input);
      this.currentUser = user?.pendingEmailConfirmation ? null : user;
      this.mode = 'cloud';
      if (user?.pendingEmailConfirmation) {
        const err = new Error(
          'Conta criada. Confirme o e-mail antes de entrar (se a confirmação estiver ativa no Supabase).',
        );
        err.code = 'EMAIL_CONFIRMATION_REQUIRED';
        err.user = user;
        throw err;
      }
      return this.currentUser;
    }
    const user = await this.localAuth.register(input);
    this.currentUser = user;
    this.mode = 'local';
    return user;
  }

  async login(input) {
    if (this.#useCloud()) {
      const user = await this.cloudAuth.login(input);
      this.currentUser = user;
      this.mode = 'cloud';
      return user;
    }
    const user = await this.localAuth.login(input);
    this.currentUser = user;
    this.mode = 'local';
    return user;
  }

  async restoreSession() {
    if (this.#useCloud()) {
      try {
        const user = await this.cloudAuth.restoreSession();
        if (user) {
          this.currentUser = user;
          this.mode = 'cloud';
          return user;
        }
      } catch (err) {
        console.warn('[auth] restore cloud session failed', err?.message || err);
      }
      // se hybrid mas sem sessão cloud, tenta local (migração)
    }
    const user = await this.localAuth.restoreSession();
    this.currentUser = user;
    this.mode = user ? 'local' : 'none';
    return user;
  }

  async logout() {
    if (this.mode === 'cloud' || this.#useCloud()) {
      try {
        await this.cloudAuth.logout();
      } catch {
        clearActiveUserId();
      }
    }
    try {
      await this.localAuth.logout();
    } catch {
      clearActiveUserId();
    }
    this.currentUser = null;
    this.mode = 'none';
  }

  getCurrentUser() {
    return this.currentUser || this.localAuth.getCurrentUser?.() || null;
  }

  isAuthenticated() {
    return Boolean(this.getCurrentUser());
  }

  getAuthMode() {
    return this.mode;
  }
}

export { canAccessDeveloperRoute, canAccessInternalRoute, isDeveloperUser, USER_ROLES };
