import { escapeHtml } from '../helpers.js';

const VALID_SIZES = new Set(['small', 'medium', 'large']);
const VALID_STATES = new Set(['earned', 'locked', 'current']);

export function emblemArt(insignia = {}, {
  className = '',
  size = 'medium',
  state = insignia.state || 'earned',
} = {}) {
  const safeSize = VALID_SIZES.has(size) ? size : 'medium';
  const safeState = VALID_STATES.has(state) ? state : 'earned';
  const category = insignia.categoryName || insignia.category || 'Insígnia';
  const tier = Number(insignia.tier) || 1;
  const label = `${category}: ${insignia.name || 'Insígnia'}, estágio ${tier}`;
  const asset = insignia.asset || `assets/insignias/${insignia.category}-tier-${String(tier).padStart(2, '0')}.webp`;
  return `<span class="insignia-art insignia-art--${safeSize} is-${safeState} ${escapeHtml(className)}"
    role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
    <img src="${escapeHtml(asset)}" alt="" width="256" height="256" loading="lazy" decoding="async" draggable="false" />
  </span>`;
}

export const insigniaArt = emblemArt;
