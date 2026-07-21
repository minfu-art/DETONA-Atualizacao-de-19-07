import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AuthService,
  USER_ROLES,
  canAccessDeveloperRoute,
  canAccessInternalRoute,
  isDeveloperUser,
} from '../app/js/auth/authService.js';
import { PasswordHasher } from '../app/js/auth/passwordHasher.js';
import { SessionService } from '../app/js/auth/sessionService.js';

class MemoryUsers {
  constructor() { this.items = new Map(); }
  async count() { return this.items.size; }
  async findById(id) { return this.items.get(id); }
  async findByEmail(email) { return [...this.items.values()].find((user) => user.email === email); }
  async save(user) { this.items.set(user.id, structuredClone(user)); return user; }
}

class MemorySessions {
  constructor() { this.items = new Map(); }
  async save(session) { this.items.set(session.id, structuredClone(session)); return session; }
  async findById(id) { return this.items.get(id); }
  async remove(id) { this.items.delete(id); }
}

class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.get(key) ?? null; }
  setItem(key, value) { this.items.set(key, value); }
  removeItem(key) { this.items.delete(key); }
}

function harness() {
  const users = new MemoryUsers();
  const sessionRepository = new MemorySessions();
  const storage = new MemoryStorage();
  const sessions = new SessionService({
    repository: sessionRepository,
    storage,
    now: () => Date.parse('2026-07-14T12:00:00Z'),
    idFactory: () => `session-${sessionRepository.items.size + 1}`,
  });
  const options = {
    users,
    sessions,
    hasher: new PasswordHasher({ iterations: 1000 }),
    now: () => new Date('2026-07-14T12:00:00Z'),
    idFactory: () => 'user-1',
  };
  return { users, sessions, storage, options, auth: new AuthService(options) };
}

test('cadastro cria usuario completo e nunca persiste senha em texto puro', async () => {
  const { auth, users } = harness();
  const result = await auth.register({ name: 'Maria', email: 'MARIA@example.com', password: 'segredo123' });
  const stored = await users.findByEmail('maria@example.com');

  assert.equal(result.id, 'user-1');
  assert.equal(result.name, 'Maria');
  assert.equal(result.email, 'maria@example.com');
  assert.deepEqual(result.enabledModules, ['pc_al_2026']);
  assert.equal(result.role, USER_ROLES.STUDENT);
  assert.equal(result.credential, undefined);
  assert.equal(stored.password, undefined);
  assert.notEqual(stored.credential.hash, 'segredo123');
  assert.equal(stored.credential.algorithm, 'PBKDF2-SHA-256');
});

test('login valido autentica e atualiza o ultimo acesso', async () => {
  const { auth, options, users } = harness();
  await auth.register({ name: 'Maria', email: 'maria@example.com', password: 'segredo123' });
  await auth.logout();
  const later = new AuthService({ ...options, now: () => new Date('2026-07-15T10:00:00Z') });
  const result = await later.login({ email: 'maria@example.com', password: 'segredo123' });

  assert.equal(result.email, 'maria@example.com');
  assert.equal((await users.findById('user-1')).lastAccessAt, '2026-07-15T10:00:00.000Z');
});

test('login invalido nao autentica', async () => {
  const { auth } = harness();
  await auth.register({ name: 'Maria', email: 'maria@example.com', password: 'segredo123' });
  await auth.logout();
  await assert.rejects(
    auth.login({ email: 'maria@example.com', password: 'senha-errada' }),
    /invalidos/,
  );
  assert.equal(auth.isAuthenticated(), false);
});

test('logout encerra a sessao local', async () => {
  const { auth, storage } = harness();
  await auth.register({ name: 'Maria', email: 'maria@example.com', password: 'segredo123' });
  await auth.logout();
  assert.equal(auth.getCurrentUser(), null);
  assert.equal(storage.items.size, 0);
});

test('sessao valida e restaurada ao reabrir a aplicacao', async () => {
  const { auth, options } = harness();
  await auth.register({ name: 'Maria', email: 'maria@example.com', password: 'segredo123' });
  const reopened = new AuthService(options);
  const user = await reopened.restoreSession();
  assert.equal(user.id, 'user-1');
  assert.equal(reopened.isAuthenticated(), true);
});

test('rotas internas ficam bloqueadas sem autenticacao', async () => {
  const { auth } = harness();
  assert.equal(canAccessInternalRoute(auth), false);
  await auth.register({ name: 'Maria', email: 'maria@example.com', password: 'segredo123' });
  assert.equal(canAccessInternalRoute(auth), true);
  await auth.logout();
  assert.equal(canAccessInternalRoute(auth), false);
});

test('forja fica bloqueada para aluno autenticado', async () => {
  const { auth } = harness();
  const user = await auth.register({ name: 'Maria', email: 'maria@example.com', password: 'segredo123' });
  assert.equal(isDeveloperUser(user), false);
  assert.equal(canAccessDeveloperRoute(auth), false);
});

test('primeiro proprietario com dados legados recebe acesso de desenvolvedor', async () => {
  const { options } = harness();
  const auth = new AuthService({
    ...options,
    migrationService: { migrateToFirstUser: async () => ({ migrated: true }) },
  });
  const user = await auth.register({ name: 'Dev', email: 'dev@example.com', password: 'segredo123' });
  assert.equal(user.role, USER_ROLES.DEVELOPER);
  assert.equal(isDeveloperUser(user), true);
  assert.equal(canAccessDeveloperRoute(auth), true);
});
