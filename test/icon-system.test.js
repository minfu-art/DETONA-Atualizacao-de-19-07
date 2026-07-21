import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const iconsUrl = new URL('../app/js/ui/icons.js', import.meta.url);
const cssUrl = new URL('../app/css/main.css', import.meta.url);
const auditedFiles = [
  '../app/js/ui/home.js',
  '../app/js/ui/grimorio.js',
  '../app/js/ui/expedition.js',
  '../app/js/ui/topicTree.js',
  '../app/js/ui/wellbeingUI.js',
  '../app/js/ui/profile.js',
  '../app/js/ui/celebration.js',
  '../app/js/ui/enemyAssets.js',
  '../app/js/core/memory.js',
  '../app/js/core/editalUiModel.js',
].map((path) => new URL(path, import.meta.url));

test('biblioteca define todas as categorias semânticas oficiais', async () => {
  const source = await readFile(iconsUrl, 'utf8');
  for (const category of ['study', 'review', 'progress', 'plan', 'evolution', 'discipline', 'goal', 'fire', 'focus', 'alert', 'achievement', 'exam']) {
    assert.match(source, new RegExp(`${category}:`));
  }
  for (const control of ['plus', 'minus', 'chevronDown', 'chevronRight', 'check', 'circle', 'lock']) {
    assert.match(source, new RegExp(`${control}:`));
  }
  assert.match(source, /export function semanticIcon/);
});

test('áreas principais não dependem de emojis de sistema para comunicar função', async () => {
  const sources = await Promise.all(auditedFiles.map((url) => readFile(url, 'utf8')));
  const emoji = /[🔥⚡🏆📅📘📚📖📜💻🛡🔢⚖🏛🔪📋📕🏢🦅💀📒💰📈🤖🧊🔄✅❌⚔⏳🔒]/u;
  for (const source of sources) assert.doesNotMatch(source, emoji);
});

test('ícones de área e utilitários têm comportamentos visuais distintos', async () => {
  const [css, source] = await Promise.all([readFile(cssUrl, 'utf8'), readFile(iconsUrl, 'utf8')]);
  assert.match(css, /\.ico--rpg/);
  assert.match(css, /\.ico--utility/);
  assert.match(css, /\.ico--control/);
  assert.match(source, /stroke-width="1\.75"/);
});
