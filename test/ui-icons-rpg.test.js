import test from 'node:test';
import assert from 'node:assert/strict';

import { ICO, icon, navIcon } from '../app/js/ui/icons.js';

const REQUIRED_ICONS = [
  'home', 'book', 'question', 'trophy', 'user', 'flame', 'bolt', 'gem',
  'target', 'calendar', 'medal', 'chart', 'sword', 'map', 'forge', 'shield',
  'star', 'menu', 'chest', 'skull', 'homeFill', 'checkCircle', 'shieldCheck',
  'clipboard', 'seedling', 'logout',
];

test('família RPG cobre todos os ícones usados pelo jogo', () => {
  assert.deepEqual(REQUIRED_ICONS.filter((name) => typeof ICO[name] !== 'function'), []);
});

test('cada ícone possui placa, gradiente, brilho e semântica decorativa', () => {
  for (const name of REQUIRED_ICONS) {
    const html = icon(name);
    assert.match(html, /class="ico ico--rpg ico--/);
    assert.match(html, /class="ico__plate"/);
    assert.match(html, /linearGradient/);
    assert.match(html, /class="ico__glyph"/);
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, /<text\b|watermark|data:image/i);
  }
});

test('gradientes recebem identificadores únicos para evitar colisões no DOM', () => {
  const first = icon('home');
  const second = icon('home');
  const firstId = first.match(/id="([^"]+-main)"/)?.[1];
  const secondId = second.match(/id="([^"]+-main)"/)?.[1];
  assert.ok(firstId);
  assert.ok(secondId);
  assert.notEqual(firstId, secondId);
});

test('classes de tamanho continuam compatíveis com navegação e telas', () => {
  assert.match(navIcon('home'), /class="ico ico--nav ico--rpg/);
  assert.match(icon('bolt', 'ico--sm'), /class="ico ico--sm ico--rpg/);
  assert.match(icon('chest', 'ico--lg'), /class="ico ico--lg ico--rpg/);
});
