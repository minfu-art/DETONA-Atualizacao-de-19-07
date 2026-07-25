import { adminCurriculumService } from '../services/adminCurriculumService.js';
import { adminQuestionService, parseQuestionItems, validateEditorialBatch } from '../services/adminQuestionService.js';
import { escapeHtml } from '../ui/helpers.js';

async function readFiles(files) {
  const questions = [];
  for (const file of files) {
    if (file.size > 2_000_000) throw new Error(`${file.name}: arquivo maior que 2 MB.`);
    questions.push(...parseQuestionItems(await file.text()));
  }
  return questions;
}

export async function renderAdminQuestionsScreen(root, ctx) {
  const [summary, curriculum, batches, questionList] = await Promise.all([
    adminQuestionService.getPublishedSummary(ctx.adminSelectedContestId),
    adminCurriculumService.listNodes(ctx.adminSelectedContestId),
    adminQuestionService.listBatches(ctx.adminSelectedContestId).catch(() => ({ batches: [] })),
    adminQuestionService.listQuestions(ctx.adminSelectedContestId).catch(() => ({ questions: [] })),
  ]);
  const subtopicIds = curriculum.rows.filter(({ type }) => type === 'subtopic').map((node) => node.source_id || node.id);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica · Questões</span><h1>Banco editorial por concurso</h1>
      <p>Valide, importe e revise lotes isolados antes de gerar uma versão publicada.</p></div></header>
    <section class="admin-metrics">
      <article class="admin-metric admin-metric--orange"><span>Publicadas</span><strong>${summary.count}</strong></article>
      <article class="admin-metric"><span>Rascunhos listados</span><strong>${questionList.questions.length}</strong></article>
      <article class="admin-metric"><span>Lotes</span><strong>${batches.batches.length}</strong></article>
      <article class="admin-metric"><span>Subtópicos válidos</span><strong>${subtopicIds.length}</strong></article>
    </section>
    <section class="admin-grid admin-grid--2">
      <form id="admin-question-import" class="admin-panel admin-form">
        <span class="admin-panel__eyebrow">Importação segura</span><h2>Validar lote JSON</h2>
        <label>Nome do lote<input name="batchName" maxlength="160" value="Lote ${new Date().toLocaleDateString('pt-BR')}"></label>
        <label>Arquivos JSON<input name="files" type="file" accept=".json,application/json" multiple></label>
        <label>Ou cole o JSON<textarea name="payload" rows="13" placeholder='{"questions":[...]}'></textarea></label>
        <div class="admin-form__actions">
          <button class="admin-button" type="submit">Validar lote</button>
          <button class="admin-button admin-button--secondary" id="question-import" type="button" disabled>Importar como rascunho</button>
        </div>
        <div id="admin-question-validation" role="status" aria-live="polite"></div>
      </form>
      <article class="admin-panel">
        <span class="admin-panel__eyebrow">Fluxo editorial</span><h2>Lotes recentes</h2>
        <ol class="admin-steps"><li class="is-active">Rascunho</li><li>Revisão técnica</li><li>Aprovado</li><li>Snapshot</li><li>Publicado</li></ol>
        <div class="admin-message-list">${batches.batches.map((batch) => `<article><span>${escapeHtml(batch.status)}</span>
          <strong>${escapeHtml(batch.name)}</strong><small>${batch.item_count} questões · ${escapeHtml(batch.id)}</small></article>`).join('')
          || '<div class="admin-prepared">Nenhum lote importado neste concurso.</div>'}</div>
      </article>
    </section>
    <section class="admin-panel">
      <div class="admin-toolbar"><input id="question-search" type="search" placeholder="Buscar por ID ou enunciado" aria-label="Buscar questões">
        <select id="question-status" aria-label="Filtrar estado"><option value="">Todos os estados</option>
          ${['draft', 'technical_review', 'approved', 'published', 'archived'].map((status) => `<option>${status}</option>`).join('')}</select>
        <button class="admin-button" id="question-filter" type="button">Filtrar</button></div>
      <div id="question-list" class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ID</th><th>Enunciado</th><th>Status</th><th>Versão</th></tr></thead><tbody>
        ${questionList.questions.map((question) => `<tr><td>${escapeHtml(question.source_question_id || question.id)}</td>
          <td>${escapeHtml(question.statement || '')}</td><td>${escapeHtml(question.status)}</td><td>${question.version || 1}</td></tr>`).join('')
          || '<tr><td colspan="4">Nenhuma questão editorial neste concurso.</td></tr>'}</tbody></table></div>
    </section>`;
  const form = root.querySelector('#admin-question-import');
  const output = root.querySelector('#admin-question-validation');
  const importButton = root.querySelector('#question-import');
  let validation = null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const fileItems = await readFiles([...form.elements.files.files]);
      const pasted = form.elements.payload.value.trim() ? parseQuestionItems(form.elements.payload.value) : [];
      validation = validateEditorialBatch([...fileItems, ...pasted], {
        contestId: ctx.adminSelectedContestId,
        knownSubtopicIds: subtopicIds,
        knownIds: questionList.questions.map((question) => question.source_question_id),
      });
      importButton.disabled = !validation.valid;
      output.innerHTML = validation.valid
        ? `<div class="admin-validation admin-validation--ok"><strong>${validation.total} questões válidas.</strong>${validation.warnings.map((warning) => `<small>${escapeHtml(warning)}</small>`).join('')}</div>`
        : `<div class="admin-validation admin-validation--error"><strong>${validation.errors.length} erro(s).</strong>${validation.errors.slice(0, 30).map((error) => `<small>${escapeHtml(error)}</small>`).join('')}</div>`;
    } catch (error) {
      validation = null;
      importButton.disabled = true;
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
  importButton.addEventListener('click', async () => {
    if (!validation?.valid) return;
    try {
      const result = await adminQuestionService.importDraft(ctx.adminSelectedContestId, validation.questions, {
        batchName: form.elements.batchName.value,
        knownSubtopicIds: subtopicIds,
      });
      output.innerHTML = `<div class="admin-validation admin-validation--ok">Lote ${escapeHtml(result.batchId)} importado com ${result.imported} questões.</div>`;
      await renderAdminQuestionsScreen(root, ctx);
    } catch (error) {
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
  root.querySelector('#question-filter').addEventListener('click', async () => {
    const result = await adminQuestionService.listQuestions(ctx.adminSelectedContestId, {
      search: root.querySelector('#question-search').value,
      status: root.querySelector('#question-status').value,
    });
    root.querySelector('#question-list tbody').innerHTML = result.questions.map((question) => `<tr><td>${escapeHtml(question.source_question_id)}</td>
      <td>${escapeHtml(question.statement || '')}</td><td>${escapeHtml(question.status)}</td><td>${question.version || 1}</td></tr>`).join('')
      || '<tr><td colspan="4">Nenhuma questão encontrada.</td></tr>';
  });
}
