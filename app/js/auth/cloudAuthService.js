/**
 * AuthService com fallback: Supabase (hybrid) ou IndexedDB local.
 * Mantém a mesma API pública de AuthService.
 */
import { AuthService, canAccessDeveloperRoute, canAccessInternalRoute, isDeveloperUser, USER_ROLES } from './authService.js';
import { isCloudEnabled } from '../config/cloudConfig.js';
import { supabaseAuthAdapter } from '../supabase/authAdapter.js';
import { clearActiveUserId } from './activeUser.js';
import { isLocalDevelopment, requiresRemoteBackend } from '../config/appEnvironment.js';
import { assertCloudReadyForEnvironment } from '../config/cloudConfig.js';
import { ENV } from '../config/env.js';

export class CloudAwareAuthService {
  constructor({
    localAuth = new AuthService(),
    cloudAuth = supabaseAuthAdapter,
    cloudEnabled = isCloudEnabled,
    localFallbackAllowed = isLocalDevelopment,
    cloudRequired = requiresRemoteBackend,
    googleEnabled = () => ENV.AUTH_GOOGLE_ENABLED,
  } = {}) {
    this.localAuth = localAuth;
    this.cloudAuth = cloudAuth;
    this.cloudEnabled = cloudEnabled;
    this.localFallbackAllowed = localFallbackAllowed;
    this.cloudRequired = cloudRequired;
    this.googleEnabled = googleEnabled;
    this.currentUser = null;
    this.mode = this.localFallbackAllowed() ? 'local' : 'none';
  }

  #useCloud() {
    return this.cloudEnabled() && this.cloudAuth?.isAvailable?.() !== false;
  }

  #assertAuthAvailable() {
    if (!this.cloudRequired()) return;
    assertCloudReadyForEnvironment();
    if (!this.#useCloud()) throw new Error('Autenticação remota indisponível neste ambiente.');
  }

  async register(input) {
    this.#assertAuthAvailable();
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
    if (!this.localFallbackAllowed()) throw new Error('Autenticação local bloqueada neste ambiente.');
    const user = await this.localAuth.register(input);
    this.currentUser = user;
    this.mode = 'local';
    return user;
  }

  async login(input) {
    this.#assertAuthAvailable();
    if (this.#useCloud()) {
      const user = await this.cloudAuth.login(input);
      this.currentUser = user;
      this.mode = 'cloud';
      return user;
    }
    if (!this.localFallbackAllowed()) throw new Error('Autenticação local bloqueada neste ambiente.');
    const user = await this.localAuth.login(input);
    this.currentUser = user;
    this.mode = 'local';
    return user;
  }

  isGoogleLoginEnabled() {
    return this.googleEnabled() === true && this.#useCloud();
  }

  async loginWithGoogle(input = {}) {
    this.#assertAuthAvailable();
    if (!this.isGoogleLoginEnabled()) {
      throw new Error('A entrada com Google ainda não está disponível.');
    }
    this.mode = 'cloud';
    return this.cloudAuth.loginWithGoogle(input);
  }

  async resendSignupConfirmation(input) {
    this.#assertAuthAvailable();
    if (!this.#useCloud()) {
      throw new Error('O reenvio está disponível no ambiente online.');
    }
    return this.cloudAuth.resendSignupConfirmation(input);
  }

  isPasswordRecoveryLocation(location = globalThis.location) {
    return this.cloudAuth?.isPasswordRecoveryLocation?.(location) === true;
  }

  async requestPasswordReset(input) {
    this.#assertAuthAvailable();
    if (!this.#useCloud()) {
      throw new Error('A recuperação por e-mail está disponível no ambiente online.');
    }
    return this.cloudAuth.requestPasswordReset(input);
  }

  async updatePassword(input) {
    this.#assertAuthAvailable();
    if (!this.#useCloud()) {
      throw new Error('A redefinição de senha está disponível no ambiente online.');
    }
    const result = await this.cloudAuth.updatePassword(input);
    this.currentUser = null;
    this.mode = 'none';
    return result;
  }

  async restoreSession() {
    this.#assertAuthAvailable();
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
        if (!this.localFallbackAllowed()) throw err;
      }
      // se hybrid mas sem sessão cloud, tenta local (migração)
    }
    if (!this.localFallbackAllowed()) return null;
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
    if (this.localFallbackAllowed()) {
      try {
        await this.localAuth.logout();
      } catch {
        clearActiveUserId();
      }
    }
    this.currentUser = null;
    this.mode = 'none';
  }

  getCurrentUser() {
    return this.currentUser
      || (this.localFallbackAllowed() ? this.localAuth.getCurrentUser?.() : null)
      || null;
  }

  isAuthenticated() {
    return Boolean(this.getCurrentUser());
  }

  getAuthMode() {
    return this.mode;
  }
}

export { canAccessDeveloperRoute, canAccessInternalRoute, isDeveloperUser, USER_ROLES };
