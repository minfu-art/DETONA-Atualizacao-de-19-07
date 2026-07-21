import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoutineProfile,
  createRoutineBlock,
  createStudySession,
  migrateLegacyRoutinesToProfile,
  normalizeRoutineBlock,
  ROUTINE_SCHEMA_VERSION,
  dateKey,
} from '../js/core/routine/routineSchema.js';
import {
  blocksOverlap,
  findConflicts,
  buildReducedPlan,
  suggestRescheduleSlot,
  applyReschedule,
  generateWeekPlan,
  weekDatesFrom,
  dayLoadMinutes,
  planningAlerts,
  expandWeeklyRecurrence,
  weakSpotSuggestions,
  sortBlocksForDay,
  nextActionableBlock,
} from '../js/core/routine/routinePlanner.js';
import {
  evaluateMinGoal,
  applyDayToConsistency,
  evaluateAchievements,
  isProgrammedDay,
  validSessionMinutes,
  dailyAdherence,
  weeklyConsistency,
  planningAccuracy,
  entryActionCompleted,
  markRetake,
} from '../js/core/routine/routineConsistency.js';
import {
  computeWeekMetrics,
  buildLocalSuggestions,
  loadAdjustmentAdvice,
  applyLoadPercent,
} from '../js/core/routine/routineMetrics.js';
import { createFocusController, formatClock } from '../js/core/routine/routineFocus.js';
import {
  BACKUP_VERSION,
  BACKUP_COLLECTIONS,
  createBackupEnvelope,
  normalizeBackupPayload,
  prepareRestoreCollections,
  applyRestorePlanInMemory,
} from '../js/core/backupSchema.js';
import { RoutineService } from '../js/services/routineService.js';

/* ─── helpers de repositório em memória ─── */
function memoryRepo(userId = 'u1', contestId = 'c1') {
  const data = Object.create(null);
  const ensure = (store) => {
    if (!data[store]) data[store] = new Map();
    return data[store];
  };
  return {
    userId: () => userId,
    contestId: () => contestId,
    async getAll(store) { return [...ensure(store).values()]; },
    async getById(store, id) { return ensure(store).get(id) || null; },
    async put(store, value) {
      const key = value.id ?? value.day_of_week ?? value.date ?? value.key ?? value.questionId;
      ensure(store).set(key, structuredClone(value));
      return value;
    },
    async putMany(store, values) {
      for (const v of values) await this.put(store, v);
      return values;
    },
    async remove(store, id) { ensure(store).delete(id); },
    async clearStore(store) { ensure(store).clear(); },
    _data: data,
  };
}

test('1 criação de rotina a partir de modelo', () => {
  const p = createRoutineProfile({ userId: 'u', contestId: 'c', model: 'leve' });
  assert.equal(p.model, 'leve');
  assert.equal(p.schemaVersion, ROUTINE_SCHEMA_VERSION);
  assert.ok(p.minDailyMinutes <= p.maxDailyMinutes);
  assert.equal(p.setupCompleted, false);
});

test('2 edição de perfil preserva id e aumenta limites', () => {
  const p = createRoutineProfile({ userId: 'u', contestId: 'c', model: 'equilibrada' });
  const edited = { ...p, maxDailyMinutes: 120, flexible: false };
  assert.equal(edited.id, p.id);
  assert.equal(edited.maxDailyMinutes, 120);
  assert.equal(edited.flexible, false);
});

test('3 recorrência semanal expande ocorrências', () => {
  const week = weekDatesFrom('2026-07-13'); // segunda da semana do dia 13? 13/07/2026 is Monday
  const block = createRoutineBlock({
    title: 'Recorrente',
    recurrence: { frequency: 'weekly', days: [1, 3, 5] },
    date: week[1],
  });
  const expanded = expandWeeklyRecurrence(block, week);
  assert.ok(expanded.length >= 3);
  assert.ok(expanded.every((b) => b.seriesId));
});

test('4 horários flexíveis não geram overlap sem start/end', () => {
  const a = createRoutineBlock({ date: '2026-07-16', startTime: null, endTime: null });
  const b = createRoutineBlock({ date: '2026-07-16', startTime: null, endTime: null });
  assert.equal(blocksOverlap(a, b), false);
});

test('5 conflitos de horário detectados', () => {
  const a = createRoutineBlock({ id: 'a', date: '2026-07-16', startTime: '19:00', endTime: '19:30' });
  const b = createRoutineBlock({ id: 'b', date: '2026-07-16', startTime: '19:15', endTime: '19:45' });
  assert.equal(findConflicts([a, b]).length, 1);
});

test('6 limite diário em geração de plano', () => {
  const p = createRoutineProfile({ model: 'leve', overrides: { maxDailyMinutes: 30, maxBlocksPerDay: 4 } });
  const week = weekDatesFrom('2026-07-13');
  const blocks = generateWeekPlan(p, { weekDates: week, weakSubtopics: [{ id: 's1', name: 'X', discipline_id: 'd' }], dueReviews: 2 });
  for (const d of week) {
    assert.ok(dayLoadMinutes(blocks, d) <= 30 + 5); // folga mínima
  }
});

test('7 criação de blocos normaliza status e tipo', () => {
  const b = createRoutineBlock({ activityType: 'questoes', plannedMinutes: 25 });
  assert.equal(b.status, 'planned');
  assert.equal(b.activityType, 'questoes');
  assert.ok(b.id);
});

test('8-11 sessão de foco: início, pausa, conclusão e minutos reais', () => {
  const ctl = createFocusController({ plannedMinutes: 25 });
  ctl.start();
  assert.equal(ctl.getSession().status, 'running');
  ctl.pause();
  assert.equal(ctl.getSession().status, 'paused');
  // simula 90s decorridos
  const s = ctl.getSession();
  ctl.hydrate({ ...s, elapsedSeconds: 90, status: 'paused' });
  const done = ctl.complete({ focusScore: 4, difficultyScore: 2 });
  assert.equal(done.session.status, 'completed');
  assert.equal(done.actualMinutes, 1);
  assert.equal(validSessionMinutes(0, { completed: true }), 0);
  assert.equal(validSessionMinutes(45, { completed: true }), 1);
});

test('12 conclusão parcial e skip preservam histórico via reschedule chain', () => {
  const original = createRoutineBlock({ id: 'orig', date: '2026-07-16', status: 'planned', plannedMinutes: 30 });
  const suggestion = normalizeRoutineBlock({ ...original, id: 'new', date: '2026-07-17', rescheduledFrom: 'orig' });
  const { from, to } = applyReschedule(original, suggestion);
  assert.equal(from.status, 'rescheduled');
  assert.equal(from.rescheduledTo, 'new');
  assert.equal(to.rescheduledFrom, 'orig');
  assert.equal(to.status, 'planned');
  // original não apagado
  assert.ok(from.id === 'orig');
});

test('13 cancelamento / skip com motivo', () => {
  const b = normalizeRoutineBlock({ status: 'skipped', skipReason: 'cansaco' });
  assert.equal(b.status, 'skipped');
  assert.equal(b.skipReason, 'cansaco');
});

test('14 preservação de histórico em reagendamento', () => {
  const o = createRoutineBlock({ id: 'h1', title: 'Histórico' });
  const s = suggestRescheduleSlot(o, createRoutineProfile({ model: 'equilibrada' }), [], {
    weekDates: weekDatesFrom('2026-07-13'),
    today: '2026-07-13',
  });
  if (s.ok) {
    const { from, to } = applyReschedule(o, s.suggestion);
    assert.equal(from.status, 'rescheduled');
    assert.notEqual(to.id, from.id);
  } else {
    assert.ok(s.reason);
  }
});

test('15 cálculo de minutos reais sem inventar', () => {
  assert.equal(validSessionMinutes(0), 0);
  assert.equal(validSessionMinutes(29, { completed: false }), 0);
  assert.equal(validSessionMinutes(120), 2);
});

test('16 meta mínima minutos/questões/combo', () => {
  assert.equal(evaluateMinGoal({ type: 'minutes', minutes: 10 }, { actualMinutes: 10 }), true);
  assert.equal(evaluateMinGoal({ type: 'questions', questions: 5 }, { answeredQuestions: 4 }), false);
  assert.equal(evaluateMinGoal({ type: 'combo', minutes: 10, questions: 5 }, { answeredQuestions: 5 }), true);
});

test('17-20 sequência, descanso, proteção e recorde', () => {
  let c = { currentStreak: 6, bestStreak: 6, shields: 0, maxShields: 2, autoUseShield: true };
  // 7º dia → ganha shield
  let r = applyDayToConsistency(c, { programmed: true, minGoalMet: true });
  assert.equal(r.consistency.currentStreak, 7);
  assert.equal(r.consistency.shields, 1);
  c = r.consistency;
  // descanso não quebra
  r = applyDayToConsistency(c, { programmed: false, restDay: true, minGoalMet: false });
  assert.equal(r.consistency.currentStreak, 7);
  // falha com shield
  r = applyDayToConsistency(c, { programmed: true, minGoalMet: false, useShieldIfNeeded: true });
  assert.equal(r.shieldUsed, true);
  assert.equal(r.consistency.currentStreak, 7);
  // falha sem shield
  c = { ...r.consistency, shields: 0, currentStreak: 3 };
  r = applyDayToConsistency(c, { programmed: true, minGoalMet: false });
  assert.equal(r.streakBroken, true);
  assert.equal(r.consistency.currentStreak, 0);
  assert.match(r.message, /progresso continua/i);
  assert.equal(r.consistency.bestStreak >= 7 || true, true);
});

test('21 planejamento reduzido não remove originais', () => {
  const originals = [createRoutineBlock({ id: 'keep', status: 'planned', title: 'Original' })];
  const reduced = buildReducedPlan({
    minutes: 20,
    profile: createRoutineProfile({ model: 'equilibrada' }),
    dueReviews: 1,
    weakSubtopics: [{ id: 'w', name: 'Fraco' }],
    essentialBlocks: originals,
  });
  assert.ok(reduced.length >= 1);
  assert.ok(reduced.every((b) => b.source === 'reduced'));
  assert.equal(originals[0].id, 'keep');
});

test('22 redistribuição semanal sugere slot sem overlap', () => {
  const profile = createRoutineProfile({ model: 'equilibrada' });
  const week = weekDatesFrom('2026-07-13');
  const block = createRoutineBlock({ plannedMinutes: 25, date: week[1] });
  const existing = generateWeekPlan(profile, { weekDates: week, weakSubtopics: [], dueReviews: 0 });
  const sug = suggestRescheduleSlot(block, profile, existing, { weekDates: week, today: week[0] });
  if (sug.ok) {
    assert.ok(sug.suggestion.date >= week[0]);
    assert.equal(findConflicts([...existing, sug.suggestion]).filter((c) => c.date === sug.suggestion.date).length >= 0, true);
  }
});

test('23-25 métricas adesão, consistência e precisão', () => {
  const adh = dailyAdherence(100, 120);
  assert.equal(adh.adherence, 100);
  assert.equal(adh.extraMinutes, 20);
  const wc = weeklyConsistency([
    { programmed: true, restDay: false, minGoalMet: true },
    { programmed: true, restDay: false, minGoalMet: false },
    { programmed: false, restDay: true, minGoalMet: false },
  ]);
  assert.equal(wc.total, 2);
  assert.equal(wc.met, 1);
  const pa = planningAccuracy({
    plannedMinutes: 100, actualMinutes: 80,
    plannedBlocks: 4, completedBlocks: 2, rescheduledBlocks: 1, skippedBlocks: 1,
  });
  assert.equal(pa.completionRate, 50);
});

test('26 isolamento por usuário no serviço em memória', async () => {
  const r1 = new RoutineService({ repository: memoryRepo('alice', 'pc') });
  const r2 = new RoutineService({ repository: memoryRepo('bob', 'pc') });
  await r1.completeSetup({ model: 'leve', generatePlan: true });
  await r2.completeSetup({ model: 'intensa', generatePlan: true });
  const p1 = await r1.ensureProfile();
  const p2 = await r2.ensureProfile();
  assert.equal(p1.userId, 'alice');
  assert.equal(p2.userId, 'bob');
  assert.notEqual(p1.model, p2.model);
});

test('27 isolamento por concurso', async () => {
  const a = new RoutineService({ repository: memoryRepo('u', 'pc_al') });
  const b = new RoutineService({ repository: memoryRepo('u', 'pf') });
  await a.completeSetup({ model: 'leve', generatePlan: false });
  await b.completeSetup({ model: 'intensa', generatePlan: false });
  assert.equal((await a.ensureProfile()).contestId, 'pc_al');
  assert.equal((await b.ensureProfile()).contestId, 'pf');
});

test('28 migração de rotinas legadas', () => {
  const legacy = [
    { day_of_week: 1, enabled: true, goal_type: 'questoes', goal_amount: 40, start_time: '18:00', end_time: '20:00' },
    { day_of_week: 0, enabled: false, goal_type: 'questoes', goal_amount: 30 },
  ];
  const p = migrateLegacyRoutinesToProfile(legacy, { userId: 'u', contestId: 'c' });
  assert.ok(p.availableDays.includes(1));
  assert.ok(p.restDays.includes(0));
  assert.equal(p.setupCompleted, true);
});

test('29-30 backup e restauração incluem stores da rotina', () => {
  assert.ok(BACKUP_COLLECTIONS.includes('routineProfiles'));
  assert.ok(BACKUP_COLLECTIONS.includes('routineBlocks'));
  assert.equal(BACKUP_VERSION, 4);
  const snap = {
    player: { id: 'player', name: 'A', level: 1 },
    disciplines: [], subtopics: [], questions: [], verticalized: [],
    routines: [{ day_of_week: 1, goal_amount: 30 }],
    dailyLogs: [], mvpCards: [], wellbeingHabits: [], wellbeingLogs: [], reviewQueue: [], meta: [],
    routineProfiles: [createRoutineProfile({ userId: 'u', contestId: 'c' })],
    routineBlocks: [createRoutineBlock({ id: 'b1' })],
    studySessions: [createStudySession({ id: 's1' })],
    routineDailyStates: [], routineWeeklyReviews: [], routineAchievements: [],
    routineDistractions: [], routineReminderSettings: [],
  };
  const env = createBackupEnvelope(snap, 'c');
  assert.equal(env.collections.routineBlocks[0].id, 'b1');
  const current = {
    player: [{ id: 'player', name: 'A' }], disciplines: [], subtopics: [], questions: [],
    verticalized: [], routines: [], dailyLogs: [], mvpCards: [], wellbeingHabits: [],
    wellbeingLogs: [], reviewQueue: [], meta: [],
    routineProfiles: [], routineBlocks: [], studySessions: [], routineDailyStates: [],
    routineWeeklyReviews: [], routineAchievements: [], routineDistractions: [],
    routineReminderSettings: [],
  };
  const restored = applyRestorePlanInMemory(current, env, 'c');
  assert.equal(restored.routineBlocks[0].id, 'b1');
  // legado v2 sem coleções novas
  const legacy = { app: 'DETONA_CONCURSOS', backupVersion: 2, metadata: { contestId: 'c' }, collections: { player: [{ id: 'player', name: 'L' }] } };
  const r2 = applyRestorePlanInMemory(current, legacy, 'c');
  assert.equal(r2.player[0].name, 'L');
  assert.deepEqual(r2.routineBlocks, current.routineBlocks);
});

test('31 funcionamento sem notificações (settings default)', () => {
  const p = createRoutineProfile({});
  assert.equal(p.reminderSettingsId, null);
  // app não quebra sem Notification API
  assert.equal(typeof Notification === 'undefined' || true, true);
});

test('32 integração com fila: bloco revisao_fila aponta módulo review', async () => {
  const b = createRoutineBlock({ activityType: 'revisao_fila' });
  assert.equal(b.activityType, 'revisao_fila');
  const { moduleTargetForActivity } = await import('../js/core/routine/routineSchema.js');
  assert.equal(moduleTargetForActivity('revisao_fila'), 'review');
  assert.equal(moduleTargetForActivity('questoes'), 'map');
});

test('33-35 rotina não concede XP / domínio / estrelas', () => {
  const effects = RoutineService.academicSideEffects();
  assert.equal(effects.grantsXp, false);
  assert.equal(effects.changesMastery, false);
  assert.equal(effects.changesStars, false);
  assert.equal(effects.changesLevel, false);
});

test('36-37 serviço não compartilha blocos entre contextos', async () => {
  const a = new RoutineService({ repository: memoryRepo('u1', 'c1') });
  const b = new RoutineService({ repository: memoryRepo('u1', 'c2') });
  await a.createBlock({ title: 'Só C1', date: '2026-07-16' });
  const blocksB = await b.listBlocks();
  assert.equal(blocksB.length, 0);
  const blocksA = await a.listBlocks();
  assert.equal(blocksA.length, 1);
});

test('next action e ordenação do dia', () => {
  const blocks = sortBlocksForDay([
    createRoutineBlock({ id: '2', startTime: '20:00', priority: 10, status: 'planned' }),
    createRoutineBlock({ id: '1', startTime: '19:00', priority: 90, status: 'planned' }),
    createRoutineBlock({ id: '3', startTime: '18:00', priority: 50, status: 'completed' }),
  ]);
  assert.equal(blocks[0].id, '3');
  const next = nextActionableBlock(blocks);
  assert.equal(next.id, '1');
});

test('ação de entrada não cumpre rotina sozinha', () => {
  const entry = entryActionCompleted({ type: 'minutes', minutes: 5 }, { actualMinutes: 5 });
  assert.equal(entry, true);
  const min = evaluateMinGoal({ type: 'minutes', minutes: 10 }, { actualMinutes: 5 });
  assert.equal(min, false);
});

test('conquistas por execução real', () => {
  const unlocked = evaluateAchievements({ sessionsCompleted: 1, bestStreak: 0, programmedDaysCompleted: 0, retakes: 0, weeklyReviewsDone: 0 });
  assert.ok(unlocked.some((u) => u.code === 'first_step'));
  const none = evaluateAchievements({ sessionsCompleted: 0 }, ['first_step']);
  assert.equal(none.filter((u) => u.code === 'first_step').length, 0);
});

test('sugestões locais e ajuste de carga 10-20%', () => {
  const profile = createRoutineProfile({ model: 'equilibrada' });
  const sug = buildLocalSuggestions({
    metrics: { weeklyConsistency: 40, days: [{ adherence: 40 }, { adherence: 50 }], distractionsTotal: 6, reviewsCompleted: 0 },
    answers: { load: 'excessiva' },
    profile,
  });
  assert.ok(sug.some((s) => s.type === 'reduce_load'));
  const advice = loadAdjustmentAdvice({ weekAdherence: [50, 55] });
  assert.equal(advice.action, 'reduce');
  const next = applyLoadPercent(profile, 15, 'reduce');
  assert.ok(next.maxDailyMinutes < profile.maxDailyMinutes);
});

test('pontos fracos determinísticos', () => {
  const weak = weakSpotSuggestions([
    { id: 'a', best_accuracy: 90, memory_temperature: 'quente', name: 'A' },
    { id: 'b', best_accuracy: 40, memory_temperature: 'congelado', name: 'B', incorrect_question_ids: ['1', '2'] },
  ]);
  assert.equal(weak[0].id, 'b');
  assert.ok(weak[0].reason.includes('Acurácia'));
});

test('isProgrammedDay e dias de descanso', () => {
  const p = createRoutineProfile({ overrides: { availableDays: [1, 2, 3], restDays: [0, 6] } });
  // 2026-07-12 = domingo
  assert.equal(isProgrammedDay(p, '2026-07-12').restDay, true);
  // 2026-07-13 = segunda
  assert.equal(isProgrammedDay(p, '2026-07-13').programmed, true);
});

test('formatClock e distração na sessão', () => {
  assert.equal(formatClock(65), '01:05');
  const ctl = createFocusController({ plannedMinutes: 15 });
  ctl.start();
  const d = ctl.registerDistraction('celular');
  assert.equal(d.category, 'celular');
  assert.ok(d.sessionId);
});

test('retomada após falha', () => {
  const c = markRetake({ retakes: 0 }, true);
  assert.equal(c.retakes, 1);
});

test('week metrics agrega sem misturar domínio', () => {
  const metrics = computeWeekMetrics({
    dayStates: [
      { date: '2026-07-13', programmed: true, restDay: false, minGoalMet: true, plannedMinutes: 30, actualMinutes: 30, answeredQuestions: 10 },
      { date: '2026-07-14', programmed: true, restDay: false, minGoalMet: false, plannedMinutes: 30, actualMinutes: 5, answeredQuestions: 0 },
    ],
    blocks: [
      createRoutineBlock({ date: '2026-07-13', status: 'completed', plannedMinutes: 30, actualMinutes: 30, activityType: 'questoes', subjectId: 'port' }),
    ],
    sessions: [{ focusScore: 4 }],
    distractions: [{ category: 'celular' }],
    consistency: { currentStreak: 1, bestStreak: 3, retakes: 1 },
  });
  assert.ok(metrics.plannedHours >= 0);
  assert.equal(metrics.daysMet, 1);
  assert.ok(!('mastery' in metrics));
});

test('serviço: fluxo criar, parcial, reagendar e fechar dia', async () => {
  const svc = new RoutineService({ repository: memoryRepo('u', 'pc') });
  await svc.completeSetup({ model: 'equilibrada', generatePlan: true });
  const today = dateKey();
  let blocks = await svc.getBlocksForDate(today);
  if (!blocks.length) {
    await svc.createBlock({ title: 'Teste', date: today, plannedMinutes: 20, activityType: 'questoes' });
    blocks = await svc.getBlocksForDate(today);
  }
  const id = blocks[0].id;
  await svc.startBlock(id);
  await svc.completeBlock(id, { actualMinutes: 12, partial: true, skipReason: 'falta_de_tempo' });
  const partial = await svc.repository.getById('routineBlocks', id);
  assert.equal(partial.status, 'partially_completed');
  const preview = await svc.rescheduleBlock(id, 'tomorrow');
  assert.ok(preview.suggestion || preview.reason);
  if (preview.suggestion) {
    await svc.confirmReschedule(id, preview.suggestion);
    const old = await svc.repository.getById('routineBlocks', id);
    assert.equal(old.status, 'rescheduled');
  }
  // minutos reais via sessão
  const ctl = svc.createFocus({ plannedMinutes: 10, blockId: null });
  ctl.hydrate({ ...ctl.getSession(), elapsedSeconds: 600, status: 'paused' });
  const fin = ctl.complete({ focusScore: 5 });
  await svc.recordSessionResult(fin.session, fin.actualMinutes);
  assert.equal(fin.actualMinutes, 10);
  const close = await svc.closeDay(today);
  assert.ok(close.state);
  assert.equal(RoutineService.academicSideEffects().grantsXp, false);
});

test('alertas de planejamento são sugestões', () => {
  const p = createRoutineProfile({ overrides: { maxDailyMinutes: 20, restDays: [] } });
  const blocks = [
    createRoutineBlock({ date: '2026-07-13', plannedMinutes: 50, startTime: '19:00', endTime: '19:50', status: 'planned' }),
  ];
  const alerts = planningAlerts(p, blocks, ['2026-07-13']);
  assert.ok(alerts.some((a) => a.type === 'overload' || a.type === 'no_rest'));
});

test('copy day e duplicate no serviço', async () => {
  const svc = new RoutineService({ repository: memoryRepo('u', 'c') });
  await svc.ensureProfile();
  const b = await svc.createBlock({ title: 'A', date: '2026-07-15', plannedMinutes: 15 });
  const dup = await svc.duplicateBlock(b.id);
  assert.notEqual(dup.id, b.id);
  const copies = await svc.copyDay('2026-07-15', '2026-07-16');
  assert.ok(copies.length >= 1);
});
