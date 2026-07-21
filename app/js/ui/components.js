import { escapeHtml } from './helpers.js';

export function progressBar({ value = 0, label = 'Progresso', tone = 'plasma', detail = '' } = {}) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="ds-progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${safe}">
    <div class="ds-progress__meta"><span>${escapeHtml(label)}</span><strong>${escapeHtml(detail || `${safe}%`)}</strong></div>
    <div class="ds-progress__track"><span class="ds-progress__fill ds-progress__fill--${tone}" style="--progress:${safe}%"></span></div>
  </div>`;
}

export function metricCard({ label, value, detail = '', icon = '', tone = 'plasma' }) {
  return `<article class="ds-metric ds-metric--${tone}">${icon ? `<span class="ds-metric__icon" aria-hidden="true">${icon}</span>` : ''}<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div></article>`;
}

export function statusBadge(label, tone = 'info') {
  return `<span class="ds-badge ds-badge--${tone}"><span aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

export function emptyState({ title, description, action = '' }) {
  return `<div class="ds-empty" role="status"><span class="ds-empty__mark" aria-hidden="true">DT</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action}</div>`;
}

export function skeleton(lines = 3, label = 'Carregando conteudo') {
  return `<div class="ds-skeleton" role="status" aria-label="${escapeHtml(label)}">${Array.from({ length: lines }, (_, index) => `<span style="--skeleton-width:${100 - index * 13}%"></span>`).join('')}</div>`;
}

export function feedbackMessage({ correct, explanation = '', bonus = '' }) {
  const title = correct
    ? 'Resposta dominada.'
    : 'Ótimo. Você acabou de identificar um ponto que ainda pode evoluir. Essa questão foi adicionada automaticamente à sua revisão.';
  return `<div class="ds-feedback ds-feedback--${correct ? 'success' : 'review'}" role="status"><strong>${title}${bonus ? ` ${escapeHtml(bonus)}` : ''}</strong>${explanation ? `<p>${escapeHtml(explanation)}</p>` : ''}</div>`;
}

export function prefersReducedMotion(matchMedia = globalThis.matchMedia) {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function appCard({ content = '', className = '', label = '' } = {}) {
  return `<article class="ds-card${className ? ` ${escapeHtml(className)}` : ''}"${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${content}</article>`;
}

export function gamePanel({ title = '', content = '', tone = 'plasma', className = '' } = {}) {
  return `<section class="ds-game-panel ds-game-panel--${escapeHtml(tone)}${className ? ` ${escapeHtml(className)}` : ''}">${title ? `<header>${escapeHtml(title)}</header>` : ''}<div class="ds-game-panel__body">${content}</div></section>`;
}

export function xpBar({ value = 0, current = 0, target = 0, label = 'Experiência' } = {}) {
  const detail = target ? `${current}/${target} XP` : `${current} XP`;
  return progressBar({ value, label, tone: 'plasma', detail });
}

export function levelBadge(level = 1, label = 'Nível') {
  return `<span class="ds-level-badge" aria-label="${escapeHtml(label)} ${Number(level) || 1}"><small>${escapeHtml(label)}</small><strong>${Number(level) || 1}</strong></span>`;
}

export function masteryBadge({ label = 'Em estudo', value = '', tone = 'plasma' } = {}) {
  return `<span class="ds-mastery ds-mastery--${escapeHtml(tone)}"><strong>${escapeHtml(label)}</strong>${value !== '' ? `<small>${escapeHtml(String(value))}</small>` : ''}</span>`;
}

export function statCard(options) {
  return metricCard(options);
}

export function actionCard({ title, description = '', icon = '', action = '', tone = 'plasma' } = {}) {
  return `<article class="ds-action ds-action--${escapeHtml(tone)}">${icon ? `<span class="ds-action__icon" aria-hidden="true">${icon}</span>` : ''}<div><strong>${escapeHtml(title)}</strong>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>${action}</article>`;
}

export function characterPanel({ image, name = '', role = '', content = '' } = {}) {
  return `<section class="ds-character-panel">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : '<img class="ds-character-panel__placeholder" src="assets/icons/icon-192.png" alt="" width="96" height="96" loading="lazy" decoding="async" aria-hidden="true">'}<div>${name ? `<strong>${escapeHtml(name)}</strong>` : ''}${role ? `<small>${escapeHtml(role)}</small>` : ''}${content}</div></section>`;
}

export function enemyPanel({ image, name = 'Desafio do edital', progress = 0, detail = '' } = {}) {
  return `<section class="ds-enemy-panel">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : '<span aria-hidden="true">ME</span>'}<div><strong>${escapeHtml(name)}</strong>${progressBar({ value: progress, label: 'Conteúdo dominado', tone: 'data', detail })}</div></section>`;
}

export function energyDivider(label = '') {
  return `<div class="ds-energy-divider" role="separator">${label ? `<span>${escapeHtml(label)}</span>` : ''}</div>`;
}

export function errorState({ title = 'Algo saiu do plano', description = 'Tente novamente em instantes.', action = '' } = {}) {
  return `<div class="ds-error" role="alert"><span aria-hidden="true">!</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action}</div>`;
}
