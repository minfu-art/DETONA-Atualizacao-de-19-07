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
}

export const progressRepository = new ProgressRepository();
