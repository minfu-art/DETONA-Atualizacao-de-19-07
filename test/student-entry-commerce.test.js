import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CheckoutService, MercadoPagoCheckoutGateway } from '../app/js/services/checkoutService.js';
import { ContestCatalogService } from '../app/js/services/contestCatalogService.js';
import { LibraryService } from '../app/js/services/libraryService.js';
import { LibrarySnapshotRepository } from '../app/js/repositories/librarySnapshotRepository.js';
import { resetContestTransientContext } from '../app/js/auth/academicSessionContext.js';
import {
  checkoutActionFor,
  partitionLibrary,
  readCheckoutReturn,
  resolveCheckoutReturn,
} from '../app/js/services/studentEntryModel.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('biblioteca separa cursos próprios de ofertas', () => {
  const items = [{ owned: true }, { owned: false }, { owned: true }];
  const result = partitionLibrary(items);
  assert.equal(result.owned.length, 2);
  assert.equal(result.offers.length, 1);
});

test('retorno de checkout nunca concede entitlement no navegador', () => {
  const returned = readCheckoutReturn('?checkout=success&contest=curso-a');
  assert.deepEqual(returned, { state: 'success', contestId: 'curso-a' });
  const pending = resolveCheckoutReturn(returned, [{ owned: false, contest: { id: 'curso-a' } }]);
  assert.equal(pending.pending, true);
  assert.equal(pending.confirmed, undefined);
  const confirmed = resolveCheckoutReturn(returned, [{ owned: true, contest: { id: 'curso-a', name: 'Curso A' } }]);
  assert.equal(confirmed.confirmed, true);
});

test('cancelamento preserva acesso fechado e só permite retry real', () => {
  const state = resolveCheckoutReturn(
    readCheckoutReturn('?checkout=cancelled&contest=curso-a'),
    [{ owned: false, contest: { id: 'curso-a' }, checkoutAction: { action: 'purchase' } }],
  );
  assert.equal(state.title, 'Compra não concluída.');
  assert.equal(state.retryAllowed, true);
});

test('ação comercial respeita conteúdo, sales status e gateway', () => {
  const base = { owned: false, contest: { contentStatus: 'ready', salesStatus: 'available' } };
  assert.equal(checkoutActionFor(base, { configured: false }).action, 'details');
  assert.equal(checkoutActionFor(base, { configured: true }).action, 'purchase');
  assert.equal(checkoutActionFor({ ...base, contest: { contentStatus: 'preparing', salesStatus: 'unavailable' } }, { configured: true }).disabled, true);
});

test('cache offline é sanitizado e jamais vira autoridade de acesso', () => {
  const memory = new Map();
  const storage = { setItem: (key, value) => memory.set(key, value), getItem: (key) => memory.get(key) || null };
  const snapshots = new LibrarySnapshotRepository({ storage });
  snapshots.save('aluno-a', [{ owned: true, entitlement: { secret: 'não armazenar' }, summary: { xp: 99 }, contest: { id: 'a', code: 'A', name: 'A' } }]);
  const cached = snapshots.read('aluno-a');
  assert.equal(cached.items[0].owned, true);
  assert.equal(cached.items[0].entitlement, undefined);
  assert.equal(cached.items[0].summary, undefined);
  assert.doesNotMatch(memory.values().next().value, /secret|xp/);
});

test('catálogo cloud não usa fallback estático quando backend falha', async () => {
  const catalog = new ContestCatalogService({ getClient: async () => null, allowFallback: () => false });
  await assert.rejects(() => catalog.list(), (error) => error.code === 'CATALOG_UNAVAILABLE');
});

test('produção não compra indisponível nem concede acesso local', async () => {
  let checkoutCalls = 0;
  const service = new LibraryService({
    allowLocalGrants: () => false,
    catalog: { getById: async () => ({ id: 'a', contentStatus: 'preparing', salesStatus: 'unavailable' }) },
    entitlements: { find: async () => null },
    checkout: { capability: () => ({ configured: true }), purchase: async () => { checkoutCalls += 1; } },
  });
  await assert.rejects(() => service.purchase({ id: 'aluno' }, 'a'), /não está disponível/);
  assert.equal(checkoutCalls, 0);
});

test('checkout aceita apenas redirect HTTPS e não o persiste como pagamento', async () => {
  let writes = 0;
  const service = new CheckoutService({
    gateway: { checkout: async () => ({ status: 'redirect', redirectUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=abc' }) },
    purchases: { save: async () => { writes += 1; } },
    persistLocally: () => true,
  });
  assert.equal((await service.purchase({})).redirectUrl, 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=abc');
  assert.equal(writes, 0);
  const unsafe = new CheckoutService({ gateway: { checkout: async () => ({ status: 'redirect', redirectUrl: 'http://example.test' }) } });
  await assert.rejects(() => unsafe.purchase({}), /não pertence ao Mercado Pago/);
});

test('gateway remoto envia somente concurso e idempotência e não concede acesso', async () => {
  let request;
  const gateway = new MercadoPagoCheckoutGateway({
    idFactory: () => '11111111-1111-4111-8111-111111111111',
    getClient: async () => ({
      functions: { invoke: async (name, options) => {
        request = { name, options };
        return { data: { checkout: { id: 'order-1', status: 'redirect', redirectUrl: 'https://www.mercadopago.com.br/test' } } };
      } },
    }),
  });
  const result = await gateway.checkout({ userId: 'ignored', contest: { id: 'curso-a', priceCents: 1 } });
  assert.equal(request.name, 'commercial-checkout');
  assert.deepEqual(request.options.body, {
    contestId: 'curso-a', requestId: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(result.status, 'redirect');
  assert.equal(gateway.capability().provider, 'mercado_pago');
});

test('troca de curso limpa somente contexto transitório', () => {
  let timerCleared = 0;
  const ctx = { user: { id: 'a' }, contest: { id: 'a' }, player: { xp: 8 }, battleSession: {}, disciplineId: 'd', clearRankedTimer: () => { timerCleared += 1; } };
  resetContestTransientContext(ctx);
  assert.equal(ctx.battleSession, null);
  assert.equal(ctx.disciplineId, null);
  assert.equal(ctx.player.xp, 8);
  assert.equal(ctx.user.id, 'a');
  assert.equal(timerCleared, 1);
});

test('contratos visuais e administrativos da entrada permanecem explícitos', async () => {
  const [auth, library, model, admin, sw, legal, index] = await Promise.all([
    source('app/js/ui/auth.js'), source('app/js/ui/library.js'), source('app/js/services/studentEntryModel.js'),
    source('app/js/admin/adminMediaScreen.js'), source('app/sw.js'), source('app/legal.html'), source('app/index.html'),
  ]);
  assert.match(auth, /autocomplete="email"/);
  assert.match(auth, /autocomplete = 'current-password'/);
  assert.match(auth, /autocomplete: 'new-password'/);
  assert.match(auth, /Se existir uma conta/);
  assert.match(library, /Meus Cursos/);
  assert.match(library, /ADICIONAR CURSOS/);
  assert.doesNotMatch(library, /data-purchase-contest|data-interest-contest/);
  assert.match(model, /Estamos confirmando seu acesso/);
  assert.match(admin, /Arte temática do concurso \(legado\)/);
  assert.match(admin, /tiers-v2/);
  assert.match(sw, /student-entry\.css/);
  assert.match(sw, /librarySnapshotRepository/);
  assert.equal((legal.match(/<h1\b/g) || []).length, 1);
  assert.match(index, /student-entry\.css/);
});

test('primeiro acesso abre biblioteca sem exigir concurso ativo', async () => {
  const app = await source('app/js/app.js');
  assert.match(app, /const libraryPlayer = activeContestId \? await getPlayer\(\) : null/);
  assert.match(app, /reason === 'register'[\s\S]*clearActiveContestId\(\)[\s\S]*showLibrary\(\)/);
  assert.doesNotMatch(app, /Falha ao iniciar o IndexedDB/);
  assert.match(app, /error\?\.code !== 'CATALOG_UNAVAILABLE'[\s\S]*showLibrary\(\{ refresh: true \}\)/);
});
