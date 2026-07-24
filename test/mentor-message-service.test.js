import test from 'node:test';
import assert from 'node:assert/strict';

import { getMentorMessage } from '../app/js/services/mentorMessageService.js';

const BASE = {
  player: { streak_days: 0 },
  meta: { complete: true, idle: false },
  routine: { enabled: true },
  reviewData: { due: 0 },
  wellbeingState: { cards: [] },
  daysUntilExam: 90,
  missionFocus: null,
  missionLeft: 0,
  currentDate: '2026-07-23',
};

test('revisão vencida possui a maior prioridade automática', () => {
  const result = getMentorMessage({
    ...BASE,
    reviewData: { due: 3 },
    daysUntilExam: 10,
    meta: { complete: false, idle: false },
  });
  assert.equal(result.category, 'review_due');
  assert.equal(result.priority, 'high');
  assert.equal(result.actionType, 'review');
  assert.match(result.message, /3 revisões vencidas/);
});

test('prova próxima possui prioridade sobre meta diária comum', () => {
  const result = getMentorMessage({
    ...BASE,
    daysUntilExam: 20,
    meta: { complete: false, idle: false },
    missionLeft: 12,
  });
  assert.equal(result.category, 'exam_near');
  assert.equal(result.actionType, 'performance');
  assert.match(result.message, /20 dias/);
});

test('meta incompleta gera conselho para iniciar a missão', () => {
  const result = getMentorMessage({
    ...BASE,
    meta: { complete: false, idle: false },
    missionLeft: 8,
  });
  assert.equal(result.category, 'daily_goal');
  assert.equal(result.actionType, 'start_daily_mission');
  assert.match(result.message, /Faltam 8/);
});

test('hábitos configurados e incompletos geram conselho de preparação', () => {
  const result = getMentorMessage({
    ...BASE,
    wellbeingState: { cards: [{ completed: true }, { completed: false }] },
  });
  assert.equal(result.category, 'wellbeing');
  assert.equal(result.actionValue, 'wellbeing');
});

test('sequência em andamento gera mensagem estável de constância', () => {
  const result = getMentorMessage({ ...BASE, player: { streak_days: 7 } });
  assert.equal(result.category, 'streak');
  assert.equal(result.actionType, 'start_daily_mission');
  assert.match(result.message, /7 dias/);
});

test('disciplina fraca gera ação para abrir a árvore correspondente', () => {
  const result = getMentorMessage({
    ...BASE,
    missionFocus: { id: 'portugues', name: 'Língua Portuguesa' },
  });
  assert.equal(result.category, 'weak_discipline');
  assert.equal(result.actionType, 'weak_discipline');
  assert.equal(result.actionValue, 'portugues');
  assert.match(result.title, /Língua Portuguesa/);
});

test('mesmo estado no mesmo dia produz exatamente a mesma mensagem e id', () => {
  const input = { ...BASE, player: { streak_days: 4 } };
  assert.deepEqual(getMentorMessage(input), getMentorMessage(input));
  assert.equal(getMentorMessage(input).id, 'mentor:2026-07-23:streak');
});

test('mensagem padrão não depende de aleatoriedade', () => {
  const result = getMentorMessage(BASE);
  assert.equal(result.category, 'default');
  assert.equal(result.actionType, 'none');
  assert.match(result.title, /Constância vence intensidade/);
});

test('retorno após ausência aparece antes da meta diária incompleta', () => {
  const result = getMentorMessage({
    ...BASE,
    currentDate: '2026-07-23',
    lastStudyDate: '2026-07-20',
    studiedToday: false,
    meta: { complete: false, idle: false },
  });
  assert.equal(result.category, 'return_after_absence');
  assert.equal(result.title, 'Retome o controle');
  assert.equal(result.actionType, 'start_daily_mission');
  assert.match(result.message, /Uma pausa não destrói sua jornada/);
});

test('retorno após ausência não aparece para quem já estudou hoje', () => {
  const result = getMentorMessage({
    ...BASE,
    currentDate: '2026-07-23',
    lastStudyDate: '2026-07-20',
    studiedToday: true,
  });
  assert.notEqual(result.category, 'return_after_absence');
});
