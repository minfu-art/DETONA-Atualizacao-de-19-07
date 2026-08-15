import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseCurriculumImport } from '../app/js/services/adminCurriculumService.js';
import { parseQuestionItems, validateEditorialBatch } from '../app/js/services/adminQuestionService.js';
import { validateAdminContestRequest } from '../supabase/functions/admin-contests/core.js';

const curriculum = {
  schema_version: 1,
  contest_id: 'pc_pe_2027',
  roles: [{
    id: 'role_agent',
    name: 'Agente',
    order: 0,
    disciplines: [{
      id: 'port',
      name: 'Língua Portuguesa',
      order: 0,
      topics: [{
        id: 'port_topic_1',
        name: 'Interpretação',
        order: 0,
        subtopics: [{ id: 'port_1', name: 'Compreensão textual', order: 0 }],
      }],
    }],
  }],
};

const question = {
  id: 'q_1',
  contest_id: 'pc_pe_2027',
  subtopic_id: 'port_1',
  discipline_id: 'port',
  format: 'certo_errado',
  statement: 'A interpretação depende do contexto.',
  correct_answer: true,
  explanation: 'O contexto orienta o sentido.',
};

test('currículo oficial é validado e achatado preservando pais e contagens', () => {
  const result = parseCurriculumImport(curriculum, 'pc_pe_2027');
  assert.equal(result.nodes.length, 4);
  assert.deepEqual(result.counts, { roles: 1, disciplines: 1, topics: 1, subtopics: 1 });
  assert.equal(result.nodes.at(-1).parent_source_id, 'port_topic_1');
});

test('currículo rejeita concurso trocado, campos inesperados, duplicidade e pais ausentes', () => {
  assert.throws(() => parseCurriculumImport(curriculum, 'outro_2027'), /contest_id/);
  assert.throws(() => parseCurriculumImport({ ...curriculum, html: '<b>x</b>' }, 'pc_pe_2027'), /inesperado/);
  const duplicate = structuredClone(curriculum);
  duplicate.roles[0].disciplines[0].topics[0].subtopics.push({ id: 'port', name: 'Duplicado' });
  assert.throws(() => parseCurriculumImport(duplicate, 'pc_pe_2027'), /duplicado/);
  assert.throws(() => validateAdminContestRequest({
    action: 'validate_curriculum_import',
    contestId: 'pc_pe_2027',
    schemaVersion: 1,
    nodes: [{ source_id: 'child', parent_source_id: 'missing', type: 'subtopic', name: 'X', description: null, order_index: 0 }],
  }), /parent_missing/);
});

test('currículo aceita IDs canônicos longos sem relaxar o alfabeto permitido', () => {
  const longId = `pc_ba_2026_${'subtopic_'.repeat(12)}final`;
  const input = structuredClone(curriculum);
  input.roles[0].disciplines[0].topics[0].subtopics[0].id = longId;
  input.roles[0].disciplines[0].topics[0].subtopics[0].name = 'Descrição curricular oficial extensa. '.repeat(10);
  assert.equal(parseCurriculumImport(input, 'pc_pe_2027').nodes.at(-1).source_id, longId);
  input.roles[0].disciplines[0].topics[0].subtopics[0].id = `${longId}!`;
  assert.throws(() => parseCurriculumImport(input, 'pc_pe_2027'), /inválido/);
});

test('questões aceitam array, questions e questoes, mas preservam isolamento', () => {
  assert.equal(parseQuestionItems([question]).length, 1);
  assert.equal(parseQuestionItems({ questions: [question] }).length, 1);
  assert.equal(parseQuestionItems({ questoes: [question] }).length, 1);
  assert.equal(validateEditorialBatch([question], { contestId: 'pc_pe_2027', knownSubtopicIds: ['port_1'] }).valid, true);
  assert.equal(validateEditorialBatch([{ ...question, contest_id: 'pc_al_2026' }], {
    contestId: 'pc_pe_2027', knownSubtopicIds: ['port_1'],
  }).valid, false);
  assert.equal(validateEditorialBatch([{ ...question, subtopic_id: 'unknown' }], {
    contestId: 'pc_pe_2027', knownSubtopicIds: ['port_1'],
  }).valid, false);
});

test('migration cria imports atômicos, isolamento composto e bloqueia conteúdo publicado', async () => {
  const sql = await readFile(new URL('../supabase/migrations/011_course_factory_imports.sql', import.meta.url), 'utf8');
  assert.match(sql, /admin_replace_curriculum_draft/);
  assert.match(sql, /admin_import_question_draft/);
  assert.match(sql, /published_curriculum_is_immutable/);
  assert.match(sql, /unique index[\s\S]+contest_id,\s*source_question_id/i);
  assert.match(sql, /revoke all on function[\s\S]+authenticated/i);
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b/i);
});
