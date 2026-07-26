import { adminCurriculumService } from '../services/adminCurriculumService.js';
import { escapeHtml } from '../ui/helpers.js';

function treeRows(nodes) {
  const byParent = new Map();
  nodes.forEach((node) => {
    const parent = node.parent_id || node.parent_source_id || 'root';
    byParent.set(parent, [...(byParent.get(parent) || []), node]);
  });
  const rows = [];
  const visit = (parent, depth) => {
    (byParent.get(parent) || []).sort((a, b) => a.order_index - b.order_index).forEach((node) => {
      rows.push({ ...node, depth });
      visit(node.id || node.source_id, depth + 1);
    });
  };
  visit('root', 0);
  return rows.length ? rows : nodes.map((node) => ({ ...node, depth: Math.max(0, ['role', 'discipline', 'topic', 'subtopic'].indexOf(node.type)) }));
}

export async function renderAdminCurriculumScreen(root, ctx) {
  const data = await adminCurriculumService.listNodes(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica · Currículo</span><h1>Edital verticalizado</h1>
      <p>Importe o JSON oficial, valide toda a árvore e grave o rascunho sem tocar em conteúdo publicado.</p></div></header>
    <section class="admin-grid admin-grid--2">
      <form id="admin-curriculum-import" class="admin-panel admin-form">
        <span class="admin-panel__eyebrow">Importação JSON</span><h2>Arquivo ou conteúdo colado</h2>
        <label>Arquivo JSON<input type="file" name="file" accept=".json,application/json"></label>
        <label>Conteúdo<textarea name="payload" rows="15" placeholder='{"schema_version":1,"contest_id":"...","roles":[]}'></textarea></label>
        <div class="admin-form__actions">
          <button class="admin-button" type="submit">Validar</button>
          <button class="admin-button admin-button--secondary" type="button" id="curriculum-import" disabled>Importar rascunho</button>
          <button class="admin-button admin-button--secondary" type="button" id="curriculum-replace" disabled>Substituir rascunho</button>
        </div>
        <div id="curriculum-validation" role="status" aria-live="polite"></div>
      </form>
      <article class="admin-panel">
        <span class="admin-panel__eyebrow">Prévia atual</span><h2>${data.rows.length} nós curriculares</h2>
        <div class="admin-curriculum-tree">${treeRows(data.rows).slice(0, 250).map((node) => `
          <div style="--depth:${node.depth}"><span>${escapeHtml(node.type)}</span><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(node.status || 'draft')}</small></div>`).join('')
          || '<div class="admin-prepared">Nenhum currículo cadastrado.</div>'}</div>
      </article>
    </section>`;
  const form = root.querySelector('#admin-curriculum-import');
  const output = root.querySelector('#curriculum-validation');
  const importButton = root.querySelector('#curriculum-import');
  const replaceButton = root.querySelector('#curriculum-replace');
  let validPayload = null;
  form.elements.file.addEventListener('change', async () => {
    const [file] = form.elements.file.files;
    if (!file) return;
    if (file.size > 2_000_000) {
      output.innerHTML = '<div class="admin-validation admin-validation--error">Arquivo maior que 2 MB.</div>';
      return;
    }
    form.elements.payload.value = await file.text();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      validPayload = form.elements.payload.value;
      const validation = adminCurriculumService.validateImport(validPayload, ctx.adminSelectedContestId);
      const { counts } = validation;
      output.innerHTML = `<div class="admin-validation admin-validation--ok"><strong>Estrutura válida.</strong>
        <small>${counts.roles} cargo(s), ${counts.disciplines} disciplina(s), ${counts.topics} tópico(s), ${counts.subtopics} subtópico(s).</small></div>`;
      importButton.disabled = false;
      replaceButton.disabled = false;
    } catch (error) {
      validPayload = null;
      importButton.disabled = true;
      replaceButton.disabled = true;
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
  const performImport = async (replace) => {
    if (!validPayload) return;
    if (replace && !globalThis.confirm?.('Substituir somente o rascunho curricular deste concurso?')) return;
    try {
      const result = await adminCurriculumService.importDraft(validPayload, ctx.adminSelectedContestId, { replace });
      output.innerHTML = `<div class="admin-validation admin-validation--ok">${result.imported} nós importados de forma transacional.</div>`;
      globalThis.__DETONA_ADMIN?.markSaved?.();
      await renderAdminCurriculumScreen(root, ctx);
    } catch (error) {
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  };
  importButton.addEventListener('click', () => performImport(false));
  replaceButton.addEventListener('click', () => performImport(true));
}
