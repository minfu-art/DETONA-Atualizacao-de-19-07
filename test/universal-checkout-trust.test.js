import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CheckoutService,
  MercadoPagoCheckoutGateway,
  isMercadoPagoCheckoutUrl,
} from '../app/js/services/checkoutService.js';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('antessala usa dados canônicos de qualquer curso e não contém oferta fixa da PC AL', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /escapeHtml\(contest\.name\)/);
  assert.match(ui, /escapeHtml\(contest\.role \|\| 'Preparação completa'\)/);
  assert.match(ui, /formatCanonicalPrice\(contest\)/);
  assert.match(ui, /Number\(contest\.questionCount \|\| 0\)/);
  assert.match(ui, /Number\(contest\.subtopicCount \|\| 0\)/);
  assert.match(ui, /CONTINUAR PARA O PAGAMENTO SEGURO/);
  assert.match(ui, /Pagamento seguro processado pelo Mercado Pago/);
  assert.match(ui, /mercado-pago-logo-footer-official\.svg/);
  assert.doesNotMatch(ui, /Confirme sua Jornada PC AL|R\$ 69,99|pc_al_2026/);
});

test('entrada comercial nunca abre o Mercado Pago automaticamente', async () => {
  const app = await source('app/js/app.js');
  assert.match(app, /onPurchase: \(contestId\) => purchaseAndRedirect\(user, contestId\)/);
  assert.doesNotMatch(app, /directCheckoutContestId/);
  assert.doesNotMatch(app, /ABRINDO PAGAMENTO/);
});

test('antessala preserva layout ilustrado e responsivo no celular', async () => {
  const css = await source('app/css/student-entry.css');
  assert.match(css, /feature-question-bank-v1\.webp/);
  assert.match(css, /feature-ranking-v1\.webp/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.acquisition-feature-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.commercial-intent__action button \{ min-height: 58px; touch-action: manipulation; \}/);
});

test('checkout aceita somente domínio oficial do Mercado Pago', () => {
  assert.equal(isMercadoPagoCheckoutUrl('https://www.mercadopago.com.br/checkout/v1/redirect'), true);
  assert.equal(isMercadoPagoCheckoutUrl('https://mercadopago.com/checkout'), true);
  assert.equal(isMercadoPagoCheckoutUrl('https://mercadopago.com.br.golpe.example/checkout'), false);
  assert.equal(isMercadoPagoCheckoutUrl('http://www.mercadopago.com.br/checkout'), false);
});

test('dois cliques concorrentes reutilizam uma única criação de checkout por curso', async () => {
  let invocations = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const gateway = new MercadoPagoCheckoutGateway({
    idFactory: () => '11111111-1111-4111-8111-111111111111',
    getClient: async () => ({
      functions: {
        invoke: async () => {
          invocations += 1;
          await pending;
          return {
            data: {
              checkout: {
                status: 'redirect',
                redirectUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=unica',
              },
            },
          };
        },
      },
    }),
  });
  const service = new CheckoutService({ gateway, persistLocally: () => false });
  const contest = { id: 'curso-universal' };
  const first = service.purchase({ contest });
  const second = service.purchase({ contest });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(invocations, 1);
  assert.equal(a.redirectUrl, b.redirectUrl);
});
