import { escapeHtml } from '../helpers.js';

const GLYPHS = {
  missions: '<path d="M31 8l5 5-9 9 3 3-4 4-3-3-9 9-5-5 9-9-3-3 4-4 3 3 9-9z"/><circle cx="34" cy="10" r="3"/>',
  focus: '<circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="6"/><path d="M24 4v7M24 37v7M4 24h7M37 24h7"/>',
  consistency: '<path d="M25 5c3 9-5 11 0 18 3-5 8-7 9-13 8 8 9 17 4 25-6 10-23 10-29-1-5-10 1-19 8-25-1 8 4 10 8 14-1-7 6-10 0-18z"/>',
  domain: '<path d="M7 14l10 7 7-13 7 13 10-7-4 25H11L7 14z"/><path d="M13 33h22"/>',
};

export function emblemArt(emblem, { locked = false, className = '' } = {}) {
  const id = `emblem-${String(emblem?.id || 'unknown').replace(/[^a-z0-9_-]/gi, '')}`;
  const category = emblem?.category || 'missions';
  return `<span class="emblem-art ${locked ? 'is-locked' : ''} ${escapeHtml(className)}" title="${escapeHtml(emblem?.name || 'Emblema')}">
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#a855f7"/><stop offset="1" stop-color="#f59e0b"/>
      </linearGradient></defs>
      <path class="emblem-art__shield" d="M24 2l19 8v13c0 12-8 20-19 23C13 43 5 35 5 23V10l19-8z"/>
      <g class="emblem-art__glyph" fill="none" stroke="url(#${id})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[category]}</g>
    </svg>
  </span>`;
}

