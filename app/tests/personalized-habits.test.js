import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HABIT_CATALOG,
  HABIT_RECORD_TYPES,
  HABIT_SOURCES,
  MAX_ACTIVE_HABITS,
  applyAcademicAutomation,
  applyConsistencyShield,
  calculateHabitConsistency,
  createHabitDailyLog,
  createHabitDefinition,
  dailyHabitStatus,
  habitDailyLogId,
  mergeHabitLogs,
  migrateLegacyWellbeing,
  validateHabitSelection,
} from '../js/core/habitSystem.js';

const USER_A = 'user-a';
const USER_B = 'user-b';
const CONTEST_A = 'contest-a';
const CONTEST_B = 'contest-b';
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function definition(habitId, overrides = {}) {
  return createHabitDefinition({
    habitId,
    userId: USER_A,
    contestId: CONTEST_A,
    activeDays: EVERY_DAY,
    now: '2026-07-01T12:00:00.000Z',
    ...overrides,
  });
}

function completedLog(item, localDate, value = item.target, source = HABIT_SOURCES.MANUAL) {
  return createHabitDailyLog({ definition: item, localDate, completedValue: value, source });
}

test('catálogo ampliado mantém opções anteriores e inclui creatina, medicação e horário de acordar', () => {
  assert.equal(HABIT_CATALOG.length, 18);
  const supplement = HABIT_CATALOG.find((item) => item.id === 'personal_supplement');
  assert.equal(supplement.isMedicalSensitive, true);
  assert.match(supplement.description, /sem indicação, dosagem ou recomendação/i);
  assert.equal(HABIT_CATALOG.find((item) => item.id === 'water').recordType, HABIT_RECORD_TYPES.QUANTITATIVE);
  assert.equal(HABIT_CATALOG.find((item) => item.id === 'creatine').recordType, HABIT_RECORD_TYPES.BOOLEAN);
  assert.equal(HABIT_CATALOG.find((item) => item.id === 'medication').recordType, HABIT_RECORD_TYPES.BOOLEAN);
  assert.equal(HABIT_CATALOG.find((item) => item.id === 'sleep_schedule').recordType, HABIT_RECORD_TYPES.TIME);
  assert.equal(HABIT_CATALOG.find((item) => item.id === 'energy_level').recordType, HABIT_RECORD_TYPES.SCALE);
});

test('escolha aceita 3 a 5, recomenda 3 e permite pular sem bloquear', () => {
  assert.equal(validateHabitSelection([]).canSkip, true);
  assert.equal(validateHabitSelection(['water', 'exercise']).belowRecommended, true);
  assert.equal(validateHabitSelection(['water', 'exercise', 'meditation']).canSave, true);
  const six = HABIT_CATALOG.slice(0, MAX_ACTIVE_HABITS + 1).map((item) => item.id);
  assert.equal(validateHabitSelection(six).canSave, false);
});

test('ID diário determinístico impede duplicação no mesmo dia', () => {
  const item = definition('water');
  const first = completedLog(item, '2026-07-29', 4);
  const second = completedLog(item, '2026-07-29', 8);
  assert.equal(first.id, second.id);
  assert.equal(first.id, habitDailyLogId(item.id, '2026-07-29'));
});

test('marcar e desfazer preservam o mesmo registro diário', () => {
  const item = definition('theory_block');
  const marked = completedLog(item, '2026-07-29');
  const undone = completedLog(item, '2026-07-29', 0);
  assert.equal(marked.id, undone.id);
  assert.equal(marked.completed, true);
  assert.equal(undone.completed, false);
});

test('automação conclui hábitos acadêmicos confiáveis e nunca hábitos físicos', () => {
  const questions = definition('daily_questions', { target: 10 });
  const review = definition('review_errors');
  const water = definition('water', { target: 4 });
  const logs = applyAcademicAutomation({
    definitions: [questions, review, water],
    date: '2026-07-29',
    signals: { questionsCompleted: 10, reviewsCompleted: 1, priorityCompleted: true },
  });
  assert.equal(logs.find((item) => item.habitId === 'daily_questions')?.completed, true);
  assert.equal(logs.find((item) => item.habitId === 'review_errors')?.completed, true);
  assert.equal(logs.some((item) => item.habitId === 'water'), false);
  assert.ok(logs.every((item) => item.source === HABIT_SOURCES.ACADEMIC_AUTO));
});

test('migração converte somente os cinco hábitos antigos e preserva datas e valores', () => {
  const migrated = migrateLegacyWellbeing({
    userId: USER_A,
    contestId: CONTEST_A,
    habits: [
      { id: 'wb_agua', daily_target: 8, enabled: true },
      { id: 'wb_exercicio', daily_target: 30, enabled: true },
      { id: 'wb_alimentacao', daily_target: 1, enabled: true },
      { id: 'wb_meditacao', daily_target: 10, enabled: true },
      { id: 'wb_sono', daily_target: 7, enabled: true },
      { id: 'custom_unknown', daily_target: 99, enabled: true },
    ],
    logs: [
      { id: 'wb_agua|2026-07-20', habit_id: 'wb_agua', date: '2026-07-20', amount_done: 8, completed: true },
      { id: 'custom_unknown|2026-07-20', habit_id: 'custom_unknown', date: '2026-07-20', amount_done: 99, completed: true },
    ],
  });
  assert.equal(migrated.definitions.length, 5);
  assert.equal(migrated.logs.length, 1);
  assert.equal(migrated.logs[0].localDate, '2026-07-20');
  assert.equal(migrated.logs[0].completedValue, 8);
  assert.deepEqual(migrated.ignoredHabitIds, ['custom_unknown']);
});

test('meta diária exige um hábito acadêmico e percentual configurado', () => {
  const study = definition('theory_block');
  const water = definition('water');
  const exercise = definition('exercise');
  const date = '2026-07-29';
  const physicalOnly = dailyHabitStatus({
    definitions: [study, water, exercise],
    logs: [completedLog(water, date), completedLog(exercise, date)],
    date,
    minimumPercent: 60,
  });
  assert.equal(physicalOnly.percentage, 67);
  assert.equal(physicalOnly.minimumReached, false);
  const balanced = dailyHabitStatus({
    definitions: [study, water, exercise],
    logs: [completedLog(study, date), completedLog(water, date)],
    date,
    minimumPercent: 60,
  });
  assert.equal(balanced.minimumReached, true);
});

test('consistência semanal, sequência, melhor sequência e retomada são calculadas sem exigir perfeição', () => {
  const study = definition('theory_block');
  const water = definition('water');
  const definitions = [study, water];
  const dates = ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];
  const logs = dates.flatMap((date, index) => {
    if (index === 3) return [];
    return [completedLog(study, date), completedLog(water, date)];
  });
  const result = calculateHabitConsistency({ definitions, logs, today: '2026-07-27', minimumPercent: 60 });
  assert.equal(result.streakCurrent, 3);
  assert.equal(result.streakBest, 3);
  assert.equal(result.comebackCount, 1);
  assert.equal(result.weeklyConsistency, 100);
  assert.equal(result.thirtyDayConsistency > 0, true);
});

test('escudo protege apenas sequência, é automático e limitado a dois', () => {
  const protectedDay = applyConsistencyShield({
    previous: { streakCurrent: 8, streakBest: 8, shields: 1 },
    plannedDayCompleted: false,
  });
  assert.equal(protectedDay.shieldUsed, true);
  assert.equal(protectedDay.streakCurrent, 8);
  assert.equal(protectedDay.shields, 0);
  const earned = applyConsistencyShield({
    previous: { streakCurrent: 8, streakBest: 8, shields: 2 },
    plannedDayCompleted: true,
    weekCompletedDays: 7,
    weekClosed: true,
  });
  assert.equal(earned.shields, 2);
});

test('merge entre dispositivos preserva maior valor válido e não duplica log', () => {
  const item = definition('water');
  const local = completedLog(item, '2026-07-29', 4);
  const remote = { ...completedLog(item, '2026-07-29', 8), updatedAt: '2026-07-29T21:00:00.000Z' };
  const merged = mergeHabitLogs(local, remote);
  assert.equal(merged.id, local.id);
  assert.equal(merged.completedValue, 8);
  assert.equal(merged.completed, true);
});

test('isolamento faz IDs iguais serem registros distintos por usuário e concurso no repositório', () => {
  const a = definition('water');
  const otherUser = definition('water', { userId: USER_B });
  const otherContest = definition('water', { contestId: CONTEST_B });
  assert.equal(a.id, otherUser.id);
  assert.notEqual(a.userId, otherUser.userId);
  assert.notEqual(a.contestId, otherContest.contestId);
});

test('modelo de hábitos não possui efeitos acadêmicos ou campos de ranking', async () => {
  const wellbeing = await import('../js/core/wellbeing.js');
  assert.deepEqual(wellbeing.WELLBEING_ACADEMIC_SIDE_EFFECTS, {
    grantsXp: false,
    changesLevel: false,
    changesStars: false,
    changesMastery: false,
    changesEdital: false,
    canConvertVigorToXp: false,
    evolvesCharacter: false,
  });
  assert.equal(HABIT_CATALOG.some((item) => 'ranking' in item || 'xp' in item || 'level' in item), false);
});
