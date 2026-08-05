import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildReducedPlan } from '../js/core/routine/routinePlanner.js';
import {
  studyPlanIdentity,
  studyPlanScopeKey,
  validatePlanCompletionEvidence,
  validateStudyPlan,
} from '../js/core/routine/studyPlanContract.js';
import { createRoutineProfile, dateKey, normalizeRoutineBlock } from '../js/core/routine/routineSchema.js';
import { RoutineService } from '../js/services/routineService.js';

function memoryRepo(userId = 'student-a', contestId = 'pc_al_2026', { failOnce = null } = {}) {
  const data = Object.create(null);
  let failed = false;
  let activeUserId = userId;
  let activeContestId = contestId;
  const ensure = (store) => data[store] || (data[store] = new Map());
  return {
    userId: () => activeUserId,
    contestId: () => activeContestId,
    async getAll(store) { return [...ensure(store).values()].map((value) => structuredClone(value)); },
    async getById(store, id) { return structuredClone(ensure(store).get(id) || null); },
    async put(store, value) {
      if (!failed && failOnce?.(store, value)) {
        failed = true;
        throw new Error('SIMULATED_WRITE_FAILURE');
      }
      const key = value.id ?? value.date ?? value.key ?? value.questionId;
      ensure(store).set(key, structuredClone(value));
      return value;
    },
    async putMany(store, values) { for (const value of values) await this.put(store, value); return values; },
    async remove(store, id) { ensure(store).delete(id); },
    async clearStore(store) { ensure(store).clear(); },
    _setContext(nextUserId, nextContestId) { activeUserId = nextUserId; activeContestId = nextContestId; },
    _data: data,
  };
}

function profile(overrides = {}) {
  return createRoutineProfile({
    userId: 'student-a',
    contestId: 'pc_al_2026',
    overrides: {
      setupCompleted: true,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      restDays: [],
      dayWindows: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((day) => [day, { start: '18:00', end: '20:00' }])),
      minDailyMinutes: 10,
      maxDailyMinutes: 60,
      weeklyHoursGoal: 4,
      preferredSessionMinutes: 20,
      maxBlocksPerDay: 4,
      ...overrides,
    },
  });
}

async function seed(repository, { withQuestion = true } = {}) {
  await repository.put('routineProfiles', profile());
  await repository.put('disciplines', { id: 'discipline-1', name: 'Português' });
  await repository.put('subtopics', { id: 'subtopic-1', discipline_id: 'discipline-1', name: 'Interpretação', mastery_pct: 20 });
  if (withQuestion) await repository.put('questions', { id: 'question-1', subtopic_id: 'subtopic-1' });
}

function evidenceFor(block, id = 'session-1', elapsedSeconds = 60) {
  return {
    id,
    blockId: block.id,
    userId: block.userId,
    contestId: block.contestId,
    scopeKey: block.scopeKey,
    planId: block.planId,
    planVersion: block.planVersion,
    activityType: block.activityType,
    subjectId: block.subjectId,
    subtopicId: block.subtopicId,
    status: 'completed',
    elapsedSeconds,
    endedAt: new Date().toISOString(),
  };
}

function eligibleReducedInput(overrides = {}) {
  return {
    minutes: 20,
    profile: profile(),
    weakSubtopics: [{ id: 'subtopic-1', discipline_id: 'discipline-1', name: 'Interpretação', hasQuestionBank: true }],
    userId: 'student-a',
    contestId: 'pc_al_2026',
    scopeKey: 'student-a:pc_al_2026',
    date: dateKey(),
    planId: 'study_reduced_test',
    planVersion: 1,
    generationId: 'study_reduced_test:v1',
    ...overrides,
  };
}

test('Plano Reduzido usa IDs determinísticos e nunca cria fallback acadêmico genérico', () => {
  const first = buildReducedPlan(eligibleReducedInput());
  const second = buildReducedPlan(eligibleReducedInput());
  assert.deepEqual(first.map(({ createdAt, updatedAt, ...block }) => block), second.map(({ createdAt, updatedAt, ...block }) => block));
  assert.ok(first.length > 0);
  assert.ok(first.every((block) => block.scopeKey && block.planId && block.planVersion && block.generationId));
  assert.ok(first.every((block) => block.subtopicId && block.subjectId));
  assert.ok(first.every((block) => !/Mini sessão|Teoria em pílula/i.test(block.title)));
});

test('Plano Reduzido repetido e concorrente persiste um conjunto canônico', async () => {
  const repository = memoryRepo();
  await seed(repository);
  const service = new RoutineService({ repository });
  const [first, second] = await Promise.all([service.activateReducedPlan(20), service.activateReducedPlan(20)]);
  const retry = await service.activateReducedPlan(20);
  const reduced = (await repository.getAll('routineBlocks')).filter((block) => block.source === 'reduced');
  assert.ok(reduced.length > 0);
  assert.equal(new Set(reduced.map((block) => block.id)).size, reduced.length);
  assert.deepEqual(first.reduced.map((block) => block.id), second.reduced.map((block) => block.id));
  assert.deepEqual(first.reduced.map((block) => block.id), retry.reduced.map((block) => block.id));
});

test('Plano Reduzido respeita capacidade diária, semanal e máximo de blocos', async () => {
  const repository = memoryRepo();
  await seed(repository);
  const currentProfile = profile({ maxDailyMinutes: 30, weeklyHoursGoal: 0.5, maxBlocksPerDay: 2 });
  await repository.put('routineProfiles', currentProfile);
  const service = new RoutineService({ repository });
  await service.createBlock({ date: dateKey(), title: 'Livre', activityType: 'estudo_livre', plannedMinutes: 20 });
  const result = await service.activateReducedPlan(30);
  const active = (await repository.getAll('routineBlocks')).filter((block) => !['cancelled', 'rescheduled'].includes(block.status));
  assert.ok(active.reduce((sum, block) => sum + block.plannedMinutes, 0) <= 30);
  assert.ok(active.length <= 2);
  assert.ok(result.reduced.reduce((sum, block) => sum + block.plannedMinutes, 0) <= 10);
});

test('Plano Reduzido sem conteúdo elegível não persiste blocos nem dailyState', async () => {
  const repository = memoryRepo();
  await repository.put('routineProfiles', profile());
  const service = new RoutineService({ repository });
  const result = await service.activateReducedPlan(20);
  assert.equal(result.created, false);
  assert.equal((await repository.getAll('routineBlocks')).length, 0);
  assert.equal((await repository.getAll('routineDailyStates')).length, 0);
});

test('Plano Reduzido recupera falha após blocos sem duplicar e conclui o journal', async () => {
  const repository = memoryRepo('student-a', 'pc_al_2026', {
    failOnce: (store) => store === 'routineDailyStates',
  });
  await seed(repository);
  const service = new RoutineService({ repository });
  await assert.rejects(() => service.activateReducedPlan(20), /SIMULATED_WRITE_FAILURE/);
  const persistedAfterFailure = (await repository.getAll('routineBlocks')).filter((block) => block.source === 'reduced');
  assert.ok(persistedAfterFailure.length > 0);
  const retry = await service.activateReducedPlan(20);
  const finalBlocks = (await repository.getAll('routineBlocks')).filter((block) => block.source === 'reduced');
  assert.equal(retry.created, false);
  assert.deepEqual(finalBlocks.map((block) => block.id).sort(), persistedAfterFailure.map((block) => block.id).sort());
  assert.ok((await repository.getAll('meta')).some((row) => row.key.startsWith('study_plan_reduced:') && row.value?.status === 'completed'));
});

test('Plano Reduzido interrompe operação quando usuário ou concurso muda antes da escrita', async () => {
  const repository = memoryRepo();
  await seed(repository);
  const originalGetAll = repository.getAll.bind(repository);
  repository.getAll = async (store) => {
    const result = await originalGetAll(store);
    if (store === 'questions') repository._setContext('student-b', 'pp_pe_2027');
    return result;
  };
  const service = new RoutineService({ repository });
  await assert.rejects(
    () => service.activateReducedPlan(20),
    (error) => error.code === 'STUDY_PLAN_CONTEXT_CHANGED',
  );
  assert.equal((await originalGetAll('routineBlocks')).length, 0);
});

test('blocos manuais acadêmicos exigem currículo e banco; foco livre e vida são permitidos', async () => {
  const repository = memoryRepo();
  await seed(repository);
  const service = new RoutineService({ repository });
  await assert.rejects(() => service.createBlock({ date: dateKey(), activityType: 'questoes', plannedMinutes: 20 }));
  await assert.rejects(() => service.createBlock({ date: dateKey(), activityType: 'teoria', plannedMinutes: 20 }));
  await assert.rejects(() => service.createBlock({ date: dateKey(), activityType: 'questoes', subjectId: 'outside', subtopicId: 'subtopic-1', plannedMinutes: 20 }));
  await assert.rejects(() => service.createBlock({ date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'outside', plannedMinutes: 20 }));
  await repository.put('subtopics', { id: 'subtopic-wrong-link', discipline_id: 'outside', name: 'Externo' });
  await assert.rejects(() => service.createBlock({ date: dateKey(), activityType: 'teoria', subjectId: 'discipline-1', subtopicId: 'subtopic-wrong-link', plannedMinutes: 20 }));
  const noBankRepo = memoryRepo();
  await seed(noBankRepo, { withQuestion: false });
  await assert.rejects(() => new RoutineService({ repository: noBankRepo }).createBlock({
    date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20,
  }));
  const valid = await service.createBlock({ date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20 });
  assert.equal(valid.subtopicId, 'subtopic-1');
  assert.equal((await service.createBlock({ date: dateKey(), activityType: 'estudo_livre', plannedMinutes: 20 })).activityType, 'estudo_livre');
  assert.equal((await service.createBlock({ date: dateKey(), activityType: 'trabalho', plannedMinutes: 20 })).activityType, 'trabalho');
  assert.equal((await service.createBlock({ date: dateKey(), activityType: 'descanso', plannedMinutes: 20 })).activityType, 'descanso');
});

test('catálogo acadêmico reconhece o banco publicado sem copiá-lo para o store de progresso', async () => {
  const repository = memoryRepo();
  await seed(repository, { withQuestion: false });
  const questionProvider = { listar: async () => [{ id: 'published-1', subtopic_id: 'subtopic-1' }] };
  const service = new RoutineService({ repository, questionProvider });
  const options = await service.getAcademicOptions();
  assert.equal(options.subtopics.find((item) => item.id === 'subtopic-1')?.hasQuestionBank, true);
  const block = await service.createBlock({
    date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20,
  });
  assert.equal(block.subtopicId, 'subtopic-1');
  assert.equal((await repository.getAll('questions')).length, 0);
});

test('startBlock valida conteúdo antes de persistir e duplo clique preserva startedAt', async () => {
  const repository = memoryRepo();
  await seed(repository);
  const service = new RoutineService({ repository });
  await repository.put('routineBlocks', normalizeRoutineBlock({
    id: 'invalid-academic', userId: 'student-a', contestId: 'pc_al_2026', scopeKey: 'student-a:pc_al_2026',
    date: dateKey(), activityType: 'questoes', plannedMinutes: 20,
  }));
  await assert.rejects(() => service.startBlock('invalid-academic'));
  assert.equal((await repository.getById('routineBlocks', 'invalid-academic')).status, 'planned');
  const block = await service.createBlock({ date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20 });
  const [first, concurrent] = await Promise.all([service.startBlock(block.id), service.startBlock(block.id)]);
  const second = await service.startBlock(block.id);
  assert.equal(first.startedAt, concurrent.startedAt);
  assert.equal(first.startedAt, second.startedAt);
});

test('contrato do plano exige scopeKey, planId, planVersion e generationId dos blocos', () => {
  const identity = studyPlanIdentity({ userId: 'student-a', contestId: 'pc_al_2026', weekStart: dateKey() });
  const configuration = profile();
  const block = normalizeRoutineBlock({
    id: 'block-1', userId: 'student-a', contestId: 'pc_al_2026', scopeKey: identity.scopeKey,
    planId: identity.planId, planVersion: identity.version, generationId: identity.generationId,
    date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20,
  });
  const plan = { ...identity, userId: 'student-a', contestId: 'pc_al_2026', status: 'active', startDate: dateKey(), endDate: dateKey(), configuration, weekDates: [dateKey()], blocks: [block] };
  const context = { userId: 'student-a', contestId: 'pc_al_2026', today: dateKey(), disciplines: [{ id: 'discipline-1' }], subtopics: [{ id: 'subtopic-1', discipline_id: 'discipline-1' }], questions: [{ id: 'question-1', subtopic_id: 'subtopic-1' }] };
  assert.equal(validateStudyPlan(plan, context).valid, true);
  for (const mutation of [
    { scopeKey: null }, { scopeKey: 'other:scope' }, { planId: null }, { planId: 'other' }, { planVersion: 2 }, { generationId: 'other:v1' },
  ]) assert.equal(validateStudyPlan({ ...plan, blocks: [{ ...block, ...mutation }] }, context).valid, false);
});

test('evidência exige escopo, plano, versão, conteúdo, tipo e data parseável', () => {
  const scopeKey = studyPlanScopeKey('student-a', 'pc_al_2026');
  const block = normalizeRoutineBlock({
    id: 'block-1', userId: 'student-a', contestId: 'pc_al_2026', scopeKey,
    planId: 'plan-1', planVersion: 1, generationId: 'plan-1:v1', activityType: 'questoes',
    subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20,
  });
  const evidence = {
    id: 'session-1', blockId: block.id, userId: 'student-a', contestId: 'pc_al_2026', scopeKey,
    planId: block.planId, planVersion: block.planVersion, activityType: 'questoes',
    subjectId: block.subjectId, subtopicId: block.subtopicId, status: 'completed', elapsedSeconds: 60,
    endedAt: new Date().toISOString(),
  };
  const context = { userId: 'student-a', contestId: 'pc_al_2026' };
  assert.equal(validatePlanCompletionEvidence(block, evidence, context).valid, true);
  for (const key of ['scopeKey', 'planId', 'planVersion', 'subjectId', 'subtopicId']) {
    const invalid = { ...evidence };
    delete invalid[key];
    assert.equal(validatePlanCompletionEvidence(block, invalid, context).valid, false, key);
  }
  assert.equal(validatePlanCompletionEvidence(block, { ...evidence, endedAt: 'invalid' }, context).valid, false);
  assert.equal(validatePlanCompletionEvidence(block, { ...evidence, planId: 'other' }, context).valid, false);
});

test('actualMinutes deriva de elapsedSeconds e conclusão recupera falha posterior', async () => {
  const repository = memoryRepo('student-a', 'pc_al_2026', {
    failOnce: (store, value) => store === 'routineDailyStates' && value?.actualMinutes > 0,
  });
  await seed(repository);
  const service = new RoutineService({ repository });
  const block = await service.createBlock({ date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20 });
  await service.startBlock(block.id);
  const evidence = {
    id: 'session-1', blockId: block.id, userId: 'student-a', contestId: 'pc_al_2026', scopeKey: block.scopeKey,
    planId: block.planId, planVersion: block.planVersion, activityType: block.activityType,
    subjectId: block.subjectId, subtopicId: block.subtopicId, status: 'completed', elapsedSeconds: 60,
    endedAt: new Date().toISOString(),
  };
  await assert.rejects(() => service.completeBlock(block.id, { actualMinutes: 20, evidence, skipAcademicActivity: true }), /SIMULATED_WRITE_FAILURE/);
  const retry = await service.completeBlock(block.id, { actualMinutes: 20, evidence, skipAcademicActivity: true });
  assert.equal(retry.status, 'completed');
  assert.equal(retry.actualMinutes, 1);
  const journals = await repository.getAll('meta');
  assert.ok(journals.some((row) => row.key.startsWith('study_plan_completion:') && (row.value?.status || row.status) === 'completed'));
});

test('journal de conclusão retoma dailyGoal, streak e emblemas sem repetir etapas concluídas', async () => {
  for (const failingStep of ['dailyGoal', 'streak', 'emblems']) {
    const repository = memoryRepo();
    await seed(repository);
    const calls = { dailyGoal: 0, streak: 0, emblems: 0 };
    let failed = false;
    const effect = (step) => async () => {
      calls[step] += 1;
      if (step === failingStep && !failed) {
        failed = true;
        throw new Error(`FAIL_${step}`);
      }
      return {};
    };
    const service = new RoutineService({
      repository,
      effects: {
        applyDailyGoalActivity: effect('dailyGoal'),
        applyValidStudyDay: effect('streak'),
        refreshEmblems: effect('emblems'),
      },
    });
    const block = await service.createBlock({
      date: dateKey(), activityType: 'questoes', subjectId: 'discipline-1', subtopicId: 'subtopic-1', plannedMinutes: 20,
    });
    await service.startBlock(block.id);
    const evidence = evidenceFor(block, `session-${failingStep}`, 120);
    await assert.rejects(() => service.completeBlock(block.id, { evidence }), new RegExp(`FAIL_${failingStep}`));
    const retry = await service.completeBlock(block.id, { evidence });
    assert.equal(retry.status, 'completed');
    assert.equal(calls.dailyGoal, failingStep === 'dailyGoal' ? 2 : 1);
    assert.equal(calls.streak, failingStep === 'streak' ? 2 : 1);
    assert.equal(calls.emblems, failingStep === 'emblems' ? 2 : 1);
    const journal = (await repository.getAll('meta')).find((row) => row.key.startsWith('study_plan_completion:'))?.value;
    assert.equal(journal?.status, 'completed');
    assert.equal(new Set(retry.processedEventIds).size, retry.processedEventIds.length);
  }
});

test('interface bloqueia duplo clique e exige seleção curricular sem redesenho', () => {
  const ui = fs.readFileSync(new URL('../js/ui/expedition.js', import.meta.url), 'utf8');
  const planner = fs.readFileSync(new URL('../js/core/routine/routinePlanner.js', import.meta.url), 'utf8');
  assert.match(ui, /id="lt-panel"/);
  assert.match(ui, /setAttribute\('aria-busy', 'true'\)/);
  assert.match(ui, /if \(running\) return/);
  assert.match(ui, /id="sb-subject"/);
  assert.match(ui, /id="sb-subtopic"/);
  assert.match(ui, /Selecione uma disciplina e um subtópico elegível/);
  assert.doesNotMatch(planner, /Mini sessão de questões|Teoria em pílula/);
});
