import { CONTEST_CATALOG } from '../contest/contestCatalog.js';

const STORAGE_KEY = 'detona.admin.selectedContestId';

export class AdminContext {
  constructor({ storage = globalThis.sessionStorage } = {}) {
    this.storage = storage;
    this.screen = 'overview';
    this.user = null;
    this.adminSelectedContestId = null;
  }

  restoreContest() {
    const saved = this.storage?.getItem?.(STORAGE_KEY);
    this.adminSelectedContestId = CONTEST_CATALOG.some(({ id }) => id === saved)
      ? saved
      : CONTEST_CATALOG[0]?.id || null;
    return this.adminSelectedContestId;
  }

  selectContest(contestId) {
    if (!CONTEST_CATALOG.some(({ id }) => id === contestId)) {
      throw new Error('Concurso administrativo inválido.');
    }
    this.adminSelectedContestId = contestId;
    this.storage?.setItem?.(STORAGE_KEY, contestId);
    return contestId;
  }

  clear() {
    this.storage?.removeItem?.(STORAGE_KEY);
    this.screen = 'overview';
    this.user = null;
    this.adminSelectedContestId = null;
  }
}

export const adminContext = new AdminContext();
