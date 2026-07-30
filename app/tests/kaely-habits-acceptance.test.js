import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HABIT_RECORD_TYPES,
  createHabitDailyLog,
  createHabitDefinition,
  dailyHabitStatus,
  getHabitCatalogItem,
  habitPrivacyStatement,
  isHabitPlannedOn,
  migrateLegacyWellbeing,
} from '../js/core/habitSystem.js';
import {
  KAELY,
  agendaState,
  buildHabitAnalysis,
  buildHabitCalendar,
  buildHabitHistory,
  buildWeekStrip,
  habitRoutineEntries,
  nextHabitFromAgenda,
} from '../js/services/kaelyHabitService.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = '2026-07-30';

async function source(relative) {
  return readFile(path.join(rootDir, relative), 'utf8');
}

function definition(habitId, overrides = {}) {
  return createHabitDefinition({
    habitId,
    userId: 'student-a',
    contestId: 'contest-a',
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    now: `${today}T10:00:00.000Z`,
    ...overrides,
  });
}

function logFor(item, overrides = {}) {
  return createHabitDailyLog({
    definition: item,
    localDate: today,
    now: `${today}T12:00:00.000Z`,
    ...overrides,
  });
}

test('01 — área foi renomeada para Hábitos', async () => {
  assert.match(await source('js/ui/navigation.js'), /label: 'Hábitos'/);
});

test('02 — título principal é Hábitos do dia', async () => {
  assert.match(await source('js/ui/wellbeingUI.js'), /Hábitos do dia/);
});

test('03 — menu usa coração com pulsação', async () => {
  const [navigation, icons] = await Promise.all([source('js/ui/navigation.js'), source('js/ui/icons.js')]);
  assert.match(navigation, /icon: 'heartPulse'/);
  assert.match(icons, /heartPulse:/);
});

test('04 — mentora possui identidade oficial', () => {
  assert.equal(KAELY.fullName, 'Kaely — Mentora da Resistência');
});

test('05 — asset oficial transparente está presente', async () => {
  const info = await stat(path.join(rootDir, KAELY.asset));
  assert.ok(info.size > 10_000);
});

test('06 — fallback da arte não aponta para avatar genérico', () => {
  assert.notEqual(KAELY.fallback, 'assets/avatar.png');
});

test('07 — faixa semanal contém sete dias', () => {
  assert.equal(buildWeekStrip({ selectedDate: today, today }).length, 7);
});

test('08 — faixa semanal marca o dia selecionado', () => {
  assert.equal(buildWeekStrip({ selectedDate: today, today }).filter((day) => day.selected).length, 1);
});

test('09 — agenda ordena hábitos por horário', () => {
  const late = definition('water', { reminderTime: '20:00' });
  const early = definition('exercise', { reminderTime: '07:00' });
  assert.deepEqual(habitRoutineEntries([late, early], today).map((item) => item.time), ['07:00', '20:00']);
});

test('10 — agenda elimina definições duplicadas', () => {
  const water = definition('water');
  assert.equal(habitRoutineEntries([water, water], today).length, 1);
});

test('11 — próximo hábito ignora item concluído', () => {
  const water = definition('water');
  const exercise = definition('exercise');
  const logs = [logFor(water, { completedValue: water.target })];
  assert.equal(nextHabitFromAgenda(habitRoutineEntries([water, exercise], today, logs)).definitionId, exercise.id);
});

test('12 — horário atrasado é identificado', () => {
  const water = definition('water', { reminderTime: '07:00' });
  const [entry] = habitRoutineEntries([water], today);
  assert.equal(agendaState(entry, { today, now: new Date(`${today}T12:00:00`) }), 'atrasado');
});

test('13 — hidratação é quantitativa', () => {
  assert.equal(getHabitCatalogItem('water').recordType, HABIT_RECORD_TYPES.QUANTITATIVE);
});

test('14 — água registra progresso abaixo da meta sem conclusão', () => {
  const water = definition('water', { target: 8 });
  const log = logFor(water, { completedValue: 1 });
  assert.equal(log.completed, false);
});

test('15 — água só conclui ao alcançar a meta em registro normal', () => {
  const water = definition('water', { target: 8 });
  assert.equal(logFor(water, { completedValue: 8 }).completed, true);
});

test('16 — reduzir valor nunca produz quantidade negativa', () => {
  const water = definition('water');
  assert.equal(logFor(water, { completedValue: -2 }).completedValue, 0);
});

test('17 — creatina usa confirmação booleana', () => {
  assert.equal(getHabitCatalogItem('creatine').recordType, HABIT_RECORD_TYPES.BOOLEAN);
});

test('18 — medicação usa confirmação booleana e aviso privado', () => {
  assert.equal(getHabitCatalogItem('medication').recordType, HABIT_RECORD_TYPES.BOOLEAN);
  assert.match(habitPrivacyStatement(getHabitCatalogItem('medication')), /não substituem orientação (médica ou )?profissional/i);
});

test('19 — sono aceita horário real', () => {
  const sleep = definition('sleep_schedule');
  assert.equal(logFor(sleep, { completedValue: 1, actualTime: '06:15' }).actualTime, '06:15');
});

test('20 — sono limita qualidade à escala de um a cinco', () => {
  const sleep = definition('sleep_schedule');
  assert.equal(logFor(sleep, { completedValue: 1, quality: 9 }).quality, 5);
});

test('21 — energia percebida suporta escala', () => {
  assert.equal(getHabitCatalogItem('energy_level').recordType, HABIT_RECORD_TYPES.SCALE);
});

test('22 — exercício completo é concluído', () => {
  const exercise = definition('exercise', { target: 30 });
  assert.equal(logFor(exercise, { completedValue: 30, status: 'completed' }).completed, true);
});

test('23 — exercício parcial não é promovido a completo', () => {
  const exercise = definition('exercise', { target: 30 });
  assert.equal(logFor(exercise, { completedValue: 20, status: 'partial' }).completed, false);
});

test('24 — mínimo possível não é promovido a completo mesmo alcançando a meta', () => {
  const exercise = definition('exercise', { target: 10 });
  assert.equal(logFor(exercise, { completedValue: 10, status: 'minimum' }).completed, false);
});

test('25 — dia sem hábitos permanece não planejado', () => {
  assert.equal(dailyHabitStatus({ definitions: [], logs: [], date: today }).planned, 0);
});

test('26 — hábito pausado não entra no dia', () => {
  const water = definition('water', { pausedUntil: '2026-08-02' });
  assert.equal(isHabitPlannedOn(water, today), false);
});

test('27 — exceção de hoje preserva outros dias', () => {
  const water = definition('water');
  const skipped = logFor(water, { status: 'skipped' });
  const tomorrow = dailyHabitStatus({ definitions: [water], logs: [skipped], date: '2026-07-31' });
  assert.equal(tomorrow.planned, 1);
});

test('28 — adiamento preserva horário original', () => {
  const water = definition('water', { reminderTime: '08:00' });
  const postponed = logFor(water, { plannedTime: '10:00', originalPlannedTime: '08:00' });
  assert.equal(postponed.originalPlannedTime, '08:00');
});

test('29 — histórico semanal calcula aderência', () => {
  const water = definition('water');
  const history = buildHabitHistory({ definitions: [water], logs: [logFor(water, { completedValue: water.target })], today });
  assert.ok(history.rate >= 0 && history.rate <= 100);
});

test('30 — análise individual calcula série atual', () => {
  const water = definition('water');
  const [result] = buildHabitAnalysis({ definitions: [water], logs: [logFor(water, { completedValue: water.target })], today });
  assert.equal(typeof result.rate, 'number');
});

test('31 — calendário de 30 dias possui estados ricos', () => {
  const water = definition('water');
  const calendar = buildHabitCalendar({ definitions: [water], logs: [], today, days: 30 });
  assert.equal(calendar.length, 30);
  assert.ok(calendar.every((day) => ['completed', 'partial', 'protected', 'missed', 'unplanned'].includes(day.state)));
});

test('32 — dados continuam isolados por usuário e concurso', () => {
  const water = definition('water');
  assert.equal(water.userId, 'student-a');
  assert.equal(water.contestId, 'contest-a');
});

test('33 — migração legada preserva registro de água', () => {
  const migrated = migrateLegacyWellbeing({
    habits: [{ id: 'wb_agua', enabled: true, daily_target: 8 }],
    logs: [{ id: 'old', habit_id: 'wb_agua', date: today, amount_done: 3 }],
    userId: 'student-a',
    contestId: 'contest-a',
  });
  assert.equal(migrated.logs[0].completedValue, 3);
});

test('34 — persistência permanece no progressRepository', async () => {
  assert.match(await source('js/core/wellbeing.js'), /progressRepository/);
});

test('35 — a tela renderiza somente uma hero da Kaely', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  assert.equal((ui.match(/class="kaely-hero"/g) || []).length, 1);
});

test('36 — hábitos não concedem XP, domínio ou estrelas', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  assert.doesNotMatch(ui, /grantXp|recalculateEdital|awardStars|addXp/);
});

test('37 — controles possuem rótulos e estados acessíveis', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /aria-label=/);
  assert.match(ui, /aria-pressed=/);
});

test('38 — layout inclui tratamento dedicado para 320 px', async () => {
  assert.match(await source('css/design-system.css'), /max-width:\s*320px/);
});

test('39 — layout cobre 360, 390 e tablet sem rolagem horizontal', async () => {
  const css = await source('css/design-system.css');
  assert.match(css, /max-width:\s*390px/);
  assert.match(css, /min-width:\s*720px/);
  assert.match(css, /overflow-x:\s*clip/);
});

test('40 — desktop profissional mantém grade e movimento reduzido', async () => {
  const css = await source('css/design-system.css');
  assert.match(css, /min-width:\s*1040px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
