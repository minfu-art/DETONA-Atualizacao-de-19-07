import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOrionEvolutionModel,
  coverageProjection,
  dailyMinutesGoal,
  daysUntilExamDate,
  examDateStatus,
  OrionEvolutionService,
  recentProgressAnalysis,
  studyMinutesForDate,
} from '../js/services/orionEvolutionService.js';
import { renderOrionEvolution } from '../js/ui/orionEvolution.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Orion usa a mesma política de tempo real e não duplica sessão ligada', () => {
  const minutes = studyMinutesForDate({
    date: '2026-07-29',
    blocks: [
      { date: '2026-07-29', status: 'completed', actualMinutes: 35 },
      { date: '2026-07-29', status: 'planned', actualMinutes: 300 },
      { date: '2026-07-28', status: 'completed', actualMinutes: 90 },
    ],
    sessions: [
      { date: '2026-07-29', status: 'completed', valid: true, elapsedSeconds: 600 },
      { date: '2026-07-29', status: 'completed', valid: true, elapsedSeconds: 1200, blockId: 'block-1' },
      { date: '2026-07-29', status: 'aborted', valid: false, elapsedSeconds: 1800 },
      { date: '2026-07-29', status: 'running', valid: true, elapsedSeconds: 1800 },
    ],
    dailyStates: [{ date: '2026-07-29', actualMinutes: 200 }],
  });
  assert.equal(minutes, 45);
});

test('dailyState é fallback por dia quando não existe medição detalhada', () => {
  assert.equal(studyMinutesForDate({
    date: '2026-07-29',
    dailyStates: [{ date: '2026-07-29', actualMinutes: 42 }, { date: '2026-07-29', actualMinutes: 30 }],
  }), 42);
});

test('meta diária usa minGoal/minDailyMinutes e nunca maxDailyMinutes', () => {
  assert.deepEqual(dailyMinutesGoal({ minGoal: { type: 'minutes', minutes: 25 }, minDailyMinutes: 40, maxDailyMinutes: 180 }), {
    minutes: 25, source: 'routineProfile.minGoal.minutes',
  });
  assert.deepEqual(dailyMinutesGoal({ minGoal: { type: 'questions', questions: 20 }, minDailyMinutes: 40, maxDailyMinutes: 180 }), {
    minutes: 40, source: 'routineProfile.minDailyMinutes',
  });
  assert.deepEqual(dailyMinutesGoal({ maxDailyMinutes: 180 }), { minutes: null, source: 'none' });
});

test('análise recente mede taxa ponderada e nomeia maior taxa, não ganho de domínio', () => {
  const cutoff = new Date('2026-07-23T00:00:00-03:00');
  const analysis = recentProgressAnalysis({
    cutoff,
    disciplines: [{ id: 'port', name: 'Português' }, { id: 'penal', name: 'Direito Penal' }],
    subtopics: [
      { id: 'p1', discipline_id: 'port', best_accuracy: 99, attempt_history: [{ battleId: 'p', attemptedAt: '2026-07-28T12:00:00-03:00', total: 20, correct: 12 }] },
      { id: 'd1', discipline_id: 'penal', best_accuracy: 10, attempt_history: [{ battleId: 'd', attemptedAt: '2026-07-27T12:00:00-03:00', total: 10, correct: 8 }] },
    ],
  });
  assert.equal(analysis.metric, 'period_accuracy');
  assert.equal(analysis.globalGainPercent, null);
  assert.equal(analysis.accuracy, 20 / 30 * 100);
  assert.deepEqual(analysis.bestDiscipline, { id: 'penal', name: 'Direito Penal', answered: 10, correct: 8, accuracy: 80 });
});

test('erro de grandeza: ganho de domínio não projeta cobertura restante', () => {
  const model = buildOrionEvolutionModel({
    weeklyDashboard: { overview: { answered: 50, correct: 30, errors: 20 }, progress: { coverage: 50 }, time: { totalMinutes: 420 } },
    recentProgress: { globalGainPercent: 70, bestDiscipline: null },
  });
  assert.equal(model.remainingPercent, 50);
  assert.equal(model.estimatedDays, null);
  assert.equal(model.requiredHoursPerDay, null);
  assert.equal(model.quality.projection.available, false);
  assert.doesNotMatch(model.recommendation, /zera|concluir em|h por dia/i);
});

test('projeção aceita somente snapshots temporais equivalentes de cobertura', () => {
  assert.deepEqual(coverageProjection([{ date: '2026-08-01', coverage: 10 }], { currentCoverage: 10 }), {
    available: false, estimatedDays: null, reason: 'INSUFFICIENT_COMPARABLE_COVERAGE_HISTORY',
  });
  const valid = coverageProjection([
    { date: '2026-08-01', coverage: 10, contestId: 'c1' },
    { date: '2026-08-11', coverage: 20, contestId: 'c1' },
  ], { currentCoverage: 20 });
  assert.equal(valid.available, true);
  assert.equal(valid.estimatedDays, 80);
  assert.equal(valid.metric, 'coverage');
  assert.equal(coverageProjection([
    { date: '2026-08-01', coverage: 10, contestId: 'c1' },
    { date: '2026-08-11', coverage: 20, contestId: 'c2' },
  ]).available, false);
});

test('modelo usa meta real, accuracy factual e deixa progresso indisponível sem meta', () => {
  const model = buildOrionEvolutionModel({
    now: new Date('2026-07-29T12:00:00-03:00'), todayMinutes: 155, dailyGoalMinutes: 240,
    dailyGoalSource: 'routineProfile.minGoal.minutes', examDate: '2026-08-18', examDateSource: 'player.exam_date',
    weeklyDashboard: { overview: { answered: 50, correct: 30, errors: 20 }, progress: { coverage: 50 }, reviews: { due: 0 } },
  });
  assert.equal(model.questionsWeek, 50);
  assert.equal(model.accuracyWeek, 60);
  assert.equal(Math.round(model.dailyGoalProgress), 65);
  assert.equal(model.examDays, 20);
  assert.equal(model.estimatedDays, null);
  assert.equal(buildOrionEvolutionModel({ todayMinutes: 10 }).dailyGoalProgress, null);
});

test('recomendações exigem amostra mínima e permanecem rastreáveis', () => {
  const tiny = buildOrionEvolutionModel({ weeklyDashboard: { overview: { answered: 2, correct: 0, errors: 2 } } });
  assert.doesNotMatch(tiny.recommendation, /taxa de acerto pede|Revise os erros/);
  const enough = buildOrionEvolutionModel({ weeklyDashboard: { overview: { answered: 10, correct: 4, errors: 6 } } });
  assert.match(enough.recommendation, /10 questões.+40%/);
  const due = buildOrionEvolutionModel({ todayMinutes: 10, weeklyDashboard: { overview: { answered: 0 }, reviews: { due: 3 } } });
  assert.match(due.recommendation, /3 revisões vencidas/);
});

test('data da prova distingue ausente, hoje, passado, amanhã e ano bissexto em data local', () => {
  const now = new Date(2028, 1, 28, 23, 30);
  assert.deepEqual(examDateStatus(null, now), { state: 'missing', days: null });
  assert.deepEqual(examDateStatus('2028-02-28', now), { state: 'today', days: 0 });
  assert.deepEqual(examDateStatus('2028-02-27', now), { state: 'past', days: 0 });
  assert.deepEqual(examDateStatus('2028-02-29', now), { state: 'future', days: 1 });
  assert.equal(daysUntilExamDate('2028-03-01', now), 2);
});

test('OrionEvolutionService é somente leitura e captura meta/data com precedência correta', async () => {
  const writes = [];
  const rows = {
    routineBlocks: [], studySessions: [], routineDailyStates: [], subtopics: [], disciplines: [],
    routineProfiles: [{ minGoal: { type: 'minutes', minutes: 20 }, minDailyMinutes: 30, maxDailyMinutes: 300, examDate: '2026-12-20' }],
  };
  const repository = {
    userId: () => 'u1', contestId: () => 'c1',
    forScope: () => ({ getAll: async (store) => rows[store] || [], put: (...args) => writes.push(args) }),
  };
  const performance = { getDashboard: async () => ({
    player: { exam_date: '2026-12-10' }, overview: { answered: 0, correct: 0, errors: 0 }, progress: { coverage: 0 }, time: {}, reviews: {}, quality: {},
  }) };
  const snapshot = await new OrionEvolutionService({ repository, performance, now: () => new Date('2026-08-07T12:00:00-03:00') }).getSnapshot();
  assert.equal(snapshot.dailyGoalMinutes, 20);
  assert.equal(snapshot.dailyGoalSource, 'routineProfile.minGoal.minutes');
  assert.equal(snapshot.examDateSource, 'player.exam_date');
  assert.equal(writes.length, 0);
});

test('estado vazio e renderização não inventam previsão e expõem sete métricas acessíveis', () => {
  const model = buildOrionEvolutionModel();
  assert.equal(model.accuracyWeek, null);
  assert.equal(model.estimatedDays, null);
  assert.equal(model.requiredHoursPerDay, null);
  assert.match(model.recommendation, /Comece hoje/);
  const html = renderOrionEvolution(model);
  assert.equal((html.match(/class="orion-metric(?:\s|")/g) || []).length, 7);
  assert.match(html, /EVOLUÇÃO DO DIA/);
  assert.match(html, /Sem histórico comparável/);
  assert.match(html, /Prazo até a prova/);
  assert.doesNotMatch(html, /Tempo para zerar|Ritmo necessário/);
  assert.match(html, /aria-labelledby="orion-evolution-title"/);
});

test('Home, CSS responsivo e PWA preservam painel e asset do Orion', async () => {
  const [home, css, sw] = await Promise.all([
    readFile(path.join(appDir, 'js/ui/home.js'), 'utf8'),
    readFile(path.join(appDir, 'css/design-system.css'), 'utf8'),
    readFile(path.join(appDir, 'sw.js'), 'utf8'),
  ]);
  assert.match(home, /orionEvolutionService\.getSnapshot/);
  assert.match(home, /renderOrionEvolution\(orionEvolution\)/);
  assert.match(css, /\.orion-evolution__metrics/);
  assert.match(css, /@media \(max-width:620px\)/);
  assert.match(sw, /orionEvolutionService\.js/);
  assert.match(sw, /assets\/mentor\/orion-evolution\.png/);
});
