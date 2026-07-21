/**
 * Evolução visual do avatar principal por nível e sexo.
 * Masculino e feminino têm cadeias de artes próprias (não espelhamento).
 */

/** Cache-bust ao trocar artes */
const HERO_VER = 'v57-female-alpha';

/** Tiers masculinos (artes existentes) */
export const HERO_TIERS_MALE = Object.freeze([
  { min: 1, max: 9, file: 'assets/hero/tiers/tier-01-09.png', key: '01-09' },
  { min: 10, max: 19, file: 'assets/hero/tiers/tier-10-19.png', key: '10-19' },
  { min: 20, max: 29, file: 'assets/hero/tiers/tier-20-29.png', key: '20-29' },
  { min: 30, max: 39, file: 'assets/hero/tiers/tier-30-39.png', key: '30-39' },
  { min: 40, max: 49, file: 'assets/hero/tiers/tier-40-49.png', key: '40-49' },
  { min: 50, max: 59, file: 'assets/hero/tiers/tier-50-59.png', key: '50-59' },
  { min: 60, max: 69, file: 'assets/hero/tiers/tier-60-69.png', key: '60-69' },
  { min: 70, max: 79, file: 'assets/hero/tiers/tier-70-79.png', key: '70-79' },
  { min: 80, max: 89, file: 'assets/hero/tiers/tier-80-89.png', key: '80-89' },
  { min: 90, max: 100, file: 'assets/hero/tiers/tier-90-99.png', key: '90-99' },
]);

/**
 * Tiers femininos (cadeia enviada pelo usuário).
 * LV 70–89 usa uma única arte; LV 100 tem arte própria.
 */
export const HERO_TIERS_FEMALE = Object.freeze([
  { min: 1, max: 9, file: 'assets/hero/tiers/female/tier-01-09.png', key: 'f-01-09' },
  { min: 10, max: 19, file: 'assets/hero/tiers/female/tier-10-19.png', key: 'f-10-19' },
  { min: 20, max: 29, file: 'assets/hero/tiers/female/tier-20-29.png', key: 'f-20-29' },
  { min: 30, max: 39, file: 'assets/hero/tiers/female/tier-30-39.png', key: 'f-30-39' },
  { min: 40, max: 49, file: 'assets/hero/tiers/female/tier-40-49.png', key: 'f-40-49' },
  { min: 50, max: 59, file: 'assets/hero/tiers/female/tier-50-59.png', key: 'f-50-59' },
  { min: 60, max: 69, file: 'assets/hero/tiers/female/tier-60-69.png', key: 'f-60-69' },
  { min: 70, max: 89, file: 'assets/hero/tiers/female/tier-70-89.png', key: 'f-70-89' },
  { min: 90, max: 99, file: 'assets/hero/tiers/female/tier-90-99.png', key: 'f-90-99' },
  { min: 100, max: 100, file: 'assets/hero/tiers/female/tier-100.png', key: 'f-100' },
]);

/** @deprecated use getHeroTiers('male') — mantido para imports legados */
export const HERO_TIERS = HERO_TIERS_MALE;

export function normalizeSprite(sprite) {
  return sprite === 'female' ? 'female' : 'male';
}

/** Lista de tiers para o sexo escolhido */
export function getHeroTiers(sprite = 'male') {
  return normalizeSprite(sprite) === 'female' ? HERO_TIERS_FEMALE : HERO_TIERS_MALE;
}

/** Fallback / onboarding (Lv 1–9) por sexo */
export function heroBaseSrc(sprite = 'male') {
  const tiers = getHeroTiers(sprite);
  return `${tiers[0].file}?${HERO_VER}`;
}

export const HERO_SRC = heroBaseSrc('male');
export const HERO_SRC_FEMALE = heroBaseSrc('female');

export function getHeroTier(level = 1, sprite = 'male') {
  const tiers = getHeroTiers(sprite);
  const lv = Math.max(1, Math.min(100, Number(level) || 1));
  return tiers.find((t) => lv >= t.min && lv <= t.max) || tiers[0];
}

export function heroSrcForLevel(level = 1, sprite = 'male') {
  const tier = getHeroTier(level, sprite);
  return `${tier.file}?${HERO_VER}`;
}

/**
 * HTML do avatar no nível atual
 * @param {{ className?: string, alt?: string, level?: number, sprite?: 'male'|'female', flip?: boolean }} opts
 * flip é legado (espelhamento); com artes femininas reais fica desativado por padrão.
 */
export function heroImgHtml(opts = {}) {
  const {
    className = 'hero-img',
    alt,
    level = 1,
    sprite = 'male',
    flip = false,
  } = opts;
  const gender = normalizeSprite(sprite);
  const src = heroSrcForLevel(level, gender);
  const label = alt || (gender === 'female' ? 'Heroína Estudante' : 'Herói Estudante');
  const aura = level >= 90 ? ' hero-aura-legend' : level >= 50 ? ' hero-aura-mid' : '';
  // Não espelhar o feminino: já tem arte própria. flip só se pedido explicitamente em male.
  const flipCls = flip && gender !== 'female' ? ' hero-flip' : '';
  return `<img src="${src}" alt="${label}" class="${className}${aura}${flipCls}" draggable="false" data-hero-sprite="${gender}" data-hero-level="${Math.max(1, Math.min(100, Number(level) || 1))}" />`;
}

/** XP total acumulado aproximado */
export function lifetimeXp(player) {
  const level = player.xp_level || 1;
  let total = player.xp || 0;
  for (let i = 1; i < level; i++) total += i * 100;
  return total;
}

export function energyFromLog(log, planned = 30) {
  if (!log) return 100;
  const done = log.completed_amount || 0;
  const p = log.planned_amount || planned;
  const spent = Math.min(100, Math.round((done / Math.max(1, p)) * 100));
  return Math.max(0, 100 - Math.floor(spent * 0.35));
}

export function rankLabel(level, editalPct) {
  if (editalPct >= 100 || level >= 90) return 'LENDA';
  if (level >= 70) return 'OURO I';
  if (level >= 50) return 'OURO II';
  if (level >= 30) return 'OURO III';
  if (level >= 20) return 'PRATA I';
  if (level >= 10) return 'PRATA II';
  return 'BRONZE';
}

export const DISC_BAR_COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899',
  '#06b6d4', '#ef4444', '#84cc16', '#8b5cf6', '#f97316',
  '#14b8a6', '#e11d48', '#eab308', '#6366f1', '#10b981', '#0ea5e9',
];
