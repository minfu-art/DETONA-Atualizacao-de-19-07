import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateAssistedCoursePackage,
  validateAssistedFactoryRequest,
} from '../supabase/functions/course-factory-assisted/core.js';
import { assembleAssistedCoursePackage } from '../app/js/services/adminCourseFactoryService.js';
import {
  courseFactoryStudentPreviewUrl,
  isCourseFactoryStudentPreview,
  requestedCourseDraft,
  requestedCoursePreview,
} from '../app/js/services/courseFactoryPreviewService.js';

const uploadedSources = [{ file_name: 'edital-pc-x.pdf', status: 'uploaded' }];
const trace = [{ source_id: 'src_edital', trace_status: 'available', page_number: 12, excerpt: 'Língua Portuguesa: emprego da crase.' }];

function validPackage() {
  return {
    schema_version: 1,
    operation_id: 'detona-contract-test-v1',
    course: {
      contest_id: 'detona_contract_test', position_id: 'detona_contract_test_role', offering_id: 'detona_contract_test_offering',
      code: 'TESTE', slug: 'detona-contract-test', name: 'Curso fictício do contrato',
      organization: 'Organização fictícia', position: 'Cargo fictício', board: 'Banca X', year: '2027',
      exam_date: '2027-06-12', exam_format: 'Prova objetiva', description: 'Curso preparatório genérico.',
    },
    sources: [{
      id: 'src_edital', source_type: 'official_edital', category: 'edital', title: 'Edital fictício',
      file_name: 'edital-pc-x.pdf', page_count: 40, availability: 'uploaded_pdf', url: '', sha256: '',
    }],
    curriculum: { nodes: [
      { id: 'role_investigador', parent_id: null, type: 'role', title: 'Investigador', description: '', order: 1, confidence: 1, traces: trace },
      { id: 'disc_portugues', parent_id: 'role_investigador', type: 'discipline', title: 'Língua Portuguesa', description: '', order: 1, confidence: 1, traces: trace },
      { id: 'topic_gramatica', parent_id: 'disc_portugues', type: 'topic', title: 'Gramática', description: '', order: 1, confidence: 1, traces: trace },
      { id: 'subtopic_crase', parent_id: 'topic_gramatica', type: 'subtopic', title: 'Crase', description: '', order: 1, confidence: 1, traces: trace },
    ] },
    microknowledges: [{
      id: 'mk_crase_01', subtopic_id: 'subtopic_crase', title: 'Fusão da preposição a com o artigo a',
      scope_origin: 'official', confidence: 1, traces: trace,
    }],
    edital_map: [{
      id: 'map_crase', subtopic_id: 'subtopic_crase', scope: 'Emprego do acento grave.',
      essential_concepts: ['Conceito de crase'], rules: ['Regência'], exceptions: ['Casos proibidos'],
      applications: ['Análise de frases'], competencies: ['Reconhecer o emprego correto'],
      required_knowledge: ['Preposição e artigo'], microknowledge_ids: ['mk_crase_01'], confidence: 1, traces: trace,
    }],
    question_batches: [{ name: 'portugues-lote-01', questions: [{
      id: 'pcx_port_001', subtopic_id: 'subtopic_crase', microknowledge_ids: ['mk_crase_01'],
      statement: 'O emprego do acento grave está correto em “Dirigiu-se à repartição”.', options: [],
      correct_answer: 'C', explanation: 'Há regência da preposição a e artigo feminino a.',
      difficulty: 'media', source: 'Autoral', is_trick: false, traces: trace,
    }] }],
    metadata: { producer: 'ChatGPT/Codex', generated_at: '2026-08-16T12:00:00Z' },
  };
}

test('contrato genérico assistido valida a cadeia completa e calcula cobertura', async () => {
  const result = await validateAssistedCoursePackage(validPackage(), { uploadedSources });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.counts, {
    roles: 1, disciplines: 1, topics: 1, subtopics: 1, microknowledges: 1,
    question_batches: 1, questions: 1, sources: 1, missing_trace_records: 0,
  });
  assert.equal(result.coverage.edital_map_pct, 100);
  assert.equal(result.coverage.microknowledge_question_pct, 100);
  assert.equal(result.coverage.subtopic_question_pct, 100);
  assert.match(result.package_hash, /^[a-f0-9]{64}$/);
  assert.equal(result.normalized.curriculum_tree[0].topics[0].subtopics[0].id, 'subtopic_crase');
  assert.equal(result.normalized.edital_map[0].microknowledges[0].id, 'mk_crase_01');
  assert.equal(result.normalized.questions[0].payload.status, 'draft');
});

test('validador bloqueia IDs duplicados, vínculos quebrados, gabarito e rastreabilidade inválidos', async () => {
  const input = validPackage();
  input.curriculum.nodes.push(structuredClone(input.curriculum.nodes[3]));
  input.question_batches[0].questions[0].microknowledge_ids = ['mk_inexistente'];
  input.question_batches[0].questions[0].correct_answer = 'X';
  input.question_batches[0].questions[0].traces = [];
  const result = await validateAssistedCoursePackage(input, { uploadedSources });
  assert.equal(result.valid, false);
  const codes = new Set(result.errors.map(({ code }) => code));
  for (const code of ['CURRICULUM_ID_DUPLICATE', 'QUESTION_MICROKNOWLEDGE_UNKNOWN', 'QUESTION_ANSWER_INVALID', 'TRACE_REQUIRED']) {
    assert.equal(codes.has(code), true, `erro ausente: ${code}`);
  }
});

test('questões podem entrar em pacote posterior sem impedir currículo, mapa e microconhecimentos', async () => {
  const input = validPackage();
  input.question_batches = [];
  const result = await validateAssistedCoursePackage(input, { uploadedSources });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.counts.questions, 0);
  assert.equal(result.coverage.microknowledge_question_pct, 0);
  assert.equal(result.warnings.some(({ code }) => code === 'QUESTIONS_EMPTY'), true);
});

test('montador aceita o pacote canônico único e a pasta estruturada genérica', async () => {
  const canonical = validPackage();
  const jsonFile = (name, value, path = name) => ({
    name, webkitRelativePath: path, type: 'application/json', size: JSON.stringify(value).length,
    text: async () => JSON.stringify(value),
  });
  assert.equal((await assembleAssistedCoursePackage([jsonFile('package.json', canonical)])).course.contest_id, 'detona_contract_test');
  const split = await assembleAssistedCoursePackage([
    jsonFile('course.json', { schema_version: 1, operation_id: canonical.operation_id, course: canonical.course }, 'curso/course.json'),
    jsonFile('sources.json', canonical.sources, 'curso/sources.json'),
    jsonFile('curriculum.json', canonical.curriculum, 'curso/curriculum.json'),
    jsonFile('edital-map.json', canonical.edital_map, 'curso/edital-map.json'),
    jsonFile('microknowledge.json', canonical.microknowledges, 'curso/microknowledge.json'),
    jsonFile('metadata.json', canonical.metadata, 'curso/metadata.json'),
    jsonFile('lote-01.json', canonical.question_batches[0], 'curso/questions/lote-01.json'),
  ]);
  assert.equal(split.course.contest_id, 'detona_contract_test');
  assert.equal(split.curriculum.nodes.length, 4);
  assert.equal(split.edital_map.length, 1);
  assert.equal(split.microknowledges.length, 1);
  assert.equal(split.question_batches[0].questions.length, 1);
});

test('ações assistidas são estritas e não incluem análise automática ou publicação', () => {
  assert.deepEqual(validateAssistedFactoryRequest({ action: 'capabilities' }), { action: 'capabilities' });
  assert.throws(() => validateAssistedFactoryRequest({ action: 'analyze_sources' }), /action_invalid/);
  assert.throws(() => validateAssistedFactoryRequest({ action: 'publish_course' }), /action_invalid/);
});

test('curso fictício não-PC-BA usa o mesmo contrato e a mesma prévia genérica', async () => {
  const input = validPackage();
  const result = await validateAssistedCoursePackage(input, { uploadedSources });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.identity.contest_id, 'detona_contract_test');
  assert.deepEqual(validateAssistedFactoryRequest({ action: 'get_preview_package', draftId: '123e4567-e89b-42d3-a456-426614174000' }), {
    action: 'get_preview_package', draftId: '123e4567-e89b-42d3-a456-426614174000',
  });
  const url = courseFactoryStudentPreviewUrl({
    contestId: 'detona_contract_test', draftId: '123e4567-e89b-42d3-a456-426614174000',
  });
  assert.equal(requestedCoursePreview(url.split('?')[1]), 'detona_contract_test');
  assert.equal(requestedCourseDraft(url.split('?')[1]), '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(isCourseFactoryStudentPreview(url.split('?')[1]), true);
});

test('persistência é privada, transacional, auditável e isolada das tabelas publicadas', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260817022750_course_factory_assisted_packages.sql', import.meta.url), 'utf8');
  assert.match(sql, /course_factory_draft_questions/);
  assert.match(sql, /course_factory_audit_events/);
  assert.match(sql, /import_course_factory_assisted_package/);
  assert.match(sql, /approve_course_factory_assisted_map/);
  assert.match(sql, /revoke all[\s\S]*authenticated/);
  assert.match(sql, /grant execute[\s\S]*service_role/);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from)\s+public\.(?:admin_contests|editorial_questions|contest_entitlements|profiles)/i);
  assert.doesNotMatch(sql, /pc_ba_2026/i);
});

test('runtime assistido não usa chave OpenAI, não chama provedor e mantém publicação bloqueada', async () => {
  const edge = await readFile(new URL('../supabase/functions/course-factory-assisted/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(edge, /OPENAI_API_KEY|api\.openai\.com|responses\/v1|analyze_sources/);
  assert.match(edge, /automaticAI: false/);
  assert.match(edge, /openAIKeyRequired: false/);
  assert.match(edge, /paidAIRequestsEnabled: false/);
  assert.match(edge, /publicationEnabled: false/);
  assert.doesNotMatch(edge, /admin_publish_content_package/);
});

test('ADM declara as duas áreas e todas as etapas assistidas solicitadas', async () => {
  const ui = await readFile(new URL('../app/js/admin/adminCourseCreateScreen.js', import.meta.url), 'utf8');
  for (const marker of [
    'FONTES', 'PACOTE DO CURSO', 'VALIDAR PACOTE', 'Currículo importado', 'Mapa do Edital',
    'Questões importadas', 'Cobertura calculada', 'Histórico imutável', 'VER COMO ALUNO', 'APROVAR MAPA',
  ]) assert.match(ui, new RegExp(marker));
  assert.doesNotMatch(ui, /analyzeSources|OPENAI_API_KEY necessária|PUBLICAR CURSO/);
});
