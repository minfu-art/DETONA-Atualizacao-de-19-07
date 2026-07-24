/**
 * Meta diária de estudo — SSOT via DailyLog + StudyRoutine
 */
import { STORES, getAll, getById } from './db.js';
import { localDateKey } from './localDate.js';

function todayStr() {
  return localDateKey();
}

export function goalTypeLabel(type) {
  if (type === 'batalhas') return 'batalhas';
  if (type === 'tempo') return 'min';
  return 'questões';
}

export async function getTodayRoutine() {
  const routines = await getAll(STORES.routines);
  const dow = new Date().getDay();
  return routines.find((r) => r.day_of_week === dow) || {
    day_of_week: dow,
    enabled: true,
    goal_type: 'questoes',
    goal_amount: 30,
    focus_discipline_id: 'auto',
    start_time: '19:00',
    end_time: '21:00',
  };
}

export async function getTodayLog(routine) {
  const today = todayStr();
  let log = await getById(STORES.dailyLogs, today);
  if (!log) {
    const planned = routine?.enabled === false ? 0 : (routine?.goal_amount || 30);
    log = {
      date: today,
      planned_amount: planned,
      completed_amount: 0,
      status: 'pendente',
      xp_earned: 0,
      meta_bonus_granted: false,
    };
  }
  return log;
}

/**
 * Progresso 0–100 da meta diária
 */
export function metaProgress(log, routine) {
  const planned = log?.planned_amount ?? routine?.goal_amount ?? 30;
  if (!planned || routine?.enabled === false) {
    return { pct: 0, done: 0, planned: 0, complete: false, idle: true };
  }
  const done = log?.completed_amount || 0;
  const pct = Math.min(100, Math.round((done / planned) * 100));
  const complete = done >= planned || log?.status === 'cumprido';
  return { pct, done, planned, complete, idle: false };
}

export function metaPreviewText(routine, log) {
  if (!routine || routine.enabled === false) {
    return 'Hoje é dia de descanso · sem meta de estudo';
  }
  const unit = goalTypeLabel(routine.goal_type);
  const amount = routine.goal_amount || 0;
  const done = log?.completed_amount || 0;
  return `Meta de hoje: ${amount} ${unit} · ${done}/${amount}`;
}

/** Datas da semana corrente (dom→sáb) YYYY-MM-DD */
export function currentWeekDates() {
  const now = new Date();
  const dow = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dow);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(localDateKey(d));
  }
  return days;
}

/**
 * Resumo semanal: dias com rotina enabled cumpridos
 */
export async function weekSummary(routines, logs) {
  const week = currentWeekDates();
  const logMap = Object.fromEntries((logs || []).map((l) => [l.date, l]));
  const rMap = Object.fromEntries((routines || []).map((r) => [r.day_of_week, r]));
  let plannedDays = 0;
  let doneDays = 0;
  week.forEach((dateStr, i) => {
    const r = rMap[i];
    if (!r?.enabled) return;
    plannedDays += 1;
    const log = logMap[dateStr];
    if (log?.status === 'cumprido') doneDays += 1;
  });
  return { plannedDays, doneDays, week };
}
