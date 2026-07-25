import assert from 'node:assert/strict';
import test from 'node:test';

import {
  suggestContestIdentity,
  validateAdminContest,
} from '../app/js/services/adminContestService.js';
import {
  OPERATIONAL_CAPABILITIES,
  validateAdminContestRequest,
} from '../supabase/functions/admin-contests/core.js';

const validContest = {
  id: 'pc_pe_2027',
  code: 'PC PE',
  slug: 'pc-pe-2027',
  name: 'Polícia Civil de Pernambuco',
  role: 'Agente',
  description: 'Preparação completa.',
  price_cents: 15990,
  currency: 'BRL',
  color: '#7c6af5',
  accent: '#ff8a1f',
  icon: 'PE',
  cover_asset: null,
  content_status: 'draft',
  sales_status: 'unavailable',
  exam_date: '2027-05-10',
};

test('fábrica sugere identidade estável e valida todos os campos do concurso', () => {
  assert.deepEqual(suggestContestIdentity({ code: 'PC PE', exam_date: '2027-05-10' }), {
    slug: 'pc-pe-2027',
    id: 'pc_pe_2027',
  });
  assert.deepEqual(validateAdminContest(validContest), validContest);
});

test('criação e atualização passam por ações explícitas e capacidades operacionais', () => {
  assert.equal(validateAdminContestRequest({ action: 'create_contest', contest: validContest }).contest.id, 'pc_pe_2027');
  assert.equal(validateAdminContestRequest({ action: 'update_contest', contest: validContest }).contest.slug, 'pc-pe-2027');
  assert.equal(OPERATIONAL_CAPABILITIES.create, true);
  assert.equal(OPERATIONAL_CAPABILITIES.update, true);
});

test('duplicidade fica delegada ao índice único e HTML é rejeitado antes do banco', () => {
  assert.throws(
    () => validateAdminContestRequest({
      action: 'create_contest',
      contest: { ...validContest, description: '<script>alert(1)</script>' },
    }),
    /html_not_allowed/,
  );
  assert.throws(() => validateAdminContest({ ...validContest, price_cents: -1 }), /Preço/);
  assert.throws(() => validateAdminContest({ ...validContest, color: 'purple' }), /Cor/);
});
