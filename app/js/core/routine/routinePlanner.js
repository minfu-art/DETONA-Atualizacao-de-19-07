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

  weekDates.forEach((date, idx) => {
    const dow = new Date(`${date}T12:00:00`).getDay();
    if ((profile.restDays || []).includes(dow) || !(profile.availableDays || []).includes(dow)) {
      return;
    }
    const window = profile.dayWindows?.[dow] || { start: '19:00', end: '21:00' };
    const startMin = timeToMinutes(window.start) ?? 19 * 60;
    let cursor = startMin;
    const dayBlocks = [];

    // 1) revisão se houver fila
    if (dueReviews > 0 && dayBlocks.length < profile.maxBlocksPerDay) {
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
      dayBlocks.push(b);
      cursor += b.plannedMinutes + (profile.preferredBreakMinutes || 5);
    }

    // 2) questões em ponto fraco
    const weak = weakSubtopics[idx % Math.max(1, weakSubtopics.length)];
    if (weak && dayBlocks.length < profile.maxBlocksPerDay) {
      const mins = session;
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
      dayBlocks.push(b);
      cursor += mins + (profile.preferredBreakMinutes || 5);
    }

    // 3) teoria / lei (modelos mais densos)
    if (profile.model !== 'leve' && dayBlocks.length < profile.maxBlocksPerDay) {
      const mins = Math.min(session, 30);
      const b = createRoutineBlock({
        userId, contestId, date,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + mins),
        plannedMinutes: mins,
        activityType: profile.model === 'intensa' ? 'lei_seca' : 'teoria',
        title: profile.model === 'intensa' ? 'Lei seca' : 'Teoria dirigida',
        priority: 60,
        source: 'template',
        scheduleType: 'janela_flexivel',
      });
      dayBlocks.push(b);
      cursor += mins;
    }

    // 4) simulado semanal (intensa, 1x)
    if (profile.model === 'intensa' && dow === 6 && dayBlocks.length < profile.maxBlocksPerDay) {
      dayBlocks.push(createRoutineBlock({
        userId, contestId, date,
        startTime: '10:00',
        endTime: '11:00',
        plannedMinutes: 60,
        activityType: 'simulado',
        title: 'Simulado semanal',
        priority: 90,
        source: 'template',
      }));
    }

    // respeita max diário
    let load = 0;
    for (const b of dayBlocks) {
      if (load + b.plannedMinutes > (profile.maxDailyMinutes || 90)) break;
      load += b.plannedMinutes;
      blocks.push(b);
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
  profile,
  dueReviews = 0,
  weakSubtopics = [],
  essentialBlocks = [],
  userId = null,
  contestId = null,
  date = dateKey(),
} = {}) {
  const plan = [];
  let remaining = Math.max(10, Number(minutes) || 20);

  const push = (partial) => {
    const mins = Math.min(remaining, partial.plannedMinutes || 10);
    if (mins < 5 || remaining < 5) return false;
    plan.push(createRoutineBlock({
      userId,
      contestId,
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
    }));
    remaining -= mins;
    return remaining >= 5;
  };

  if (dueReviews > 0 && remaining >= 5) {
    push({
      activityType: 'revisao_fila',
      title: 'Revisão rápida (fila)',
      plannedMinutes: Math.min(15, remaining),
      priority: 100,
    });
  }

  const weak = weakSubtopics[0];
  if (weak && remaining >= 5) {
    push({
      activityType: 'questoes',
      title: `Questões · ${weak.name || 'ponto fraco'}`,
      subtopicId: weak.id,
      subjectId: weak.discipline_id || null,
      plannedMinutes: Math.min(15, remaining),
      priority: 90,
      description: 'Subtópico frágil / erros recentes',
    });
  }

  const essential = (essentialBlocks || []).find((b) => b.status === 'planned' || b.status === 'in_progress');
  if (essential && remaining >= 5) {
    push({
      activityType: essential.activityType,
      title: `Essencial · ${essential.title}`,
      subtopicId: essential.subtopicId,
      subjectId: essential.subjectId,
      plannedMinutes: Math.min(essential.plannedMinutes || 15, remaining),
      priority: 88,
    });
  }

  if (remaining >= 5) {
    push({
      activityType: 'questoes',
      title: 'Mini sessão de questões',
      plannedMinutes: Math.min(10, remaining),
      priority: 70,
    });
  }

  if (remaining >= 5 && profile?.model !== 'leve') {
    push({
      activityType: 'teoria',
      title: 'Teoria em pílula',
      plannedMinutes: Math.min(10, remaining),
      priority: 50,
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
  let candidates = sortedDates.filter((d) => d >= today);
  if (preferTomorrow) {
    const tIdx = candidates.indexOf(today);
    if (tIdx >= 0) candidates = candidates.slice(tIdx + 1).concat(candidates.slice(0, tIdx + 1));
  }

  for (const date of candidates) {
    const dow = new Date(`${date}T12:00:00`).getDay();
    if ((profile.restDays || []).includes(dow)) continue;
    if ((profile.availableDays || []).length && !(profile.availableDays || []).includes(dow)) continue;

    const load = dayLoadMinutes(existingBlocks, date);
    const mins = block.plannedMinutes || 25;
    if (load + mins > (profile.maxDailyMinutes || 90)) continue;

    const dayBlocks = existingBlocks.filter((b) => b.date === date && !['cancelled', 'rescheduled'].includes(b.status));
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
    if (start + mins > endLimit + 30) continue; // pequena folga

    const suggestion = normalizeRoutineBlock({
      ...block,
      id: makeId('block'),
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
  const from = normalizeRoutineBlock({
    ...original,
    status: 'rescheduled',
    rescheduledTo: suggestion.id,
    updatedAt: new Date().toISOString(),
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
