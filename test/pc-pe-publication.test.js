import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDynamicSeedEntities } from '../app/js/core/seed.js';
import {
  PublishedCoursePackageService,
  STATIC_PUBLISHED_PACKAGES,
} from '../app/js/services/publishedCoursePackageService.js';

const runtimeUrl = new URL('../app/data/course-factory/pc-pe-2026-agente-runtime.json', import.meta.url);

async function publishedRuntime() {
  const base = JSON.parse(await readFile(runtimeUrl, 'utf8'));
  const patch001 = JSON.parse(await readFile(new URL('../app/data/course-factory/published/pc-pe-2026-agente-patch-001.json', import.meta.url), 'utf8'));
  const patch002 = JSON.parse(await readFile(new URL('../app/data/course-factory/published/pc-pe-2026-agente-patch-002.json', import.meta.url), 'utf8'));
  const service = new PublishedCoursePackageService({
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => structuredClone(
        String(url).includes('patch-001') ? patch001
          : String(url).includes('patch-002') ? patch002
            : base,
      ),
    }),
  });
  return service.load('pc_pe_2026');
}

test('PC PE Agente carrega o banco ampliado publicado e disponível para venda', async () => {
  const published = await publishedRuntime();
  assert.equal(published.contestId, 'pc_pe_2026');
  assert.equal(published.version, '2026.09.03.2');
  assert.match(published.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(published.previewOnly, false);
  assert.equal(published.publicationBlocked, false);
  assert.equal(published.salesBlocked, false);
  assert.equal(published.metadata.content_status, 'ready');
  assert.equal(published.metadata.sales_status, 'available');
  assert.equal(published.metadata.price_cents, 2490);
  assert.equal(published.curriculum.filter(({ type }) => type === 'discipline').length, 11);
  assert.equal(published.curriculum.filter(({ type }) => type === 'subtopic').length, 188);
  assert.equal(published.questions.length, 1318);
  assert.equal(new Set(published.questions.map(({ id }) => id)).size, 1318);
  assert.ok(published.questions.slice(0, 100).every(({ primary_microknowledge_id: id }) => Boolean(id)));
  assert.ok(published.questions.slice(100, 317).every(({ source_batch: batch }) => batch === 'pcpe-reuso-interno-001'));
  assert.ok(published.questions.slice(317).every(({ source_batch: batch }) => batch === 'pcpe-material-comentado-002'));

  const seed = buildDynamicSeedEntities(published);
  assert.equal(seed.disciplines.length, 11);
  assert.equal(seed.subtopics.length, 188);
  assert.equal(seed.questions.length, 1318);
  assert.ok(seed.questions.every(({ contest_id: contestId }) => contestId === 'pc_pe_2026'));
});

test('registro estático da PC PE aponta para a versão e contagens publicadas', () => {
  const entry = STATIC_PUBLISHED_PACKAGES.pc_pe_2026;
  assert.ok(entry.baseUrl.includes('pc-pe-2026-agente-runtime.json'));
  assert.equal(entry.patchUrls.length, 2);
  assert.ok(entry.patchUrls[0].includes('pc-pe-2026-agente-patch-001.json'));
  assert.ok(entry.patchUrls[1].includes('pc-pe-2026-agente-patch-002.json'));
  assert.equal(entry.expectedQuestionCount, 1318);
  assert.equal(entry.expectedSubtopicCount, 188);
  assert.equal(entry.salesBlocked, false);
});

test('migration comercial libera somente a PC PE por R$ 24,90', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260903090000_sell_pc_pe_agent_2027.sql', import.meta.url), 'utf8');
  assert.match(sql, /'pc_pe_2026'/);
  assert.match(sql, /'ready'/);
  assert.match(sql, /'available'/);
  assert.match(sql, /price_cents\s*=\s*2490/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.contest_entitlements/i);
});

test('rota pública de cursos preserva os recursos do app na raiz', async () => {
  const [indexHtml, vercelConfig] = await Promise.all([
    readFile(new URL('../app/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app/vercel.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);

  assert.match(indexHtml, /<base href="\/" \/>/);
  assert.deepEqual(vercelConfig.rewrites, [
    { source: '/cursos/:path*', destination: '/index.html' },
  ]);
});
