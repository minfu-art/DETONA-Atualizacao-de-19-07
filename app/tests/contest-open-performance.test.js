import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ContestContentService } from '../js/services/contestContentService.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('navegacao interna usa o concurso ja validado sem consultar entitlement a cada clique', async () => {
  const app = await source('../js/app.js');
  const navigateSource = app.slice(app.indexOf('async function navigate'), app.indexOf('async function openPreferredJourney'));
  assert.doesNotMatch(navigateSource, /libraryService\.canAccess/);
  assert.match(navigateSource, /ctx\.contest\?\.id !== getActiveContestId\(\)/);
});

test('catalogo e pacote protegido carregam em paralelo', async () => {
  const app = await source('../js/app.js');
  assert.match(app, /const \[contest, loadedContent\] = await Promise\.all\(\[/);
  assert.match(app, /contestContentService\.load\(user\.id, contestId\)/);
  assert.match(app, /contestHint\?\.id === contestId[\s\S]*Promise\.resolve\(contestHint\)/);
});

test('restauracao automatica nao repete consulta de entitlement e catalogo', async () => {
  const app = await source('../js/app.js');
  const restoreSource = app.slice(app.indexOf("let activeContestId = getActiveContestId()"), app.indexOf('async function init()'));
  assert.doesNotMatch(restoreSource, /libraryService\.canAccess/);
  assert.match(restoreSource, /openContest\(activeContestId, \{ contestHint: activeContestHint \}\)/);
});

test('usuario com base local recebe a primeira tela antes da sincronizacao remota', async () => {
  const app = await source('../js/app.js');
  assert.match(app, /const syncInBackground = isCloudEnabled\(\) && Boolean\(localPlayer\)/);
  assert.match(app, /scheduleContestMaintenance\([\s\S]*syncInBackground/);
  assert.match(app, /requestIdleCallback/);
  assert.match(app, /interactiveScreens = new Set\(\['battle', 'review', 'rankedEvent'\]\)/);
  assert.match(app, /if \(!isCurrent\(\) \|\| isInteractive\(\)\) return/);
});

test('dispositivo novo continua bloqueando no pull para restaurar a nuvem antes do seed', async () => {
  const app = await source('../js/app.js');
  assert.match(app, /if \(!syncInBackground\) \{[\s\S]*await syncOnContestOpen\(user\.id, contestId\)/);
  assert.match(app, /await ensureSeed\(\{ contentPackage \}\)/);
});

test('ambiente remoto nunca libera PC AL por fallback quando o endpoint protegido falha', async () => {
  const service = new ContestContentService({
    getClient: async () => ({ functions: { invoke: async () => ({ data: null, error: new Error('denied') }) } }),
    cacheStorage: null,
    allowLegacyFallback: () => false,
  });
  await assert.rejects(() => service.load('student', 'pc_al_2026'), /denied|indisponível/i);
});

test('fallback legado permanece disponível somente quando explicitamente permitido', async () => {
  const service = new ContestContentService({
    getClient: async () => null,
    cacheStorage: null,
    allowLegacyFallback: () => true,
  });
  assert.deepEqual(await service.load('student', 'pc_al_2026'), { legacyStatic: true, contestId: 'pc_al_2026' });
});
