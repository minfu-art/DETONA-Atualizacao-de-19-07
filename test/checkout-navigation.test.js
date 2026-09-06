import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closeReservedCheckoutWindow,
  navigateToCheckout,
  reserveCheckoutBrowserWindow,
} from '../app/js/services/checkoutNavigation.js';

test('celular reserva uma aba durante o gesto de compra', () => {
  const target = {
    closed: false,
    document: { title: '', body: { innerHTML: '' } },
    opener: {},
  };
  const opened = [];
  const result = reserveCheckoutBrowserWindow({
    enabled: true,
    openWindow: (...args) => { opened.push(args); return target; },
  });
  assert.equal(result, target);
  assert.deepEqual(opened, [['about:blank', '_blank']]);
  assert.equal(target.opener, null);
  assert.match(target.document.body.innerHTML, /pagamento seguro/i);
});

test('checkout navega a aba reservada sem substituir o DETONA', () => {
  let externalUrl = null;
  let currentUrl = null;
  const target = {
    closed: false,
    location: { replace: (value) => { externalUrl = value; } },
  };
  const mode = navigateToCheckout('https://www.mercadopago.com.br/checkout', {
    target,
    currentLocation: { assign: (value) => { currentUrl = value; } },
  });
  assert.equal(mode, 'browser-window');
  assert.equal(externalUrl, 'https://www.mercadopago.com.br/checkout');
  assert.equal(currentUrl, null);
});

test('bloqueio de popup mantém fallback na janela atual', () => {
  let currentUrl = null;
  const mode = navigateToCheckout('https://www.mercadopago.com.br/checkout', {
    target: null,
    currentLocation: { assign: (value) => { currentUrl = value; } },
  });
  assert.equal(mode, 'current-window');
  assert.equal(currentUrl, 'https://www.mercadopago.com.br/checkout');
});

test('erro ao criar checkout fecha a aba provisória', () => {
  let closed = false;
  closeReservedCheckoutWindow({ closed: false, close: () => { closed = true; } });
  assert.equal(closed, true);
});
