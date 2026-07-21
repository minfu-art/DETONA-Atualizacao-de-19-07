/**
 * Meta mínima, sequência, proteção e conquistas de consistência (sem XP acadêmico).
 */
import { dateKey } from './routineSchema.js';

export const ACHIEVEMENT_DEFS = Object.freeze([
  { code: 'first_step', title: 'Primeiro Passo', test: (s) => s.sessionsCompleted >= 1 },
  { code: 'three_days', title: 'Três Dias no Controle', test: (s) => s.bestStreak >= 3 || s.currentStreak >= 3 },
  { code: 'first_week', title: 'Primeira Semana Completa', test: (s) => s.bestStreak >= 7 || s.programmedDaysCompleted >= 7 },
  { code: 'retake_master', title: 'Mestre da Retomada', test: (s) => s.retakes >= 1 },
  { code: 'ten_focus', title: 'Dez Sessões de Foco', test: (s) => s.sessionsCompleted >= 10 },
  { code: 'hundred_q', title: 'Cem Questões Planejadas e Cumpridas', test: (s) => (s.questionsGoalMetTotal || 0) >= 100 },
  { code: 'first_weekly_review', title: 'Primeira Revisão Semanal', test: (s) => s.weeklyReviewsDone >= 1 },
  { code: 'month_constancy', title: 'Um Mês de Constância', test: (s) => s.bestStreak >= 30 || s.programmedDaysCompleted >= 30 },
]);

/**
 * Avalia se meta mínima foi cumprida (não usa abertura do app).
 */
export function evaluateMinGoal(minGoal, {
  actualMinutes = 0,
  answeredQuestions = 0,
  completedBlocks = 0,
  completedReviews = 0,
} = {}) {
  const g = minGoal || { type: 'minutes', minutes: 10 };
  const type = g.type || 'minutes';
  if (type === 'minutes') return actualMinutes >= (g.minutes || 10);
  if (type === 'questions') return answeredQuestions >= (g.questions || 5);
  if (type === 'blocks') return completedBlocks >= (g.blocks || 1);
  if (type === 'review') return completedReviews >= (g.reviews || 1);
  if (type === 'combo') {
    return actualMinutes >= (g.minutes || 10)
      || answeredQuestions >= (g.questions || 5)
      || completedBlocks >= (g.blocks || 1);
  }
  return actualMinutes >= 10;
}

/**
 * Atualiza sequência ao fechar um dia programado.
 * - restDay: não quebra nem aumenta
 * - não programado: não aumenta só por abrir o app
 * - shield: protege visual da sequência, mas falta permanece nas estatísticas
 */
export function applyDayToConsistency(consistency, {
  programmed = true,
  restDay = false,
  minGoalMet = false,
  useShieldIfNeeded = true,
} = {}) {
  const c = {
    currentStreak: 0,
    bestStreak: 0,
    shields: 0,
    maxShields: 2,
    autoUseShield: true,
    programmedDaysCompleted: 0,
    sessionsCompleted: 0,
    weeklyReviewsDone: 0,
    retakes: 0,
    questionsGoalMetTotal: 0,
    ...consistency,
  };

  if (restDay || !programmed) {
    return { consistency: c, shieldUsed: false, streakBroken: false, message: null };
  }

  if (minGoalMet) {
    const nextStreak = (c.currentStreak || 0) + 1;
    c.currentStreak = nextStreak;
    c.bestStreak = Math.max(c.bestStreak || 0, nextStreak);
    c.programmedDaysCompleted = (c.programmedDaysCompleted || 0) + 1;
    // proteção a cada 7 dias programados cumpridos
    if (nextStreak > 0 && nextStreak % 7 === 0) {
      c.shields = Math.min(c.maxShields || 2, (c.shields || 0) + 1);
    }
    return { consistency: c, shieldUsed: false, streakBroken: false, message: null };
  }

  // falhou meta em dia programado
  if (useShieldIfNeeded && c.autoUseShield !== false && (c.shields || 0) > 0) {
    c.shields -= 1;
    return {
      consistency: c,
      shieldUsed: true,
      streakBroken: false,
      message: 'Proteção de sequência usada. A falta permanece nas estatísticas, mas a sequência visual foi preservada.',
    };
  }

  const broken = (c.currentStreak || 0) > 0;
  c.currentStreak = 0;
  if (broken) c.retakes = (c.retakes || 0); // retake incrementa quando voltar
  return {
    consistency: c,
    shieldUsed: false,
    streakBroken: broken,
    message: broken
      ? 'Sua sequência terminou, mas seu progresso continua. Vamos retomar hoje.'
      : null,
  };
}

/** Quando cumpre meta após falha, marca retomada */
export function markRetake(consistency, previousDayMissed = false) {
  const c = { ...consistency };
  if (previousDayMissed) c.retakes = (c.retakes || 0) + 1;
  return c;
}

export function evaluateAchievements(consistency, earnedCodes = []) {
  const earned = new Set(earnedCodes);
  const unlocked = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (earned.has(def.code)) continue;
    if (def.test(consistency || {})) unlocked.push({ code: def.code, title: def.title });
  }
  return unlocked;
}

export function isProgrammedDay(profile, dateStr) {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  if ((profile.restDays || []).includes(dow)) return { programmed: false, restDay: true };
  if ((profile.availableDays || []).includes(dow)) return { programmed: true, restDay: false };
  return { programmed: false, restDay: false };
}

export function entryActionCompleted(entryAction, events = {}) {
  const type = entryAction?.type || 'minutes';
  if (type === 'minutes') return (events.actualMinutes || 0) >= (entryAction.minutes || 5);
  if (type === 'question') return (events.answeredQuestions || 0) >= 1;
  if (type === 'review_error') return (events.completedReviews || 0) >= 1;
  if (type === 'timer') return (events.sessionStarted || false);
  if (type === 'page') return (events.theoryOpened || false);
  return false;
}

/**
 * Registra minutos reais de sessão — nunca inventa minutos sem cronômetro.
 */
export function validSessionMinutes(elapsedSeconds, { completed = false, aborted = false } = {}) {
  const secs = Math.max(0, Number(elapsedSeconds) || 0);
  if (secs <= 0) return 0;
  // arredonda para baixo em minutos inteiros; mínimo 1 se >= 30s e concluída
  if (secs < 30 && !completed) return 0;
  const mins = Math.floor(secs / 60);
  if (mins === 0 && completed && secs >= 30) return 1;
  if (aborted && mins === 0 && secs >= 30) return 1;
  return mins;
}

export function dailyAdherence(plannedMinutes, actualMinutes) {
  const p = Math.max(0, Number(plannedMinutes) || 0);
  const a = Math.max(0, Number(actualMinutes) || 0);
  if (p <= 0) return { adherence: 0, extraMinutes: a, validMinutes: 0 };
  const valid = Math.min(a, p);
  const extra = Math.max(0, a - p);
  return {
    adherence: Math.min(100, Math.round((valid / p) * 100)),
    extraMinutes: extra,
    validMinutes: valid,
  };
}

export function weeklyConsistency(dayStates = []) {
  const programmed = dayStates.filter((d) => d.programmed && !d.restDay);
  if (!programmed.length) return { ratio: 0, met: 0, total: 0 };
  const met = programmed.filter((d) => d.minGoalMet).length;
  return {
    ratio: Math.round((met / programmed.length) * 100),
    met,
    total: programmed.length,
  };
}

export function planningAccuracy({
  plannedMinutes = 0,
  actualMinutes = 0,
  plannedBlocks = 0,
  completedBlocks = 0,
  rescheduledBlocks = 0,
  skippedBlocks = 0,
} = {}) {
  const durationDelta = actualMinutes - plannedMinutes;
  const completionRate = plannedBlocks > 0
    ? Math.round((completedBlocks / plannedBlocks) * 100)
    : 0;
  return {
    plannedMinutes,
    actualMinutes,
    durationDelta,
    plannedBlocks,
    completedBlocks,
    rescheduledBlocks,
    skippedBlocks,
    completionRate,
  };
}

export function retakeRate(missedDays = 0, retakes = 0) {
  if (missedDays <= 0) return retakes > 0 ? 100 : 0;
  return Math.min(100, Math.round((retakes / missedDays) * 100));
}

export { dateKey };
