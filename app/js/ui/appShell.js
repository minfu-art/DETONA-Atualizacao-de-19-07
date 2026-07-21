import { ICO } from './icons.js?v=66';
import { escapeHtml } from './helpers.js';
import { isDeveloperUser } from '../auth/authService.js';
import { PRIMARY_NAV_ITEMS, UTILITY_NAV_ITEMS, SCREEN_TITLES, primaryScreenFor } from './navigation.js?v=71';

const LIBRARY_ITEM = { screen: 'library', icon: 'book', label: 'Biblioteca' };
const DEVELOPER_ITEM = { screen: 'forge', icon: 'question', label: 'Banco de questões' };

function icon(name) {
  return ICO[name]?.() || '';
}

export function sectionHeader({ eyebrow = '', title, subtitle = '', actions = '' }) {
  return `
    <header class="section-header">
      <div class="section-header__copy">
        ${eyebrow ? `<span class="section-header__eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
        <h1 class="section-header__title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="section-header__subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="section-header__actions">${actions}</div>` : ''}
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
  page.className = `page-container${variant ? ` page-container--${variant}` : ''}`;
  if (header) page.insertAdjacentHTML('beforeend', header);
  if (stats) page.insertAdjacentHTML('beforeend', stats);
  while (root.firstChild) page.appendChild(root.firstChild);
  root.appendChild(page);
  return page;
}

export function desktopGrid(content, { columns = 2, className = '' } = {}) {
  return `<div class="desktop-grid desktop-grid--${columns}${className ? ` ${className}` : ''}">${content}</div>`;
}

function menuButton({ screen, icon: iconName, label }) {
  const developerOnly = screen === 'forge' ? ' data-developer-only="true"' : '';
  return `<button type="button" class="app-sidebar__item" data-shell-screen="${screen}"${developerOnly} aria-label="${label}" title="${label}"><span class="app-sidebar__icon" aria-hidden="true">${icon(iconName)}</span><span class="app-sidebar__label">${label}</span></button>`;
}

export function initAppShell(navigate, { onLogout } = {}) {
  const sidebar = document.getElementById('app-sidebar');
  const topbar = document.getElementById('app-topbar');
  if (!sidebar || !topbar) return;

  sidebar.innerHTML = `
    <div class="app-sidebar__brand" aria-label="Detona Concursos">
      <img class="app-sidebar__mark" src="assets/icons/icon-192.png" alt="" width="42" height="42" decoding="async">
      <span class="app-sidebar__brand-copy"><strong>DETONA</strong><small>CONCURSOS</small></span>
    </div>
    <nav class="app-sidebar__nav" aria-label="Navegação principal">
      ${menuButton(LIBRARY_ITEM)}
      <span class="app-sidebar__section">Jornada ativa</span>
      ${PRIMARY_NAV_ITEMS.map(menuButton).join('')}
      ${menuButton(DEVELOPER_ITEM)}
      ${UTILITY_NAV_ITEMS.length ? `<span class="app-sidebar__section">Conta e equilíbrio</span>${UTILITY_NAV_ITEMS.map(menuButton).join('')}` : ''}
    </nav>
    <button type="button" class="app-sidebar__account" data-shell-screen="profile" aria-label="Abrir meu perfil">${icon('user')}<span>Meu perfil</span></button>
    <button type="button" class="app-sidebar__logout" id="shell-logout">${icon('logout')}<span>Sair da conta</span></button>`;

  topbar.innerHTML = `
    <button type="button" class="app-topbar__contest" data-shell-screen="library" aria-label="Voltar para biblioteca"><small>Jornada ativa</small><strong id="shell-contest">PC/AL 2026</strong></button>
    <div class="app-topbar__stats" aria-label="Status do estudante">
      <span><small>Nível</small><strong id="shell-level">—</strong></span>
      <span><small>XP</small><strong id="shell-xp">—</strong></span>
      <span><small>Sequência</small><strong id="shell-streak">—</strong></span>
    </div>
    <button type="button" class="app-topbar__profile" data-shell-screen="profile" aria-label="Abrir perfil">
      <span id="shell-avatar" aria-hidden="true">D</span>
      <span><small>Perfil</small><strong id="shell-player">Detonador</strong></span>
    </button>`;

  const activate = (event) => {
    const button = event.target.closest('[data-shell-screen]');
    if (button) navigate(button.dataset.shellScreen);
  };
  sidebar.addEventListener('click', activate);
  topbar.addEventListener('click', activate);
  document.getElementById('shell-logout')?.addEventListener('click', () => onLogout?.());
}

export function updateAppShell({ screen, player, contest, user }) {
  const app = document.getElementById('app');
  const root = document.getElementById('screen');
  const immersive = screen === 'onboarding' || screen === 'celebration';
  app?.classList.toggle('app-shell--immersive', immersive);
  if (root) root.dataset.screen = screen;

  const developer = isDeveloperUser(user);
  document.querySelectorAll('[data-developer-only="true"]').forEach((item) => {
    item.hidden = !developer;
    item.setAttribute('aria-hidden', developer ? 'false' : 'true');
  });

  document.querySelectorAll('[data-shell-screen]').forEach((item) => {
    const active = item.dataset.shellScreen === primaryScreenFor(screen);
    item.classList.toggle('active', active);
    if (item.closest('.app-sidebar')) item.setAttribute('aria-current', active ? 'page' : 'false');
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
  setText('shell-contest', contest?.code || 'Biblioteca');
  document.title = `${SCREEN_TITLES[screen] || 'Detona Concursos'} — ${contest?.code || 'DETONA'}`;
}
