import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAvailabilityPresentation,
  buildBlockPresentation,
  buildExamJourneyPresentation,
  buildPlanEmptyState,
  buildProgressPresentation,
  buildTodayPresentation,
  buildWeekPresentation,
  formatPlanMinutes,
} from '../js/ui/studyPlanVisualModel.js';
import {
  dailyCapacityForDate,
  validateStudyAvailability,
} from '../js/core/routine/studyPlanContract.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFile(path.join(appDir, relativePath), 'utf8');

test('modelo visual é puro e formata snapshots sem inventar métricas', async () => {
  const visualSource = await source('js/ui/studyPlanVisualModel.js');
  assert.doesNotMatch(visualSource, /from\s+['"][^'"]*(services|repositories)|indexedDB\.|localStorage\.|fetch\s*\(/i);
  assert.equal(formatPlanMinutes(25), '25 min');
  assert.equal(formatPlanMinutes(90), '1h 30min');

  const today = buildTodayPresentation({
    state: { plannedMinutes: 50, actualMinutes: 25 },
    blocks: [{ status: 'planned' }, { status: 'completed' }],
    next: { title: 'Revisar', plannedMinutes: 25, status: 'in_progress' },
    streak: 4,
    journey: { hasExam: true, daysLeft: 30 },
  });
  assert.deepEqual(
    { progress: today.progress, pending: today.pending, action: today.nextAction },
    { progress: 50, pending: 1, action: 'Retomar missão' },
  );

  assert.equal(buildWeekPresentation({ summary: { plannedMinutes: 120, actualMinutes: 60, adherence: 50 } }).planned, '2h');
  assert.equal(buildAvailabilityPresentation(
    { availableDays: [1, 2, 3], restDays: [0, 6], weeklyHoursGoal: 6 },
    { todayCapacityMinutes: 90, weeklyCapacityMinutes: 270 },
  ).dailyCapacity, '1h 30min');
  assert.equal(buildExamJourneyPresentation({ journey: { hasExam: false } }).hasExam, false);
  assert.equal(buildProgressPresentation({ metrics: { streak: 2, weeklyConsistency: 60 } }).consistency, 60);
});

test('Disponibilidade apresenta somente capacidades derivadas pelo contrato canônico', () => {
  const weekDates = [
    '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
    '2026-08-06', '2026-08-07', '2026-08-08',
  ];
  const baseProfile = {
    availableDays: [1, 2, 3, 4, 5],
    restDays: [0, 6],
    dayWindows: {
      1: { start: '18:00', end: '19:00' },
      2: { start: '18:00', end: '20:00' },
      3: { start: '18:00', end: '21:00' },
      4: { start: '18:00', end: '20:00' },
      5: { start: '18:00', end: '19:00' },
    },
    minDailyMinutes: 20,
    maxDailyMinutes: 180,
    preferredSessionMinutes: 30,
    maxBlocksPerDay: 4,
    weeklyHoursGoal: 20,
  };

  const capacityAboveWindows = validateStudyAvailability(baseProfile, { weekDates });
  assert.equal(capacityAboveWindows.weeklyCapacity, 540, 'A: soma real das janelas limita a meta semanal maior');
  assert.equal(buildAvailabilityPresentation(baseProfile, {
    todayCapacityMinutes: capacityAboveWindows.dailyCapacity['2026-08-03'],
    weeklyCapacityMinutes: capacityAboveWindows.weeklyCapacity,
  }).weeklyCapacity, '9h');

  const dailyLimitedProfile = { ...baseProfile, maxDailyMinutes: 90 };
  assert.equal(dailyCapacityForDate(dailyLimitedProfile, '2026-08-05'), 90, 'B: maxDailyMinutes limita a janela maior');

  assert.equal(dailyCapacityForDate(baseProfile, '2026-08-03'), 60, 'C: janela menor limita a capacidade diária');

  const restPresentation = buildAvailabilityPresentation(baseProfile, {
    todayCapacityMinutes: dailyCapacityForDate(baseProfile, '2026-08-02'),
    weeklyCapacityMinutes: capacityAboveWindows.weeklyCapacity,
    todayIsRestDay: true,
  });
  assert.equal(restPresentation.dailyCapacity, 'Hoje é dia de descanso', 'D: descanso não recebe capacidade fictícia');

  assert.deepEqual(
    ['2026-08-03', '2026-08-04', '2026-08-05'].map((date) => dailyCapacityForDate(baseProfile, date)),
    [60, 120, 180],
    'E: janelas diferentes permanecem capacidades diferentes, sem média visual',
  );

  const weeklyLimitedProfile = { ...baseProfile, weeklyHoursGoal: 3 };
  const weeklyLimited = validateStudyAvailability(weeklyLimitedProfile, { weekDates });
  assert.equal(weeklyLimited.weeklyCapacity, 180, 'F: meta semanal limita disponibilidade maior');
  assert.equal(buildAvailabilityPresentation(weeklyLimitedProfile, {
    todayCapacityMinutes: weeklyLimited.dailyCapacity['2026-08-03'],
    weeklyCapacityMinutes: weeklyLimited.weeklyCapacity,
  }).weeklyCapacity, '3h');
});

test('cards distinguem todos os estados por texto e símbolo além da cor', () => {
  for (const status of ['planned', 'in_progress', 'partially_completed', 'completed', 'skipped', 'rescheduled', 'cancelled']) {
    const card = buildBlockPresentation({ id: status, title: 'Bloco', status, plannedMinutes: 25 }, { activity: 'Questões' });
    assert.ok(card.status.label);
    assert.ok(card.status.symbol);
    assert.ok(card.status.tone);
  }
  assert.equal(buildBlockPresentation({ status: 'in_progress' }).primaryLabel, 'Retomar');
});

test('oito áreas, Evi canônica e exatamente um h1 estrutural permanecem no workspace', async () => {
  const [expedition, shell] = await Promise.all([source('js/ui/expedition.js'), source('js/ui/appShell.js')]);
  for (const id of ['hoje', 'semana', 'mes', 'revisao', 'vida', 'jornada', 'foco', 'progresso']) {
    assert.match(expedition, new RegExp(`id: '${id}'`));
  }
  assert.match(expedition, /assets\/mentors\/evi-plan-strategist\.webp/);
  assert.doesNotMatch(expedition, /<h1[\s>]/i);
  assert.equal((shell.match(/<h1 class="section-header__title/g) || []).length, 1);
  assert.match(expedition, /aria-current=/);
  assert.match(expedition, /aria-label="Áreas do plano"/);
});

test('Missões prioriza próxima missão, carga e ações secundárias', async () => {
  const expedition = await source('js/ui/expedition.js');
  assert.match(expedition, /Próxima missão/);
  assert.match(expedition, /Carga do dia/);
  assert.match(expedition, /plan-next-mission__cta/);
  assert.match(expedition, /routine-block__more/);
  assert.match(expedition, /Tenho pouco tempo/);
  assert.match(expedition, /Verificando sua disponibilidade/);
  assert.match(expedition, /if \(!result\.reduced\?\.length\)/);
});

test('Semana, calendário, disponibilidade, jornada, foco e resultados possuem apresentação responsiva', async () => {
  const [expedition, css] = await Promise.all([source('js/ui/expedition.js'), source('css/plan-edital.css')]);
  assert.match(expedition, /buildWeekPresentation/);
  assert.match(expedition, /buildMonthPresentation/);
  assert.match(expedition, /buildAvailabilityPresentation/);
  assert.match(expedition, /buildExamJourneyPresentation/);
  assert.match(expedition, /buildFocusPresentation/);
  assert.match(expedition, /buildProgressPresentation/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.plan-week-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.plan-month-grid[\s\S]*grid-template-columns:\s*repeat\(7/);
  assert.match(css, /\.plan-focus\[data-focus-state='running'\]/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('tipografia, alvos e movimento cumprem o contrato visual', async () => {
  const css = await source('css/plan-edital.css');
  const pixelSizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.ok(pixelSizes.length > 10);
  assert.ok(pixelSizes.every((size) => size >= 12), `font-size abaixo de 12px: ${pixelSizes.filter((size) => size < 12).join(', ')}`);
  assert.doesNotMatch(css, /!important/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /overflow-wrap:\s*break-word/);
});

test('estados vazios são factuais e não contêm dados simulados', () => {
  for (const kind of ['setup', 'day', 'week', 'review', 'history', 'exam', 'focus', 'capacity']) {
    const empty = buildPlanEmptyState(kind);
    assert.ok(empty.title.length > 4);
    assert.ok(empty.description.length > 8);
    assert.doesNotMatch(`${empty.title} ${empty.description}`, /aprovação garantida|IA prevê|ranking/i);
  }
});
