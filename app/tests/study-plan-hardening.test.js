import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyCapacityForDate,
  stableStudyBlockId,
  studyPlanIdentity,
  studyPlanScopeKey,
  validateExamDate,
  validatePlanCompletionEvidence,
  validateStudyAvailability,
  validateStudyPlan,
} from '../js/core/routine/studyPlanContract.js';
import {
  createRoutineBlock,
  createRoutineProfile,
  dateKey,
  normalizeRoutineBlock,
} from '../js/core/routine/routineSchema.js';
import { weekDatesFrom } from '../js/core/routine/routinePlanner.js';
import { RoutineService } from '../js/services/routineService.js';

function memoryRepo(userId = 'student-a', contestId = 'pc_al_2026', { failPutManyOnce = false } = {}) {
  const data = Object.create(null);
  let fail = failPutManyOnce;
  const ensure = (store) => {
    if (!data[store]) data[store] = new Map();
    return data[store];
  };
  return {
    userId: () => userId,
    contestId: () => contestId,
    async getAll(store) { return [...ensure(store).values()].map((value) => structuredClone(value)); },
    async getById(store, id) { return structuredClone(ensure(store).get(id) || null); },
    async put(store, value) {
      const key = value.id ?? value.date ?? value.key ?? value.day_of_week ?? value.questionId;
      ensure(store).set(key, structuredClone(value));
      return value;
    },
    async putMany(store, values) {
      if (store === 'routineBlocks' && fail) {
        fail = false;
        throw new Error('SIMULATED_LOCAL_WRITE_FAILURE');
      }
      for (const value of values) await this.put(store, value);
      return values;
    },
    async remove(store, id) { ensure(store).delete(id); },
    async clearStore(store) { ensure(store).clear(); },
    _data: data,
  };
}

function allDaysProfile(overrides = {}) {
  const days = [0, 1, 2, 3, 4, 5, 6];
  return createRoutineProfile({
    userId: 'student-a',
    contestId: 'pc_al_2026',
    overrides: {
      setupCompleted: true,
      availableDays: days,
      restDays: [],
      dayWindows: Object.fromEntries(days.map((day) => [day, { start: '18:00', end: '21:00' }])),
      minDailyMinutes: 20,
      maxDailyMinutes: 90,
      weeklyHoursGoal: 6,
      preferredSessionMinutes: 25,
      maxBlocksPerDay: 4,
      ...overrides,
    },
  });
}

async function seedEligibleContent(repository) {
  await repository.put('disciplines', { id: 'discipline-1', name: 'Língua Portuguesa' });
  await repository.put('subtopics', {
    id: 'subtopic-1',
    discipline_id: 'discipline-1',
    name: 'Interpretação de textos',
    mastery_pct: 15,
  });
  await repository.put('questions', { id: 'question-1', subtopic_id: 'subtopic-1' });
}

test('contrato de escopo e identidade do plano é determinístico', () => {
  const weekStart = weekDatesFrom()[0];
  const first = studyPlanIdentity({ userId: 'student-a', contestId: 'pc_al_2026', weekStart });
  const second = studyPlanIdentity({ userId: 'student-a', contestId: 'pc_al_2026', weekStart });
  assert.deepEqual(first, second);
  assert.equal(first.scopeKey, studyPlanScopeKey('student-a', 'pc_al_2026'));
  const partial = { date: weekStart, startTime: '18:00', activityType: 'questoes', subtopicId: 'subtopic-1' };
  assert.equal(stableStudyBlockId(first.planId, partial, 0), stableStudyBlockId(first.planId, partial, 0));
  assert.notEqual(stableStudyBlockId(first.planId, partial, 0), stableStudyBlockId(first.planId, partial, 1));
});

test('disponibilidade rejeita ausência, duplicidade, conflito, limites e janelas inválidas', () => {
  const week = weekDatesFrom();
  const valid = allDaysProfile();
  assert.equal(validateStudyAvailability(valid, { weekDates: week }).valid, true);
  assert.ok(dailyCapacityForDate(valid, week[0]) > 0);

  const cases = [
    [{ ...valid, availableDays: [] }, 'availability_missing'],
    [{ ...valid, availableDays: [1, 1] }, 'availability_day_duplicate'],
    [{ ...valid, availableDays: [1], restDays: [1] }, 'availability_day_conflict'],
    [{ ...valid, minDailyMinutes: 100, maxDailyMinutes: 20 }, 'daily_range_invalid'],
    [{ ...valid, maxDailyMinutes: -1 }, 'max_daily_invalid'],
    [{ ...valid, weeklyHoursGoal: 0 }, 'weekly_goal_invalid'],
    [{ ...valid, dayWindows: { ...valid.dayWindows, 1: { start: '21:00', end: '18:00' } } }, 'availability_window_invalid:1'],
    [{
      ...valid,
      fixedCommitments: [{ id: 'work', days: [1], start: '17:00', end: '19:00' }],
    }, 'fixed_commitment_conflict:1'],
  ];
  for (const [profile, expected] of cases) {
    const result = validateStudyAvailability(profile, { weekDates: week });
    assert.equal(result.valid, false, expected);
    assert.ok(result.errors.includes(expected), `${expected}: ${result.errors.join(', ')}`);
  }
});

test('data da prova distingue ausente, futura, inválida e passada', () => {
  assert.equal(validateExamDate(null, { today: '2026-08-05' }).state, 'missing');
  assert.equal(validateExamDate('2026-12-01', { today: '2026-08-05' }).state, 'future');
  assert.equal(validateExamDate('2026-02-31', { today: '2026-01-01' }).valid, false);
  assert.equal(validateExamDate('2026-01-01', { today: '2026-08-05' }).state, 'past');
});

test('validação canônica bloqueia plano vazio, currículo externo, banco ausente e sobrecarga', () => {
  const week = weekDatesFrom();
  const identity = studyPlanIdentity({ userId: 'student-a', contestId: 'pc_al_2026', weekStart: week[0] });
  const profile = allDaysProfile({ maxDailyMinutes: 30, weeklyHoursGoal: 2 });
  const baseBlock = normalizeRoutineBlock({
    id: 'block-valid',
    userId: 'student-a',
    contestId: 'pc_al_2026',
    scopeKey: identity.scopeKey,
    planId: identity.planId,
    planVersion: 1,
    generationId: identity.generationId,
    date: week[0],
    startTime: '18:00',
    endTime: '18:25',
    plannedMinutes: 25,
    activityType: 'questoes',
    subjectId: 'discipline-1',
    subtopicId: 'subtopic-1',
    status: 'planned',
  });
  const context = {
    userId: 'student-a',
    contestId: 'pc_al_2026',
    today: week[0],
    disciplines: [{ id: 'discipline-1' }],
    subtopics: [{ id: 'subtopic-1', discipline_id: 'discipline-1' }],
    questions: [{ id: 'question-1', subtopic_id: 'subtopic-1' }],
  };
  const plan = {
    ...identity,
    userId: context.userId,
    contestId: context.contestId,
    status: 'active',
    startDate: week[0],
    endDate: week[6],
    examDate: null,
    configuration: profile,
    weekDates: week,
    blocks: [baseBlock],
  };
  assert.equal(validateStudyPlan(plan, context).valid, true);
  assert.ok(validateStudyPlan({ ...plan, blocks: [] }, context).errors.includes('plan_empty'));
  assert.ok(validateStudyPlan({
    ...plan, blocks: [{ ...baseBlock, subtopicId: 'outside' }],
  }, context).errors.includes('block_subtopic_invalid'));
  assert.ok(validateStudyPlan(plan, { ...context, questions: [] }).errors.includes('block_question_bank_missing'));
  assert.ok(validateStudyPlan({
    ...plan,
    blocks: [{ ...baseBlock, plannedMinutes: 31 }],
  }, context).errors.some((error) => error.startsWith('daily_capacity_exceeded:')));
});

test('evidência de conclusão exige atividade real, vínculo e escopo corretos', () => {
  const scopeKey = 'student-a:pc_al_2026';
  const block = createRoutineBlock({
    id: 'block-1', userId: 'student-a', contestId: 'pc_al_2026', scopeKey,
    planId: 'plan-1', planVersion: 1, generationId: 'plan-1:v1',
    activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1',
  });
  const context = { userId: 'student-a', contestId: 'pc_al_2026' };
  const evidence = {
    id: 'session-1',
    blockId: 'block-1',
    userId: 'student-a',
    contestId: 'pc_al_2026',
    scopeKey,
    planId: 'plan-1',
    planVersion: 1,
    activityType: 'questoes',
    subjectId: 'discipline-1',
    subtopicId: 'subtopic-1',
    status: 'completed',
    elapsedSeconds: 60,
    endedAt: new Date().toISOString(),
  };
  assert.equal(validatePlanCompletionEvidence(block, evidence, context).valid, true);
  assert.equal(validatePlanCompletionEvidence(block, { ...evidence, blockId: 'other' }, context).valid, false);
  assert.equal(validatePlanCompletionEvidence(block, { ...evidence, userId: 'student-b' }, context).valid, false);
  assert.equal(validatePlanCompletionEvidence(block, { ...evidence, elapsedSeconds: 1 }, context).valid, false);
});

test('geração usa conteúdo elegível, respeita capacidade e é idempotente', async () => {
  const repository = memoryRepo();
  const service = new RoutineService({ repository });
  await seedEligibleContent(repository);
  await service.completeSetup({ model: 'equilibrada', generatePlan: false });
  const first = await service.regenerateCurrentWeek();
  const second = await service.regenerateCurrentWeek();
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, 'already_exists');
  assert.ok(first.blocks.length > 0);
  assert.ok(first.blocks.every((block) => block.date >= dateKey()));
  assert.ok(first.blocks.every((block) => block.planId && block.scopeKey === 'student-a:pc_al_2026'));
  assert.equal(new Set(first.blocks.map((block) => block.id)).size, first.blocks.length);
  assert.ok(first.blocks.every((block) => block.activityType !== 'questoes' || block.subtopicId === 'subtopic-1'));
});

test('geração sem configuração ou sem conteúdo preserva estado e não inventa blocos', async () => {
  const repository = memoryRepo();
  const service = new RoutineService({ repository });
  const unconfigured = await service.regenerateCurrentWeek();
  assert.equal(unconfigured.reason, 'configuration_required');
  await service.completeSetup({ generatePlan: false });
  const empty = await service.regenerateCurrentWeek();
  assert.equal(empty.reason, 'no_available_content');
  assert.equal((await repository.getAll('routineBlocks')).length, 0);
});

test('falha de persistência mantém journal recuperável e retry cria um único plano', async () => {
  const repository = memoryRepo('student-a', 'pc_al_2026', { failPutManyOnce: true });
  const service = new RoutineService({ repository });
  await seedEligibleContent(repository);
  await service.completeSetup({ generatePlan: false });
  await assert.rejects(() => service.regenerateCurrentWeek(), /SIMULATED_LOCAL_WRITE_FAILURE/);
  assert.equal((await repository.getAll('routineBlocks')).length, 0);
  const retry = await service.regenerateCurrentWeek();
  assert.equal(retry.created, true);
  const blocks = await repository.getAll('routineBlocks');
  assert.equal(new Set(blocks.map((block) => block.id)).size, blocks.length);
  const journals = await repository.getAll('meta');
  assert.ok(journals.some((row) => row.key.startsWith('study_plan_generation:') && row.value.status === 'completed'));
});

test('bloco só conclui com evidência, e retry não repete conclusão', async () => {
  const repository = memoryRepo();
  const service = new RoutineService({ repository });
  await seedEligibleContent(repository);
  const block = await service.createBlock({
    date: dateKey(), title: 'Missão real', activityType: 'questoes',
    subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20,
  });
  await service.startBlock(block.id);
  await assert.rejects(
    () => service.completeBlock(block.id, { actualMinutes: 20, skipAcademicActivity: true }),
    (error) => error.code === 'STUDY_PLAN_EVIDENCE_REQUIRED',
  );
  const evidence = {
    id: 'session-proof',
    blockId: block.id,
    userId: 'student-a',
    contestId: 'pc_al_2026',
    scopeKey: block.scopeKey,
    planId: block.planId,
    planVersion: block.planVersion,
    activityType: block.activityType,
    subjectId: block.subjectId,
    subtopicId: block.subtopicId,
    status: 'completed',
    elapsedSeconds: 1200,
    endedAt: new Date().toISOString(),
  };
  const completed = await service.completeBlock(block.id, {
    actualMinutes: 20, evidence, skipAcademicActivity: true,
  });
  const retry = await service.completeBlock(block.id, {
    actualMinutes: 99, evidence, skipAcademicActivity: true,
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.actualMinutes, 20);
  assert.equal(retry.completedAt, completed.completedAt);
  assert.equal(retry.actualMinutes, 20);
  assert.deepEqual(retry.processedEventIds, completed.processedEventIds);
});

test('reagendamento respeita capacidade, preserva histórico e é idempotente', async () => {
  const repository = memoryRepo();
  const service = new RoutineService({ repository });
  const profile = allDaysProfile();
  await repository.put('routineProfiles', profile);
  const block = await service.createBlock({
    date: dateKey(), title: 'Reagendar', activityType: 'estudo_livre', plannedMinutes: 20,
  });
  const preview = await service.rescheduleBlock(block.id, 'find_week');
  assert.equal(preview.ok, true);
  const first = await service.confirmReschedule(block.id, preview.suggestion);
  const retry = await service.confirmReschedule(block.id, preview.suggestion);
  assert.equal(first.from.status, 'rescheduled');
  assert.equal(first.to.rescheduledFrom, block.id);
  assert.equal(retry.from.rescheduledTo, first.to.id);
  assert.equal((await repository.getAll('routineBlocks')).length, 2);
  await assert.rejects(
    () => service.rescheduleBlock(block.id, 'find_week'),
    (error) => error.code === 'STUDY_PLAN_BLOCK_UNAVAILABLE',
  );
});

test('fechamento do dia aplica constância uma única vez', async () => {
  const repository = memoryRepo();
  const service = new RoutineService({ repository });
  await service.completeSetup({ generatePlan: false });
  const first = await service.closeDay(dateKey());
  const second = await service.closeDay(dateKey());
  assert.equal(first.state.consistencyApplied, true);
  assert.equal(second.state.consistencyApplied, true);
  assert.equal(second.message, 'Este dia já foi registrado.');
  assert.deepEqual(second.consistency, first.consistency);
  assert.equal(second.state.processedEventIds.length, 1);
});

test('usuários e concursos distintos não compartilham plano ou conclusão', async () => {
  const firstRepo = memoryRepo('student-a', 'pc_al_2026');
  const secondRepo = memoryRepo('student-b', 'pp_pe_2027');
  const first = new RoutineService({ repository: firstRepo });
  const second = new RoutineService({ repository: secondRepo });
  await first.createBlock({ date: dateKey(), title: 'Plano A', plannedMinutes: 15 });
  assert.equal((await first.listBlocks()).length, 1);
  assert.equal((await second.listBlocks()).length, 0);
  assert.notEqual(first.captureScope().scopeKey, second.captureScope().scopeKey);
});
