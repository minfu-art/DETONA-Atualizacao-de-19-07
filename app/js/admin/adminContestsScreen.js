import {
  adminContestService,
  suggestContestIdentity,
  validateAdminContest,
} from '../services/adminContestService.js';
import { escapeHtml } from '../ui/helpers.js';

export const CONTEST_WORKSPACE_TABS = Object.freeze([
  ['contests', 'Geral'],
  ['curriculum', 'Currículo'],
  ['questions', 'Questões'],
  ['media', 'Aparência'],
  ['students', 'Alunos'],
  ['publication', 'Publicação'],
]);

function contestForm(contest = {}) {
  const value = (key, fallback = '') => escapeHtml(contest[key] ?? fallback);
  return `
    <form id="admin-contest-form" class="admin-panel admin-form">
      <span class="admin-panel__eyebrow">${contest.id ? 'Configuração geral' : 'Novo concurso'}</span>
      <h2>${contest.id ? 'Dados do concurso' : 'Criar concurso em rascunho'}</h2>
      <div class="admin-form__row">
        <label>Código<input name="code" maxlength="30" value="${value('code')}" required></label>
        <label>Data da prova<input name="exam_date" type="date" value="${value('exam_date')}"></label>
      </div>
      <div class="admin-form__row">
        <label>ID<input name="id" maxlength="80" pattern="[A-Za-z0-9_-]+" value="${value('id')}" ${contest.id ? 'readonly' : ''} required></label>
        <label>Slug<input name="slug" maxlength="80" pattern="[A-Za-z0-9_-]+" value="${value('slug')}" required></label>
      </div>
      <label>Nome<input name="name" maxlength="160" value="${value('name')}" required></label>
      <label>Cargo<input name="role" maxlength="160" value="${value('role')}" required></label>
      <label>Descrição<textarea name="description" maxlength="600" rows="4" required>${value('description')}</textarea></label>
      <div class="admin-form__row">
        <label>Preço em centavos<input name="price_cents" type="number" min="0" max="100000000" value="${value('price_cents', 0)}" required></label>
        <label>Moeda<input name="currency" maxlength="3" value="${value('currency', 'BRL')}" required></label>
      </div>
      <div class="admin-form__row">
        <label>Cor principal<input name="color" type="color" value="${value('color', '#7c6af5')}"></label>
        <label>Cor de destaque<input name="accent" type="color" value="${value('accent', '#ff8a1f')}"></label>
      </div>
      <div class="admin-form__row">
        <label>Ícone<input name="icon" maxlength="30" value="${value('icon', contest.code || '')}" required></label>
        <label>Capa publicada<input name="cover_asset" maxlength="500" value="${value('cover_asset')}" placeholder="Caminho do asset (opcional)"></label>
      </div>
      <div class="admin-form__row">
        <label>Conteúdo<select name="content_status">
          ${['draft', 'preparing', 'ready', 'archived'].map((status) => `<option ${contest.content_status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select></label>
        <label>Comercial<select name="sales_status">
          ${['unavailable', 'coming_soon', 'available', 'suspended'].map((status) => `<option ${contest.sales_status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select></label>
      </div>
      <div class="admin-form__actions">
        <button class="admin-button" type="submit">${contest.id ? 'Salvar alterações' : 'Criar rascunho'}</button>
        ${contest.id ? '<button class="admin-button admin-button--secondary" type="button" id="admin-new-contest">Novo concurso</button>' : ''}
      </div>
      <div id="admin-contest-feedback" role="status" aria-live="polite"></div>
    </form>`;
}

function serialize(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export async function renderAdminContestsScreen(root, ctx) {
  const catalog = await adminContestService.listContests();
  const selected = catalog.rows.find(({ id }) => id === ctx.adminSelectedContestId) || null;
  let detail = null;
  if (selected && catalog.writable) detail = await adminContestService.getContest(selected.id).catch(() => null);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica de concursos</span><h1>Workspace operacional</h1>
      <p>Configure um concurso, importe o conteúdo e publique versões sem misturar jornadas.</p></div>
      <button class="admin-button" type="button" id="admin-create-contest">+ Novo concurso</button>
    </header>
    ${selected ? `
      <section class="admin-workspace-header" style="--contest-color:${escapeHtml(selected.color)};--contest-accent:${escapeHtml(selected.accent)}">
        <span class="admin-workspace-icon">${escapeHtml(selected.icon)}</span>
        <div><small>${escapeHtml(selected.code)}</small><h2>${escapeHtml(selected.name)}</h2><p>${escapeHtml(selected.role)}</p></div>
        <dl><div><dt>Currículo</dt><dd>${detail?.counts?.curriculum ?? '—'}</dd></div>
          <div><dt>Questões</dt><dd>${detail?.counts?.questions ?? '—'}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(selected.content_status)}</dd></div></dl>
      </section>
      <nav class="admin-workspace-tabs" aria-label="Áreas do concurso">
        ${CONTEST_WORKSPACE_TABS.map(([screen, label]) => `<button type="button" data-workspace-screen="${screen}" class="${screen === 'contests' ? 'active' : ''}">${label}</button>`).join('')}
      </nav>` : ''}
    <section class="admin-grid admin-grid--2">
      <div id="admin-contest-editor">${contestForm(selected || {})}</div>
      <aside class="admin-panel">
        <span class="admin-panel__eyebrow">Portfólio</span><h2>Concursos cadastrados</h2>
        <div class="admin-contest-list">${catalog.rows.map((contest) => `
          <button type="button" data-select-contest="${escapeHtml(contest.id)}" class="${contest.id === selected?.id ? 'active' : ''}">
            <span style="background:${escapeHtml(contest.color)}">${escapeHtml(contest.icon)}</span>
            <strong>${escapeHtml(contest.code)}</strong><small>${escapeHtml(contest.name)}</small>
          </button>`).join('')}</div>
        ${catalog.writable ? '' : '<div class="admin-prepared">Backend operacional ainda não aplicado no staging; o catálogo está em modo seguro de leitura.</div>'}
      </aside>
    </section>`;

  const mountForm = (contest = {}) => {
    root.querySelector('#admin-contest-editor').innerHTML = contestForm(contest);
    const form = root.querySelector('#admin-contest-form');
    const code = form.elements.code;
    const name = form.elements.name;
    const examDate = form.elements.exam_date;
    const suggest = () => {
      if (contest.id) return;
      const identity = suggestContestIdentity({ code: code.value, name: name.value, exam_date: examDate.value });
      form.elements.id.value = identity.id;
      form.elements.slug.value = identity.slug;
      if (!form.elements.icon.value) form.elements.icon.value = code.value.slice(0, 4).toUpperCase();
    };
    [code, name, examDate].forEach((field) => field.addEventListener('input', suggest));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = form.querySelector('#admin-contest-feedback');
      try {
        const payload = validateAdminContest(serialize(form));
        const result = contest.id
          ? await adminContestService.updateContest(payload)
          : await adminContestService.createContest(payload);
        feedback.innerHTML = `<div class="admin-validation admin-validation--ok">Concurso ${escapeHtml(result.contest.code)} salvo em rascunho com auditoria.</div>`;
        const refreshed = await adminContestService.listContests();
        ctx.setAvailableContests(refreshed.rows);
        ctx.selectContest(result.contest.id);
        globalThis.location?.reload?.();
      } catch (error) {
        feedback.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
      }
    });
    root.querySelector('#admin-new-contest')?.addEventListener('click', () => mountForm());
  };
  mountForm(selected || {});
  root.querySelector('#admin-create-contest')?.addEventListener('click', () => mountForm());
  root.querySelectorAll('[data-select-contest]').forEach((button) => button.addEventListener('click', () => {
    ctx.selectContest(button.dataset.selectContest);
    renderAdminContestsScreen(root, ctx);
  }));
  root.querySelectorAll('[data-workspace-screen]').forEach((button) => button.addEventListener('click', () => {
    globalThis.__DETONA_ADMIN?.navigate?.(button.dataset.workspaceScreen);
  }));
}
