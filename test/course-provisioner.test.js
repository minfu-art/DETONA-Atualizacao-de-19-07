import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadCourseBundle } from '../scripts/course-provisioner/bundle.mjs';
import { validateStagingConfig } from '../scripts/course-provisioner/client.mjs';
import { ProvisionJournalStore } from '../scripts/course-provisioner/journal.mjs';
import {
  compareRemoteState,
  CourseProvisioner,
  curriculumComparable,
} from '../scripts/course-provisioner/provisioner.mjs';
import { parseArguments } from '../scripts/course-provisioner/index.mjs';

function transparentPngHeader() {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(1, 16);
  bytes.writeUInt32BE(1, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

async function fixtureBundle(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'detona-course-bundle-'));
  await mkdir(path.join(root, 'questions'));
  await mkdir(path.join(root, 'assets'));
  const contest = {
    schema_version: 1,
    operation_id: overrides.operationId || 'test-operation-001',
    contest: {
      id: 'test_course_2027',
      code: 'TESTE',
      slug: 'test-course-2027',
      name: 'Concurso de Teste Local',
      role: 'Cargo de Teste',
      description: 'Bundle fictício usado somente por testes automatizados.',
      content_status: 'preparing',
      sales_status: 'unavailable',
      price_cents: 0,
      currency: 'BRL',
      exam_date: null,
      color: '#7c6af5',
      accent: '#ff8a1f',
    },
    ...overrides.manifest,
  };
  const curriculum = {
    schema_version: 1,
    contest_id: overrides.curriculumContestId || 'test_course_2027',
    roles: [{
      id: 'role_test',
      name: 'Cargo',
      disciplines: [{
        id: 'discipline_test',
        name: 'Disciplina',
        topics: [{
          id: 'topic_test',
          name: 'Tópico',
          subtopics: [{ id: 'subtopic_test', name: 'Subtópico' }],
        }],
      }],
    }],
  };
  await writeFile(path.join(root, 'contest.json'), JSON.stringify(contest));
  await writeFile(path.join(root, 'curriculum.json'), JSON.stringify(curriculum));
  await writeFile(path.join(root, 'questions', 'lote_001.json'), JSON.stringify({
    questions: [{
      id: 'question_test_001',
      contest_id: 'test_course_2027',
      subtopic_id: 'subtopic_test',
      statement: 'O provisionador é isolado do motor acadêmico.',
      correct_answer: true,
      explanation: 'A ferramenta fica fora dos diretórios do aplicativo.',
      options: ['Certo', 'Errado'],
    }],
  }));
  await writeFile(path.join(root, 'assets', 'battle-avatar.png'), transparentPngHeader());
  return root;
}

function exactRemote(bundle) {
  const asset = bundle.assets.battle_avatar;
  return {
    exists: true,
    contest: { ...bundle.contest },
    curriculum: bundle.curriculum.nodes.map((node, index) => ({ ...node, id: `node-${index}` })),
    questions: bundle.questionBatches.flatMap(({ questions }) => questions.map((question) => ({
      source_question_id: question.id,
      contest_id: question.contest_id,
      payload: Object.fromEntries(Object.entries(question).filter(([key]) => !key.startsWith('_') && key !== 'status')),
    }))),
    batches: [{ id: 'batch-1' }],
    versions: [],
    assets: [{ id: 'asset-1', content_hash: asset.hash }],
    visual: {
      battle_avatar_asset_id: 'asset-1',
      success_asset_id: null,
      error_asset_id: null,
      attention_asset_id: null,
      cover_media_asset_id: null,
      visual_status: 'draft',
    },
    packages: [],
    audit: [],
    publication: { ready: false },
  };
}

test('bundle v1 calcula contagens, distribuição, dimensões e hashes', async () => {
  const bundle = await loadCourseBundle(await fixtureBundle());
  assert.equal(bundle.contest.id, 'test_course_2027');
  assert.deepEqual(bundle.curriculum.counts, { roles: 1, disciplines: 1, topics: 1, subtopics: 1 });
  assert.equal(bundle.questionCount, 1);
  assert.deepEqual(bundle.distribution, { C: 1, E: 0 });
  assert.equal(bundle.assets.battle_avatar.width, 1);
  assert.equal(bundle.assets.battle_avatar.hasTransparency, true);
  assert.match(bundle.bundleHash, /^[a-f0-9]{64}$/);
});

test('bundle rejeita currículo pertencente a outro concurso', async () => {
  await assert.rejects(
    loadCourseBundle(await fixtureBundle({ curriculumContestId: 'other_course' })),
    /outro concurso/i,
  );
});

test('CLI bloqueia produção e aceita os três modos de staging', () => {
  assert.throws(() => parseArguments(['--bundle', 'x', '--environment', 'production', '--mode', 'validate']), /produção/i);
  for (const mode of ['validate', 'apply', 'verify']) {
    assert.equal(parseArguments(['--bundle', 'x', '--environment', 'staging', '--mode', mode]).mode, mode);
  }
});

test('cliente aceita somente o Project Ref de staging autorizado', () => {
  const valid = validateStagingConfig({
    environment: 'staging',
    supabaseUrl: 'https://folnsdtmaiksjqqsohjx.supabase.co',
    anonKey: 'public-anon-value',
  });
  assert.equal(valid.stagingProjectRef, 'folnsdtmaiksjqqsohjx');
  assert.throws(() => validateStagingConfig({
    environment: 'staging',
    supabaseUrl: 'https://production-ref.supabase.co',
    anonKey: 'public-anon-value',
  }), /staging autorizado/i);
});

test('comparação reconhece bundle integralmente persistido', async () => {
  const bundle = await loadCourseBundle(await fixtureBundle());
  const remote = exactRemote(bundle);
  assert.deepEqual(curriculumComparable(remote.curriculum), curriculumComparable(bundle.curriculum.nodes));
  const comparison = compareRemoteState(bundle, remote);
  assert.equal(comparison.exact, true, JSON.stringify(comparison));
  assert.deepEqual(comparison.conflicts, []);
  assert.equal(comparison.questions.matching, 1);
  assert.equal(comparison.questions.extra, 0);
});

test('divergência de questão retorna conflito em vez de corrigir automaticamente', async () => {
  const bundle = await loadCourseBundle(await fixtureBundle());
  const remote = exactRemote(bundle);
  remote.questions[0].payload.statement = 'Conteúdo remoto diferente';
  const comparison = compareRemoteState(bundle, remote);
  assert.equal(comparison.exact, false);
  assert.ok(comparison.conflicts.includes('questions_differ'));
});

test('questões remotas extras são conflito e não são apagadas', async () => {
  const bundle = await loadCourseBundle(await fixtureBundle());
  const remote = exactRemote(bundle);
  remote.questions.push({
    source_question_id: 'unexpected_question',
    payload: {
      id: 'unexpected_question',
      contest_id: bundle.contest.id,
      subtopic_id: 'subtopic_test',
      statement: 'Questão que não pertence ao bundle.',
      correct_answer: false,
      explanation: 'Não deve ser apagada automaticamente.',
      options: ['Certo', 'Errado'],
    },
  });
  const comparison = compareRemoteState(bundle, remote);
  assert.equal(comparison.questions.extra, 1);
  assert.ok(comparison.conflicts.includes('questions_extra_remote'));
});

test('operation_id não pode ser reutilizado por bundle diferente', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'detona-journal-'));
  const store = new ProvisionJournalStore(directory);
  const first = await loadCourseBundle(await fixtureBundle({ operationId: 'same-operation-001' }));
  const secondRoot = await fixtureBundle({ operationId: 'same-operation-001' });
  const contestPath = path.join(secondRoot, 'contest.json');
  const secondManifest = JSON.parse(await readFile(contestPath, 'utf8'));
  secondManifest.contest.description = 'Descrição diferente e conflitante.';
  await writeFile(contestPath, JSON.stringify(secondManifest));
  const second = await loadCourseBundle(secondRoot);
  await store.open(first);
  await assert.rejects(store.open(second), (error) => error.code === 'COURSE_PROVISION_CONFLICT');
});

test('validate é somente leitura e produz o plano sem criar concurso fictício', async () => {
  const bundle = await loadCourseBundle(await fixtureBundle());
  const calls = [];
  const client = {
    contests: async (action) => {
      calls.push(['contests', action]);
      if (action === 'validate_curriculum_import') {
        return {
          valid: true,
          count: bundle.curriculum.nodes.length,
          counts: bundle.curriculum.counts,
        };
      }
      if (action === 'list_contests') return { contests: [] };
      throw new Error(`write_not_expected:${action}`);
    },
    editorial: async () => { throw new Error('editorial_not_expected'); },
    media: async () => { throw new Error('media_not_expected'); },
  };
  const store = new ProvisionJournalStore(await mkdtemp(path.join(os.tmpdir(), 'detona-journal-')));
  const provisioner = new CourseProvisioner({ client, journalStore: store, cwd: process.cwd() });
  const report = await provisioner.validate(bundle);
  assert.equal(report.result, 'COURSE_PROVISION_VALID');
  assert.deepEqual(calls, [
    ['contests', 'validate_curriculum_import'],
    ['contests', 'list_contests'],
  ]);
  assert.ok(report.operations.includes('create_contest'));
});

test('apply exige validação humana anterior do mesmo bundle', async () => {
  const bundle = await loadCourseBundle(await fixtureBundle());
  const store = new ProvisionJournalStore(await mkdtemp(path.join(os.tmpdir(), 'detona-journal-')));
  const provisioner = new CourseProvisioner({
    client: {},
    journalStore: store,
    cwd: process.cwd(),
  });
  await assert.rejects(provisioner.apply(bundle), (error) => error.code === 'COURSE_PROVISION_BLOCKED');
});

test('provisionador não importa módulos do motor nem implementa publicação de pacote', async () => {
  const source = await readFile(new URL('../scripts/course-provisioner/provisioner.mjs', import.meta.url), 'utf8');
  const bundleSource = await readFile(new URL('../scripts/course-provisioner/bundle.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(`${source}\n${bundleSource}`, /from\s+['"][^'"]*app\/js\//);
  assert.doesNotMatch(source, /generate_content_package|publish_content_package|generate_snapshot|publish_snapshot/);
  assert.match(source, /PROTECTED_PATHS/);
});
