import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  publicationErrorMessage,
  validateContentVersion,
  validatePackageConfirmation,
} from '../app/js/services/adminPublicationService.js';
import { validateAdminContestRequest } from '../supabase/functions/admin-contests/core.js';

test('publicação valida, gera, visualiza, publica e restaura por ações explícitas', () => {
  assert.equal(validateAdminContestRequest({ action: 'validate_publication', contestId: 'pc_pe_2027' }).contestId, 'pc_pe_2027');
  assert.equal(validateAdminContestRequest({
    action: 'generate_content_package', contestId: 'pc_pe_2027', version: '2027.05.1',
  }).version, '2027.05.1');
  assert.equal(validateContentVersion('2027.05.1'), '2027.05.1');
  assert.throws(() => validateContentVersion('<script>'), /inválida/);
  assert.throws(() => validateAdminContestRequest({
    action: 'publish_content_package',
    contestId: 'pc_pe_2027',
    packageId: '452d919a-8812-4fce-8eeb-13c5834b1760',
    confirmation: '',
  }), /confirmation_invalid/);
});

test('migration cria pacote versionado, imutável e um único publicado por concurso', async () => {
  const sql = await readFile(new URL('../supabase/migrations/013_versioned_contest_content_packages.sql', import.meta.url), 'utf8');
  for (const field of ['contest_id', 'version', 'metadata', 'curriculum_snapshot', 'questions_version_id', 'visual_config', 'content_hash', 'status', 'created_by']) {
    assert.match(sql, new RegExp(`\\b${field}\\b`, 'i'));
  }
  assert.match(sql, /where status = 'published'/i);
  assert.match(sql, /published_package_is_immutable/i);
  assert.match(sql, /revoke all on table public\.contest_content_packages from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.contest_content_packages to service_role/i);
  assert.doesNotMatch(sql, /\bdelete from\b|\bdrop table\b|\btruncate\b/i);
});

test('confirmação de publicação não aceita campos extras nem packageId inválido', () => {
  assert.throws(() => validateAdminContestRequest({
    action: 'publish_content_package',
    contestId: 'pc_pe_2027',
    packageId: 'not-a-uuid',
    confirmation: 'PC PE',
  }), /package_id_invalid/);
  assert.throws(() => validateAdminContestRequest({
    action: 'rollback_content_package',
    contestId: 'pc_pe_2027',
    packageId: '452d919a-8812-4fce-8eeb-13c5834b1760',
    production: true,
  }), /unexpected_field/);
});

test('confirmação local exige exatamente o código mostrado pelo painel', () => {
  assert.equal(validatePackageConfirmation(' PP RN ', 'PP RN'), 'PP RN');
  assert.throws(() => validatePackageConfirmation('aprovo', 'PP RN'), /Digite exatamente PP RN/);
});

test('erro HTTP da Edge Function é traduzido sem expor detalhes internos', async () => {
  const error = new Error('Edge Function returned a non-2xx status code');
  error.context = new Response(JSON.stringify({
    error: 'publication_confirmation_invalid',
    internal: 'select secret from private_table',
  }), { status: 400, headers: { 'content-type': 'application/json' } });
  const message = await publicationErrorMessage(error);
  assert.match(message, /Confirmação incorreta/);
  assert.doesNotMatch(message, /select|secret|private_table/i);
});

test('geração idempotente reutiliza pacote de conteúdo idêntico', async () => {
  const source = await readFile(new URL('../supabase/functions/admin-contests/index.ts', import.meta.url), 'utf8');
  assert.match(source, /\.eq\('contest_id', body\.contestId\)\.eq\('content_hash', contentHash\)\.maybeSingle\(\)/);
  assert.match(source, /reused:\s*true/);
  assert.match(source, /identical_package_reused/);
  assert.match(source, /package_version_exists/);
});
