import { LANDING_BLOCK_TYPES, adminLandingPageService, validateLandingBlock } from '../services/adminLandingPageService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminLandingScreen(root, ctx) {
  const data = await adminLandingPageService.list(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Presença pública</span><h1>Landing pages</h1>
      <p>Editor seguro por blocos, sem HTML arbitrário e sem alterar produção.</p></div></header>
    <section class="admin-grid admin-grid--2">
      <form id="admin-block-preview" class="admin-panel admin-form">
        <h2>Pré-visualizar bloco</h2>
        <label>Tipo<select name="type">${LANDING_BLOCK_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}</select></label>
        <label>Conteúdo JSON<textarea name="content" rows="9">{"title":"Título da seção","text":"Conteúdo de demonstração"}</textarea></label>
        <button class="admin-button" type="submit">Validar preview</button>
        <div id="admin-block-result" role="status"></div>
      </form>
      <article class="admin-panel"><h2>Páginas cadastradas</h2>
        ${data.writable ? `<p>${data.rows.length} página(s) encontrada(s).</p>` :
          '<div class="admin-prepared">Consulta homologada; escrita ainda bloqueada. A landing page pública não foi alterada.</div>'}
      </article>
    </section>`;
  root.querySelector('#admin-block-preview').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const output = root.querySelector('#admin-block-result');
    try {
      const block = validateLandingBlock({ type: form.get('type'), content: JSON.parse(form.get('content')) });
      output.innerHTML = `<div class="admin-validation admin-validation--ok">Bloco ${escapeHtml(block.type)} válido para preview.</div>`;
    } catch (error) {
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
}
