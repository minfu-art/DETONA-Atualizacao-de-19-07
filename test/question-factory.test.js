import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCoverage,
  coverageSummary,
  loadBundle,
  planContracts,
  promoteBatch,
  validateQuestionBatch,
  writeJson,
} from '../scripts/question-factory/core.mjs';
import { publishPatch } from '../scripts/question-factory/publish.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'detona-qf-'));
  const bundlePath = path.join(root, 'course-packages/demo-course');
  await mkdir(path.join(bundlePath, 'questions'), { recursive: true });
  await mkdir(path.join(root, 'app/data/course-factory/published'), { recursive: true });
  await mkdir(path.join(root, 'app/js/services'), { recursive: true });

  await writeJson(path.join(bundlePath, 'course.json'), {
    course: {
      contest_id: 'demo_2026',
      position_id: 'demo_position',
      offering_id: 'demo_offering',
      slug: 'demo-course',
      name: 'Demo Course',
    },
  });
  await writeJson(path.join(bundlePath, 'curriculum.json'), {
    nodes: [
      { id: 'role', parent_id: null, type: 'role', title: 'Cargo' },
      { id: 'disc', parent_id: 'role', type: 'discipline', title: 'Disciplina' },
      { id: 'topic', parent_id: 'disc', type: 'topic', title: 'Tópico' },
      { id: 'sub', parent_id: 'topic', type: 'subtopic', title: 'Subtópico' },
    ],
  });
  await writeJson(path.join(bundlePath, 'microknowledge.json'), {
    microknowledges: [
      { id: 'mk_a', subtopic_id: 'sub', title: 'Conhecimento A' },
      { id: 'mk_b', subtopic_id: 'sub', title: 'Conhecimento B' },
    ],
  });
  await writeJson(path.join(bundlePath, 'edital-map.json'), {
    edital_map: [{
      id: 'map_sub', subtopic_id: 'sub', scope: 'Escopo',
      rules: ['r1'], exceptions: [], applications: ['a1'], competencies: ['c1'], required_knowledge: ['k1', 'k2'],
      microknowledge_ids: ['mk_a', 'mk_b'],
    }],
  });
  await writeJson(path.join(bundlePath, 'sources.json'), {
    sources: [{ id: 'edital', source_type: 'official_edital', title: 'Edital' }],
  });
  await writeJson(path.join(bundlePath, 'questions/001-base.json'), {
    name: 'base',
    questions: [{
      id: 'q_existing', subtopic_id: 'sub', microknowledge_ids: ['mk_a'],
      statement: 'Questão já existente?',
      options: [{ label: 'A', text: 'Sim' }, { label: 'B', text: 'Não' }],
      correct_answer: 'A', explanation: 'Explicação.', difficulty: 'facil', format: 'multipla_escolha',
      source: null, is_trick: false,
      traces: [{ source_id: 'edital', trace_status: 'missing', note: 'Fixture sem página.' }],
    }],
  });

  const runtime = {
    contestId: 'demo_2026',
    contentHash: 'basehash',
    curriculum: [],
    questions: [{ id: 'base_runtime_question' }],
  };
  await writeJson(path.join(root, 'app/data/course-factory/demo-course-runtime.json'), runtime);
  await writeJson(path.join(root, 'app/data/course-factory/published/demo-course-patch-001.json'), {
    name: 'published-001', questions: [{ id: 'old_patch_question', subtopic_id: 'sub', microknowledge_ids: ['mk_a'] }],
  });
  await writeFile(path.join(root, 'app/js/services/publishedCoursePackageService.js'), `const DATA_VERSION = '2026.08.25.1';
export const STATIC_PUBLISHED_PACKAGES = Object.freeze({
  demo_2026: Object.freeze({
    baseUrl: \`data/course-factory/demo-course-runtime.json?v=\${DATA_VERSION}\`,
    patchUrls: Object.freeze([
      \`data/course-factory/published/demo-course-patch-001.json?v=\${DATA_VERSION}\`,
    ]),
    version: DATA_VERSION,
    contentHash: 'oldhash',
    expectedQuestionCount: 2,
    expectedSubtopicCount: 1,
  }),
});
`, 'utf8');

  return { root, bundlePath };
}

function generatedQuestion(id, statement = 'Nova questão?') {
  return {
    id,
    subtopic_id: 'sub',
    microknowledge_ids: ['mk_b'],
    statement,
    options: [
      { label: 'A', text: 'Alternativa A' },
      { label: 'B', text: 'Alternativa B' },
      { label: 'C', text: 'Alternativa C' },
      { label: 'D', text: 'Alternativa D' },
      { label: 'E', text: 'Alternativa E' },
    ],
    correct_answer: 'C',
    explanation: 'A alternativa C é a correta segundo o conhecimento contratado.',
    difficulty: 'media',
    format: 'multipla_escolha',
    source: null,
    is_trick: false,
    traces: [{ source_id: 'edital', trace_status: 'missing', note: 'Fixture sem página.' }],
  };
}

function approvedAudit(batch) {
  return {
    schema_version: 1,
    batch_name: batch.name,
    status: 'APPROVED',
    questions: batch.questions.map(({ id }) => ({
      id,
      verdict: 'APPROVED',
      checks: {
        single_correct_answer: true,
        explanation_consistent: true,
        within_scope: true,
        distractors_plausible: true,
        not_semantic_duplicate: true,
      },
      notes: '',
    })),
  };
}

test('coverage engine encontra lacunas e contratos priorizam microconhecimento menos coberto', async () => {
  const { bundlePath } = await fixture();
  const bundle = await loadBundle(bundlePath);
  const coverage = buildCoverage(bundle);
  const byId = new Map(coverage.map((row) => [row.microknowledge_id, row]));
  assert.equal(byId.get('mk_a').current, 1);
  assert.equal(byId.get('mk_b').current, 0);
  const summary = coverageSummary(coverage);
  assert.equal(summary.microknowledges, 2);
  assert.ok(summary.remaining_questions > 0);

  const plan = planContracts(bundle, { limit: 4 });
  assert.equal(plan.contracts.length, 4);
  assert.equal(plan.contracts[0].microknowledge_id, 'mk_b');
  assert.equal(new Set(plan.contracts.map(({ question_id: id }) => id)).size, 4);
  assert.ok(plan.contracts.every(({ objective }) => objective.includes('sem repetir')));
});

test('validador bloqueia id e enunciado já existentes', async () => {
  const { bundlePath } = await fixture();
  const bundle = await loadBundle(bundlePath);
  const duplicateId = { name: 'dup-id', questions: [generatedQuestion('q_existing')] };
  const duplicateStatement = { name: 'dup-statement', questions: [generatedQuestion('q_new', 'Questão já existente?')] };
  assert.equal(validateQuestionBatch(bundle, duplicateId).valid, false);
  assert.ok(validateQuestionBatch(bundle, duplicateId).errors.some(({ code }) => code === 'ID_DUPLICATE'));
  assert.equal(validateQuestionBatch(bundle, duplicateStatement).valid, false);
  assert.ok(validateQuestionBatch(bundle, duplicateStatement).errors.some(({ code }) => code === 'STATEMENT_DUPLICATE'));
});

test('promoção exige QA semântico aprovado', async () => {
  const { root, bundlePath } = await fixture();
  const bundle = await loadBundle(bundlePath);
  const batch = { name: 'lote-qa', questions: [generatedQuestion('q_new_qa')] };
  const batchPath = path.join(root, 'staging.json');
  const auditPath = path.join(root, 'audit.json');
  await writeJson(batchPath, batch);
  await writeJson(auditPath, { ...approvedAudit(batch), status: 'PENDING' });
  await assert.rejects(promoteBatch({ bundle, batchPath, auditPath }), /semantic_audit_failed/);

  await writeJson(auditPath, approvedAudit(batch));
  const promoted = await promoteBatch({ bundle, batchPath, auditPath });
  assert.match(path.basename(promoted.target), /^002-lote-qa\.json$/);
});

test('publisher cria patch incremental e atualiza versão, hash e contagem', async () => {
  const { root, bundlePath } = await fixture();
  const bundle = await loadBundle(bundlePath);
  const batch = { name: 'novo-patch', questions: [generatedQuestion('q_publish')] };
  const batchPath = path.join(root, 'publish.json');
  await writeJson(batchPath, batch);

  const result = await publishPatch({ repoRoot: root, bundle, batchPath, now: new Date('2026-08-25T12:00:00Z') });
  assert.equal(result.patchFilename, 'demo-course-patch-002.json');
  assert.equal(result.expectedBefore, 2);
  assert.equal(result.expectedAfter, 3);
  assert.equal(result.version, '2026.08.25.2');
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);

  const registry = await readFile(result.registryPath, 'utf8');
  assert.match(registry, /demo-course-patch-002\.json/);
  assert.match(registry, /expectedQuestionCount: 3/);
  assert.match(registry, /const DATA_VERSION = '2026\.08\.25\.2'/);
});
