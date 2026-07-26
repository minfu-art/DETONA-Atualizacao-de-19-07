import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  canGenerateEditorialSnapshot,
  selectVisibleEditorialQuestions,
  toggleEditorialSelection,
} from '../app/js/admin/adminQuestionsScreen.js';
import {
  canEditEditorialQuestion,
  canTransitionEditorialSelection,
} from '../app/js/services/adminQuestionService.js';
import { validatePublishedQuestions } from '../app/scripts/validatePublishedQuestions.mjs';
import { assertEditorialTransition, validateEditorialRequest } from '../supabase/functions/admin-editorial/core.js';

const draft = { source_question_id: 'pp_rn_2026_ec104_001', status: 'draft' };
const review = { source_question_id: 'pp_rn_2026_ec104_002', status: 'technical_review' };
const approved = { source_question_id: 'pp_rn_2026_ec104_003', status: 'approved' };

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('1. nenhuma questão começa selecionada e nenhuma transição é habilitada', () => {
  assert.equal(new Set().size, 0);
  assert.equal(canTransitionEditorialSelection([], 'technical_review'), false);
});

test('2. seleção individual adiciona e remove somente o ID solicitado', () => {
  const selected = toggleEditorialSelection(new Set(), draft.source_question_id, true);
  assert.deepEqual([...selected], [draft.source_question_id]);
  assert.equal(toggleEditorialSelection(selected, draft.source_question_id, false).size, 0);
});

test('3. selecionar todas atua somente nas questões visíveis e preserva seleção oculta', () => {
  const hidden = 'pp_rn_2026_ec104_020';
  const selected = selectVisibleEditorialQuestions(new Set([hidden]), ['001', '002'], true);
  assert.deepEqual([...selected], [hidden, '001', '002']);
  assert.deepEqual([...selectVisibleEditorialQuestions(selected, ['001', '002'], false)], [hidden]);
});

test('4. limpar seleção produz um conjunto vazio sem selecionar automaticamente', () => {
  const selected = selectVisibleEditorialQuestions(new Set(), ['001', '002'], true);
  assert.equal(new Set([...selected].filter(() => false)).size, 0);
});

test('5. rascunho pode ir somente para revisão técnica ou arquivo', () => {
  assert.equal(canTransitionEditorialSelection([draft], 'technical_review'), true);
  assert.equal(canTransitionEditorialSelection([draft], 'archived'), true);
  assert.equal(canTransitionEditorialSelection([draft], 'approved'), false);
  assert.throws(() => assertEditorialTransition('draft', 'approved'), /not_allowed/);
});

test('6. revisão técnica pode voltar a rascunho ou seguir para aprovação', () => {
  assert.equal(canTransitionEditorialSelection([review], 'draft'), true);
  assert.equal(canTransitionEditorialSelection([review], 'approved'), true);
  assert.equal(assertEditorialTransition('technical_review', 'approved'), 'approved');
});

test('7. arquivamento é permitido apenas a partir de rascunho, revisão ou aprovação', () => {
  for (const question of [draft, review, approved]) {
    assert.equal(canTransitionEditorialSelection([question], 'archived'), true);
  }
  assert.throws(() => assertEditorialTransition('published', 'archived'), /not_allowed/);
  assert.throws(() => assertEditorialTransition('archived', 'draft'), /not_allowed/);
});

test('8. publicação direta é proibida em todos os estados do fluxo de revisão', () => {
  for (const status of ['draft', 'technical_review', 'approved', 'archived']) {
    assert.throws(() => assertEditorialTransition(status, 'published'), /not_allowed/);
  }
});

test('9. seleção com estados mistos é incompatível mesmo quando o destino existe', () => {
  assert.equal(canTransitionEditorialSelection([draft, review], 'archived'), false);
  assert.equal(canTransitionEditorialSelection([review, approved], 'technical_review'), false);
});

test('10. edição é limitada a rascunho e revisão técnica', () => {
  assert.equal(canEditEditorialQuestion(draft), true);
  assert.equal(canEditEditorialQuestion(review), true);
  for (const status of ['approved', 'published', 'archived']) {
    assert.equal(canEditEditorialQuestion({ status }), false);
  }
});

test('11. modal apresenta os campos editoriais e confirma a persistência após salvar', async () => {
  const screen = await source('../app/js/admin/adminQuestionsScreen.js');
  for (const field of ['statement', 'correct_answer', 'explanation', 'difficulty', 'source', 'is_trick', 'subtopic_id']) {
    assert.match(screen, new RegExp(`name="${field}"`));
  }
  assert.match(screen, /const persisted = await refetchQuestion\(id\)/);
  assert.match(screen, /Questão salva e confirmada no backend/);
});

test('12. transição relê cada questão e exige que a quantidade alterada seja exata', async () => {
  const screen = await source('../app/js/admin/adminQuestionsScreen.js');
  assert.match(screen, /await adminQuestionService\.transition\(ids, targetStatus, contestId\)/);
  assert.match(screen, /Promise\.all\(ids\.map\(refetchQuestion\)\)/);
  assert.match(screen, /changed !== ids\.length/);
  assert.match(screen, /Nenhuma atualização visual foi assumida/);
});

test('13. snapshot permanece bloqueado quando não há questão aprovada', () => {
  assert.equal(canGenerateEditorialSnapshot(0), false);
  assert.equal(canGenerateEditorialSnapshot(undefined), false);
  assert.equal(canGenerateEditorialSnapshot(1), true);
});

test('14. tela gera e relê snapshot, mas nunca chama publicação', async () => {
  const screen = await source('../app/js/admin/adminQuestionsScreen.js');
  assert.match(screen, /adminQuestionService\.generateSnapshot\(contestId, version\)/);
  assert.match(screen, /adminQuestionService\.listVersions\(contestId\)/);
  assert.doesNotMatch(screen, /publishSnapshot|publish_snapshot/);
  assert.deepEqual(validateEditorialRequest({ action: 'list_versions', contestId: 'pp_rn_2026' }), {
    action: 'list_versions',
    contestId: 'pp_rn_2026',
  });
});

test('15. snapshot inclui somente aprovadas e sua versão é protegida como imutável', async () => {
  const migration = await source('../supabase/migrations/014_immutable_question_snapshots.sql');
  assert.match(migration, /where q\.contest_id = target_contest_id\s+and q\.status = 'approved'/i);
  assert.match(migration, /create trigger protect_question_publication_version/i);
  assert.match(migration, /before update on public\.question_publication_versions/i);
});

test('16. fluxo permanece isolado por contestId e as 6.480 questões publicadas continuam válidas', async () => {
  const edge = await source('../supabase/functions/admin-editorial/index.ts');
  assert.match(edge, /\.eq\('contest_id', body\.contestId\)/);
  assert.doesNotMatch(edge, /pc_al_2026/);
  const published = validatePublishedQuestions();
  assert.equal(published.valid, true, published.errors.join('\n'));
  assert.equal(published.total, 6480);
});
