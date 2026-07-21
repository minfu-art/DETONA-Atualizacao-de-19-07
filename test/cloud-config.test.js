import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('supabase integration scaffolding', () => {
  it('ships SQL migration with RLS and core tables', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/001_detona_schema.sql'), 'utf8');
    assert.match(sql, /create table if not exists public\.profiles/);
    assert.match(sql, /create table if not exists public\.progress_records/);
    assert.match(sql, /create table if not exists public\.subtopic_progress/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /auth\.uid\(\)/);
    assert.match(sql, /handle_new_user/);
  });

  it('exports cloud config defaults to off', () => {
    const env = readFileSync(join(root, 'app/js/config/env.js'), 'utf8');
    assert.match(env, /CLOUD_MODE/);
    assert.match(env, /'off'/);
  });

  it('wires hybrid progress and cloud-aware auth', () => {
    const repo = readFileSync(join(root, 'app/js/repositories/progressRepository.js'), 'utf8');
    assert.match(repo, /hybridProgressAdapter/);
    assert.match(repo, /isCloudEnabled/);

    const services = readFileSync(join(root, 'app/js/services/appServices.js'), 'utf8');
    assert.match(services, /CloudAwareAuthService/);

    const app = readFileSync(join(root, 'app/js/app.js'), 'utf8');
    assert.match(app, /syncOnContestOpen/);
    assert.match(app, /bindOnlineFlush/);
  });

  it('documents setup in docs/SUPABASE.md', () => {
    const doc = readFileSync(join(root, 'docs/SUPABASE.md'), 'utf8');
    assert.match(doc, /CLOUD_MODE/);
    assert.match(doc, /001_detona_schema/);
    assert.match(doc, /progress_records/);
  });
});
