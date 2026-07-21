const enhancers = new Map();

const SECTION_FIELDS = [
  ['porqueCorreta', 'Por que a resposta está correta'],
  ['porqueAlternativaA', 'Alternativa A'],
  ['porqueAlternativaB', 'Alternativa B'],
  ['porqueAlternativaC', 'Alternativa C'],
  ['porqueAlternativaD', 'Alternativa D'],
  ['porqueAlternativaE', 'Alternativa E'],
  ['pegadinhaDaBanca', 'Pegadinha da banca'],
  ['dicaDeMemorizacao', 'Dica de memorização'],
  ['resumo', 'Resumo'],
];

export function buildQuestionExplanation(question = {}) {
  const explanation = question.explicacao || question.explanation || 'Explicação ainda não disponível.';
  const sections = SECTION_FIELDS
    .map(([field, label]) => ({ field, label, text: String(question[field] || '').trim() }))
    .filter((section) => section.text);
  return {
    explanation,
    sections,
    references: (Array.isArray(question.referencias) ? question.referencias : []).filter(Boolean),
    enriched: sections.length > 0 || (question.referencias || []).length > 0,
  };
}

export function registerExplanationEnhancer(name, enhancer) {
  if (!name || typeof enhancer !== 'function') throw new TypeError('Extensão de explicação inválida.');
  enhancers.set(name, enhancer);
  return () => enhancers.delete(name);
}

export async function enhanceQuestionExplanation(question, context = {}) {
  let current = buildQuestionExplanation(question);
  for (const [name, enhancer] of enhancers) {
    const result = await enhancer({ question, explanation: current, context, provider: name });
    if (result && typeof result === 'object') current = { ...current, ...result };
  }
  return current;
}
