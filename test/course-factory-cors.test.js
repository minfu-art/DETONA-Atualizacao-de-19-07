import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  corsHeaders,
  createAllowedOrigins,
  handleCorsPreflight,
  jsonResponse,
} from '../supabase/functions/_shared/cors.js';

const previewOrigin = 'https://detona-staging-preview.example';
const stableOrigin = 'https://detona-staging.example';
const allowedOrigins = createAllowedOrigins(` ${previewOrigin}/,${stableOrigin},${previewOrigin}`);
const functionSources = [
  '../supabase/functions/admin-contests/index.ts',
  '../supabase/functions/admin-editorial/index.ts',
  '../supabase/functions/admin-media/index.ts',
  '../supabase/functions/student-content/index.ts',
];

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

test('allowlist normaliza origens, remove duplicadas e ignora entradas invÃ¡lidas', () => {
  const origins = createAllowedOrigins(` ${previewOrigin}/,not-a-url,ftp://invalid.example,${previewOrigin}`);
  assert.deepEqual([...origins], [previewOrigin]);
});

test('OPTIONS autorizado retorna 204 sem corpo e sem content-type JSON', async () => {
  const response = handleCorsPreflight(new Request(`${previewOrigin}/function`, {
    method: 'OPTIONS',
    headers: { Origin: previewOrigin },
  }), allowedOrigins);

  assert.ok(response);
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(await response.text(), '');
  assert.notEqual(await response.text(), '{}');
  assert.equal(response.headers.get('content-type'), null);
});

test('OPTIONS autorizado retorna todos os cabeÃ§alhos CORS restritos', () => {
  const response = handleCorsPreflight(new Request(`${previewOrigin}/function`, {
    method: 'OPTIONS',
    headers: { Origin: previewOrigin },
  }), allowedOrigins);

  assert.equal(response.headers.get('access-control-allow-origin'), previewOrigin);
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(
    response.headers.get('access-control-allow-headers'),
    'authorization, x-client-info, apikey, content-type',
  );
  assert.equal(response.headers.get('access-control-max-age'), '86400');
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('origem nÃ£o autorizada recebe 403 sem reflexÃ£o', async () => {
  const invalidOrigin = 'https://origem-nao-autorizada.invalid';
  const response = handleCorsPreflight(new Request(`${previewOrigin}/function`, {
    method: 'OPTIONS',
    headers: { Origin: invalidOrigin },
  }), allowedOrigins);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await response.json(), { error: 'origin_not_allowed' });
});

test('POST autorizado segue para o handler e respostas JSON nÃ£o usam cache', async () => {
  const request = new Request(`${previewOrigin}/function`, {
    method: 'POST',
    headers: { Origin: previewOrigin },
  });
  assert.equal(handleCorsPreflight(request, allowedOrigins), null);

  const response = jsonResponse(200, { ok: true }, previewOrigin, allowedOrigins);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), previewOrigin);
  assert.deepEqual(await response.json(), { ok: true });
});

test('corsHeaders nunca usa wildcard nem reflete origem desconhecida', () => {
  const headers = corsHeaders('https://unknown.example', allowedOrigins);
  assert.equal(headers['access-control-allow-origin'], undefined);
  assert.doesNotMatch(JSON.stringify(headers), /\*/);
});

test('quatro funÃ§Ãµes usam o utilitÃ¡rio e rejeitam mÃ©todos fora de POST e OPTIONS', async () => {
  for (const relative of functionSources) {
    const text = await source(relative);
    assert.match(text, /from '\.\.\/_shared\/cors\.js'/, relative);
    assert.match(text, /const preflight = handleCorsPreflight\(request,\s*\w+\)/, relative);
    assert.match(text, /if \(preflight\) return preflight/, relative);
    assert.match(text, /request\.method !== 'POST'/, relative);
    assert.match(text, /origin_not_allowed/, relative);
  }
});

test('quatro funÃ§Ãµes nÃ£o possuem preflight 204 com objeto JSON', async () => {
  const forbidden = /\b(?:respond|response|json)\s*\(\s*204\s*,\s*\{\s*\}/;
  for (const relative of functionSources) {
    assert.doesNotMatch(await source(relative), forbidden, relative);
  }
});

test('autenticaÃ§Ã£o developer permanece nas trÃªs funÃ§Ãµes administrativas', async () => {
  for (const relative of functionSources.slice(0, 3)) {
    const text = await source(relative);
    assert.match(text, /\.auth\.getUser\(\)/, relative);
    assert.match(text, /profile\?\.role !== 'developer'/, relative);
    assert.match(text, /SUPABASE_SERVICE_ROLE_KEY/, relative);
  }
});

test('student-content preserva sessÃ£o, entitlement e fallback PC\/AL', async () => {
  const text = await source('../supabase/functions/student-content/index.ts');
  assert.match(text, /\.auth\.getUser\(\)/);
  assert.match(text, /contest_entitlements/);
  assert.match(text, /entitlement_required/);
  assert.match(text, /body\.contestId === 'pc_al_2026'/);
});

test('verify_jwt permanece habilitado nas quatro funÃ§Ãµes', async () => {
  const config = await source('../supabase/config.toml');
  for (const name of ['admin-contests', 'admin-editorial', 'admin-media', 'student-content']) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = true`), name);
  }
});
