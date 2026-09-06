import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkoutActionFor,
  directCheckoutContestId,
  formatCanonicalPrice,
  clearRememberedCommercialIntent,
  readCommercialIntent,
  readRememberedCommercialIntent,
  readCheckoutReturn,
  rememberCommercialIntent,
  resolveCommercialEntryIntent,
  resolveCommercialIntent,
  resolveCheckoutReturn,
} from '../js/services/studentEntryModel.js';

test('preço é exibido somente quando existe fonte canônica válida', () => {
  assert.match(formatCanonicalPrice({ priceCents: 14990, currency: 'BRL' }), /149,90/);
  assert.equal(formatCanonicalPrice({ priceCents: 0, currency: 'BRL' }), null);
});

test('commercial intent accepts only safe source and identifiers', () => {
  assert.deepEqual(readCommercialIntent('?source=detona-site&courseId=pc-al-2026&contestId=pc_al_2026&salesPage=pc-al-agente-2026'), {
    source: 'detona-site',
    courseId: 'pc-al-2026',
    contestId: 'pc_al_2026',
    salesPage: 'pc-al-agente-2026',
    directCheckout: false,
  });
  assert.equal(readCommercialIntent('?source=outro&contestId=pc_al_2026'), null);
  assert.equal(readCommercialIntent('?source=detona-site&contestId=../../admin'), null);
});

test('intenção de compra sobrevive ao retorno do e-mail e expira com segurança', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const startedAt = Date.UTC(2026, 8, 6, 12);
  const intent = readCommercialIntent('?source=detona-site&contestId=pc_pe_2026&courseId=pc-pe-2027&action=buy');
  rememberCommercialIntent(intent, storage, startedAt);
  assert.deepEqual(readRememberedCommercialIntent(storage, startedAt + 60_000), intent);
  assert.deepEqual(resolveCommercialEntryIntent('?code=email-confirmation', storage, startedAt + 60_000), intent);
  assert.equal(readRememberedCommercialIntent(storage, startedAt + (49 * 60 * 60 * 1000)), null);
  rememberCommercialIntent(intent, storage, startedAt);
  clearRememberedCommercialIntent(storage);
  assert.equal(readRememberedCommercialIntent(storage, startedAt), null);
});

test('handoff de compra direta elimina a confirmação duplicada sem contornar o catálogo', () => {
  const contest = { id: 'pc_al_2026', contentStatus: 'ready', salesStatus: 'available', priceCents: 14990 };
  const available = [{ contest, owned: false, checkoutAction: { action: 'purchase', disabled: false } }];
  const blocked = [{ contest, owned: false, checkoutAction: { action: 'details', disabled: false } }];
  const direct = readCommercialIntent('?source=detona-site&contestId=pc_al_2026&action=buy');
  assert.equal(direct.directCheckout, true);
  assert.equal(directCheckoutContestId(direct, available), 'pc_al_2026');
  assert.equal(directCheckoutContestId(direct, blocked), null);
  assert.equal(directCheckoutContestId(readCommercialIntent('?source=detona-site&contestId=pc_al_2026'), available), null);
});

test('commercial intent trusts only canonical catalog state', () => {
  const intent = readCommercialIntent('?source=detona-site&contestId=pc_al_2026');
  const contest = { id: 'pc_al_2026', contentStatus: 'ready', salesStatus: 'available', priceCents: 14990 };
  assert.equal(resolveCommercialIntent(intent, [{ contest, owned: false, checkoutAction: { action: 'purchase', disabled: false } }]).state, 'ready');
  assert.equal(resolveCommercialIntent(intent, [{ contest, owned: false, checkoutAction: { action: 'details', disabled: false } }]).state, 'unavailable');
  assert.equal(resolveCommercialIntent(intent, [{ contest, owned: true, checkoutAction: { action: 'open', disabled: false } }]).state, 'owned');
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
