import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateMediaFile } from '../app/js/services/adminAvatarService.js';
import { validateLandingBlock } from '../app/js/services/adminLandingPageService.js';
import {
  ADMIN_SETTING_DEFINITIONS,
  validateAdminSetting,
} from '../app/js/services/adminSettingsService.js';
import { safeStoragePath } from '../supabase/functions/admin-media/core.js';
import { containsUnsafeMarkup } from '../supabase/functions/admin-site/core.js';

test('validador de mídia inspeciona dimensões e transparência reais', async () => {
  const file = { name: 'avatar-01.webp', type: 'image/webp', size: 1024 };
  const transparent = await validateMediaFile(file, {
    requireTransparency: true,
    decodeImage: async () => ({
      width: 2,
      height: 1,
      pixels: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 0]),
    }),
  });
  assert.deepEqual(transparent, {
    ...file,
    width: 2,
    height: 1,
    hasTransparency: true,
    valid: true,
  });
  await assert.rejects(
    () => validateMediaFile(file, {
      requireTransparency: true,
      decodeImage: async () => {
        const pixels = new Uint8ClampedArray(10 * 10 * 4);
        pixels.fill(255);
        return { width: 10, height: 10, pixels };
      },
    }),
    /transparência real/,
  );
  await assert.rejects(
    () => validateMediaFile(file, { decodeImage: async () => { throw new Error('decode'); } }),
    /não decodificável/,
  );
  await assert.rejects(() => validateMediaFile({ name: '../avatar.png', type: 'image/png', size: 1024 }), /inseguro/);
  await assert.rejects(() => validateMediaFile({ name: 'avatar.jpg', type: 'image/jpeg', size: 1024 }), /PNG ou WebP/);
  assert.equal(safeStoragePath('avatars/pc-al/avatar-01.webp'), 'avatars/pc-al/avatar-01.webp');
  assert.throws(() => safeStoragePath('../secret.png'), /invalid/);
});

test('landing page aceita apenas blocos tipados e rejeita HTML ativo', () => {
  const block = validateLandingBlock({ type: 'hero', content: { title: 'Prepare-se' } });
  assert.equal(block.type, 'hero');
  assert.throws(() => validateLandingBlock({ type: 'html', content: {} }), /não permitido/);
  assert.throws(() => validateLandingBlock({ type: 'hero', content: { body: '<script>alert(1)</script>' } }), /HTML arbitrário/);
  assert.equal(containsUnsafeMarkup({ body: '<iframe src="x">' }), true);
});

test('configurações são limitadas a chaves e tipos conhecidos', () => {
  assert.ok(Object.keys(ADMIN_SETTING_DEFINITIONS).length >= 10);
  assert.deepEqual(validateAdminSetting('maintenance_mode', true), {
    key: 'maintenance_mode', type: 'boolean', value: true,
  });
  assert.throws(() => validateAdminSetting('service_role_key', 'secret'), /não permitida/);
  assert.throws(() => validateAdminSetting('support_email', 'invalido'), /E-mail/);
});

test('migration de mídia e site mantém RLS e acesso exclusivo por service_role', async () => {
  const sql = await readFile(new URL('../supabase/migrations/009_admin_media_landing_settings.sql', import.meta.url), 'utf8');
  const tables = [
    'avatar_collections', 'avatar_stages', 'avatar_assets', 'media_assets',
    'landing_pages', 'landing_page_versions', 'landing_page_blocks', 'platform_settings',
  ];
  for (const table of tables) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(sql, /from public, anon, authenticated/i);
  assert.match(sql, /to service_role/i);
  assert.doesNotMatch(sql, /\bdrop table\b/i);
  assert.doesNotMatch(sql, /\bbase64\b/i);
});

test('todas as Edge Functions administrativas exigem JWT no config', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  for (const fn of ['admin-access', 'admin-contests', 'admin-editorial', 'admin-media', 'admin-site', 'admin-settings']) {
    assert.match(config, new RegExp(`\\[functions\\.${fn}\\]\\s+[\\s\\S]*?verify_jwt\\s*=\\s*true`));
  }
});
