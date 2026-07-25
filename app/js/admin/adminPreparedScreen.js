import { escapeHtml } from '../ui/helpers.js';

const COPY = Object.freeze({
  contests: ['Concursos', 'Catálogo, publicação e estados comerciais'],
  curriculum: ['Editais e conteúdos', 'Estrutura editorial por disciplina, tópico e subtópico'],
  questions: ['Banco de questões', 'Fluxo editorial, revisão e publicação versionada'],
  media: ['Avatares e mídia', 'Coleções, estágios e ativos publicados'],
  landing: ['Landing pages', 'Editor seguro por blocos e versões'],
  commercial: ['Comercial', 'Produtos, preços, promoções e pedidos'],
  analytics: ['Analytics', 'Indicadores agregados e anonimizados'],
  settings: ['Configurações', 'Parâmetros tipados da plataforma'],
  audit: ['Auditoria', 'Registro sanitizado de operações críticas'],
});

export function renderAdminPreparedScreen(root, ctx, screen) {
  const [title, description] = COPY[screen] || ['Módulo administrativo', ''];
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Painel Central</span><h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p></div></header>
    <section class="admin-panel admin-empty">
      <span class="admin-empty__icon" aria-hidden="true">◇</span>
      <h2>Preparado para a próxima fase</h2>
      <p>A fundação está separada da jornada acadêmica e usa o contexto administrativo
      <code>${escapeHtml(ctx.adminSelectedContestId)}</code>. Nenhuma operação foi simulada.</p>
    </section>`;
}
