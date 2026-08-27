import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CONTEST_CATALOG } from '../app/js/contest/contestCatalog.js';
import { LibraryService } from '../app/js/services/libraryService.js';
import { checkoutActionFor, resolveCheckoutReturn } from '../app/js/services/studentEntryModel.js';
import { assertPurchasableContest, checkoutPreference } from '../supabase/functions/commercial-checkout/core.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const pmba = Object.freeze({
  id: 'pm_ba_2026',
  name: 'PM BA 2026 — Soldado',
  price_cents: 6999,
  currency: 'BRL',
  content_status: 'preparing',
  sales_status: 'preorder',
});

test('catálogo local registra PM BA Soldado como pré-venda de R$ 69,99', () => {
  const contest = CONTEST_CATALOG.find(({ id }) => id === 'pm_ba_2026');
  assert.equal(contest?.role, 'Aluno Soldado da Polícia Militar');
  assert.equal(contest?.priceCents, 6999);
  assert.equal(contest?.contentStatus, 'preparing');
  assert.equal(contest?.salesStatus, 'preorder');
  assert.equal(contest?.subtopicCount, 213);
  assert.equal(contest?.questionCount, 0);
});

test('pré-venda pode abrir pagamento sem declarar o conteúdo pronto', () => {
  assert.equal(assertPurchasableContest(pmba), pmba);
  assert.deepEqual(checkoutActionFor({
    owned: false,
    contest: { contentStatus: 'preparing', salesStatus: 'preorder' },
  }, { configured: true }), {
    label: 'Garantir pré-venda', action: 'purchase', disabled: false,
  });
  assert.throws(() => assertPurchasableContest({ ...pmba, sales_status: 'available' }), /CONTEST_NOT_AVAILABLE/);
  assert.throws(() => assertPurchasableContest({ ...pmba, content_status: 'ready' }), /CONTEST_NOT_AVAILABLE/);
});

test('preferência do Mercado Pago identifica claramente a pré-venda', () => {
  const preference = checkoutPreference({
    order: { id: 'order-1', amount_cents: 6999 },
    contest: pmba,
    payerEmail: 'aluno@example.com',
    returnBaseUrl: 'https://app.detonaconcursos.com/',
    notificationUrl: 'https://api.example.com/commercial-webhook',
  });
  assert.match(preference.items[0].title, /^PRÉ-VENDA DETONA/);
  assert.match(preference.items[0].description, /liberado quando a jornada inicial/i);
  assert.equal(preference.items[0].unit_price, 69.99);
  assert.equal(preference.metadata.sale_type, 'preorder');
});

test('pagamento remoto da pré-venda não concede acesso no navegador', async () => {
  let checkoutCalls = 0;
  const contest = {
    id: 'pm_ba_2026', contentStatus: 'preparing', salesStatus: 'preorder',
    priceCents: 6999, currency: 'BRL',
  };
  const service = new LibraryService({
    allowLocalGrants: () => false,
    catalog: { getById: async () => contest },
    entitlements: { find: async () => null },
    checkout: {
      capability: () => ({ configured: true }),
      purchase: async () => {
        checkoutCalls += 1;
        return { id: 'order-1', status: 'redirect', redirectUrl: 'https://mercadopago.com.br/test' };
      },
    },
  });
  const result = await service.purchase({ id: 'user-1' }, contest.id);
  assert.equal(checkoutCalls, 1);
  assert.equal(result.entitlementPending, true);
});

test('entitlement aprovado aparece como pré-venda confirmada e continua bloqueado', () => {
  const item = {
    owned: true,
    contest: { id: 'pm_ba_2026', name: pmba.name, contentStatus: 'preparing', salesStatus: 'preorder' },
  };
  assert.deepEqual(checkoutActionFor(item, { configured: true }), {
    label: 'Pré-venda confirmada', action: 'none', disabled: true,
  });
  const notice = resolveCheckoutReturn({ state: 'success', contestId: 'pm_ba_2026' }, [item]);
  assert.equal(notice.title, 'Pré-venda confirmada.');
  assert.match(notice.description, /acesso.+garantido/i);
});

test('migration cadastra somente Soldado PM BA e mantém conteúdo em preparação', async () => {
  const [migration, studentContent] = await Promise.all([
    source('supabase/migrations/20260826110000_pm_ba_soldier_preorder.sql'),
    source('supabase/functions/student-content/index.ts'),
  ]);
  assert.match(migration, /'pm_ba_2026'/);
  assert.match(migration, /'Aluno Soldado da Polícia Militar'/);
  assert.match(migration, /6999/);
  assert.match(migration, /'preparing'/);
  assert.match(migration, /'preorder'/);
  assert.match(migration, /'military_police'/);
  assert.doesNotMatch(migration, /Oficial da Polícia Militar|pm_ba_2026_oficial/i);
  assert.match(studentContent, /'available', 'preorder', 'coming_soon'/);
});

test('painel administrativo reconhece e preserva o estado de pré-venda', async () => {
  const [service, edge, screen] = await Promise.all([
    source('app/js/services/adminContestService.js'),
    source('supabase/functions/admin-contests/core.js'),
    source('app/js/admin/adminContestsScreen.js'),
  ]);
  for (const code of [service, edge, screen]) assert.match(code, /preorder/);
});
