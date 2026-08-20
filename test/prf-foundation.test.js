import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('fundação PRF preserva ID existente e permanece pré-edital', async () => {
  const [manifest, curriculum, audit] = await Promise.all([
    readJson('course-bundle/contest.json'), readJson('course-bundle/curriculum.json'), readJson('foundation-audit.v1.json'),
  ]);
  assert.equal(manifest.contest.id, 'prf_2026');
  assert.equal(manifest.contest.content_status, 'preparing');
  assert.equal(manifest.contest.sales_status, 'unavailable');
  assert.equal(manifest.contest.exam_date, null);
  assert.equal(manifest.contest.price_cents, 0);
  assert.equal(curriculum.roles.length, 1);
  assert.equal(curriculum.roles[0].disciplines.length, 14);
  const disciplines = curriculum.roles[0].disciplines;
  const topics = disciplines.flatMap(({ topics }) => topics);
  const subtopics = topics.flatMap(({ subtopics }) => subtopics);
  const ids = [curriculum.roles[0].id, ...disciplines.map(({ id }) => id), ...topics.map(({ id }) => id), ...subtopics.map(({ id }) => id)];
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(audit.counts.disciplines, disciplines.length);
  assert.equal(audit.counts.topics, topics.length);
  assert.equal(audit.counts.subtopics, subtopics.length);
  assert.equal(audit.safeguards.publication_authorized, false);
});
