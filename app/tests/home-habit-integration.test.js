import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME_HABIT_QUICK_ACTIONS,
  WELLBEING_ACADEMIC_SIDE_EFFECTS,
  performHomeHabitQuickAction,
  resolveHomeHabitQuickAction,
} from '../js/core/wellbeing.js';
import {
  HABIT_RECORD_TYPES,
  createHabitDefinition,
} from '../js/core/habitSystem.js';
import {
  assertSingleDirectMentorCommunication,
  automaticMentorHtml,
  countDirectMentorCommunications,
} from '../js/ui/mentorCommunication.js';
import { renderEviDailyMission } from '../js/ui/eviDailyMission.js';
import { renderOrionEvolution } from '../js/ui/orionEvolution.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const date = '2026-07-30';

function card(habitId, overrides = {}) {
  const definition = createHabitDefinition({
    habitId,
    userId: 'student-a',
    contestId: 'contest-a',
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    now: `${date}T10:00:00.000Z`,
    ...overrides,
  });
  return {
    definition,
    catalog: { recordType: definition.recordType },
    habit: { id: definition.id, name: habitId },
    automatic: definition.recordType === HABIT_RECORD_TYPES.AUTOMATIC,
    completed: false,
  };
}

function operations() {
  const calls = [];
  return {
    calls,
    increment: async (...args) => calls.push({ type: 'increment', args }),
    toggle: async (...args) => calls.push({ type: 'toggle', args }),
    openRecord: (...args) => calls.push({ type: 'open_record', args }),
  };
}

test('água na Home acrescenta exatamente um copo', async () => {
  const water = card('water', { target: 8 });
  const ops = operations();
  const result = await performHomeHabitQuickAction(water, { date, ...ops });
  assert.equal(result.type, HOME_HABIT_QUICK_ACTIONS.INCREMENT_WATER);
  assert.equal(ops.calls.length, 1);
  assert.equal(ops.calls[0].type, 'increment');
  assert.equal(ops.calls[0].args[1], 1);
  assert.notEqual(ops.calls[0].args[1], water.definition.target);
});

test('exercício abre o registrador e não conclui a meta inteira', async () => {
  const exercise = card('exercise', { target: 30 });
  const ops = operations();
  const result = await performHomeHabitQuickAction(exercise, { date, ...ops });
  assert.equal(result.type, HOME_HABIT_QUICK_ACTIONS.OPEN_RECORD);
  assert.deepEqual(ops.calls.map((call) => call.type), ['open_record']);
  assert.equal(ops.calls.some((call) => call.type === 'increment' || call.type === 'toggle'), false);
});

test('sono abre o formulário e não é concluído automaticamente', async () => {
  const sleep = card('sleep_schedule');
  const ops = operations();
  await performHomeHabitQuickAction(sleep, { date, ...ops });
  assert.deepEqual(ops.calls.map((call) => call.type), ['open_record']);
});

for (const habitId of ['creatine', 'medication']) {
  test(`${habitId} pode ser confirmado diretamente`, async () => {
    const confirmation = card(habitId);
    const ops = operations();
    await performHomeHabitQuickAction(confirmation, { date, ...ops });
    assert.deepEqual(ops.calls.map((call) => call.type), ['toggle']);
  });
}

test('hábito automático permanece somente leitura', async () => {
  const automatic = card('daily_questions');
  const ops = operations();
  const result = await performHomeHabitQuickAction(automatic, { date, ...ops });
  assert.equal(resolveHomeHabitQuickAction(automatic).type, HOME_HABIT_QUICK_ACTIONS.READ_ONLY);
  assert.equal(result.handled, false);
  assert.equal(ops.calls.length, 0);
});

test('bloco da Home usa HÁBITOS DO DIA e remove cópia operacional antiga', async () => {
  const source = await readFile(path.join(appDir, 'js/ui/home.js'), 'utf8');
  assert.match(source, /HÁBITOS DO DIA/);
  assert.doesNotMatch(source, /Cuide do corpo e da mente/);
  assert.doesNotMatch(source, /marcar cada preparação/);
  assert.doesNotMatch(source, /prática\(s\)/);
  assert.match(source, /performHomeHabitQuickAction/);
  assert.doesNotMatch(source, /await toggleHabit\(id\)/);
});

test('Home admite exatamente uma comunicação direta de mentor', () => {
  const html = [
    renderEviDailyMission({}, { direct: false }),
    renderOrionEvolution({}, { direct: false }),
    automaticMentorHtml({}, {
      category: 'default',
      priority: 'normal',
      title: 'Mensagem do dia',
      message: 'Mensagem principal.',
      actionType: 'none',
    }),
  ].join('');
  assert.equal(countDirectMentorCommunications(html), 1);
  assert.equal(assertSingleDirectMentorCommunication(html), true);
  assert.throws(
    () => assertSingleDirectMentorCommunication(`${html}${automaticMentorHtml({}, {
      category: 'default',
      priority: 'normal',
      title: 'Outra mensagem',
      message: 'Conflito.',
      actionType: 'none',
    })}`),
    /HOME_MENTOR_COMMUNICATION_CONFLICT:2/,
  );
});

test('ações de hábito não concedem efeitos acadêmicos', () => {
  assert.deepEqual(WELLBEING_ACADEMIC_SIDE_EFFECTS, {
    grantsXp: false,
    changesLevel: false,
    changesStars: false,
    changesMastery: false,
    changesEdital: false,
    canConvertVigorToXp: false,
    evolvesCharacter: false,
  });
});
