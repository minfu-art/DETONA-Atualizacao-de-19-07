/**
 * Ícones RPG DETONA — SVG inline, duotone e escalável.
 * A moldura escura, os chanfros e os acentos plasma/energia seguem a arte do app.
 */
let iconSequence = 0;

const PALETTES = {
  plasma: ['#c084fc', '#7c3aed', '#fb923c'],
  energy: ['#fbbf24', '#f97316', '#a855f7'],
  data: ['#67e8f9', '#2563eb', '#a855f7'],
  gold: ['#fff1a8', '#f59e0b', '#a855f7'],
  danger: ['#fb7185', '#dc2626', '#f97316'],
  nature: ['#86efac', '#16a34a', '#67e8f9'],
};

function svg(paths, tone = 'plasma') {
  const [light, deep, accent] = PALETTES[tone] || PALETTES.plasma;
  const id = `detona-ico-${tone}-${iconSequence += 1}`;
  const paintedPaths = paths.replaceAll('fill="currentColor"', `fill="url(#${id}-main)"`);
  return `<svg class="ico ico--rpg ico--${tone}" viewBox="-2 -2 28 28" width="1em" height="1em" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-main" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="${light}"/><stop offset=".52" stop-color="${deep}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
      <linearGradient id="${id}-plate" x1="1" y1="0" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#17112d"/><stop offset=".55" stop-color="#090b18"/><stop offset="1" stop-color="#050611"/></linearGradient>
      <filter id="${id}-glow" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation=".55" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect class="ico__plate" x="-1" y="-1" width="26" height="26" rx="7" fill="url(#${id}-plate)" stroke="url(#${id}-main)" stroke-width=".85"/>
    <path class="ico__bevel" d="M5 1h14.2c2 0 3.8 1 4.8 2.6" stroke="${light}" stroke-width=".55" stroke-linecap="round" opacity=".65"/>
    <path class="ico__shard" d="m20.7 3.5.8 1.3-.8 1.3-.8-1.3.8-1.3ZM2.8 18.3l.7 1.1-.7 1.1-.7-1.1.7-1.1Z" fill="${accent}" opacity=".9"/>
    <g class="ico__glyph" stroke="url(#${id}-main)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" filter="url(#${id}-glow)">${paintedPaths}</g>
  </svg>`;
}

const painted = (tone, paths) => () => svg(paths, tone);

function utility(paths, tone = 'plasma') {
  const [light, deep] = PALETTES[tone] || PALETTES.plasma;
  return `<svg class="ico ico--utility ico--${tone}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true"><g stroke="${light}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</g><path d="M5 3h14" stroke="${deep}" stroke-width=".55" opacity=".55"/></svg>`;
}

const util = (tone, paths) => () => utility(paths, tone);

export const ICO = {
  home: painted('plasma', '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z"/>'),
  book: painted('data', '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 6h7M9 10h5" opacity=".72"/>'),
  question: painted('data', '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4.4 2.7c-.8.4-1.5 1-1.5 2.3"/><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"/>'),
  trophy: painted('gold', '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H5a3 3 0 0 0 3 3M17 6h2a3 3 0 0 1-3 3"/>'),
  user: painted('plasma', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  flame: painted('energy', '<path d="M12 3c2 3 1 5 1 5s3-1 4 3a6 6 0 1 1-11.5 2C7 9 9 7 12 3z"/><path d="M12 11c1.2 1.4 2 2.6 1.7 4.1-.2 1.4-1.1 2.4-2.3 2.8" opacity=".72"/>'),
  bolt: painted('energy', '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" stroke="none"/>'),
  gem: painted('plasma', '<path d="M6 3h12l4 7-10 11L2 10 6 3z"/><path d="M2 10h20M8.5 3 12 10l3.5-7"/>'),
  target: painted('danger', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>'),
  calendar: painted('data', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m8 15 2 2 5-5" opacity=".78"/>'),
  medal: painted('gold', '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5 7 21l5-3 5 3-1.5-7.5"/><path d="m12 6 .9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 8l2-.3L12 6z" fill="currentColor" stroke="none"/>'),
  chart: painted('data', '<path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/><path d="m7 9 4-3 4 2 4-5" opacity=".7"/>'),
  /** Gráfico em degraus (escalonado) — Evolução */
  chartSteps: painted('data', '<path d="M3 20h18"/><path d="M5 20V15h3.5v5"/><path d="M9.5 20V11h3.5v9"/><path d="M14 20V7h3.5v13"/><path d="M18.5 20V4H21v16" opacity=".9"/><path d="M5 15h3.5M9.5 11h3.5M14 7h3.5" opacity=".55"/>'),
  sword: painted('energy', '<path d="m14.5 17.5 3 3 3-3-3-3"/><path d="m13 19-9-9 3-3 9 9"/><path d="m6 6 2-2 2 2-2 2z"/><path d="m4 14 3 3"/>'),
  /** Espadas cruzadas — missão do dia / combate */
  swordsCrossed: painted('energy', '<path d="M5.5 3.5 4 5l7.5 7.5 1.5-1.5L5.5 3.5z"/><path d="M4 5 2.5 6.5l1.2 1.2L6.5 5.9"/><path d="m11.5 11.5 1.5 7.5"/><path d="M18.5 3.5 20 5l-7.5 7.5-1.5-1.5L18.5 3.5z"/><path d="M20 5l1.5 1.5-1.2 1.2L17.5 5.9"/><path d="m12.5 11.5-1.5 7.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
  map: painted('data', '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/><path d="m11.5 11 1.2 1.8 2.1-3" opacity=".72"/>'),
  forge: painted('energy', '<path d="M14 6h6v4H14z"/><path d="M4 20h10"/><path d="M9 20V10l5-4"/><path d="m11 12 5 5"/>'),
  shield: painted('gold', '<path d="M12 3 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3z"/><path d="M12 7v10M8 12h8" opacity=".65"/>'),
  star: painted('gold', '<path d="m12 2 2.9 6.3L22 9.3l-5 4.8 1.3 7L12 17.8 5.7 21l1.3-7-5-4.8 7.1-1L12 2z" fill="currentColor" stroke="none"/>'),
  menu: painted('plasma', '<path d="M5 7h14M5 12h14M5 17h14"/><path d="M3 7h.01M3 12h.01M3 17h.01"/>'),
  chest: painted('gold', '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M3 13h18M12 13v7M8 9V7a4 4 0 0 1 8 0v2"/><path d="M10.5 15h3v2.5h-3z" fill="currentColor" stroke="none"/>'),
  skull: painted('danger', '<circle cx="12" cy="10" r="7"/><path d="M9 18v3M15 18v3M9 10h.01M15 10h.01M9.5 14c.8 1 2 1.5 2.5 1.5s1.7-.5 2.5-1.5"/>'),
  homeFill: painted('plasma', '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z" fill="currentColor" stroke="none"/>'),
  checkCircle: painted('nature', '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>'),
  shieldCheck: painted('nature', '<path d="M12 3 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3z"/><path d="m9 12 2 2 4-4"/>'),
  clipboard: painted('data', '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/>'),
  seedling: painted('nature', '<path d="M12 22V12"/><path d="M12 12c-3-1-6-4-5-8 4 0 6 3 6 6"/><path d="M12 12c3-1 6-4 5-8-4 0-6 3-6 6"/>'),
  logout: painted('danger', '<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="m15 8 4 4-4 4M8 12h11"/>'),
  refresh: painted('data', '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.4-2L20 8M4 16l2.5 2a7 7 0 0 0 11.4-2"/>'),
  layers: painted('data', '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>'),
  brain: painted('plasma', '<path d="M9.5 5A3 3 0 0 0 5 7.6 3.5 3.5 0 0 0 4.5 14 3.2 3.2 0 0 0 9 18.5V5z"/><path d="M14.5 5A3 3 0 0 1 19 7.6a3.5 3.5 0 0 1 .5 6.4 3.2 3.2 0 0 1-4.5 4.5V5zM9 9H7m8 3h2M9 15H7m8-7h2"/>'),
  focus: painted('energy', '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>'),
  alert: painted('danger', '<path d="M12 3 2.8 20h18.4L12 3z"/><path d="M12 9v5M12 17h.01"/>'),
  flag: painted('gold', '<path d="M5 22V3M6 4h12l-2 4 2 4H6"/><path d="M3 22h6"/>'),
  lock: util('danger', '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/>'),
  mail: util('data', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'),
  eye: util('plasma', '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>'),
  eyeOff: util('plasma', '<path d="m4 4 16 16M9.8 6.3A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.2 2.8M6.2 7.4C3.8 9.2 2.5 12 2.5 12s3.5 6 9.5 6c1 0 2-.2 2.8-.5"/><path d="M10.4 10.4a2.5 2.5 0 0 0 3.2 3.2"/>'),
  check: util('nature', '<path d="m5 12 4 4L19 6"/>'),
  circle: util('data', '<circle cx="12" cy="12" r="7"/>'),
  plus: util('plasma', '<path d="M12 5v14M5 12h14"/>'),
  minus: util('plasma', '<path d="M5 12h14"/>'),
  chevronDown: util('plasma', '<path d="m6 9 6 6 6-6"/>'),
  chevronRight: util('plasma', '<path d="m9 6 6 6-6 6"/>'),

  /* ── Ícones por matéria do edital (distintos) ── */
  discPort: painted('data', '<path d="M5 4h10a2 2 0 0 1 2 2v13l-3-1.5L11 19l-3-1.5L5 19V4z"/><path d="M8 8h6M8 11h5M8 14h4" opacity=".75"/>'),
  discTi: painted('data', '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M7 8h4M7 11h6" opacity=".7"/>'),
  discCiber: painted('gold', '<path d="M12 3 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3z"/><path d="M9 12h6M12 9v6" opacity=".7"/>'),
  discRlm: painted('plasma', '<path d="M4 18V6l4 3 4-5 4 5 4-3v12"/><path d="M8 14h8M10 17h4" opacity=".65"/>'),
  discDh: painted('gold', '<path d="M12 3v18"/><path d="M5 8h5.5a2.5 2.5 0 0 1 0 5H5"/><path d="M19 8h-5.5a2.5 2.5 0 0 0 0 5H19"/><path d="M5 21h14"/>'),
  discEtica: painted('energy', '<path d="M4 20h16"/><path d="M6 20V10l6-5 6 5v10"/><path d="M10 20v-5h4v5"/><path d="M9 12h.01M15 12h.01" opacity=".8"/>'),
  discPenal: painted('danger', '<path d="M12 3v4M8 7h8"/><path d="M7 11h10v2H7z"/><path d="M9 13v8M15 13v8"/><path d="M10 21h4"/>'),
  discProc: painted('data', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3M8 10h8M8 14h8M8 18h5"/>'),
  discConst: painted('gold', '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M10 7h5M10 11h4" opacity=".7"/>'),
  discAdm: painted('plasma', '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/><path d="M9 12h.01M15 12h.01M12 12h.01"/>'),
  discLegAl: painted('energy', '<path d="M12 4c2 2 3 4 3 6a3 3 0 0 1-6 0c0-2 1-4 3-6z"/><path d="M8 14c-2 1-4 3-4 5h16c0-2-2-4-4-5"/><path d="M12 10v11"/>'),
  discLegEsp: painted('danger', '<circle cx="12" cy="10" r="6"/><path d="M9 18v3M15 18v3M9.5 10h.01M14.5 10h.01M9.5 13.5c.7.9 1.8 1.3 2.5 1.3s1.8-.4 2.5-1.3"/>'),
  discContab: painted('data', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M16 16h2v2h-2z" fill="currentColor" stroke="none"/>'),
  discFin: painted('gold', '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c.5-1 1.5-1.5 2.5-1.5s2 .7 2 1.8c0 2.2-4 1.5-4 4 0 1.1.9 2 2 2s2-.5 2.5-1.4"/>'),
  discEstat: painted('data', '<path d="M4 19V5M4 19h16"/><path d="M8 16v-6M12 16V8M16 16v-4M20 16v-9"/><path d="m7 10 4-3 4 2 4-4" opacity=".65"/>'),
  discDados: painted('plasma', '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/><path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/>'),
};

/** Mapa id da disciplina → chave de ícone SVG */
export const DISC_ICON_MAP = Object.freeze({
  port: 'discPort',
  ti: 'discTi',
  ciber: 'discCiber',
  rlm: 'discRlm',
  dh: 'discDh',
  etica: 'discEtica',
  penal: 'discPenal',
  proc: 'discProc',
  const: 'discConst',
  adm: 'discAdm',
  leg_al: 'discLegAl',
  leg_esp: 'discLegEsp',
  contab: 'discContab',
  fin: 'discFin',
  estat: 'discEstat',
  dados: 'discDados',
});

/** Inimigo visual fixo por matéria (enemy-1..16) */
export const DISC_ENEMY_MAP = Object.freeze({
  port: 'enemy-1',
  ti: 'enemy-2',
  ciber: 'enemy-3',
  rlm: 'enemy-4',
  dh: 'enemy-5',
  etica: 'enemy-6',
  penal: 'enemy-7',
  proc: 'enemy-8',
  const: 'enemy-9',
  adm: 'enemy-10',
  leg_al: 'enemy-11',
  leg_esp: 'enemy-12',
  contab: 'enemy-13',
  fin: 'enemy-14',
  estat: 'enemy-15',
  dados: 'enemy-16',
});

export const SEMANTIC_ICONS = Object.freeze({
  study: 'book',
  review: 'refresh',
  progress: 'chart',
  plan: 'clipboard',
  evolution: 'chartSteps',
  discipline: 'layers',
  goal: 'target',
  fire: 'flame',
  focus: 'focus',
  alert: 'alert',
  achievement: 'trophy',
  exam: 'flag',
  mission: 'swordsCrossed',
});

export function icon(name, className = '') {
  const fn = ICO[name] || ICO.star;
  const html = fn();
  if (!className) return html;
  return html.replace('class="ico ', `class="ico ${className} `);
}

export function navIcon(name) {
  return icon(name, 'ico--nav');
}

export function semanticIcon(category, className = '') {
  return icon(SEMANTIC_ICONS[category] || category, className);
}

/** Ícone SVG distinto por disciplina (id: port, ti, penal…) */
export function discIcon(disciplineId, className = 'ico--inline') {
  const key = DISC_ICON_MAP[disciplineId] || 'layers';
  return icon(key, className);
}

/** Sprite de inimigo associado à matéria */
export function discEnemySprite(disciplineId) {
  return DISC_ENEMY_MAP[disciplineId] || 'enemy-1';
}
