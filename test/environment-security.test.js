import test from 'node:test';
import assert from 'node:assert/strict';

import { CloudAwareAuthService } from '../app/js/auth/cloudAuthService.js';
import {
  CheckoutService,
  CheckoutUnavailableGateway,
  LocalDemoCheckoutGateway,
} from '../app/js/services/checkoutService.js';
import { LibraryService } from '../app/js/services/libraryService.js';

const contest = { id: 'pc_al_2026', priceCents: 14990, currency: 'BRL' };

test('desenvolvimento explícito permite checkout demonstrativo', async () => {
  const gateway = new LocalDemoCheckoutGateway({
    allowDemo: () => true,
    idFactory: () => 'demo-1',
    now: () => new Date('2026-07-21T12:00:00Z'),
  });
  const purchase = await gateway.checkout({ userId: 'user-1', contest });
  assert.equal(purchase.status, 'demo_completed');
  assert.equal(purchase.provider, 'local_demo');
});

test('produção bloqueia checkout demonstrativo', async () => {
  const gateway = new LocalDemoCheckoutGateway({ allowDemo: () => false });
  await assert.rejects(gateway.checkout({ userId: 'user-1', contest }), /bloqueado/);
});

test('produção não concede entitlement local mesmo após retorno paid', async () => {
  const writes = [];
  const service = new LibraryService({
    entitlements: {
      find: async () => null,
      save: async (value) => writes.push(value),
      listByUser: async () => [],
    },
    checkout: { purchase: async () => ({ id: 'remote-checkout', status: 'paid' }) },
    allowLocalGrants: () => false,
  });
  const result = await service.purchase({ id: 'user-1' }, 'pc_al_2026');
  assert.equal(result.entitlementPending, true);
  assert.deepEqual(writes, []);
});

test('ausência de gateway real não simula compra concluída', async () => {
  const service = new CheckoutService({
    gateway: new CheckoutUnavailableGateway(),
    persistLocally: () => false,
  });
  await assert.rejects(service.purchase({ userId: 'user-1', contest }), /não configurado/);
});

test('ambiente comercial não faz fallback para autenticação local', async () => {
  let localCalls = 0;
  const service = new CloudAwareAuthService({
    localAuth: {
      login: async () => { localCalls += 1; return { id: 'local' }; },
      register: async () => { localCalls += 1; return { id: 'local' }; },
      restoreSession: async () => { localCalls += 1; return { id: 'local' }; },
      getCurrentUser: () => ({ id: 'local' }),
    },
    cloudEnabled: () => false,
    localFallbackAllowed: () => false,
    cloudRequired: () => true,
  });
  await assert.rejects(service.login({}), /remota indisponível/);
  await assert.rejects(service.register({}), /remota indisponível/);
  await assert.rejects(service.restoreSession(), /remota indisponível/);
  assert.equal(service.getCurrentUser(), null);
  assert.equal(localCalls, 0);
});
