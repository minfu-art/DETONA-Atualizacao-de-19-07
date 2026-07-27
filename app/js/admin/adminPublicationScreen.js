import { adminPublicationService } from '../services/adminPublicationService.js';
import { escapeHtml } from '../ui/helpers.js';

const LABELS = Object.freeze({
  general: 'Dados gerais',
  curriculum: 'Currículo',
  questions: 'Questões',
  appearance: 'Aparência',
  version: 'Versão editorial',
});

export function packageActionsForStatus(status) {
  return Object.freeze({
    preview: true,
    publish: status === 'generated',
    unpublish: status === 'published',
    restore: ['archived', 'rolled_back'].includes(status),
  });
}

export async function renderAdminPublicationScreen(root, ctx) {
  const [validation, history] = await Promise.all([
    adminPublicationService.validate(ctx.adminSelectedContestId).catch(() => ({ ready: false, checklist: {} })),
    adminPublicationService.list(ctx.adminSelectedContestId).catch(() => ({ packages: [] })),
  ]);
  const selectedContest = ctx.availableContests.find(({ id }) => id === ctx.adminSelectedContestId);
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica · Publicação</span><h1>Pacote de conteúdo</h1>
      <p>Valide, gere uma versão imutável, confira a prévia e só então publique.</p></div></header>
    <section class="admin-grid admin-grid--2">
      <article class="admin-panel"><span class="admin-panel__eyebrow">Checklist</span><h2>${validation.ready ? 'Pronto para gerar' : 'Existem pendências'}</h2>
        <dl class="admin-status-list">${Object.entries(LABELS).map(([key, label]) => `<div><dt>${label}</dt>
          <dd class="${validation.checklist?.[key] ? 'is-ok' : ''}">${validation.checklist?.[key] ? 'Aprovado' : 'Pendente'}</dd></div>`).join('')}</dl>
      </article>
      <form class="admin-panel admin-form" id="package-generator">
        <span class="admin-panel__eyebrow">Nova versão</span><h2>Gerar pacote imutável</h2>
        <label>Versão<input name="version" value="${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}" required></label>
        <button class="admin-button" type="submit" ${validation.ready ? '' : 'disabled'}>Gerar pacote</button>
        <div id="package-feedback" role="status"></div>
      </form>
    </section>
    <section class="admin-panel"><h2>Histórico de versões</h2>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Versão</th><th>Hash</th><th>Status</th><th>Criado</th><th>Ações</th></tr></thead><tbody>
      ${history.packages.map((item) => {
        const actions = packageActionsForStatus(item.status);
        return `<tr><td>${escapeHtml(item.version)}</td><td><code>${escapeHtml(item.content_hash.slice(0, 12))}…</code></td>
        <td>${escapeHtml(item.status)}${item.status === 'published' ? '<strong class="admin-current-version">Versão atualmente publicada</strong>' : ''}</td>
        <td>${new Date(item.created_at).toLocaleString('pt-BR')}</td><td>
          <button type="button" class="admin-button admin-button--small admin-button--secondary" data-preview-package="${item.id}">Prévia</button>
          ${actions.publish ? `<button type="button" class="admin-button admin-button--small" data-publish-package="${item.id}">Publicar</button>` : ''}
          ${actions.unpublish ? `<button type="button" class="admin-button admin-button--small admin-button--danger" data-unpublish-package="${item.id}">Retirar do ar</button>` : ''}
          ${actions.restore ? `<button type="button" class="admin-button admin-button--small admin-button--secondary" data-restore-package="${item.id}">Restaurar</button>` : ''}
        </td></tr>`;
      }).join('') || '<tr><td colspan="5">Nenhum pacote gerado.</td></tr>'}
      </tbody></table></div>
      <pre id="package-preview" class="admin-json-preview" tabindex="0"></pre>
    </section>`;
  const feedback = root.querySelector('#package-feedback');
  root.querySelector('#package-generator').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await adminPublicationService.generate(ctx.adminSelectedContestId, new FormData(event.currentTarget).get('version'));
      feedback.innerHTML = `<div class="admin-validation admin-validation--ok">Pacote ${escapeHtml(result.package.version)} gerado.</div>`;
      globalThis.__DETONA_ADMIN?.markSaved?.();
      await renderAdminPublicationScreen(root, ctx);
    } catch (error) {
      feedback.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
  root.querySelectorAll('[data-preview-package]').forEach((button) => button.addEventListener('click', async () => {
    const result = await adminPublicationService.preview(ctx.adminSelectedContestId, button.dataset.previewPackage);
    root.querySelector('#package-preview').textContent = JSON.stringify(result.package, null, 2);
  }));
  root.querySelectorAll('[data-publish-package]').forEach((button) => button.addEventListener('click', async () => {
    const confirmation = globalThis.prompt?.(`Digite ${selectedContest.code} para publicar esta versão:`);
    if (!confirmation) return;
    try {
      await adminPublicationService.publish(ctx.adminSelectedContestId, button.dataset.publishPackage, confirmation);
      await renderAdminPublicationScreen(root, ctx);
    } catch (error) {
      globalThis.alert?.(error.message);
    }
  }));
  root.querySelectorAll('[data-unpublish-package]').forEach((button) => button.addEventListener('click', async () => {
    const confirmation = globalThis.prompt?.(`Digite ${selectedContest.code} para retirar esta versão do ar:`);
    if (!confirmation) return;
    try {
      await adminPublicationService.unpublish(ctx.adminSelectedContestId, button.dataset.unpublishPackage, confirmation);
      await renderAdminPublicationScreen(root, ctx);
    } catch (error) {
      globalThis.alert?.(error.message);
    }
  }));
  root.querySelectorAll('[data-restore-package]').forEach((button) => button.addEventListener('click', async () => {
    const confirmation = globalThis.prompt?.(`Digite ${selectedContest.code} para restaurar esta versão:`);
    if (!confirmation) return;
    try {
      await adminPublicationService.restore(ctx.adminSelectedContestId, button.dataset.restorePackage, confirmation);
      await renderAdminPublicationScreen(root, ctx);
    } catch (error) {
      globalThis.alert?.(error.message);
    }
  }));
}
