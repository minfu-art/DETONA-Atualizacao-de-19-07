import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDynamicSeedEntities } from '../app/js/core/seed.js';
import { ContestCatalogService } from '../app/js/services/contestCatalogService.js';
import { ContestContentService } from '../app/js/services/contestContentService.js';
import { validateStudentContentRequest } from '../supabase/functions/student-content/core.js';

const dynamicContest = {
  id: 'pc_pe_2027',
  code: 'PC PE',
  name: 'Polícia Civil de Pernambuco',
  role: 'Agente',
  description: 'Jornada dinâmica.',
  color: '#7c6af5',
  accent: '#ff8a1f',
  icon: 'PE',
  priceCents: 15990,
  currency: 'BRL',
  contentStatus: 'ready',
  salesStatus: 'available',
};

const contentPackage = {
  id: 'package-1',
  contestId: 'pc_pe_2027',
  version: '2027.1',
  contentHash: 'abc123',
  metadata: dynamicContest,
  visualConfig: { battle_avatar: 'https://example.test/avatar.png' },
  curriculum: [
    { id: 'role-uuid', source_id: 'role_agent', parent_id: null, type: 'role', name: 'Agente', order_index: 0 },
    { id: 'disc-uuid', source_id: 'port', parent_id: 'role-uuid', type: 'discipline', name: 'Português', order_index: 0 },
    { id: 'topic-uuid', source_id: 'port_topic', parent_id: 'disc-uuid', type: 'topic', name: 'Texto', order_index: 0 },
    { id: 'sub-uuid', source_id: 'port_1', parent_id: 'topic-uuid', type: 'subtopic', name: 'Interpretação', order_index: 0 },
  ],
  questions: [{
    id: 'q_1', subtopic_id: 'port_1', statement: 'Questão dinâmica.',
    correct_answer: true, explanation: 'Explicação.', format: 'certo_errado',
  }],
};

test('catálogo usa backend quando disponível e fallback somente quando indisponível', async () => {
  const backend = new ContestCatalogService({
    getClient: async () => ({ functions: { invoke: async () => ({ data: { contests: [dynamicContest] }, error: null }) } }),
  });
  assert.equal((await backend.list())[0].source, 'dynamic_catalog');
  const unavailable = new ContestCatalogService({ getClient: async () => null });
  assert.equal((await unavailable.list())[0].source, 'static_fallback');
});

test('pacote dinâmico vira disciplinas, subtópicos e questões sem reutilizar PC/AL', () => {
  const seed = buildDynamicSeedEntities(contentPackage);
  assert.deepEqual(seed.disciplines.map(({ id }) => id), ['port']);
  assert.equal(seed.subtopics[0].discipline_id, 'port');
  assert.equal(seed.questions[0].contest_id, 'pc_pe_2027');
  assert.equal(seed.questions[0].questionSource, 'dynamic');
});

test('cache remove apenas versões antigas do mesmo usuário e concurso', async () => {
  const deleted = [];
  const stored = [];
  const cacheStorage = {
    keys: async () => [
      'detona-v83-dynamic-contests',
      'detona-contest-content:user-a:pc_pe_2027:old',
      'detona-contest-content:user-b:pc_pe_2027:old',
    ],
    delete: async (name) => { deleted.push(name); },
    open: async (name) => ({ put: async () => stored.push(name) }),
  };
  const service = new ContestContentService({
    cacheStorage,
    getClient: async () => ({ functions: { invoke: async () => ({ data: { package: contentPackage }, error: null }) } }),
  });
  const loaded = await service.load('user-a', 'pc_pe_2027');
  assert.equal(loaded.version, '2027.1');
  assert.deepEqual(deleted, ['detona-contest-content:user-a:pc_pe_2027:old']);
  assert.deepEqual(stored, ['detona-contest-content:user-a:pc_pe_2027:2027.1']);
});

test('falha dinâmica não usa conteúdo PC/AL, mas PC/AL mantém fallback compatível', async () => {
  const service = new ContestContentService({
    getClient: async () => ({ functions: { invoke: async () => ({ data: { error: 'offline' }, error: null }) } }),
  });
  await assert.rejects(() => service.load('user-a', 'pc_pe_2027'), /offline/);
  assert.equal((await service.load('user-a', 'pc_al_2026')).legacyStatic, true);
});

test('endpoint do aluno exige ação conhecida e contestId explícito para pacote', () => {
  assert.deepEqual(validateStudentContentRequest({ action: 'list_catalog' }), { action: 'list_catalog' });
  assert.equal(validateStudentContentRequest({ action: 'get_published_package', contestId: 'pc_pe_2027' }).contestId, 'pc_pe_2027');
  assert.throws(() => validateStudentContentRequest({ action: 'get_published_package' }), /required/);
});
