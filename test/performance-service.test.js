import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PerformanceService,
  periodCutoff,
  questionTotals,
  recentEvolution,
  studyTimeSnapshot,
  subtopicQuestionTotalsDetailed,
} from '../app/js/services/performanceService.js';
import { sortDisciplines } from '../app/js/ui/performance.js';

const root = fileURLToPath(new URL('../app/', import.meta.url));

function dataset(overrides = {}) {
  return {
    player: [{ id: 'player', edital_completion_pct: 72, streak_days: 18 }],
    disciplines: [
      { id: 'port', name: 'Língua Portuguesa', order: 1, mastery_pct: 70 },
      { id: 'const', name: 'Direito Constitucional', order: 2, mastery_pct: 30 },
    ],
    subtopics: [
      {
        id: 'port-1', discipline_id: 'port', name: 'Interpretação',
        question_history: { q1: { attempts: 2, correctCount: 2, incorrectCount: 0 } },
        attempt_history: [{ battleId: 'b-port', attemptedAt: '2026-07-10T12:00:00-03:00', correct: 8, total: 10 }],
      },
      {
        id: 'const-1', discipline_id: 'const', name: 'Direitos fundamentais',
        question_history: { q2: { attempts: 2, correctCount: 0, incorrectCount: 2 } },
        attempt_history: [{ battleId: 'b-const', attemptedAt: '2026-07-12T12:00:00-03:00', correct: 4, total: 10 }],
      },
    ],
    verticalized: [
      { id: 'v1', theory_status: 'concluido', review_count: 2 },
      { id: 'v2', theory_status: 'estudando', review_count: 0 },
    ],
    reviewQueue: [
      { questionId: 'q1', status: 'pending', nextReviewAt: '2026-07-16T12:00:00-03:00', memoryState: 'quente', reviewHistory: [] },
    ],
    routineBlocks: [
      { id: 'b1', date: '2026-07-15', subjectId: 'port', actualMinutes: 40, status: 'completed' },
      { id: 'b2', date: '2026-07-16', subjectId: 'const', actualMinutes: 20, status: 'partially_completed' },
    ],
    studySessions: [],
    routineDailyStates: [],
    ...overrides,
  };
}

function repositoryFor(rows, writes = []) {
  return {
    getAll: async (store) => structuredClone(rows[store] || []),
    put: async (...args) => writes.push(args),
    putMany: async (...args) => writes.push(args),
    remove: async (...args) => writes.push(args),
  };
}

test('edital_completion_pct é tratado como cobertura e complemento exato', async () => {
  const service = new PerformanceService({ repository: repositoryFor(dataset()), now: () => new Date('2026-07-17T12:00:00-03:00') });
  const result = await service.getDashboard({ period: '30d' });
  assert.equal(result.progress.coverage, 72);
  assert.equal(result.progress.remaining, 28);
  assert.equal(result.progress.coverage + result.progress.remaining, 100);
  assert.equal(result.progress.source, 'player.edital_completion_pct');
});

test('cobertura ausente é diferente de zero observado e valor corrompido é normalizado sem escrita', async () => {
  const writes = [];
  const missing = await new PerformanceService({ repository: repositoryFor(dataset({ player: [{}] }), writes) }).getDashboard();
  const corrupt = await new PerformanceService({ repository: repositoryFor(dataset({ player: [{ edital_completion_pct: 140 }] }), writes) }).getDashboard();
  assert.equal(missing.progress.coverage, null);
  assert.equal(missing.progress.remaining, null);
  assert.equal(corrupt.progress.coverage, 100);
  assert.equal(corrupt.progress.remaining, 0);
  assert.ok(corrupt.quality.warnings.includes('COVERAGE_CLAMPED'));
  assert.equal(writes.length, 0);
});

test('fonte moderna, tentativa e IDs legados têm precedência explícita sem soma dupla', () => {
  const modern = subtopicQuestionTotalsDetailed({
    question_history: { q1: { attempts: 2, correctCount: 1, incorrectCount: 1 } },
    attempt_history: [{ battleId: 'same', total: 1, correct: 1 }],
  });
  assert.deepEqual({ answered: modern.answered, correct: modern.correct, errors: modern.errors, source: modern.source }, {
    answered: 2, correct: 1, errors: 1, source: 'question_history',
  });
  const attempts = subtopicQuestionTotalsDetailed({ attempt_history: [
    { battleId: 'a', total: 10, correct: 6 },
    { battleId: 'a', total: 10, correct: 6 },
  ] });
  assert.equal(attempts.answered, 10);
  assert.ok(attempts.warnings.includes('DUPLICATE_ATTEMPT_ID_IGNORED'));
  const legacy = subtopicQuestionTotalsDetailed({ answered_question_ids: ['q1', 'q2'], correct_question_ids: ['q1'], incorrect_question_ids: ['q2'] });
  assert.deepEqual({ answered: legacy.answered, correct: legacy.correct, errors: legacy.errors, source: legacy.source }, {
    answered: 2, correct: 1, errors: 1, source: 'legacy_question_ids',
  });
});

test('dados de questão inválidos são ignorados e invariantes binários permanecem', () => {
  const totals = questionTotals([{
    question_history: {
      valid: { attempts: 10, correctCount: 0, incorrectCount: 10 },
      negative: { attempts: -1, correctCount: 0, incorrectCount: 0 },
      mismatch: { attempts: 3, correctCount: 4, incorrectCount: 0 },
    },
  }]);
  assert.deepEqual(totals, { answered: 10, correct: 0, errors: 10 });
  assert.equal(totals.correct + totals.errors, totals.answered);
});

test('tentativa sem data só participa do histórico total com aviso de confiabilidade', () => {
  const subtopic = { attempt_history: [{ battleId: 'legacy-undated', total: 10, correct: 6 }] };
  const cutoff = periodCutoff('30d', new Date('2026-08-07T12:00:00-03:00'));
  const period = subtopicQuestionTotalsDetailed(subtopic, cutoff);
  const all = subtopicQuestionTotalsDetailed(subtopic);
  assert.equal(period.answered, 0);
  assert.equal(all.answered, 10);
  assert.ok(all.warnings.includes('UNDATED_ATTEMPT_INCLUDED_IN_ALL_HISTORY'));
});

test('período usa tentativas datadas inclusivas e histórico total nunca fica menor', () => {
  const cutoff = periodCutoff('7d', new Date(2026, 7, 1, 12));
  const subtopic = { attempt_history: [
    { battleId: 'old', attemptedAt: '2026-07-25T23:59:00', correct: 10, total: 10 },
    { battleId: 'cutoff', attemptedAt: '2026-07-26T00:00:00', correct: 3, total: 5 },
    { battleId: 'end', attemptedAt: '2026-08-01T23:59:00', correct: 2, total: 5 },
  ] };
  const period = questionTotals([subtopic], cutoff);
  const all = questionTotals([subtopic]);
  assert.deepEqual(period, { answered: 10, correct: 5, errors: 5 });
  assert.equal(all.answered, 20);
  assert.ok(period.answered <= all.answered);
});

test('cutoff local cobre viradas de mês, ano e fevereiro', () => {
  assert.equal(periodCutoff('7d', new Date('2026-03-01T12:00:00-03:00')).getDate(), 23);
  assert.equal(periodCutoff('30d', new Date('2026-01-05T12:00:00-03:00')).getFullYear(), 2025);
  assert.equal(periodCutoff('all', new Date()), null);
});

test('painel agrega respostas, taxa, disciplinas e histórico sem ficção', async () => {
  const result = await new PerformanceService({
    repository: repositoryFor(dataset()), now: () => new Date('2026-07-17T12:00:00-03:00'),
  }).getDashboard({ period: '30d' });
  assert.deepEqual({ answered: result.overview.answered, correct: result.overview.correct, errors: result.overview.errors, accuracy: result.overview.accuracy }, {
    answered: 20, correct: 12, errors: 8, accuracy: 60,
  });
  assert.equal(result.overview.allAnswered, 20);
  assert.equal(result.disciplines[0].classification, 'Forte');
  assert.equal(result.disciplines[1].classification, 'Atenção');
});

test('0 respostas produz accuracy null; 0/10 produz 0%; 10/10 produz 100%', async () => {
  const service = (subtopics) => new PerformanceService({ repository: repositoryFor(dataset({ disciplines: [], subtopics, routineBlocks: [] })) }).getDashboard({ period: 'all' });
  assert.equal((await service([])).overview.accuracy, null);
  assert.equal((await service([{ attempt_history: [{ total: 10, correct: 0 }] }])).overview.accuracy, 0);
  assert.equal((await service([{ attempt_history: [{ total: 10, correct: 10 }] }])).overview.accuracy, 100);
  assert.equal((await service([{ attempt_history: [{ total: 10, correct: 11 }] }])).overview.accuracy, null);
});

test('tempo real deduplica sessão ligada, rejeita planejado/cancelado e usa dailyState por dia sem detalhe', () => {
  const time = studyTimeSnapshot({
    disciplines: [{ id: 'port', name: 'Português' }],
    blocks: [
      { id: 'ok', date: '2026-08-01', status: 'completed', actualMinutes: 30, subjectId: 'port' },
      { id: 'planned', date: '2026-08-01', status: 'planned', actualMinutes: 500, subjectId: 'port' },
      { id: 'cancel', date: '2026-08-01', status: 'cancelled', actualMinutes: 500, subjectId: 'port' },
      { id: 'missing-date', status: 'completed', actualMinutes: 500, subjectId: 'port' },
    ],
    sessions: [
      { id: 'linked', date: '2026-08-01', blockId: 'ok', status: 'completed', valid: true, elapsedSeconds: 1800 },
      { id: 'standalone', date: '2026-08-01', status: 'completed', valid: true, elapsedSeconds: 600 },
      { id: 'bad-abort', date: '2026-08-01', status: 'aborted', valid: false, elapsedSeconds: 600 },
      { id: 'good-abort', date: '2026-08-01', status: 'aborted', valid: true, elapsedSeconds: 300 },
      { id: 'missing-date', status: 'completed', valid: true, elapsedSeconds: 30000 },
    ],
    dailyStates: [
      { date: '2026-08-01', actualMinutes: 999 },
      { date: '2026-08-02', actualMinutes: 20 },
    ],
  });
  assert.equal(time.totalMinutes, 65);
  assert.equal(time.distributedMinutes, 30);
  assert.equal(time.undistributedMinutes, 35);
  assert.equal(time.byDiscipline[0].percentage, 46);
});

test('evolução agrega acertos por dia de forma ponderada entre subtópicos', () => {
  const points = recentEvolution([
    { id: 'a', attempt_history: [{ attemptedAt: '2026-08-01T10:00:00-03:00', total: 10, correct: 10 }] },
    { id: 'b', attempt_history: [{ attemptedAt: '2026-08-01T18:00:00-03:00', total: 90, correct: 45 }] },
    { id: 'c', attempt_history: [{ attemptedAt: '2026-08-02T18:00:00-03:00', total: 10, correct: 8 }] },
  ], null);
  assert.equal(points.length, 2);
  assert.deepEqual({ answered: points[0].answered, correct: points[0].correct }, { answered: 100, correct: 55 });
  assert.equal(Math.round(points[0].accuracy), 55);
});

test('revisões separam histórico, período, ativos, vencidos e congelados', async () => {
  const rows = dataset({
    verticalized: [{ review_count: 5 }],
    reviewQueue: [
      { status: 'pending', nextReviewAt: '2026-07-16T12:00:00-03:00', memoryState: 'quente', reviewHistory: [{ reason: 'review', at: '2026-07-15T12:00:00-03:00' }] },
      { status: 'frozen', nextReviewAt: '2026-07-01T12:00:00-03:00', memoryState: 'congelada', reviewHistory: [{ reason: 'review', at: 'invalid-date' }] },
    ],
  });
  const service = new PerformanceService({ repository: repositoryFor(rows), now: () => new Date('2026-07-17T12:00:00-03:00') });
  const result = await service.getDashboard({ period: '7d' });
  assert.deepEqual(result.reviews, { completed: 5, totalCompleted: 5, completedInPeriod: 1, pending: 1, active: 1, due: 1, frozen: 1, memory: { quente: 1, morna: 0, fria: 0, congelada: 1 } });
  assert.equal((await service.getDashboard({ period: 'all' })).reviews.completedInPeriod, 1);
});

test('estado vazio é neutro e não simula evolução, acurácia ou tempo', async () => {
  const empty = dataset({ player: [{ edital_completion_pct: 0 }], disciplines: [], subtopics: [], verticalized: [], reviewQueue: [], routineBlocks: [], studySessions: [], routineDailyStates: [] });
  const result = await new PerformanceService({ repository: repositoryFor(empty) }).getDashboard();
  assert.equal(result.overview.accuracy, null);
  assert.equal(result.time.totalMinutes, 0);
  assert.deepEqual(result.evolution, []);
  assert.equal(result.hasAnyData, false);
});

test('escopo é capturado uma vez e nenhuma escrita ocorre durante a leitura', async () => {
  const reads = [];
  const writes = [];
  let active = { userId: 'u1', contestId: 'c1' };
  const repository = {
    userId: () => active.userId,
    contestId: () => active.contestId,
    forScope: (userId, contestId) => ({
      scopeKey: `${userId}:${contestId}`,
      getAll: async (store) => { reads.push(`${userId}:${contestId}:${store}`); active = { userId: 'u2', contestId: 'c2' }; return dataset()[store] || []; },
      put: (...args) => writes.push(args),
    }),
  };
  const result = await new PerformanceService({ repository }).getDashboard();
  assert.equal(result.context.scopeKey, 'u1:c1');
  assert.ok(reads.every((read) => read.startsWith('u1:c1:')));
  assert.equal(writes.length, 0);
});

test('ordenação mantém edital determinístico e null não vira 0%', () => {
  const rows = [{ id: 'a', order: 2, accuracy: 80 }, { id: 'b', order: 1, accuracy: 40 }, { id: 'c', order: 3, accuracy: null }];
  assert.deepEqual(sortDisciplines(rows, 'edital').map((row) => row.id), ['b', 'a', 'c']);
  assert.deepEqual(sortDisciplines(rows, 'lowest').map((row) => row.id), ['b', 'a', 'c']);
  assert.deepEqual(sortDisciplines(rows, 'highest').map((row) => row.id), ['a', 'b', 'c']);
});

test('UI corrige semântica, expõe indistribuído e protege resposta assíncrona antiga', async () => {
  const performance = await readFile(path.join(root, 'js/ui/performance.js'), 'utf8');
  assert.match(performance, /Cobertura do edital/);
  assert.match(performance, /Edital percorrido/);
  assert.match(performance, /Ainda não percorrido/);
  assert.doesNotMatch(performance, /Domínio do edital|Edital dominado/);
  assert.match(performance, /Tempo sem disciplina identificada/);
  assert.match(performance, /requestVersion/);
  assert.match(performance, /initialScope/);
});

test('rota protegida e navegação principal permanecem explícitas', async () => {
  const [app, shell, navigation, html, performance] = await Promise.all([
    readFile(path.join(root, 'js/app.js'), 'utf8'), readFile(path.join(root, 'js/ui/appShell.js'), 'utf8'),
    readFile(path.join(root, 'js/ui/navigation.js'), 'utf8'), readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'js/ui/performance.js'), 'utf8'),
  ]);
  assert.match(app, /performance:\s*renderPerformance/);
  assert.match(app, /if \(!canAccessInternalRoute\(authService\)\)/);
  assert.match(navigation, /screen: 'performance'.+label: 'Desempenho'.+icon: 'chartSteps'/);
  assert.match(shell, /data-shell-screen="profile"[^>]*aria-label="Abrir Perfil"/);
  assert.equal((html.match(/class="nav-item/g) || []).length, 0);
  assert.doesNotMatch(performance, /applyXp|ranking|checkout|moeda/i);
});
