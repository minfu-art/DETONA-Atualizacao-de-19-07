const RECOVERABLE_ERROR_NAMES = new Set(['AbortError', 'InvalidStateError', 'UnknownError']);

function storageError(code, message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function normalizeOpenError(error) {
  if (error?.code?.startsWith?.('IDB_')) return error;
  if (error?.name === 'VersionError') {
    return storageError(
      'IDB_VERSION_CONFLICT',
      'Os dados locais foram criados por uma versão mais recente do aplicativo.',
      error,
    );
  }
  if (error?.name === 'QuotaExceededError') {
    return storageError('IDB_QUOTA_EXCEEDED', 'O armazenamento local do navegador esta cheio.', error);
  }
  if (error?.name === 'SecurityError') {
    return storageError('IDB_PERMISSION_DENIED', 'O navegador bloqueou o armazenamento local.', error);
  }
  if (RECOVERABLE_ERROR_NAMES.has(error?.name)) {
    return storageError('IDB_TRANSIENT', 'O armazenamento local falhou temporariamente.', error);
  }
  return storageError('IDB_OPEN_FAILED', 'Não foi possível abrir o armazenamento local.', error);
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function openOnce({ factory, name, version, upgrade, blockedTimeoutMs, onBlocked }) {
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    let blockedTimer = null;
    let upgradeFailure = null;

    const clearBlockedTimer = () => {
      if (blockedTimer !== null) clearTimeout(blockedTimer);
      blockedTimer = null;
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearBlockedTimer();
      reject(normalizeOpenError(error));
    };

    try {
      request = factory.open(name, version);
    } catch (error) {
      fail(error);
      return;
    }

    request.onblocked = () => {
      onBlocked?.();
      if (blockedTimer !== null) return;
      blockedTimer = setTimeout(() => fail(storageError(
        'IDB_BLOCKED',
        'Outra aba está concluindo uma atualização dos dados locais.',
      )), blockedTimeoutMs);
    };
    request.onupgradeneeded = (event) => {
      try {
        upgrade?.(request.result, event.oldVersion, event.newVersion, request.transaction);
      } catch (error) {
        upgradeFailure = storageError('IDB_UPGRADE_FAILED', 'Falha ao atualizar os dados locais.', error);
        try { request.transaction?.abort?.(); } catch { /* a transacao ja pode ter abortado */ }
      }
    };
    request.onerror = () => fail(upgradeFailure || request.error);
    request.onsuccess = () => {
      clearBlockedTimer();
      const database = request.result;
      if (settled) {
        try { database?.close?.(); } catch { /* evita conexao orfa apos timeout */ }
        return;
      }
      settled = true;
      resolve(database);
    };
  });
}

/**
 * Abre um IndexedDB sem apagar dados e repete somente erros comprovadamente
 * transitorios. Upgrades continuam sob responsabilidade do callback recebido.
 */
export async function openIndexedDatabase({
  name,
  version,
  upgrade,
  factory = globalThis.indexedDB,
  blockedTimeoutMs = 4_000,
  retryDelayMs = 30,
  maxAttempts = 2,
  onBlocked = null,
} = {}) {
  if (!factory?.open) {
    throw storageError('IDB_UNAVAILABLE', 'Este navegador não disponibiliza armazenamento local seguro.');
  }
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await openOnce({ factory, name, version, upgrade, blockedTimeoutMs, onBlocked });
    } catch (error) {
      lastError = normalizeOpenError(error);
      if (!['IDB_TRANSIENT', 'IDB_BLOCKED'].includes(lastError.code) || attempt === maxAttempts) throw lastError;
      await wait(retryDelayMs);
    }
  }
  throw lastError;
}
