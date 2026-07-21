import { authRequest } from './authDb.js';

const STORAGE_KEY = 'detona.session.id';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export class IndexedDBSessionRepository {
  async save(session) {
    await authRequest('sessions', 'readwrite', (store) => store.put(session));
    return session;
  }

  async findById(id) {
    return authRequest('sessions', 'readonly', (store) => store.get(id));
  }

  async remove(id) {
    return authRequest('sessions', 'readwrite', (store) => store.delete(id));
  }
}

function sessionId() {
  return globalThis.crypto?.randomUUID?.() || `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export class SessionService {
  constructor({
    repository = new IndexedDBSessionRepository(),
    storage = globalThis.localStorage,
    now = () => Date.now(),
    idFactory = sessionId,
  } = {}) {
    this.repository = repository;
    this.storage = storage;
    this.now = now;
    this.idFactory = idFactory;
  }

  async create(userId) {
    const timestamp = this.now();
    const session = {
      id: this.idFactory(),
      userId,
      createdAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + THIRTY_DAYS).toISOString(),
    };
    await this.repository.save(session);
    this.storage?.setItem(STORAGE_KEY, session.id);
    return session;
  }

  async restore() {
    const id = this.storage?.getItem(STORAGE_KEY);
    if (!id) return null;
    const session = await this.repository.findById(id);
    if (!session || Date.parse(session.expiresAt) <= this.now()) {
      if (session) await this.repository.remove(id);
      this.storage?.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  }

  async clear() {
    const id = this.storage?.getItem(STORAGE_KEY);
    if (id) await this.repository.remove(id);
    this.storage?.removeItem(STORAGE_KEY);
  }
}
