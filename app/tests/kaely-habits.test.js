import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KAELY,
  agendaState,
  buildHabitAnalysis,
  buildHabitCalendar,
  buildHabitHistory,
  buildWeekStrip,
  chooseKaelyGuidance,
  evaluateConsistencyLedger,
  habitRoutineEntries,
  nextHabitFromAgenda,
} from '../js/services/kaelyHabitService.js';
import {
  createHabitDailyLog,
  createHabitDefinition,
} from '../js/core/habitSystem.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function definition(habitId, overrides = {}) {
  return createHabitDefinition({
    habitId,
    userId: 'student-a',
    contestId: 'contest-a',
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    now: '2026-07-01T12:00:00.000Z',
    ...overrides,
  });
}

function card(item, completed = false) {
  return {
    definition: item,
    catalog: { label: item.habitId, category: 'wellbeing' },
    habit: { name: item.habitId },
    completed,
    status: completed ? 'completed' : 'planned',
  };
}

test('Kaely possui identidade oficial e asset final sem pendência', async () => {
  assert.equal(KAELY.id, 'kaely');
  assert.equal(KAELY.fullName, 'Kaely — Mentora da Resistência');
  assert.equal(KAELY.asset, 'assets/mentors/kaely-resistance.webp');
  assert.equal(KAELY.assetPending, false);
  assert.ok((await stat(path.join(rootDir, KAELY.asset))).size > 10_000);
});

test('Kaely escolhe exatamente uma orientação contextual', () => {
  const water = definition('water', { reminderTime: '13:30' });
  const guidance = chooseKaelyGuidance({
    total: 1,
    doneCount: 0,
    cards: [card(water)],
    configuration: { configured: true },
    consistency: {},
  }, { title: 'Beber água', time: '13:30', definitionId: water.id, card: card(water) });
  assert.equal(guidance.code, 'pending');
  assert.equal(guidance.definitionId, water.id);
  assert.match(guidance.message, /13:30/);
});

test('barra semanal possui sete dias e preserva seleção', () => {
  const water = definition('water');
  const week = buildWeekStrip({
    definitions: [water],
    logs: [],
    selectedDate: '2026-07-30',
    today: '2026-07-30',
  });
  assert.equal(week.length, 7);
  assert.equal(week.filter((day) => day.selected).length, 1);
  assert.equal(week.find((day) => day.isToday)?.date, '2026-07-30');
});

test('agenda ordena horários, aceita sem horário e não duplica hábito', () => {
  const early = definition('water', { reminderTime: '07:00' });
  const late = definition('exercise', { reminderTime: '17:30' });
  const free = definition('meditation');
  const entries = habitRoutineEntries([late, early, { ...early }, free], '2026-07-30');
  assert.deepEqual(entries.map((entry) => entry.time), ['07:00', '17:30', null]);
});

test('agenda identifica próximo, atrasado, concluído e ignorado', () => {
  const water = definition('water', { reminderTime: '08:00' });
  const [entry] = habitRoutineEntries([water], '2026-07-30');
  assert.equal(agendaState(entry, { now: new Date('2026-07-30T07:00:00'), today: '2026-07-30' }), 'próximo');
  assert.equal(agendaState(entry, { now: new Date('2026-07-30T09:00:00'), today: '2026-07-30' }), 'atrasado');
  assert.equal(agendaState({ ...entry, status: 'completed' }), 'concluído');
  assert.equal(agendaState({ ...entry, status: 'skipped' }), 'ignorado hoje');
});

test('próximo hábito ignora concluídos e exceções do dia', () => {
  const entries = [
    { status: 'completed', date: '2026-07-30' },
    { status: 'skipped', date: '2026-07-30' },
    { status: 'planned', date: '2026-07-30' },
  ];
  assert.equal(nextHabitFromAgenda(entries, { today: '2026-07-30' }), entries[2]);
});

test('histórico semanal separa planejados, completos, parciais e vazios', () => {
  const water = definition('water');
  const logs = [
    createHabitDailyLog({ definition: water, localDate: '2026-07-27', completedValue: water.target }),
    createHabitDailyLog({ definition: water, localDate: '2026-07-28', completedValue: 2, status: 'partial' }),
  ];
  const history = buildHabitHistory({ definitions: [water], logs, today: '2026-07-30' });
  assert.ok(history.planned >= 4);
  assert.equal(history.completed, 1);
  assert.ok(history.partialDays >= 1);
  assert.ok(history.emptyDays >= 1);
});

test('análise usa somente registros para taxa, horário e dias frágeis', () => {
  const creatine = definition('creatine', { reminderTime: '13:00' });
  const logs = [
    createHabitDailyLog({ definition: creatine, localDate: '2026-07-29', completedValue: 1, actualTime: '13:20' }),
  ];
  const [analysis] = buildHabitAnalysis({ definitions: [creatine], logs, today: '2026-07-30', days: 7 });
  assert.equal(analysis.completed, 1);
  assert.equal(analysis.frequentTime, '13:20');
  assert.ok(analysis.weakDays.length > 0);
  assert.doesNotMatch(analysis.suggestion, /diagnóstico|transtorno|doença/i);
});

test('calendário distingue completo, parcial, protegido, falha e livre', () => {
  const water = definition('water');
  const complete = createHabitDailyLog({ definition: water, localDate: '2026-07-30', completedValue: water.target });
  const partial = createHabitDailyLog({ definition: water, localDate: '2026-07-29', completedValue: 2, status: 'partial' });
  const calendar = buildHabitCalendar({
    definitions: [water],
    logs: [complete, partial],
    today: '2026-07-30',
    days: 4,
    protectedDates: ['2026-07-28'],
  });
  assert.deepEqual(calendar.map((day) => day.state), ['missed', 'protected', 'partial', 'completed']);
});

test('escudo preserva sequência sem falsificar hábito real', () => {
  const states = [{ date: '2026-07-27', planned: 3, minimumReached: false, completed: 0 }];
  const ledger = evaluateConsistencyLedger({ ledger: { shields: 1 }, dailyStates: states, today: '2026-07-28' });
  assert.equal(ledger.shields, 0);
  assert.deepEqual(ledger.protectedDates, ['2026-07-27']);
  assert.equal(states[0].completed, 0);
});

test('interface monta uma única comunicação direta da Kaely', async () => {
  const source = await readFile(path.join(rootDir, 'js/ui/wellbeingUI.js'), 'utf8');
  assert.equal((source.match(/class="kaely-hero"/g) || []).length, 1);
  assert.equal((source.match(/chooseKaelyGuidance/g) || []).length, 2);
  assert.doesNotMatch(source, /class="(?:orion|evi|mentor)-[^"]*hero"/);
});
