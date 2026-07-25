import {
  CONTEST_VISUAL_TYPES,
  adminAvatarService,
  precheckMediaFile,
  validateMediaFile,
} from '../services/adminAvatarService.js';
import { escapeHtml } from '../ui/helpers.js';

const LABELS = Object.freeze({
  battle_avatar: 'Avatar principal da batalha',
  success: 'Reação de acerto',
  error: 'Reação de erro',
  attention: 'Reação de atenção',
  cover: 'Capa do concurso',
});

const COLUMN = Object.freeze({
  battle_avatar: 'battle_avatar_asset_id',
  success: 'success_asset_id',
  error: 'error_asset_id',
  attention: 'attention_asset_id',
  cover: 'cover_media_asset_id',
});

export async function renderAdminMediaScreen(root, ctx) {
  const current = await adminAvatarService.listContestAssets(ctx.adminSelectedContestId).catch(() => ({
    assets: [], visual: {}, capabilities: {},
  }));
  const assets = new Map(current.assets.map((asset) => [asset.id, asset]));
  const visual = Object.fromEntries(CONTEST_VISUAL_TYPES.map((type) => [type, current.visual?.[COLUMN[type]] || null]));
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica · Aparência</span><h1>Identidade da batalha</h1>
      <p>Configure somente o avatar principal, três reações e a capa deste concurso.</p></div></header>
    <section class="admin-visual-grid">
      ${CONTEST_VISUAL_TYPES.map((type) => {
        const asset = assets.get(visual[type]);
        return `<article class="admin-panel admin-visual-card" data-visual-type="${type}">
          <span class="admin-panel__eyebrow">${escapeHtml(type)}</span><h2>${escapeHtml(LABELS[type])}</h2>
          <div class="admin-visual-preview">${asset?.preview_url
            ? `<img src="${escapeHtml(asset.preview_url)}" alt="Prévia de ${escapeHtml(LABELS[type])}">`
            : '<span>Nenhuma arte selecionada</span>'}</div>
          <label class="admin-button admin-button--secondary">Escolher PNG/WebP<input type="file" accept="image/png,image/webp" hidden></label>
          <small>${type === 'cover' ? 'Capa pode ser opaca.' : 'Transparência real obrigatória.'}</small>
          <div role="status" class="admin-visual-feedback"></div>
        </article>`;
      }).join('')}
    </section>
    <section class="admin-panel admin-form__actions">
      <button class="admin-button admin-button--secondary" id="visual-save" type="button">Salvar rascunho</button>
      <button class="admin-button" id="visual-publish" type="button">Publicar aparência</button>
      <span id="visual-status" role="status">Estado: ${escapeHtml(current.visual?.visual_status || 'draft')}</span>
    </section>
    <section class="admin-panel"><h2>Assets deste concurso</h2>
      <div class="admin-media-library">${current.assets.map((asset) => `<article>
        ${asset.preview_url ? `<img src="${escapeHtml(asset.preview_url)}" alt="">` : ''}
        <small>${asset.width}×${asset.height} · ${Math.round(asset.byte_size / 1024)} KB</small>
        <strong>${escapeHtml(asset.status)}</strong>
        ${asset.status === 'draft' ? `<button type="button" data-remove-asset="${asset.id}">Remover rascunho</button>` : ''}
      </article>`).join('') || '<div class="admin-prepared">Nenhum asset enviado.</div>'}</div>
    </section>`;

  root.querySelectorAll('[data-visual-type]').forEach((card) => {
    const type = card.dataset.visualType;
    const input = card.querySelector('input[type=file]');
    const feedback = card.querySelector('.admin-visual-feedback');
    input.addEventListener('change', async () => {
      const [file] = input.files;
      if (!file) return;
      try {
        precheckMediaFile(file);
        feedback.textContent = 'Validando e enviando…';
        const local = await validateMediaFile(file, { requireTransparency: type !== 'cover' });
        const asset = await adminAvatarService.uploadContestAsset(ctx.adminSelectedContestId, type, file, {
          requireTransparency: type !== 'cover',
        });
        visual[type] = asset.id;
        card.querySelector('.admin-visual-preview').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Prévia de ${escapeHtml(LABELS[type])}">`;
        feedback.innerHTML = `<div class="admin-validation admin-validation--ok">${local.width}×${local.height}px validado localmente e novamente no backend.</div>`;
      } catch (error) {
        feedback.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
      }
    });
  });
  const save = async (publish) => {
    const status = root.querySelector('#visual-status');
    try {
      await adminAvatarService.saveContestVisual(ctx.adminSelectedContestId, visual, { publish });
      status.textContent = publish ? 'Estado: published' : 'Estado: draft';
    } catch (error) {
      status.textContent = error.message;
    }
  };
  root.querySelector('#visual-save').addEventListener('click', () => save(false));
  root.querySelector('#visual-publish').addEventListener('click', () => save(true));
  root.querySelectorAll('[data-remove-asset]').forEach((button) => button.addEventListener('click', async () => {
    if (!globalThis.confirm?.('Remover este asset ainda não publicado?')) return;
    await adminAvatarService.removeDraftAsset(ctx.adminSelectedContestId, button.dataset.removeAsset);
    await renderAdminMediaScreen(root, ctx);
  }));
}
