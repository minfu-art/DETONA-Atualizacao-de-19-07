import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  HABIT_CATALOG,
  HABIT_RECORD_TYPES,
  calculateHabitConsistency,
  createHabitDailyLog,
  createHabitDefinition,
} from '../js/core/habitSystem.js';
import {
  disableAllHabits,
  incrementHabitForDate,
  recordHabitDetails,
  saveHabitConfiguration,
  setHabitAmountForDate,
  skipHabitConfiguration,
  skipHabitForDate,
  toggleHabitForDate,
} from '../js/core/wellbeing.js';
import {
  buildHabitAnalysis,
  buildHabitHistory,
  chooseKaelyGuidance,
  evaluateConsistencyLedger,
} from '../js/services/kaelyHabitService.js';

const USER = 'student-kaely';
const CONTEST = 'contest-kaely';
const MODEL_KEY = 'personalized_habits_model_v4';
const CONFIG_KEY = 'personalized_habits_config_v1';
const REMINDER_KEY = 'habit_reminder_settings_v1';

function definition(habitId, overrides = {}) {
  return createHabitDefinition({
    habitId,
    userId: USER,
    contestId: CONTEST,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    now: '2026-07-01T12:00:00.000Z',
    ...overrides,
  });
}

function memoryRepository({ definitions = [], logs = [], metadata = {} } = {}) {
  const stores = {
    wellbeingHabits: new Map(definitions.map((row) => [row.id, structuredClone(row)])),
    wellbeingLogs: new Map(logs.map((row) => [row.id, structuredClone(row)])),
    dailyLogs: new Map(),
    routineBlocks: new Map(),
    reviewQueue: new Map(),
  };
  const meta = new Map(Object.entries({ [MODEL_KEY]: true, ...structuredClone(metadata) }));
  let writes = 0;
  const map = (store) => stores[store] || (stores[store] = new Map());
  return {
    stores,
    meta,
    get writes() { return writes; },
    userId: () => USER,
    contestId: () => CONTEST,
    getAll: async (store) => [...map(store).values()].map((row) => structuredClone(row)),
    getById: async (store, id) => structuredClone(map(store).get(id) || null),
    put: async (store, row) => { writes += 1; map(store).set(row.id, structuredClone(row)); return row; },
    putMany: async (store, rows) => { writes += 1; rows.forEach((row) => map(store).set(row.id, structuredClone(row))); return rows; },
    getMeta: async (key) => structuredClone(meta.get(key) ?? null),
    setMeta: async (key, value) => { writes += 1; meta.set(key, structuredClone(value)); return value; },
    putManyAndMetaAtomic: async (store, rows, entries) => {
      writes += 1;
      rows.forEach((row) => map(store).set(row.id, structuredClone(row)));
      entries.forEach(({ key, value }) => meta.set(key, structuredClone(value)));
      return { rows, entries };
    },
  };
}

test('hábitos acadêmicos automáticos rejeitam toda mutação manual sem nenhuma escrita', async () => {
  for (const habitId of ['daily_questions', 'review_errors', 'finish_priority']) {
    const item = definition(habitId);
    const repository = memoryRepository({ definitions: [item] });
    const operations = [
      () => setHabitAmountForDate(item.id, item.target, '2026-07-30', {}, repository),
      () => incrementHabitForDate(item.id, 1, '2026-07-30', repository),
      () => toggleHabitForDate(item.id, '2026-07-30', repository),
      () => skipHabitForDate(item.id, '2026-07-30', repository),
      () => recordHabitDetails(item.id, { actualValue: item.target }, '2026-07-30', repository),
    ];
    for (const operation of operations) {
      await assert.rejects(operation, /HABIT_AUTOMATIC_READ_ONLY/);
    }
    assert.equal(repository.writes, 0, `${habitId} não pode gerar escrita manual`);
    assert.equal(repository.stores.wellbeingLogs.size, 0);
  }
});

test('pular primeiro acesso preserva definições e lembretes, mantendo não configurado', async () => {
  const water = definition('water', { reminderTime: '08:00' });
  const reminders = [{ habitDefinitionId: water.id, enabled: true, time: '08:00', activeDays: [1] }];
  const repository = memoryRepository({ definitions: [water], metadata: { [REMINDER_KEY]: reminders } });
  const beforeDefinitions = await repository.getAll('wellbeingHabits');
  const beforeReminders = await repository.getMeta(REMINDER_KEY);
  const result = await skipHabitConfiguration(repository);
  assert.equal(result.configured, false);
  assert.equal(result.skipped, true);
  assert.deepEqual(await repository.getAll('wellbeingHabits'), beforeDefinitions);
  assert.deepEqual(await repository.getMeta(REMINDER_KEY), beforeReminders);
});

test('salvar seleção vazia falha claramente e não altera snapshot', async () => {
  const water = definition('water');
  const repository = memoryRepository({
    definitions: [water],
    metadata: { [CONFIG_KEY]: { configured: true }, [REMINDER_KEY]: [] },
  });
  const before = JSON.stringify({
    definitions: await repository.getAll('wellbeingHabits'),
    config: await repository.getMeta(CONFIG_KEY),
    reminders: await repository.getMeta(REMINDER_KEY),
  });
  await assert.rejects(() => saveHabitConfiguration({ selections: [] }, repository), /HABIT_SELECTION_REQUIRED/);
  assert.equal(JSON.stringify({
    definitions: await repository.getAll('wellbeingHabits'),
    config: await repository.getMeta(CONFIG_KEY),
    reminders: await repository.getMeta(REMINDER_KEY),
  }), before);
});

test('desativar todos é explícito, desliga lembretes e preserva histórico', async () => {
  const water = definition('water');
  const log = createHabitDailyLog({ definition: water, localDate: '2026-07-29', completedValue: 4 });
  const repository = memoryRepository({
    definitions: [water],
    logs: [log],
    metadata: {
      [CONFIG_KEY]: { configured: true },
      [REMINDER_KEY]: [{ habitDefinitionId: water.id, enabled: true, time: '08:00', activeDays: [2] }],
    },
  });
  await disableAllHabits(repository);
  assert.equal((await repository.getAll('wellbeingHabits'))[0].enabled, false);
  assert.equal((await repository.getMeta(REMINDER_KEY))[0].enabled, false);
  assert.deepEqual(await repository.getAll('wellbeingLogs'), [log]);
});

test('alvos múltiplos usam registro quantitativo e um clique não conclui a meta', () => {
  for (const habitId of ['theory_block', 'distraction_free', 'nutrition']) {
    assert.equal(HABIT_CATALOG.find((item) => item.id === habitId).recordType, HABIT_RECORD_TYPES.QUANTITATIVE);
    const item = definition(habitId, { target: 3 });
    const log = createHabitDailyLog({ definition: item, localDate: '2026-07-30', completedValue: 1 });
    assert.equal(log.completed, false);
    assert.equal(log.status, 'partial');
  }
});

test('sono guarda horários reais, duração e qualidade sem alegar tolerância', async () => {
  const sleep = definition('sleep_schedule', { desiredSleepTime: '22:00', desiredWakeTime: '06:00' });
  const repository = memoryRepository({ definitions: [sleep] });
  await recordHabitDetails(sleep.id, {
    actualSleepTime: '23:17', actualWakeTime: '07:02', durationMinutes: 465, quality: 2,
  }, '2026-07-30', repository);
  const [log] = await repository.getAll('wellbeingLogs');
  assert.equal(log.actualSleepTime, '23:17');
  assert.equal(log.actualWakeTime, '07:02');
  assert.equal(log.durationMinutes, 465);
  assert.equal(log.quality, 2);
  assert.equal(log.completed, true);
  assert.match(HABIT_CATALOG.find((item) => item.id === 'sleep_schedule').description, /registre/i);
  assert.doesNotMatch(HABIT_CATALOG.find((item) => item.id === 'sleep_schedule').description, /respeitou|cumpriu/i);
});

test('energia baixa é check-in concluído e preserva o valor observado', async () => {
  const energy = definition('energy_level', { target: 5 });
  const repository = memoryRepository({ definitions: [energy] });
  await recordHabitDetails(energy.id, { actualValue: 1 }, '2026-07-30', repository);
  const [log] = await repository.getAll('wellbeingLogs');
  assert.equal(log.completedValue, 1);
  assert.equal(log.completed, true);
  assert.equal(log.status, 'completed');
  assert.equal(energy.isCheckIn, true);
});

test('orientação contextual adiciona exatamente um copo e não oferece registro automático', () => {
  const water = definition('water');
  const waterCard = { definition: water, catalog: HABIT_CATALOG.find((item) => item.id === 'water'), completed: false };
  const waterGuidance = chooseKaelyGuidance({ cards: [waterCard], configuration: { configured: true } }, { card: waterCard });
  assert.equal(waterGuidance.action, 'increment');
  assert.equal(waterGuidance.actionLabel, 'Adicionar um copo');

  const automatic = definition('daily_questions');
  const automaticCard = { definition: automatic, completed: false };
  const automaticGuidance = chooseKaelyGuidance({ cards: [automaticCard], configuration: { configured: true } }, { card: automaticCard });
  assert.equal(automaticGuidance.action, 'habits');
  assert.equal(automaticGuidance.code, 'automatic');
});

test('histórico semanal nunca conta dias futuros em domingo, segunda, quarta ou sábado', () => {
  const water = definition('water');
  const fixtures = [
    ['2026-08-02', 1],
    ['2026-08-03', 2],
    ['2026-08-05', 4],
    ['2026-08-08', 7],
  ];
  for (const [today, elapsed] of fixtures) {
    const history = buildHabitHistory({ definitions: [water], logs: [], today });
    assert.equal(history.planned, elapsed, today);
    assert.equal(history.emptyDays, elapsed, today);
  }
});

test('horário frequente usa a moda e desempata pelo registro atualizado mais recente', () => {
  const water = definition('water');
  const log = (date, actualTime, updatedAt) => createHabitDailyLog({
    definition: water, localDate: date, completedValue: water.target, actualTime, now: updatedAt,
  });
  const [mode] = buildHabitAnalysis({
    definitions: [water],
    today: '2026-07-30',
    days: 7,
    logs: [
      log('2026-07-25', '07:00', '2026-07-25T10:00:00Z'),
      log('2026-07-26', '09:00', '2026-07-26T10:00:00Z'),
      log('2026-07-27', '09:00', '2026-07-27T10:00:00Z'),
      log('2026-07-28', '07:00', '2026-07-28T20:00:00Z'),
    ],
  });
  assert.equal(mode.frequentTime, '07:00');
});

test('registro parcial não vira falha total na análise', () => {
  const water = definition('water');
  const partial = createHabitDailyLog({
    definition: water, localDate: '2026-07-30', completedValue: 2, status: 'partial',
  });
  const [analysis] = buildHabitAnalysis({ definitions: [water], logs: [partial], today: '2026-07-30', days: 1 });
  assert.equal(analysis.partial, 1);
  assert.equal(analysis.missed, 0);
  assert.deepEqual(analysis.weakDays, []);
});

test('escudo é consumido uma vez e preserva a sequência sem falsificar conclusão', () => {
  const water = definition('water', { createdAt: '2026-07-27T12:00:00Z' });
  const completed = createHabitDailyLog({ definition: water, localDate: '2026-07-27', completedValue: water.target });
  const states = [
    { date: '2026-07-27', planned: 1, completed: 1, minimumReached: true },
    { date: '2026-07-28', planned: 1, completed: 0, minimumReached: false },
    { date: '2026-07-29', planned: 1, completed: 1, minimumReached: true },
  ];
  const first = evaluateConsistencyLedger({ ledger: { shields: 1 }, dailyStates: states, today: '2026-07-30' });
  const second = evaluateConsistencyLedger({ ledger: first, dailyStates: states, today: '2026-07-30' });
  assert.equal(first.shields, 0);
  assert.deepEqual(first.protectedDates, ['2026-07-28']);
  assert.deepEqual(second.protectedDates, first.protectedDates);
  const consistency = calculateHabitConsistency({
    definitions: [water], logs: [completed, createHabitDailyLog({ definition: water, localDate: '2026-07-29', completedValue: water.target })],
    today: '2026-07-29', protectedDates: first.protectedDates,
  });
  assert.equal(consistency.streakCurrent, 3);
});

test('interface vincula o modal real e apresenta contratos de configuração segura', async () => {
  const [source, app] = await Promise.all([
    readFile(new URL('../js/ui/wellbeingUI.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /getElementById\('modal-root'\)/);
  assert.doesNotMatch(source, /getElementById\('app-modal'\)/);
  assert.match(source, /Pular por agora/);
  assert.match(source, /configuration\.configured \? 'Cancelar'/);
  assert.match(source, /Desativar todos os hábitos/);
  assert.match(source, /Selecione pelo menos um hábito/);
  assert.match(source, /LOCAL_REMINDER_LIMITATION/);
  assert.match(app, /habitReminderCheckPromise/);
  assert.match(app, /createHabitReminderQueue/);
});
