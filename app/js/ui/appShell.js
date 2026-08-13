import { ICO } from './icons.js?v=66';
import { escapeHtml } from './helpers.js';
import {
  DESKTOP_NAVIGATION_GROUPS,
  MOBILE_MORE_NAVIGATION_GROUPS,
  MOBILE_PRIMARY_ITEMS,
  isMobileSecondaryScreen,
  primaryScreenFor,
  themeForScreen,
  titleForScreen,
} from './navigation.js?v=73';

let shellController = null;

export function shouldDeferMobileMoreNavigation({ fromMore = false, historyActive = false } = {}) {
  return Boolean(fromMore && historyActive);
}

function icon(name) {
  return ICO[name]?.() || '';
}

function navigationButton(item, className, extra = '') {
  const iconClass = className === 'app-sidebar__item' ? 'app-sidebar__icon' : `${className}__icon`;
  const labelClass = className === 'app-sidebar__item' ? 'app-sidebar__label' : `${className}__label`;
  return `<button type="button" class="${className}" data-shell-screen="${escapeHtml(item.screen)}" aria-label="${escapeHtml(item.ariaLabel)}" title="${escapeHtml(item.label)}" ${extra}><span class="${iconClass}" aria-hidden="true">${icon(item.icon)}</span><span class="${labelClass}">${escapeHtml(item.label)}</span></button>`;
}

function desktopNavigation() {
  return DESKTOP_NAVIGATION_GROUPS.map((group) => `
    <section class="app-sidebar__group" data-nav-group="${escapeHtml(group.id)}" aria-labelledby="sidebar-group-${escapeHtml(group.id)}">
      <h2 class="app-sidebar__section" id="sidebar-group-${escapeHtml(group.id)}">${escapeHtml(group.label)}</h2>
      ${group.items.map((item) => navigationButton(item, 'app-sidebar__item')).join('')}
    </section>`).join('');
}

function mobileNavigation() {
  return MOBILE_PRIMARY_ITEMS.map((item) => item.kind === 'menu'
    ? `<button type="button" class="nav-item" id="mobile-more-button" data-mobile-more aria-label="${escapeHtml(item.ariaLabel)}" aria-haspopup="dialog" aria-controls="mobile-more-panel" aria-expanded="false"><span class="nav-ico" aria-hidden="true">${icon(item.icon)}</span><span>${escapeHtml(item.label)}</span></button>`
    : `<button type="button" class="nav-item" data-shell-screen="${escapeHtml(item.screen)}" aria-label="${escapeHtml(item.ariaLabel)}"><span class="nav-ico" aria-hidden="true">${icon(item.icon)}</span><span>${escapeHtml(item.label)}</span></button>`).join('');
}

function mobileMorePanel() {
  return `
    <div class="mobile-more" id="mobile-more" hidden>
      <button type="button" class="mobile-more__backdrop" data-mobile-more-close aria-label="Fechar Mais opções"></button>
      <section class="mobile-more__panel ds-surface ds-surface--secondary" id="mobile-more-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" tabindex="-1">
        <header class="mobile-more__header">
          <div><span class="ds-section-header__eyebrow">Navegação</span><h2 id="mobile-more-title">Mais opções</h2></div>
          <button type="button" class="ds-button ds-button--icon mobile-more__close" data-mobile-more-close aria-label="Fechar Mais opções">×</button>
        </header>
        <div class="mobile-more__body ds-scroll-region">
          ${MOBILE_MORE_NAVIGATION_GROUPS.map((group) => `
            <section class="mobile-more__group" aria-labelledby="mobile-more-group-${escapeHtml(group.id)}">
              <h3 id="mobile-more-group-${escapeHtml(group.id)}">${escapeHtml(group.label)}</h3>
              <div class="mobile-more__items">
                ${group.items.map((item) => navigationButton(item, 'mobile-more__item')).join('')}
              </div>
            </section>`).join('')}
        </div>
        <footer class="mobile-more__footer">
          <button type="button" class="mobile-more__logout ds-button ds-button--ghost" data-mobile-logout>${icon('logout')}<span>Sair da conta</span></button>
        </footer>
      </section>
    </div>`;
}

export function sectionHeader({ eyebrow = '', title, subtitle = '', actions = '' }) {
  return `
    <header class="section-header ds-section-header">
      <div class="section-header__copy ds-section-header__copy">
        ${eyebrow ? `<span class="section-header__eyebrow ds-section-header__eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
        <h1 class="section-header__title ds-section-header__title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="section-header__subtitle ds-section-header__subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="section-header__actions ds-section-header__actions">${actions}</div>` : ''}
    </header>`;
}

export function statsPanel(items) {
  return `
    <section class="stats-panel" aria-label="Resumo">
      ${items.map(({ label, value }) => `
        <div class="stats-panel__item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </div>`).join('')}
    </section>`;
}

export function mountPageContainer(root, { variant = '', header = '', stats = '' } = {}) {
  const page = document.createElement('div');
  page.className = `page-container ds-page${variant ? ` page-container--${variant}` : ''}`;
  if (header) page.insertAdjacentHTML('beforeend', header);
  if (stats) page.insertAdjacentHTML('beforeend', stats);
  while (root.firstChild) page.appendChild(root.firstChild);
  root.appendChild(page);
  return page;
}

export function desktopGrid(content, { columns = 2, className = '' } = {}) {
  return `<div class="desktop-grid desktop-grid--${columns}${className ? ` ${className}` : ''}">${content}</div>`;
}

export function initAppShell(navigate, { onLogout, onActivate } = {}) {
  const sidebar = document.getElementById('app-sidebar');
  const topbar = document.getElementById('app-topbar');
  const bottomNav = document.getElementById('bottom-nav');
  const moreRoot = document.getElementById('mobile-more-root');
  if (!sidebar || !topbar || !bottomNav || !moreRoot) return;

  sidebar.innerHTML = `
    <div class="app-sidebar__brand" aria-label="Detona Concursos">
      <img class="app-sidebar__mark" src="assets/icons/icon-192.png" alt="" width="42" height="42" decoding="async">
      <span class="app-sidebar__brand-copy"><strong>DETONA</strong><small>CONCURSOS</small></span>
    </div>
    <nav class="app-sidebar__nav" aria-label="Navegação principal">${desktopNavigation()}</nav>
    <div class="app-sidebar__session">
      <div class="app-sidebar__active-journey" id="shell-active-journey" hidden>
        <small>JORNADA ATIVA</small>
        <strong id="shell-active-code">—</strong>
        <button type="button" data-shell-screen="home">Entrar na jornada <span aria-hidden="true">→</span></button>
      </div>
      <button type="button" class="app-sidebar__logout" id="shell-logout">${icon('logout')}<span>Sair da conta</span></button>
    </div>`;

  topbar.innerHTML = `
    <button type="button" class="app-topbar__contest" data-shell-screen="library" aria-label="Abrir Biblioteca"><small id="shell-context-label">Jornada ativa</small><strong id="shell-contest">Biblioteca</strong></button>
    <div class="app-topbar__stats" aria-label="Status do estudante">
      <span><small>Nível</small><strong id="shell-level">—</strong></span>
      <span><small>XP</small><strong id="shell-xp">—</strong></span>
      <span><small>Sequência</small><strong id="shell-streak">—</strong></span>
    </div>
    <button type="button" class="app-topbar__profile" data-shell-screen="profile" aria-label="Abrir Perfil">
      <span class="app-topbar__avatar" id="shell-avatar" aria-hidden="true">D</span>
      <span class="app-topbar__identity"><small>Perfil</small><strong id="shell-player">Detonador</strong></span>
    </button>`;

  bottomNav.innerHTML = mobileNavigation();
  moreRoot.innerHTML = mobileMorePanel();

  const more = document.getElementById('mobile-more');
  const morePanel = document.getElementById('mobile-more-panel');
  const moreButton = document.getElementById('mobile-more-button');
  let moreHistoryActive = false;
  let pendingMoreScreen = null;

  const setBackgroundInert = (inert) => {
    [sidebar, topbar, bottomNav, document.getElementById('screen')].forEach((element) => {
      if (element) element.inert = inert;
    });
  };

  const focusableInPanel = () => [...morePanel.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

  const closeMore = ({ restoreFocus = true, fromHistory = false } = {}) => {
    if (more.hidden) return;
    more.hidden = true;
    document.body.classList.remove('has-open-more');
    setBackgroundInert(false);
    moreButton.setAttribute('aria-expanded', 'false');
    if (moreHistoryActive && !fromHistory) {
      moreHistoryActive = false;
      history.back();
    } else if (fromHistory) {
      moreHistoryActive = false;
    }
    if (restoreFocus) moreButton.focus({ preventScroll: true });
  };

  const openMore = () => {
    if (!more.hidden) return;
    more.hidden = false;
    document.body.classList.add('has-open-more');
    setBackgroundInert(true);
    moreButton.setAttribute('aria-expanded', 'true');
    history.pushState({ ...(history.state || {}), detonaMoreMenu: true }, '', location.href);
    moreHistoryActive = true;
    requestAnimationFrame(() => morePanel.querySelector('[data-mobile-more-close]')?.focus({ preventScroll: true }));
  };

  const activateScreen = (button, { fromMore = false } = {}) => {
    if (!button?.dataset.shellScreen) return;
    onActivate?.();
    const screen = button.dataset.shellScreen;
    if (shouldDeferMobileMoreNavigation({ fromMore, historyActive: moreHistoryActive })) {
      pendingMoreScreen = screen;
      closeMore({ restoreFocus: false });
      return;
    }
    if (fromMore) closeMore({ restoreFocus: false });
    navigate(screen);
  };

  const activate = (event) => activateScreen(event.target.closest('[data-shell-screen]'));
  sidebar.addEventListener('click', activate);
  topbar.addEventListener('click', activate);
  bottomNav.addEventListener('click', (event) => {
    const moreTrigger = event.target.closest('[data-mobile-more]');
    if (moreTrigger) {
      onActivate?.();
      openMore();
      return;
    }
    activateScreen(event.target.closest('[data-shell-screen]'));
  });
  more.addEventListener('click', (event) => {
    if (event.target.closest('[data-mobile-more-close]')) closeMore();
    else activateScreen(event.target.closest('[data-shell-screen]'), { fromMore: true });
  });
  morePanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMore();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableInPanel();
    if (!focusable.length) {
      event.preventDefault();
      morePanel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener('popstate', () => {
    if (!more.hidden) closeMore({ fromHistory: true });
    if (pendingMoreScreen) {
      const screen = pendingMoreScreen;
      pendingMoreScreen = null;
      queueMicrotask(() => navigate(screen));
    }
  });
  document.getElementById('shell-logout')?.addEventListener('click', () => onLogout?.());
  more.querySelector('[data-mobile-logout]')?.addEventListener('click', () => {
    closeMore({ restoreFocus: false });
    onLogout?.();
  });

  shellController = { closeMore };
}

export function updateAppShell({ screen, player, contest }) {
  const app = document.getElementById('app');
  const root = document.getElementById('screen');
  const activeScreen = primaryScreenFor(screen);
  const secondaryMobile = isMobileSecondaryScreen(screen);
  const immersive = screen === 'onboarding' || screen === 'celebration';
  shellController?.closeMore({ restoreFocus: false });
  app?.classList.toggle('app-shell--immersive', immersive);
  app?.classList.toggle('app-shell--private-library', screen === 'library');
  if (app) {
    app.dataset.activeScreen = activeScreen;
    app.dataset.theme = themeForScreen(screen);
  }
  if (root) {
    root.dataset.screen = screen;
    root.dataset.theme = themeForScreen(screen);
    root.setAttribute('aria-label', `${titleForScreen(screen)} — conteúdo principal`);
  }

  document.querySelectorAll('.app-sidebar__item[data-shell-screen]').forEach((item) => {
    const active = item.dataset.shellScreen === activeScreen;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  document.querySelectorAll('.app-topbar [data-shell-screen]').forEach((item) => {
    const active = item.dataset.shellScreen === activeScreen;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  document.querySelectorAll('.bottom-nav .nav-item').forEach((item) => {
    const active = item.hasAttribute('data-mobile-more')
      ? secondaryMobile
      : item.dataset.shellScreen === activeScreen;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  document.querySelectorAll('.mobile-more__item[data-shell-screen]').forEach((item) => {
    const active = item.dataset.shellScreen === activeScreen;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  setText('shell-level', player?.level ?? '—');
  setText('shell-xp', player ? `${player.xp || 0}/${player.xp_next_level || '—'}` : '—');
  setText('shell-streak', player ? `${player.streak_days || 0} dias` : '—');
  setText('shell-player', player?.name || 'Detonador');
  setText('shell-avatar', (player?.name || 'D').trim().charAt(0).toUpperCase());
  setText('shell-context-label', screen === 'library' ? 'Área' : 'Jornada ativa');
  setText('shell-contest', screen === 'library' ? 'Biblioteca' : (contest?.code || 'Biblioteca'));
  setText('shell-active-code', contest?.code || '—');
  const activeJourney = document.getElementById('shell-active-journey');
  if (activeJourney) activeJourney.hidden = !(screen === 'library' && contest?.code);
  document.title = `${titleForScreen(screen)} — ${contest?.code || 'DETONA'}`;
  const announcer = document.getElementById('shell-announcer');
  if (announcer) announcer.textContent = `${titleForScreen(screen)} carregado`;
}
