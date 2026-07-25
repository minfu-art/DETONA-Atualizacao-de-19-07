import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ADMIN_ENTRY,
  STUDENT_ENTRY,
  entryForUser,
  redirectForRole,
} from '../app/js/auth/roleRouting.js';
import { AdminContext } from '../app/js/admin/adminContext.js';

test('roteamento por role separa student e developer', () => {
  assert.equal(entryForUser({ role: 'student' }), STUDENT_ENTRY);
  assert.equal(entryForUser({ role: 'developer' }), ADMIN_ENTRY);
  const redirects = [];
  assert.equal(redirectForRole(
    { role: 'developer' },
    { pathname: '/index.html', replace: (target) => redirects.push(target) },
  ), ADMIN_ENTRY);
  assert.equal(redirects[0], ADMIN_ENTRY);
  assert.equal(redirectForRole(
    { role: 'student' },
    { pathname: '/admin.html', replace: (target) => redirects.push(target) },
  ), STUDENT_ENTRY);
});

test('adminSelectedContestId é isolado e validado', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const ctx = new AdminContext({ storage });
  const contests = [
    { id: 'pc_al_2026' },
    { id: 'pf_2026' },
    { id: 'prf_2026' },
    { id: 'novo_concurso_2027' },
  ];
  assert.equal(ctx.restoreContest(contests), 'pc_al_2026');
  assert.equal(ctx.selectContest('pf_2026'), 'pf_2026');
  assert.equal(ctx.selectContest('prf_2026'), 'prf_2026');
  assert.equal(ctx.selectContest('novo_concurso_2027'), 'novo_concurso_2027');
  assert.throws(() => ctx.selectContest('invalid'), /inválido/);
  assert.equal(data.has('detona.activeContestId'), false);
});

test('Painel Central não importa repositório acadêmico nem entitlement de aluno', async () => {
  const files = [
    '../app/js/admin/adminApp.js',
    '../app/js/admin/adminContext.js',
    '../app/js/admin/adminDashboard.js',
    '../app/js/admin/adminAccessScreen.js',
    '../app/js/admin/adminMessagesScreen.js',
  ];
  for (const relative of files) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /progressRepository/);
    assert.doesNotMatch(source, /getActiveContestId|setActiveContestId|ensureSeed|getPlayer/);
  }
});

test('shell acadêmico não oferece rota administrativa', async () => {
  const source = await readFile(new URL('../app/js/ui/appShell.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /data-developer-only|DEVELOPER_ITEM|screen:\s*['"]forge/);
});

test('admin.html carrega aplicação independente e bloqueia indexação', async () => {
  const source = await readFile(new URL('../app/admin.html', import.meta.url), 'utf8');
  assert.match(source, /js\/admin\/adminApp\.js/);
  assert.match(source, /noindex,nofollow/);
  assert.doesNotMatch(source, /js\/app\.js/);
});
