import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDynamicSeedEntities } from '../app/js/core/seed.js';
import { CONTEST_CATALOG } from '../app/js/contest/contestCatalog.js';
import { normalizeDynamicContest } from '../app/js/services/contestCatalogService.js';
import {
  PublishedCoursePackageService,
  STATIC_PUBLISHED_PACKAGES,
} from '../app/js/services/publishedCoursePackageService.js';

const appRootUrl = new URL('../app/', import.meta.url);

async function loadStaticCourse(contestId) {
  const entry = STATIC_PUBLISHED_PACKAGES[contestId];
  const basePath = new URL(String(entry.baseUrl).split('?')[0], appRootUrl);
  const base = JSON.parse(await readFile(basePath, 'utf8'));
  const service = new PublishedCoursePackageService({
    fetchImpl: async (url, options) => {
      assert.equal(options?.cache, 'no-store');
      assert.equal(url, entry.baseUrl);
      return { ok: true, json: async () => structuredClone(base) };
    },
  });
  return service.load(contestId);
}

for (const expected of [
  { contestId: 'pm_pe_2027', questions: 503, subtopics: 77, disciplines: 6 },
  { contestId: 'pp_pe_2027', questions: 444, subtopics: 362, disciplines: 13 },
]) {
  test(`${expected.contestId} carrega a jornada publicada no motor`, async () => {
    const entry = STATIC_PUBLISHED_PACKAGES[expected.contestId];
    const published = await loadStaticCourse(expected.contestId);
    assert.equal(published.contestId, expected.contestId);
    assert.equal(published.version, entry.version);
    assert.equal(published.contentHash, entry.contentHash);
    assert.equal(published.previewOnly, false);
    assert.equal(published.publicationBlocked, false);
    assert.equal(published.salesBlocked, false);
    assert.equal(published.metadata.content_status, 'ready');
    assert.equal(published.metadata.sales_status, 'available');
    assert.equal(published.metadata.price_cents, 2490);
    assert.equal(published.curriculum.filter(({ type }) => type === 'discipline').length, expected.disciplines);
    assert.equal(published.curriculum.filter(({ type }) => type === 'subtopic').length, expected.subtopics);
    assert.equal(published.questions.length, expected.questions);
    assert.equal(new Set(published.questions.map(({ id }) => id)).size, expected.questions);
    assert.ok(published.questions.every(({ primary_microknowledge_id: id }) => Boolean(id)));

    const seed = buildDynamicSeedEntities(published);
    assert.equal(seed.disciplines.length, expected.disciplines);
    assert.equal(seed.subtopics.length, expected.subtopics);
    assert.equal(seed.questions.length, expected.questions);
    assert.ok(seed.questions.every(({ contest_id: contestId }) => contestId === expected.contestId));
  });
}

test('imagens selecionadas da PM PE estão disponíveis no pacote público', async () => {
  const published = await loadStaticCourse('pm_pe_2027');
  const images = [...new Set(published.questions.map(({ reference_image: image }) => image).filter(Boolean))];
  assert.equal(images.length, 21);
  for (const image of images) {
    assert.match(image, /^\/data\/course-factory\/assets\/pm-pe-2027\/question-references\//);
    await access(new URL(`../app${image}`, import.meta.url));
  }
});

test('migração publica os dois cursos sem conceder entitlement', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260904090000_publish_pm_pe_and_pp_pe_courses.sql', import.meta.url), 'utf8');
  assert.match(sql, /'pm_pe_2027'/);
  assert.match(sql, /'pp_pe_2027'/);
  assert.match(sql, /'static_bundle'/);
  assert.match(sql, /'ready'/);
  assert.match(sql, /'available'/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.contest_entitlements/i);
});

test('catálogo local e catálogo remoto normalizado expõem as contagens publicadas', () => {
  for (const expected of [
    { contestId: 'pm_pe_2027', questions: 503, subtopics: 77 },
    { contestId: 'pp_pe_2027', questions: 444, subtopics: 362 },
  ]) {
    const local = CONTEST_CATALOG.find(({ id }) => id === expected.contestId);
    assert.equal(local?.contentStatus, 'ready');
    assert.equal(local?.salesStatus, 'available');
    assert.equal(local?.questionCount, expected.questions);
    assert.equal(local?.subtopicCount, expected.subtopics);

    const remote = normalizeDynamicContest({
      id: expected.contestId,
      code: local.code,
      name: local.name,
      content_status: 'ready',
      sales_status: 'available',
      question_count: 0,
      subtopic_count: 0,
    });
    assert.equal(remote.questionCount, expected.questions);
    assert.equal(remote.subtopicCount, expected.subtopics);
  }
});
