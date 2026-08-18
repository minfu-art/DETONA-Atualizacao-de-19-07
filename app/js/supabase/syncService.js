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
import { isCourseFactoryStudentPreview } from '../services/courseFactoryPreviewService.js';

let lastSyncAt = null;
const activeSyncs = new Map();

/**
 * Agenda uma tarefa remota que pode ser adiada enquanto uma tela interativa
 * estiver ativa. A retomada e deliberadamente orientada por eventos: quem
 * controla a navegacao chama request() novamente quando o contexto fica seguro.
 */
export function createDeferredSyncTask({ schedule, isCurrent, shouldDefer, run, onError = () => {} }) {
  let pending = true;
  let scheduled = false;
  let running = false;

  const request = () => {
    if (!pending || scheduled || running) return false;
    if (!isCurrent()) {
      pending = false;
      return false;
    }
    if (shouldDefer()) return false;

    scheduled = true;
    schedule(async () => {
      scheduled = false;
      if (!pending) return;
      if (!isCurrent()) {
        pending = false;
        return;
      }
      if (shouldDefer()) return;

      running = true;
      try {
        const completed = await run();
        if (!isCurrent() || completed !== false) pending = false;
      } catch (error) {
        pending = false;
        onError(error);
      } finally {
        running = false;
      }
    });
    return true;
  };

  return {
    request,
    cancel() {
      pending = false;
    },
    isPending: () => pending,
    isScheduled: () => scheduled,
    isRunning: () => running,
  };
}

export function getLastSyncAt() {
  return lastSyncAt;
}

/**
 * Após login + abertura de concurso: traz dados da nuvem e drena outbox.
 */
export async function syncOnContestOpen(userId, contestId) {
  if (isCourseFactoryStudentPreview() || !isCloudEnabled() || !userId || !contestId) {
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
  if (isCourseFactoryStudentPreview() || !isCloudEnabled()) return { skipped: true };
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

export function bindOnlineFlush({
  canFlush = () => true,
  getScope = () => ({ userId: getActiveUserId(), contestId: getActiveContestId() }),
  flush = flushOutbox,
  windowRef = typeof window === 'undefined' ? null : window,
} = {}) {
  let pendingScope = null;
  const activeFlushes = new Map();

  const scopeKey = (scope) => `${scope?.userId || ''}\u0000${scope?.contestId || ''}`;
  const validScope = (scope) => Boolean(scope?.userId && scope?.contestId);
  const runFlush = (scope) => {
    const key = scopeKey(scope);
    if (activeFlushes.has(key)) return activeFlushes.get(key);
    const promise = Promise.resolve().then(() => flush(scope)).finally(() => {
      if (activeFlushes.get(key) === promise) activeFlushes.delete(key);
    });
    activeFlushes.set(key, promise);
    return promise;
  };

  const requestFlush = () => {
    if (isCourseFactoryStudentPreview()) {
      pendingScope = null;
      return Promise.resolve({ skipped: true, previewIsolated: true });
    }
    const scope = getScope();
    if (!validScope(scope)) {
      pendingScope = null;
      return Promise.resolve({ skipped: true });
    }
    if (!canFlush()) {
      pendingScope = { ...scope };
      return Promise.resolve({ deferred: true });
    }
    pendingScope = null;
    return runFlush(scope);
  };

  const flushWhenSafe = () => {
    if (isCourseFactoryStudentPreview()) {
      pendingScope = null;
      return Promise.resolve({ skipped: true, previewIsolated: true });
    }
    if (!pendingScope) return Promise.resolve({ skipped: true });
    const currentScope = getScope();
    if (!validScope(currentScope) || scopeKey(currentScope) !== scopeKey(pendingScope)) {
      pendingScope = null;
      return Promise.resolve({ skipped: true, stale: true });
    }
    if (!canFlush()) return Promise.resolve({ deferred: true });
    const scope = pendingScope;
    pendingScope = null;
    return runFlush(scope);
  };

  const handler = () => requestFlush().catch(() => {});
  windowRef?.addEventListener('online', handler);

  return {
    flushWhenSafe,
    cancelPending() {
      pendingScope = null;
    },
    isPending: () => Boolean(pendingScope),
    dispose() {
      pendingScope = null;
      windowRef?.removeEventListener('online', handler);
    },
  };
}
