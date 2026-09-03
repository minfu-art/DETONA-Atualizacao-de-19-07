import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('course-drafts/pc-pe-2027-agente');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('PC PE 2027 possui identidade comercial coerente e permanece indisponível para venda', async () => {
  const document = await readJson('course-bundle/contest.json');
  const contest = document.contest;
  assert.equal(contest.id, 'pc_pe_2027');
  assert.equal(contest.slug, 'pc-pe-agente-2027');
  assert.equal(contest.role, 'Agente de Polícia');
  assert.equal(contest.content_status, 'preparing');
  assert.equal(contest.sales_status, 'unavailable');
  assert.equal(contest.price_cents, 2490);
  assert.equal(contest.exam_date, null);
});

test('currículo PC PE 2027 preserva integralmente a baseline oficial', async () => {
  const curriculum = await readJson('course-bundle/curriculum.json');
  const role = curriculum.roles[0];
  const disciplines = role.disciplines;
  const topics = disciplines.flatMap((discipline) => discipline.topics);
  const subtopics = topics.flatMap((topic) => topic.subtopics);
  const ids = [role.id, ...disciplines.map(({ id }) => id), ...topics.map(({ id }) => id), ...subtopics.map(({ id }) => id)];
  assert.equal(curriculum.contest_id, 'pc_pe_2027');
  assert.equal(disciplines.length, 11);
  assert.equal(topics.length, 95);
  assert.equal(subtopics.length, 188);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.includes('pc_pe_2027')));
});

test('banco inicial contém 100 questões válidas e continua em rascunho', async () => {
  const [curriculum, batch] = await Promise.all([
    readJson('course-bundle/curriculum.json'),
    readJson('course-bundle/questions/001-pcpe-agente-2027-banco-inicial-autoral.json'),
  ]);
  const subtopicIds = new Set(curriculum.roles.flatMap((role) => role.disciplines.flatMap((discipline) => discipline.topics.flatMap((topic) => topic.subtopics.map(({ id }) => id)))));
  assert.equal(batch.status, 'draft');
  assert.equal(batch.publication_authorized, false);
  assert.equal(batch.questions.length, 100);
  assert.equal(new Set(batch.questions.map(({ id }) => id)).size, 100);
  assert.equal(batch.questions.filter(({ correct_answer }) => correct_answer === true).length, 50);
  assert.equal(batch.questions.filter(({ correct_answer }) => correct_answer === false).length, 50);
  for (const question of batch.questions) {
    assert.equal(question.contest_id, 'pc_pe_2027');
    assert.ok(subtopicIds.has(question.subtopic_id), `Subtópico inválido: ${question.subtopic_id}`);
    assert.equal(question.status, 'draft');
    assert.equal(question.editorial_review, 'pending');
  }
});

test('reuso do banco interno amplia cobertura sem duplicar itens nem autorizar publicação', async () => {
  const [curriculum, initialBatch, reuseBatch, reuseAudit] = await Promise.all([
    readJson('course-bundle/curriculum.json'),
    readJson('course-bundle/questions/001-pcpe-agente-2027-banco-inicial-autoral.json'),
    readJson('course-bundle/questions/002-pcpe-agente-2027-reuso-banco-interno.json'),
    readJson('internal-question-reuse-audit.v1.json'),
  ]);
  const subtopicIds = new Set(curriculum.roles.flatMap((role) => role.disciplines.flatMap((discipline) => discipline.topics.flatMap((topic) => topic.subtopics.map(({ id }) => id)))));
  const initialStatements = new Set(initialBatch.questions.map(({ statement }) => statement.trim().toLowerCase()));
  const reuseStatements = reuseBatch.questions.map(({ statement }) => statement.trim().toLowerCase());

  assert.equal(reuseBatch.status, 'draft');
  assert.equal(reuseBatch.publication_authorized, false);
  assert.equal(reuseBatch.questions.length, 217);
  assert.equal(new Set(reuseBatch.questions.map(({ id }) => id)).size, 217);
  assert.equal(new Set(reuseStatements).size, 217);
  assert.ok(reuseStatements.every((statement) => !initialStatements.has(statement)));
  assert.equal(reuseAudit.totals.total_draft_questions_combined, 317);
  assert.equal(reuseAudit.totals.subtopics_covered_combined, 131);
  assert.equal(reuseAudit.totals.subtopics_pending_combined, 57);
  assert.equal(reuseAudit.safeguards.import_executed, false);
  assert.equal(reuseAudit.safeguards.publication_executed, false);
  assert.equal(reuseAudit.safeguards.requires_human_editorial_review, true);

  for (const question of reuseBatch.questions) {
    assert.equal(question.contest_id, 'pc_pe_2027');
    assert.ok(subtopicIds.has(question.subtopic_id), `Subtópico inválido: ${question.subtopic_id}`);
    assert.equal(question.status, 'draft');
    assert.equal(question.editorial_review, 'pending_pcpe_remap');
    assert.equal(question.provenance.reuse_scope, 'internal_draft_only');
    assert.ok(question.provenance.source_question_id);
  }
});

test('roadmap agenda as 11 disciplinas uma única vez e mantém travas de publicação', async () => {
  const [roadmap, audit] = await Promise.all([
    readJson('course-roadmap.v1.json'),
    readJson('course-readiness-audit.v1.json'),
  ]);
  const scheduled = roadmap.phases.flatMap((phase) => phase.disciplines.map(({ discipline_id }) => discipline_id));
  assert.equal(roadmap.phases.length, 4);
  assert.equal(scheduled.length, 11);
  assert.equal(new Set(scheduled).size, 11);
  assert.equal(roadmap.mission_template.blocks.length, 3);
  assert.equal(audit.curriculum.subtopics, 188);
  assert.equal(audit.curriculum.covered_by_initial_questions, 95);
  assert.equal(audit.curriculum.pending_initial_question_coverage, 93);
  assert.equal(audit.safeguards.import_executed, false);
  assert.equal(audit.safeguards.publication_executed, false);
  assert.equal(audit.safeguards.sales_enabled, false);
});

test('assets obrigatórios existem e respeitam o limite do provisionador', async () => {
  const assets = ['battle-avatar.png', 'cover.png', 'official-crest.png'];
  for (const asset of assets) {
    const file = path.join(root, 'course-bundle', 'assets', asset);
    await access(file);
    assert.ok((await stat(file)).size < 8 * 1024 * 1024, `${asset} excede 8 MB`);
  }
});
