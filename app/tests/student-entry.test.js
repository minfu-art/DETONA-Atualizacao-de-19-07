import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkoutActionFor,
  formatCanonicalPrice,
  readCheckoutReturn,
  resolveCheckoutReturn,
} from '../js/services/studentEntryModel.js';

test('preço é exibido somente quando existe fonte canônica válida', () => {
  assert.match(formatCanonicalPrice({ priceCents: 14990, currency: 'BRL' }), /149,90/);
  assert.equal(formatCanonicalPrice({ priceCents: 0, currency: 'BRL' }), null);
});
test('query arbitrária não é tratada como retorno de checkout', () => {
  assert.equal(readCheckoutReturn('?checkout=paid&contest=x'), null);
  assert.equal(readCheckoutReturn('?success=true&contest=x'), null);
});

test('curso offline conhecido não recebe ação de acesso', () => {
  const action = checkoutActionFor({
    owned: true,
    accessVerificationRequired: true,
    contest: { contentStatus: 'ready', salesStatus: 'available' },
  }, { configured: true });
  assert.equal(action.disabled, true);
  assert.equal(action.action, 'none');
});

test('sucesso só é confirmado após entitlement reaparecer na biblioteca', () => {
  const returned = readCheckoutReturn('?checkout=success&contest=a');
  assert.equal(resolveCheckoutReturn(returned, []).pending, true);
  assert.equal(resolveCheckoutReturn(returned, [{ owned: true, contest: { id: 'a', name: 'Curso A' } }]).confirmed, true);
});
