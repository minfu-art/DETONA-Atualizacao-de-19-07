import { adminQuestionService, validateEditorialBatch } from '../services/adminQuestionService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminQuestionsScreen(root, ctx) {
  const summary = await adminQuestionService.getPublishedSummary(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Operação editorial</span><h1>Banco de questões</h1>
      <p>Validação e preparação de lotes sem alterar o snapshot acadêmico publicado.</p></div></header>
    <section class="admin-metrics" aria-label="Resumo editorial">
      <article class="admin-metric admin-metric--orange"><span>Questões publicadas</span><strong>${summary.count}</strong></article>
      <article class="admin-metric"><span>Arquivos publicados</span><strong>${summary.files}</strong></article>
      <article class="admin-metric"><span>Em revisão editorial</span><strong>—</strong></article>
      <article class="admin-metric"><span>Fonte ativa</span><strong class="admin-metric__text">JSON versionado</strong></article>
    </section>
    <section class="admin-grid admin-grid--2">
      <form id="admin-question-validator" class="admin-panel admin-form">
        <span class="admin-panel__eyebrow">Importação segura</span><h2>Validar lote JSON</h2>
        <label>Questões<textarea name="payload" rows="14" placeholder='[{"id":"q_...","statement":"..."}]' required></textarea></label>
        <button class="admin-button" type="submit">Validar lote</button>
        <div id="admin-question-validation" role="status" aria-live="polite"></div>
      </form>
      <article class="admin-panel">
        <span class="admin-panel__eyebrow">Fluxo controlado</span><h2>Publicação versionada</h2>
        <ol class="admin-steps">
          <li class="is-active">Validar lote</li><li>Importar como rascunho</li>
          <li>Enviar para revisão</li><li>Aprovar</li><li>Gerar snapshot</li><li>Publicar versão</li>
        </ol>
        <div class="admin-prepared">As tabelas e a Edge Function estão preparadas localmente. Importação e publicação permanecem fechadas até a migration ser revisada e aplicada no staging.</div>
      </article>
    </section>`;
  const form = root.querySelector('#admin-question-validator');
  const output = root.querySelector('#admin-question-validation');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const validation = validateEditorialBatch(new FormData(form).get('payload'), {
        contestId: ctx.adminSelectedContestId,
      });
      output.innerHTML = validation.valid
        ? `<div class="admin-validation admin-validation--ok"><strong>Lote válido: ${validation.total} questões.</strong>
           ${validation.warnings.map((warning) => `<small>${escapeHtml(warning)}</small>`).join('')}</div>`
        : `<div class="admin-validation admin-validation--error"><strong>${validation.errors.length} erro(s).</strong>
           ${validation.errors.slice(0, 20).map((error) => `<small>${escapeHtml(error)}</small>`).join('')}</div>`;
    } catch (error) {
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
}
