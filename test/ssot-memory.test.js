import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateEditalCompletionPercentage,
  getMasterySpheres,
} from '../app/js/core/ssot.js';
import {
  computeMemoryTemperature,
  effectiveStars,
} from '../app/js/core/memory.js';

function item(overrides = {}) {
  return {
    theory_status: 'concluido',
    review_count: 1,
    ...overrides,
  };
}

function subtopic(overrides = {}) {
  return {
    stars: 3,
    memory_temperature: 'quente',
    last_studied_at: new Date().toISOString(),
    ...overrides,
  };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

test('esfera de teoria exige status concluído', () => {
  const spheres = getMasterySpheres(item({ theory_status: 'estudando' }), subtopic());
  assert.equal(spheres.theoryOn, false);
  assert.equal(spheres.reviewOn, true);
  assert.equal(spheres.combatOn, true);
  assert.equal(spheres.complete, false);
});

test('esfera de revisão exige ao menos uma revisão', () => {
  const spheres = getMasterySpheres(item({ review_count: 0 }), subtopic());
  assert.equal(spheres.theoryOn, true);
  assert.equal(spheres.reviewOn, false);
  assert.equal(spheres.combatOn, true);
  assert.equal(spheres.complete, false);
});

test('esfera de domínio exige ao menos três estrelas efetivas', () => {
  const spheres = getMasterySpheres(item(), subtopic({ stars: 2 }));
  assert.equal(spheres.combatOn, false);
  assert.equal(spheres.complete, false);
});

test('item fica completo somente com as três esferas acesas', () => {
  const spheres = getMasterySpheres(item(), subtopic());
  assert.deepEqual(spheres, {
    theoryOn: true,
    reviewOn: true,
    combatOn: true,
    complete: true,
    stars: 3,
  });
});

test('memória congelada sinaliza revisão sem apagar o domínio conquistado', () => {
  const sub = subtopic({ stars: 3, memory_temperature: 'congelado' });
  assert.equal(effectiveStars(sub), 3);
  assert.equal(getMasterySpheres(item(), sub).combatOn, true);
});

test('percentual do edital preserva arredondamento em duas casas', () => {
  assert.equal(calculateEditalCompletionPercentage(2, 3), 66.67);
  assert.equal(calculateEditalCompletionPercentage(1, 137), 0.73);
  assert.equal(calculateEditalCompletionPercentage(137, 137), 100);
});

test('edital vazio permanece em 0%', () => {
  assert.equal(calculateEditalCompletionPercentage(0, 0), 0);
});

test('memória sem estudo anterior é congelada', () => {
  assert.equal(computeMemoryTemperature(null), 'congelado');
});

test('memória com menos de 7 dias é quente', () => {
  assert.equal(computeMemoryTemperature(isoDaysAgo(6)), 'quente');
});

test('memória entre 7 e 14 dias é morna', () => {
  assert.equal(computeMemoryTemperature(isoDaysAgo(7)), 'morno');
});

test('memória entre 14 e 30 dias é fria', () => {
  assert.equal(computeMemoryTemperature(isoDaysAgo(14)), 'frio');
});

test('memória com 30 dias ou mais é congelada', () => {
  assert.equal(computeMemoryTemperature(isoDaysAgo(30)), 'congelado');
});
