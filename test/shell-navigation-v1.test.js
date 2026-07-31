import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import {
  DESKTOP_NAVIGATION_GROUPS,
  MOBILE_MORE_NAVIGATION_GROUPS,
  MOBILE_PRIMARY_ITEMS,
  NAVIGATION_ITEMS,
  isBottomNavigationVisible,
  isMobileSecondaryScreen,
  primaryScreenFor,
  themeForScreen,
  titleForScreen,
} from '../app/js/ui/navigation.js';

const appShellUrl = new URL('../app/js/ui/appShell.js', import.meta.url);
const navigationUrl = new URL('../app/js/ui/navigation.js', import.meta.url);
const appUrl = new URL('../app/js/app.js', import.meta.url);
const indexUrl = new URL('../app/index.html', import.meta.url);
const mainCssUrl = new URL('../app/css/main.css', import.meta.url);
const rankedUrl = new URL('../app/js/ui/rankedEvent.js', import.meta.url);
const cssRoot = new URL('../app/css/', import.meta.url);
const jsRoot = new URL('../app/js/', import.meta.url);

async function walk(url) {
  const entries = await readdir(url, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
    if (entry.isDirectory()) output.push(...await walk(target));
    else output.push(target);
  }
  return output;
}

test('mapa central contém todas as áreas sem duplicar rotas existentes', () => {
  assert.equal(new Set(NAVIGATION_ITEMS.map(({ screen }) => screen)).size, NAVIGATION_ITEMS.length);
  for (const screen of ['library', 'home', 'map', 'edital', 'expedition', 'performance', 'wellbeing', 'rankedEvent', 'profile', 'more']) {
    assert.ok(NAVIGATION_ITEMS.some((item) => item.screen === screen), screen);
  }
  assert.equal(primaryScreenFor('topicTree'), 'map');
  assert.equal(primaryScreenFor('battle'), 'map');
  assert.equal(primaryScreenFor('review'), 'map');
  assert.equal(themeForScreen('rankedEvent'), 'ranked');
  assert.equal(titleForScreen('rankedEvent'), 'Simulados');
  assert.equal(isBottomNavigationVisible('onboarding'), false);
});

test('barra mobile possui exatamente Hoje, Estudar, Edital, Plano e Mais', () => {
  assert.deepEqual(MOBILE_PRIMARY_ITEMS.map(({ label }) => label), ['Hoje', 'Estudar', 'Edital', 'Plano', 'Mais']);
  assert.equal(MOBILE_PRIMARY_ITEMS.length, 5);
});

test('menu Mais reúne acompanhar, conta e conteúdo', () => {
  const groups = Object.fromEntries(MOBILE_MORE_NAVIGATION_GROUPS.map(({ id, items }) => [id, items.map(({ label }) => label)]));
  assert.deepEqual(groups.tracking, ['Desempenho', 'Hábitos', 'Simulados']);
  assert.deepEqual(groups.content, ['Biblioteca', 'Perfil']);
  for (const screen of ['performance', 'wellbeing', 'rankedEvent', 'library', 'profile']) {
    assert.equal(isMobileSecondaryScreen(screen), true, screen);
  }
});

test('sidebar desktop segue os quatro grupos oficiais', () => {
  const groups = Object.fromEntries(DESKTOP_NAVIGATION_GROUPS.map(({ label, items }) => [label, items.map(({ label: itemLabel }) => itemLabel)]));
  assert.deepEqual(groups, {
    Concurso: ['Biblioteca'],
    Jornada: ['Hoje', 'Estudar', 'Edital', 'Plano'],
    Evolução: ['Desempenho', 'Hábitos', 'Simulados'],
    Conta: ['Perfil'],
  });
});

test('shell deriva desktop, mobile, títulos e temas da fonte central', async () => {
  const [shell, navigation, html, app] = await Promise.all([
    readFile(appShellUrl, 'utf8'), readFile(navigationUrl, 'utf8'), readFile(indexUrl, 'utf8'), readFile(appUrl, 'utf8'),
  ]);
  assert.match(shell, /DESKTOP_NAVIGATION_GROUPS\.map/);
  assert.match(shell, /MOBILE_PRIMARY_ITEMS\.map/);
  assert.match(shell, /MOBILE_MORE_NAVIGATION_GROUPS\.map/);
  assert.match(shell, /titleForScreen\(screen\)/);
  assert.match(shell, /themeForScreen\(screen\)/);
  assert.match(app, /isBottomNavigationVisible\(screen\)/);
  assert.doesNotMatch(html, /data-screen="/);
  assert.equal((navigation.match(/const items = \[/g) || []).length, 1);
});

test('menu Mais possui contrato acessível, Escape, trap e retorno de foco', async () => {
  const shell = await readFile(appShellUrl, 'utf8');
  for (const marker of ['aria-haspopup="dialog"', 'aria-controls="mobile-more-panel"', 'aria-expanded="false"', 'role="dialog"', 'aria-modal="true"']) {
    assert.match(shell, new RegExp(marker));
  }
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /event\.key !== 'Tab'/);
  assert.match(shell, /moreButton\.focus/);
  assert.match(shell, /document\.body\.classList\.add\('has-open-more'\)/);
  assert.match(shell, /document\.body\.classList\.remove\('has-open-more'\)/);
  assert.match(shell, /setBackgroundInert\(true\)/);
  assert.match(shell, /setBackgroundInert\(false\)/);
  assert.match(shell, /history\.pushState/);
  assert.match(shell, /popstate/);
});

test('estado ativo mantém Mais nas áreas secundárias e aria-current por navegação', async () => {
  const shell = await readFile(appShellUrl, 'utf8');
  assert.match(shell, /secondaryMobile = isMobileSecondaryScreen\(screen\)/);
  assert.match(shell, /item\.hasAttribute\('data-mobile-more'\)[\s\S]*secondaryMobile/);
  assert.match(shell, /setAttribute\('aria-current', 'page'\)/);
  assert.match(shell, /removeAttribute\('aria-current'\)/);
});

test('logout móvel e desktop reutilizam o fluxo existente', async () => {
  const [shell, app] = await Promise.all([readFile(appShellUrl, 'utf8'), readFile(appUrl, 'utf8')]);
  assert.match(shell, /shell-logout[\s\S]*onLogout/);
  assert.match(shell, /data-mobile-logout[\s\S]*onLogout/);
  assert.match(app, /async function logout\(\)[\s\S]*authService\.logout\(\)[\s\S]*clearActiveContestId\(\)/);
});

test('Simulados permanece acessível e usa empty state oficial sem criar tentativa', async () => {
  const [ranked, app] = await Promise.all([readFile(rankedUrl, 'utf8'), readFile(appUrl, 'utf8')]);
  assert.match(app, /rankedEvent:\s*renderRankedEvent/);
  assert.match(ranked, /Nenhum simulado ranqueado ativo/);
  assert.match(ranked, /Os próximos desafios aparecerão aqui quando forem liberados\./);
  assert.match(ranked, /emptyState\(/);
  assert.match(ranked, /Voltar para Hoje/);
  const emptyBranch = ranked.slice(ranked.indexOf('if (!selected)'), ranked.indexOf('const status ='));
  assert.doesNotMatch(emptyBranch, /\.start\(|\.register\(|\.submit\(/);
});

test('shell oferece skip link, anúncio e uma política principal de rolagem', async () => {
  const [html, css] = await Promise.all([readFile(indexUrl, 'utf8'), readFile(mainCssUrl, 'utf8')]);
  assert.match(html, /class="skip-link" href="#screen">Pular para o conteúdo/);
  assert.match(html, /id="shell-announcer" aria-live="polite"/);
  assert.match(css, /#screen\s*\{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.app-sidebar__nav\s*\{[^}]*overflow-y:auto/s);
  assert.match(css, /\.mobile-more__body\s*\{[^}]*overflow-y:auto/s);
  assert.match(css, /body\.has-open-more\s*\{\s*overflow:hidden/);
});

test('fase não adiciona important, estilo inline ou regra acadêmica', async () => {
  const cssFiles = (await walk(cssRoot)).filter((url) => url.pathname.endsWith('.css'));
  const jsFiles = (await walk(jsRoot)).filter((url) => url.pathname.endsWith('.js'));
  let important = 0;
  let inline = 0;
  for (const file of cssFiles) important += ((await readFile(file, 'utf8')).match(/!important/g) || []).length;
  for (const file of [...jsFiles, indexUrl]) inline += ((await readFile(file, 'utf8')).match(/style\s*=/g) || []).length;
  assert.ok(important <= 99, `!important: ${important}`);
  assert.ok(inline <= 88, `inline: ${inline}`);
  const changedNavigation = `${await readFile(navigationUrl, 'utf8')}\n${await readFile(appShellUrl, 'utf8')}`;
  assert.doesNotMatch(changedNavigation, /recalculateEditalSSOT|applyXp|grantBattleXp|mastery|streak_days\s*=/);
});
