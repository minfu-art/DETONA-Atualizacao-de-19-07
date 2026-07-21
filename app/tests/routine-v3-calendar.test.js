/**
 * Rotina V3 — calendário dinâmico, jornada até a prova, avatar chibi (sem XP).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey,
  createRoutineProfile,
  createRoutineBlock,
  ROUTINE_SCHEMA_VERSION,
  normalizeRoutineProfile,
} from '../js/core/routine/routineSchema.js';
import {
  parseDateKey,
  addDays,
  startOfWeek,
  weekDatesFrom,
  shiftWeek,
  monthMatrix,
  shiftMonth,
  aggregateDays,
  dayLoadLevel,
  examJourney,
  chibiState,
  weekSummaryStats,
  MONTH_NAMES,
  WEEKDAY_SHORT,
} from '../js/core/routine/routineCalendar.js';
import { RoutineService } from '../js/services/routineService.js';

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

test('calendário: startOfWeek e weekDatesFrom retornam 7 dias a partir de domingo', () => {
  // 2026-07-15 = quarta
  const week = weekDatesFrom('2026-07-15');
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-07-12'); // domingo
  assert.equal(week[6], '2026-07-18'); // sábado
  assert.equal(startOfWeek('2026-07-15'), '2026-07-12');
});

test('calendário: shiftWeek avança e retrocede semanas', () => {
  const start = '2026-07-12';
  assert.equal(shiftWeek(start, 1), '2026-07-19');
  assert.equal(shiftWeek(start, -1), '2026-07-05');
  assert.equal(shiftWeek(start, 0), start);
});

test('calendário: monthMatrix preenche células e marca inMonth', () => {
  // julho 2026 começa na quarta (day 3)
  const cells = monthMatrix(2026, 6);
  assert.ok(cells.length % 7 === 0);
  assert.ok(cells.length >= 28);
  const inMonth = cells.filter((c) => c.inMonth);
  assert.equal(inMonth.length, 31);
  assert.equal(inMonth[0].date, '2026-07-01');
  assert.equal(inMonth[30].date, '2026-07-31');
  assert.ok(cells.some((c) => !c.inMonth));
  assert.equal(MONTH_NAMES[6], 'Julho');
  assert.equal(WEEKDAY_SHORT.length, 7);
});

test('calendário: shiftMonth troca ano corretamente', () => {
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, monthIndex: 11 });
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, monthIndex: 0 });
  assert.deepEqual(shiftMonth(2026, 6, 0), { year: 2026, monthIndex: 6 });
});

test('calendário: addDays e parseDateKey são estáveis', () => {
  assert.equal(addDays('2026-07-15', 3), '2026-07-18');
  assert.equal(addDays('2026-07-01', -1), '2026-06-30');
  const d = parseDateKey('2026-07-15');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 15);
});

test('aggregateDays e dayLoadLevel agregam blocos sem cancelados', () => {
  const dates = ['2026-07-14', '2026-07-15'];
  const blocks = [
    createRoutineBlock({ date: '2026-07-15', plannedMinutes: 50, actualMinutes: 40, status: 'completed', activityType: 'teoria' }),
    createRoutineBlock({ date: '2026-07-15', plannedMinutes: 30, status: 'planned', activityType: 'questoes' }),
    createRoutineBlock({ date: '2026-07-15', plannedMinutes: 20, status: 'cancelled', activityType: 'revisao' }),
    createRoutineBlock({ date: '2026-07-15', plannedMinutes: 15, status: 'planned', activityType: 'revisao' }),
  ];
  const days = aggregateDays(blocks, dates, [
    { date: '2026-07-14', restDay: true, minGoalMet: false, actualMinutes: 0 },
    { date: '2026-07-15', restDay: false, minGoalMet: true, actualMinutes: 40 },
  ]);
  assert.equal(days[0].restDay, true);
  assert.equal(days[1].completed, 1);
  assert.equal(days[1].plannedMinutes, 95); // 50+30+15 (cancelled out)
  assert.equal(days[1].reviews, 1);
  assert.equal(days[1].questions, 1);
  assert.equal(days[1].minGoalMet, true);
  assert.equal(dayLoadLevel(0), 'empty');
  assert.equal(dayLoadLevel(20, 90), 'low');
  assert.equal(dayLoadLevel(50, 90), 'mid');
  assert.equal(dayLoadLevel(80, 90), 'high');
  assert.equal(dayLoadLevel(100, 90), 'overload');
});

test('weekSummaryStats calcula adesão', () => {
  const stats = weekSummaryStats([
    { plannedMinutes: 60, actualMinutes: 30, completed: 1, blocks: [{}, {}], minGoalMet: true },
    { plannedMinutes: 40, actualMinutes: 40, completed: 2, blocks: [{}], minGoalMet: true },
  ]);
  assert.equal(stats.plannedMinutes, 100);
  assert.equal(stats.actualMinutes, 70);
  assert.equal(stats.completedBlocks, 3);
  assert.equal(stats.daysMet, 2);
  assert.equal(stats.adherence, 70);
});

test('examJourney sem data: fase sem_data e position 0', () => {
  const j = examJourney({ examDate: null, today: '2026-07-15' });
  assert.equal(j.hasExam, false);
  assert.equal(j.phase, 'sem_data');
  assert.equal(j.positionPct, 0);
  assert.equal(j.daysLeft, null);
  const chibi = chibiState(j);
  assert.equal(chibi.pose, 'idle');
  assert.ok(chibi.message.includes('data da prova') || chibi.message.length > 0);
});

test('examJourney: contagem regressiva e positionPct na trilha (não é XP)', () => {
  const j = examJourney({
    examDate: '2026-10-15',
    startDate: '2026-07-15',
    today: '2026-07-15',
  });
  assert.equal(j.hasExam, true);
  assert.equal(j.examDate, '2026-10-15');
  assert.ok(j.daysLeft >= 90 && j.daysLeft <= 93);
  assert.ok(j.weeksLeft >= 13);
  assert.ok(j.positionPct >= 0 && j.positionPct <= 5);
  assert.ok(j.elapsedPct >= 0);
  assert.ok(j.remainingPct > 90);
  assert.ok(Array.isArray(j.milestones));
  assert.ok(j.milestones.length >= 5);
  assert.equal(j.milestones.find((m) => m.id === 'exam')?.label, 'Dia da prova');
  // no início, marcos futuros não passed (exceto start)
  assert.equal(j.milestones.find((m) => m.id === 'start')?.passed, true);
  assert.equal(j.milestones.find((m) => m.id === 'exam')?.passed, false);
});

test('examJourney: meio do caminho ~50% e reta final', () => {
  const mid = examJourney({
    examDate: '2026-10-15',
    startDate: '2026-07-15',
    today: '2026-08-30',
  });
  assert.ok(mid.positionPct > 30 && mid.positionPct < 70);

  const final = examJourney({
    examDate: '2026-10-15',
    startDate: '2026-07-15',
    today: '2026-10-01',
  });
  assert.ok(final.daysLeft <= 15);
  assert.ok(['reta_final', 'semana_prova'].includes(final.phase));
  const chibi = chibiState(final);
  assert.ok(['walk', 'focus'].includes(chibi.pose));
});

test('examJourney: dia da prova e chibi celebrate', () => {
  const j = examJourney({
    examDate: '2026-10-15',
    startDate: '2026-07-15',
    today: '2026-10-15',
  });
  assert.ok(j.daysLeft <= 0);
  assert.equal(j.phase, 'prova');
  assert.equal(j.positionPct, 100);
  assert.equal(chibiState(j).pose, 'celebrate');
});

test('examJourney: positionPct nunca representa XP (só tempo)', () => {
  const j = examJourney({
    examDate: '2026-12-01',
    startDate: '2026-06-01',
    today: '2026-09-01',
  });
  // posição é fração temporal, independente de blocos/sessões
  assert.equal(typeof j.positionPct, 'number');
  assert.ok(!('xp' in j));
  assert.ok(!('level' in j));
  assert.ok(!('stars' in j));
  assert.ok(!('mastery' in j));
});

test('schema v2: profile normaliza examTime, examLocation, journeyStartDate', () => {
  const p = normalizeRoutineProfile({
    examDate: '2026-11-01',
    examTime: '14:00',
    examLocation: 'Maceió',
    examNotes: 'Sala A',
    createdAt: '2026-05-01T10:00:00.000Z',
  });
  assert.equal(p.schemaVersion, ROUTINE_SCHEMA_VERSION);
  assert.ok(p.schemaVersion >= 2);
  assert.equal(p.examDate, '2026-11-01');
  assert.equal(p.examTime, '14:00');
  assert.equal(p.examLocation, 'Maceió');
  assert.equal(p.journeyStartDate, '2026-05-01');
});

test('serviço: getMonthView e getWeekView com cursor', async () => {
  const repo = memoryRepo();
  await repo.put('player', { id: 'p1', name: 'Ana', exam_date: null, xp: 100, level: 3 });
  const svc = new RoutineService({ repository: repo });
  await svc.completeSetup({ model: 'leve', generatePlan: true });

  const week = await svc.getWeekView('2026-07-15');
  assert.equal(week.week.length, 7);
  assert.ok(week.summary);
  assert.equal(typeof week.summary.adherence, 'number');
  assert.ok(Array.isArray(week.days));

  const shifted = await svc.shiftWeekView(week.weekStart, 1);
  assert.notEqual(shifted.weekStart, week.weekStart);

  const month = await svc.getMonthView(2026, 6);
  assert.equal(month.monthName, 'Julho');
  assert.equal(month.year, 2026);
  assert.ok(month.cells.length >= 28);
  assert.ok(month.prev.year === 2026 && month.prev.monthIndex === 5);
  assert.ok(month.next.monthIndex === 7);
});

test('serviço: setExamMeta e getExamJourney + espelho no player sem XP', async () => {
  const repo = memoryRepo();
  await repo.put('player', { id: 'p1', name: 'Ana', exam_date: null, xp: 250, level: 5, stars: 2 });
  const svc = new RoutineService({ repository: repo });
  await svc.completeSetup({ model: 'equilibrada', generatePlan: false });

  const beforeXp = (await repo.getAll('player'))[0].xp;
  const beforeLevel = (await repo.getAll('player'))[0].level;

  await svc.setExamMeta({
    examDate: '2026-12-10',
    examTime: '09:00',
    examLocation: 'UFAL',
    examNotes: 'Levar doc',
    journeyStartDate: '2026-07-01',
  });

  const snap = await svc.getExamJourney();
  assert.equal(snap.examDate, '2026-12-10');
  assert.equal(snap.examTime, '09:00');
  assert.equal(snap.journey.hasExam, true);
  assert.ok(snap.journey.daysLeft > 0);
  assert.ok(snap.chibi.message.length > 0);
  assert.ok(['idle', 'walk', 'focus', 'celebrate'].includes(snap.chibi.pose));

  const player = (await repo.getAll('player'))[0];
  assert.equal(player.exam_date, '2026-12-10');
  assert.equal(player.xp, beforeXp);
  assert.equal(player.level, beforeLevel);

  // limpar data
  await svc.setExamMeta({ examDate: null });
  const empty = await svc.getExamJourney();
  assert.equal(empty.journey.hasExam, false);
});

test('serviço: rotina calendário não altera domínio/estrelas/progresso acadêmico', async () => {
  const repo = memoryRepo();
  await repo.put('player', {
    id: 'p1', name: 'Bia', exam_date: '2026-11-01', xp: 500, level: 8, stars: 4,
  });
  await repo.put('topicProgress', {
    id: 'tp1', topicId: 't1', mastery: 0.4, stars: 2, correct: 10, wrong: 5,
  });
  const svc = new RoutineService({ repository: repo });
  await svc.completeSetup({ model: 'leve', generatePlan: true });
  await svc.setExamMeta({ examDate: '2026-11-01', journeyStartDate: '2026-06-01' });
  await svc.createBlock({
    title: 'Questões LP',
    activityType: 'questoes',
    plannedMinutes: 25,
    date: dateKey(),
  });
  await svc.getMonthView(2026, 6);
  await svc.getExamJourney();
  await svc.getWeekView();

  const player = (await repo.getAll('player'))[0];
  assert.equal(player.xp, 500);
  assert.equal(player.level, 8);
  assert.equal(player.stars, 4);
  const tp = (await repo.getAll('topicProgress'))[0];
  assert.equal(tp.mastery, 0.4);
  assert.equal(tp.stars, 2);
});

test('createRoutineProfile default schemaVersion 2', () => {
  const p = createRoutineProfile({ userId: 'u', contestId: 'c' });
  assert.equal(p.schemaVersion, 2);
  assert.equal(p.examTime, null);
  assert.equal(p.journeyStartDate, p.createdAt.slice(0, 10));
});
