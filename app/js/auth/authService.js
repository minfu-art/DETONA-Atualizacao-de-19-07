import { PasswordHasher } from './passwordHasher.js';
import { SessionService } from './sessionService.js';
import { UserRepository } from '../repositories/userRepository.js';
import { clearActiveUserId, setActiveUserId } from './activeUser.js';

const DEFAULT_MODULES = ['pc_al_2026'];
const DEFAULT_PREFERENCES = { theme: 'dark', soundEnabled: true };

export const USER_ROLES = Object.freeze({
  STUDENT: 'student',
  DEVELOPER: 'developer',
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(user) {
  if (!user) return null;
  const { credential, ...safe } = user;
  return safe;
}

export class AuthService {
  constructor({
    users = new UserRepository(),
    sessions = new SessionService(),
    hasher = new PasswordHasher(),
    migrationService = null,
    now = () => new Date(),
    idFactory = () => globalThis.crypto?.randomUUID?.() || `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  } = {}) {
    this.users = users;
    this.sessions = sessions;
    this.hasher = hasher;
    this.migrationService = migrationService;
    this.now = now;
    this.idFactory = idFactory;
    this.currentUser = null;
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
    if (await this.users.findByEmail(cleanEmail)) throw new Error('Este e-mail ja esta cadastrado.');

    const isFirstUser = (await this.users.count()) === 0;
    const timestamp = this.now().toISOString();
    const user = {
      id: this.idFactory(),
      name: cleanName,
      email: cleanEmail,
      createdAt: timestamp,
      lastAccessAt: timestamp,
      enabledModules: [...DEFAULT_MODULES],
      preferences: { ...DEFAULT_PREFERENCES },
      credential: await this.hasher.hash(cleanPassword),
      localAuthDemo: true,
      role: USER_ROLES.STUDENT,
      legacyMigration: isFirstUser ? 'pending' : 'not_applicable',
    };
    await this.users.save(user);

    await this.#completePendingMigration(user);
    await this.#ensureRole(user);

    await this.sessions.create(user.id);
    setActiveUserId(user.id);
    this.currentUser = publicUser(user);
    return this.currentUser;
  }

  async login({ email, password }) {
    const user = await this.users.findByEmail(normalizeEmail(email));
    if (!user || !(await this.hasher.verify(password, user.credential))) {
      throw new Error('E-mail ou senha invalidos.');
    }
    await this.#completePendingMigration(user);
    await this.#ensureRole(user);
    user.lastAccessAt = this.now().toISOString();
    await this.users.save(user);
    await this.sessions.create(user.id);
    setActiveUserId(user.id);
    this.currentUser = publicUser(user);
    return this.currentUser;
  }

  async restoreSession() {
    const session = await this.sessions.restore();
    if (!session) return null;
    const user = await this.users.findById(session.userId);
    if (!user) {
      await this.sessions.clear();
      return null;
    }
    await this.#completePendingMigration(user);
    await this.#ensureRole(user);
    user.lastAccessAt = this.now().toISOString();
    await this.users.save(user);
    setActiveUserId(user.id);
    this.currentUser = publicUser(user);
    return this.currentUser;
  }

  async logout() {
    await this.sessions.clear();
    clearActiveUserId();
    this.currentUser = null;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return Boolean(this.currentUser);
  }

  async #completePendingMigration(user) {
    if (user.legacyMigration !== 'pending' || !this.migrationService) return;
    const result = await this.migrationService.migrateToFirstUser(user.id);
    user.legacyMigration = result.migrated || result.reason === 'target_not_empty'
      ? 'completed'
      : 'no_legacy_data';
    if (user.legacyMigration === 'completed') user.role = USER_ROLES.DEVELOPER;
    await this.users.save(user);
  }

  async #ensureRole(user) {
    if (Object.values(USER_ROLES).includes(user.role)) return;
    user.role = user.legacyMigration === 'completed'
      ? USER_ROLES.DEVELOPER
      : USER_ROLES.STUDENT;
    await this.users.save(user);
  }
}

export function canAccessInternalRoute(authService) {
  return Boolean(authService?.isAuthenticated());
}

export function isDeveloperUser(user) {
  return user?.role === USER_ROLES.DEVELOPER;
}

export function canAccessDeveloperRoute(authService) {
  return Boolean(authService?.isAuthenticated() && isDeveloperUser(authService.getCurrentUser?.()));
}
