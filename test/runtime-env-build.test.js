import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceScript = join(root, 'app', 'scripts', 'generate-runtime-env.mjs');
const versionedRuntime = join(root, 'app', 'env.runtime.js');
const vercelIgnore = join(root, 'app', '.vercelignore');
const fakeUrl = 'https://staging-example.supabase.co';
const fakePublicKey = 'test-public-anon-key-not-a-secret';

function runGenerator(overrides = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'detona-runtime-'));
  const scriptsDir = join(tempRoot, 'scripts');
  mkdirSync(scriptsDir);
  copyFileSync(sourceScript, join(scriptsDir, 'generate-runtime-env.mjs'));
  const env = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    ...overrides,
  };
  const result = spawnSync(process.execPath, [join(scriptsDir, 'generate-runtime-env.mjs')], {
    env,
    encoding: 'utf8',
  });
  const runtimePath = join(tempRoot, 'env.runtime.js');
  const runtime = result.status === 0 ? readFileSync(runtimePath, 'utf8') : '';
  rmSync(tempRoot, { recursive: true, force: true });
  return { ...result, runtime };
}

function parseRuntime(source) {
  const context = {};
  vm.runInNewContext(source, context);
  return JSON.parse(JSON.stringify(context.__DETONA_ENV__));
}

test('desenvolvimento continua seguro com modo local permitido', () => {
  const result = runGenerator();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parseRuntime(result.runtime), {
    APP_ENV: 'development',
    CLOUD_MODE: 'off',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    SUPABASE_JS_URL: '',
  });
});

for (const appEnv of ['staging', 'production']) {
  test(`${appEnv} exige configuração pública do Supabase`, () => {
    const result = runGenerator({ APP_ENV: appEnv });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exigem SUPABASE_URL e SUPABASE_ANON_KEY/i);
  });
}

test('service_role causa falha imediata e nunca é gerada', () => {
  const serviceRole = 'test-service-role-must-never-leak';
  const result = runGenerator({
    APP_ENV: 'staging',
    SUPABASE_URL: fakeUrl,
    SUPABASE_ANON_KEY: fakePublicKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SUPABASE_SERVICE_ROLE_KEY nunca pode ser exposta/i);
  assert.doesNotMatch(result.stdout, new RegExp(serviceRole));
  assert.equal(result.runtime, '');
});

test('staging gera runtime híbrido somente com valores públicos fictícios', () => {
  const result = runGenerator({
    APP_ENV: 'staging',
    CLOUD_MODE: 'off',
    SUPABASE_URL: fakeUrl,
    SUPABASE_ANON_KEY: fakePublicKey,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parseRuntime(result.runtime), {
    APP_ENV: 'staging',
    CLOUD_MODE: 'hybrid',
    SUPABASE_URL: fakeUrl,
    SUPABASE_ANON_KEY: fakePublicKey,
    SUPABASE_JS_URL: '',
  });
  assert.doesNotMatch(result.stdout, new RegExp(fakePublicKey));
  assert.doesNotMatch(result.runtime, /service_role/i);
});

test('valores fictícios de teste não permanecem no runtime versionado', () => {
  const source = readFileSync(versionedRuntime, 'utf8');
  assert.doesNotMatch(source, new RegExp(fakeUrl));
  assert.doesNotMatch(source, new RegExp(fakePublicKey));
  assert.deepEqual(parseRuntime(source), {
    APP_ENV: 'development',
    CLOUD_MODE: 'off',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
  });
});

test('Vercel inclui o gerador no pacote de build', () => {
  const source = readFileSync(vercelIgnore, 'utf8');
  assert.doesNotMatch(source, /^scripts\/$/m);
  assert.match(source, /^scripts\/\*$/m);
  assert.match(source, /^!scripts\/generate-runtime-env\.mjs$/m);
});
