import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PerformanceService,
  periodCutoff,
  questionTotals,
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
        attempt_history: [{ attemptedAt: '2026-07-10T12:00:00Z', correct: 8, total: 10, percentage: 80 }],
      },
      {
        id: 'const-1', discipline_id: 'const', name: 'Direitos fundamentais',
        question_history: { q2: { attempts: 2, correctCount: 0, incorrectCount: 2 } },
        attempt_history: [{ attemptedAt: '2026-07-12T12:00:00Z', correct: 4, total: 10, percentage: 40 }],
      },
    ],
    verticalized: [
      { id: 'v1', theory_status: 'concluido', review_count: 2 },
      { id: 'v2', theory_status: 'estudando', review_count: 0 },
    ],
    reviewQueue: [
      { questionId: 'q1', status: 'pending', nextReviewAt: '2026-07-16T12:00:00Z', memoryState: 'quente', reviewHistory: [] },
    ],
    routineBlocks: [
      { id: 'b1', date: '2026-07-15', subjectId: 'port', actualMinutes: 40 },
      { id: 'b2', date: '2026-07-16', subjectId: 'const', actualMinutes: 20 },
    ],
    studySessions: [],
    routineDailyStates: [],
    ...overrides,
  };
}

function repositoryFor(rows) {
  return { getAll: async (store) => structuredClone(rows[store] || []) };
}

test('Monstro Edital usa somente o complemento visual do progresso real', async () => {
  const service = new PerformanceService({ repository: repositoryFor(dataset()), now: () => new Date('2026-07-17T12:00:00Z') });
  const result = await service.getDashboard({ period: '30d' });
  assert.equal(result.progress.edital, 72);
  assert.equal(result.progress.remaining, 28);
  assert.equal(result.progress.completedTopics, 1);
  assert.equal(result.progress.remainingTopics, 1);
});

test('agrega respostas, acertos, erros, tempo e disciplinas sem números fictícios', async () => {
  const service = new PerformanceService({ repository: repositoryFor(dataset()), now: () => new Date('2026-07-17T12:00:00Z') });
  const result = await service.getDashboard({ period: '30d' });
  assert.deepEqual(result.overview, { answered: 20, correct: 12, errors: 8, accuracy: 60, allAnswered: 4 });
  assert.equal(result.time.totalMinutes, 60);
  assert.deepEqual(result.time.byDiscipline.map(({ name, minutes }) => ({ name, minutes })), [
    { name: 'Língua Portuguesa', minutes: 40 },
    { name: 'Direito Constitucional', minutes: 20 },
  ]);
  assert.equal(result.disciplines[0].classification, 'Forte');
  assert.equal(result.disciplines[1].classification, 'Atenção');
});

test('estado vazio preserva zeros e não simula evolução, acurácia ou tempo', async () => {
  const empty = dataset({
    player: [{ id: 'player', edital_completion_pct: 0 }], disciplines: [], subtopics: [],
    verticalized: [], reviewQueue: [], routineBlocks: [], studySessions: [], routineDailyStates: [],
  });
  const service = new PerformanceService({ repository: repositoryFor(empty), now: () => new Date('2026-07-17T12:00:00Z') });
  const result = await service.getDashboard({ period: '30d' });
  assert.equal(result.overview.accuracy, null);
  assert.equal(result.overview.answered, 0);
  assert.equal(result.time.totalMinutes, 0);
  assert.deepEqual(result.evolution, []);
  assert.equal(result.hasAnyData, false);
  assert.match(result.summary, /Comece sua jornada/);
});

test('filtro de período considera apenas tentativas compatíveis com histórico datado', () => {
  const cutoff = periodCutoff('7d', new Date('2026-07-17T12:00:00Z'));
  const totals = questionTotals([{ attempt_history: [
    { attemptedAt: '2026-07-01T12:00:00Z', correct: 10, total: 10 },
    { attemptedAt: '2026-07-16T12:00:00Z', correct: 3, total: 5 },
  ] }], cutoff);
  assert.deepEqual(totals, { answered: 5, correct: 3, errors: 2 });
});

test('serviço não compartilha dados entre usuário ou concurso', async () => {
  const contexts = {
    'u1:pc-al': dataset(),
    'u1:pf': dataset({ player: [{ edital_completion_pct: 0 }], subtopics: [], routineBlocks: [] }),
    'u2:pc-al': dataset({ player: [{ edital_completion_pct: 10 }], subtopics: [], routineBlocks: [] }),
  };
  const serviceFor = (key) => new PerformanceService({ repository: repositoryFor(contexts[key]), now: () => new Date('2026-07-17T12:00:00Z') });
  const [pc, pf, otherUser] = await Promise.all([
    serviceFor('u1:pc-al').getDashboard(), serviceFor('u1:pf').getDashboard(), serviceFor('u2:pc-al').getDashboard(),
  ]);
  assert.equal(pc.progress.edital, 72);
  assert.equal(pf.progress.edital, 0);
  assert.equal(otherUser.progress.edital, 10);
  assert.equal(pf.overview.answered, 0);
  assert.equal(otherUser.overview.answered, 0);
});

test('ordenação de disciplina mantém edital como padrão e oferece menor/maior desempenho', () => {
  const rows = [
    { id: 'a', order: 2, accuracy: 80 }, { id: 'b', order: 1, accuracy: 40 }, { id: 'c', order: 3, accuracy: null },
  ];
  assert.deepEqual(sortDisciplines(rows, 'edital').map((row) => row.id), ['b', 'a', 'c']);
  assert.deepEqual(sortDisciplines(rows, 'lowest').map((row) => row.id), ['b', 'a', 'c']);
  assert.deepEqual(sortDisciplines(rows, 'highest').map((row) => row.id), ['a', 'b', 'c']);
});

test('rota protegida, navegação principal e retorno ao perfil permanecem explícitos', async () => {
  const [app, shell, navigation, html, performance] = await Promise.all([
    readFile(path.join(root, 'js/app.js'), 'utf8'),
    readFile(path.join(root, 'js/ui/appShell.js'), 'utf8'),
    readFile(path.join(root, 'js/ui/navigation.js'), 'utf8'),
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'js/ui/performance.js'), 'utf8'),
  ]);
  assert.match(app, /performance:\s*renderPerformance/);
  assert.match(app, /if \(!canAccessInternalRoute\(authService\)\)/);
  assert.match(app, /if \(!getActiveContestId\(\)\)/);
  assert.match(navigation, /screen: 'performance'.+icon: 'seedling'.+label: 'Evolução'/);
  assert.doesNotMatch(navigation, /screen: 'profile'/);
  assert.match(shell, /data-shell-screen="profile"[^>]*>.*Meu perfil/s);
  assert.equal((html.match(/class="nav-item/g) || []).length, 5);
  assert.match(html, /data-screen="performance"[\s\S]*Evolução/);
  assert.doesNotMatch(html, /data-screen="profile"/);
  assert.match(performance, /performance-profile[^\n]*navigate\('profile'\)/s);
  assert.doesNotMatch(performance, /applyXp|ranking|checkout|moeda/i);
});
