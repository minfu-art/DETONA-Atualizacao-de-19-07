import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CONTEST_CATALOG } from '../app/js/contest/contestCatalog.js';
import { selectActiveJourney } from '../app/js/services/careerLibraryService.js';
import { partitionLibrary } from '../app/js/services/studentEntryModel.js';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('commercial handoff shows only the course selected on the public site', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /resolveCommercialIntent\(commercialIntent, items\)/);
  assert.match(ui, /data-commercial-intent=/);
  assert.match(ui, /formatCanonicalPrice\(contest\)/);
  assert.doesNotMatch(ui, /data-purchase-contest/);
});

test('commercial handoff blocks duplicate clicks and requires validated HTTPS redirect', async () => {
  const [ui, app, checkout] = await Promise.all([
    source('app/js/ui/library.js'),
    source('app/js/app.js'),
    source('app/js/services/checkoutService.js'),
  ]);
  assert.match(ui, /if \(!contestId \|\| button\.disabled\) return/);
  assert.match(ui, /button\.disabled = true/);
  assert.match(app, /libraryService\.purchase\(user, contestId\)/);
  assert.match(app, /location\.assign\(purchase\.redirectUrl\)/);
  assert.match(app, /directCheckoutContestId\(commercialIntent, state\.items\)/);
  assert.match(checkout, /redirect\.protocol !== 'https:'/);
});

test('service worker refreshes navigation and runtime configuration', async () => {
  const sw = await source('app/sw.js');
  assert.match(sw, /detona-v155-pm-al-publicada/);
  assert.match(sw, /asset === '\.\/env\.runtime\.js'/);
  assert.match(sw, /fetch\(e\.request, \{ cache: 'no-store' \}\)/);
  assert.match(sw, /e\.request\.mode === 'navigate'[\s\S]*fetch\(e\.request\)/);
});
const item = (id, { owned = false, interested = false, lastAccessAt = null } = {}) => ({
  owned,
  interested,
  contest: { id, code: id.toUpperCase(), contentStatus: 'ready', salesStatus: 'available' },
  summary: { lastAccessAt },
});

test('Biblioteca usa somente owned em Meus Cursos', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /const \{ owned \} = partitionLibrary\(items\)/);
  assert.match(ui, /ownedOrdered\.map/);
});

test('catálogo comercial não aparece na UI privada', async () => {
  assert.doesNotMatch(await source('app/js/ui/library.js'), /Cursos disponíveis|data-purchase-contest|library-search-panel/);
});

test('Próximos concursos não aparece', async () => {
  assert.doesNotMatch(await source('app/js/ui/library.js'), /Próximos concursos|upcoming-title/);
});

test('Tenho interesse e Quero ser avisado não aparecem', async () => {
  assert.doesNotMatch(await source('app/js/ui/library.js'), /Tenho interesse|Quero ser avisado|data-interest-contest/);
});

test('Adicionar Cursos existe', async () => {
  assert.match(await source('app/js/ui/library.js'), /\+ ADICIONAR CURSOS/);
});

test('identificador do curso permanece em uma linha no fallback visual', async () => {
  const css = await source('app/css/student-entry.css');
  assert.match(css, /\.owned-course-art__fallback span[^}]*min-width:\s*72px/);
  assert.match(css, /\.owned-course-art__fallback span[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.owned-course-art__fallback strong[^}]*white-space:\s*nowrap/);
});

test('destino é URL pública segura e isolada da sessão', async () => {
  const [links, ui] = await Promise.all([source('app/js/services/studentEntryLinks.js'), source('app/js/ui/library.js')]);
  assert.match(links, /https:\/\/detonaconcursos\.com\//);
  assert.match(ui, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(ui, /access_token|refresh_token|user_id/);
});

test('curso sem entitlement não aparece como adquirido', () => {
  const result = partitionLibrary([item('owned', { owned: true }), item('offer')]);
  assert.deepEqual(result.owned.map(({ contest }) => contest.id), ['owned']);
});

test('interested true não gera curso adquirido', () => {
  assert.equal(partitionLibrary([item('interest', { interested: true })]).owned.length, 0);
});

test('activeJourney aparece primeiro', () => {
  const owned = [item('a', { owned: true }), item('b', { owned: true })];
  assert.equal(selectActiveJourney(owned, 'b').contest.id, 'b');
});

test('continuar preserva proteção concorrente', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /const openingContests = new Set\(\)/);
  assert.match(ui, /if \(openingContests\.has\(contestId\)\) return/);
  assert.match(ui, /relatedButtons\.forEach/);
});

test('screen library oculta stats do topbar', async () => {
  const [shell, css] = await Promise.all([source('app/js/ui/appShell.js'), source('app/css/main.css')]);
  assert.match(shell, /app-shell--private-library', screen === 'library'/);
  assert.match(css, /\.app-shell--private-library \.app-topbar__stats/);
});

test('sair de library restaura stats por estado derivado da tela', async () => {
  const shell = await source('app/js/ui/appShell.js');
  assert.match(shell, /classList\.toggle\('app-shell--private-library', screen === 'library'\)/);
  assert.doesNotMatch(shell, /classList\.add\('app-shell--private-library'\)/);
});

test('sidebar library mode oculta Jornada e Evolução', async () => {
  const [shell, css] = await Promise.all([source('app/js/ui/appShell.js'), source('app/css/main.css')]);
  assert.match(shell, /data-nav-group=/);
  assert.match(css, /data-nav-group="journey"/);
  assert.match(css, /data-nav-group="evolution"/);
});

test('navegação normal reaparece dentro da jornada', async () => {
  const css = await source('app/css/main.css');
  assert.doesNotMatch(css, /\.app-sidebar__group\[data-nav-group="journey"\]\s*\{\s*display:none/);
  assert.match(css, /\.app-shell--private-library \.app-sidebar__group/);
});

test('estado vazio possui Explorar Cursos', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /Sua primeira jornada começa aqui/);
  assert.match(ui, /EXPLORAR CURSOS/);
});

test('offline não confirma ação externa', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /if \(offline \|\| !href\)/);
  assert.match(ui, /data-public-courses disabled/);
});

test('PC AL continua 137 subtópicos', () => {
  assert.equal(CONTEST_CATALOG.find(({ id }) => id === 'pc_al_2026').subtopicCount, 137);
});

test('PC AL continua 6480 questões', () => {
  assert.equal(CONTEST_CATALOG.find(({ id }) => id === 'pc_al_2026').questionCount, 6480);
});

test('10B permanece intacta', async () => {
  const [checkout, migration] = await Promise.all([
    source('supabase/functions/commercial-checkout/index.ts'),
    source('supabase/migrations/20260811193000_secure_commercial_checkout.sql'),
  ]);
  assert.match(checkout, /reserve_commerce_order/);
  assert.match(checkout, /x-idempotency-key/);
  assert.match(migration, /commerce_orders_one_pending_per_contest_uidx/);
  assert.match(migration, /preference_claim_token/);
});

test('10C backend permanece intacto', async () => {
  const [service, migration] = await Promise.all([
    source('app/js/services/libraryService.js'),
    source('supabase/migrations/20260811234500_contest_interest_demand.sql'),
  ]);
  assert.match(service, /async setInterest/);
  assert.match(migration, /contest_interests/);
  assert.match(migration, /interest_goal/);
});
