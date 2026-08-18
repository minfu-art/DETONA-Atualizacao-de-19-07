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

test('pré-cache é limitado ao shell essencial e processado em lotes', () => {
  const sw = readFileSync(join(appRoot, 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /\.addAll\s*\(/);
  assert.match(sw, /const PRECACHE_BATCH_SIZE = 12/);
  assert.match(sw, /ASSETS\.filter\(shouldPrecache\)/);
  assert.match(sw, /PRECACHE_ASSETS\.slice\(index, index \+ PRECACHE_BATCH_SIZE\)/);
  assert.match(sw, /batch\.map/);
  assert.match(sw, /asset\.includes\('\?'\)/);
  assert.match(sw, /catch \(error\)/);
});

test('service worker não bloqueia respostas em gravações e preserva dados locais', () => {
  const sw = readFileSync(join(appRoot, 'sw.js'), 'utf8');
  assert.match(sw, /detona-v149-pcba-investigador/);
  assert.match(sw, /!key\.startsWith\(CONTENT_CACHE_PREFIX\)/);
  assert.doesNotMatch(sw, /cache:\s*'reload'/);
  assert.match(sw, /e\.waitUntil\([\s\S]*putInCache\(e\.request, res\.clone\(\)\)/);
  assert.doesNotMatch(sw, /await putInCache/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(sw, /deleteDatabase|indexedDB\.deleteDatabase|unregister\s*\(/);
});

test('abertura instalada prioriza a versao atual e preserva fallback offline', () => {
  const sw = readFileSync(join(appRoot, 'sw.js'), 'utf8');
  const navigation = sw.slice(sw.indexOf("if (e.request.mode === 'navigate')"), sw.indexOf("self.addEventListener('notificationclick'"));
  assert.match(navigation, /e\.respondWith\(fetch\(e\.request\)/);
  assert.match(navigation, /caches\.match\(e\.request\)/);
  assert.match(navigation, /caches\.match\('\.\/index\.html'\)/);
  assert.match(navigation, /e\.waitUntil\(putInCache/);
  assert.match(navigation, /env\.runtime\.js[\s\S]*cache: 'no-store'/);
});

test('bancos de questões e galerias pesadas ficam sob demanda', () => {
  const sw = readFileSync(join(appRoot, 'sw.js'), 'utf8');
  const shouldPrecacheSource = sw.slice(sw.indexOf('function shouldPrecache'), sw.indexOf('const PRECACHE_ASSETS'));
  assert.doesNotMatch(shouldPrecacheSource, /data\/questions|tiers-v2|assets\/enemies|assets\/insignias/);
  assert.match(shouldPrecacheSource, /asset\.endsWith\('\.js'\)/);
  assert.match(shouldPrecacheSource, /ESSENTIAL_ART\.has\(asset\)/);
});
