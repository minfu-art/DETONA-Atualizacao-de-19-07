import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildDeterministicCourseIds,
  courseFactoryAnalysisSchema,
  extractResponseJson,
  normalizeCourseFactoryProposal,
  validateCourseFactoryRequest,
} from '../supabase/functions/course-factory-ai/core.js';
import { precheckCourseFactoryPdf } from '../app/js/services/adminCourseFactoryService.js';
import { CourseFactoryAIService } from '../supabase/functions/course-factory-ai/courseFactoryAIService.js';

const source = {
  id: '11111111-1111-4111-8111-111111111111',
  file_name: 'edital-oficial.pdf',
  source_type: 'official_edital',
  page_count: 20,
};
const complementary = {
  id: '22222222-2222-4222-8222-222222222222',
  file_name: 'apostila.pdf',
  source_type: 'complementary',
  page_count: 30,
};
const trace = { source_name: source.file_name, page_number: 12, excerpt: 'Conteúdo programático de Língua Portuguesa.' };

const proposal = () => ({
  identity: {
    contest_name: 'Polícia Civil do Paraná', organization: 'Polícia Civil do Paraná', position: 'Investigador',
    board: 'Banca Exemplo', year: '2027', exam_date: '2027-06-12', exam_format: 'Prova objetiva',
    observations: [], confidence: 0.96, traces: [trace],
  },
  curriculum: [{
    title: 'Língua Portuguesa', order: 1, confidence: 0.99, traces: [trace], topics: [{
      title: 'Gramática', order: 1, confidence: 0.92, traces: [trace], subtopics: [{ title: 'Crase', order: 1, confidence: 0.91, traces: [trace] }],
    }],
  }],
  edital_map: [{
    discipline_title: 'Língua Portuguesa', topic_title: 'Gramática', subtopic_title: 'Crase',
    confidence: 0.93,
    scope: 'Emprego do acento grave.', essential_concepts: ['Conceito de crase'], rules: ['Regência'],
    exceptions: ['Casos proibidos'], applications: ['Análise de frases'], competencies: ['Reconhecer emprego correto'],
    required_knowledge: ['Preposição e artigo'],
    microknowledges: [
      { title: 'Fusão da preposição a com artigo a', scope_origin: 'official', confidence: 0.95, traces: [trace] },
      { title: 'Quadro didático adicional', scope_origin: 'complementary', confidence: 0.8, traces: [{ source_name: complementary.file_name, page_number: 4, excerpt: 'Quadro de apoio.' }] },
    ], traces: [trace],
  }],
  relevant_observations: ['Proposta sujeita à aprovação humana.'],
});

test('serviço de IA é desacoplado do provedor e expõe as quatro operações da fábrica', async () => {
  const service = new CourseFactoryAIService({ analyzeSources: async () => proposal() });
  const result = await service.analyzeSources([]);
  assert.equal(service.proposeCourseIdentity(result).position, 'Investigador');
  assert.equal(service.proposeCurriculum(result).length, 1);
  assert.equal(service.proposeEditalMap(result).length, 1);
  assert.deepEqual(service.composeProposal(result), result);
});

test('IDs técnicos são determinísticos e não dependem de entrada manual', () => {
  assert.deepEqual(buildDeterministicCourseIds({ organization: 'Polícia Civil do Paraná', position: 'Investigador', year: '2027' }), {
    contest_id: 'policia_civil_do_parana_2027',
    position_id: 'policia_civil_do_parana_2027_investigador',
    offering_id: 'policia_civil_do_parana_2027_investigador',
    slug: 'policia-civil-do-parana-2027-investigador',
  });
});

test('proposta da IA é validada, ligada ao currículo e rastreada por documento/página', () => {
  const normalized = normalizeCourseFactoryProposal(proposal(), [source, complementary]);
  assert.equal(normalized.analysis_summary.counts.disciplines, 1);
  assert.equal(normalized.analysis_summary.counts.topics, 1);
  assert.equal(normalized.analysis_summary.counts.subtopics, 1);
  assert.equal(normalized.analysis_summary.counts.knowledges, 2);
  assert.equal(normalized.curriculum[0].traces[0].source_id, source.id);
  assert.equal(normalized.curriculum[0].confidence, 0.99);
  assert.equal(normalized.edital_map[0].microknowledges[1].scope_origin, 'complementary');
});

test('IDs técnicos podem ser corrigidos por humano e continuam normalizados', () => {
  const input = proposal();
  input.identity.contest_id = 'pc_pr_2027';
  input.identity.position_id = 'pc_pr_2027_investigador';
  input.identity.offering_id = 'pc_pr_2027_investigador';
  input.identity.slug = 'pc-pr-2027-investigador';
  assert.equal(normalizeCourseFactoryProposal(input, [source, complementary]).identity.contest_id, 'pc_pr_2027');
});

test('material complementar não pode ser marcado silenciosamente como escopo oficial', () => {
  const input = proposal();
  input.edital_map[0].microknowledges[0].traces = [{ source_name: complementary.file_name, page_number: 2, excerpt: 'Apoio.' }];
  assert.throws(() => normalizeCourseFactoryProposal(input, [source, complementary]), /official_scope_without_edital/);
});

test('Mapa do Edital deve cobrir cada subtópico exatamente uma vez', () => {
  const missing = proposal();
  missing.edital_map = [];
  assert.throws(() => normalizeCourseFactoryProposal(missing, [source, complementary]), /edital_map_invalid|map_subtopic_missing/);
  const duplicated = proposal();
  duplicated.edital_map.push(structuredClone(duplicated.edital_map[0]));
  assert.throws(() => normalizeCourseFactoryProposal(duplicated, [source, complementary]), /map_subtopic_duplicated/);
});

test('contrato aceita PDF e múltiplas categorias sem IDs técnicos do proprietário', () => {
  const file = { name: 'edital.pdf', type: 'application/pdf', size: 1024 };
  assert.deepEqual(precheckCourseFactoryPdf(file), { name: 'edital.pdf', mimeType: 'application/pdf', size: 1024 });
  const request = validateCourseFactoryRequest({
    action: 'create_signed_upload', draftId: '33333333-3333-4333-8333-333333333333',
    source: { sourceType: 'complementary', category: 'legislacao', name: 'lei.pdf', mimeType: 'application/pdf', size: 2048 },
  });
  assert.equal(request.source.category, 'legislacao');
});

test('schema OpenAI é estrito e resposta estruturada é extraída sem texto livre', () => {
  const schema = courseFactoryAnalysisSchema();
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(new Set(schema.required), new Set(['identity', 'curriculum', 'edital_map', 'relevant_observations']));
  const parsed = extractResponseJson({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(proposal()) }] }] });
  assert.equal(parsed.identity.position, 'Investigador');
});

test('persistência staging é privada e não altera tabelas publicadas', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260817014826_course_factory_ai_drafts.sql', import.meta.url), 'utf8');
  const indexes = await readFile(new URL('../supabase/migrations/20260817020918_course_factory_fk_indexes.sql', import.meta.url), 'utf8');
  assert.match(sql, /course_factory_drafts/);
  assert.match(sql, /course_factory_source_pages/);
  assert.match(sql, /course-factory-sources[\s\S]*false/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all[\s\S]*authenticated/);
  assert.doesNotMatch(sql, /update\s+(?:public\.)?admin_contests/i);
  assert.doesNotMatch(sql, /update\s+(?:public\.)?editorial_questions/i);
  for (const column of ['created_by', 'approved_by', 'uploaded_by', 'requested_by']) assert.match(indexes, new RegExp(`\\(${column}\\)`));
});

test('Edge Function mantém chave no servidor, extrai páginas e bloqueia publicação', async () => {
  const edge = await readFile(new URL('../supabase/functions/course-factory-ai/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.match(edge, /getDocument\(\{ data: bytes/);
  assert.match(edge, /course_factory_source_pages/);
  assert.match(edge, /input_file/);
  assert.match(edge, /json_schema/);
  assert.match(edge, /publicationEnabled: false/);
  assert.doesNotMatch(edge, /admin_publish_content_package/);
});

test('Área ADM oferece upload, edição, reanálise e Aprovar Mapa', async () => {
  const ui = await readFile(new URL('../app/js/admin/adminCourseCreateScreen.js', import.meta.url), 'utf8');
  assert.match(ui, /factory-official-file/);
  assert.match(ui, /factory-complement-files[\s\S]*multiple/);
  assert.match(ui, /REANALISAR COM IA/);
  assert.match(ui, /data-tree-action/);
  assert.match(ui, /data-knowledge-title/);
  assert.match(ui, /APROVAR MAPA/);
});
