/**
 * Planejamento, conflitos, plano reduzido e reagendamento (regras locais determinísticas).
 */
import {
  createRoutineBlock,
  activityLabel,
  dateKey,
  makeId,
  normalizeRoutineBlock,
} from './routineSchema.js';
import {
  dailyCapacityForDate,
  stableStudyBlockId,
  validateStudyAvailability,
} from './studyPlanContract.js';

export function timeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function blocksOverlap(a, b) {
  if (!a?.date || !b?.date || a.date !== b.date) return false;
  if (a.id && b.id && a.id === b.id) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function findConflicts(blocks = []) {
  const active = blocks.filter((b) => !['cancelled', 'rescheduled', 'skipped'].includes(b.status));
  const conflicts = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (blocksOverlap(active[i], active[j])) {
        conflicts.push({ a: active[i].id, b: active[j].id, date: active[i].date });
      }
    }
  }
  return conflicts;
}

export function dayLoadMinutes(blocks = [], date) {
  return blocks
    .filter((b) => b.date === date && !['cancelled', 'rescheduled'].includes(b.status))
    .reduce((sum, b) => sum + (Number(b.plannedMinutes) || 0), 0);
}

export function isDayOverloaded(profile, blocks, date) {
  const load = dayLoadMinutes(blocks, date);
  return load > (profile?.maxDailyMinutes || 90);
}

export function planningAlerts(profile, blocks = [], weekDates = []) {
  const alerts = [];
  for (const date of weekDates) {
    const dayBlocks = blocks.filter((b) => b.date === date && !['cancelled', 'rescheduled'].includes(b.status));
    const load = dayLoadMinutes(blocks, date);
    if (load > (profile.maxDailyMinutes || 90)) {
      alerts.push({ type: 'overload', date, message: `Dia ${date} sobrecarregado (${load} min planejados).` });
    }
    if (dayBlocks.length > (profile.maxBlocksPerDay || 4)) {
      alerts.push({ type: 'too_many_blocks', date, message: `Muitos blocos em ${date}.` });
    }
    const conflicts = findConflicts(dayBlocks);
    if (conflicts.length) {
      alerts.push({ type: 'conflict', date, message: `Conflito de horário em ${date}.` });
    }
    const hasBreak = dayBlocks.some((b) => /intervalo|pausa/i.test(b.title || ''));
    if (load >= 90 && !hasBreak && dayBlocks.length >= 3) {
      alerts.push({ type: 'no_breaks', date, message: `Poucos intervalos em ${date}.` });
    }
  }
  const theory = blocks.filter((b) => b.activityType === 'teoria' && !['cancelled', 'rescheduled'].includes(b.status)).length;
  const questions = blocks.filter((b) => b.activityType === 'questoes' && !['cancelled', 'rescheduled'].includes(b.status)).length;
  const reviews = blocks.filter((b) => ['revisao', 'revisao_fila'].includes(b.activityType) && !['cancelled', 'rescheduled'].includes(b.status)).length;
  if (theory >= 4 && questions === 0) {
    alerts.push({ type: 'theory_heavy', message: 'Muita teoria sem questões nesta semana.' });
  }
  if (questions >= 4 && reviews === 0) {
    alerts.push({ type: 'questions_no_review', message: 'Muitas questões sem revisão nesta semana.' });
  }
  if (!(profile.restDays || []).length) {
    alerts.push({ type: 'no_rest', message: 'Nenhum dia de descanso configurado.' });
  }
  const weekLoad = weekDates.reduce((s, d) => s + dayLoadMinutes(blocks, d), 0);
  const weeklyCap = (profile.weeklyHoursGoal || 6) * 60 * 1.25;
  if (weekLoad > weeklyCap) {
    alerts.push({ type: 'week_overload', message: 'Carga semanal acima da disponibilidade estimada.' });
  }
  return alerts;
}

/** Gera blocos semanais a partir do perfil + sugestões de fraqueza */
export function generateWeekPlan(profile, {
  weekDates = [],
  weakSubtopics = [],
  dueReviews = 0,
  userId = null,
  contestId = null,
} = {}) {
  const blocks = [];
  const session = profile.preferredSessionMinutes || 25;
  weakSubtopics = weakSubtopics.slice(0, 6);
  const availability = validateStudyAvailability(profile, { weekDates });
  if (!profile?.setupCompleted || !availability.valid) return blocks;
  let weeklyRemaining = availability.weeklyCapacity;
  let remainingReviews = Math.max(0, Math.floor(Number(dueReviews) || 0));
  let weakCursor = 0;

  weekDates.forEach((date) => {
    const dow = new Date(`${date}T12:00:00`).getDay();
    if ((profile.restDays || []).includes(dow) || !(profile.availableDays || []).includes(dow)) {
      return;
    }
    const window = profile.dayWindows?.[dow];
    const startMin = timeToMinutes(window?.start);
    const endLimit = timeToMinutes(window?.end);
    const dailyCapacity = Math.min(dailyCapacityForDate(profile, date), weeklyRemaining);
    if (startMin == null || endLimit == null || dailyCapacity <= 0) return;
    let cursor = startMin;
    const dayBlocks = [];
    let dayLoad = 0;
    const pushIfFits = (block) => {
      const duration = Number(block?.plannedMinutes) || 0;
      if (duration <= 0 || dayLoad + duration > dailyCapacity) return false;
      if (timeToMinutes(block.endTime) > endLimit) return false;
      dayBlocks.push(block);
      dayLoad += duration;
      weeklyRemaining -= duration;
      return true;
    };

    // 1) revisão se houver fila
    if (remainingReviews > 0 && dayBlocks.length < profile.maxBlocksPerDay) {
      const b = createRoutineBlock({
        userId, contestId, date,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + Math.min(session, 25)),
        plannedMinutes: Math.min(session, 25),
        activityType: 'revisao_fila',
        title: 'Revisão da fila inteligente',
        priority: 95,
        source: 'review',
        scheduleType: 'horario_fixo',
        anchorType: 'horario',
      });
      if (pushIfFits(b)) {
        remainingReviews -= 1;
        cursor += b.plannedMinutes + (profile.preferredBreakMinutes || 5);
      }
    }

    // 2) questões em ponto fraco
    const weak = weakSubtopics[weakCursor] || null;
    if (weak && dayBlocks.length < profile.maxBlocksPerDay) {
      const mins = Math.min(session, dailyCapacity - dayLoad);
      const b = createRoutineBlock({
        userId, contestId, date,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + mins),
        plannedMinutes: mins,
        activityType: 'questoes',
        title: `Questões · ${weak.name || weak.id}`,
        subjectId: weak.discipline_id || weak.disciplineId || null,
        subtopicId: weak.id,
        priority: 85,
        source: 'weakspot',
        scheduleType: 'horario_fixo',
        description: weak.reason || 'Subtópico com desempenho frágil',
      });
      if (mins >= 5 && pushIfFits(b)) {
        weakCursor += 1;
        cursor += mins + (profile.preferredBreakMinutes || 5);
      }
    }

    for (const [index, block] of dayBlocks.entries()) {
      blocks.push(normalizeRoutineBlock({
        ...block,
        id: stableStudyBlockId(`week:${weekDates[0]}`, block, blocks.length + index),
      }));
    }
  });

  return blocks;
}

/**
 * Plano reduzido — NÃO remove o original.
 * Prioridade: revisão vencida > erro anterior > fraco > essencial > questões > teoria
 */
export function buildReducedPlan({
  minutes = 20,
  dueReviewBlocks = [],
  weakSubtopics = [],
  essentialBlocks = [],
  eligibleSubtopics = [],
  userId = null,
  contestId = null,
  scopeKey = null,
  planId = null,
  planVersion = 1,
  generationId = null,
  algorithmVersion = null,
  date = dateKey(),
} = {}) {
  const plan = [];
  let remaining = Math.max(0, Number(minutes) || 0);
  const usedSubtopics = new Set();

  const push = (partial) => {
    const mins = Math.min(remaining, partial.plannedMinutes || 10);
    if (mins < 5 || remaining < 5 || !partial.subjectId || !partial.subtopicId) return false;
    if (usedSubtopics.has(partial.subtopicId)) return false;
    const candidate = {
      userId,
      contestId,
      scopeKey,
      planId,
      planVersion,
      generationId,
      algorithmVersion,
      date,
      plannedMinutes: mins,
      startTime: null,
      endTime: null,
      scheduleType: 'qualquer_horario',
      anchorType: 'manual',
      source: 'reduced',
      priority: partial.priority || 80,
      ...partial,
      plannedMinutes: mins,
    };
    plan.push(createRoutineBlock({
      ...candidate,
      id: stableStudyBlockId(planId, candidate, plan.length),
    }));
    usedSubtopics.add(partial.subtopicId);
    remaining -= mins;
    return remaining >= 5;
  };

  for (const review of dueReviewBlocks) {
    if (remaining < 5) break;
    push({
      activityType: 'revisao_fila',
      title: `Revisão rápida · ${review.name || review.title || 'conteúdo pendente'}`,
      subjectId: review.subjectId || review.discipline_id || review.disciplineId,
      subtopicId: review.subtopicId || review.id,
      plannedMinutes: Math.min(15, remaining),
      priority: 100,
    });
  }

  for (const weak of weakSubtopics) {
    if (remaining < 5) break;
    push({
      activityType: 'questoes',
      title: `Questões · ${weak.name || 'ponto fraco'}`,
      subtopicId: weak.id,
      subjectId: weak.discipline_id || weak.disciplineId || null,
      plannedMinutes: Math.min(15, remaining),
      priority: 90,
      description: 'Subtópico frágil / erros recentes',
    });
  }

  for (const essential of essentialBlocks) {
    if (remaining < 5) break;
    if (!['planned', 'in_progress'].includes(essential.status)) continue;
    push({
      activityType: essential.activityType,
      title: `Essencial · ${essential.title}`,
      subtopicId: essential.subtopicId,
      subjectId: essential.subjectId,
      plannedMinutes: Math.min(essential.plannedMinutes || 15, remaining),
      priority: 88,
    });
  }

  for (const candidate of eligibleSubtopics) {
    if (remaining < 5) break;
    push({
      activityType: 'questoes',
      title: `Questões · ${candidate.name || candidate.id}`,
      subjectId: candidate.discipline_id || candidate.disciplineId,
      subtopicId: candidate.id,
      plannedMinutes: Math.min(15, remaining),
      priority: 70,
    });
  }

  return plan;
}

/** Prioridade de redistribuição */
export function reschedulePriority(block) {
  const t = block.activityType;
  if (t === 'revisao_fila' || t === 'revisao') return 100;
  if (block.source === 'weakspot') return 90;
  if (t === 'questoes' || t === 'simulado') return 80;
  if (t === 'teoria' || t === 'lei_seca') return 60;
  return 40;
}

/**
 * Encontra espaço na semana (determinístico).
 * Retorna sugestão; NÃO aplica.
 */
export function suggestRescheduleSlot(block, profile, existingBlocks = [], {
  weekDates = [],
  preferTomorrow = false,
  today = dateKey(),
} = {}) {
  const sortedDates = [...weekDates].sort();
  const availability = validateStudyAvailability(profile, { weekDates: sortedDates });
  if (!availability.valid) {
    return { ok: false, suggestion: null, reason: 'A disponibilidade configurada precisa ser revisada.' };
  }
  const activeExisting = existingBlocks.filter((candidate) => candidate.id !== block.id);
  const existingWeekLoad = sortedDates.reduce((sum, date) => sum + dayLoadMinutes(activeExisting, date), 0);
  const blockMinutes = Number(block.plannedMinutes) || 0;
  if (existingWeekLoad + blockMinutes > availability.weeklyCapacity) {
    return { ok: false, suggestion: null, reason: 'A semana não possui capacidade disponível para este bloco.' };
  }
  let candidates = sortedDates.filter((d) => d >= today);
  if (preferTomorrow) {
    const tIdx = candidates.indexOf(today);
    if (tIdx >= 0) candidates = candidates.slice(tIdx + 1).concat(candidates.slice(0, tIdx + 1));
  }

  for (const date of candidates) {
    const dow = new Date(`${date}T12:00:00`).getDay();
    if ((profile.restDays || []).includes(dow)) continue;
    if ((profile.availableDays || []).length && !(profile.availableDays || []).includes(dow)) continue;

    const load = dayLoadMinutes(activeExisting, date);
    const mins = block.plannedMinutes || 25;
    if (load + mins > dailyCapacityForDate(profile, date)) continue;

    const dayBlocks = activeExisting.filter((b) => b.date === date && !['cancelled', 'rescheduled'].includes(b.status));
    if (dayBlocks.length >= (profile.maxBlocksPerDay || 4)) continue;

    const window = profile.dayWindows?.[dow] || { start: '19:00', end: '21:00' };
    let start = timeToMinutes(window.start) ?? 19 * 60;
    const endLimit = timeToMinutes(window.end) ?? 21 * 60;
    const occupied = dayBlocks
      .map((b) => ({ s: timeToMinutes(b.startTime), e: timeToMinutes(b.endTime) }))
      .filter((x) => x.s != null && x.e != null)
      .sort((a, b) => a.s - b.s);

    for (const slot of occupied) {
      if (start + mins <= slot.s) break;
      start = Math.max(start, slot.e + (profile.preferredBreakMinutes || 0));
    }
    if (start + mins > endLimit) continue;

    const suggestion = normalizeRoutineBlock({
      ...block,
      id: stableStudyBlockId(block.planId || `reschedule:${block.id}`, {
        ...block,
        date,
        source: 'reschedule',
      }),
      date,
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + mins),
      status: 'planned',
      rescheduledFrom: block.id,
      source: 'reschedule',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      actualMinutes: 0,
    });
    return {
      ok: true,
      suggestion,
      reason: `Espaço em ${date} às ${suggestion.startTime}, respeitando carga e janela.`,
    };
  }

  return { ok: false, suggestion: null, reason: 'Nenhum espaço livre nesta semana dentro dos limites.' };
}

export function applyReschedule(original, suggestion) {
  const rescheduledAt = new Date().toISOString();
  const from = normalizeRoutineBlock({
    ...original,
    status: 'rescheduled',
    rescheduledTo: suggestion.id,
    rescheduledAt,
    updatedAt: rescheduledAt,
  });
  const to = normalizeRoutineBlock({
    ...suggestion,
    rescheduledFrom: original.id,
    status: 'planned',
  });
  return { from, to };
}

export function sortBlocksForDay(blocks = []) {
  return [...blocks].sort((a, b) => {
    const ta = timeToMinutes(a.startTime);
    const tb = timeToMinutes(b.startTime);
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;
    return (b.priority || 0) - (a.priority || 0);
  });
}

export function nextActionableBlock(blocks = [], date = dateKey()) {
  const day = sortBlocksForDay(blocks.filter((b) => b.date === date));
  return day.find((b) => ['planned', 'in_progress', 'partially_completed'].includes(b.status)) || null;
}

export function weekDatesFrom(reference = new Date()) {
  const d = typeof reference === 'string' ? new Date(`${reference}T12:00:00`) : new Date(reference);
  const dow = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    out.push(dateKey(x));
  }
  return out;
}

export function expandWeeklyRecurrence(block, weekDates = []) {
  if (!block.recurrence || block.recurrence.frequency !== 'weekly') return [block];
  const days = block.recurrence.days || [];
  const seriesId = block.seriesId || block.recurrence.seriesId || makeId('series');
  return weekDates
    .filter((date) => days.includes(new Date(`${date}T12:00:00`).getDay()))
    .map((date) => normalizeRoutineBlock({
      ...block,
      id: makeId('block'),
      date,
      seriesId,
      recurrence: { ...block.recurrence, seriesId },
      status: 'planned',
      actualMinutes: 0,
      completedAt: null,
    }));
}

export function weakSpotSuggestions(subtopics = [], { limit = 5 } = {}) {
  return [...subtopics]
    .map((s) => {
      const accuracy = Number(s.best_accuracy ?? s.mastery_pct ?? 50);
      const temp = s.memory_temperature || 'morno';
      const tempScore = { congelado: 40, frio: 30, morno: 15, quente: 5 }[temp] || 10;
      const score = (100 - accuracy) + tempScore + (Number(s.incorrect_question_ids?.length) || 0);
      return {
        ...s,
        score,
        reason: `Acurácia ${accuracy.toFixed?.(0) ?? accuracy}% · memória ${temp}`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function activityButtonLabel(type) {
  return `Iniciar · ${activityLabel(type)}`;
}
