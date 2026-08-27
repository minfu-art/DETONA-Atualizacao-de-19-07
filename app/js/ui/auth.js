import { escapeHtml } from './helpers.js';
import { installButtonHtml, bindInstallButtons } from '../core/pwaInstall.js';
import { icon } from './icons.js?v=74';
import { getStudentEntryLinks } from '../services/studentEntryLinks.js';

const AUTH_MODES = Object.freeze({
  LOGIN: 'login',
  REGISTER: 'register',
  FORGOT: 'forgot',
  FORGOT_SENT: 'forgot-sent',
  VERIFY_EMAIL: 'verify-email',
  RESET: 'reset',
});

function recoveryRedirectUrl(location = globalThis.location) {
  const url = new URL(location?.href || 'http://localhost/');
  url.hash = '';
  url.search = '';
  url.searchParams.set('auth', 'recovery');
  return url.toString();
}

function clearRecoveryUrl() {
  if (!globalThis.location || !globalThis.history?.replaceState) return;
  const url = new URL(globalThis.location.href);
  url.hash = '';
  url.searchParams.delete('auth');
  url.searchParams.delete('code');
  url.searchParams.delete('type');
  globalThis.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

function passwordRules(value) {
  return {
    length: value.length >= 8,
    letter: /[A-Za-z]/.test(value),
    number: /\d/.test(value),
    space: !/\s/.test(value),
  };
}

function modeCopy(mode) {
  if (mode === AUTH_MODES.REGISTER) return {
    kicker: 'Comece sua jornada',
    title: 'Crie sua conta',
    description: 'Seu progresso fica protegido e disponível em todos os seus dispositivos.',
  };
  if (mode === AUTH_MODES.FORGOT) return {
    kicker: 'Recuperar acesso',
    title: 'Esqueceu sua senha?',
    description: 'Informe seu e-mail. Enviaremos um link seguro para criar uma nova senha.',
  };
  if (mode === AUTH_MODES.FORGOT_SENT) return {
    kicker: 'Verifique sua caixa de entrada',
    title: 'Link solicitado',
    description: 'Se existir uma conta para esse e-mail, as instruções chegarão em alguns minutos.',
  };
  if (mode === AUTH_MODES.RESET) return {
    kicker: 'Proteja sua conta',
    title: 'Crie uma nova senha',
    description: 'Escolha uma senha forte e diferente da anterior.',
  };
  if (mode === AUTH_MODES.VERIFY_EMAIL) return {
    kicker: 'Cadastro concluído',
    title: 'Confirme seu e-mail',
    description: 'Enviamos as instruções de confirmação. Depois disso, volte para entrar e abrir sua biblioteca.',
  };
  return {
    kicker: 'Área do aluno',
    title: 'Bem-vindo de volta',
    description: 'Entre para continuar exatamente de onde parou.',
  };
}

function passwordField({ id = 'auth-password', name = 'password', placeholder = 'Senha', autocomplete = 'current-password', describedBy = 'auth-error' } = {}) {
  return `<div class="field auth-field">
    <label class="sr-only" for="${id}">${placeholder}</label>
    <div class="input-action auth-input">
      <span class="auth-input__icon" aria-hidden="true">${icon('lock', 'ico--control')}</span>
      <input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" minlength="8" placeholder="${placeholder}" aria-describedby="${describedBy}" required>
      <button data-toggle-password="${id}" type="button" aria-label="Mostrar ${placeholder.toLowerCase()}">${icon('eye', 'ico--control')}</button>
    </div>
  </div>`;
}

export function renderAuth(root, { authService, onAuthenticated }) {
  let mode = authService.isPasswordRecoveryLocation?.() ? AUTH_MODES.RESET : AUTH_MODES.LOGIN;
  let draftEmail = '';
  const links = getStudentEntryLinks();

  const draw = ({ message = '', messageType = 'error' } = {}) => {
    const register = mode === AUTH_MODES.REGISTER;
    const forgot = mode === AUTH_MODES.FORGOT;
    const forgotSent = mode === AUTH_MODES.FORGOT_SENT;
    const verifyEmail = mode === AUTH_MODES.VERIFY_EMAIL;
    const reset = mode === AUTH_MODES.RESET;
    const login = mode === AUTH_MODES.LOGIN;
    const googleEnabled = authService.isGoogleLoginEnabled?.() === true;
    const copy = modeCopy(mode);
    const passwordRequirement = '<div class="auth-requirements" id="auth-requirements"><span data-rule="length">8 caracteres</span><span data-rule="letter">uma letra</span><span data-rule="number">um número</span><span data-rule="space">sem espaços</span></div>';

    root.innerHTML = `
      <section class="saas-auth saas-auth--${mode}" aria-labelledby="auth-title">
        <div class="detona-login-card">
          <img class="auth-backdrop" src="assets/ui/login-command-hall.webp" alt="" width="1536" height="1024" decoding="async" fetchpriority="high">
          <div class="saas-auth__story">
            <div class="auth-logo-lockup" aria-label="Detona Concursos">
              <img class="auth-logo-lockup__emblem" src="assets/icons/icon-512.png" alt="" width="512" height="512" decoding="async" fetchpriority="high">
              <div class="auth-logo-lockup__wordmark"><strong>DETONA</strong><span>CONCURSOS</span></div>
            </div>
            <div class="auth-story-copy">
              <span>PREPARAÇÃO DE ALTA PERFORMANCE</span>
              <h2>Seu próximo nível<br><em>começa agora.</em></h2>
              <p>Estratégia, constância e evolução reunidas em uma única jornada.</p>
            </div>
          </div>
          <div class="saas-auth__panel">
            <div class="saas-auth__form-wrap">
              <div class="auth-mobile-brand" aria-hidden="true">
                <img src="assets/icons/icon-192.png" alt="" width="192" height="192">
                <strong>DETONA <span>CONCURSOS</span></strong>
              </div>
              <header class="auth-mode-heading">
                <span class="saas-kicker">${copy.kicker}</span>
                <h1 id="auth-title">${copy.title}</h1>
                <p>${copy.description}</p>
              </header>
              ${(forgotSent || verifyEmail) ? `
                <div class="auth-sent" role="status">
                  <span aria-hidden="true">${icon('mail', 'ico--control')}</span>
                  <strong>${verifyEmail ? 'Ative sua conta para continuar' : 'Confira também o spam'}</strong>
                  <p>${verifyEmail ? `Enviamos para <b>${escapeHtml(draftEmail)}</b>. Confirme em outra aba e volte aqui para continuar no curso escolhido.` : 'Por segurança, não informamos se o endereço está cadastrado.'}</p>
                </div>
                ${message ? `<p class="auth-confirmation-feedback ${messageType === 'success' ? 'is-success' : ''}" role="status" aria-live="polite">${escapeHtml(message)}</p>` : ''}
                ${verifyEmail ? `
                  <div class="auth-confirmation-actions">
                    <button class="btn btn-primary btn-block auth-submit auth-submit--single" id="auth-confirmed" type="button"><strong>JÁ CONFIRMEI — CONTINUAR</strong></button>
                    <button class="auth-secondary-action" id="auth-resend" type="button">REENVIAR E-MAIL</button>
                    <button class="auth-switch" id="auth-change-email" type="button">E-mail errado? <strong>ALTERAR CADASTRO</strong></button>
                  </div>
                ` : '<button class="btn btn-primary btn-block auth-submit auth-submit--single" id="auth-back-login" type="button"><strong>VOLTAR PARA ENTRAR</strong></button>'}
              ` : `
                <form id="auth-form" class="auth-form">
                  ${(googleEnabled && (login || register)) ? `
                    <button class="auth-google" id="auth-google" type="button" aria-busy="false">
                      <span class="auth-google__mark" aria-hidden="true">G</span>
                      <strong>CONTINUAR COM GOOGLE</strong>
                    </button>
                    <div class="auth-divider" aria-hidden="true"><span>ou continue com e-mail</span></div>
                  ` : ''}
                  ${register ? `<div class="field auth-field"><label class="sr-only" for="auth-name">Nome completo</label><div class="auth-input"><span class="auth-input__icon" aria-hidden="true">${icon('user', 'ico--control')}</span><input id="auth-name" name="name" autocomplete="name" minlength="2" placeholder="Nome completo" required></div></div>` : ''}
                  ${reset ? '' : `<div class="field auth-field"><label class="sr-only" for="auth-email">E-mail</label><div class="auth-input"><span class="auth-input__icon" aria-hidden="true">${icon('mail', 'ico--control')}</span><input id="auth-email" name="email" type="email" autocomplete="email" inputmode="email" value="${escapeHtml(draftEmail)}" placeholder="E-mail cadastrado" aria-describedby="auth-error" required></div></div>`}
                  ${login ? passwordField() : ''}
                  ${register ? passwordField({ placeholder: 'Mínimo de 8 caracteres', autocomplete: 'new-password', describedBy: 'auth-requirements auth-error' }) : ''}
                  ${reset ? `${passwordField({ placeholder: 'Nova senha', autocomplete: 'new-password', describedBy: 'auth-requirements auth-error' })}${passwordField({ id: 'auth-password-confirm', name: 'passwordConfirm', placeholder: 'Confirmar nova senha', autocomplete: 'new-password' })}` : ''}
                  ${(register || reset) ? passwordRequirement : ''}
                  ${login ? `<div class="auth-options"><span class="auth-session-note">${icon('check', 'ico--control')} Conexão protegida</span><button type="button" class="auth-forgot" id="auth-forgot">Esqueci minha senha</button></div>` : ''}
                  <p id="auth-error" class="auth-error ${messageType === 'success' ? 'is-success' : ''}" role="alert" aria-live="assertive">${escapeHtml(message)}</p>
                  <button class="btn btn-primary btn-block auth-submit" type="submit" aria-busy="false"><span aria-hidden="true">${icon('bolt', 'ico--control')}</span><strong>${register ? 'CRIAR CONTA' : forgot ? 'ENVIAR LINK SEGURO' : reset ? 'SALVAR NOVA SENHA' : 'ENTRAR'}</strong><span aria-hidden="true">${icon('bolt', 'ico--control')}</span></button>
                </form>
                <button class="auth-switch" id="auth-switch" type="button">${register ? 'Já possui conta? <strong>ENTRAR</strong>' : (forgot || reset) ? 'Lembrou sua senha? <strong>VOLTAR PARA ENTRAR</strong>' : 'Ainda não tem conta? <strong>CADASTRE-SE</strong>'}</button>
              `}
              ${(!(forgotSent || verifyEmail) && (login || register)) ? `<div class="auth-install-wrap">${installButtonHtml({ id: 'btn-install-auth', variant: 'ghost', block: false, label: 'Instalar aplicativo' })}</div>` : ''}
              <p class="auth-legal">Ao continuar, você concorda com os <a href="${escapeHtml(links.terms)}" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e a <a href="${escapeHtml(links.privacy)}" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</p>
              <a class="auth-support" href="${escapeHtml(links.support)}">Contato e suporte</a>
            </div>
          </div>
        </div>
      </section>`;

    bindInstallButtons(root);

    root.querySelector('#auth-google')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        await authService.loginWithGoogle();
      } catch (error) {
        draw({ message: error.message || 'Não foi possível entrar com o Google agora.' });
      }
    });

    root.querySelector('#auth-resend')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await authService.resendSignupConfirmation({ email: draftEmail });
        draw({ message: 'Novo e-mail enviado. Confira também a caixa de spam.', messageType: 'success' });
      } catch (error) {
        draw({ message: error.message || 'Não foi possível reenviar agora.' });
      }
    });

    root.querySelector('#auth-confirmed')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        const user = await authService.restoreSession();
        if (!user) {
          draw({ message: 'A confirmação ainda não apareceu. Abra o link do e-mail e tente novamente.' });
          return;
        }
        await onAuthenticated({ reason: 'email-confirmation' });
      } catch (error) {
        draw({ message: error.message || 'Ainda não foi possível confirmar sua sessão.' });
      }
    });

    root.querySelector('#auth-change-email')?.addEventListener('click', () => {
      mode = AUTH_MODES.REGISTER;
      draw();
      root.querySelector('#auth-email')?.focus();
    });

    root.querySelector('#auth-back-login')?.addEventListener('click', () => {
      mode = AUTH_MODES.LOGIN;
      draw();
    });
    root.querySelector('#auth-switch')?.addEventListener('click', () => {
      if (mode === AUTH_MODES.RESET) clearRecoveryUrl();
      mode = register ? AUTH_MODES.LOGIN : login ? AUTH_MODES.REGISTER : AUTH_MODES.LOGIN;
      draw();
    });
    root.querySelector('#auth-forgot')?.addEventListener('click', () => {
      draftEmail = root.querySelector('#auth-email')?.value || '';
      mode = AUTH_MODES.FORGOT;
      draw();
      root.querySelector('#auth-email')?.focus();
    });

    root.querySelectorAll('[data-toggle-password]').forEach((toggle) => {
      const password = root.querySelector(`#${toggle.dataset.togglePassword}`);
      toggle.addEventListener('click', () => {
        const visible = password.type === 'text';
        password.type = visible ? 'password' : 'text';
        toggle.innerHTML = visible ? icon('eye', 'ico--control') : icon('eyeOff', 'ico--control');
        toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
        password.focus();
      });
    });

    const password = root.querySelector('#auth-password');
    if ((register || reset) && password) password.addEventListener('input', () => {
      Object.entries(passwordRules(password.value)).forEach(([rule, met]) => {
        root.querySelector(`[data-rule="${rule}"]`)?.classList.toggle('is-met', met);
      });
    });

    root.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const button = event.currentTarget.querySelector('button[type="submit"]');
      draftEmail = String(form.get('email') || draftEmail).trim();
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        if (forgot) {
          await authService.requestPasswordReset({
            email: draftEmail,
            redirectTo: recoveryRedirectUrl(),
          });
          mode = AUTH_MODES.FORGOT_SENT;
          draw();
          return;
        }
        if (reset) {
          const newPassword = String(form.get('password') || '');
          if (newPassword !== String(form.get('passwordConfirm') || '')) {
            throw new Error('As senhas não coincidem.');
          }
          await authService.updatePassword({ password: newPassword });
          clearRecoveryUrl();
          mode = AUTH_MODES.LOGIN;
          draw({ message: 'Senha atualizada. Entre novamente com sua nova senha.', messageType: 'success' });
          return;
        }
        const input = { name: form.get('name'), email: draftEmail, password: form.get('password') };
        if (register) await authService.register(input); else await authService.login(input);
        await onAuthenticated({ reason: register ? 'register' : 'login' });
      } catch (error) {
        if (error?.code === 'EMAIL_CONFIRMATION_REQUIRED') {
          mode = AUTH_MODES.VERIFY_EMAIL;
          draw();
          return;
        }
        draw({ message: error.message || 'Não foi possível concluir esta operação.' });
      }
    });
  };

  draw();
}
