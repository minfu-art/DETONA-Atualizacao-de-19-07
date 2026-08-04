import * as database from '../core/db.js';
import { requireActiveUserId } from '../auth/activeUser.js';
import { requireActiveContestId } from '../contest/activeContest.js';
import { isCloudEnabled } from '../config/cloudConfig.js';
import { hybridProgressAdapter } from '../supabase/hybridProgressAdapter.js';

function resolveDefaultAdapter() {
  try {
    return isCloudEnabled() ? hybridProgressAdapter : database;
  } catch {
    return database;
  }
}

export class ProgressRepository {
  constructor({ adapter = null, userContext = { getUserId: requireActiveUserId }, contestContext = { getContestId: requireActiveContestId } } = {}) {
    this.adapter = adapter || resolveDefaultAdapter();
    this.userContext = userContext;
    this.contestContext = contestContext;
  }

  contestId() {
    const contestId = this.contestContext.getContestId();
    if (!contestId) throw new Error('CONTEST_REQUIRED');
    return contestId;
  }

  userId() {
    const userId = this.userContext.getUserId();
    if (!userId) throw new Error('AUTH_REQUIRED');
    return userId;
  }

  getAll(store) { return this.adapter.getAll(store, this.userId(), this.contestId()); }
  getById(store, id) { return this.adapter.getById(store, id, this.userId(), this.contestId()); }
  put(store, value) { return this.adapter.put(store, value, this.userId(), this.contestId()); }
  putMany(store, values) { return this.adapter.putMany(store, values, this.userId(), this.contestId()); }
  remove(store, id) { return this.adapter.remove(store, id, this.userId(), this.contestId()); }
  clearStore(store) { return this.adapter.clearStore(store, this.userId(), this.contestId()); }
  getByIndex(store, indexName, value) {
    return this.adapter.getByIndex(store, indexName, value, this.userId(), this.contestId());
  }
  getMeta(key) { return this.adapter.getMeta(key, this.userId(), this.contestId()); }
  setMeta(key, value) { return this.adapter.setMeta(key, value, this.userId(), this.contestId()); }

  /** Fixa usuário e concurso para impedir que uma operação assíncrona atravesse uma troca de contexto. */
  forScope(userId = this.userId(), contestId = this.contestId()) {
    const adapter = this.adapter;
    const scope = { userId: String(userId), contestId: String(contestId) };
    return {
      ...scope,
      scopeKey: `${scope.userId}:${scope.contestId}`,
      getAll: (store) => adapter.getAll(store, scope.userId, scope.contestId),
      getById: (store, id) => adapter.getById(store, id, scope.userId, scope.contestId),
      put: (store, value) => adapter.put(store, value, scope.userId, scope.contestId),
      putMany: (store, values) => adapter.putMany(store, values, scope.userId, scope.contestId),
      remove: (store, id) => adapter.remove(store, id, scope.userId, scope.contestId),
      clearStore: (store) => adapter.clearStore(store, scope.userId, scope.contestId),
      getByIndex: (store, indexName, value) => adapter.getByIndex(store, indexName, value, scope.userId, scope.contestId),
      getMeta: (key) => adapter.getMeta(key, scope.userId, scope.contestId),
      setMeta: (key, value) => adapter.setMeta(key, value, scope.userId, scope.contestId),
      forScope: (nextUserId, nextContestId) => this.forScope(nextUserId, nextContestId),
    };
  }
}

export const progressRepository = new ProgressRepository();
