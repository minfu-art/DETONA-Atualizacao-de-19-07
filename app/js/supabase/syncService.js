/**
 * Orquestra pull/push de progresso quando a nuvem está ativa.
 */
import { isCloudEnabled } from '../config/cloudConfig.js';
import { flushOutbox, pullAndMergeProgress } from './hybridProgressAdapter.js';
import { progressCloud, SYNC_COLLECTIONS } from './progressCloud.js';
import { shouldSyncCloudRecord } from './collectionKeys.js';
import * as localDb from '../core/db.js';
import { getActiveUserId } from '../auth/activeUser.js';
import { getActiveContestId } from '../contest/activeContest.js';

let lastSyncAt = null;
const activeSyncs = new Map();

export function getLastSyncAt() {
  return lastSyncAt;
}

/**
 * Após login + abertura de concurso: traz dados da nuvem e drena outbox.
 */
export async function syncOnContestOpen(userId, contestId) {
  if (!isCloudEnabled() || !userId || !contestId) {
    return { skipped: true };
  }
  const scopeKey = `${userId}\u0000${contestId}`;
  if (activeSyncs.has(scopeKey)) return activeSyncs.get(scopeKey);
  const syncPromise = (async () => {
    const pull = await pullAndMergeProgress(userId, contestId);
    const outbox = await flushOutbox({ userId, contestId });
    lastSyncAt = new Date().toISOString();
    try {
      await localDb.setMeta('cloud_last_sync_at', lastSyncAt, userId, contestId);
    } catch {
      /* meta opcional se store ainda não aberto */
    }
    return { pull, outbox, at: lastSyncAt };
  })();
  activeSyncs.set(scopeKey, syncPromise);
  try {
    return await syncPromise;
  } finally {
    if (activeSyncs.get(scopeKey) === syncPromise) activeSyncs.delete(scopeKey);
  }
}

/**
 * Push completo do estado local → nuvem (útil após migração local→cloud).
 */
export async function pushAllLocalProgress(userId, contestId) {
  if (!isCloudEnabled()) return { skipped: true };
  let total = 0;
  for (const collection of SYNC_COLLECTIONS) {
    const localRows = await localDb.getAll(collection, userId, contestId);
    const rows = localRows.filter((value) => shouldSyncCloudRecord(collection, value));
    if (!rows.length) continue;
    // não sobe catálogo enorme de questões se forem do seed/import
    // (sobe todas as da store; questões oficiais costumam estar só em JSON, não no IDB)
    await progressCloud.upsertMany(userId, contestId, collection, rows);
    total += rows.length;
  }
  lastSyncAt = new Date().toISOString();
  return { pushed: total, at: lastSyncAt };
}

export function bindOnlineFlush() {
  if (typeof window === 'undefined') return () => {};
  const handler = () => {
    const userId = getActiveUserId();
    const contestId = getActiveContestId();
    if (userId && contestId) flushOutbox({ userId, contestId }).catch(() => {});
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
