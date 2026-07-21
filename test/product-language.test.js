import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('ações acadêmicas substituem metáforas nos rótulos principais', async () => {
  const [home, edital, map, profile, performance, forge, onboarding, model] = await Promise.all([
    read('../app/js/ui/home.js'),
    read('../app/js/ui/grimorio.js'),
    read('../app/js/ui/worldMap.js'),
    read('../app/js/ui/profile.js'),
    read('../app/js/ui/performance.js'),
    read('../app/js/ui/forge.js'),
    read('../app/js/ui/onboarding.js'),
    read('../app/js/core/editalUiModel.js'),
  ]);
  assert.match(home, /QUESTÕES DO DIA/);
  assert.match(home, /INICIAR QUESTÕES/);
  assert.match(edital, /Iniciar questões/);
  assert.match(map, /Mapa do edital/);
  assert.match(profile, /Configurações e backup/);
  assert.match(performance, /Desafio do edital/);
  assert.match(forge, /Salvar questão/);
  assert.match(onboarding, /Começar preparação/);
  assert.match(model, /Pronto para questões/);
  assert.doesNotMatch(home, />INICIAR BATALHA<|Abrir Grimório/);
  assert.doesNotMatch(performance, />Monstro Edital</);
});

test('frases motivacionais não exigem vocabulário de RPG', async () => {
  const phrases = await read('../app/js/data/phrases.js');
  assert.doesNotMatch(phrases, /grind|drop|farm|raid|dungeon|World Boss|Kafra|Forja|Poring|Baphomet|Grimório/i);
  assert.match(phrases, /questão|estudo|edital|revis/i);
});
