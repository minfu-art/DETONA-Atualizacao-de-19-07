import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { packageActionsForStatus } from '../app/js/admin/adminPublicationScreen.js';
import { validateAdminContestRequest } from '../supabase/functions/admin-contests/core.js';

const [controlSql, packageSql, snapshotSql, adminEdge, studentEdge, screenSource] = await Promise.all([
  readFile(new URL('../supabase/migrations/016_content_package_publication_control.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/013_versioned_contest_content_packages.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/014_immutable_question_snapshots.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/admin-contests/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/student-content/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/js/admin/adminPublicationScreen.js', import.meta.url), 'utf8'),
]);

function functionSql(name, nextName) {
  const start = controlSql.indexOf(`function public.${name}`);
  const end = nextName ? controlSql.indexOf(`function public.${nextName}`, start + 1) : controlSql.length;
  assert.ok(start >= 0, `${name} ausente`);
  return controlSql.slice(start, end < 0 ? controlSql.length : end);
}

const unpublishSql = functionSql('admin_unpublish_content_package', 'admin_restore_content_package');
const restoreSql = functionSql('admin_restore_content_package');

test('1. generated pode ser publicado pela ação protegida existente', () => {
  assert.match(snapshotSql, /status = 'generated'[\s\S]+set status = 'published'/i);
  assert.equal(packageActionsForStatus('generated').publish, true);
});

test('2. published pode ser retirado do ar como archived', () => {
  assert.match(unpublishSql, /status = 'published'[\s\S]+set status = 'archived'/i);
  assert.equal(packageActionsForStatus('published').unpublish, true);
});

test('3. archived ou rolled_back pode ser restaurado como published', () => {
  assert.match(restoreSql, /status in \('archived', 'rolled_back'\)[\s\S]+set status = 'published'/i);
  assert.equal(packageActionsForStatus('archived').restore, true);
  assert.equal(packageActionsForStatus('rolled_back').restore, true);
});

test('4. retirada e restauração não alteram o conteúdo imutável do pacote', () => {
  for (const sql of [unpublishSql, restoreSql]) {
    assert.doesNotMatch(sql, /set[\s\S]{0,300}\b(metadata|curriculum_snapshot|questions_version_id|visual_config|content_hash|created_by|created_at)\s*=/i);
  }
  assert.match(packageSql, /published_package_is_immutable/i);
});

test('5. pacote archived não é servido ao aluno', () => {
  assert.match(studentEdge, /\.eq\('contest_id', body\.contestId\)\.eq\('status', 'published'\)/);
  assert.match(studentEdge, /content_temporarily_unavailable/);
});

test('6. restauração preserva o mesmo hash e pacote', () => {
  assert.doesNotMatch(restoreSql, /\bcontent_hash\s*=/i);
  assert.match(restoreSql, /where id = target_package\.id[\s\S]+returning \* into target_package/i);
});

test('7. retirada e restauração exigem confirmação correta', () => {
  assert.throws(() => validateAdminContestRequest({
    action: 'unpublish_content_package',
    contestId: 'pp_rn_2026',
    packageId: '582e4bcf-9bab-48e0-a265-f6b55033b540',
    confirmation: '',
  }), /confirmation_invalid/);
  assert.match(unpublishSql, /confirmation is distinct from locked_contest\.code/i);
  assert.match(restoreSql, /confirmation is distinct from locked_contest\.code/i);
});

test('8. student não pode executar as RPCs administrativas', () => {
  assert.match(controlSql, /revoke all on function public\.admin_unpublish_content_package[\s\S]+from public, anon, authenticated/i);
  assert.match(controlSql, /revoke all on function public\.admin_restore_content_package[\s\S]+from public, anon, authenticated/i);
});

test('9. developer é validado e service_role executa as RPCs', () => {
  assert.match(unpublishSql, /role = 'developer'/i);
  assert.match(restoreSql, /role = 'developer'/i);
  assert.match(controlSql, /grant execute on function public\.admin_unpublish_content_package[\s\S]+to service_role/i);
});

test('10. retirada e restauração registram auditoria', () => {
  assert.match(unpublishSql, /insert into public\.admin_audit_log[\s\S]+'unpublish_content_package'/i);
  assert.match(restoreSql, /insert into public\.admin_audit_log[\s\S]+'restore_content_package'/i);
});

test('11. nenhuma transição remove entitlement', () => {
  assert.doesNotMatch(controlSql, /contest_entitlements/i);
  assert.doesNotMatch(controlSql, /\bdelete\b|\btruncate\b/i);
});

test('12. nenhuma transição apaga progresso', () => {
  assert.doesNotMatch(controlSql, /progress_records|subtopic_progress|daily_logs|review_queue/i);
});

test('13. pacote e snapshot permanecem isolados por contestId', () => {
  assert.match(unpublishSql, /contest_id = target_contest_id/i);
  assert.match(restoreSql, /contest_id = target_contest_id/g);
  assert.match(studentEdge, /\.eq\('version_id', contentPackage\.questions_version_id\)\.eq\('contest_id', body\.contestId\)/);
});

test('14. continua existindo somente um pacote published por concurso', () => {
  assert.match(packageSql, /contest_content_one_published_idx[\s\S]+where status = 'published'/i);
  assert.match(restoreSql, /where contest_id = target_contest_id[\s\S]+status = 'published'[\s\S]+for update/i);
});

test('15. interface apresenta ações corretas e confirmação digitada por status', () => {
  assert.deepEqual(packageActionsForStatus('generated'), {
    preview: true, publish: true, unpublish: false, restore: false,
  });
  assert.deepEqual(packageActionsForStatus('published'), {
    preview: true, publish: false, unpublish: true, restore: false,
  });
  assert.match(screenSource, /Versão atualmente publicada/);
  assert.match(screenSource, /Digite \$\{selectedContest\.code\} para retirar/);
  assert.match(screenSource, /Digite \$\{selectedContest\.code\} para restaurar/);
  assert.doesNotMatch(screenSource, /globalThis\.confirm/);
  assert.match(adminEdge, /rpc\('admin_unpublish_content_package'/);
  assert.match(adminEdge, /rpc\('admin_restore_content_package'/);
});
