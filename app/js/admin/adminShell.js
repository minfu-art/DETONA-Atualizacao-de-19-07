import { escapeHtml } from '../ui/helpers.js';

export const ADMIN_NAV_ITEMS = Object.freeze([
  ['overview', 'Visão geral'],
  ['contests', 'Concursos'],
  ['curriculum', 'Editais e conteúdos'],
  ['questions', 'Banco de questões'],
  ['media', 'Avatares e mídia'],
  ['students', 'Alunos e acessos'],
  ['messages', 'Mensagens'],
  ['landing', 'Landing pages'],
  ['commercial', 'Comercial'],
  ['analytics', 'Analytics'],
  ['settings', 'Configurações'],
  ['audit', 'Auditoria'],
]);

const ICONS = Object.freeze({
  overview: '◫', contests: '◆', curriculum: '≡', questions: '?', media: '◉',
  students: '♙', messages: '✦', landing: '▱', commercial: '$', analytics: '⌁',
  settings: '⚙', audit: '✓',
});

export function mountAdminShell({ ctx, navigate, onLogout }) {
  const sidebar = document.getElementById('admin-sidebar');
  const topbar = document.getElementById('admin-topbar');
  if (!sidebar || !topbar) return;
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

  sidebar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-screen]');
    if (button) {
      navigate(button.dataset.adminScreen);
      document.body.classList.remove('admin-menu-open');
    }
  });
  document.getElementById('admin-menu-open')?.addEventListener('click', () => document.body.classList.add('admin-menu-open'));
  document.getElementById('admin-menu-close')?.addEventListener('click', () => document.body.classList.remove('admin-menu-open'));
  document.getElementById('admin-logout')?.addEventListener('click', onLogout);
  document.getElementById('admin-contest-select')?.addEventListener('change', (event) => {
    ctx.selectContest(event.target.value);
    navigate(ctx.screen);
  });
}

export function updateAdminShell(screen) {
  document.querySelectorAll('[data-admin-screen]').forEach((item) => {
    const active = item.dataset.adminScreen === screen;
    item.classList.toggle('active', active);
    item.setAttribute('aria-current', active ? 'page' : 'false');
  });
}
