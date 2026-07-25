import {
  ANNOUNCEMENT_CATEGORIES,
  validateAnnouncementInput,
} from '../services/announcementService.js';
import { adminMessageService } from '../services/adminMessageService.js';
import { escapeHtml } from '../ui/helpers.js';

export async function renderAdminMessagesScreen(root, ctx) {
  const rows = await adminMessageService.list(ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Comunicação oficial</span><h1>Mensagens</h1>
      <p>Crie avisos globais ou direcionados ao concurso administrativo selecionado.</p></div></header>
    <section class="admin-grid admin-grid--2">
      <form id="admin-message-form" class="admin-panel admin-form">
        <h2>Nova mensagem</h2>
        <label>Título<input name="title" maxlength="80" required></label>
        <label>Resumo<input name="summary" maxlength="180" required></label>
        <label>Mensagem<textarea name="body" maxlength="4000" rows="7" required></textarea></label>
        <div class="admin-form__row">
          <label>Categoria<select name="category">${ANNOUNCEMENT_CATEGORIES.map((value) => `<option value="${value}">${value}</option>`).join('')}</select></label>
          <label>Prioridade<select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
        </div>
        <label><input type="checkbox" name="contest"> Somente para o concurso selecionado</label>
        <label><input type="checkbox" name="pinned"> Fixar mensagem</label>
        <div id="admin-message-feedback" role="status"></div>
        <div class="admin-form__actions">
          <button class="admin-button admin-button--secondary" type="submit" data-publish="false">Salvar rascunho</button>
          <button class="admin-button" type="submit" data-publish="true">Salvar e publicar</button>
        </div>
      </form>
      <section class="admin-panel"><h2>Mensagens cadastradas</h2>
        <div class="admin-message-list">${rows.map((item) => `
          <article><span>${escapeHtml(item.category)}</span><strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.summary)}</p><small>${item.is_published ? 'Publicada' : 'Rascunho'}${item.archived_at ? ' · Arquivada' : ''}</small>
          ${!item.archived_at ? `<button type="button" data-archive="${item.id}">Arquivar</button>` : ''}</article>`).join('') || '<p>Nenhuma mensagem cadastrada.</p>'}</div>
      </section>
    </section>`;
  let publish = false;
  root.querySelectorAll('[data-publish]').forEach((button) => {
    button.addEventListener('click', () => { publish = button.dataset.publish === 'true'; });
  });
  root.querySelector('#admin-message-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const feedback = root.querySelector('#admin-message-feedback');
    try {
      const payload = validateAnnouncementInput({
        title: form.get('title'), summary: form.get('summary'), body: form.get('body'),
        category: form.get('category'), priority: form.get('priority'),
        audience_type: form.get('contest') ? 'contest' : 'all',
        contest_id: form.get('contest') ? ctx.adminSelectedContestId : null,
        suggestions: [], cta_type: 'none', starts_at: new Date().toISOString(),
        is_pinned: Boolean(form.get('pinned')),
      });
      const saved = await adminMessageService.create(ctx.adminSelectedContestId, payload);
      if (publish) await adminMessageService.publish(ctx.adminSelectedContestId, saved.id);
      await renderAdminMessagesScreen(root, ctx);
    } catch (error) {
      feedback.textContent = error.message || 'Falha ao salvar mensagem.';
    }
  });
  root.querySelectorAll('[data-archive]').forEach((button) => {
    button.addEventListener('click', async () => {
      await adminMessageService.archive(ctx.adminSelectedContestId, button.dataset.archive);
      await renderAdminMessagesScreen(root, ctx);
    });
  });
}
