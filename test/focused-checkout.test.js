import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLibrary } from '../app/js/ui/library.js';
import { getStudentEntryLinks } from '../app/js/services/studentEntryLinks.js';

function render({ preorder = false, owned = false, offline = false } = {}) {
  const root = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  renderLibrary(root, {
    user: { name: 'Aluno', email: 'aluno@example.test' },
    items: [{ owned, accessVerificationRequired: offline,
      checkoutAction: { action: 'purchase', disabled: offline },
      contest: { id: 'pc_pe_2026', code: 'PC PE', name: 'PC PE 2027', role: 'Agente',
        salesStatus: preorder ? 'preorder' : 'available', contentStatus: preorder ? 'preparing' : 'ready',
        description: '317 questões desatualizadas', questionCount: 1318, subtopicCount: 188,
        priceCents: 2490, currency: 'BRL', color: '#231044', accent: '#8b44ef' } }],
    commercialIntent: { contestId: 'pc_pe_2026' },
    links: { courses: 'https://detonaconcursos.com/cursos/' },
    offline,
  });
  return root.innerHTML;
}

test('compra concentra dados canônicos, conta e pagamento sem manifesto repetido', () => {
  const html = render();
  assert.match(html, /Finalizar compra/);
  assert.match(html, /1\.318/);
  assert.doesNotMatch(html, /317 questões|acquisition-price-manifesto/);
  assert.match(html, /aluno@example\.test/);
  assert.ok(html.indexOf('data-commercial-intent=') < html.indexOf('acquisition-payment-trust'));
  assert.match(html, /Acesso após confirmação do pagamento/);
});
test('pré-venda não promete estudo imediatamente após pagar', () => {
  const html = render({ preorder: true });
  assert.match(html, /Reserva confirmada após o pagamento/);
  assert.match(html, /Conteúdo inicial ainda não liberado/);
  assert.doesNotMatch(html, /Acesso após confirmação do pagamento|Acesso liberado após confirmação/);
});
test('curso adquirido ou offline não oferece botão de pagamento', () => {
  assert.doesNotMatch(render({ owned: true }), /data-commercial-intent=/);
  assert.doesNotMatch(render({ offline: true }), /data-commercial-intent=/);
});
test('trocar curso aponta para o catálogo oficial e não para a home', () => {
  assert.equal(getStudentEntryLinks().courses, 'https://detonaconcursos.com/cursos/');
});
