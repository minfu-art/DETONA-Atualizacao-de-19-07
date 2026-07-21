/** Helpers de UI compartilhados */
import { icon } from './icons.js?v=66';

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function formatStars(n) {
  const normalized = Math.min(5, Math.max(0, Number(n) || 0));
  return normalized.toFixed(1).replace('.', ',');
}

export function starsHtml(n, max = 5) {
  const normalized = Math.min(max, Math.max(0, Number(n) || 0));
  const parts = [];
  for (let i = 1; i <= max; i++) {
    const fill = normalized - (i - 1);
    const state = fill >= 1 ? 'full' : fill >= 0.5 ? 'half' : 'off';
    parts.push(`<span class="star ${state}" aria-hidden="true">★</span>`);
  }
  return `<span class="stars" role="img" aria-label="${formatStars(normalized)} de ${max} estrelas">${parts.join('')}</span>`;
}

export function toast(msg, ms = 2800) {
  const old = $('.toast');
  if (old) old.remove();
  const t = el(`<div class="toast" role="status" aria-live="polite">${escapeHtml(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

let modalReturnFocus = null;
let modalKeyHandler = null;

export function avatarEmoji(sprite, level) {
  const key = level >= 91 ? 'trophy' : level >= 51 ? 'medal' : level >= 11 ? 'sword' : 'user';
  return icon(key, `ico--avatar-fallback ico--avatar-${sprite === 'female' ? 'female' : 'male'}`);
}

export { enemyEmoji } from './enemyAssets.js';

export function editalBarClass(pct) {
  if (pct >= 100) return 'edital-gold';
  if (pct >= 60) return 'edital-green';
  if (pct >= 30) return 'edital-orange';
  return 'edital-red';
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/** Modal genérico */
export function openModal(title, bodyHtml, actionsHtml = '') {
  closeModal();
  modalReturnFocus = document.activeElement;
  const overlay = el(`
    <div class="modal-overlay" id="modal-root">
      <div class="modal ro-window" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
        <div class="ro-title" id="modal-title">${escapeHtml(title)}</div>
        <div class="ro-body">
          ${bodyHtml}
          ${actionsHtml ? `<div class="mt-12 row gap-8">${actionsHtml}</div>` : ''}
        </div>
      </div>
    </div>
  `);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
  const dialog = overlay.querySelector('[role="dialog"]');
  const focusable = () => [...overlay.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((item) => !item.disabled);
  modalKeyHandler = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) { event.preventDefault(); dialog.focus(); return; }
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', modalKeyHandler);
  requestAnimationFrame(() => (focusable()[0] || dialog).focus());
  return overlay;
}

export function closeModal() {
  $('#modal-root')?.remove();
  if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler);
  modalKeyHandler = null;
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
}

/** Radar canvas */
export function drawRadar(canvas, stats) {
  if (!canvas || !stats?.length) return;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(320, canvas.parentElement?.clientWidth || 300);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const n = stats.length;
  const max = 100;

  ctx.clearRect(0, 0, size, size);

  // grid
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + Math.cos(a) * r * (ring / 4);
      const y = cy + Math.sin(a) * r * (ring / 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(90,122,168,.35)';
    ctx.stroke();
  }

  // axes
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.strokeStyle = 'rgba(90,122,168,.25)';
    ctx.stroke();
  }

  // data
  ctx.beginPath();
  stats.forEach((s, i) => {
    const val = Math.min(max, s.proficiency || 0) / max;
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + Math.cos(a) * r * val;
    const y = cy + Math.sin(a) * r * val;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(64,192,96,.25)';
  ctx.fill();
  ctx.strokeStyle = '#40c060';
  ctx.lineWidth = 2;
  ctx.stroke();

  // labels (abreviado)
  ctx.fillStyle = '#90a8c0';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  stats.forEach((s, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + Math.cos(a) * (r + 18);
    const y = cy + Math.sin(a) * (r + 18);
    const label = (s.icon || '') + (s.name || '').slice(0, 8);
    ctx.fillText(label, x, y + 3);
  });
}
