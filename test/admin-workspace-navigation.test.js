import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  adjacentWorkspaceScreen,
  buildAdminRouteUrl,
  CONTEST_WORKSPACE_TABS,
  moduleFromScreen,
  resolveAdminRoute,
  screenFromModule,
} from '../app/js/admin/adminWorkspaceNavigation.js';

const contests = [
  { id: 'pc_al_2026' },
  { id: 'pp_rn_2026' },
];

test('workspace declara as seis etapas na ordem operacional', () => {
  assert.deepEqual(
    CONTEST_WORKSPACE_TABS.map(({ label }) => label),
    ['Geral', 'Currículo', 'Questões', 'Aparência', 'Alunos', 'Publicação'],
  );
  assert.deepEqual(
    CONTEST_WORKSPACE_TABS.map(({ module }) => module),
    ['general', 'curriculum', 'questions', 'appearance', 'students', 'publication'],
  );
});

test('rota serializa concurso e módulo e restaura PP RN após atualização', () => {
  const location = {
    href: 'https://staging.example/admin.html?debug=1',
    search: '?debug=1',
  };
  const url = buildAdminRouteUrl(location, {
    contestId: 'pp_rn_2026',
    screen: 'questions',
  });
  assert.equal(url, '/admin.html?debug=1&contest=pp_rn_2026&module=questions');
  assert.deepEqual(
    resolveAdminRoute({ search: '?contest=pp_rn_2026&module=questions' }, contests),
    { contestId: 'pp_rn_2026', screen: 'questions' },
  );
});

test('mapeamento de URL cobre todas as abas e rejeita contexto inválido', () => {
  for (const { screen, module } of CONTEST_WORKSPACE_TABS) {
    assert.equal(moduleFromScreen(screen), module);
    assert.equal(screenFromModule(module), screen);
  }
  assert.deepEqual(
    resolveAdminRoute(
      { search: '?contest=desconhecido&module=desconhecido' },
      contests,
      { contestId: 'pc_al_2026', screen: 'overview' },
    ),
    { contestId: 'pc_al_2026', screen: 'overview' },
  );
});

test('anterior e próxima respeitam os limites das seis etapas', () => {
  assert.equal(adjacentWorkspaceScreen('contests', -1), null);
  assert.equal(adjacentWorkspaceScreen('contests', 1), 'curriculum');
  assert.equal(adjacentWorkspaceScreen('questions', -1), 'curriculum');
  assert.equal(adjacentWorkspaceScreen('questions', 1), 'media');
  assert.equal(adjacentWorkspaceScreen('publication', 1), null);
});

test('shell permanente, histórico e proteção de alterações ficam centralizados', async () => {
  const [html, app, shell, contestsScreen] = await Promise.all([
    readFile(new URL('../app/admin.html', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminApp.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminShell.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/admin/adminContestsScreen.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="admin-workspace"/);
  assert.match(app, /pushState|replaceState/);
  assert.match(app, /popstate/);
  assert.match(app, /beforeunload/);
  assert.match(app, /alterações não salvas/i);
  assert.match(shell, /CONTEST_WORKSPACE_TABS/);
  assert.match(shell, /Etapa \$\{index \+ 1\}/);
  assert.doesNotMatch(contestsScreen, /admin-workspace-header|admin-workspace-tabs/);
  assert.doesNotMatch(`${app}\n${shell}\n${contestsScreen}`, /location\?*\.reload|location\.reload/);
});
