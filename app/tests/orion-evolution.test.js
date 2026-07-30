import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOrionEvolutionModel,
  recentProgressAnalysis,
  studyMinutesForDate,
} from '../js/services/orionEvolutionService.js';
import { renderOrionEvolution } from '../js/ui/orionEvolution.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Orion soma somente tempo acadêmico válido do dia sem duplicar sessão vinculada', () => {
  const minutes = studyMinutesForDate({
    date: '2026-07-29',
    blocks: [
      { date: '2026-07-29', actualMinutes: 35 },
      { date: '2026-07-28', actualMinutes: 90 },
    ],
    sessions: [
      { date: '2026-07-29', status: 'completed', valid: true, elapsedSeconds: 600 },
      { date: '2026-07-29', status: 'completed', valid: true, elapsedSeconds: 1200, blockId: 'block-1' },
      { date: '2026-07-29', status: 'completed', valid: false, elapsedSeconds: 1800 },
      { date: '2026-07-29', status: 'running', elapsedSeconds: 1800 },
    ],
    dailyStates: [{ date: '2026-07-29', actualMinutes: 200 }],
  });
  assert.equal(minutes, 45);
});

test('Orion usa estado diário apenas como fallback quando não há medição detalhada', () => {
  assert.equal(studyMinutesForDate({
    date: '2026-07-29',
    dailyStates: [
      { date: '2026-07-29', actualMinutes: 42 },
      { date: '2026-07-29', actualMinutes: 30 },
    ],
  }), 42);
});

test('avanço recente respeita a janela de sete dias e o tamanho real das disciplinas', () => {
  const cutoff = new Date('2026-07-23T00:00:00-03:00');
  const analysis = recentProgressAnalysis({
    cutoff,
    disciplines: [
      { id: 'port', name: 'Língua Portuguesa' },
      { id: 'penal', name: 'Direito Penal' },
    ],
    subtopics: [
      {
        id: 'p1',
        discipline_id: 'port',
        best_accuracy: 60,
        attempt_history: [
          { attemptedAt: '2026-07-20T12:00:00-03:00', percentage: 20 },
          { attemptedAt: '2026-07-28T12:00:00-03:00', percentage: 60 },
        ],
      },
      { id: 'p2', discipline_id: 'port', best_accuracy: 0, attempt_history: [] },
      {
        id: 'd1',
        discipline_id: 'penal',
        best_accuracy: 10,
        attempt_history: [{ attemptedAt: '2026-07-27T12:00:00-03:00', percentage: 10 }],
      },
    ],
  });
  assert.equal(analysis.globalGainPercent, 16.67);
  assert.deepEqual(analysis.bestDiscipline, {
    id: 'port',
    name: 'Língua Portuguesa',
    gainPercent: 20,
  });
});

test('métricas semanais, previsão e ritmo usam fórmulas estáveis', () => {
  const model = buildOrionEvolutionModel({
    now: new Date('2026-07-29T12:00:00-03:00'),
    todayMinutes: 155,
    dailyGoalMinutes: 240,
    examDate: '2026-08-18',
    weeklyDashboard: {
      overview: { correct: 30, errors: 20 },
      progress: { edital: 50, remaining: 50 },
      time: { totalMinutes: 420 },
    },
    recentProgress: {
      globalGainPercent: 7,
      bestDiscipline: { name: 'Direito Penal', gainPercent: 8 },
    },
  });
  assert.equal(model.questionsWeek, 50);
  assert.equal(model.accuracyWeek, 60);
  assert.equal(model.dailyGoalProgress, 65);
  assert.equal(model.estimatedDays, 50);
  assert.equal(model.examDays, 20);
  assert.equal(model.requiredHoursPerDay, 2.5);
  assert.match(model.recommendation, /2,5h por dia/);
});

test('estado vazio permanece neutro e solicita dados sem inventar previsão', () => {
  const model = buildOrionEvolutionModel();
  assert.equal(model.accuracyWeek, null);
  assert.equal(model.estimatedDays, null);
  assert.equal(model.requiredHoursPerDay, null);
  assert.match(model.recommendation, /Comece hoje/);
});

test('renderização expõe sete métricas, Orion e estados acessíveis', () => {
  const html = renderOrionEvolution(buildOrionEvolutionModel());
  assert.equal((html.match(/class="orion-metric(?:\s|")/g) || []).length, 7);
  assert.match(html, /EVOLUÇÃO DO DIA/);
  assert.match(html, /analisado por Orion/);
  assert.match(html, /orion-evolution\.png/);
  assert.match(html, /Sem dados suficientes/);
  assert.match(html, /Defina a data da prova/);
  assert.match(html, /aria-labelledby="orion-evolution-title"/);
});

test('Home, CSS responsivo e PWA integram o painel e o asset do Orion', async () => {
  const [home, css, sw] = await Promise.all([
    readFile(path.join(appDir, 'js/ui/home.js'), 'utf8'),
    readFile(path.join(appDir, 'css/design-system.css'), 'utf8'),
    readFile(path.join(appDir, 'sw.js'), 'utf8'),
  ]);
  assert.match(home, /orionEvolutionService\.getSnapshot/);
  assert.match(home, /renderOrionEvolution\(orionEvolution\)/);
  assert.match(css, /\.orion-evolution__metrics/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:620px\)/);
  assert.match(sw, /orionEvolutionService\.js/);
  assert.match(sw, /assets\/mentor\/orion-evolution\.png/);
});
