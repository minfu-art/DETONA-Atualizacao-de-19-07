import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDynamicSeedEntities } from '../app/js/core/seed.js';
import { ContestContentService } from '../app/js/services/contestContentService.js';
import {
  PublishedCoursePackageService,
  STATIC_PUBLISHED_PACKAGES,
} from '../app/js/services/publishedCoursePackageService.js';

const appRootUrl = new URL('../app/', import.meta.url);
const publishedEntry = STATIC_PUBLISHED_PACKAGES.pc_ba_2026;

async function readPublishedFixtures() {
  const readStatic = async (url) => JSON.parse(await readFile(new URL(String(url).split('?')[0], appRootUrl), 'utf8'));
  const base = await readStatic(publishedEntry.baseUrl);
  const patches = new Map();
  for (const url of publishedEntry.patchUrls) patches.set(url, await readStatic(url));
  return { base, patches };
}

function fixtureFetch(base, patches, requests = null) {
  return async (url, options) => {
    requests?.push({ url, options });
    const key = String(url);
    const payload = key === publishedEntry.baseUrl ? base : patches.get(key);
    if (!payload) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => structuredClone(payload) };
  };
}

async function runtime() {
  const { base, patches } = await readPublishedFixtures();
  return new PublishedCoursePackageService({ fetchImpl: fixtureFetch(base, patches) }).load('pc_ba_2026');
}

test('pacote PC BA publicado é imutável, comercial e alimenta o motor real', async () => {
  const published = await runtime();
  assert.equal(published.contestId, 'pc_ba_2026');
  assert.equal(published.version, publishedEntry.version);
  assert.match(published.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(published.previewOnly, false);
  assert.equal(published.publicationBlocked, false);
  assert.equal(published.salesBlocked, false);
  assert.equal(published.metadata.content_status, 'ready');
  assert.equal(published.metadata.sales_status, 'available');
  assert.equal(published.metadata.price_cents, 6990);
  assert.equal(published.curriculum.filter(({ type }) => type === 'discipline').length, 14);
  assert.equal(published.curriculum.filter(({ type }) => type === 'topic').length, 161);
  assert.equal(published.curriculum.filter(({ type }) => type === 'subtopic').length, publishedEntry.expectedSubtopicCount);
  assert.equal(published.questions.length, publishedEntry.expectedQuestionCount);
  assert.equal(new Set(published.questions.map(({ id }) => id)).size, publishedEntry.expectedQuestionCount);
  assert.ok(published.questions.every(({ subtopic_id: subtopicId }) => Boolean(subtopicId)));

  const seed = buildDynamicSeedEntities(published);
  assert.equal(seed.disciplines.length, 14);
  assert.equal(seed.subtopics.length, publishedEntry.expectedSubtopicCount);
  assert.equal(seed.questions.length, publishedEntry.expectedQuestionCount);
  assert.ok(seed.questions.every(({ contest_id: contestId }) => contestId === 'pc_ba_2026'));
});

test('registro genérico carrega base e todos os patches publicados', async () => {
  const { base, patches } = await readPublishedFixtures();
  const requests = [];
  const service = new PublishedCoursePackageService({ fetchImpl: fixtureFetch(base, patches, requests) });
  assert.equal(service.has('pc_ba_2026'), true);
  assert.equal(service.has('pc_al_2026'), false);
  const loaded = await service.load('pc_ba_2026');
  assert.equal(loaded.questions.length, publishedEntry.expectedQuestionCount);
  assert.equal(requests.length, 1 + publishedEntry.patchUrls.length);
  assert.deepEqual(requests.map(({ url }) => url), [publishedEntry.baseUrl, ...publishedEntry.patchUrls]);
  assert.ok(requests.every(({ options }) => options?.cache === 'no-store'));
});

test('conteúdo estático só é aberto após autorização do backend', async () => {
  const published = await runtime();
  let backendCalls = 0;
  let packageCalls = 0;
  const service = new ContestContentService({
    getClient: async () => ({ functions: { invoke: async () => {
      backendCalls += 1;
      return { data: { staticPublished: true, contestId: 'pc_ba_2026' }, error: null };
    } } }),
    cacheStorage: null,
    previewRequested: () => false,
    publishedService: {
      load: async (contestId) => {
        packageCalls += 1;
        assert.equal(contestId, 'pc_ba_2026');
        return published;
      },
    },
  });
  const loaded = await service.load('user-1', 'pc_ba_2026');
  assert.equal(loaded.questions.length, publishedEntry.expectedQuestionCount);
  assert.equal(backendCalls, 1);
  assert.equal(packageCalls, 1);
});

test('migration ativa apenas PC BA Investigador por R$ 69,90', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260817024500_publish_pc_ba_investigador.sql', import.meta.url), 'utf8');
  assert.match(sql, /'pc_ba_2026'/);
  assert.match(sql, /'Investigador de Polícia Civil'/);
  assert.match(sql, /6990/);
  assert.match(sql, /'ready'/);
  assert.match(sql, /'available'/);
  assert.match(sql, /'static_bundle'/);
  assert.doesNotMatch(sql, /Escrivão|Delegado/i);

  const edge = await readFile(new URL('../supabase/functions/student-content/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /content_delivery/);
  assert.match(edge, /staticPublished/);
  assert.match(edge, /entitlement[\s\S]+staticPublished/);
});
