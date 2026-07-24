import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('todos os assets obrigatórios do service worker existem', () => {
  const sw = readFileSync(join(appRoot, 'sw.js'), 'utf8');
  const list = sw.match(/const ASSETS = \[([\s\S]*?)\n\];/);
  assert.ok(list, 'lista ASSETS não encontrada em app/sw.js');
  const assets = [...list[1].matchAll(/['"]\.\/([^'"]+)['"]/g)]
    .map((match) => match[1].split('?')[0]);
  assert.ok(assets.length > 0, 'lista ASSETS não pode estar vazia');
  const missing = assets.filter((asset) => !existsSync(normalize(join(appRoot, asset))));
  assert.deepEqual(missing, [], `assets obrigatórios ausentes: ${missing.join(', ')}`);
});

test('falha isolada de pré-cache não usa cache.addAll', () => {
  const sw = readFileSync(join(appRoot, 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /\.addAll\s*\(/);
  assert.match(sw, /ASSETS\.map/);
  assert.match(sw, /catch \(error\)/);
});
