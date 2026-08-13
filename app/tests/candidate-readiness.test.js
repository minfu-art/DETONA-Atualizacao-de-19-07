import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('abertura instalada apresenta restauração progressiva em vez de tela vazia', async () => {
  const html = await source('../index.html');
  assert.match(html, /class="app-boot"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.match(html, /Preparando sua jornada/);
  assert.match(html, /Restaurando sua sessão e seu progresso neste dispositivo/);
});

test('estado de abertura é compacto, responsivo e respeita movimento reduzido', async () => {
  const css = await source('../css/main.css');
  assert.match(css, /\.app-boot\s*\{/);
  assert.match(css, /width:\s*min\(440px,\s*calc\(100% - 24px\)\)/);
  assert.match(css, /@media \(max-width:\s*359px\)[\s\S]*\.app-boot/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.app-boot i::after/);
});

test('estado de abertura usa apenas recurso local já versionado no PWA', async () => {
  const html = await source('../index.html');
  const sw = await source('../sw.js');
  assert.match(html, /src="assets\/icons\/icon-192\.png"/);
  assert.match(sw, /\.\/assets\/icons\/icon-192\.png/);
});
