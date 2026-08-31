import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDynamicSeedEntities } from '../app/js/core/seed.js';
import {
  PublishedCoursePackageService,
  STATIC_PUBLISHED_PACKAGES,
} from '../app/js/services/publishedCoursePackageService.js';

const appRootUrl = new URL('../app/', import.meta.url);
const entry = STATIC_PUBLISHED_PACKAGES.pm_al_2026;

async function runtime() {
  const basePath = new URL(String(entry.baseUrl).split('?')[0], appRootUrl);
  const base = JSON.parse(await readFile(basePath, 'utf8'));
  const fetchImpl = async (url, options) => {
    assert.equal(options?.cache, 'no-store');
    if (url === entry.baseUrl) return { ok: true, json: async () => structuredClone(base) };
    const patchUrl = entry.patchUrls.find((candidate) => candidate === url);
    assert.ok(patchUrl, `URL publicada inesperada: ${url}`);
    const patchPath = new URL(String(patchUrl).split('?')[0], appRootUrl);
    const patch = JSON.parse(await readFile(patchPath, 'utf8'));
    return { ok: true, json: async () => structuredClone(patch) };
  };
  return new PublishedCoursePackageService({ fetchImpl }).load('pm_al_2026');
}

test('Jornada PM AL publicada alimenta o motor com currículo e lotes auditados', async () => {
  const published = await runtime();
  assert.equal(published.contestId, 'pm_al_2026');
  assert.equal(published.version, entry.version);
  assert.equal(published.contentHash, entry.contentHash);
  assert.equal(published.previewOnly, false);
  assert.equal(published.publicationBlocked, false);
  assert.equal(published.salesBlocked, false);
  assert.equal(published.metadata.content_status, 'ready');
  assert.equal(published.metadata.sales_status, 'available');
  assert.equal(published.metadata.price_cents, 1499);
  assert.match(published.metadata.status_label, /BANCO EM EXPANSÃO/i);
  assert.equal(published.curriculum.filter(({ type }) => type === 'discipline').length, 12);
  assert.equal(published.curriculum.filter(({ type }) => type === 'subtopic').length, 161);
  assert.equal(published.questions.length, 83);
  assert.equal(new Set(published.questions.map(({ id }) => id)).size, 83);

  const seed = buildDynamicSeedEntities(published);
  assert.equal(seed.disciplines.length, 12);
  assert.equal(seed.subtopics.length, 161);
  assert.equal(seed.questions.length, 83);
  assert.ok(seed.questions.every(({ contest_id: contestId }) => contestId === 'pm_al_2026'));
});

test('migração comercial da PM AL usa catálogo canônico e não concede acesso', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260830190000_publish_pm_al_soldado.sql', import.meta.url), 'utf8');
  assert.match(sql, /'pm_al_2026'/);
  assert.match(sql, /1499/);
  assert.match(sql, /'ready'/);
  assert.match(sql, /'available'/);
  assert.match(sql, /'static_bundle'/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.contest_entitlements/i);
});
