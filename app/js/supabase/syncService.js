/**
 * Orquestra pull/push de progresso quando a nuvem está ativa.
 */
import { isCloudEnabled } from '../config/cloudConfig.js';
import { flushOutbox, pullAndMergeProgress } from './hybridProgressAdapter.js';
import { progressCloud, SYNC_COLLECTIONS } from './progressCloud.js';
import * as localDb from '../core/db.js';

let lastSyncAt = null;
let syncing = false;

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
  if (syncing) return { skipped: true, reason: 'busy' };
  syncing = true;
  try {
    const pull = await pullAndMergeProgress(userId, contestId);
    const outbox = await flushOutbox();
    lastSyncAt = new Date().toISOString();
    try {
      await localDb.setMeta('cloud_last_sync_at', lastSyncAt, userId, contestId);
    } catch {
      /* meta opcional se store ainda não aberto */
    }
    return { pull, outbox, at: lastSyncAt };
  } finally {
    syncing = false;
  }
}

/**
 * Push completo do estado local → nuvem (útil após migração local→cloud).
 */
export async function pushAllLocalProgress(userId, contestId) {
  if (!isCloudEnabled()) return { skipped: true };
  let total = 0;
  for (const collection of SYNC_COLLECTIONS) {
    const rows = await localDb.getAll(collection, userId, contestId);
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
    flushOutbox().catch(() => {});
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
