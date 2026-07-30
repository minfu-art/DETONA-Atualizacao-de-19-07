import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WELLBEING_ACADEMIC_SIDE_EFFECTS } from '../js/core/wellbeing.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relative) {
  return readFile(path.join(rootDir, relative), 'utf8');
}

test('área usa nomenclatura Hábitos e remove Preparação do menu', async () => {
  const [navigation, ui] = await Promise.all([source('js/ui/navigation.js'), source('js/ui/wellbeingUI.js')]);
  assert.match(navigation, /screen: 'wellbeing'.+label: 'Hábitos'/);
  assert.doesNotMatch(navigation, /screen: 'wellbeing'.+label: 'Preparação'/);
  assert.match(ui, /Hábitos do dia/);
  assert.match(ui, /Meus hábitos/);
  assert.doesNotMatch(ui, /Meus rituais|Preparação do Dia/);
});

test('menu usa coração com pulsação e acessibilidade', async () => {
  const [navigation, icons, shell] = await Promise.all([
    source('js/ui/navigation.js'),
    source('js/ui/icons.js'),
    source('js/ui/appShell.js'),
  ]);
  assert.match(navigation, /icon: 'heartPulse'/);
  assert.match(icons, /heartPulse:[\s\S]*5\.4 5\.4[\s\S]*M3\.8 13/);
  assert.match(shell, /aria-label="\$\{label\}" title="\$\{label\}"/);
});

test('hero oficial separa arte à esquerda e conteúdo à direita', async () => {
  const [ui, css] = await Promise.all([source('js/ui/wellbeingUI.js'), source('css/design-system.css')]);
  assert.match(ui, /kaely-hero__portrait[\s\S]*kaely-hero__copy/);
  assert.match(ui, /Kaely, Mentora da Resistência/);
  assert.match(css, /\.kaely-hero\s*\{[\s\S]*grid-template-columns/);
  assert.match(css, /\.kaely-hero__portrait img[\s\S]*object-fit:contain/);
});

test('página contém as nove seções operacionais na ordem definida', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  const markers = ['kaely-hero', 'hb-day-summary', 'hb-week', 'hb-agenda', 'hb-my-habits', 'hb-history', 'hb-calendar-panel', 'hb-analysis', 'hb-settings'];
  let cursor = -1;
  for (const marker of markers) {
    const next = ui.indexOf(marker, cursor + 1);
    assert.ok(next > cursor, `${marker} deve aparecer na ordem`);
    cursor = next;
  }
});

test('hidratação não completa toda a meta com um clique', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  assert.match(ui, /data-habit-delta="1"/);
  assert.match(ui, /\+1 \$\{definition\.habitId === 'water' \? 'copo'/);
  assert.doesNotMatch(ui, /completeMicroPractice\(.*definition\.target/);
});

test('configuração cobre água, creatina, medicação, sono e treino', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  for (const field of ['cutoffTime', 'cupSizeMl', 'mealAnchor', 'discreteMode', 'desiredSleepTime', 'desiredWakeTime', 'minimumPossible', 'activityType']) {
    assert.match(ui, new RegExp(`data-field="${field}"`));
  }
  assert.match(ui, /não substitui orientação profissional/);
  assert.doesNotMatch(ui, /\bdose\b.*(?:mg|gramas?)/i);
});

test('agenda permite registrar, editar e criar exceção somente para o dia', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  assert.match(ui, /data-agenda-register/);
  assert.match(ui, /data-agenda-skip/);
  assert.match(ui, /skipHabitForDate/);
  assert.match(ui, /Exceção registrada somente para este dia/);
});

test('calendário possui filtros e detalhe acessível', async () => {
  const ui = await source('js/ui/wellbeingUI.js');
  for (const label of ['Todos', 'Sono', 'Água', 'Treino', 'Creatina', 'Medicação', 'Outros']) assert.match(ui, new RegExp(label));
  assert.match(ui, /role="grid"/);
  assert.match(ui, /data-calendar-date/);
  assert.match(ui, /openCalendarDetail/);
});

test('responsividade cobre 320, 360/390, tablet e desktop sem scroll horizontal', async () => {
  const css = await source('css/design-system.css');
  assert.match(css, /@media \(max-width:320px\)/);
  assert.match(css, /@media \(max-width:390px\)/);
  assert.match(css, /@media \(min-width:720px\)/);
  assert.match(css, /@media \(min-width:1040px\)/);
  assert.match(css, /\.hb-screen[\s\S]*overflow-x:clip/);
});

test('movimento reduzido desativa transições e animações funcionais', async () => {
  const css = await source('css/design-system.css');
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /transition:none/);
});

test('hábitos permanecem completamente isolados do motor acadêmico', () => {
  assert.deepEqual(WELLBEING_ACADEMIC_SIDE_EFFECTS, {
    grantsXp: false,
    changesLevel: false,
    changesStars: false,
    changesMastery: false,
    changesEdital: false,
    canConvertVigorToXp: false,
    evolvesCharacter: false,
  });
});
