import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  playerForOnboarding,
  playerNameForOnboarding,
} from '../app/js/ui/onboarding.js';

test('onboarding reutiliza o nome cadastrado e preserva player.name como fallback', () => {
  assert.equal(
    playerNameForOnboarding({ user: { name: '  Aluna A  ' } }, { name: 'Nome antigo' }),
    'Aluna A',
  );
  assert.equal(playerNameForOnboarding({ user: {} }, { name: '  Nome existente  ' }), 'Nome existente');
});

test('onboarding cria o jogador padrão quando a conta nova ainda não possui player', () => {
  const player = playerForOnboarding(null);
  assert.equal(player.id, 'player_1');
  assert.equal(player.onboarded, false);
  assert.equal(player.avatar_sprite, 'male');
});

test('onboarding preserva avatar e data já salvos quando o jogador é restaurado', () => {
  const saved = {
    id: 'player_1',
    name: 'Min Fu',
    avatar_sprite: 'female',
    exam_date: '2026-12-20',
    onboarded: true,
  };
  assert.equal(playerForOnboarding(saved), saved);
});

test('onboarding exibe o jogador sem campo de nome e conclui na home', async () => {
  const source = await readFile(new URL('../app/js/ui/onboarding.js', import.meta.url), 'utf8');

  assert.match(source, /renderOnboarding\(root, navigate, ctx\)/);
  assert.match(source, /playerForOnboarding\(await getPlayer\(\)\)/);
  assert.match(source, /player\.avatar_sprite === 'female'/);
  assert.match(source, /player\.exam_date \|\| EXAM_META\.default_exam_date/);
  assert.match(source, /Jogador: \$\{escapeHtml\(name\)\}/);
  assert.doesNotMatch(source, /Nome do Aventureiro|id="ob-name"/);
  assert.match(source, /player\.name = name;[\s\S]*player\.avatar_sprite = gender;[\s\S]*player\.exam_date = examDate;[\s\S]*player\.onboarded = true;[\s\S]*await progressRepository\.put\(STORES\.player, player\);[\s\S]*await navigate\('home'\);/);
  assert.match(source, /if \(startButton\.disabled\) return/);
  assert.match(source, /toast\('Não foi possível salvar sua preparação\. Tente novamente\.'\)/);
});
