import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { answerQuestion, validateBattleSession } from '../app/js/core/battle.js';
import { buildQuestionExplanation } from '../app/js/services/questionExplanationService.js';
import {
  classifyBattleResult,
  deduplicateBattleExplanation,
  renderBattleFeedback,
} from '../app/js/ui/battleArena.js';
import { formatStars, starsHtml } from '../app/js/ui/helpers.js';

const arenaUrl = new URL('../app/js/ui/battleArena.js', import.meta.url);
const cssUrl = new URL('../app/css/design-system.css', import.meta.url);

function session(questions) {
  return {
    id: 'battle-visual-contract',
    subtopic_id: 'subtopic-1',
    subtopic: { id: 'subtopic-1', discipline_id: 'discipline-1' },
    questions,
    index: 0,
    correct: 0,
    answered: 0,
    combo: 0,
    maxCombo: 0,
    monsterHp: 100,
    playerHp: 100,
    finished: false,
    results: [],
  };
}

function question(index, overrides = {}) {
  return {
    id: `question-${index}`,
    subtopic_id: 'subtopic-1',
    statement: `Enunciado ${index}`,
    format: 'certo_errado',
    correct_answer: true,
    explanation: 'A norma confirma a afirmação.',
    ...overrides,
  };
}

test('fluxo funcional preserva validação, confirmação única, confiança e ordem', () => {
  const questions = Array.from({ length: 10 }, (_, index) => question(index + 1));
  const battle = session(questions);
  const beforeIds = battle.questions.map((item) => item.id);
  validateBattleSession(battle);

  const result = answerQuestion(battle, true, { confidence: 'low', questionId: 'question-1' });
  assert.equal(result.correct, true);
  assert.equal(battle.results[0].confidence, 'low');
  assert.equal(battle.answered, 1);
  assert.deepEqual(battle.questions.map((item) => item.id), beforeIds);
  assert.throws(
    () => answerQuestion(battle, true, { confidence: 'low', questionId: 'question-1' }),
    { code: 'BATTLE_QUESTION_STALE' },
  );
  assert.equal(battle.answered, 1);
});

test('feedback normalizado cobre acerto, erro, fallback e conteúdo editorial real', () => {
  const complete = buildQuestionExplanation(question(1, {
    correct_answer: false,
    explanation: 'A afirmação contraria o artigo aplicável.',
    pegadinha: 'A banca trocou a exceção pela regra.',
    conhecimento: 'Compare regra e exceção.',
    fonte: 'Código de Processo Penal.',
    referencias: ['Artigo de referência.'],
  }));
  const correct = renderBattleFeedback({ correct: true }, complete, 'low', 'Errado');
  const wrong = renderBattleFeedback({ correct: false }, complete, 'normal', 'Certo');

  assert.match(correct, /Resposta correta/);
  assert.match(correct, /Em dúvida/);
  assert.match(wrong, /Resposta incorreta/);
  assert.match(wrong, /Transforme o erro em aprendizado/);
  assert.match(wrong, /Esta questão entrou no seu ciclo de revisão/);
  assert.match(wrong, /Pegadinha da banca/);
  assert.match(wrong, /Conhecimento adicional/);
  assert.match(wrong, /Código de Processo Penal/);
  assert.match(wrong, /Artigo de referência/);

  const multipleChoice = buildQuestionExplanation(question(3, {
    format: 'multipla_escolha',
    correct_answer: 'C',
    options: ['A) Injuntivo', 'B) Narrativo', 'C) Dissertativo', 'D) Exortativo'],
  }));
  const multipleChoiceFeedback = renderBattleFeedback({ correct: false }, multipleChoice, 'normal', 'Injuntivo');
  assert.match(multipleChoiceFeedback, /C\) Dissertativo/);
  assert.doesNotMatch(multipleChoiceFeedback, /<dd>Certo<\/dd>/);

  const fallback = buildQuestionExplanation(question(2, { explanation: '' }));
  assert.equal(fallback.hasCompleteExplanation, false);
  assert.equal(fallback.explanation, 'Explicação detalhada ainda não disponível para esta questão.');
  assert.match(renderBattleFeedback({ correct: true }, fallback, 'normal', 'Certo'), /Explicação detalhada ainda não disponível/);
});

test('deduplicação é somente de apresentação e preserva a explicação original', () => {
  const explanation = {
    explanation: 'Regra principal.',
    sections: [
      { label: 'Resumo', text: 'Regra principal!' },
      { label: 'Dica de memorização', text: 'Leia com atenção.' },
    ],
    trap: 'Leia com atenção',
    addedKnowledge: 'Conhecimento novo.',
    references: ['Fonte A', 'fonte a.', 'Fonte B'],
    source: 'Fonte B.',
  };
  const before = structuredClone(explanation);
  const presentation = deduplicateBattleExplanation(explanation);

  assert.deepEqual(explanation, before);
  assert.deepEqual(presentation.sections, [
    { label: 'Dica de memorização', text: 'Leia com atenção.' },
    { label: 'Conhecimento adicional', text: 'Conhecimento novo.' },
  ]);
  assert.deepEqual(presentation.references, ['Fonte A', 'Fonte B']);
  assert.equal(presentation.source, '');
});

test('classificação é visual, limitada e não altera valores acadêmicos', () => {
  assert.equal(classifyBattleResult(100), 'Domínio consolidado');
  assert.equal(classifyBattleResult(79.9), 'Bom avanço');
  assert.equal(classifyBattleResult(40), 'Em desenvolvimento');
  assert.equal(classifyBattleResult(-1), 'Precisa de reforço');
});

test('estrelas fracionárias mantêm valor textual e representação parcial', () => {
  assert.equal(formatStars(2.5), '2,5');
  const visual = starsHtml(2.5);
  assert.equal((visual.match(/class="star full"/g) || []).length, 2);
  assert.equal((visual.match(/class="star half"/g) || []).length, 1);
  assert.equal((visual.match(/class="star off"/g) || []).length, 2);
});

test('Arena V4 contém estados acessíveis, saída segura e resultado persistido', async () => {
  const source = await readFile(arenaUrl, 'utf8');
  for (const contract of [
    'battle-header', 'battle-progress', 'battle-stage', 'battle-question', 'battle-confidence',
    'battle-feedback', 'battle-result', 'battle-state', 'aria-pressed', 'aria-busy',
    'Confirmando…', 'Calculando seu resultado', 'Tentar novamente', 'Ver resultado',
    'Resposta confirmada',
    'Voltar ao subtópico', 'Ir para Hoje', 'Ver revisões',
  ]) assert.match(source, new RegExp(contract));
  assert.match(source, /validateBattleSession\(session\)/);
  assert.match(source, /answerQuestion\(session/);
  assert.match(source, /finalizeBattle\(session\)/);
  assert.match(source, /getBattleResult\(session\.id\)/);
  assert.match(source, /summary\.stars/);
  assert.match(source, /summary\.xpEarned > 0/);
  assert.match(source, /summary\.newCard/);
  assert.match(source, /summary\.newInsignias/);
  assert.doesNotMatch(source, /arena arena--v2/);
  assert.doesNotMatch(source, /paintFocusQuestion\([^;]+;\s*return;/s);
});

test('CSS da Arena protege legibilidade, alvos, responsividade e movimento reduzido', async () => {
  const css = await readFile(cssUrl, 'utf8');
  const start = css.indexOf('/* Arena V4');
  const end = css.indexOf('/* Edital V4', start);
  const arena = css.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(arena, /min-height:var\(--ds-touch-target\)/);
  assert.match(arena, /font-size:var\(--ds-type-(?:label|micro)\)/);
  assert.match(arena, /\.battle-answers \.answer-btn \{[^}]*flex-wrap:wrap/);
  assert.match(arena, /\.battle-answers \.answer-text \{[^}]*flex:1 1 16rem[^}]*word-break:normal[^}]*overflow-wrap:break-word/);
  assert.match(arena, /\.answer-result-label \{[^}]*max-width:100%[^}]*flex:0 1 auto[^}]*word-break:normal[^}]*overflow-wrap:break-word/);
  assert.match(arena, /@media \(max-width:620px\)[\s\S]*\.battle-answers \.answer-text \{ flex-basis:calc\(100% - 42px\); \}/);
  assert.match(arena, /\.answer-result-label \{ width:auto; max-width:calc\(100% - 42px\); margin-left:42px; margin-right:auto; flex:0 0 auto; \}/);
  assert.match(arena, /@media \(max-width:620px\)/);
  assert.match(arena, /grid-template-columns:1fr/);
  assert.match(arena, /env\(safe-area-inset-bottom/);
  assert.match(arena, /@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(arena, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(arena, /!important/);
});
