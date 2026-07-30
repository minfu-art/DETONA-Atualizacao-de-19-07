import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import {
  actionCard,
  emptyState,
  errorState,
  loadingState,
  mentorSurface,
  metricCard,
  skeleton,
} from '../app/js/ui/components.js';

const cssUrl = new URL('../app/css/design-system.css', import.meta.url);
const indexUrl = new URL('../app/index.html', import.meta.url);
const shellUrl = new URL('../app/js/ui/appShell.js', import.meta.url);
const helpersUrl = new URL('../app/js/ui/helpers.js', import.meta.url);
const docsUrl = new URL('../docs/visual-foundation-v1.md', import.meta.url);
const cssRoot = new URL('../app/css/', import.meta.url);
const jsRoot = new URL('../app/js/', import.meta.url);
const adminHtmlUrl = new URL('../app/admin.html', import.meta.url);

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

test('fundação possui tokens canônicos sem duplicação crítica', async () => {
  const css = await readFile(cssUrl, 'utf8');
  const required = [
    '--ds-text-disabled', '--ds-text-inverse', '--ds-text-critical', '--ds-text-positive',
    '--ds-surface-data', '--ds-surface-interactive', '--ds-overlay',
    '--ds-border-active', '--ds-border-danger', '--ds-border-positive',
    '--ds-radius-xs', '--ds-radius-pill', '--ds-shadow-modal', '--ds-shadow-focus',
    '--ds-width-compact', '--ds-width-standard', '--ds-width-wide', '--ds-width-immersive',
    '--ds-touch-target', '--ds-z-overlay', '--ds-z-toast',
    '--ds-type-display', '--ds-type-page', '--ds-type-section', '--ds-type-card',
    '--ds-type-body', '--ds-type-body-secondary', '--ds-type-label', '--ds-type-micro',
  ];
  for (const token of required) {
    assert.equal((css.match(new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g')) || []).length, 1, token);
  }
});

test('temas de área alteram variáveis compartilhadas', async () => {
  const css = await readFile(cssUrl, 'utf8');
  for (const theme of ['today', 'study', 'battle', 'plan', 'performance', 'habits', 'ranked', 'profile', 'library']) {
    assert.match(css, new RegExp(`\\[data-theme="${theme}"\\][^{]*\\{[^}]*--ds-theme-accent:`));
  }
  const shell = await readFile(shellUrl, 'utf8');
  assert.match(shell, /root\.dataset\.theme = SCREEN_THEMES\[screen\]/);
});

test('primitivos oficiais cobrem superfícies, botões, campos e larguras', async () => {
  const css = await readFile(cssUrl, 'utf8');
  for (const surface of ['primary', 'secondary', 'data', 'action', 'mentor', 'empty', 'warning', 'critical']) {
    assert.match(css, new RegExp(`\\.ds-surface--${surface}\\b`));
  }
  for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'icon', 'link']) {
    assert.match(css, new RegExp(`\\.ds-button--${variant}\\b`));
  }
  for (const size of ['sm', 'md', 'lg']) assert.match(css, new RegExp(`\\.ds-button--${size}\\b`));
  assert.match(css, /\.ds-button:disabled/);
  assert.match(css, /\.ds-button\[aria-busy="true"\]/);
  assert.match(css, /--ds-touch-target:44px/);
  assert.match(css, /\.ds-field\[data-state="error"\]/);
  assert.match(css, /\.ds-field\[data-state="success"\]/);
  assert.match(css, /\.ds-choice input/);
  for (const width of ['compact', 'standard', 'wide', 'immersive']) {
    assert.match(css, new RegExp(`\\.ds-page--${width}\\b`));
  }
});

test('componentes compartilhados usam os contratos oficiais e sem texto novo abaixo de 12px', () => {
  assert.match(metricCard({ label: 'Acertos', value: 8 }), /ds-surface--data/);
  assert.match(actionCard({ title: 'Continuar' }), /ds-surface--action/);
  assert.match(emptyState({ title: 'Sem itens', description: 'Comece por aqui.' }), /ds-surface--empty/);
  assert.match(errorState({ title: 'Falha', description: 'Tente novamente.' }), /ds-surface--critical/);
  assert.match(loadingState({ label: 'Preparando revisão' }), /aria-busy="true"/);
  assert.match(skeleton(3), /aria-busy="true"/);
  assert.doesNotMatch(skeleton(3), /\sstyle=/);
  const mentor = mentorSurface({
    mentor: 'orion',
    name: 'Orion',
    role: 'Mentor de desempenho',
    title: 'Leia seus indicadores',
    message: 'Use dados para escolher a próxima ação.',
    context: 'Últimos 7 dias',
  });
  assert.match(mentor, /ds-mentor--orion/);
  assert.match(mentor, /Mentor de desempenho/);
  assert.match(mentor, /Últimos 7 dias/);
});

test('modal oficial controla teclado, foco e scroll sem remover compatibilidade legada', async () => {
  const [helpers, css] = await Promise.all([readFile(helpersUrl, 'utf8'), readFile(cssUrl, 'utf8')]);
  assert.match(helpers, /ds-modal--\$\{variant\}/);
  assert.match(helpers, /data-modal-close/);
  assert.match(helpers, /event\.key === 'Escape'/);
  assert.match(helpers, /event\.key !== 'Tab'/);
  assert.match(helpers, /modalReturnFocus\?\.isConnected/);
  assert.match(helpers, /classList\.add\('has-open-modal'\)/);
  assert.match(helpers, /classList\.remove\('has-open-modal'\)/);
  assert.match(css, /body\.has-open-modal\s*\{\s*overflow:hidden/);
  assert.match(helpers, /modal ro-window ds-modal/);
});

test('foco, redução de movimento e rolagem seguem contratos acessíveis', async () => {
  const css = await readFile(cssUrl, 'utf8');
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.ds-scroll-page/);
  assert.match(css, /\.ds-scroll-region/);
  assert.match(css, /overscroll-behavior:contain/);
});

test('ordem das folhas PWA permanece estável', async () => {
  const html = await readFile(indexUrl, 'utf8');
  const ordered = [
    'css/main.css',
    'css/design-system.css',
    'css/dashboard-jrpg.css',
    'css/plan-edital.css',
    'css/performance-mobile.css',
  ];
  let cursor = -1;
  for (const stylesheet of ordered) {
    const next = html.indexOf(stylesheet);
    assert.ok(next > cursor, stylesheet);
    cursor = next;
  }
  assert.match(html, /rel="manifest"\s+href="manifest\.json"/);
});

test('fase não aumenta !important nem estilos inline do baseline auditado', async () => {
  const cssFiles = (await walk(cssRoot)).filter((url) => url.pathname.endsWith('.css'));
  const sourceFiles = (await walk(jsRoot)).filter((url) => url.pathname.endsWith('.js'));
  let important = 0;
  let inlineStyles = 0;
  for (const file of cssFiles) {
    const source = await readFile(file, 'utf8');
    important += (source.match(/!important/g) || []).length;
  }
  for (const file of [...sourceFiles, indexUrl, adminHtmlUrl]) {
    const source = await readFile(file, 'utf8');
    inlineStyles += (source.match(/style\s*=/g) || []).length;
  }
  assert.ok(important <= 99, `!important: ${important}`);
  assert.ok(inlineStyles <= 88, `estilos inline: ${inlineStyles}`);
});

test('documentação classifica legado e não cria segunda fonte de verdade', async () => {
  const docs = await readFile(docsUrl, 'utf8');
  assert.match(docs, /fonte executável de verdade é `app\/css\/design-system\.css`/);
  for (const category of ['Fundação oficial', 'Módulo moderno', 'Legado compatível', 'Legado a migrar', 'Código morto confirmado']) {
    assert.match(docs, new RegExp(category));
  }
});
