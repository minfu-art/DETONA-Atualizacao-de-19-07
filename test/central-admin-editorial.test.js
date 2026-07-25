import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createQuestionSnapshot,
  validateEditorialBatch,
} from '../app/js/services/adminQuestionService.js';
import {
  assertEditorialAction,
  assertEditorialTransition,
} from '../supabase/functions/admin-editorial/core.js';

const valid = {
  id: 'q_editorial_1',
  subtopic_id: 'port_1',
  discipline_id: 'port',
  format: 'certo_errado',
  statement: 'A afirmação apresentada está correta.',
  correct_answer: true,
  explanation: 'Explicação editorial completa.',
};

test('validação editorial detecta ID repetido e enunciado semelhante', () => {
  const result = validateEditorialBatch([valid, { ...valid, id: 'q_editorial_2' }], {
    contestId: 'pc_al_2026',
    knownIds: ['q_editorial_1'],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /ID repetido/);
  assert.match(result.warnings.join(' '), /enunciado semelhante/);
});

test('snapshot contém versão, quantidade e hash reprodutível', async () => {
  const first = await createQuestionSnapshot([valid], { contestId: 'pc_al_2026', version: '2026.07.25' });
  const second = await createQuestionSnapshot([valid], { contestId: 'pc_al_2026', version: '2026.07.25' });
  assert.equal(first.count, 1);
  assert.equal(first.hash, second.hash);
  assert.equal(first.hash.length, 64);
});

test('workflow editorial só aceita transições explícitas', () => {
  assert.equal(assertEditorialAction('publish_snapshot'), 'publish_snapshot');
  assert.equal(assertEditorialTransition('technical_review', 'approved'), 'approved');
  assert.throws(() => assertEditorialTransition('draft', 'published'), /not_allowed/);
});

test('migration editorial revoga Data API e preserva versionamento', async () => {
  const sql = await readFile(new URL('../supabase/migrations/008_versioned_editorial_questions.sql', import.meta.url), 'utf8');
  for (const table of ['question_batches', 'editorial_questions', 'question_publication_versions']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.match(sql, /content_hash text not null/i);
  assert.match(sql, /rolled_back_at timestamptz/i);
  assert.doesNotMatch(sql, /\bdrop table\b/i);
});

test('aplicativo acadêmico continua apontando para JSON publicado', async () => {
  const service = await readFile(new URL('../app/js/core/questionImport.js', import.meta.url), 'utf8');
  assert.match(service, /questions_pc_al_port\.json/);
  assert.match(service, /questions_pc_al_lote\.json/);
  assert.doesNotMatch(service, /editorial_questions/);
});
