import { adminCurriculumService } from '../services/adminCurriculumService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminCurriculumScreen(root, ctx) {
  const data = await adminCurriculumService.listNodes(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Estrutura editorial</span><h1>Editais e conteúdos</h1>
      <p>Hierarquia independente do progresso dos alunos.</p></div></header>
    ${data.writable ? '' : '<div class="admin-prepared">Estrutura administrativa ainda não publicada. Exibindo o edital estático em modo somente-leitura.</div>'}
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Ordem</th><th>Disciplina</th><th>Itens</th><th>Status</th></tr></thead><tbody>
      ${data.rows.map((node) => `<tr><td>${node.order_index}</td><td><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(node.description || '')}</small></td>
        <td>${node.child_count ?? '—'}</td><td><span class="admin-badge">${escapeHtml(node.status)}</span></td></tr>`).join('')
        || '<tr><td colspan="4">Conteúdo ainda não cadastrado para este concurso.</td></tr>'}
    </tbody></table></div>`;
}
