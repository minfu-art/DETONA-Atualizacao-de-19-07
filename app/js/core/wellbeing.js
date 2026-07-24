/**
 * Preparação do Dia / Bem-Estar — autocuidado e constância.
 * REGRA: este módulo NÃO concede XP, nível, estrelas, domínio nem progresso de edital.
 * Recompensa própria opcional: Vigor (discreto), nunca convertido em XP.
 */
import { STORES, getAll, getById, put, putMany, getMeta, setMeta } from './db.js';
import { defaultWellbeingHabits } from '../data/editalSeed.js';
import { localDateKey } from './localDate.js';

function todayStr() {
  return localDateKey();
}

/** Vigor por dia completo (constância) — NÃO é XP. */
export const VIGOR_FULL_DAY = 1;

export async function ensureWellbeingHabits() {
  if (await getMeta('wellbeing_seeded')) {
    const list = await getAll(STORES.wellbeingHabits);
    if (list.length) return list;
  }
  const habits = defaultWellbeingHabits();
  await putMany(STORES.wellbeingHabits, habits);
  await setMeta('wellbeing_seeded', true);
  return habits;
}

export function logId(habitId, date) {
  return `${habitId}|${date}`;
}

export async function getTodayWellbeingState() {
  const today = todayStr();
  const habits = (await ensureWellbeingHabits()).filter((h) => h.enabled !== false);
  const logs = await getAll(STORES.wellbeingLogs);
  const todayLogs = logs.filter((l) => l.date === today);
  const byHabit = Object.fromEntries(todayLogs.map((l) => [l.habit_id, l]));

  const cards = habits.map((h) => {
    const log = byHabit[h.id] || {
      id: logId(h.id, today),
      habit_id: h.id,
      date: today,
      amount_done: 0,
      completed: false,
    };
    const target = h.daily_target || 1;
    const done = log.amount_done || 0;
    const pct = Math.min(100, Math.round((done / target) * 100));
    const completed = log.completed || done >= target;
    return { habit: h, log, pct, completed, done, target };
  });

  const allDone = cards.length > 0 && cards.every((c) => c.completed);
  const doneCount = cards.filter((c) => c.completed).length;
  const vigor = Number(await getMeta('wellbeing_vigor')) || 0;
  return { today, cards, allDone, doneCount, total: cards.length, vigor };
}

export async function setHabitAmount(habitId, amount) {
  const habits = await getAll(STORES.wellbeingHabits);
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) throw new Error('Hábito não encontrado');
  const today = todayStr();
  const target = habit.daily_target || 1;
  const amount_done = Math.max(0, amount);
  const completed = amount_done >= target;
  const row = {
    id: logId(habitId, today),
    habit_id: habitId,
    date: today,
    amount_done,
    completed,
  };
  await put(STORES.wellbeingLogs, row);
  return grantVigorIfReady();
}

export async function incrementHabit(habitId, delta = 1) {
  const today = todayStr();
  const existing = await getById(STORES.wellbeingLogs, logId(habitId, today));
  const current = existing?.amount_done || 0;
  return setHabitAmount(habitId, current + delta);
}

export async function toggleHabit(habitId) {
  const habits = await getAll(STORES.wellbeingHabits);
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) throw new Error('Hábito não encontrado');
  const today = todayStr();
  const existing = await getById(STORES.wellbeingLogs, logId(habitId, today));
  const done = existing?.completed ? 0 : (habit.daily_target || 1);
  return setHabitAmount(habitId, done);
}

/**
 * Marca uma “prática mínima” rápida (ex.: +1 copo, +1 min) sem XP.
 */
export async function completeMicroPractice(habitId, amount = null) {
  const habits = await getAll(STORES.wellbeingHabits);
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) throw new Error('Hábito não encontrado');
  if (habit.input_type === 'toggle') return toggleHabit(habitId);
  const today = todayStr();
  const existing = await getById(STORES.wellbeingLogs, logId(habitId, today));
  const current = existing?.amount_done || 0;
  const step = amount != null ? amount : (habit.category === 'exercicio' ? 5 : 1);
  return setHabitAmount(habitId, current + step);
}

/** Vigor 1x/dia se todos os hábitos ativos estiverem completos. Sem XP. */
export async function grantVigorIfReady() {
  const { allDone, today, vigor: currentVigor } = await getTodayWellbeingState();
  if (!allDone) return { vigor: 0, granted: false, totalVigor: currentVigor || 0, bonus: 0 };

  const key = `wellbeing_vigor_${today}`;
  if (await getMeta(key)) {
    return { vigor: 0, granted: false, already: true, totalVigor: currentVigor || 0, bonus: 0 };
  }

  const prev = Number(await getMeta('wellbeing_vigor')) || 0;
  const next = prev + VIGOR_FULL_DAY;
  await setMeta('wellbeing_vigor', next);
  await setMeta(key, true);
  return { vigor: VIGOR_FULL_DAY, granted: true, totalVigor: next, bonus: 0 };
}

/** Compat: nunca concede XP (bonus sempre 0). */
export async function grantWellbeingBonusIfReady() {
  const r = await grantVigorIfReady();
  return {
    bonus: 0,
    vigor: r.vigor || 0,
    granted: r.granted,
    already: r.already,
    leveledUp: false,
    totalVigor: r.totalVigor,
  };
}

export async function spendVigor(amount = 1) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const prev = Number(await getMeta('wellbeing_vigor')) || 0;
  if (prev < n) throw new Error('Vigor insuficiente.');
  const next = prev - n;
  await setMeta('wellbeing_vigor', next);
  return { spent: n, totalVigor: next };
}

export const WELLBEING_ACADEMIC_SIDE_EFFECTS = Object.freeze({
  grantsXp: false,
  changesLevel: false,
  changesStars: false,
  changesMastery: false,
  changesEdital: false,
  canConvertVigorToXp: false,
  evolvesCharacter: false,
});

export const HABIT_COLORS = {
  agua: '#38bdf8',
  exercicio: '#4ade80',
  alimentacao: '#fb923c',
  meditacao: '#a78bfa',
  sono: '#818cf8',
  outro: '#94a3b8',
};
