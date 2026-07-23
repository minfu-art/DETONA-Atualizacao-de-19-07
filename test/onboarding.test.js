import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { playerNameForOnboarding } from '../app/js/ui/onboarding.js';

test('onboarding reutiliza o nome cadastrado e preserva player.name como fallback', () => {
  assert.equal(
    playerNameForOnboarding({ user: { name: '  Aluna A  ' } }, { name: 'Nome antigo' }),
    'Aluna A',
  );
  assert.equal(playerNameForOnboarding({ user: {} }, { name: '  Nome existente  ' }), 'Nome existente');
});

test('onboarding exibe o jogador sem campo de nome e conclui na home', async () => {
  const source = await readFile(new URL('../app/js/ui/onboarding.js', import.meta.url), 'utf8');

  assert.match(source, /renderOnboarding\(root, navigate, ctx\)/);
  assert.match(source, /Jogador: \$\{escapeHtml\(name\)\}/);
  assert.doesNotMatch(source, /Nome do Aventureiro|id="ob-name"/);
  assert.match(source, /player\.name = name;[\s\S]*player\.avatar_sprite = gender;[\s\S]*player\.exam_date = examDate;[\s\S]*player\.onboarded = true;[\s\S]*await progressRepository\.put\(STORES\.player, player\);[\s\S]*await navigate\('home'\);/);
});
