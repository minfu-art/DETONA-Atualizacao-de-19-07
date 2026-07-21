/**
 * Economia de XP e evolução de avatar (estilo RO)
 * XP_proximo_nivel = nivel_atual * 100
 * TRAVA: Nv 90 não sobe para 91 até edital_completion_pct === 100
 */

export const MAX_LEVEL = 100;
export const LEGEND_LOCK_LEVEL = 90;

/** Estágios de evolução alinhados às artes AVATAR LV* */
export const EVOLUTION_STAGES = [
  { min: 1, max: 9, title: 'Aprendiz', titleEn: 'Novice', tier: 0 },
  { min: 10, max: 19, title: 'Aspirante', titleEn: 'Recruit', tier: 1 },
  { min: 20, max: 29, title: 'Investigador Praticante', titleEn: 'Investigator', tier: 2 },
  { min: 30, max: 39, title: 'Agente Tático', titleEn: 'Tactical Agent', tier: 3 },
  { min: 40, max: 49, title: 'Especialista em Segurança', titleEn: 'Security Specialist', tier: 4 },
  { min: 50, max: 59, title: 'Operacional Veterano', titleEn: 'Veteran Operative', tier: 5 },
  { min: 60, max: 69, title: 'Inspetor de Elite', titleEn: 'Elite Inspector', tier: 6 },
  { min: 70, max: 79, title: 'Mestre de Operações', titleEn: 'Operations Master', tier: 7 },
  { min: 80, max: 89, title: 'Grão-Mestre da Lei', titleEn: 'Grand Master of Law', tier: 8 },
  { min: 90, max: 100, title: 'Lenda da Segurança Pública', titleEn: 'Public Security Legend', tier: 9 },
];

export function xpForNextLevel(level) {
  return level * 100;
}

export function getStage(level) {
  return EVOLUTION_STAGES.find((s) => level >= s.min && level <= s.max) || EVOLUTION_STAGES[0];
}

export function getTitle(level) {
  return getStage(level).title;
}

/**
 * Aplica ganho de XP e processa level-ups com trava da Lenda.
 * @param {object} player
 * @param {number} amount
 * @returns {{ player: object, leveledUp: boolean, levelsGained: number, lockedAtLegend: boolean }}
 */
export function applyXp(player, amount) {
  let xp = (player.xp || 0) + amount;
  let level = player.xp_level || 1;
  let leveledUp = false;
  let levelsGained = 0;
  let lockedAtLegend = false;
  const editalPct = player.edital_completion_pct || 0;

  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (xp < need) break;

    // Trava: não passa de 90 → 91 sem edital 100%
    if (level === LEGEND_LOCK_LEVEL && editalPct < 100) {
      lockedAtLegend = true;
      break;
    }

    xp -= need;
    level += 1;
    levelsGained += 1;
    leveledUp = true;
  }

  // Cap visual de XP no nível 90 se travado
  if (level === LEGEND_LOCK_LEVEL && editalPct < 100) {
    // permite acumular (xp pode > need) — UI mostra overflow
  }

  if (level >= MAX_LEVEL) {
    level = MAX_LEVEL;
  }

  player.xp_level = level;
  player.xp = xp;
  player.xp_next_level = xpForNextLevel(level);

  return { player, leveledUp, levelsGained, lockedAtLegend };
}

/**
 * Converte domínio percentual em estrelas visuais.
 * Cada estrela vale 20 pontos percentuais e cada 10 pontos vale meia estrela.
 */
export function starsFromAccuracy(pct) {
  const normalized = Math.min(100, Math.max(0, Number(pct) || 0));
  return Math.round(normalized / 10) / 2;
}

/** Bônus de fechamento de batalha */
export function battleCloseBonus(stars) {
  return stars * 25;
}

/** Combo de acertos na batalha */
export function comboBonus(streak) {
  if (streak >= 10) return 100;
  if (streak >= 5) return 30;
  if (streak >= 3) return 10;
  return 0;
}

export const XP = {
  CORRECT_ANSWER: 10,
  DAILY_BATTLE: 150,
  /** Meta diária de estudo cumprida (HUD / DailyLog) */
  DAILY_META: 30,
  /** Compat: mesmo bônus da meta diária */
  DAILY_ROUTINE: 30,
  /** Todos os hábitos de bem-estar do dia */
  WELLBEING_DAY: 10,
};

export function daysUntilExam(examDate) {
  if (!examDate) return null;
  const end = new Date(examDate + 'T23:59:59');
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff;
}

export function rarityFromStars(stars) {
  if (stars >= 5) return 'MVP';
  if (stars >= 4) return 'Épica';
  if (stars >= 3) return 'Rara';
  return 'Comum';
}
