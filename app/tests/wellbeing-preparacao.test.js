import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAY_MESSAGES,
  EDUCATION_CARDS,
  PRODUCTIVE_RITUAL,
  HARD_DAY_RITUAL,
  greetingForNow,
  messageForNow,
  progressHumanLabel,
  pickMessage,
} from '../js/core/wellbeingMessages.js';
import { WELLBEING_ACADEMIC_SIDE_EFFECTS, VIGOR_FULL_DAY } from '../js/core/wellbeing.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('topo e mensagens: biblioteca de mensagens por momento existe', () => {
  assert.ok(DAY_MESSAGES.inicio.length >= 4);
  assert.ok(DAY_MESSAGES.baixa_energia.length >= 3);
  assert.ok(DAY_MESSAGES.constancia.length >= 3);
  assert.ok(DAY_MESSAGES.encerramento.length >= 2);
  for (const msg of Object.values(DAY_MESSAGES).flat()) {
    assert.doesNotMatch(msg, /\bXP\b|Vigor|experiência acadêmica/i);
  }
});

test('rotação de mensagens é determinística por seed', () => {
  const a = pickMessage(DAY_MESSAGES.inicio, 10);
  const b = pickMessage(DAY_MESSAGES.inicio, 10);
  assert.equal(a, b);
  assert.ok(DAY_MESSAGES.inicio.includes(messageForNow(new Date('2026-07-16T09:00:00'))));
});

test('saudação e progresso humano sem tom burocrático', () => {
  assert.match(greetingForNow(new Date('2026-07-16T09:00:00'), 'Ana Silva'), /Bom dia/);
  assert.match(progressHumanLabel(0, 5), /pequenas ações|base/i);
  assert.match(progressHumanLabel(2, 5), /concluiu 2/);
  assert.doesNotMatch(progressHumanLabel(0, 5), /ganhar \+|XP/i);
});

test('conteúdo educativo e rituais de modo', () => {
  assert.ok(EDUCATION_CARDS.length >= 4);
  assert.ok(PRODUCTIVE_RITUAL.length >= 4);
  assert.ok(HARD_DAY_RITUAL.length >= 4);
  for (const c of EDUCATION_CARDS) {
    assert.doesNotMatch(c.text, /dopamina|cura|tratamento|diagnóstico|XP/i);
  }
});

test('UI Preparação do Dia: topo, modos, hábitos, educação', async () => {
  const ui = await readFile(path.join(rootDir, 'js/ui/wellbeingUI.js'), 'utf8');
  assert.match(ui, /Preparação do Dia/);
  assert.match(ui, /pd-hero|pd-greeting|pd-message/);
  assert.match(ui, /modo produtivo|pd-mode-prod/i);
  assert.match(ui, /sem energia|pd-mode-hard/i);
  assert.match(ui, /Isso ajuda seu estudo/);
  assert.match(ui, /Começar pequeno/);
  assert.doesNotMatch(ui, /\+10 XP|Complete todos: \+10 XP|Hábitos geram Vigor, não experiência/i);
  assert.match(ui, /Ritual iniciado\. Agora escolha a primeira tarefa do edital/);
  assert.doesNotMatch(ui, /XP do personagem|experiência acadêmica/i);
});

test('bem-estar não concede XP (contrato)', () => {
  assert.equal(WELLBEING_ACADEMIC_SIDE_EFFECTS.grantsXp, false);
  assert.equal(WELLBEING_ACADEMIC_SIDE_EFFECTS.evolvesCharacter, false);
  assert.equal(WELLBEING_ACADEMIC_SIDE_EFFECTS.canConvertVigorToXp, false);
  assert.equal(WELLBEING_ACADEMIC_SIDE_EFFECTS.changesLevel, false);
  assert.equal(WELLBEING_ACADEMIC_SIDE_EFFECTS.changesStars, false);
  assert.equal(WELLBEING_ACADEMIC_SIDE_EFFECTS.changesMastery, false);
  assert.equal(WELLBEING_ACADEMIC_SIDE_EFFECTS.changesEdital, false);
  assert.ok(VIGOR_FULL_DAY >= 1);
});

test('wellbeing.js não importa applyXp', async () => {
  const src = await readFile(path.join(rootDir, 'js/core/wellbeing.js'), 'utf8');
  assert.doesNotMatch(src, /from ['"]\.\/progression\.js['"]/);
  assert.doesNotMatch(src, /applyXp/);
  assert.match(src, /grantVigorIfReady|wellbeing_vigor/);
  assert.match(src, /bonus: 0/);
});

test('CSS da preparação: hero, ring, safe-area, botões 44px', async () => {
  const css = await readFile(path.join(rootDir, 'css/design-system.css'), 'utf8');
  assert.match(css, /\.pd-hero/);
  assert.match(css, /\.pd-ring/);
  assert.match(css, /\.pd-habit__act/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(min-width:900px\)/);
});

test('menu exibe Preparação', async () => {
  const [shell, navigation] = await Promise.all([
    readFile(path.join(rootDir, 'js/ui/appShell.js'), 'utf8'),
    readFile(path.join(rootDir, 'js/ui/navigation.js'), 'utf8'),
  ]);
  assert.match(shell, /UTILITY_NAV_ITEMS/);
  assert.match(navigation, /screen: 'wellbeing'.+label: 'Preparação'/);
});
