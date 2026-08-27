import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import { SupabaseAuthAdapter } from '../app/js/supabase/authAdapter.js';
import { CloudAwareAuthService } from '../app/js/auth/cloudAuthService.js';

const authUiUrl = new URL('../app/js/ui/auth.js', import.meta.url);
const cssUrl = new URL('../app/css/design-system.css', import.meta.url);
const appUrl = new URL('../app/js/app.js', import.meta.url);
const adminUrl = new URL('../app/js/admin/adminApp.js', import.meta.url);
const swUrl = new URL('../app/sw.js', import.meta.url);
const artUrl = new URL('../app/assets/ui/login-command-hall.webp', import.meta.url);

test('cadastro fixa a confirmação no app atual e preserva a intenção comercial', async () => {
  const calls = [];
  const adapter = new SupabaseAuthAdapter({
    getLocation: () => ({
      href: 'https://app.detonaconcursos.com/?courseId=pc-al-2026&source=detona-site#cadastro',
    }),
    getClient: async () => ({
      auth: {
        signUp: async (payload) => {
          calls.push(payload);
          return {
            data: {
              user: { id: 'user-pendente', email: payload.email },
              session: null,
            },
            error: null,
          };
        },
      },
    }),
  });

  const result = await adapter.register({
    name: 'Maria',
    email: ' MARIA@EXEMPLO.COM ',
    password: 'SenhaSegura2026',
  });

  assert.equal(result.pendingEmailConfirmation, true);
  assert.deepEqual(calls, [{
    email: 'maria@exemplo.com',
    password: 'SenhaSegura2026',
    options: {
      data: { name: 'Maria' },
      emailRedirectTo: 'https://app.detonaconcursos.com/?courseId=pc-al-2026&source=detona-site',
    },
  }]);
});

test('Supabase solicita recuperação com e-mail normalizado e redirect explícito', async () => {
  const calls = [];
  const adapter = new SupabaseAuthAdapter({
    getClient: async () => ({
      auth: {
        resetPasswordForEmail: async (...args) => {
          calls.push(args);
          return { error: null };
        },
      },
    }),
  });

  const result = await adapter.requestPasswordReset({
    email: '  ALUNO@EXEMPLO.COM ',
    redirectTo: 'https://preview.detona.test/index.html?auth=recovery',
  });

  assert.deepEqual(result, { accepted: true });
  assert.deepEqual(calls, [[
    'aluno@exemplo.com',
    { redirectTo: 'https://preview.detona.test/index.html?auth=recovery' },
  ]]);
});

test('OAuth Google preserva curso e origem comercial em redirect do mesmo domínio', async () => {
  const calls = [];
  const adapter = new SupabaseAuthAdapter({
    getLocation: () => ({
      href: 'https://app.detonaconcursos.com/?courseId=pm-ba-2026&source=site&action=buy#oferta',
      origin: 'https://app.detonaconcursos.com',
    }),
    getClient: async () => ({
      auth: {
        signInWithOAuth: async (payload) => {
          calls.push(payload);
          return { data: { url: 'https://accounts.google.com/o/oauth2/auth' }, error: null };
        },
      },
    }),
  });

  assert.deepEqual(await adapter.loginWithGoogle(), {
    redirecting: true,
    url: 'https://accounts.google.com/o/oauth2/auth',
  });
  assert.deepEqual(calls, [{
    provider: 'google',
    options: {
      redirectTo: 'https://app.detonaconcursos.com/?courseId=pm-ba-2026&source=site&action=buy',
      skipBrowserRedirect: false,
    },
  }]);
  await assert.rejects(
    () => adapter.loginWithGoogle({ redirectTo: 'https://site-falso.example/roubar-sessao' }),
    /Destino de autenticação inválido/,
  );
});

test('reenvio de confirmação normaliza e-mail e mantém a compra pretendida', async () => {
  const calls = [];
  const adapter = new SupabaseAuthAdapter({
    getLocation: () => ({
      href: 'https://app.detonaconcursos.com/?courseId=pm-ba-2026&action=buy#cadastro',
    }),
    getClient: async () => ({
      auth: {
        resend: async (payload) => {
          calls.push(payload);
          return { error: null };
        },
      },
    }),
  });

  assert.deepEqual(await adapter.resendSignupConfirmation({ email: ' ALUNO@EXEMPLO.COM ' }), { accepted: true });
  assert.deepEqual(calls, [{
    type: 'signup',
    email: 'aluno@exemplo.com',
    options: {
      emailRedirectTo: 'https://app.detonaconcursos.com/?courseId=pm-ba-2026&action=buy',
    },
  }]);
});

test('redefinição valida a senha, atualiza no Supabase e encerra a sessão temporária', async () => {
  const events = [];
  const adapter = new SupabaseAuthAdapter({
    getClient: async () => ({
      auth: {
        updateUser: async (payload) => {
          events.push(['update', payload]);
          return { error: null };
        },
        signOut: async () => events.push(['signout']),
      },
    }),
  });

  await assert.rejects(() => adapter.updatePassword({ password: 'fraca' }), /8 caracteres/);
  await assert.rejects(() => adapter.updatePassword({ password: 'semnumero' }), /número/);
  assert.deepEqual(await adapter.updatePassword({ password: 'NovaSenha2026' }), { updated: true });
  assert.deepEqual(events, [
    ['update', { password: 'NovaSenha2026' }],
    ['signout'],
  ]);
});

test('detecção de link de recuperação cobre query e hash do Supabase', () => {
  const adapter = new SupabaseAuthAdapter({ getClient: async () => null });
  assert.equal(adapter.isPasswordRecoveryLocation({ search: '?auth=recovery', hash: '' }), true);
  assert.equal(adapter.isPasswordRecoveryLocation({ search: '', hash: '#type=recovery&access_token=redacted' }), true);
  assert.equal(adapter.isPasswordRecoveryLocation({ search: '?screen=home', hash: '' }), false);
});

test('serviço híbrido não faz fallback local para recuperação de senha', async () => {
  let localCalls = 0;
  const cloudCalls = [];
  const service = new CloudAwareAuthService({
    localAuth: {
      requestPasswordReset: async () => { localCalls += 1; },
      updatePassword: async () => { localCalls += 1; },
    },
    cloudAuth: {
      isAvailable: () => true,
      requestPasswordReset: async (input) => { cloudCalls.push(['request', input]); return { accepted: true }; },
      updatePassword: async (input) => { cloudCalls.push(['update', input]); return { updated: true }; },
      isPasswordRecoveryLocation: () => true,
    },
    cloudEnabled: () => true,
    localFallbackAllowed: () => false,
    cloudRequired: () => false,
  });

  assert.equal(service.isPasswordRecoveryLocation(), true);
  await service.requestPasswordReset({ email: 'a@b.com' });
  await service.updatePassword({ password: 'NovaSenha2026' });
  assert.equal(localCalls, 0);
  assert.deepEqual(cloudCalls, [
    ['request', { email: 'a@b.com' }],
    ['update', { password: 'NovaSenha2026' }],
  ]);
});

test('serviço híbrido só expõe Google quando provedor e flag pública estão ativos', async () => {
  const calls = [];
  const service = new CloudAwareAuthService({
    localAuth: {},
    cloudAuth: {
      isAvailable: () => true,
      loginWithGoogle: async (input) => { calls.push(['google', input]); return { redirecting: true }; },
      resendSignupConfirmation: async (input) => { calls.push(['resend', input]); return { accepted: true }; },
    },
    cloudEnabled: () => true,
    googleEnabled: () => true,
    localFallbackAllowed: () => false,
    cloudRequired: () => false,
  });

  assert.equal(service.isGoogleLoginEnabled(), true);
  assert.deepEqual(await service.loginWithGoogle(), { redirecting: true });
  assert.deepEqual(await service.resendSignupConfirmation({ email: 'aluno@example.com' }), { accepted: true });
  assert.deepEqual(calls, [
    ['google', {}],
    ['resend', { email: 'aluno@example.com' }],
  ]);
});

test('interface oferece fluxo completo e acessível sem botão decorativo desabilitado', async () => {
  const [ui, css, app, admin, sw, art] = await Promise.all([
    readFile(authUiUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
    readFile(appUrl, 'utf8'),
    readFile(adminUrl, 'utf8'),
    readFile(swUrl, 'utf8'),
    stat(artUrl),
  ]);

  assert.match(ui, /AUTH_MODES\.FORGOT/);
  assert.match(ui, /AUTH_MODES\.RESET/);
  assert.match(ui, /requestPasswordReset/);
  assert.match(ui, /updatePassword/);
  assert.match(ui, /CONTINUAR COM GOOGLE/);
  assert.match(ui, /JÁ CONFIRMEI — CONTINUAR/);
  assert.match(ui, /REENVIAR E-MAIL/);
  assert.match(ui, /resendSignupConfirmation/);
  assert.match(ui, /Esqueci minha senha/);
  assert.match(ui, /Por segurança, não informamos se o endereço está cadastrado/);
  assert.doesNotMatch(ui, /class="auth-future" disabled/);
  assert.match(ui, /aria-live="assertive"/);
  assert.match(ui, /autocomplete: 'new-password'/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.35fr\) minmax\(390px,\.9fr\)/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /\.auth-forgot:focus-visible/);
  assert.match(app, /isPasswordRecoveryLocation\(\)[\s\S]*showAuth\(\)/);
  assert.match(admin, /isPasswordRecoveryLocation\(\)[\s\S]*showLogin\(\)/);
  assert.match(sw, /assets\/ui\/login-command-hall\.webp/);
  assert.ok(art.size > 50_000 && art.size < 500_000, `arte otimizada fora da faixa: ${art.size}`);
});
