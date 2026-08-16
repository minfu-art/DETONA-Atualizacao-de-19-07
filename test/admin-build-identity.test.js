import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAdminBuildIdentity } from '../app/js/admin/adminBuildIdentity.js';

test('identidade do build resume o Preview para o administrador', () => {
  const identity = readAdminBuildIdentity({
    BUILD_ENVIRONMENT: 'preview',
    BUILD_COMMIT_SHA: 'AAEC1F732899455CC69D8648D4BC010312213791',
    BUILD_GIT_REF: 'feat/admin-course-factory-v1',
    BUILD_TIME: '2026-08-16T14:30:00.000Z',
  });

  assert.equal(identity.environmentLabel, 'PREVIEW');
  assert.equal(identity.shortCommit, 'aaec1f7');
  assert.equal(identity.gitRef, 'feat/admin-course-factory-v1');
  assert.match(identity.buildTimeLabel, /16\/08\/2026/);
});

test('metadados ausentes usam um fallback local seguro', () => {
  const identity = readAdminBuildIdentity({
    BUILD_ENVIRONMENT: 'valor-inesperado',
    BUILD_COMMIT_SHA: 'não-é-um-sha',
    BUILD_TIME: '',
  });

  assert.equal(identity.environment, 'local');
  assert.equal(identity.environmentLabel, 'LOCAL');
  assert.equal(identity.shortCommit, 'desconhecido');
  assert.equal(identity.buildTimeLabel, 'não informado');
});

test('painel administrativo exibe o marcador, sem levá-lo para a área pública', async () => {
  const shell = await readFile(new URL('../app/js/admin/adminShell.js', import.meta.url), 'utf8');
  assert.match(shell, /admin-build-identity/);
  assert.match(shell, /readAdminBuildIdentity/);
  assert.match(shell, /commit/);
  assert.match(shell, /build/);
});
