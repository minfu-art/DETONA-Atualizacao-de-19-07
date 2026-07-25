import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateAdminContestRequest } from '../supabase/functions/admin-contests/core.js';
import { validateEditorialRequest } from '../supabase/functions/admin-editorial/core.js';
import { validateMediaRequest } from '../supabase/functions/admin-media/core.js';
import { validateSiteRequest } from '../supabase/functions/admin-site/core.js';
import { validateSettingsRequest } from '../supabase/functions/admin-settings/core.js';

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

test('migration 010 faz bootstrap idempotente dos três concursos e cria a FK protegida', async () => {
  const sql = await source('../supabase/migrations/010_bootstrap_central_admin_catalog.sql');
  for (const contestId of ['pc_al_2026', 'pf_2026', 'prf_2026']) {
    assert.match(sql, new RegExp(`'${contestId}'`, 'i'));
  }
  assert.match(sql, /on conflict\s*\(id\)\s*do nothing/i);
  assert.match(sql, /if not exists[\s\S]+admin_contests_landing_page_id_fkey/i);
  assert.match(sql, /foreign key\s*\(landing_page_id\)[\s\S]+references public\.landing_pages\(id\)[\s\S]+on delete set null/i);
  assert.doesNotMatch(sql, /\bdelete\s+from\b|\bdrop\s+table\b/i);
});

test('migrations 001 a 006 permanecem byte a byte inalteradas', async () => {
  const expectedHashes = {
    '001_detona_schema.sql': '630b6559d64ac584ca0951e25628dd48c131856b6124cb97b8f762ca05ab7e61',
    '002_security_hardening.sql': '8cffc50bdeeb7a68a1e7ceacaa1bef6d9f5069f31bb944fe7bbfb0fe6b5dd3c6',
    '003_explicit_data_api_access.sql': 'c8bda05a0322cf5327f2658fef078ba3b4ea2f797f723addf1a65be3357ecef7',
    '004_fix_function_search_path.sql': '9ecc46dc22d9b27ff91a64ab23256b354054647c3f81a07716831126eabfbca6',
    '005_administrative_announcements.sql': 'e99ab25af79daca8abed53a19c0b227792e472a0d0019142167390048fa652ef',
    '006_admin_access_audit.sql': 'de60d88d00558ece5fd6a5fd8868d1d103006dda4f97505829786d38680296dc',
  };
  for (const [name, expected] of Object.entries(expectedHashes)) {
    const contents = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url));
    assert.equal(createHash('sha256').update(contents).digest('hex'), expected, name);
  }
});

test('núcleos das cinco funções rejeitam search maliciosa e campos inesperados', () => {
  assert.throws(
    () => validateAdminContestRequest({ action: 'list_contests', search: 'x),id.eq.secret' }),
    /search_invalid/,
  );
  assert.throws(
    () => validateEditorialRequest({
      action: 'list_questions',
      contestId: 'pc_al_2026',
      search: '*;drop',
    }),
    /search_invalid/,
  );
  assert.throws(
    () => validateMediaRequest({ action: 'list_collections', contestId: 'pc_al_2026', secret: 'x' }),
    /unexpected_field/,
  );
  assert.throws(
    () => validateSiteRequest({ action: 'list_pages', contestId: 'pc_al_2026', html: '<script>' }),
    /unexpected_field/,
  );
  assert.throws(
    () => validateSettingsRequest({ action: 'list_settings', contestId: 'pc_al_2026', role: 'service' }),
    /unexpected_field/,
  );
});

test('núcleos limitam paginação, mídia, HTML, URLs e configurações', () => {
  assert.throws(
    () => validateEditorialRequest({ action: 'list_questions', contestId: 'pc_al_2026', pageSize: 101 }),
    /pagination_invalid/,
  );
  assert.throws(
    () => validateMediaRequest({
      action: 'register_asset',
      contestId: 'pc_al_2026',
      asset: {
        stageId: '452d919a-8812-4fce-8eeb-13c5834b1760',
        storagePath: '../secret.png',
        name: 'secret.png',
        mimeType: 'image/png',
        size: 100,
        width: 10,
        height: 10,
        hasTransparency: true,
        assetType: 'portrait',
      },
    }),
    /invalid_storage_path/,
  );
  assert.throws(
    () => validateSiteRequest({
      action: 'save_block',
      contestId: 'pc_al_2026',
      block: {
        versionId: '452d919a-8812-4fce-8eeb-13c5834b1760',
        type: 'hero',
        content: { body: '<iframe src="https://example.com">' },
      },
    }),
    /block_content_invalid/,
  );
  assert.throws(
    () => validateSettingsRequest({
      action: 'update_setting',
      contestId: 'pc_al_2026',
      setting: { key: 'logo_url', type: 'url', value: 'http://insecure.example' },
    }),
    /setting_value_invalid/,
  );
});

test('interfaces em modo leitura não apresentam ações administrativas falsas', async () => {
  const files = [
    '../app/js/admin/adminContestsScreen.js',
    '../app/js/admin/adminCurriculumScreen.js',
    '../app/js/admin/adminQuestionsScreen.js',
    '../app/js/admin/adminMediaScreen.js',
    '../app/js/admin/adminLandingScreen.js',
    '../app/js/admin/adminSettingsScreen.js',
  ];
  for (const file of files) {
    const text = await source(file);
    assert.match(text, /Consulta homologada; escrita ainda bloqueada\./);
    assert.doesNotMatch(text, /<button[^>]*>\s*(?:Editar|Criar|Publicar|Arquivar)\b/i);
  }
});

test('cliente não contém service_role e Painel Central não usa entitlement', async () => {
  const trackedClientFiles = execFileSync('git', ['ls-files', 'app'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  }).trim().split(/\r?\n/).filter(Boolean);
  for (const file of trackedClientFiles) {
    if (!/\.(?:js|html|json)$/.test(file)) continue;
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]/i, file);
  }
  const adminApp = await source('../app/js/admin/adminApp.js');
  assert.doesNotMatch(adminApp, /entitlement|activeContestId|progressRepository/i);
});
