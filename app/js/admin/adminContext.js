const STORAGE_KEY = 'detona.admin.selectedContestId';

export class AdminContext {
  constructor({ storage = globalThis.sessionStorage } = {}) {
    this.storage = storage;
    this.screen = 'overview';
    this.user = null;
    this.adminSelectedContestId = null;
    this.availableContests = [];
  }

  setAvailableContests(contests) {
    if (!Array.isArray(contests)) throw new Error('Lista de concursos inválida.');
    const ids = new Set();
    this.availableContests = contests.map((contest) => {
      const id = String(contest?.id || '').trim();
      if (!id || ids.has(id)) throw new Error('Concurso administrativo inválido.');
      ids.add(id);
      return { ...contest, id };
    });
    return this.availableContests;
  }

  restoreContest(contests = this.availableContests, preferredContestId = null) {
    this.setAvailableContests(contests);
    const saved = this.storage?.getItem?.(STORAGE_KEY);
    this.adminSelectedContestId = this.availableContests.some(({ id }) => id === preferredContestId)
      ? preferredContestId
      : this.availableContests.some(({ id }) => id === saved)
        ? saved
        : this.availableContests[0]?.id || null;
    if (this.adminSelectedContestId) this.storage?.setItem?.(STORAGE_KEY, this.adminSelectedContestId);
    return this.adminSelectedContestId;
  }

  selectContest(contestId) {
    if (!this.availableContests.some(({ id }) => id === contestId)) {
      throw new Error('Concurso administrativo inválido.');
    }
    this.adminSelectedContestId = contestId;
    this.storage?.setItem?.(STORAGE_KEY, contestId);
    return contestId;
  }

  clear({ preserveWorkspace = false } = {}) {
    if (!preserveWorkspace) this.storage?.removeItem?.(STORAGE_KEY);
    this.screen = 'overview';
    this.user = null;
    if (!preserveWorkspace) {
      this.adminSelectedContestId = null;
      this.availableContests = [];
    }
  }
}

export const adminContext = new AdminContext();
