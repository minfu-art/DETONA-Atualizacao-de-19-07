/**
 * Métricas da rotina (separadas de acurácia/domínio acadêmico).
 */
import { dailyAdherence, weeklyConsistency, planningAccuracy, retakeRate } from './routineConsistency.js';
import { timeToMinutes } from './routinePlanner.js';

export function computeDayMetrics(dayState, blocks = []) {
  const dayBlocks = blocks.filter((b) => b.date === dayState.date);
  const planned = dayBlocks
    .filter((b) => !['cancelled', 'rescheduled'].includes(b.status))
    .reduce((s, b) => s + (b.plannedMinutes || 0), 0);
  const actual = dayBlocks.reduce((s, b) => s + (b.actualMinutes || 0), 0);
  const adh = dailyAdherence(planned || dayState.plannedMinutes, actual || dayState.actualMinutes);
  return {
    date: dayState.date,
    ...adh,
    plannedMinutes: planned || dayState.plannedMinutes || 0,
    actualMinutes: actual || dayState.actualMinutes || 0,
    completedBlocks: dayBlocks.filter((b) => b.status === 'completed').length,
    partialBlocks: dayBlocks.filter((b) => b.status === 'partially_completed').length,
    skippedBlocks: dayBlocks.filter((b) => b.status === 'skipped').length,
    rescheduledBlocks: dayBlocks.filter((b) => b.status === 'rescheduled').length,
  };
}

export function computeWeekMetrics({
  dayStates = [],
  blocks = [],
  sessions = [],
  distractions = [],
  consistency = {},
} = {}) {
  const days = dayStates.map((d) => computeDayMetrics(d, blocks));
  const plannedHours = days.reduce((s, d) => s + d.plannedMinutes, 0) / 60;
  const actualHours = days.reduce((s, d) => s + d.actualMinutes, 0) / 60;
  const wc = weeklyConsistency(dayStates);
  const plannedBlocks = blocks.filter((b) => !['cancelled'].includes(b.status)).length;
  const completedBlocks = blocks.filter((b) => b.status === 'completed').length;
  const rescheduledBlocks = blocks.filter((b) => b.status === 'rescheduled').length;
  const skippedBlocks = blocks.filter((b) => b.status === 'skipped').length;
  const accuracy = planningAccuracy({
    plannedMinutes: days.reduce((s, d) => s + d.plannedMinutes, 0),
    actualMinutes: days.reduce((s, d) => s + d.actualMinutes, 0),
    plannedBlocks,
    completedBlocks,
    rescheduledBlocks,
    skippedBlocks,
  });

  const bySubject = {};
  for (const b of blocks) {
    if (!['completed', 'partially_completed'].includes(b.status)) continue;
    const key = b.subjectId || b.activityType || 'outro';
    bySubject[key] = (bySubject[key] || 0) + (b.actualMinutes || 0);
  }
  const studied = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  const neglectedSubjects = Object.keys(bySubject).length === 0 ? [] : [];

  const periodBuckets = { manha: 0, tarde: 0, noite: 0 };
  for (const b of blocks) {
    if (!b.actualMinutes) continue;
    const t = timeToMinutes(b.startTime);
    if (t == null) continue;
    if (t < 12 * 60) periodBuckets.manha += b.actualMinutes;
    else if (t < 18 * 60) periodBuckets.tarde += b.actualMinutes;
    else periodBuckets.noite += b.actualMinutes;
  }
  const bestPeriod = Object.entries(periodBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const focusScores = sessions.map((s) => s.focusScore).filter((n) => n != null);
  const avgFocus = focusScores.length
    ? Math.round((focusScores.reduce((a, b) => a + b, 0) / focusScores.length) * 10) / 10
    : null;

  const distCounts = {};
  for (const d of distractions) {
    distCounts[d.category] = (distCounts[d.category] || 0) + 1;
  }
  const topDistraction = Object.entries(distCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const missed = dayStates.filter((d) => d.programmed && !d.restDay && !d.minGoalMet).length;

  return {
    plannedHours: Math.round(plannedHours * 10) / 10,
    actualHours: Math.round(actualHours * 10) / 10,
    daysMet: wc.met,
    daysProgrammed: wc.total,
    weeklyConsistency: wc.ratio,
    streak: consistency.currentStreak || 0,
    bestStreak: consistency.bestStreak || 0,
    answeredQuestions: dayStates.reduce((s, d) => s + (d.answeredQuestions || 0), 0),
    reviewsCompleted: blocks.filter((b) => ['revisao', 'revisao_fila'].includes(b.activityType) && b.status === 'completed').length,
    topSubjects: studied.slice(0, 5),
    neglectedSubjects,
    bestPeriod,
    avgFocus,
    distractionsTotal: distractions.length,
    topDistraction,
    rescheduledBlocks,
    skippedBlocks,
    planning: accuracy,
    retakeRate: retakeRate(missed, consistency.retakes || 0),
    days,
  };
}

/**
 * Sugestões locais pós revisão semanal / sobrecarga.
 * Limita mudanças entre 10% e 20%.
 */
export function buildLocalSuggestions({ metrics, answers = {}, profile } = {}) {
  const suggestions = [];
  const load = answers.load || 'adequada';
  const adherence = metrics?.days?.length
    ? Math.round(metrics.days.reduce((s, d) => s + d.adherence, 0) / metrics.days.length)
    : metrics?.weeklyConsistency || 0;

  if (load === 'excessiva' || adherence < 60) {
    suggestions.push({
      id: 'reduce_load_15',
      type: 'reduce_load',
      percent: 15,
      message: 'Reduzir cerca de 15% da carga diária máxima na próxima semana.',
    });
    suggestions.push({
      id: 'split_blocks',
      type: 'split_blocks',
      message: 'Dividir blocos longos em sessões menores com intervalos.',
    });
  }

  if ((metrics?.distractionsTotal || 0) >= 5) {
    suggestions.push({
      id: 'more_breaks',
      type: 'breaks',
      message: 'Aumentar intervalos curtos entre blocos.',
    });
  }

  if (metrics?.bestPeriod && profile?.preferenceSlot !== metrics.bestPeriod) {
    suggestions.push({
      id: 'move_period',
      type: 'period',
      message: `Concentrar disciplinas difíceis no período da ${metrics.bestPeriod}, que funcionou melhor.`,
    });
  }

  if ((metrics?.reviewsCompleted || 0) === 0) {
    suggestions.push({
      id: 'add_review',
      type: 'review',
      message: 'Adicionar ao menos um bloco de revisão inteligente na semana.',
    });
  }

  if (adherence >= 90 && load !== 'excessiva') {
    suggestions.push({
      id: 'increase_load_10',
      type: 'increase_load',
      percent: 10,
      message: 'Aumentar moderadamente (+10%) a carga, se desejar progredir mais.',
    });
  }

  if (!(profile?.restDays || []).length) {
    suggestions.push({
      id: 'keep_rest',
      type: 'rest',
      message: 'Preservar ao menos um dia de descanso na semana.',
    });
  }

  return suggestions.slice(0, 6);
}

/**
 * Detecção de sobrecarga / subcarga em 2 semanas (simplificado com histórico de adesão).
 */
export function loadAdjustmentAdvice({ weekAdherence = [], userWantsIncrease = false, frequentExtras = false } = {}) {
  if (weekAdherence.length >= 2 && weekAdherence.every((a) => a < 60)) {
    return { action: 'reduce', percent: 15, reason: 'Adesão abaixo de 60% por duas semanas.' };
  }
  if (weekAdherence.length >= 2 && weekAdherence.every((a) => a > 90) && (userWantsIncrease || frequentExtras)) {
    return { action: 'increase', percent: 10, reason: 'Alta adesão e capacidade sobrando.' };
  }
  return { action: 'keep', percent: 0, reason: 'Carga estável.' };
}

export function applyLoadPercent(profile, percent, direction = 'reduce') {
  const factor = direction === 'increase' ? (1 + percent / 100) : (1 - percent / 100);
  const clamped = Math.max(10, Math.min(20, Math.abs(percent)));
  const f = direction === 'increase' ? (1 + clamped / 100) : (1 - clamped / 100);
  return {
    ...profile,
    maxDailyMinutes: Math.max(20, Math.round((profile.maxDailyMinutes || 90) * f)),
    weeklyHoursGoal: Math.max(1, Math.round((profile.weeklyHoursGoal || 6) * f * 10) / 10),
    dailyQuestionsGoal: Math.max(5, Math.round((profile.dailyQuestionsGoal || 30) * f)),
  };
}
