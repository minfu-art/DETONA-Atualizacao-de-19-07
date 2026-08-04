import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuestionExplanation, enhanceQuestionExplanation, normalizeQuestionFeedback, registerExplanationEnhancer,
} from '../js/services/questionExplanationService.js';

test('explicação simples continua compatível', () => {
  const view = buildQuestionExplanation({ explanation: 'Explicação atual.' });
  assert.equal(view.explanation, 'Explicação atual.');
  assert.equal(view.enriched, false);
});

test('estrutura enriquecida organiza alternativas, dica e referências', () => {
  const view = buildQuestionExplanation({
    explicacao: 'Base.', porqueCorreta: 'Correta por isso.',
    porqueAlternativaA: 'A falha aqui.', dicaDeMemorizacao: 'Use a sigla.', referencias: ['Fonte oficial'],
  });
  assert.equal(view.enriched, true);
  assert.deepEqual(view.sections.map((section) => section.field), ['porqueCorreta', 'porqueAlternativaA', 'dicaDeMemorizacao']);
  assert.deepEqual(view.references, ['Fonte oficial']);
});

test('ponto de extensão aceita enriquecedor futuro sem implementar IA', async () => {
  const unregister = registerExplanationEnhancer('teste', async ({ explanation }) => ({
    ...explanation, summaryGenerated: 'Resumo futuro',
  }));
  const enhanced = await enhanceQuestionExplanation({ explanation: 'Base.' });
  unregister();
  assert.equal(enhanced.summaryGenerated, 'Resumo futuro');
});

test('normalização cobre aliases legados sem modificar a questão', () => {
  const question = {
    justificativa: 'Fundamento legado.',
    pegadinha: 'Atenção ao termo sempre.',
    conhecimento: 'Compare a exceção.',
    fonte: 'Fonte oficial',
    resposta_correta: 'B',
    alternativas: ['A) Um', 'B) Dois'],
  };
  const before = structuredClone(question);
  const view = normalizeQuestionFeedback(question);
  assert.equal(view.explanation, 'Fundamento legado.');
  assert.equal(view.trap, 'Atenção ao termo sempre.');
  assert.equal(view.addedKnowledge, 'Compare a exceção.');
  assert.equal(view.source, 'Fonte oficial');
  assert.equal(view.correctAnswer, 'B');
  assert.equal(view.hasCompleteExplanation, true);
  assert.deepEqual(question, before);
});

test('feedback incompleto usa mensagem factual e não inventa explicação', () => {
  const view = normalizeQuestionFeedback({ correct_answer: true });
  assert.equal(view.explanation, 'Explicação detalhada ainda não disponível para esta questão.');
  assert.equal(view.hasCompleteExplanation, false);
  assert.equal(view.trap, '');
  assert.equal(view.addedKnowledge, '');
});
