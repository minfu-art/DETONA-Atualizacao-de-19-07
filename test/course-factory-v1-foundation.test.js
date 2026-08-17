import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  courseFactoryStudentPreviewUrl,
  isCourseFactoryStudentPreview,
  PC_BA_ADMIN_CONTEST,
  PC_BA_CONTEST_ID,
  PC_BA_OFFERING_ID,
  PC_BA_POSITION_ID,
  requestedCoursePreview,
} from '../app/js/services/courseFactoryPreviewService.js';
import { buildDynamicSeedEntities } from '../app/js/core/seed.js';
import { redirectForRole } from '../app/js/auth/roleRouting.js';

const manifestUrl = new URL('../app/data/course-factory/pc-ba-2026-investigador-manifest.json', import.meta.url);
const runtimeUrl = new URL('../app/data/course-factory/pc-ba-2026-investigador-runtime.json', import.meta.url);

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('PC BA usa identidades canônicas e permanece bloqueada para publicação', () => {
  assert.equal(PC_BA_ADMIN_CONTEST.id, PC_BA_CONTEST_ID);
  assert.equal(PC_BA_ADMIN_CONTEST.position_id, PC_BA_POSITION_ID);
  assert.equal(PC_BA_ADMIN_CONTEST.offering_id, PC_BA_OFFERING_ID);
  assert.equal(PC_BA_ADMIN_CONTEST.exam_date, '2026-12-06');
  assert.equal(PC_BA_ADMIN_CONTEST.content_status, 'preparing');
  assert.equal(PC_BA_ADMIN_CONTEST.sales_status, 'unavailable');
  assert.equal(PC_BA_ADMIN_CONTEST.publication_blocked, true);
});

test('manifesto canônico carrega 14 disciplinas, 161 tópicos e 296 subtópicos', async () => {
  const manifest = await json(manifestUrl);
  assert.deepEqual(manifest.counts, { role: 1, discipline: 14, topic: 161, subtopic: 296 });
  assert.equal(manifest.curriculum.length, 472);
  assert.equal(Object.keys(manifest.coverage).length, 296);
  assert.ok(Object.values(manifest.coverage).every((item) => Number.isInteger(item.question_count)));
  assert.ok(Object.values(manifest.coverage).every((item) => Number.isInteger(item.microknowledge_count)));
});

test('auditoria registra 1.247 questões válidas sem duplicidade ou vínculo quebrado', async () => {
  const manifest = await json(manifestUrl);
  assert.deepEqual(manifest.stats, {
    questions_found: 1247,
    questions_valid: 1247,
    questions_invalid: 0,
    questions_duplicated: 0,
    questions_unlinked: 0,
    batches: 80,
  });
  assert.deepEqual(manifest.validation_errors, []);
});

test('pacote de aluno alimenta o mesmo seed dinâmico do motor DETONA', async () => {
  const runtime = await json(runtimeUrl);
  assert.equal(runtime.contestId, PC_BA_CONTEST_ID);
  assert.equal(runtime.previewOnly, true);
  assert.equal(runtime.publicationBlocked, true);
  assert.equal(runtime.questions.length, 1247);
  const seed = buildDynamicSeedEntities(runtime);
  assert.equal(seed.disciplines.length, 14);
  assert.equal(seed.subtopics.length, 296);
  assert.equal(seed.questions.length, 1247);
  assert.ok(seed.questions.every((question) => question.contest_id === PC_BA_CONTEST_ID));
  assert.equal(runtime.metadata.exam_date, '2026-12-06');
});

test('modo Ver como aluno é explícito, restrito à PC BA e libera developer sem abrir app paralelo', () => {
  assert.equal(courseFactoryStudentPreviewUrl(), 'index.html?coursePreview=pc_ba_2026');
  assert.equal(requestedCoursePreview('?coursePreview=pc_ba_2026'), PC_BA_CONTEST_ID);
  assert.equal(requestedCoursePreview('?coursePreview=outro'), null);
  assert.equal(isCourseFactoryStudentPreview('?coursePreview=pc_ba_2026'), true);
  let redirected = null;
  assert.equal(redirectForRole({ role: 'developer' }, {
    pathname: '/index.html',
    search: '?coursePreview=pc_ba_2026',
    replace: (target) => { redirected = target; },
  }), null);
  assert.equal(redirected, null);
});

test('arquivos administrativos expõem Cursos, auditoria, teste real e publicação bloqueada', async () => {
  const [app, shell, courses, map, questions, preview, publication, sync] = await Promise.all([
    readFile(new URL('../app/js/admin/adminApp.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminShell.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminCoursesScreen.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminCurriculumScreen.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminQuestionsScreen.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminStudentPreviewScreen.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminPublicationScreen.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/supabase/syncService.js', import.meta.url), 'utf8'),
  ]);
  assert.match(shell, /\['contests', 'Cursos'\]/);
  assert.match(courses, /\+ CRIAR NOVO CURSO/);
  assert.match(courses, /VER COMO ALUNO/);
  assert.match(map, /Pesquisar no mapa do edital/);
  assert.match(questions, /Questões encontradas/);
  assert.match(app, /renderAdminCourseAuditScreen/);
  assert.match(preview, /motor de questões/i);
  assert.match(publication, /PUBLICAÇÃO BLOQUEADA/);
  assert.match(sync, /isCourseFactoryStudentPreview\(\)/);
});
