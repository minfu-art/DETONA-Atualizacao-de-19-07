/**
 * Evolução visual do avatar principal por nível e sexo.
 * Masculino e feminino têm cadeias de artes próprias (não espelhamento).
 */

/** Cache-bust ao trocar artes */
const HERO_VER = 'v60-complete-male-body';

/** Tiers masculinos — evolução tática DETONA v2 */
export const HERO_TIERS_MALE = Object.freeze([
  { min: 1, max: 9, file: 'assets/hero/tiers-v2/male/stage-01.png', key: '01-09' },
  { min: 10, max: 19, file: 'assets/hero/tiers-v2/male/stage-02.png', key: '10-19' },
  { min: 20, max: 29, file: 'assets/hero/tiers-v2/male/stage-03.png', key: '20-29' },
  { min: 30, max: 39, file: 'assets/hero/tiers-v2/male/stage-04.png', key: '30-39' },
  { min: 40, max: 49, file: 'assets/hero/tiers-v2/male/stage-05.png', key: '40-49' },
  { min: 50, max: 59, file: 'assets/hero/tiers-v2/male/stage-06.png', key: '50-59' },
  { min: 60, max: 69, file: 'assets/hero/tiers-v2/male/stage-07.png', key: '60-69' },
  { min: 70, max: 79, file: 'assets/hero/tiers-v2/male/stage-08.png', key: '70-79' },
  { min: 80, max: 89, file: 'assets/hero/tiers-v2/male/stage-09.png', key: '80-89' },
  { min: 90, max: 100, file: 'assets/hero/tiers-v2/male/stage-10.png', key: '90-100' },
]);

/**
 * Tiers femininos (cadeia enviada pelo usuário).
 * LV 70–89 usa uma única arte; LV 100 tem arte própria.
 */
export const HERO_TIERS_FEMALE = Object.freeze([
  { min: 1, max: 9, file: 'assets/hero/tiers-v2/female/stage-01.png', key: 'f-01-09' },
  { min: 10, max: 19, file: 'assets/hero/tiers-v2/female/stage-02.png', key: 'f-10-19' },
  { min: 20, max: 29, file: 'assets/hero/tiers-v2/female/stage-03.png', key: 'f-20-29' },
  { min: 30, max: 39, file: 'assets/hero/tiers-v2/female/stage-04.png', key: 'f-30-39' },
  { min: 40, max: 49, file: 'assets/hero/tiers-v2/female/stage-05.png', key: 'f-40-49' },
  { min: 50, max: 59, file: 'assets/hero/tiers-v2/female/stage-06.png', key: 'f-50-59' },
  { min: 60, max: 69, file: 'assets/hero/tiers-v2/female/stage-07.png', key: 'f-60-69' },
  { min: 70, max: 79, file: 'assets/hero/tiers-v2/female/stage-08.png', key: 'f-70-79' },
  { min: 80, max: 89, file: 'assets/hero/tiers-v2/female/stage-09.png', key: 'f-80-89' },
  { min: 90, max: 100, file: 'assets/hero/tiers-v2/female/stage-10.png', key: 'f-90-100' },
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

/**
 * Fonte canônica da identidade visual do jogador.
 * A progressão continua sendo alimentada exclusivamente pelo nível acadêmico.
 */
export function resolveHeroIdentity(level = 1, sprite = 'male') {
  const gender = normalizeSprite(sprite);
  const normalizedLevel = Math.max(1, Math.min(100, Number(level) || 1));
  const tiers = getHeroTiers(gender);
  const tier = getHeroTier(normalizedLevel, gender);
  const stageIndex = Math.max(0, tiers.indexOf(tier));
  return Object.freeze({
    gender,
    level: normalizedLevel,
    tier,
    stageIndex,
    stageNumber: stageIndex + 1,
    stageCount: tiers.length,
    src: `${tier.file}?${HERO_VER}`,
  });
}

export function heroSrcForLevel(level = 1, sprite = 'male') {
  return resolveHeroIdentity(level, sprite).src;
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
  const identity = resolveHeroIdentity(level, sprite);
  const { gender, src } = identity;
  const label = alt || (gender === 'female' ? 'Heroína Estudante' : 'Herói Estudante');
  const aura = level >= 90 ? ' hero-aura-legend' : level >= 50 ? ' hero-aura-mid' : '';
  // Não espelhar o feminino: já tem arte própria. flip só se pedido explicitamente em male.
  const flipCls = flip && gender !== 'female' ? ' hero-flip' : '';
  return `<img src="${src}" alt="${label}" class="${className}${aura}${flipCls}" draggable="false" data-hero-sprite="${gender}" data-hero-level="${identity.level}" data-hero-stage="${identity.stageNumber}" />`;
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
