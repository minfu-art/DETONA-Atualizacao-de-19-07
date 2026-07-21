/**
 * Adapter de progresso híbrido:
 * - IndexedDB = SSOT offline e leitura imediata
 * - Supabase = backup/sync na nuvem (write-through + outbox se offline)
 *
 * Mesma interface que core/db.js (getAll, put, …).
 */
import * as localDb from '../core/db.js';
import { isCloudEnabled } from '../config/cloudConfig.js';
import { progressCloud, recordKeyFor, SYNC_COLLECTIONS } from './progressCloud.js';

const OUTBOX_STORAGE = 'detona.sync.outbox';

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function readOutbox() {
  try {
    const raw = globalThis?.localStorage?.getItem?.(OUTBOX_STORAGE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeOutbox(list) {
  try {
    globalThis?.localStorage?.setItem?.(OUTBOX_STORAGE, JSON.stringify(list.slice(-500)));
  } catch {
    /* quota */
  }
}

function enqueueOutbox(entry) {
  const list = readOutbox();
  list.push({ ...entry, enqueuedAt: new Date().toISOString() });
  writeOutbox(list);
}

async function cloudWriteSafe(fn) {
  if (!isCloudEnabled()) return;
  if (!isOnline()) {
    // caller already enqueued when needed
    return;
  }
  try {
    await fn();
  } catch (err) {
    console.warn('[hybrid] cloud write failed', err?.message || err);
  }
}

export function createHybridProgressAdapter({
  local = localDb,
  cloud = progressCloud,
  cloudEnabled = isCloudEnabled,
} = {}) {
  return {
    getAll(store, userId, contestId) {
      return local.getAll(store, userId, contestId);
    },
    getById(store, id, userId, contestId) {
      return local.getById(store, id, userId, contestId);
    },
    async put(store, value, userId, contestId) {
      const result = await local.put(store, value, userId, contestId);
      if (cloudEnabled() && SYNC_COLLECTIONS.includes(store)) {
        const op = {
          op: 'upsert',
          userId,
          contestId,
          collection: store,
          value,
        };
        if (!isOnline()) {
          enqueueOutbox(op);
        } else {
          await cloudWriteSafe(() => cloud.upsertRecord(userId, contestId, store, value));
        }
      }
      return result;
    },
    async putMany(store, values, userId, contestId) {
      const result = await local.putMany(store, values, userId, contestId);
      if (cloudEnabled() && SYNC_COLLECTIONS.includes(store) && values?.length) {
        if (!isOnline()) {
          for (const value of values) {
            enqueueOutbox({ op: 'upsert', userId, contestId, collection: store, value });
          }
        } else {
          await cloudWriteSafe(() => cloud.upsertMany(userId, contestId, store, values));
        }
      }
      return result;
    },
    async remove(store, id, userId, contestId) {
      await local.remove(store, id, userId, contestId);
      if (cloudEnabled() && SYNC_COLLECTIONS.includes(store)) {
        const op = { op: 'delete', userId, contestId, collection: store, recordKey: String(id) };
        if (!isOnline()) enqueueOutbox(op);
        else await cloudWriteSafe(() => cloud.deleteRecord(userId, contestId, store, id));
      }
    },
    async clearStore(store, userId, contestId) {
      await local.clearStore(store, userId, contestId);
      if (cloudEnabled() && SYNC_COLLECTIONS.includes(store)) {
        const op = { op: 'clear', userId, contestId, collection: store };
        if (!isOnline()) enqueueOutbox(op);
        else await cloudWriteSafe(() => cloud.clearCollection(userId, contestId, store));
      }
    },
    getByIndex(store, indexName, value, userId, contestId) {
      return local.getByIndex(store, indexName, value, userId, contestId);
    },
    getMeta(key, userId, contestId) {
      return local.getMeta(key, userId, contestId);
    },
    setMeta(key, value, userId, contestId) {
      // setMeta já usa put no local; se local.setMeta existir, use-o e espelhe
      return this.put('meta', { key, value }, userId, contestId);
    },
  };
}

/**
 * Reenvia operações enfileiradas offline.
 */
export async function flushOutbox({ cloud = progressCloud } = {}) {
  if (!isCloudEnabled() || !isOnline()) return { flushed: 0 };
  const list = readOutbox();
  if (!list.length) return { flushed: 0 };

  const remaining = [];
  let flushed = 0;
  for (const entry of list) {
    try {
      if (entry.op === 'upsert') {
        await cloud.upsertRecord(entry.userId, entry.contestId, entry.collection, entry.value);
      } else if (entry.op === 'delete') {
        await cloud.deleteRecord(entry.userId, entry.contestId, entry.collection, entry.recordKey);
      } else if (entry.op === 'clear') {
        await cloud.clearCollection(entry.userId, entry.contestId, entry.collection);
      }
      flushed += 1;
    } catch {
      remaining.push(entry);
    }
  }
  writeOutbox(remaining);
  return { flushed, remaining: remaining.length };
}

/**
 * Pull da nuvem → merge no IndexedDB (last-write-wins por updated_at quando possível).
 * Se local está vazio e nuvem tem dados, restaura tudo.
 */
export async function pullAndMergeProgress(userId, contestId, {
  local = localDb,
  cloud = progressCloud,
} = {}) {
  if (!isCloudEnabled()) return { merged: 0, mode: 'off' };

  const remote = await cloud.pullCollections(userId, contestId);
  let merged = 0;

  for (const collection of SYNC_COLLECTIONS) {
    const remoteRows = remote[collection] || [];
    if (!remoteRows.length) continue;

    const localRows = await local.getAll(collection, userId, contestId);
    const localMap = new Map();
    for (const row of localRows) {
      const k = recordKeyFor(collection, row);
      if (k != null) localMap.set(k, row);
    }

    // Local vazio: restaura tudo da nuvem
    if (!localRows.length) {
      const all = remoteRows.map(({ __cloud_updated_at, ...p }) => p);
      await local.putMany(collection, all, userId, contestId);
      merged += all.length;
      continue;
    }

    const toWrite = [];
    for (const remoteRow of remoteRows) {
      const { __cloud_updated_at: cloudAt, ...payload } = remoteRow;
      const k = recordKeyFor(collection, payload);
      if (k == null) continue;
      const localRow = localMap.get(k);
      if (!localRow) {
        toWrite.push(payload);
        continue;
      }
      // last-write-wins quando há timestamps comparáveis
      const localUpdated = localRow.updatedAt || localRow.updated_at || localRow.last_studied_at || null;
      if (cloudAt && localUpdated && Date.parse(cloudAt) > Date.parse(localUpdated)) {
        toWrite.push(payload);
      } else if (!localUpdated && cloudAt) {
        toWrite.push(payload);
      }
    }

    if (toWrite.length) {
      await local.putMany(collection, toWrite, userId, contestId);
      merged += toWrite.length;
    }
  }

  return { merged, mode: 'hybrid' };
}

export const hybridProgressAdapter = createHybridProgressAdapter();
