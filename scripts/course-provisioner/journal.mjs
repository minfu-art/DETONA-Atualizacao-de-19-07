import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STEP_NAMES = Object.freeze([
  'validated',
  'contest_created',
  'curriculum_imported',
  'assets_registered',
  'questions_imported',
  'verified',
  'completed',
]);

function journalFilename(operationId) {
  return `${createHash('sha256').update(operationId).digest('hex')}.json`;
}

export class ProvisionJournalStore {
  constructor(directory = process.env.DETONA_PROVISION_JOURNAL_DIR
    || path.join(os.homedir(), '.detona-course-provisioner')) {
    this.directory = path.resolve(directory);
  }

  async load(operationId) {
    try {
      return JSON.parse(await readFile(path.join(this.directory, journalFilename(operationId)), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(journal) {
    await mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, journalFilename(journal.operation_id));
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(journal, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, target);
    return journal;
  }

  create(bundle) {
    const now = new Date().toISOString();
    return {
      schema_version: 1,
      operation_id: bundle.operationId,
      bundle_hash: bundle.bundleHash,
      contest_id: bundle.contest.id,
      status: 'pending',
      steps: Object.fromEntries(STEP_NAMES.map((name) => [name, false])),
      created_at: now,
      updated_at: now,
      completed_at: null,
      last_error: null,
      effects: {
        contest_created: false,
        curriculum_nodes: 0,
        asset_ids: {},
        question_batches: {},
      },
      history: [{ status: 'pending', at: now }],
    };
  }

  async open(bundle) {
    const existing = await this.load(bundle.operationId);
    if (!existing) return this.save(this.create(bundle));
    if (existing.bundle_hash !== bundle.bundleHash || existing.contest_id !== bundle.contest.id) {
      const error = new Error('operation_id já foi usado por um bundle diferente.');
      error.code = 'COURSE_PROVISION_CONFLICT';
      throw error;
    }
    return existing;
  }

  async mark(journal, status, patch = {}) {
    const now = new Date().toISOString();
    journal.status = status;
    journal.updated_at = now;
    if (Object.hasOwn(journal.steps, status)) journal.steps[status] = true;
    if (status === 'completed') journal.completed_at = now;
    if (status !== 'failed') journal.last_error = null;
    Object.assign(journal, patch);
    journal.history.push({ status, at: now });
    return this.save(journal);
  }

  async fail(journal, error) {
    const safeCode = String(error?.code || 'COURSE_PROVISION_PARTIAL').slice(0, 120);
    return this.mark(journal, 'failed', { last_error: { code: safeCode, at: new Date().toISOString() } });
  }
}
