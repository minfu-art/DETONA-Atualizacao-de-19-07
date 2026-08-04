import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildReviewFeedbackPresentation,
  buildReviewPlanPresentation,
  buildReviewResultPresentation,
  formatReviewDate,
  memoryPresentation,
} from '../app/js/ui/reviewPresentation.js';

const NOW = new Date('2026-08-04T12:00:00-03:00');

function plan(overrides = {}) {
  return {
    total: 10,
    due: 25,
    future: 4,
    urgent: 8,
    frozen: 2,
    nextReviewAt: '2026-08-05T12:00:00-03:00',
    counts: { error: 7, low_confidence: 2, recurring: 8, scheduled: 8 },
    items: Array.from({ length: 10 }, (_, index) => ({
      order: index + 1,
      type: index % 2 ? 'recurring' : 'error',
      label: index % 2 ? 'Recorrência' : 'Erro recente',
      tone: index % 2 ? 'recurring' : 'error',
      priority: { label: 'Urgente', tone: 'urgent' },
      subtopicName: index === 0 ? 'Subtópico com um nome acadêmico muito longo que não pode ser destruído' : `Subtópico ${index + 1}`,
      reason: 'Motivo acadêmico real.',
      memoryState: index % 2 ? 'morna' : 'quente',
      mastery: 30,
      nextReviewAt: '2026-08-01T12:00:00-03:00',
      question: { disciplina: 'Língua Portuguesa e Comunicação Institucional' },
    })),
    ...overrides,
  };
}

test('plano com 25 vencidas mantém recomendação limitada ao bloco real de 10', () => {
  const view = buildReviewPlanPresentation(plan(), NOW);
  assert.equal(view.due, 25);
  assert.equal(view.total, 10);
  assert.equal(view.items.length, 10);
  assert.equal(view.recommendation, '10 pontos prioritários para fortalecer agora.');
  assert.equal(view.future, 4);
  assert.equal(view.frozen, 2);
  assert.equal(view.urgent, 8);
});

test('plano com menos de dez nunca promete dez nem preenche com futuras', () => {
  const source = plan({ total: 3, due: 3, future: 12 });
  source.items = source.items.slice(0, 3);
  const view = buildReviewPlanPresentation(source, NOW);
  assert.equal(view.recommendation, '3 pontos prioritários para fortalecer agora.');
  assert.equal(view.items.length, 3);
  assert.equal(view.future, 12);
});

test('plano preserva nomes longos, disciplina, memória, prazo e quatro tipos', () => {
  const view = buildReviewPlanPresentation(plan(), NOW);
  assert.equal(view.types.length, 4);
  assert.deepEqual(view.types.map((item) => item.type), ['error', 'low_confidence', 'recurring', 'scheduled']);
  assert.match(view.items[0].subtopicName, /nome acadêmico muito longo/);
  assert.equal(view.items[0].disciplineName, 'Língua Portuguesa e Comunicação Institucional');
  assert.equal(view.items[0].memory.label, 'Quente');
  assert.match(view.items[0].scheduleLabel, /dias em atraso/);
});

test('datas inválidas são ocultadas e estados de memória possuem explicação textual', () => {
  assert.equal(formatReviewDate('inválida'), null);
  assert.equal(memoryPresentation('quente').description, 'Precisa de reforço próximo.');
  assert.equal(memoryPresentation('morna').description, 'Começando a consolidar.');
  assert.equal(memoryPresentation('fria').description, 'Conteúdo mais estável.');
  assert.equal(memoryPresentation('congelada').description, 'Memória consolidada no ciclo atual.');
});

test('feedback correto distingue transição real de permanência no ciclo', () => {
  const transitioned = buildReviewFeedbackPresentation({
    correct: true,
    previousMemoryState: 'quente',
    memoryState: 'morna',
    nextReviewAt: '2026-08-10T12:00:00-03:00',
  }, { explanation: 'Explicação real.' });
  assert.equal(transitioned.transitioned, true);
  assert.equal(transitioned.transitionLabel, 'Quente → Morna');
  assert.match(transitioned.message, /avançou/);

  const unchanged = buildReviewFeedbackPresentation({
    correct: true,
    previousMemoryState: 'morna',
    memoryState: 'morna',
  }, { explanation: 'Explicação real.' });
  assert.equal(unchanged.transitioned, false);
  assert.equal(unchanged.transitionLabel, 'Permanece morna');
  assert.doesNotMatch(unchanged.message, /avançou|fortalecida/);
});

test('feedback incorreto usa linguagem segura e fallback editorial normalizado', () => {
  const hot = buildReviewFeedbackPresentation({
    correct: false,
    previousMemoryState: 'fria',
    memoryState: 'quente',
  }, { pegadinha: 'Leia o comando.', fonte: 'Fonte oficial.' });
  assert.equal(hot.title, 'Vamos fortalecer este ponto');
  assert.equal(hot.message, 'Este conteúdo voltou para o reforço próximo.');
  assert.equal(hot.explanation.explanation, 'Explicação detalhada ainda não disponível para esta questão.');
  assert.equal(hot.normalized.trap, 'Leia o comando.');
  assert.equal(hot.normalized.source, 'Fonte oficial.');
});

test('resultado deriva contadores e transições reais sem inventar fortalecimento', () => {
  const results = [
    { correct: true, previousMemoryState: 'quente', memoryState: 'morna' },
    { correct: true, previousMemoryState: 'morna', memoryState: 'morna' },
    { correct: false, previousMemoryState: 'fria', memoryState: 'quente' },
  ];
  const view = buildReviewResultPresentation({
    total: 4,
    correct: 99,
    errors: 99,
    xp: { total: 40 },
    activeSeconds: 75,
    newInsignias: [{ name: 'Memória ativa' }],
  }, results);
  assert.equal(view.correct, 2);
  assert.equal(view.errors, 1);
  assert.equal(view.unanswered, 1);
  assert.equal(view.correct + view.errors + view.unanswered, view.total);
  assert.equal(view.strengthened, 1);
  assert.equal(view.transitions.morna, 1);
  assert.equal(view.hot, 1);
  assert.equal(view.xp, 40);
  assert.deepEqual(view.emblems, [{ name: 'Memória ativa' }]);
});

test('resultado com XP zero e sem transição permanece factual', () => {
  const view = buildReviewResultPresentation({ total: 1, correct: 1, errors: 0, xp: { total: 0 } }, [
    { correct: true, previousMemoryState: 'fria', memoryState: 'fria' },
  ]);
  assert.equal(view.xp, 0);
  assert.equal(view.strengthened, 0);
  assert.deepEqual(view.transitions, { morna: 0, fria: 0, congelada: 0 });
});

test('estrutura visual cobre estados, acessibilidade, movimento reduzido e responsividade', async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL('../app/js/ui/review.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/css/review.css', import.meta.url), 'utf8'),
  ]);
  for (const marker of [
    'review-summary', 'review-types', 'review-queue', 'review-session', 'review-question',
    'review-answers', 'review-feedback', 'review-memory', 'review-result', 'review-exit-dialog', 'review-state',
  ]) assert.match(ui + css, new RegExp(marker));
  assert.match(ui, /fieldset class="review-answer-fieldset"/);
  assert.match(ui, /role="radiogroup"/);
  assert.match(ui, /aria-checked="false"/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /role="alert" tabindex="-1"/);
  assert.match(ui, /aria-busy="false"/);
  assert.match(css, /min-height:var\(--ds-touch-target\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /max-width:350px/);
  assert.match(css, /max-width:520px/);
  assert.match(css, /max-width:700px/);
  assert.match(css, /max-width:900px/);
  assert.doesNotMatch(css, /!important/);
  const tinyOperationalText = [...css.matchAll(/font-size:\s*([\d.]+)px/g)]
    .map((match) => Number(match[1])).filter((value) => value < 12);
  assert.deepEqual(tinyOperationalText, []);
});

test('interface não cria escrita ao abrir plano ou selecionar alternativa', async () => {
  const ui = await readFile(new URL('../app/js/ui/review.js', import.meta.url), 'utf8');
  const selection = ui.slice(ui.indexOf("root.querySelectorAll('.answer-btn')"), ui.indexOf("confirm.addEventListener"));
  assert.doesNotMatch(selection, /answerReviewQuestion|finalizeReviewSession|repository|\.put\(/);
  assert.match(ui, /answerReviewQuestion\(session, selectedAnswer\)/);
  assert.match(ui, /finalizeReviewSession\(session\)/);
});

