import { adminContestService } from '../services/adminContestService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminContestsScreen(root) {
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Portfólio</span><h1>Concursos</h1>
      <p>Catálogo administrativo com compatibilidade segura para o catálogo atual do aluno.</p></div></header>
    <form id="admin-contest-search" class="admin-toolbar" role="search">
      <input type="search" aria-label="Pesquisar concursos" placeholder="Código, concurso ou cargo">
      <button class="admin-button" type="submit">Pesquisar</button>
    </form>
    <div id="admin-contests-result"></div>`;
  const result = root.querySelector('#admin-contests-result');
  const form = root.querySelector('#admin-contest-search');
  async function load(search = '') {
    const data = await adminContestService.listContests({ search });
    result.innerHTML = `
      ${data.writable ? '' : '<div class="admin-prepared">Catálogo administrativo ainda não publicado. Exibindo fallback somente-leitura; o catálogo acadêmico não foi alterado.</div>'}
      <div class="admin-card-grid">${data.rows.map((contest) => `
        <article class="admin-panel admin-contest-card">
          <span class="admin-contest-card__code">${escapeHtml(contest.code)}</span>
          <h2>${escapeHtml(contest.name)}</h2><p>${escapeHtml(contest.role)}</p>
          <dl><div><dt>Conteúdo</dt><dd>${escapeHtml(contest.content_status)}</dd></div>
          <div><dt>Comercial</dt><dd>${escapeHtml(contest.sales_status)}</dd></div></dl>
          ${data.writable ? '<button type="button" class="admin-button">Editar</button>' : '<small>Preparado para a próxima fase</small>'}
        </article>`).join('') || '<div class="admin-prepared">Nenhum concurso encontrado.</div>'}</div>`;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    load(form.querySelector('input').value.trim());
  });
  await load();
}
