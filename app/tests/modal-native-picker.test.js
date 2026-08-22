import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldCloseModalOnEscape } from '../js/ui/helpers.js';

const element = (nativePicker) => ({
  matches: (selector) => nativePicker && /input\[type="time"\]/.test(selector),
});

test('Escape do seletor nativo de horário no celular não fecha o modal de hábitos', () => {
  const timeInput = element(true);
  assert.equal(shouldCloseModalOnEscape({ key: 'Escape', target: timeInput }, timeInput), false);
});

test('Escape comum continua fechando o modal', () => {
  const button = element(false);
  assert.equal(shouldCloseModalOnEscape({ key: 'Escape', target: button }, button), true);
  assert.equal(shouldCloseModalOnEscape({ key: 'Enter', target: button }, button), false);
});
