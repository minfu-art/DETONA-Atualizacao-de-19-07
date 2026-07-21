import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyXp,
  comboBonus,
  starsFromAccuracy,
  xpForNextLevel,
} from '../app/js/core/progression.js';

function player(overrides = {}) {
  return {
    level: 0,
    xp_level: 1,
    xp: 0,
    xp_next_level: 100,
    edital_completion_pct: 0,
    ...overrides,
  };
}

test('XP necessário é nível atual multiplicado por 100', () => {
  assert.equal(xpForNextLevel(1), 100);
  assert.equal(xpForNextLevel(25), 2500);
  assert.equal(xpForNextLevel(90), 9000);
});

test('XP insuficiente acumula sem subir de nível', () => {
  const result = applyXp(player(), 99);
  assert.equal(result.player.level, 0);
  assert.equal(result.player.xp_level, 1);
  assert.equal(result.player.xp, 99);
  assert.equal(result.leveledUp, false);
  assert.equal(result.levelsGained, 0);
});

test('XP exato sobe um nível e atualiza a próxima meta', () => {
  const result = applyXp(player(), 100);
  assert.equal(result.player.level, 0);
  assert.equal(result.player.xp_level, 2);
  assert.equal(result.player.xp, 0);
  assert.equal(result.player.xp_next_level, 200);
  assert.equal(result.levelsGained, 1);
});

test('um ganho de XP pode subir múltiplos níveis', () => {
  const result = applyXp(player(), 350);
  assert.equal(result.player.level, 0);
  assert.equal(result.player.xp_level, 3);
  assert.equal(result.player.xp, 50);
  assert.equal(result.levelsGained, 2);
});

test('nível 90 retém o XP quando o edital não está completo', () => {
  const result = applyXp(player({
    xp_level: 90,
    xp: 8999,
    xp_next_level: 9000,
    edital_completion_pct: 99.99,
  }), 1);

  assert.equal(result.player.xp_level, 90);
  assert.equal(result.player.xp, 9000);
  assert.equal(result.lockedAtLegend, true);
  assert.equal(result.levelsGained, 0);
});

test('nível 90 avança para 91 quando o edital está em 100%', () => {
  const result = applyXp(player({
    xp_level: 90,
    xp: 8999,
    xp_next_level: 9000,
    edital_completion_pct: 100,
  }), 1);

  assert.equal(result.player.xp_level, 91);
  assert.equal(result.player.xp, 0);
  assert.equal(result.lockedAtLegend, false);
  assert.equal(result.levelsGained, 1);
});

test('acurácia é convertida em passos de meia estrela', () => {
  const cases = [
    [0, 0], [10, 0.5], [20, 1], [30, 1.5], [40, 2],
    [50, 2.5], [60, 3], [70, 3.5], [80, 4], [90, 4.5], [100, 5],
  ];

  for (const [accuracy, expected] of cases) {
    assert.equal(starsFromAccuracy(accuracy), expected, `${accuracy}%`);
  }
});

test('bônus de combo respeita as faixas atuais', () => {
  const cases = [
    [0, 0], [2, 0],
    [3, 10], [4, 10],
    [5, 30], [9, 30],
    [10, 100], [11, 100],
  ];

  for (const [streak, expected] of cases) {
    assert.equal(comboBonus(streak), expected, `combo ${streak}`);
  }
});
