const RECOVERY_KEY = 'detona.runtime-recovery.v1';
const APP_CACHE_PREFIX = 'detona-v';
const CONTENT_CACHE_PREFIX = 'detona-contest-content:';

export function isIndexedDbBootError(error) {
  return String(error?.code || '').startsWith('IDB_');
}

export function initializationFailure(error) {
  if (error?.code === 'CATALOG_UNAVAILABLE') {
    return {
      title: 'Não foi possível carregar sua biblioteca',
      description: error.message,
    };
  }
  if (isIndexedDbBootError(error)) {
    return {
      title: 'Não foi possível abrir seus dados locais',
      description: error.message,
    };
  }
  return {
    title: 'Não foi possível iniciar o aplicativo',
    description: error?.message || 'Tente novamente em alguns instantes.',
  };
}

/**
 * Um VersionError pode indicar shell antigo controlado por service worker sobre
 * um banco ja atualizado. Atualiza apenas o shell/cache do app, preservando os
 * caches de conteudo e todo o IndexedDB. A marca em sessionStorage evita loop.
 */
export async function recoverStaleRuntime(error, {
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  sessionStorageRef = globalThis.sessionStorage,
  cacheStorage = globalThis.caches,
} = {}) {
  if (error?.code !== 'IDB_VERSION_CONFLICT' || navigatorRef?.onLine === false) return false;
  if (!sessionStorageRef || sessionStorageRef.getItem(RECOVERY_KEY) === 'attempted') return false;
  sessionStorageRef.setItem(RECOVERY_KEY, 'attempted');
  try {
    const registration = await navigatorRef?.serviceWorker?.getRegistration?.();
    await registration?.update?.();
    if (cacheStorage?.keys) {
      const keys = await cacheStorage.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith(APP_CACHE_PREFIX) && !key.startsWith(CONTENT_CACHE_PREFIX))
        .map((key) => cacheStorage.delete(key)));
    }
    locationRef?.reload?.();
    return true;
  } catch {
    sessionStorageRef.removeItem(RECOVERY_KEY);
    return false;
  }
}

export function clearRuntimeRecoveryMarker(sessionStorageRef = globalThis.sessionStorage) {
  sessionStorageRef?.removeItem?.(RECOVERY_KEY);
}
