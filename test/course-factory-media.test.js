import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { inspectImageBytes, validateMediaRequest } from '../supabase/functions/admin-media/core.js';

function pngHeader({ width = 512, height = 768, colorType = 6 } = {}) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
}

test('backend inspeciona assinatura, dimensões e transparência do PNG', () => {
  assert.deepEqual(inspectImageBytes(pngHeader(), 'image/png'), {
    width: 512,
    height: 768,
    hasTransparency: true,
  });
  assert.equal(inspectImageBytes(pngHeader({ colorType: 2 }), 'image/png').hasTransparency, false);
  assert.throws(() => inspectImageBytes(new Uint8Array([1, 2, 3]), 'image/png'), /signature/);
});

test('upload assinado limita MIME, extensão, tamanho, path e tipo visual', () => {
  const request = validateMediaRequest({
    action: 'create_signed_upload',
    contestId: 'pc_pe_2027',
    file: { name: 'avatar.png', mimeType: 'image/png', size: 1024 },
  });
  assert.equal(request.file.extension, 'png');
  assert.throws(() => validateMediaRequest({
    action: 'create_signed_upload',
    contestId: 'pc_pe_2027',
    file: { name: 'avatar.webp', mimeType: 'image/png', size: 1024 },
  }), /extension_mismatch/);
  assert.throws(() => validateMediaRequest({
    action: 'register_asset',
    contestId: 'pc_pe_2027',
    asset: { storagePath: '../avatar.png', assetType: 'battle_avatar' },
  }), /invalid_storage_path/);
});

test('configuração visual aceita apenas cinco slots e UUIDs reais', () => {
  const uuid = '452d919a-8812-4fce-8eeb-13c5834b1760';
  const result = validateMediaRequest({
    action: 'save_contest_visual',
    contestId: 'pc_pe_2027',
    visual: { battle_avatar: uuid, success: null, error: null, attention: null, cover: null },
  });
  assert.equal(result.visual.battle_avatar, uuid);
  assert.throws(() => validateMediaRequest({
    action: 'save_contest_visual',
    contestId: 'pc_pe_2027',
    visual: { battle_avatar: uuid, success: null, error: null, attention: null, cover: null, secret: uuid },
  }), /unexpected_field/);
});

test('migration visual usa FKs, bucket privado e não altera migrations anteriores', async () => {
  const sql = await readFile(new URL('../supabase/migrations/012_contest_visual_configuration.sql', import.meta.url), 'utf8');
  for (const column of ['battle_avatar_asset_id', 'success_asset_id', 'error_asset_id', 'attention_asset_id', 'cover_media_asset_id']) {
    assert.match(sql, new RegExp(`${column} uuid references public\\.media_assets`));
  }
  assert.match(sql, /'admin-media'[\s\S]+false[\s\S]+8388608/);
  assert.doesNotMatch(sql, /\bdrop table\b|\bservice_role_key\b/i);
});
