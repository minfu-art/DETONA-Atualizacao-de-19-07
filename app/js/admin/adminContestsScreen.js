import {
  adminContestService,
  COURSE_FACTORY_UNAVAILABLE_MESSAGE,
  suggestContestIdentity,
  validateAdminContest,
} from '../services/adminContestService.js';
import { escapeHtml } from '../ui/helpers.js';

function contestForm(contest = {}, capabilities = {}) {
  const value = (key, fallback = '') => escapeHtml(contest[key] ?? fallback);
  const requiredCapability = contest.id ? 'update' : 'create';
  const writeEnabled = capabilities?.[requiredCapability] === true;
  return `
    <form id="admin-contest-form" class="admin-panel admin-form">
      <span class="admin-panel__eyebrow">${contest.id ? 'Configuração geral' : 'Novo concurso'}</span>
      <h2>${contest.id ? 'Dados do concurso' : 'Criar concurso em rascunho'}</h2>
      ${writeEnabled ? '' : `<div class="admin-prepared">${COURSE_FACTORY_UNAVAILABLE_MESSAGE}</div>`}
      <fieldset ${writeEnabled ? '' : 'disabled'} data-required-capability="${requiredCapability}">
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
        <button class="admin-button" type="submit" ${writeEnabled ? '' : 'disabled'}>${contest.id ? 'Salvar alterações' : 'Criar rascunho'}</button>
        ${contest.id && capabilities?.create === true ? '<button class="admin-button admin-button--secondary" type="button" id="admin-new-contest">Novo concurso</button>' : ''}
      </div>
      </fieldset>
      <div id="admin-contest-feedback" role="status" aria-live="polite"></div>
    </form>`;
}

function serialize(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export async function renderAdminContestsScreen(root, ctx) {
  const catalog = await adminContestService.listContests();
  const capabilities = catalog.capabilities || {};
  const selected = catalog.rows.find(({ id }) => id === ctx.adminSelectedContestId) || null;
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica de concursos</span><h1>Workspace operacional</h1>
      <p>Configure um concurso, importe o conteúdo e publique versões sem misturar jornadas.</p></div>
      ${capabilities.create === true ? '<button class="admin-button" type="button" id="admin-create-contest">+ Novo concurso</button>' : ''}
    </header>
    <section class="admin-grid admin-grid--2">
      <div id="admin-contest-editor">${contestForm(selected || {}, capabilities)}</div>
      <aside class="admin-panel">
        <span class="admin-panel__eyebrow">Portfólio</span><h2>Concursos cadastrados</h2>
        <div class="admin-contest-list">${catalog.rows.map((contest) => `
          <button type="button" data-select-contest="${escapeHtml(contest.id)}" class="${contest.id === selected?.id ? 'active' : ''}">
            <span style="background:${escapeHtml(contest.color)}">${escapeHtml(contest.icon)}</span>
            <strong>${escapeHtml(contest.code)}</strong><small>${escapeHtml(contest.name)}</small>
          </button>`).join('')}</div>
        ${catalog.writable ? '' : `<div class="admin-prepared">${COURSE_FACTORY_UNAVAILABLE_MESSAGE}</div>`}
      </aside>
    </section>`;

  const mountForm = (contest = {}) => {
    root.querySelector('#admin-contest-editor').innerHTML = contestForm(contest, capabilities);
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
      const requiredCapability = contest.id ? 'update' : 'create';
      if (capabilities[requiredCapability] !== true) {
        feedback.innerHTML = `<div class="admin-validation admin-validation--error">${COURSE_FACTORY_UNAVAILABLE_MESSAGE}</div>`;
        return;
      }
      try {
        const payload = validateAdminContest(serialize(form));
        const result = contest.id
          ? await adminContestService.updateContest(payload, { capabilities })
          : await adminContestService.createContest(payload, { capabilities });
        feedback.innerHTML = `<div class="admin-validation admin-validation--ok">Concurso ${escapeHtml(result.contest.code)} salvo em rascunho com auditoria.</div>`;
        const refreshed = await adminContestService.listContests();
        ctx.setAvailableContests(refreshed.rows);
        globalThis.__DETONA_ADMIN?.markSaved?.();
        await globalThis.__DETONA_ADMIN?.selectContest?.(result.contest.id);
        await globalThis.__DETONA_ADMIN?.navigate?.('contests', { historyMode: 'replace' });
      } catch (error) {
        feedback.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
      }
    });
    root.querySelector('#admin-new-contest')?.addEventListener('click', () => mountForm());
  };
  mountForm(selected || {});
  root.querySelector('#admin-create-contest')?.addEventListener('click', () => mountForm());
  root.querySelectorAll('[data-select-contest]').forEach((button) => button.addEventListener('click', () => {
    globalThis.__DETONA_ADMIN?.selectContest?.(button.dataset.selectContest);
  }));
}
