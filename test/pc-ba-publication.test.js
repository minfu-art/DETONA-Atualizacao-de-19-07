import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDynamicSeedEntities } from '../app/js/core/seed.js';
import { ContestContentService } from '../app/js/services/contestContentService.js';
import {
  PublishedCoursePackageService,
  STATIC_PUBLISHED_PACKAGES,
} from '../app/js/services/publishedCoursePackageService.js';

const runtimeUrl = new URL('../app/data/course-factory/pc-ba-2026-investigador-runtime.json', import.meta.url);
const patchUrl = new URL('../app/data/course-factory/published/pc-ba-2026-investigador-patch-001.json', import.meta.url);

async function runtime() {
  const [base, patch] = await Promise.all([
    readFile(runtimeUrl, 'utf8').then(JSON.parse),
    readFile(patchUrl, 'utf8').then(JSON.parse),
  ]);
  const service = new PublishedCoursePackageService({
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => structuredClone(String(url).includes('patch-001') ? patch : base),
    }),
  });
  return service.load('pc_ba_2026');
}

test('pacote PC BA publicado é imutável, comercial e alimenta o motor real', async () => {
  const published = await runtime();
  assert.equal(published.contestId, 'pc_ba_2026');
  assert.equal(published.version, '2026.08.17.1');
  assert.match(published.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(published.previewOnly, false);
  assert.equal(published.publicationBlocked, false);
  assert.equal(published.salesBlocked, false);
  assert.equal(published.metadata.content_status, 'ready');
  assert.equal(published.metadata.sales_status, 'available');
  assert.equal(published.metadata.price_cents, 6990);
  assert.equal(published.curriculum.filter(({ type }) => type === 'discipline').length, 14);
  assert.equal(published.curriculum.filter(({ type }) => type === 'topic').length, 161);
  assert.equal(published.curriculum.filter(({ type }) => type === 'subtopic').length, 296);
  assert.equal(published.questions.length, 1267);
  assert.equal(new Set(published.questions.map(({ id }) => id)).size, 1267);
  assert.ok(published.questions.every(({ subtopic_id: subtopicId }) => Boolean(subtopicId)));

  const seed = buildDynamicSeedEntities(published);
  assert.equal(seed.disciplines.length, 14);
  assert.equal(seed.subtopics.length, 296);
  assert.equal(seed.questions.length, 1267);
  assert.ok(seed.questions.every(({ contest_id: contestId }) => contestId === 'pc_ba_2026'));
});

test('registro genérico carrega apenas pacote publicado válido', async () => {
  const published = await runtime();
  const base = JSON.parse(await readFile(runtimeUrl, 'utf8'));
  const patch = JSON.parse(await readFile(patchUrl, 'utf8'));
  const requests = [];
  const service = new PublishedCoursePackageService({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => structuredClone(String(url).includes('patch-001') ? patch : base) };
    },
  });
  assert.equal(service.has('pc_ba_2026'), true);
  assert.equal(service.has('pc_al_2026'), false);
  const loaded = await service.load('pc_ba_2026');
  assert.equal(loaded.questions.length, 1267);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, STATIC_PUBLISHED_PACKAGES.pc_ba_2026.baseUrl);
  assert.equal(requests[1].url, STATIC_PUBLISHED_PACKAGES.pc_ba_2026.patchUrls[0]);
  assert.deepEqual(requests[0].options, { cache: 'no-store' });
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
  assert.equal(loaded.questions.length, 1267);
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
