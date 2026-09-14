import assert from 'node:assert/strict';
import test from 'node:test';
import { purchasePayload } from '../js/analytics/metaPixel.js';

test('compra confirmada usa o preço canônico retornado pelo catálogo', () => {
  assert.deepEqual(purchasePayload({
    id: 'pc_al_2026',
    name: 'PC AL 2026 — Agente',
    priceCents: 2490,
    currency: 'BRL',
  }), {
    content_ids: ['pc_al_2026'],
    content_name: 'PC AL 2026 — Agente',
    content_type: 'product',
    num_items: 1,
    value: 24.9,
    currency: 'BRL',
  });
});

test('não gera evento de compra sem valor canônico', () => {
  assert.equal(purchasePayload({ id: 'pc_al_2026', priceCents: 0, currency: 'BRL' }), null);
});
