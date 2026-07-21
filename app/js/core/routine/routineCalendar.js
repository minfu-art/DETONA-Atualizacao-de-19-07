/**
 * Rotina V3 — calendário dinâmico e jornada até a prova (puro, sem I/O).
 * Não concede XP nem altera domínio/estrelas.
 */
import { dateKey } from './routineSchema.js';

export const WEEKDAY_SHORT = Object.freeze(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
export const WEEKDAY_FULL = Object.freeze([
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
]);
export const MONTH_NAMES = Object.freeze([
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]);

export function parseDateKey(key) {
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDays(key, delta) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

export function startOfWeek(key) {
  const d = parseDateKey(key);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return dateKey(d);
}

export function weekDatesFrom(keyOrDate = new Date()) {
  const key = typeof keyOrDate === 'string' ? keyOrDate.slice(0, 10) : dateKey(keyOrDate);
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function shiftWeek(weekStart, deltaWeeks) {
  return addDays(startOfWeek(weekStart), deltaWeeks * 7);
}

export function monthMatrix(year, monthIndex) {
  // monthIndex 0-11; cells include leading/trailing days of adjacent months
  const first = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, monthIndex, 1 - (startPad - i), 12, 0, 0, 0);
    cells.push({ date: dateKey(d), inMonth: false, day: d.getDate() });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day, 12, 0, 0, 0);
    cells.push({ date: dateKey(d), inMonth: true, day });
  }
  while (cells.length % 7 !== 0) {
    const last = parseDateKey(cells[cells.length - 1].date);
    last.setDate(last.getDate() + 1);
    cells.push({ date: dateKey(last), inMonth: false, day: last.getDate() });
  }
  return cells;
}

export function shiftMonth(year, monthIndex, delta) {
  const d = new Date(year, monthIndex + delta, 1, 12, 0, 0, 0);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

/**
 * Agrega blocos por dia para calendário.
 * @param {Array} blocks
 * @param {string[]} dates
 */
export function aggregateDays(blocks = [], dates = [], dailyStates = []) {
  const byDate = Object.fromEntries(dates.map((d) => [d, {
    date: d,
    blocks: [],
    plannedMinutes: 0,
    actualMinutes: 0,
    completed: 0,
    skipped: 0,
    rescheduled: 0,
    reviews: 0,
    questions: 0,
    restDay: false,
    minGoalMet: false,
  }]));
  for (const st of dailyStates) {
    if (byDate[st.date]) {
      byDate[st.date].restDay = !!st.restDay;
      byDate[st.date].minGoalMet = !!st.minGoalMet;
      byDate[st.date].actualMinutes = Math.max(byDate[st.date].actualMinutes, st.actualMinutes || 0);
    }
  }
  for (const b of blocks) {
    const day = byDate[b.date];
    if (!day) continue;
    if (['cancelled'].includes(b.status)) continue;
    day.blocks.push(b);
    if (!['rescheduled', 'cancelled'].includes(b.status)) {
      day.plannedMinutes += Number(b.plannedMinutes) || 0;
    }
    day.actualMinutes += Number(b.actualMinutes) || 0;
    if (b.status === 'completed') day.completed += 1;
    if (b.status === 'skipped') day.skipped += 1;
    if (b.status === 'rescheduled') day.rescheduled += 1;
    if (['revisao', 'revisao_fila'].includes(b.activityType)) day.reviews += 1;
    if (b.activityType === 'questoes') day.questions += 1;
  }
  return dates.map((d) => byDate[d]);
}

export function dayLoadLevel(plannedMinutes, maxDaily = 90) {
  if (!plannedMinutes) return 'empty';
  if (plannedMinutes > maxDaily) return 'overload';
  if (plannedMinutes > maxDaily * 0.75) return 'high';
  if (plannedMinutes > maxDaily * 0.35) return 'mid';
  return 'low';
}

/**
 * Contagem regressiva e jornada temporal até a prova.
 * Avatar chibi usa positionPct (0–100) na trilha — NÃO é XP.
 */
export function examJourney({
  examDate,
  startDate,
  today = dateKey(),
} = {}) {
  if (!examDate) {
    return {
      hasExam: false,
      examDate: null,
      daysLeft: null,
      weeksLeft: null,
      elapsedPct: 0,
      remainingPct: 100,
      positionPct: 0,
      phase: 'sem_data',
      milestones: [],
    };
  }
  const exam = parseDateKey(examDate);
  const todayD = parseDateKey(today);
  const start = startDate ? parseDateKey(startDate) : new Date(exam.getTime() - 90 * 86400000);
  // se start > today, usa 90 dias antes da prova
  let startMs = start.getTime();
  const examMs = exam.getTime();
  const todayMs = todayD.getTime();
  if (startMs >= examMs) startMs = examMs - 90 * 86400000;

  const total = Math.max(1, examMs - startMs);
  const elapsed = Math.min(total, Math.max(0, todayMs - startMs));
  const remaining = Math.max(0, examMs - todayMs);
  const daysLeft = Math.ceil(remaining / 86400000);
  const weeksLeft = Math.max(0, Math.ceil(daysLeft / 7));
  const elapsedPct = Math.min(100, Math.round((elapsed / total) * 1000) / 10);
  const remainingPct = Math.min(100, Math.round((remaining / total) * 1000) / 10);
  const positionPct = Math.min(100, Math.max(0, elapsedPct));

  let phase = 'preparacao';
  if (daysLeft <= 0) phase = 'prova';
  else if (daysLeft <= 7) phase = 'semana_prova';
  else if (daysLeft <= 30) phase = 'reta_final';
  else if (elapsedPct >= 50) phase = 'meio';

  const milestones = buildMilestones(startMs, examMs, todayMs);

  return {
    hasExam: true,
    examDate: dateKey(exam),
    daysLeft,
    weeksLeft,
    elapsedPct,
    remainingPct,
    positionPct,
    phase,
    milestones,
    totalDays: Math.round(total / 86400000),
  };
}

function buildMilestones(startMs, examMs, todayMs) {
  const total = examMs - startMs;
  const points = [
    { id: 'start', label: 'Início', at: 0 },
    { id: 'm1', label: '1º mês', at: 0.25 },
    { id: 'rev1', label: 'Revisão 1', at: 0.45 },
    { id: 'mid', label: 'Meio do caminho', at: 0.5 },
    { id: 'rev2', label: 'Revisão 2', at: 0.7 },
    { id: 'final', label: 'Reta final', at: 0.85 },
    { id: 'week', label: 'Semana da prova', at: 0.95 },
    { id: 'exam', label: 'Dia da prova', at: 1 },
  ];
  return points.map((p) => {
    const ms = startMs + total * p.at;
    const date = dateKey(new Date(ms));
    const passed = todayMs >= ms;
    return {
      id: p.id,
      label: p.label,
      date,
      pct: Math.round(p.at * 100),
      passed,
      isToday: date === dateKey(new Date(todayMs)),
    };
  });
}

export function chibiState(journey) {
  if (!journey?.hasExam) return { pose: 'idle', message: 'Defina a data da prova e comece a jornada.' };
  if (journey.phase === 'prova') return { pose: 'celebrate', message: 'Chegou o grande dia. Confie no que você construiu.' };
  if (journey.phase === 'semana_prova') return { pose: 'focus', message: 'Semana da prova: um passo de cada vez.' };
  if (journey.phase === 'reta_final') return { pose: 'walk', message: 'Reta final — falta menos do que antes.' };
  return { pose: 'walk', message: 'Vamos dar o próximo passo?' };
}

export function weekSummaryStats(dayAggs = []) {
  const planned = dayAggs.reduce((s, d) => s + d.plannedMinutes, 0);
  const actual = dayAggs.reduce((s, d) => s + d.actualMinutes, 0);
  const completed = dayAggs.reduce((s, d) => s + d.completed, 0);
  const blocks = dayAggs.reduce((s, d) => s + d.blocks.length, 0);
  const met = dayAggs.filter((d) => d.minGoalMet).length;
  return {
    plannedMinutes: planned,
    actualMinutes: actual,
    completedBlocks: completed,
    totalBlocks: blocks,
    daysWithPlan: dayAggs.filter((d) => d.plannedMinutes > 0).length,
    daysMet: met,
    adherence: planned > 0 ? Math.min(100, Math.round((Math.min(actual, planned) / planned) * 100)) : 0,
  };
}
