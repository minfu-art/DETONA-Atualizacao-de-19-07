import * as database from '../core/db.js';
import { STORES } from '../core/types.js';
import { requireActiveUserId } from '../auth/activeUser.js';
import { requireActiveContestId } from '../contest/activeContest.js';
import {
  LOCAL_ONLY_COLLECTIONS,
  isLocalOnlyCollection,
  isLocalOnlyMetaKey,
} from '../privacy/localPersonalData.js';

function assertPersonalWrite(store, key = null) {
  if (isLocalOnlyCollection(store)) return;
  if (store === STORES.meta && isLocalOnlyMetaKey(key)) return;
  throw new Error(`LOCAL_PERSONAL_WRITE_REJECTED:${store}`);
}

export class LocalPersonalRepository {
  constructor({
    adapter = database,
    userContext = { getUserId: requireActiveUserId },
    contestContext = { getContestId: requireActiveContestId },
  } = {}) {
    this.adapter = adapter;
    this.userContext = userContext;
    this.contestContext = contestContext;
  }

  userId() { return this.userContext.getUserId(); }
  contestId() { return this.contestContext.getContestId(); }
  getAll(store) { return this.adapter.getAll(store, this.userId(), this.contestId()); }
  getById(store, id) { return this.adapter.getById(store, id, this.userId(), this.contestId()); }
  getByIndex(store, index, value) { return this.adapter.getByIndex(store, index, value, this.userId(), this.contestId()); }
  put(store, value) {
    assertPersonalWrite(store, store === STORES.meta ? value?.key : null);
    return this.adapter.put(store, value, this.userId(), this.contestId());
  }
  putMany(store, values) {
    if (store === STORES.meta) (values || []).forEach((value) => assertPersonalWrite(store, value?.key));
    else assertPersonalWrite(store);
    return this.adapter.putMany(store, values, this.userId(), this.contestId());
  }
  remove(store, id) {
    assertPersonalWrite(store, store === STORES.meta ? id : null);
    return this.adapter.remove(store, id, this.userId(), this.contestId());
  }
  clearStore(store) {
    assertPersonalWrite(store);
    return this.adapter.clearStore(store, this.userId(), this.contestId());
  }
  getMeta(key) { return this.adapter.getMeta(key, this.userId(), this.contestId()); }
  setMeta(key, value) {
    assertPersonalWrite(STORES.meta, key);
    return this.adapter.setMeta(key, value, this.userId(), this.contestId());
  }

  async clearPersonalData() {
    const userId = this.userId();
    const contestId = this.contestId();
    await Promise.all(LOCAL_ONLY_COLLECTIONS.map((store) => this.adapter.clearStore(store, userId, contestId)));
    const metadata = await this.adapter.getAll(STORES.meta, userId, contestId);
    const personalKeys = metadata.filter((row) => isLocalOnlyMetaKey(row?.key)).map((row) => row.key);
    await Promise.all(personalKeys.map((key) => this.adapter.remove(STORES.meta, key, userId, contestId)));
    return { collections: [...LOCAL_ONLY_COLLECTIONS], metadataRemoved: personalKeys.length };
  }
}

export const localPersonalRepository = new LocalPersonalRepository();
export { LOCAL_ONLY_COLLECTIONS };
