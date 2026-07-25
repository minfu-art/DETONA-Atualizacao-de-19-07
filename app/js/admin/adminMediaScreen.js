import { adminAvatarService, validateMediaFile } from '../services/adminAvatarService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminMediaScreen(root, ctx) {
  const data = await adminAvatarService.listCollections(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Biblioteca visual</span><h1>Avatares e mídia</h1>
      <p>Coleções, nove estágios evolutivos e ativos versionados no Supabase Storage.</p></div></header>
    <section class="admin-grid admin-grid--2">
      <form id="admin-media-validator" class="admin-panel admin-form">
        <h2>Validar arquivo</h2>
        <label>PNG ou WebP<input name="asset" type="file" accept="image/png,image/webp" required></label>
        <label><input name="transparency" type="checkbox"> Exigir transparência</label>
        <button class="admin-button" type="submit">Validar arquivo</button>
        <div id="admin-media-result" role="status"></div>
      </form>
      <article class="admin-panel"><h2>Coleções</h2>
        ${data.writable ? `<p>${data.rows.length} coleção(ões) cadastrada(s).</p>` :
          '<div class="admin-prepared">Estrutura preparada para a próxima fase. Nenhum upload será simulado antes da migration e do bucket serem aprovados.</div>'}
      </article>
    </section>`;
  root.querySelector('#admin-media-validator').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const output = root.querySelector('#admin-media-result');
    try {
      const result = validateMediaFile(form.get('asset'), { requireTransparency: Boolean(form.get('transparency')) });
      output.innerHTML = `<div class="admin-validation admin-validation--ok">${escapeHtml(result.name)} · ${(result.size / 1024).toFixed(1)} KB · válido</div>`;
    } catch (error) {
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
}
