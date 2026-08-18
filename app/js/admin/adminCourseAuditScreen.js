import { courseFactoryPreviewService, PC_BA_CONTEST_ID } from '../services/courseFactoryPreviewService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminCourseAuditScreen(root, ctx) {
  if (ctx.adminSelectedContestId !== PC_BA_CONTEST_ID) {
    root.innerHTML = '<section class="admin-panel admin-empty"><h1>Auditoria do curso</h1><p>O curso publicado permanece preservado.</p></section>';
    return;
  }
  const manifest = await courseFactoryPreviewService.loadManifest();
  const stats = manifest.stats;
  const checks = [
    ['Identidades canônicas', manifest.metadata.contest_id === PC_BA_CONTEST_ID && manifest.metadata.position_id === 'pc_ba_2026_investigador_policia_civil' && manifest.metadata.offering_id === 'pc_ba_2026_investigador'],
    ['14 disciplinas', manifest.counts.discipline === 14],
    ['161 tópicos', manifest.counts.topic === 161],
    ['296 subtópicos', manifest.counts.subtopic === 296],
    ['Questões vinculadas', stats.questions_unlinked === 0],
    ['Questões sem duplicidade', stats.questions_duplicated === 0],
    ['Publicação bloqueada', true],
  ];
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Course Factory · Auditoria</span><h1>Integridade da PC BA</h1>
      <p>Inconsistências são exibidas sem ocultação. Esta auditoria não grava dados.</p></div></header>
    <section class="admin-grid admin-grid--2">
      <article class="admin-panel"><span class="admin-panel__eyebrow">Checklist</span><h2>${checks.every(([, passed]) => passed) ? 'Fundação íntegra' : 'Existem pendências'}</h2>
        <dl class="admin-status-list">${checks.map(([label, passed]) => `<div><dt>${escapeHtml(label)}</dt><dd class="${passed ? 'is-ok' : ''}">${passed ? 'APROVADO' : 'PENDENTE'}</dd></div>`).join('')}</dl>
      </article>
      <article class="admin-panel"><span class="admin-panel__eyebrow">Banco</span><h2>${stats.questions_found} questões encontradas</h2>
        <dl class="admin-status-list">
          <div><dt>Válidas</dt><dd class="is-ok">${stats.questions_valid}</dd></div>
          <div><dt>Inválidas</dt><dd>${stats.questions_invalid}</dd></div>
          <div><dt>Duplicadas</dt><dd>${stats.questions_duplicated}</dd></div>
          <div><dt>Sem vínculo</dt><dd>${stats.questions_unlinked}</dd></div>
        </dl>
      </article>
    </section>`;
}
