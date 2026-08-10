import { EVOLUTION_STAGES, xpForNextLevel } from '../core/progression.js';
import {
  getHeroTiers,
  lifetimeXp,
  normalizeSprite,
  rankLabel,
  resolveHeroIdentity,
} from './heroAssets.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

function unlockedDateForTier(tier, emblemState) {
  const matching = emblemState?.emblems?.find((emblem) => (
    emblem.category === tier.category
    && String(emblem.threshold) === String(tier.threshold)
    && emblem.earned
  ));
  return matching?.unlocked_at || null;
}

export function formatUnlockedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

export function buildProfileEvolutionModel({ player = {}, user = {}, contest = {}, emblemState = {} } = {}) {
  const rawLevel = clamp(player.level, 0, 100);
  const identity = resolveHeroIdentity(rawLevel || 1, player.avatar_sprite);
  const tiers = getHeroTiers(identity.gender);
  const stageDefinition = EVOLUTION_STAGES[identity.stageIndex] || null;
  const nextTier = tiers[identity.stageIndex + 1] || null;
  const nextProgress = nextTier
    ? clamp((rawLevel / Math.max(1, nextTier.min)) * 100, 0, 100)
    : 100;
  const xpLevel = Math.max(1, Number(player.xp_level) || 1);
  const xpCurrent = Math.max(0, Number(player.xp) || 0);
  const xpNext = Math.max(1, Number(player.xp_next_level) || xpForNextLevel(xpLevel));
  const mastery = clamp(player.mastery_pct ?? player.edital_completion_pct, 0, 100);
  const completion = clamp(player.edital_completion_pct, 0, 100);
  const totalXp = lifetimeXp(player);
  const sprite = normalizeSprite(player.avatar_sprite);

  const trail = tiers.map((tier, index) => {
    const state = index < identity.stageIndex ? 'achieved' : index === identity.stageIndex ? 'current' : 'locked';
    return {
      ...tier,
      src: resolveHeroIdentity(tier.min, sprite).src,
      stageNumber: index + 1,
      title: EVOLUTION_STAGES[index]?.title || `Estágio ${index + 1}`,
      state,
      isCurrent: state === 'current',
      isAchieved: state !== 'locked',
      rangeLabel: `Nível ${tier.min}–${tier.max}`,
    };
  });

  const achievements = (emblemState.insignias || []).map((category) => ({
    category: category.category,
    name: category.name,
    description: category.description,
    tiers: category.tiers.map((tier) => ({
      ...tier,
      status: tier.achieved ? 'CONQUISTADO' : 'BLOQUEADO',
      unlockedDate: unlockedDateForTier(tier, emblemState),
    })),
  }));
  const earnedCount = achievements.reduce((total, category) => (
    total + category.tiers.filter((tier) => tier.achieved).length
  ), 0);
  const achievementCount = achievements.reduce((total, category) => total + category.tiers.length, 0);

  return Object.freeze({
    identity: Object.freeze({
      name: user.name || player.name || 'Estudante',
      contest: contest.name || 'Jornada atual',
      role: contest.role || contest.position || contest.cargo || '',
      sprite,
      genderLabel: sprite === 'female' ? 'Feminino' : 'Masculino',
      rank: rankLabel(rawLevel, completion),
    }),
    current: Object.freeze({
      ...identity,
      rawLevel,
      title: stageDefinition?.title || `Estágio ${identity.stageNumber}`,
      alt: `Avatar atual, estágio ${identity.stageNumber} de ${identity.stageCount}`,
      next: nextTier ? Object.freeze({
        stageNumber: identity.stageNumber + 1,
        threshold: nextTier.min,
        current: rawLevel,
        progress: nextProgress,
        unit: 'nível acadêmico',
      }) : null,
    }),
    xp: Object.freeze({
      level: xpLevel,
      current: xpCurrent,
      next: xpNext,
      progress: clamp((xpCurrent / xpNext) * 100, 0, 100),
      total: totalXp,
    }),
    stats: Object.freeze({
      level: rawLevel,
      mastery,
      completion,
      stars: Math.max(0, Number(player.total_stars) || 0),
      streak: Math.max(0, Number(player.streak_days) || 0),
      bestStreak: Math.max(0, Number(player.best_streak) || 0),
      battles: Math.max(0, Number(emblemState.metrics?.missions) || 0),
    }),
    trail: Object.freeze(trail),
    achievements: Object.freeze(achievements),
    earnedCount,
    achievementCount,
  });
}
