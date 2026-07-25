import { adminSettingsService } from '../services/adminSettingsService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminSettingsScreen(root, ctx) {
  const data = await adminSettingsService.list(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Governança</span><h1>Configurações</h1>
      <p>Chaves permitidas e valores tipados; nenhum JSON livre.</p></div></header>
    ${data.writable ? '' : '<div class="admin-prepared">Consulta homologada; escrita ainda bloqueada. Exibindo valores tipados padrão.</div>'}
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Chave</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>
      ${data.rows.map((setting) => `<tr><td><code>${escapeHtml(setting.key)}</code></td><td>${escapeHtml(setting.type)}</td>
        <td>${escapeHtml(setting.value == null ? 'não configurado' : String(setting.value))}</td></tr>`).join('')}
    </tbody></table></div>`;
}
