const ACTIVE_CONTEST_KEY = 'detona.activeContestId';

function readStoredContestId() {
  try { return globalThis.localStorage?.getItem(ACTIVE_CONTEST_KEY) || null; }
  catch { return null; }
}

let activeContestId = readStoredContestId();

export function setActiveContestId(contestId) {
  activeContestId = contestId || null;
  try {
    if (activeContestId) globalThis.localStorage?.setItem(ACTIVE_CONTEST_KEY, activeContestId);
    else globalThis.localStorage?.removeItem(ACTIVE_CONTEST_KEY);
  } catch { /* armazenamento indisponível: mantém o contexto em memória */ }
}

export function getActiveContestId() {
  return activeContestId;
}

export function requireActiveContestId() {
  if (!activeContestId) throw new Error('CONTEST_REQUIRED');
  return activeContestId;
}

export function clearActiveContestId() {
  activeContestId = null;
  try { globalThis.localStorage?.removeItem(ACTIVE_CONTEST_KEY); }
  catch { /* armazenamento indisponível */ }
}
