import { ADMIN_CONTEST_ID } from '../services/adminAccessService.js';
import { adminStudentService } from '../services/adminStudentService.js';
import { escapeAttr, escapeHtml } from '../ui/helpers.js';

function stateFor(entitlement) {
  if (entitlement?.status === 'active') return ['Ativo', 'revoke', 'Revogar'];
  if (entitlement?.status === 'revoked') return ['Revogado', 'reactivate', 'Reativar'];
  return ['Sem acesso', 'grant', 'Conceder'];
}

export async function renderAdminAccessScreen(root, ctx) {
  if (ctx.adminSelectedContestId !== ADMIN_CONTEST_ID) {
    root.innerHTML = `<header class="admin-page-header"><div><span>Controle de matrícula</span><h1>Alunos e acessos</h1></div></header>
      <div class="admin-prepared">O backend mantém uma allowlist segura somente para PC/AL. Este concurso está preparado para a próxima fase.</div>`;
    return;
  }
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Controle de matrícula</span><h1>Alunos e acessos</h1>
      <p>Conceda, revogue ou reative acesso sem apagar o progresso acadêmico.</p></div></header>
    <form id="admin-student-search" class="admin-toolbar" role="search">
      <input id="admin-student-query" type="search" maxlength="100" placeholder="Pesquisar nome ou e-mail" aria-label="Pesquisar aluno">
      <button class="admin-button" type="submit">Pesquisar</button>
    </form>
    <div id="admin-student-feedback" role="status" aria-live="polite"></div>
    <div id="admin-student-list" class="admin-table-wrap"></div>
    <nav id="admin-student-pages" class="admin-pagination" aria-label="Paginação"></nav>`;

  let page = 1;
  let search = '';
  const pageSize = 20;
  const feedback = root.querySelector('#admin-student-feedback');
  const list = root.querySelector('#admin-student-list');
  const pages = root.querySelector('#admin-student-pages');

  async function load() {
    feedback.textContent = 'Carregando alunos…';
    list.innerHTML = '';
    const result = await adminStudentService.listUsers(ctx.adminSelectedContestId, { search, page, pageSize });
    const users = result?.users || [];
    const total = Number(result?.total || 0);
    feedback.textContent = `${total} aluno${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.`;
    list.innerHTML = `<table class="admin-table"><thead><tr><th>Aluno</th><th>Acesso</th><th>Ação</th></tr></thead><tbody>
      ${users.map((user) => {
        const [label, action, actionLabel] = stateFor(user.entitlement);
        return `<tr data-user-id="${escapeAttr(user.userId)}"><td><strong>${escapeHtml(user.name || 'Sem nome')}</strong><small>${escapeHtml(user.email || 'E-mail indisponível')}</small></td>
          <td><span class="admin-badge admin-badge--${action}">${label}</span></td>
          <td><button type="button" class="admin-button admin-button--small" data-action="${action}">${actionLabel}</button></td></tr>`;
      }).join('') || '<tr><td colspan="3">Nenhum aluno encontrado.</td></tr>'}</tbody></table>`;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    pages.innerHTML = `<button type="button" ${page === 1 ? 'disabled' : ''} data-page="prev">Anterior</button>
      <span>Página ${page} de ${totalPages}</span>
      <button type="button" ${page === totalPages ? 'disabled' : ''} data-page="next">Próxima</button>`;
    list.querySelectorAll('[data-user-id]').forEach((row) => {
      const button = row.querySelector('[data-action]');
      button.addEventListener('click', async () => {
        const user = users.find((item) => item.userId === row.dataset.userId);
        if (button.dataset.action === 'revoke'
          && !globalThis.confirm(`Revogar o acesso de ${user?.name || 'este aluno'}? O progresso será preservado.`)) return;
        button.disabled = true;
        feedback.textContent = 'Atualizando acesso…';
        try {
          if (button.dataset.action === 'grant') await adminStudentService.grant(ctx.adminSelectedContestId, row.dataset.userId);
          else if (button.dataset.action === 'reactivate') await adminStudentService.reactivate(ctx.adminSelectedContestId, row.dataset.userId);
          else await adminStudentService.revoke(ctx.adminSelectedContestId, row.dataset.userId);
          await load();
        } catch (error) {
          feedback.textContent = error.message || 'Falha ao atualizar acesso.';
          button.disabled = false;
        }
      });
    });
  }
  root.querySelector('#admin-student-search').addEventListener('submit', (event) => {
    event.preventDefault();
    search = root.querySelector('#admin-student-query').value.trim();
    page = 1;
    load().catch((error) => { feedback.textContent = error.message; });
  });
  pages.addEventListener('click', (event) => {
    const action = event.target.dataset.page;
    if (!action) return;
    page += action === 'next' ? 1 : -1;
    load().catch((error) => { feedback.textContent = error.message; });
  });
  await load();
}
