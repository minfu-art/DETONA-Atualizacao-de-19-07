import { adminDashboardService } from '../services/adminDashboardService.js';
import { escapeHtml } from '../ui/helpers.js';

function metric(label, value, tone = '') {
  const display = value == null ? '—' : String(value);
  return `<article class="admin-metric ${tone ? `admin-metric--${tone}` : ''}">
    <span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong>
  </article>`;
}

export async function renderAdminDashboard(root, ctx) {
  root.innerHTML = '<div class="admin-loading" role="status">Carregando indicadores seguros…</div>';
  const data = await adminDashboardService.getSnapshot(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header">
      <div><span>Central de comando</span><h1>Visão geral</h1>
      <p>Indicadores administrativos disponíveis, sem carregar dados acadêmicos da conta developer.</p></div>
    </header>
    <section class="admin-metrics" aria-label="Indicadores administrativos">
      ${metric('Total de alunos', data.totalStudents)}
      ${metric('Alunos ativos', data.activeStudents)}
      ${metric('Acessos ativos no concurso', data.activeAccess, 'violet')}
      ${metric('Concursos cadastrados', data.contests)}
      ${metric('Questões publicadas', data.publishedQuestions, 'orange')}
      ${metric('Questões em revisão', data.reviewQuestions)}
      ${metric('Mensagens publicadas', data.publishedMessages)}
      ${metric('Ações recentes', data.recentActions)}
    </section>
    <section class="admin-grid admin-grid--2">
      <article class="admin-panel"><span class="admin-panel__eyebrow">Infraestrutura</span>
        <h2>Status dos serviços</h2>
        <dl class="admin-status-list">
          <div><dt>Ambiente</dt><dd class="is-ok">${escapeHtml(data.environment)}</dd></div>
          <div><dt>Edge Functions</dt><dd>${escapeHtml(data.edgeStatus)}</dd></div>
          <div><dt>Contexto acadêmico</dt><dd class="is-ok">Não inicializado</dd></div>
        </dl>
      </article>
      <article class="admin-panel"><span class="admin-panel__eyebrow">Atividade</span>
        <h2>Ações administrativas recentes</h2>
        <p class="admin-prepared">A trilha consolidada de auditoria está preparada para a próxima fase. As alterações de acesso continuam registradas em <code>admin_access_audit</code>.</p>
      </article>
    </section>
    ${data.warnings.length ? `<div class="admin-alert" role="status">${data.warnings.map(escapeHtml).join(' · ')}</div>` : ''}`;
}
