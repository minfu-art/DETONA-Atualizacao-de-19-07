import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPackageHashInput } from '../supabase/functions/admin-contests/core.js';
import { validateMediaRequest } from '../supabase/functions/admin-media/core.js';

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

const [
  migration,
  contestEdge,
  editorialEdge,
  mediaEdge,
  studentEdge,
  contentService,
  avatarService,
  bucketMigration,
] = await Promise.all([
  source('../supabase/migrations/014_immutable_question_snapshots.sql'),
  source('../supabase/functions/admin-contests/index.ts'),
  source('../supabase/functions/admin-editorial/index.ts'),
  source('../supabase/functions/admin-media/index.ts'),
  source('../supabase/functions/student-content/index.ts'),
  source('../app/js/services/contestContentService.js'),
  source('../app/js/services/adminAvatarService.js'),
  source('../supabase/migrations/012_contest_visual_configuration.sql'),
]);

function functionSql(name, nextName) {
  const start = migration.indexOf(`function public.${name}`);
  const end = nextName ? migration.indexOf(`function public.${nextName}`, start + 1) : migration.length;
  assert.ok(start >= 0, `${name} ausente`);
  return migration.slice(start, end < 0 ? migration.length : end);
}

test('1. snapshot copia exatamente questões approved para itens versionados', () => {
  const sql = functionSql('admin_generate_question_snapshot', 'admin_publish_content_package');
  assert.match(sql, /insert into public\.question_publication_items/i);
  assert.match(sql, /q\.status = 'approved'/i);
  assert.match(sql, /order by q\.source_question_id/i);
});

test('2. alterações editoriais posteriores não alteram snapshot imutável', () => {
  assert.match(migration, /before update or delete on public\.question_publication_items/i);
  assert.match(migration, /question_snapshot_is_immutable/i);
  assert.doesNotMatch(editorialEdge, /question_publication_items'\)\.update|question_publication_items'\)\.delete/i);
});

test('3. V1 e V2 têm conjuntos independentes identificados por version_id', () => {
  assert.match(migration, /primary key \(version_id, source_question_id\)/i);
  assert.match(migration, /unique \(version_id, order_index\)/i);
  assert.match(migration, /where version_id = created_version\.id/i);
});

test('4. student-content usa questions_version_id e nunca a tabela editorial', () => {
  assert.match(studentEdge, /question_publication_items/);
  assert.match(studentEdge, /contentPackage\.questions_version_id/);
  assert.doesNotMatch(studentEdge, /from\('editorial_questions'\)/);
});

test('5. rollback restaura pacote e versão de questões históricos juntos', () => {
  const sql = functionSql('admin_rollback_content_package', 'admin_save_contest_visual');
  assert.match(sql, /target_package\.questions_version_id/i);
  assert.match(sql, /set status = 'published'[\s\S]+where id = target_questions\.id/i);
  assert.match(sql, /set status = 'published'[\s\S]+where id = target_package\.id/i);
});

test('6. publicação valida pacote e checklist antes de arquivar o anterior', () => {
  const sql = functionSql('admin_publish_content_package', 'admin_rollback_content_package');
  assert.ok(sql.indexOf('publication_checklist_incomplete') < sql.indexOf("set status = 'archived'"));
  assert.match(sql, /for update/i);
  assert.match(contestEdge, /rpc\('admin_publish_content_package'/);
});

test('7. rollback valida o alvo antes de marcar o pacote atual', () => {
  const sql = functionSql('admin_rollback_content_package', 'admin_save_contest_visual');
  assert.ok(sql.indexOf('rollback_package_not_found') < sql.indexOf("set status = 'rolled_back'"));
  assert.match(contestEdge, /rpc\('admin_rollback_content_package'/);
});

test('8. somente um pacote e uma versão de questões ficam publicados', async () => {
  assert.match(migration, /question_publication_one_published_idx[\s\S]+where status = 'published'/i);
  assert.match(migration, /update public\.question_publication_versions[\s\S]+status = 'rolled_back'/i);
  assert.match(await source('../supabase/migrations/013_versioned_contest_content_packages.sql'), /contest_content_one_published_idx/i);
});

test('9. currículo não pode ser substituído com questão draft', () => {
  const sql = functionSql('admin_replace_curriculum_draft', 'admin_generate_question_snapshot');
  const linkedQuestionCheck = sql.slice(
    sql.indexOf('from public.editorial_questions'),
    sql.indexOf("raise exception 'curriculum_has_linked_questions'"),
  );
  assert.match(sql, /from public\.editorial_questions[\s\S]+contest_id = target_contest_id/i);
  assert.match(sql, /curriculum_has_linked_questions/i);
  assert.doesNotMatch(linkedQuestionCheck, /\bstatus\b/i);
});

test('10. currículo não pode ser substituído com questão em revisão', () => {
  const sql = functionSql('admin_replace_curriculum_draft', 'admin_generate_question_snapshot');
  assert.match(sql, /if allow_replace then[\s\S]+curriculum_has_linked_questions/i);
  assert.doesNotMatch(sql, /technical_review/i);
});

test('11. currículo não pode ser substituído com questão approved', () => {
  const sql = functionSql('admin_replace_curriculum_draft', 'admin_generate_question_snapshot');
  assert.ok(sql.indexOf('curriculum_has_linked_questions') < sql.indexOf('delete from public.admin_curriculum_nodes'));
});

test('12. publicação visual atualiza assets, concurso e auditoria na mesma RPC', () => {
  const sql = functionSql('admin_save_contest_visual');
  assert.match(sql, /update public\.media_assets/i);
  assert.match(sql, /update public\.admin_contests/i);
  assert.match(sql, /insert into public\.admin_audit_log/i);
  assert.match(mediaEdge, /rpc\('admin_save_contest_visual'/);
});

test('13. asset de outro concurso, arquivado ou com MIME inválido é rejeitado', () => {
  const sql = functionSql('admin_save_contest_visual');
  assert.match(sql, /contest_id = target_contest_id/i);
  assert.match(sql, /status <> 'archived'/i);
  assert.match(sql, /mime_type in \('image\/png', 'image\/webp'\)/i);
  assert.match(sql, /visual_asset_contest_mismatch/i);
});

test('14. bucket admin-media permanece privado, limitado e sem objetos públicos', () => {
  assert.match(bucketMigration, /'admin-media'[\s\S]+false[\s\S]+8388608[\s\S]+image\/png[\s\S]+image\/webp/i);
  assert.doesNotMatch(bucketMigration, /public\s*=\s*true/i);
  assert.match(mediaEdge, /createSignedUploadUrl/);
  assert.match(studentEdge, /createSignedUrls/);
});

test('15. aluno sem entitlement é bloqueado antes da leitura do pacote', () => {
  assert.ok(studentEdge.indexOf("from('contest_entitlements')") < studentEdge.indexOf("from('contest_content_packages')"));
  assert.match(studentEdge, /entitlement_required/);
});

test('16. aluno com entitlement recebe somente pacote publicado do concurso solicitado', () => {
  assert.match(studentEdge, /\.eq\('contest_id', body\.contestId\)\.eq\('status', 'published'\)/);
  assert.match(studentEdge, /\.eq\('version_id', contentPackage\.questions_version_id\)\.eq\('contest_id', body\.contestId\)/);
});

test('17. PC/AL estático continua sendo fallback somente sem pacote publicado', () => {
  assert.ok(studentEdge.indexOf('if (!contentPackage)') < studentEdge.indexOf("body.contestId === 'pc_al_2026'"));
  assert.match(studentEdge, /legacyStatic: true/);
});

test('18. as 6.480 questões PC/AL continuam válidas', () => {
  const output = execFileSync(process.execPath, ['app/scripts/validatePublishedQuestions.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.match(output, /"valid": true/);
  assert.match(output, /"total": 6480/);
});

test('19. cache permanece isolado por userId, contestId e version', () => {
  assert.match(contentService, /userId.*contestId.*version/s);
  assert.match(contentService, /CACHE_PREFIX = 'detona-contest-content'/);
  assert.match(contentService, /cacheName\(userId, contestId, version\)/);
  assert.match(contentService, /encodeURIComponent\(userId\).*encodeURIComponent\(contestId\).*encodeURIComponent\(version\)/s);
});

test('20. frontend não contém service_role e upload abandonado possui cancelamento e expiração', () => {
  const tracked = execFileSync('git', ['ls-files', 'app'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  }).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(tracked.length > 0);
  assert.doesNotMatch(avatarService, /SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]/i);
  assert.match(avatarService, /cancelPendingUpload/);
  assert.match(mediaEdge, /media_upload_sessions/);
  assert.match(migration, /expires_at timestamptz not null default/);
  assert.deepEqual(
    validateMediaRequest({ action: 'cleanup_expired_uploads', contestId: 'pc_pe_2027' }),
    { action: 'cleanup_expired_uploads', contestId: 'pc_pe_2027' },
  );
});

test('hash do pacote inclui exatamente metadados, currículo, versão/hash de questões e visual', () => {
  const value = buildPackageHashInput({
    metadata: { id: 'pc_pe_2027' },
    curriculum: [{ type: 'subtopic' }],
    questionsVersionId: 'version-id',
    questionsHash: 'questions-hash',
    visualConfig: { battle_avatar: 'asset-id' },
  });
  assert.deepEqual(Object.keys(value), [
    'metadata',
    'curriculum_snapshot',
    'questions_version_id',
    'questions_hash',
    'visual_config',
  ]);
});
