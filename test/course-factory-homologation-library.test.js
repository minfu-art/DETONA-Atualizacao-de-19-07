import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { redirectForRole } from '../app/js/auth/roleRouting.js';
import { APP_ENVIRONMENTS } from '../app/js/config/appEnvironment.js';
import { LibraryService } from '../app/js/services/libraryService.js';
import { ContestContentService } from '../app/js/services/contestContentService.js';
import {
  HomologationCourseService,
  canListHomologationCourses,
  normalizeHomologationCourse,
} from '../app/js/services/homologationCourseService.js';
import { isCloudProgressAllowed } from '../app/js/supabase/hybridProgressAdapter.js';
import { validateAssistedFactoryRequest } from '../supabase/functions/course-factory-assisted/core.js';

const DEVELOPER = { id: 'developer-1', role: 'developer' };
const STUDENT = { id: 'student-1', role: 'student' };
const PC_AL = {
  id: 'pc_al_2026', code: 'PC AL', name: 'Polícia Civil de Alagoas', role: 'Agente',
  contentStatus: 'ready', salesStatus: 'unavailable', subtopicCount: 137, questionCount: 6480,
};
const GENERIC_DRAFT = {
  draftId: '11111111-1111-4111-8111-111111111111',
  contestId: 'detona_contract_test',
  code: 'DCT',
  name: 'Curso Contrato Genérico',
  role: 'Analista',
  disciplineCount: 2,
  topicCount: 3,
  subtopicCount: 4,
  questionCount: 5,
};

test('overlay é permitido somente para developer no staging', () => {
  assert.equal(canListHomologationCourses(DEVELOPER, APP_ENVIRONMENTS.STAGING), true);
  assert.equal(canListHomologationCourses(STUDENT, APP_ENVIRONMENTS.STAGING), false);
  assert.equal(canListHomologationCourses(DEVELOPER, APP_ENVIRONMENTS.PRODUCTION), false);
});

test('fixture não-PC-BA vira curso genérico de homologação', () => {
  const contest = normalizeHomologationCourse(GENERIC_DRAFT);
  assert.equal(contest.id, 'detona_contract_test');
  assert.equal(contest.previewOnly, true);
  assert.equal(contest.publicationStatus, 'testing');
  assert.equal(contest.salesStatus, 'unavailable');
  assert.equal(contest.subtopicCount, 4);
  assert.equal(contest.questionCount, 5);
});

test('serviço consulta a Edge Function apenas para administrador no staging', async () => {
  let calls = 0;
  const service = new HomologationCourseService({
    environment: () => APP_ENVIRONMENTS.STAGING,
    getClient: async () => ({ functions: { invoke: async (_name, request) => {
      calls += 1;
      assert.deepEqual(request.body, { action: 'list_homologation_courses' });
      return { data: { courses: [GENERIC_DRAFT] }, error: null };
    } } }),
  });
  assert.equal((await service.listForAdmin(DEVELOPER))[0].id, 'detona_contract_test');
  assert.deepEqual(await service.listForAdmin(STUDENT), []);
  assert.equal(calls, 1);
});

test('Biblioteca compõe entitlement real e overlay sem gravar entitlement ou snapshot preview', async () => {
  let savedSnapshot = null;
  const service = new LibraryService({
    allowLocalGrants: () => false,
    catalog: { list: async () => [PC_AL] },
    entitlements: { listByUser: async () => [{ contestId: 'pc_al_2026', status: 'active' }] },
    checkout: { capability: () => ({ configured: false }) },
    snapshots: { save: (_userId, items) => { savedSnapshot = structuredClone(items); }, read: () => null },
    homologations: {
      canList: (user) => user.role === 'developer',
      listForAdmin: async () => [normalizeHomologationCourse(GENERIC_DRAFT)],
    },
  });
  const state = await service.getLibraryState(DEVELOPER);
  assert.deepEqual(state.items.map(({ contest }) => contest.id), ['pc_al_2026', 'detona_contract_test']);
  assert.ok(state.items.every(({ owned }) => owned));
  assert.equal(state.items[1].entitlement, null);
  assert.equal(state.items[1].homologation, true);
  assert.deepEqual(savedSnapshot.map(({ contest }) => contest.id), ['pc_al_2026']);
});

test('aluno comum não recebe overlay mesmo quando há curso homologável', async () => {
  const service = new LibraryService({
    allowLocalGrants: () => false,
    catalog: { list: async () => [PC_AL] },
    entitlements: { listByUser: async () => [{ contestId: 'pc_al_2026', status: 'active' }] },
    checkout: { capability: () => ({ configured: false }) },
    snapshots: { save: () => {}, read: () => null },
    homologations: { canList: () => false, listForAdmin: async () => assert.fail('não deve consultar drafts') },
  });
  const state = await service.getLibraryState(STUDENT);
  assert.deepEqual(state.items.map(({ contest }) => contest.id), ['pc_al_2026']);
});

test('developer vê curso publicado no Preview sem receber entitlement real', async () => {
  const service = new LibraryService({
    allowLocalGrants: () => false,
    catalog: { list: async () => [PC_AL] },
    entitlements: { listByUser: async () => [] },
    checkout: { capability: () => ({ configured: false }) },
    snapshots: { save: () => {}, read: () => null },
    homologations: { canList: () => true, listForAdmin: async () => [] },
  });
  const [item] = (await service.getLibraryState(DEVELOPER)).items;
  assert.equal(item.owned, true);
  assert.equal(item.entitlement, null);
  assert.equal(item.adminPreview, true);
  assert.equal(item.contest.adminPreviewAccess, true);
  assert.equal(item.contest.previewOnly, undefined);
});

test('draft homologado substitui somente a projeção administrativa do mesmo concurso', async () => {
  const catalogContest = {
    ...PC_AL,
    id: GENERIC_DRAFT.contestId,
    code: 'DCT-ANTIGO',
    name: 'Catálogo anterior',
    questionCount: 20,
  };
  const service = new LibraryService({
    allowLocalGrants: () => false,
    catalog: { list: async () => [catalogContest] },
    entitlements: { listByUser: async () => [] },
    checkout: { capability: () => ({ configured: false }) },
    snapshots: { save: () => {}, read: () => null },
    homologations: {
      canList: () => true,
      listForAdmin: async () => [normalizeHomologationCourse(GENERIC_DRAFT)],
    },
  });
  const [item] = (await service.getLibraryState(DEVELOPER)).items;
  assert.equal(item.contest.code, 'DCT');
  assert.equal(item.contest.questionCount, 5);
  assert.equal(item.contest.previewOnly, true);
  assert.equal(item.adminPreview, undefined);
  assert.equal(item.homologation, true);
});

test('card de homologação abre o pacote pelo draft sem endpoint publicado', async () => {
  const calls = [];
  const previewPackage = { contestId: 'detona_contract_test', previewOnly: true };
  const service = new ContestContentService({
    getClient: async () => assert.fail('não deve consultar student-content'),
    previewRequested: () => false,
    previewService: { loadRuntimePackage: async (...args) => { calls.push(args); return previewPackage; } },
  });
  assert.equal(await service.load('developer-1', 'detona_contract_test', {
    previewDraftId: GENERIC_DRAFT.draftId,
  }), previewPackage);
  assert.deepEqual(calls, [['detona_contract_test', { draftId: GENERIC_DRAFT.draftId }]]);
});

test('PC AL publicado abre localmente no contexto administrativo sem entitlement', async () => {
  const service = new ContestContentService({
    getClient: async () => assert.fail('não deve consultar entitlement do aluno'),
    previewRequested: () => false,
  });
  assert.deepEqual(await service.load('developer-1', 'pc_al_2026', { adminPreviewAccess: true }), {
    legacyStatic: true,
    contestId: 'pc_al_2026',
    previewOnly: true,
    adminPreviewAccess: true,
  });
});

test('progresso previewOnly permanece local e conteúdo normal mantém nuvem', () => {
  assert.equal(isCloudProgressAllowed(() => true, () => ({ previewOnly: true })), false);
  assert.equal(isCloudProgressAllowed(() => true, () => ({ previewOnly: false })), true);
  assert.equal(isCloudProgressAllowed(() => false, () => null), false);
});

test('developer permanece no app acadêmico apenas no staging', () => {
  const redirects = [];
  assert.equal(redirectForRole(DEVELOPER, {
    pathname: '/index.html', environment: APP_ENVIRONMENTS.STAGING,
    replace: (target) => redirects.push(target),
  }), null);
  assert.equal(redirectForRole(DEVELOPER, {
    pathname: '/index.html', environment: APP_ENVIRONMENTS.PRODUCTION,
    replace: (target) => redirects.push(target),
  }), './admin.html');
  assert.deepEqual(redirects, ['./admin.html']);
});

test('contrato e UI expõem homologação genérica sem regra PC BA', async () => {
  assert.deepEqual(validateAssistedFactoryRequest({ action: 'list_homologation_courses' }), {
    action: 'list_homologation_courses',
  });
  const [edge, library, app] = await Promise.all([
    readFile(new URL('../supabase/functions/course-factory-assisted/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/ui/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(edge, /\.in\('status', \['package_imported', 'map_approved'\]\)/);
  assert.match(edge, /validation_report\?\.valid === true/);
  assert.match(library, /EM TESTE/);
  assert.match(library, /NÃO PUBLICADO/);
  assert.match(library, /TESTAR CURSO/);
  assert.match(app, /previewDraftId: contestHint\?\.previewOnly === true/);
  assert.doesNotMatch(edge, /contest_id\s*===\s*['"]pc_ba_2026/i);
});
