import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { openContestFromLibrary } from '../app/js/ui/library.js';

function createButton() {
  const attributes = new Map();
  return {
    dataset: { openContest: 'pc_al_2026' },
    disabled: false,
    textContent: 'Continuar jornada',
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name); },
  };
}

test('aguarda a abertura e bloqueia cliques concorrentes', async () => {
  const button = createButton();
  let resolveOpen;
  let calls = 0;
  const onOpen = () => {
    calls += 1;
    return new Promise((resolve) => { resolveOpen = resolve; });
  };

  const firstOpen = openContestFromLibrary(button, onOpen);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Abrindo...');
  assert.equal(button.getAttribute('aria-busy'), 'true');

  const secondOpen = await openContestFromLibrary(button, onOpen);
  assert.equal(secondOpen, false);
  assert.equal(calls, 1);

  resolveOpen();
  assert.equal(await firstOpen, true);
});

test('restaura o botao e mantem a biblioteca quando a abertura falha', async () => {
  const button = createButton();
  const originalError = console.error;
  console.error = () => {};
  try {
    const opened = await openContestFromLibrary(button, async () => {
      throw new Error('falha controlada');
    });

    assert.equal(opened, false);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Continuar jornada');
    assert.equal(button.getAttribute('aria-busy'), undefined);
  } finally {
    console.error = originalError;
  }
});

test('prepara o concurso antes de trocar o layout e preserva os destinos de navegacao', async () => {
  const source = await readFile(new URL('../app/js/app.js', import.meta.url), 'utf8');
  const openStart = source.indexOf('async function openContest(contestId)');
  const openEnd = source.indexOf('\nasync function logout()', openStart);
  const openContestSource = source.slice(openStart, openEnd);

  assert.ok(openContestSource.indexOf('player = await getPlayer()') < openContestSource.indexOf("classList.remove('app-shell--library')"));
  assert.match(openContestSource, /catch \(error\) \{[\s\S]*clearActiveContestId\(\);[\s\S]*classList\.add\('app-shell--library'\);[\s\S]*throw error;/);
  assert.match(openContestSource, /if \(!player\?\.onboarded\)[\s\S]*await navigate\('onboarding'\);[\s\S]*await navigate\('home'\);/);
  assert.match(openContestSource, /await navigate\('home'\);[\s\S]*catch \(error\) \{[\s\S]*await showLibrary\(\);[\s\S]*throw error;/);

  const initStart = source.indexOf('async function initializeAuthenticatedApp()');
  const initEnd = source.indexOf('\nasync function init()', initStart);
  const initSource = source.slice(initStart, initEnd);
  assert.match(initSource, /if \(readyJourneys\.length === 1\)[\s\S]*await openContest\(activeContestId\);[\s\S]*catch \(error\)[\s\S]*await showLibrary\(\);/);
});
