import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAuth, recoveryRedirectUrl } from '../app/js/ui/auth.js';
import { renderLibrary } from '../app/js/ui/library.js';
import { readCommercialIntent, readCheckoutReturn, resolveCheckoutReturn } from '../app/js/services/studentEntryModel.js';
import { mobileCheckoutContext, reserveCheckoutBrowserWindow } from '../app/js/services/checkoutNavigation.js';
import { SupabaseAuthAdapter } from '../app/js/supabase/authAdapter.js';

const purchase = 'https://app.detonaconcursos.com/?source=detona-site&contestId=pc_pe_2026&courseId=pc-pe-2027&salesPage=pc-pe-agente-2027&action=buy';
const intent = readCommercialIntent(new URL(purchase).search);

test('recuperação mantém exatamente o curso escolhido, removendo segredos e redirects arbitrários', () => {
  const result = new URL(recoveryRedirectUrl({ href: purchase + '&code=secret&redirect=https://evil.test&price=1#access_token=secret' }));
  assert.deepEqual(readCommercialIntent(result.search), intent);
  assert.equal(result.searchParams.get('auth'), 'recovery');
  assert.equal(result.hash, '');
  assert.equal(result.searchParams.has('code'), false);
  assert.equal(result.searchParams.has('redirect'), false);
  assert.equal(result.searchParams.has('price'), false);
  assert.equal(result.origin, new URL(purchase).origin);
});
test('recuperação após retorno de pagamento mantém apenas o contexto de verificação', () => {
  const url = new URL(recoveryRedirectUrl({ href: 'https://app.detonaconcursos.com/?checkout=success&contest=pc_pe_2026' }));
  assert.deepEqual(readCheckoutReturn(url.search), { state: 'success', contestId: 'pc_pe_2026' });
  assert.equal(resolveCheckoutReturn(readCheckoutReturn(url.search), []).confirmed, undefined);
});
test('recuperação não carrega uma intenção comercial inválida', () => {
  const url = new URL(recoveryRedirectUrl({ href: 'https://app.detonaconcursos.com/?source=detona-site&contestId=../../admin&action=buy' }));
  assert.equal(url.search, '?auth=recovery');
});

// Minimal event/markup harness: invokes the real renderer and its async handlers.
function authHarness(service = {}) {
  let markup = '';
  let nodes = [];
  const root = {
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = value;
      nodes = [...value.matchAll(/<(input|button|form)\b([^>]*)>/g)].map(([, tag, attrs]) => {
        const attr = (name) => attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
        const handlers = {};
        return { tag, id: attr('id'), name: attr('name'), type: attr('type'), value: attr('value') || '',
          dataset: { authMode: attr('data-auth-mode') }, disabled: false, handlers,
          addEventListener: (name, callback) => { handlers[name] = callback; },
          setAttribute() {}, focus() {},
          querySelector: (selector) => selector === 'button[type="submit"]' ? nodes.find((node) => node.type === 'submit') : null,
        };
      });
    },
    querySelector: (selector) => nodes.find((node) => selector === '#' + node.id) || null,
    querySelectorAll: (selector) => selector === '[data-auth-mode]' ? nodes.filter((node) => node.dataset.authMode) : [],
  };
  let authenticated = 0;
  renderAuth(root, { authService: { isGoogleLoginEnabled: () => false, ...service }, commercialIntent: intent,
    onAuthenticated: async () => { authenticated += 1; } });
  return { root, get authenticated() { return authenticated; },
    field: (id, value) => { root.querySelector('#' + id).value = value; },
    click: async (id) => { const node = root.querySelector('#' + id); assert.ok(node, id); await node.handlers.click({ currentTarget: node }); },
    choose: async (mode) => { const node = nodes.find((node) => node.dataset.authMode === mode); await node.handlers.click({ currentTarget: node }); },
    submit: async () => {
      const nativeFormData = globalThis.FormData;
      globalThis.FormData = class { get(name) { return nodes.find((node) => node.name === name)?.value ?? null; } };
      try { const form = root.querySelector('#auth-form'); await form.handlers.submit({ preventDefault() {}, currentTarget: form }); }
      finally { globalThis.FormData = nativeFormData; }
    },
  };
}
test('erro no cadastro preserva nome e e-mail, mas não grava a senha no HTML', async () => {
  const ui = authHarness({ register: async () => { throw new Error('Falha de rede'); } });
  ui.field('auth-name', 'Maria Silva'); ui.field('auth-email', 'maria@example.test'); ui.field('auth-password', 'Senha1234');
  await ui.submit();
  assert.equal(ui.root.querySelector('#auth-name').value, 'Maria Silva');
  assert.equal(ui.root.querySelector('#auth-email').value, 'maria@example.test');
  assert.doesNotMatch(ui.root.innerHTML, /Senha1234/);
  assert.match(ui.root.innerHTML, /Falha de rede/);
  await ui.choose('login');
  assert.equal(ui.root.querySelector('#auth-email').value, 'maria@example.test');
  await ui.choose('register');
  assert.equal(ui.root.querySelector('#auth-name').value, 'Maria Silva');
});
test('confirmação em outro navegador oferece login e continua a mesma compra', async () => {
  const ui = authHarness({ register: async () => { throw Object.assign(new Error(), { code: 'EMAIL_CONFIRMATION_REQUIRED' }); },
    restoreSession: async () => null, login: async () => {} });
  ui.field('auth-name', 'Maria'); ui.field('auth-email', 'maria@example.test'); ui.field('auth-password', 'Senha1234');
  await ui.submit();
  assert.match(ui.root.innerHTML, /auth-confirm-login/);
  await ui.click('auth-confirmed');
  assert.match(ui.root.innerHTML, /saas-auth--login/);
  assert.match(ui.root.innerHTML, /PC PE 2027/);
  assert.equal(ui.root.querySelector('#auth-email').value, 'maria@example.test');
  ui.field('auth-password', 'Senha1234');
  await ui.submit();
  assert.equal(ui.authenticated, 1);
});
test('login não confirmado recebe orientação de confirmação, não erro de senha', async () => {
  const adapter = new SupabaseAuthAdapter({ getClient: async () => ({ auth: {
    signInWithPassword: async () => ({ error: { code: 'email_not_confirmed' } }),
  } }) });
  await assert.rejects(adapter.login({ email: 'a@example.test', password: 'Senha1234' }), { code: 'EMAIL_CONFIRMATION_REQUIRED' });
});
test('navegador móvel não abre aba extra; app instalado mantém saída externa', () => {
  const previous = globalThis.matchMedia;
  try {
    globalThis.matchMedia = (query) => ({ matches: query.includes('max-width') });
    assert.equal(mobileCheckoutContext(), false);
    let opens = 0;
    assert.equal(reserveCheckoutBrowserWindow({ openWindow: () => { opens++; } }), null);
    assert.equal(opens, 0);
    globalThis.matchMedia = (query) => ({ matches: query.includes('standalone') });
    assert.equal(mobileCheckoutContext(), true);
  } finally { globalThis.matchMedia = previous; }
});

const item = (options = {}) => ({ owned: false, contest: { id: 'pc_pe_2026', name: 'PC PE 2027', contentStatus: 'ready', priceCents: 2490 }, checkoutAction: { action: 'purchase' }, ...options });
test('retorno só oferece entrar com acesso confirmado online; pré-venda leva à biblioteca', () => {
  const returned = { state: 'success', contestId: 'pc_pe_2026' };
  assert.equal(resolveCheckoutReturn(returned, [item()]).action, 'refresh');
  assert.equal(resolveCheckoutReturn(returned, [item({ owned: true })]).action, 'enter');
  assert.equal(resolveCheckoutReturn(returned, [item({ owned: true, accessVerificationRequired: true })]).confirmed, undefined);
  assert.equal(resolveCheckoutReturn(returned, [item({ owned: true, contest: { id: 'pc_pe_2026', contentStatus: 'preparing' } })]).action, 'library');
  assert.equal(resolveCheckoutReturn({ ...returned, state: 'cancelled' }, [item()]).action, 'retry');
  assert.equal(resolveCheckoutReturn({ ...returned, state: 'cancelled' }, [item({ owned: true })]).action, 'enter');
});
test('cancelamento sem parâmetros comerciais recupera a oferta correta para nova tentativa', () => {
  const root = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  renderLibrary(root, { user: { name: 'Aluno', email: 'a@example.test' }, items: [item()],
    commerceReturn: { state: 'cancelled', contestId: 'pc_pe_2026' } });
  assert.match(root.innerHTML, /data-return-retry/);
  assert.match(root.innerHTML, /data-commercial-intent="pc_pe_2026"/);
});
test('retorno tem prioridade sobre a jornada antiga e mantém contexto até confirmação', async () => {
  const app = await readFile(new URL('../app/js/app.js', import.meta.url), 'utf8');
  const initialize = app.slice(app.indexOf('async function initializeAuthenticatedApp'));
  assert.ok(initialize.indexOf("if (readCheckoutReturn(") < initialize.indexOf('if (commercialIntent)'));
  assert.doesNotMatch(app, /if \(commerceReturn\) clearCheckoutReturnUrl/);
  assert.match(app, /onConfirmedPurchase: async \(contestId\)/);
});
