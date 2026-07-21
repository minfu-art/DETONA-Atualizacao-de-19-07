import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuestionExplanation, enhanceQuestionExplanation, registerExplanationEnhancer,
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
