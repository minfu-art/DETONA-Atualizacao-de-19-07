import { escapeHtml } from '../ui/helpers.js';
import { adjacentWorkspaceScreen, CONTEST_WORKSPACE_TABS } from './adminWorkspaceNavigation.js';

export const ADMIN_NAV_ITEMS = Object.freeze([
  ['overview', 'Visão geral'],
  ['contests', 'Concursos'],
  ['students', 'Alunos e acessos'],
  ['messages', 'Mensagens'],
  ['settings', 'Configurações'],
  ['events', 'Eventos ranqueados'],
  ['audit', 'Auditoria'],
]);

const ICONS = Object.freeze({
  overview: '◫', contests: '◆', students: '♙', messages: '✦', settings: '⚙', audit: '✓',
  events: '★',
});

let shellOptions = null;

function renderTopbar() {
  const { ctx } = shellOptions;
  const topbar = document.getElementById('admin-topbar');
  if (!topbar) return;
  topbar.innerHTML = `
    <button type="button" class="admin-menu-toggle" id="admin-menu-open" aria-label="Abrir menu">☰</button>
    <label class="admin-contest-selector">
      <span>Concurso administrativo</span>
      <select id="admin-contest-select" aria-label="Selecionar concurso administrativo">
        ${ctx.availableContests.map((contest) => `
          <option value="${escapeHtml(contest.id)}" ${contest.id === ctx.adminSelectedContestId ? 'selected' : ''}>
            ${escapeHtml(contest.code)} — ${escapeHtml(contest.name)}
          </option>`).join('')}
      </select>
    </label>
    <div class="admin-account">
      <span class="admin-status" aria-label="Ambiente de homologação ativo">STAGING</span>
      <span><small>Conta developer</small><strong>${escapeHtml(ctx.user?.name || 'Administrador')}</strong></span>
    </div>`;
  document.getElementById('admin-menu-open')?.addEventListener('click', () => document.body.classList.add('admin-menu-open'));
  document.getElementById('admin-contest-select')?.addEventListener('change', async (event) => {
    const previous = ctx.adminSelectedContestId;
    const changed = await shellOptions.onContestChange(event.target.value);
    if (!changed) event.target.value = previous;
  });
}

function renderWorkspace(screen) {
  const { ctx, navigate } = shellOptions;
  const root = document.getElementById('admin-workspace');
  if (!root) return;
  const contest = ctx.availableContests.find(({ id }) => id === ctx.adminSelectedContestId);
  if (!contest) {
    root.innerHTML = '<div class="admin-alert">Nenhum concurso administrativo disponível.</div>';
    return;
  }
  const index = CONTEST_WORKSPACE_TABS.findIndex((tab) => tab.screen === screen);
  const previous = adjacentWorkspaceScreen(screen, -1);
  const next = adjacentWorkspaceScreen(screen, 1);
  root.innerHTML = `
    <section class="admin-workspace-header" style="--contest-color:${escapeHtml(contest.color)};--contest-accent:${escapeHtml(contest.accent)}">
      <span class="admin-workspace-icon" aria-hidden="true">${escapeHtml(contest.icon)}</span>
      <div class="admin-workspace-title">
        <small>${escapeHtml(contest.code)}</small>
        <h2>${escapeHtml(contest.name)}</h2>
        <p>${escapeHtml(contest.role)}</p>
      </div>
      <dl>
        <div><dt>Ambiente</dt><dd>STAGING</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(contest.content_status)}</dd></div>
      </dl>
    </section>
    <nav class="admin-workspace-tabs" aria-label="Áreas do concurso">
      ${CONTEST_WORKSPACE_TABS.map((tab) => {
        const active = tab.screen === screen;
        return `<button type="button" data-workspace-screen="${tab.screen}" class="${active ? 'active' : ''}" aria-current="${active ? 'page' : 'false'}">${escapeHtml(tab.label)}</button>`;
      }).join('')}
    </nav>
    <div class="admin-workspace-steps" aria-label="Navegação entre etapas">
      <span>${index >= 0 ? `Etapa ${index + 1} de ${CONTEST_WORKSPACE_TABS.length}` : 'Selecione uma etapa do concurso'}</span>
      <div>
        <button type="button" class="admin-button admin-button--secondary" data-workspace-step="${previous || ''}" ${previous ? '' : 'disabled'} aria-label="Etapa anterior">← Anterior</button>
        <button type="button" class="admin-button admin-button--secondary" data-workspace-step="${next || ''}" ${next ? '' : 'disabled'} aria-label="Próxima etapa">Próxima →</button>
      </div>
    </div>`;
  root.querySelectorAll('[data-workspace-screen]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.workspaceScreen));
  });
  root.querySelectorAll('[data-workspace-step]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.workspaceStep) navigate(button.dataset.workspaceStep);
    });
  });
}

export function mountAdminShell(options) {
  shellOptions = options;
  const { navigate, onLogout } = options;
  const sidebar = document.getElementById('admin-sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="admin-brand">
      <img src="assets/icons/icon-192.png" width="44" height="44" alt="">
      <span><strong>DETONA</strong><small>PAINEL CENTRAL</small></span>
    </div>
    <button type="button" class="admin-menu-toggle" id="admin-menu-close" aria-label="Fechar menu">×</button>
    <nav class="admin-nav">
      ${ADMIN_NAV_ITEMS.map(([screen, label]) => `
        <button type="button" data-admin-screen="${screen}" aria-label="${escapeHtml(label)}">
          <span aria-hidden="true">${ICONS[screen]}</span>${escapeHtml(label)}
        </button>`).join('')}
    </nav>
    <div class="admin-sidebar__footer">
      <span>Ambiente</span><strong>STAGING</strong>
      <button type="button" id="admin-logout">Sair da conta</button>
    </div>`;
  sidebar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-screen]');
    if (button) {
      navigate(button.dataset.adminScreen);
      document.body.classList.remove('admin-menu-open');
    }
  });
  document.getElementById('admin-menu-close')?.addEventListener('click', () => document.body.classList.remove('admin-menu-open'));
  document.getElementById('admin-logout')?.addEventListener('click', onLogout);
  renderTopbar();
  renderWorkspace(options.ctx.screen);
}

export function updateAdminShell(screen) {
  if (!shellOptions) return;
  document.querySelectorAll('[data-admin-screen]').forEach((item) => {
    const active = item.dataset.adminScreen === screen;
    item.classList.toggle('active', active);
    item.setAttribute('aria-current', active ? 'page' : 'false');
  });
  renderTopbar();
  renderWorkspace(screen);
}
