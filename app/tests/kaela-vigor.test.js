import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KAELA,
  buildHabitCalendar,
  chooseKaelaGuidance,
  evaluateConsistencyLedger,
  habitRoutineEntries,
} from '../js/services/kaelaVigorService.js';
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
    catalog: { label: item.habitId, category: item.habitId === 'water' ? 'wellbeing' : 'study' },
    completed,
  };
}

test('Kaela possui identidade e caminho estável com fallback configurado', () => {
  assert.equal(KAELA.id, 'kaela');
  assert.equal(KAELA.asset, 'assets/helpers/kaela-vigor.webp');
  assert.match(KAELA.fallbackAsset, /^assets\//);
  assert.match(KAELA.role, /hábitos|constância/i);
});

test('Kaela escolhe exatamente uma mensagem pela prioridade definida', () => {
  const study = definition('theory_block');
  const water = definition('water');
  const all = chooseKaelaGuidance({
    allDone: true,
    total: 2,
    doneCount: 2,
    cards: [card(study, true), card(water, true)],
    configuration: { configured: true },
    consistency: {},
  });
  assert.equal(all.code, 'all_completed');
  const pending = chooseKaelaGuidance({
    allDone: false,
    total: 2,
    doneCount: 0,
    cards: [card(study), card(water)],
    configuration: { configured: true },
    consistency: {},
  });
  assert.equal(pending.code, 'pending');
  assert.equal(pending.definitionId, study.id);
});

test('configuração inicial aparece sem bloquear quem pulou', () => {
  const guidance = chooseKaelaGuidance({
    total: 0,
    doneCount: 0,
    cards: [],
    configuration: { configured: false, skipped: true },
    consistency: {},
  });
  assert.equal(guidance.code, 'configuration');
  assert.equal(guidance.action, 'configure');
});

test('fila visual é uma única comunicação e UI monta somente um card da Kaela', async () => {
  const source = await readFile(path.join(rootDir, 'js/ui/wellbeingUI.js'), 'utf8');
  assert.equal((source.match(/class="kaela-card"/g) || []).length, 1);
  assert.match(source, /chooseKaelaGuidance/);
});

test('escudo protege falha sem falsificar estado do hábito', () => {
  const states = [
    { date: '2026-07-27', planned: 3, minimumReached: false, completed: 0 },
  ];
  const ledger = evaluateConsistencyLedger({
    ledger: { shields: 1 },
    dailyStates: states,
    today: '2026-07-28',
  });
  assert.equal(ledger.shields, 0);
  assert.deepEqual(ledger.protectedDates, ['2026-07-27']);
  assert.equal(states[0].minimumReached, false);
  assert.equal(states[0].completed, 0);
});

test('semana com seis dias gera um escudo uma única vez e respeita teto dois', () => {
  const states = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-07-${String(20 + index).padStart(2, '0')}`,
    planned: 3,
    minimumReached: index < 6,
  }));
  const first = evaluateConsistencyLedger({
    ledger: { shields: 0 },
    dailyStates: states,
    today: '2026-07-27',
  });
  assert.equal(first.shields, 1);
  assert.deepEqual(first.awardedWeeks, ['2026-07-20']);
  const again = evaluateConsistencyLedger({ ledger: first, dailyStates: states, today: '2026-07-27' });
  assert.equal(again.shields, 1);
});

test('calendário preserva diferença entre cumprido, protegido, falha e não planejado', () => {
  const study = definition('theory_block');
  const date = '2026-07-29';
  const logs = [createHabitDailyLog({ definition: study, localDate: date, completedValue: 1 })];
  const calendar = buildHabitCalendar({
    definitions: [study],
    logs,
    today: date,
    days: 3,
    protectedDates: ['2026-07-28'],
  });
  assert.deepEqual(calendar.map((item) => item.state), ['missed', 'protected', 'completed']);
});

test('lembretes entram na rotina sem duplicação e mudar horário não apaga log', () => {
  const first = definition('exercise', { reminderTime: '07:00' });
  const duplicate = { ...first };
  const entries = habitRoutineEntries([first, duplicate], '2026-07-29');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].time, '07:00');
  const changed = habitRoutineEntries([{ ...first, reminderTime: '08:30' }], '2026-07-29');
  assert.equal(changed[0].id, entries[0].id);
  assert.equal(changed[0].time, '08:30');
});

test('responsividade cobre celular pequeno, tablet e desktop sem rolagem horizontal', async () => {
  const css = await readFile(path.join(rootDir, 'css/design-system.css'), 'utf8');
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /@media \(min-width: 760px\)/);
  assert.match(css, /\.pd-calendar\s*\{[^}]*grid-template-columns/s);
  assert.doesNotMatch(css, /\.pd-screen[^}]*overflow-x\s*:\s*scroll/s);
});
