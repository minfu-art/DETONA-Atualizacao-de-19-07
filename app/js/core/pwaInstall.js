/**
 * DETONA CONCURSOS — instalação PWA (celular, tablet e desktop).
 * Captura o prompt nativo do navegador e oferece fallback com instruções.
 */

const ICON_SRC = './assets/icons/icon-192.png?v=install-1';
const STORAGE_DISMISS = 'detona.installBannerDismissedAt';
const DISMISS_MS = 1000 * 60 * 60 * 24 * 3; // 3 dias

let deferredPrompt = null;
let listenersBound = false;
const statusListeners = new Set();

function notify() {
  const snapshot = getInstallStatus();
  statusListeners.forEach((fn) => {
    try { fn(snapshot); } catch { /* ignore */ }
  });
  document.dispatchEvent(new CustomEvent('detona:pwa-status', { detail: snapshot }));
  refreshInstallUi();
}

export function getInstallStatus() {
  const ua = navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.includes('android-app://');
  const canNativeInstall = Boolean(deferredPrompt);
  const platform = isIos ? 'ios' : isAndroid ? 'android' : 'desktop';

  return {
    isStandalone,
    isIos,
    isAndroid,
    platform,
    canNativeInstall,
    canOfferInstall: !isStandalone,
  };
}

export function initPwaInstall() {
  if (listenersBound) return;
  listenersBound = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    try { localStorage.removeItem(STORAGE_DISMISS); } catch { /* ignore */ }
    hideInstallBanner(true);
    notify();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => notify());

  ensureInstallChrome();
  notify();

  // banner após o app carregar um pouco
  setTimeout(() => {
    maybeShowInstallBanner();
  }, 1800);
}

export function onInstallStatusChange(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export async function promptInstallApp() {
  const status = getInstallStatus();

  if (status.isStandalone) {
    showInstallModal({
      title: 'App já instalado',
      body: `
        <div class="install-modal">
          <img class="install-modal__icon" src="${ICON_SRC}" alt="Ícone DETONA CONCURSOS" width="72" height="72" />
          <p>O <strong>DETONA CONCURSOS</strong> já está rodando como aplicativo neste dispositivo.</p>
          <p class="muted">Abra pelo ícone na tela inicial ou no menu de apps para a melhor experiência.</p>
        </div>
      `,
    });
    return { ok: true, mode: 'already-installed' };
  }

  if (deferredPrompt) {
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notify();
      if (choice?.outcome === 'accepted') {
        return { ok: true, mode: 'native-accepted' };
      }
      // se recusou, ainda mostra como instalar manualmente
      showInstallHelpModal(status);
      return { ok: false, mode: 'native-dismissed' };
    } catch {
      showInstallHelpModal(status);
      return { ok: false, mode: 'native-error' };
    }
  }

  showInstallHelpModal(status);
  return { ok: true, mode: 'instructions' };
}

function showInstallHelpModal(status = getInstallStatus()) {
  const steps = installStepsHtml(status.platform);
  showInstallModal({
    title: 'Instalar DETONA CONCURSOS',
    body: `
      <div class="install-modal">
        <img class="install-modal__icon" src="${ICON_SRC}" alt="Ícone DETONA CONCURSOS" width="88" height="88" />
        <p class="install-modal__lead">
          Instale o app na <strong>tela inicial</strong> do celular, tablet ou PC.
          Funciona offline e abre como aplicativo.
        </p>
        <ul class="install-platforms" aria-label="Plataformas">
          <li>Android</li>
          <li>iPhone / iPad</li>
          <li>Windows / Mac</li>
        </ul>
        <div class="install-steps">
          <h3>Como instalar neste dispositivo</h3>
          ${steps}
        </div>
        <p class="muted install-modal__tip">Dica: use Chrome, Edge ou Safari para a melhor instalação.</p>
      </div>
    `,
    primaryLabel: status.canNativeInstall ? 'Instalar agora' : 'Entendi',
    onPrimary: status.canNativeInstall
      ? () => { deferredPrompt?.prompt?.(); }
      : null,
  });
}

function installStepsHtml(platform) {
  if (platform === 'ios') {
    return `
      <ol>
        <li>Toque em <strong>Compartilhar</strong> <span aria-hidden="true">⬆️</span> na barra do Safari</li>
        <li>Role e toque em <strong>Adicionar à Tela de Início</strong></li>
        <li>Confirme em <strong>Adicionar</strong> — o ícone do DETONA aparece na Home</li>
      </ol>`;
  }
  if (platform === 'android') {
    return `
      <ol>
        <li>Toque no menu <strong>⋮</strong> do Chrome</li>
        <li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong></li>
        <li>Confirme — o DETONA abre como app com o ícone do jogo</li>
      </ol>`;
  }
  return `
    <ol>
      <li>No Chrome ou Edge, abra o menu <strong>⋮</strong> (ou o ícone ⊕ na barra de endereço)</li>
      <li>Clique em <strong>Instalar DETONA CONCURSOS</strong> / <strong>Instalar app</strong></li>
      <li>O atalho aparece no menu Iniciar / Dock como um aplicativo</li>
    </ol>`;
}

function showInstallModal({ title, body, primaryLabel = 'Fechar', onPrimary = null }) {
  closeInstallModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay install-modal-overlay';
  overlay.id = 'install-modal-root';
  overlay.innerHTML = `
    <div class="modal ro-window install-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="install-modal-title" tabindex="-1">
      <div class="ro-title" id="install-modal-title">${title}</div>
      <div class="ro-body">
        ${body}
        <div class="mt-12 row gap-8 install-modal__actions">
          <button type="button" class="btn btn-primary btn-block" id="install-modal-primary">${primaryLabel}</button>
          <button type="button" class="btn btn-ghost btn-block" id="install-modal-close">Fechar</button>
        </div>
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeInstallModal();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('#install-modal-close')?.addEventListener('click', closeInstallModal);
  overlay.querySelector('#install-modal-primary')?.addEventListener('click', async () => {
    if (onPrimary) {
      try { await onPrimary(); } catch { /* ignore */ }
    }
    closeInstallModal();
  });
  overlay.querySelector('[role="dialog"]')?.focus();
}

function closeInstallModal() {
  document.getElementById('install-modal-root')?.remove();
}

function ensureInstallChrome() {
  if (document.getElementById('pwa-install-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'pwa-install-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Instalar aplicativo');
  banner.innerHTML = `
    <img class="pwa-install-banner__icon" src="${ICON_SRC}" alt="" width="48" height="48" />
    <div class="pwa-install-banner__copy">
      <strong>Instalar DETONA</strong>
      <span>App na tela inicial · celular, tablet e PC</span>
    </div>
    <button type="button" class="btn btn-primary pwa-install-banner__cta" id="pwa-banner-install">Instalar</button>
    <button type="button" class="pwa-install-banner__close" id="pwa-banner-close" aria-label="Fechar">×</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('#pwa-banner-install')?.addEventListener('click', () => {
    promptInstallApp();
  });
  banner.querySelector('#pwa-banner-close')?.addEventListener('click', () => {
    try { localStorage.setItem(STORAGE_DISMISS, String(Date.now())); } catch { /* ignore */ }
    hideInstallBanner(true);
  });
}

function maybeShowInstallBanner() {
  const status = getInstallStatus();
  if (!status.canOfferInstall) {
    hideInstallBanner(true);
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_DISMISS);
    if (raw && Date.now() - Number(raw) < DISMISS_MS) return;
  } catch { /* ignore */ }
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;
  banner.hidden = false;
  banner.classList.add('is-visible');
}

function hideInstallBanner(force = false) {
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;
  banner.classList.remove('is-visible');
  if (force) banner.hidden = true;
}

/** HTML de botão/card reutilizável em telas */
export function installButtonHtml({
  id = 'btn-install-app',
  variant = 'primary',
  block = true,
  label,
} = {}) {
  const status = getInstallStatus();
  if (status.isStandalone) {
    return `
      <button type="button" class="btn btn-ghost ${block ? 'btn-block' : ''} install-app-btn is-installed" id="${id}" data-install-btn disabled>
        ✓ App instalado neste dispositivo
      </button>`;
  }
  const text = label || (status.canNativeInstall ? '⬇ Instalar aplicativo' : '⬇ Instalar no celular ou PC');
  const cls = variant === 'card' ? 'install-app-card' : `btn btn-${variant} ${block ? 'btn-block' : ''} install-app-btn`;
  if (variant === 'card') {
    return `
      <button type="button" class="${cls}" id="${id}" data-install-btn>
        <img src="${ICON_SRC}" alt="" width="44" height="44" />
        <span class="install-app-card__text">
          <strong>Instalar o app DETONA</strong>
          <small>Tela inicial · Android, iPhone e PC</small>
        </span>
        <span class="install-app-card__cta">Instalar</span>
      </button>`;
  }
  return `
    <button type="button" class="${cls}" id="${id}" data-install-btn>
      ${text}
    </button>`;
}

export function bindInstallButtons(root = document) {
  root.querySelectorAll('[data-install-btn]').forEach((btn) => {
    if (btn.dataset.boundInstall === '1') return;
    btn.dataset.boundInstall = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      promptInstallApp();
    });
  });
}

function refreshInstallUi() {
  // Atualiza labels de botões já na tela
  document.querySelectorAll('[data-install-btn]').forEach((btn) => {
    const status = getInstallStatus();
    if (status.isStandalone) {
      btn.disabled = true;
      btn.classList.add('is-installed');
      if (!btn.classList.contains('install-app-card')) {
        btn.textContent = '✓ App instalado neste dispositivo';
      }
    }
  });
  const status = getInstallStatus();
  if (status.isStandalone) hideInstallBanner(true);
}
