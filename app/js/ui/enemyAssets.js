/**
 * Inimigos no estilo do avatar (JRPG anime) — PNGs com fundo removido
 */
import { icon } from './icons.js?v=66';
export const ENEMY_SPRITE_FILES = {
  'enemy-1': 'assets/enemies/enemy-1.png',
  'enemy-2': 'assets/enemies/enemy-2.png',
  'enemy-3': 'assets/enemies/enemy-3.png',
  'enemy-4': 'assets/enemies/enemy-4.png',
  'enemy-5': 'assets/enemies/enemy-5.png',
  'enemy-6': 'assets/enemies/enemy-6.png',
  'enemy-7': 'assets/enemies/enemy-7.png',
  'enemy-8': 'assets/enemies/enemy-8.png',
  'enemy-9': 'assets/enemies/enemy-9.png',
  'enemy-10': 'assets/enemies/enemy-10.png',
  'enemy-11': 'assets/enemies/enemy-11.png',
  'enemy-12': 'assets/enemies/enemy-12.png',
  'enemy-13': 'assets/enemies/enemy-13.png',
  'enemy-14': 'assets/enemies/enemy-14.png',
  'enemy-15': 'assets/enemies/enemy-15.png',
  'enemy-16': 'assets/enemies/enemy-16.png',
};

export const ENEMY_COUNT = 16;

// A URL é consumida por uma custom property dentro do CSS e, por isso, é
// resolvida a partir de /css/design-system.css.
export const BATTLE_BG = '../assets/battle/arena-bg.jpg';
export const LEVEL_BADGE = 'assets/ui/level-badge.png';

export function enemySrc(spriteKey) {
  if (spriteKey && ENEMY_SPRITE_FILES[spriteKey]) {
    return ENEMY_SPRITE_FILES[spriteKey] + '?v=3';
  }
  if (/^enemy-/.test(String(spriteKey || ''))) {
    const n = parseInt(String(spriteKey).replace(/\D/g, ''), 10) || 1;
    const k = `enemy-${((n - 1) % ENEMY_COUNT) + 1}`;
    return ENEMY_SPRITE_FILES[k] + '?v=3';
  }
  return ENEMY_SPRITE_FILES['enemy-1'] + '?v=3';
}

/**
 * @param {string} spriteKey enemy-1..16
 * @param {{ className?: string, size?: 'sm'|'md'|'lg'|'battle' }} opts
 */
export function enemyImgHtml(spriteKey, opts = {}) {
  const { className = 'enemy-img', size = 'md' } = opts;
  const src = enemySrc(spriteKey);
  const fallback = icon('skull', 'ico--enemy-fallback');
  return `<img src="${src}" alt="Inimigo" class="${className} enemy-img--${size}" draggable="false" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.hidden=false)" /><span class="enemy-emoji-fallback" hidden>${fallback}</span>`;
}

export function enemyEmoji(sprite) {
  return icon(/^enemy-/.test(String(sprite || '')) ? 'skull' : 'alert', 'ico--enemy-fallback');
}

export function levelBadgeHtml(level, className = 'level-badge-img') {
  return `<img src="${LEVEL_BADGE}?v=1" alt="Nível" class="${className}" draggable="false" />`;
}
