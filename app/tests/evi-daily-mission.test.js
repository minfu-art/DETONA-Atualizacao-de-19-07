import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEviDailyMissionModel,
  dailyMissionStarKey,
  EviDailyMissionService,
} from '../js/services/eviDailyMissionService.js';
import { renderEviDailyMission } from '../js/ui/eviDailyMission.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = '2026-07-29';

function model(overrides = {}) {
  return buildEviDailyMissionModel({
    userId: 'student-a',
    contestId: 'pc_al_2026',
    localDate: today,
    dailyGoal: { questionGoal: 20, questionsCompleted: 5 },
    routineTasks: [],
    reviewQueue: [],
    studySessions: [],
    questionHistory: [],
    activeMission: { type: 'battle', title: 'Resolver questões de Português' },
    ...overrides,
  });
}

test('calcula corretamente meta e questões concluídas sem criar segunda fonte', () => {
  const result = model();
  assert.equal(result.questionGoal, 20);
  assert.equal(result.questionsCompleted, 5);
  assert.equal(result.questionProgress, 25);
  assert.equal(result.overallProgress, 25);
});

test('prioriza revisão vencida somente quando ela faz parte do plano', () => {
  const result = model({
    dailyGoal: { questionGoal: 0, questionsCompleted: 0 },
    routineTasks: [{
      id: 'review-block',
      date: today,
      activityType: 'revisao_fila',
      title: 'Revisar Direito Penal',
      status: 'planned',
      source: 'review',
      reviewQueueId: 'review-1',
    }],
    reviewQueue: [{
      id: 'review-1',
      status: 'scheduled',
      nextReviewAt: `${today}T08:00:00`,
    }],
  });
  assert.equal(result.nextMission.type, 'review_due');
  assert.equal(result.actionLabel, 'Ver plano de revisão');
  assert.equal(result.actionRoute, 'expedition');
  assert.equal(result.actionSection, 'revisao');
  assert.equal(result.nextMission.actionSection, 'revisao');
});

test('retoma tarefa iniciada quando não existe prioridade anterior', () => {
  const result = model({
    dailyGoal: { questionGoal: 0, questionsCompleted: 0 },
    routineTasks: [{
      id: 'started-1',
      date: today,
      activityType: 'questoes',
      title: 'Batalha de Português',
      status: 'in_progress',
    }],
    studySessions: [{ blockId: 'started-1', status: 'running' }],
  });
  assert.equal(result.nextMission.type, 'started');
  assert.equal(result.actionLabel, 'Retomar pelo plano');
  assert.equal(result.actionRoute, 'expedition');
  assert.equal(result.actionSection, 'hoje');
  assert.equal(result.nextMission.actionSection, 'hoje');
});

test('redistribui pesos quando categorias planejadas estão ausentes', () => {
  const onlyQuestions = model({
    dailyGoal: { questionGoal: 10, questionsCompleted: 5 },
  });
  const onlyReviews = model({
    dailyGoal: { questionGoal: 0, questionsCompleted: 0 },
    routineTasks: [
      { id: 'r1', date: today, activityType: 'revisao', status: 'completed' },
      { id: 'r2', date: today, activityType: 'revisao', status: 'planned' },
    ],
  });
  assert.equal(onlyQuestions.overallProgress, 50);
  assert.equal(onlyReviews.overallProgress, 50);
});

test('atividades não planejadas e hábitos físicos não reduzem o progresso', () => {
  const result = model({
    dailyGoal: { questionGoal: 10, questionsCompleted: 10 },
    routineTasks: [
      { id: 'physical', date: today, activityType: 'kaela_exercicio', status: 'planned' },
      { id: 'rest', date: today, activityType: 'descanso', status: 'planned' },
    ],
    questionHistory: Array.from({ length: 30 }, (_, index) => ({
      id: `extra-${index}`,
      date: today,
    })),
  });
  assert.equal(result.overallProgress, 100);
  assert.equal(result.tasksPlanned, 0);
  assert.equal(result.dailyStar.earned, true);
});

function fakeRepository(meta = new Map()) {
  const writes = [];
  return {
    writes,
    getAll: async () => [],
    getMeta: async (key) => meta.get(key) || null,
    setMeta: async (key, value) => {
      writes.push({ key, value });
      meta.set(key, value);
      return value;
    },
  };
}

test('leitura da Home não persiste estrela nem toca em XP, LV ou domínio', async () => {
  const repository = fakeRepository();
  const service = new EviDailyMissionService({
    repository,
    now: () => new Date(`${today}T12:00:00`),
    userId: () => 'student-a',
    contestId: () => 'pc_al_2026',
  });
  const input = { dailyGoal: { questionGoal: 10, questionsCompleted: 10 } };
  const first = await service.getSnapshot(input);
  const second = await service.getSnapshot(input);
  assert.equal(first.dailyStar.newlyEarned, false);
  assert.equal(second.dailyStar.newlyEarned, false);
  assert.equal(repository.writes.length, 0);
  assert.equal(first.dailyStar.earnedAt, null);
});

test('serviço orienta configuração quando o perfil de plano ainda não foi concluído', async () => {
  const repository = fakeRepository();
  const service = new EviDailyMissionService({
    repository,
    now: () => new Date(`${today}T12:00:00`),
    userId: () => 'student-a',
    contestId: () => 'pc_al_2026',
  });
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.state, 'configuration_required');
  assert.equal(snapshot.actionLabel, 'Configurar plano');
  assert.equal(snapshot.actionSection, 'config');
  assert.equal(repository.writes.length, 0);
});

test('sem plano oferece fallback seguro para planejar o dia', () => {
  const result = model({
    dailyGoal: { enabled: false, questionGoal: 0, questionsCompleted: 0 },
    activeMission: { type: 'edital', title: 'Avançar no edital' },
  });
  assert.equal(result.state, 'no_plan');
  assert.equal(result.actionLabel, 'Planejar o dia');
  assert.equal(result.actionRoute, 'expedition');
  assert.equal(result.nextMission.actionSection, 'hoje');
  assert.equal(result.dailyStar.status, 'locked');
});

test('retorna exatamente uma missão ativa', () => {
  const result = model({
    routineTasks: [
      { id: 'a', date: today, activityType: 'teoria', title: 'Teoria', status: 'planned' },
      { id: 'b', date: today, activityType: 'questoes', title: 'Questões', status: 'planned' },
    ],
  });
  assert.equal(typeof result.nextMission, 'object');
  assert.equal(Array.isArray(result.nextMission), false);
  assert.equal(Boolean(result.nextMission.title), true);
});

test('chave da estrela isola usuário, concurso e data', () => {
  const a = dailyMissionStarKey('student-a', 'pc_al_2026', today);
  const b = dailyMissionStarKey('student-b', 'pc_al_2026', today);
  const c = dailyMissionStarKey('student-a', 'pp_pe_2027', today);
  const d = dailyMissionStarKey('student-a', 'pc_al_2026', '2026-07-30');
  assert.equal(new Set([a, b, c, d]).size, 4);
});

test('interface mostra Evi, uma ação e todos os indicadores acessíveis', () => {
  const html = renderEviDailyMission(model());
  assert.match(html, /EVI/);
  assert.match(html, /GUIA DE MISSÕES/);
  assert.match(html, /evi\.webp/);
  assert.match(html, /alt="Evi, guia de missões do DETONA"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="25"/);
  assert.equal((html.match(/id="evi-daily-action"/g) || []).length, 1);
  assert.match(html, /Nenhuma prevista hoje/);
  assert.doesNotMatch(html, /0\s*\/\s*0/);
  assert.doesNotMatch(html, /\+\d+\s*XP/);
});

test('Home, CSS móvel e PWA integram a Evi sem rolagem horizontal', async () => {
  const [home, css, sw] = await Promise.all([
    readFile(path.join(appDir, 'js/ui/home.js'), 'utf8'),
    readFile(path.join(appDir, 'css/dashboard-jrpg.css'), 'utf8'),
    readFile(path.join(appDir, 'sw.js'), 'utf8'),
  ]);
  assert.match(home, /eviDailyMissionService\.getSnapshot/);
  assert.match(home, /renderEviDailyMission\(eviMission\)/);
  assert.match(home, /ctx\.planSection = eviMission\.actionSection \|\| 'hoje'/);
  assert.match(css, /\.evi-card\s*\{/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.evi-card__art[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.evi-card[\s\S]*min-width:\s*0/);
  assert.match(css, /\.evi-card[\s\S]*overflow:\s*hidden/);
  assert.match(sw, /eviDailyMissionService\.js/);
  assert.match(sw, /eviDailyMission\.js/);
  assert.match(sw, /assets\/mentors\/evi\.webp/);
});
