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
  const service = new PublishedCoursePackageService({
    fetchImpl: async () => ({ ok: true, json: async () => structuredClone(base) }),
  });
  return service.load('pc_pe_2026');
}

test('PC PE Agente carrega o pacote inicial publicado com vendas bloqueadas', async () => {
  const published = await publishedRuntime();
  assert.equal(published.contestId, 'pc_pe_2026');
  assert.equal(published.version, '2026.09.01.1');
  assert.match(published.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(published.previewOnly, false);
  assert.equal(published.publicationBlocked, false);
  assert.equal(published.salesBlocked, true);
  assert.equal(published.metadata.content_status, 'ready');
  assert.equal(published.metadata.sales_status, 'coming_soon');
  assert.equal(published.metadata.price_cents, 0);
  assert.equal(published.curriculum.filter(({ type }) => type === 'discipline').length, 11);
  assert.equal(published.curriculum.filter(({ type }) => type === 'subtopic').length, 188);
  assert.equal(published.questions.length, 100);
  assert.equal(new Set(published.questions.map(({ id }) => id)).size, 100);
  assert.ok(published.questions.every(({ primary_microknowledge_id: id }) => Boolean(id)));

  const seed = buildDynamicSeedEntities(published);
  assert.equal(seed.disciplines.length, 11);
  assert.equal(seed.subtopics.length, 188);
  assert.equal(seed.questions.length, 100);
  assert.ok(seed.questions.every(({ contest_id: contestId }) => contestId === 'pc_pe_2026'));
});

test('registro estático da PC PE aponta para a versão e contagens publicadas', () => {
  const entry = STATIC_PUBLISHED_PACKAGES.pc_pe_2026;
  assert.ok(entry.baseUrl.includes('pc-pe-2026-agente-runtime.json'));
  assert.equal(entry.patchUrls.length, 0);
  assert.equal(entry.expectedQuestionCount, 100);
  assert.equal(entry.expectedSubtopicCount, 188);
  assert.equal(entry.salesBlocked, true);
});

test('migration publica apenas conteúdo da PC PE e mantém vendas fechadas', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260901013000_publish_pc_pe_agent_content.sql', import.meta.url), 'utf8');
  assert.match(sql, /'pc_pe_2026'/);
  assert.match(sql, /'ready'/);
  assert.match(sql, /'coming_soon'/);
  assert.match(sql, /'static_bundle'/);
  assert.match(sql, /\r?\n\s*0,\r?\n\s*'BRL'/);
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
