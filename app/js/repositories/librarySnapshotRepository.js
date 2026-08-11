import { sanitizeLibrarySnapshot } from '../services/studentEntryModel.js';

const PREFIX = 'detona.librarySnapshot.v1:';

export class LibrarySnapshotRepository {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
  }

  save(userId, items) {
    if (!this.storage || !userId) return;
    try {
      this.storage.setItem(`${PREFIX}${userId}`, JSON.stringify({
        savedAt: new Date().toISOString(),
        items: sanitizeLibrarySnapshot(items),
      }));
    } catch { /* cache visual opcional */ }
  }

  read(userId) {
    if (!this.storage || !userId) return null;
    try {
      const value = JSON.parse(this.storage.getItem(`${PREFIX}${userId}`) || 'null');
      return Array.isArray(value?.items) ? value : null;
    } catch {
      return null;
    }
  }
}
