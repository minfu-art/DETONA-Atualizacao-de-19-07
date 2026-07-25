import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  editorialErrorMessage,
  extractEditorialErrorCode,
  validateEditorialBatch,
} from '../app/js/services/adminQuestionService.js';
import {
  sanitizedEditorialErrorCode,
  validateRemoteEditorialBatch,
} from '../supabase/functions/admin-editorial/core.js';

const contestId = 'pp_rn_2026';
const subtopicId = 'legislacao_especifica_02';

function question(index, overrides = {}) {
  return {
    id: `pp_rn_2026_ec104_${String(index).padStart(3, '0')}`,
    contest_id: contestId,
    subtopic_id: subtopicId,
    discipline_id: 'legislacao_especifica',
    format: 'certo_errado',
    statement: `Afirmação editorial de homologação número ${index}.`,
    correct_answer: index <= 10,
    explanation: `Explicação completa da questão ${index}.`,
    ...overrides,
  };
}

const pilotBatch = Array.from({ length: 20 }, (_, index) => question(index + 1));
const curriculumNodes = [{ source_id: subtopicId, contest_id: contestId, type: 'subtopic' }];

function remoteValidation(questions, overrides = {}) {
  return validateRemoteEditorialBatch({
    contestId,
    questions,
    contestExists: true,
    curriculumNodes,
    existingQuestions: [],
    ...overrides,
  });
}

test('lote piloto representativo possui 20 questões, com 10 respostas true e 10 false', () => {
  const local = validateEditorialBatch(pilotBatch, {
    contestId,
    knownSubtopicIds: [subtopicId],
  });
  assert.equal(local.valid, true);
  assert.equal(local.total, 20);
  assert.equal(local.questions.filter(({ correct_answer }) => correct_answer === true).length, 10);
  assert.equal(local.questions.filter(({ correct_answer }) => correct_answer === false).length, 10);
  assert.equal(remoteValidation(local.questions).valid, true);
});

test('validação remota rejeita concurso trocado', () => {
  const result = remoteValidation([question(1, { contest_id: 'pc_al_2026' })]);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'question_contest_mismatch');
});

test('validação remota distingue subtópico inexistente e pertencente a outro concurso', () => {
  const missing = remoteValidation([question(1, { subtopic_id: 'nao_existe' })]);
  assert.ok(missing.errors.some(({ code }) => code === 'question_subtopic_not_found'));

  const foreign = remoteValidation([question(1, { subtopic_id: 'subtopic_estrangeiro' })], {
    curriculumNodes: [
      ...curriculumNodes,
      { source_id: 'subtopic_estrangeiro', contest_id: 'pc_al_2026', type: 'subtopic' },
    ],
  });
  assert.ok(foreign.errors.some(({ code }) => code === 'question_subtopic_wrong_contest'));
});

test('validação remota rejeita ID repetido no lote e ID já existente no concurso', () => {
  const duplicate = remoteValidation([question(1), question(1)]);
  assert.ok(duplicate.errors.some(({ code }) => code === 'question_id_duplicate'));

  const existing = remoteValidation([question(2)], {
    existingQuestions: [{ source_question_id: question(2).id, contest_id: contestId }],
  });
  assert.ok(existing.errors.some(({ code }) => code === 'question_id_exists'));
});

test('validação remota rejeita gabarito e explicação ausentes', () => {
  const result = remoteValidation([
    question(1, { correct_answer: null }),
    question(2, { explanation: '' }),
  ]);
  assert.ok(result.errors.some(({ code }) => code === 'question_answer_invalid'));
  assert.ok(result.errors.some(({ code }) => code === 'question_explanation_missing'));
});

test('FunctionsHttpError é convertido em mensagem útil sem expor SQL', async () => {
  const error = new Error('Edge Function returned a non-2xx status code');
  error.context = new Response(JSON.stringify({
    error: 'question_subtopic_not_found',
    internal: 'select * from private_table where token = secret',
  }), { status: 422, headers: { 'content-type': 'application/json' } });
  assert.equal(await extractEditorialErrorCode(error), 'question_subtopic_not_found');
  const message = await editorialErrorMessage(error);
  assert.match(message, /subtópico informado não foi encontrado/i);
  assert.doesNotMatch(message, /select|private_table|token|secret/i);
});

test('erro 42702 é sanitizado e não retorna detalhes internos do PostgreSQL', async () => {
  const databaseError = {
    code: '42702',
    message: 'column reference "source_id" is ambiguous in SELECT secret',
  };
  assert.equal(sanitizedEditorialErrorCode(databaseError), 'question_import_database_error');
  const message = await editorialErrorMessage(databaseError);
  assert.match(message, /correção segura do banco/i);
  assert.doesNotMatch(message, /source_id|select|42702/i);
});

test('Edge Function valida concurso, currículo e IDs existentes antes de importar', async () => {
  const source = await readFile(new URL('../supabase/functions/admin-editorial/index.ts', import.meta.url), 'utf8');
  assert.match(source, /action === 'validate_batch' \|\| action === 'import_draft'/);
  assert.match(source, /admin_contests'\)\.select\('id'\)/);
  assert.match(source, /admin_curriculum_nodes'\)\.select\('source_id,contest_id,type'\)/);
  assert.match(source, /editorial_questions'\)\.select\('source_question_id,contest_id'\)/);
  assert.ok(source.indexOf('validateBatch(admin') < source.indexOf("rpc('admin_import_question_draft'"));
  assert.doesNotMatch(source, /await audit\(admin,[\s\S]+body\.questions\.length/);
});

test('migration 015 qualifica source_id e torna lote, questões e auditoria atômicos', async () => {
  const sql = await readFile(new URL('../supabase/migrations/015_fix_transactional_editorial_question_import.sql', import.meta.url), 'utf8');
  assert.match(sql, /create or replace function public\.admin_import_question_draft/);
  assert.match(sql, /node\.source_id = question_subtopic_id/);
  assert.doesNotMatch(sql, /\bsource_id\s*=\s*coalesce\(item/);
  assert.match(sql, /insert into public\.question_batches/);
  assert.match(sql, /insert into public\.editorial_questions/);
  assert.match(sql, /insert into public\.admin_audit_log/);
  assert.ok(sql.indexOf('Todas as validações') < sql.indexOf('insert into public.question_batches'));
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|\bdelete from\b/i);
  assert.doesNotMatch(sql, /pc_al_2026|contest_entitlements/i);
});

test('tela mantém o lote em memória e só habilita importação após validação remota', async () => {
  const source = await readFile(new URL('../app/js/admin/adminQuestionsScreen.js', import.meta.url), 'utf8');
  assert.match(source, /let loadedQuestions = \[\]/);
  assert.match(source, /adminQuestionService\.validateBatch/);
  assert.match(source, /importButton\.disabled = !validation\.valid/);
  assert.match(source, /if \(!result\.valid\)[\s\S]+importButton\.disabled = true/);
  assert.match(source, /catch \(error\) \{[\s\S]+importButton\.disabled = true/);
});

test('migration 011 permanece intacta e a correção é incremental em 015', async () => {
  const oldSql = await readFile(new URL('../supabase/migrations/011_course_factory_imports.sql', import.meta.url), 'utf8');
  const newSql = await readFile(new URL('../supabase/migrations/015_fix_transactional_editorial_question_import.sql', import.meta.url), 'utf8');
  assert.match(oldSql, /source_id text/);
  assert.match(newSql, /question_source_id text/);
});
