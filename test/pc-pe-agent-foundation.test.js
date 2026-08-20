import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('course-drafts/pc-pe-2026-agente');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('PC PE Agente mantém fundação pré-edital segura e IDs canônicos únicos', async () => {
  const [contestDocument, curriculum, audit] = await Promise.all([
    readJson('course-bundle/contest.json'),
    readJson('course-bundle/curriculum.json'),
    readJson('foundation-audit.v1.json'),
  ]);
  const contest = contestDocument.contest;
  assert.equal(contest.id, 'pc_pe_2026');
  assert.equal(contest.content_status, 'preparing');
  assert.equal(contest.sales_status, 'unavailable');
  assert.equal(contest.price_cents, 0);
  assert.equal(contest.exam_date, null);

  assert.equal(curriculum.contest_id, contest.id);
  assert.equal(curriculum.roles.length, 1);
  assert.equal(curriculum.roles[0].id, 'pc_pe_2026_agente_policia');
  assert.equal(curriculum.roles[0].disciplines.length, 11);

  const disciplines = curriculum.roles.flatMap((role) => role.disciplines);
  const topics = disciplines.flatMap((discipline) => discipline.topics);
  const subtopics = topics.flatMap((topic) => topic.subtopics);
  const allIds = [curriculum.roles[0].id, ...disciplines.map(({ id }) => id), ...topics.map(({ id }) => id), ...subtopics.map(({ id }) => id)];
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(audit.counts.disciplines, disciplines.length);
  assert.equal(audit.counts.topics, topics.length);
  assert.equal(audit.counts.subtopics, subtopics.length);
  assert.equal(audit.safeguards.import_authorized, false);
  assert.equal(audit.safeguards.publication_authorized, false);
});
