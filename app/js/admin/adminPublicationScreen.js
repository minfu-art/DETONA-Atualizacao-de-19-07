import {
  adminPublicationService,
  validatePackageConfirmation,
} from '../services/adminPublicationService.js';
import { escapeHtml } from '../ui/helpers.js';
import { PC_BA_CONTEST_ID } from '../services/courseFactoryPreviewService.js';

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
  if (ctx.adminSelectedContestId === PC_BA_CONTEST_ID) {
    root.innerHTML = `
      <header class="admin-page-header"><div><span>Course Factory · Publicação</span><h1>PC BA — Investigador publicada</h1>
        <p>Pacote canônico inicial liberado para alunos com acesso ativo.</p></div></header>
      <section class="admin-grid admin-grid--2">
        <article class="admin-panel"><span class="admin-panel__eyebrow">Estado</span><h2>PUBLICADO</h2>
          <dl class="admin-status-list">
            <div><dt>Mapa do edital</dt><dd class="is-ok">296 subtópicos</dd></div>
            <div><dt>Banco inicial</dt><dd class="is-ok">1.267 questões validadas</dd></div>
            <div><dt>Validação do proprietário</dt><dd class="is-ok">Aprovada</dd></div>
            <div><dt>Venda / checkout</dt><dd class="is-ok">R$ 69,90 · Mercado Pago</dd></div>
          </dl>
        </article>
        <article class="admin-panel"><span class="admin-panel__eyebrow">Versão</span><h2>2026.08.17.1</h2>
          <p>Investigador publicado pelo contrato genérico da Course Factory. Escrivão e Delegado permanecem fora desta oferta.</p>
          <button class="admin-button" type="button" disabled>CURSO PUBLICADO</button>
        </article>
      </section>`;
    return;
  }
  const [validation, history] = await Promise.all([
    adminPublicationService.validate(ctx.adminSelectedContestId).catch(() => ({ ready: false, checklist: {} })),
    adminPublicationService.list(ctx.adminSelectedContestId).catch(() => ({ packages: [] })),
  ]);
  const selectedContest = ctx.availableContests.find(({ id }) => id === ctx.adminSelectedContestId);
  const generatedPackage = history.packages.find(({ status }) => status === 'generated');
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
    ${generatedPackage ? `<section class="admin-publication-guide" aria-label="Próximo passo">
      <strong>Pacote pronto para publicar</strong>
      <span>A versão ${escapeHtml(generatedPackage.version)} já foi gerada. Não é necessário gerar novamente sem alterar o conteúdo.</span>
      <span>Na tabela abaixo, clique em <strong>Publicar</strong> e digite exatamente <code>${escapeHtml(selectedContest.code)}</code>.</span>
    </section>` : ''}
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
    </section>
    <dialog class="admin-confirmation-dialog" id="package-confirmation" aria-labelledby="package-confirmation-title">
      <form class="admin-form" id="package-confirmation-form">
        <h2 id="package-confirmation-title">Confirmar ação</h2>
        <p id="package-confirmation-description"></p>
        <label>Digite exatamente <strong id="package-confirmation-code"></strong> para confirmar
          <input name="confirmation" autocomplete="off" required aria-describedby="package-confirmation-hint">
        </label>
        <small id="package-confirmation-hint">A confirmação diferencia letras e espaços. Não digite “aprovo”.</small>
        <div id="package-confirmation-feedback" role="alert"></div>
        <div class="admin-form__actions">
          <button type="button" class="admin-button admin-button--secondary" data-close-confirmation>Cancelar</button>
          <button type="submit" class="admin-button" id="package-confirmation-submit">Confirmar</button>
        </div>
      </form>
    </dialog>`;
  const feedback = root.querySelector('#package-feedback');
  const confirmationDialog = root.querySelector('#package-confirmation');
  const confirmationForm = root.querySelector('#package-confirmation-form');
  const confirmationFeedback = root.querySelector('#package-confirmation-feedback');
  const confirmationSubmit = root.querySelector('#package-confirmation-submit');
  let pendingPackageAction = null;
  const actionCopy = {
    publish: {
      title: 'Publicar pacote',
      description: 'Esta versão ficará disponível tecnicamente para alunos autorizados.',
      submit: 'Publicar',
    },
    unpublish: {
      title: 'Retirar pacote do ar',
      description: 'O conteúdo ficará temporariamente indisponível sem apagar dados ou acessos.',
      submit: 'Retirar do ar',
    },
    restore: {
      title: 'Restaurar pacote',
      description: 'Esta mesma versão e seu hash voltarão a ficar disponíveis.',
      submit: 'Restaurar',
    },
  };
  const openConfirmation = (action, packageId) => {
    const copy = actionCopy[action];
    pendingPackageAction = { action, packageId };
    confirmationForm.reset();
    confirmationFeedback.textContent = '';
    root.querySelector('#package-confirmation-title').textContent = copy.title;
    root.querySelector('#package-confirmation-description').textContent = copy.description;
    root.querySelector('#package-confirmation-code').textContent = selectedContest.code;
    confirmationSubmit.textContent = copy.submit;
    confirmationSubmit.disabled = true;
    confirmationDialog.showModal();
    confirmationForm.elements.confirmation.focus();
  };
  confirmationForm.elements.confirmation.addEventListener('input', (event) => {
    const matches = String(event.currentTarget.value || '').trim() === selectedContest.code;
    confirmationSubmit.disabled = !matches;
    confirmationFeedback.textContent = matches ? '' : `Digite exatamente ${selectedContest.code}.`;
  });
  root.querySelectorAll('[data-close-confirmation]').forEach((button) => button.addEventListener('click', () => {
    pendingPackageAction = null;
    confirmationDialog.close();
  }));
  confirmationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pendingPackageAction) return;
    const { action, packageId } = pendingPackageAction;
    let confirmation;
    try {
      confirmation = validatePackageConfirmation(
        new FormData(confirmationForm).get('confirmation'),
        selectedContest.code,
      );
    } catch (error) {
      confirmationFeedback.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
      return;
    }
    confirmationSubmit.disabled = true;
    confirmationFeedback.textContent = '';
    try {
      if (action === 'publish') {
        await adminPublicationService.publish(ctx.adminSelectedContestId, packageId, confirmation);
      } else if (action === 'unpublish') {
        await adminPublicationService.unpublish(ctx.adminSelectedContestId, packageId, confirmation);
      } else {
        await adminPublicationService.restore(ctx.adminSelectedContestId, packageId, confirmation);
      }
      pendingPackageAction = null;
      confirmationDialog.close();
      await renderAdminPublicationScreen(root, ctx);
    } catch (error) {
      confirmationFeedback.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    } finally {
      confirmationSubmit.disabled = false;
    }
  });
  root.querySelector('#package-generator').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    feedback.innerHTML = '<div class="admin-validation">Gerando pacote com segurança…</div>';
    try {
      const result = await adminPublicationService.generate(ctx.adminSelectedContestId, new FormData(event.currentTarget).get('version'));
      globalThis.__DETONA_ADMIN?.markSaved?.();
      await renderAdminPublicationScreen(root, ctx);
      const currentFeedback = root.querySelector('#package-feedback');
      const message = result.reused
        ? `O pacote ${result.package.version} já existia e foi reutilizado. Clique em Publicar no histórico.`
        : `Pacote ${result.package.version} gerado. Clique em Publicar no histórico.`;
      currentFeedback.innerHTML = `<div class="admin-validation admin-validation--ok">${escapeHtml(message)}</div>`;
    } catch (error) {
      feedback.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
      submitButton.disabled = false;
    }
  });
  root.querySelectorAll('[data-preview-package]').forEach((button) => button.addEventListener('click', async () => {
    const result = await adminPublicationService.preview(ctx.adminSelectedContestId, button.dataset.previewPackage);
    root.querySelector('#package-preview').textContent = JSON.stringify(result.package, null, 2);
  }));
  root.querySelectorAll('[data-publish-package]').forEach((button) => button.addEventListener('click', async () => {
    openConfirmation('publish', button.dataset.publishPackage);
  }));
  root.querySelectorAll('[data-unpublish-package]').forEach((button) => button.addEventListener('click', async () => {
    openConfirmation('unpublish', button.dataset.unpublishPackage);
  }));
  root.querySelectorAll('[data-restore-package]').forEach((button) => button.addEventListener('click', async () => {
    openConfirmation('restore', button.dataset.restorePackage);
  }));
}
