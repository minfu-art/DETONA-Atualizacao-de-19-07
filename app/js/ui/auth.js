import { escapeHtml } from './helpers.js';
import { installButtonHtml, bindInstallButtons } from '../core/pwaInstall.js';
import { heroSrcForLevel } from './heroAssets.js';
import { icon } from './icons.js?v=74';

export function renderAuth(root, { authService, onAuthenticated }) {
  let mode = 'login';

  const draw = (message = '') => {
    const register = mode === 'register';
    root.innerHTML = `
      <section class="saas-auth saas-auth--${register ? 'register' : 'login'}" aria-labelledby="auth-title">
        <div class="detona-login-card">
          <div class="saas-auth__story">
            <div class="rpg-energy rpg-energy--purple" aria-hidden="true"></div>
            <div class="rpg-energy rpg-energy--orange" aria-hidden="true"></div>
            <div class="auth-logo-lockup" aria-label="Detona Concursos">
              <img class="auth-logo-lockup__emblem" src="assets/icons/icon-512.png" alt="" width="512" height="512" decoding="async" fetchpriority="high">
              <div class="auth-logo-lockup__wordmark"><strong>DETONA</strong><span>CONCURSOS</span></div>
            </div>
            <div class="auth-character" aria-hidden="true">
              <span class="auth-character__halo"></span>
              <img src="${heroSrcForLevel(1, 'female')}" alt="" width="1280" height="1280" decoding="async" fetchpriority="high">
            </div>
            <div class="auth-tagline">
              <strong>ESTUDE. EVOLUA. DETONE.</strong>
              <span>O seu concurso é o <b>boss final.</b></span>
            </div>
          </div>
          <div class="saas-auth__panel">
            <div class="saas-auth__form-wrap">
              <div class="auth-mode-heading ${register ? 'is-visible' : ''}">
                <span class="saas-kicker">Comece sua jornada</span>
                <h1 id="auth-title">${register ? 'Crie sua conta' : 'Entre no DETONA'}</h1>
                <p>${register ? 'Sua biblioteca e seu progresso ficam vinculados a uma única conta.' : 'Acesse sua preparação.'}</p>
              </div>
              <form id="auth-form" class="auth-form">
                ${register ? `<div class="field auth-field"><label class="sr-only" for="auth-name">Nome completo</label><div class="auth-input"><span class="auth-input__icon" aria-hidden="true">${icon('user', 'ico--control')}</span><input id="auth-name" name="name" autocomplete="name" minlength="2" placeholder="Nome completo" required></div></div>` : ''}
                <div class="field auth-field"><label class="sr-only" for="auth-email">E-mail</label><div class="auth-input"><span class="auth-input__icon" aria-hidden="true">${icon('mail', 'ico--control')}</span><input id="auth-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="E-mail cadastrado" aria-describedby="auth-error" required></div></div>
                <div class="field auth-field"><label class="sr-only" for="auth-password">Senha</label><div class="input-action auth-input"><span class="auth-input__icon" aria-hidden="true">${icon('lock', 'ico--control')}</span><input id="auth-password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" placeholder="${register ? 'Mínimo de 8 caracteres' : 'Senha'}" aria-describedby="${register ? 'auth-requirements ' : ''}auth-error" required><button id="auth-toggle-password" type="button" aria-label="Mostrar senha">${icon('eye', 'ico--control')}</button></div></div>
                ${register ? '<div class="auth-requirements" id="auth-requirements"><span data-rule="length">8 caracteres</span><span data-rule="letter">uma letra</span><span data-rule="number">um número</span><span data-rule="space">sem espaços</span></div>' : `<div class="auth-options"><span class="auth-session-note">${icon('check', 'ico--control')} Acesso protegido</span><button type="button" class="auth-future" disabled title="Disponível quando a recuperação remota for ativada">Esqueci minha senha</button></div>`}
                <p id="auth-error" class="auth-error" role="alert" aria-live="assertive">${escapeHtml(message)}</p>
                <button class="btn btn-primary btn-block auth-submit" type="submit" aria-busy="false"><span aria-hidden="true">${icon('bolt', 'ico--control')}</span><strong>${register ? 'CRIAR CONTA' : 'ENTRAR'}</strong><span aria-hidden="true">${icon('bolt', 'ico--control')}</span></button>
              </form>
              <button class="auth-switch" id="auth-switch" type="button">${register ? 'Já possui conta? <strong>ENTRAR</strong>' : 'Ainda não tem conta? <strong>CADASTRE-SE</strong>'}</button>
              <div class="auth-install-wrap">
                ${installButtonHtml({ id: 'btn-install-auth', variant: 'ghost', block: false, label: 'Instalar aplicativo' })}
              </div>
              <p class="auth-legal">Ao continuar, você concorda com os <strong>Termos de Uso</strong> e a <strong>Política de Privacidade</strong>.</p>
              <p class="auth-demo-note">Versão local: credenciais protegidas por derivação criptográfica.</p>
            </div>
          </div>
        </div>
      </section>`;

    bindInstallButtons(root);

    root.querySelector('#auth-switch').addEventListener('click', () => {
      mode = register ? 'login' : 'register';
      draw();
    });
    const password = root.querySelector('#auth-password');
    const toggle = root.querySelector('#auth-toggle-password');
    toggle.addEventListener('click', () => {
      const visible = password.type === 'text';
      password.type = visible ? 'password' : 'text';
      toggle.innerHTML = visible ? icon('eye', 'ico--control') : icon('eyeOff', 'ico--control');
      toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
      password.focus();
    });
    if (register) password.addEventListener('input', () => {
      const value = password.value;
      const rules = { length: value.length >= 8, letter: /[A-Za-z]/.test(value), number: /\d/.test(value), space: !/\s/.test(value) };
      Object.entries(rules).forEach(([rule, met]) => root.querySelector(`[data-rule="${rule}"]`)?.classList.toggle('is-met', met));
    });
    root.querySelector('#auth-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = register ? 'Criando sua biblioteca' : 'Abrindo sua biblioteca';
      try {
        const input = { name: form.get('name'), email: form.get('email'), password: form.get('password') };
        if (register) await authService.register(input); else await authService.login(input);
        await onAuthenticated();
      } catch (error) {
        draw(error.message || 'Nao foi possivel autenticar.');
      }
    });
  };
  draw();
}
