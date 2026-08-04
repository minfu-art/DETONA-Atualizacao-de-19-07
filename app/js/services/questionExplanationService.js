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

const FEEDBACK_FALLBACK = 'Explicação detalhada ainda não disponível para esta questão.';

function firstText(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
}

function firstList(...values) {
  const value = values.find((candidate) => Array.isArray(candidate));
  return (value || []).map((item) => String(item ?? '').trim()).filter(Boolean);
}

export function normalizeQuestionFeedback(question = {}) {
  const explanation = firstText(
    question.explanation,
    question.explicacao,
    question.justification,
    question.justificativa,
    question.resolucao,
  );
  const trap = firstText(question.pegadinha, question.pegadinhaDaBanca);
  const addedKnowledge = firstText(
    question.knowledge,
    question.conhecimento,
    question.dicaDeMemorizacao,
    question.resumo,
  );
  const source = firstText(question.source, question.fonte);
  const correctAnswer = question.correct_answer
    ?? question.resposta_correta
    ?? question.respostaCorreta
    ?? question.correct_option
    ?? null;
  const alternatives = firstList(question.alternatives, question.alternativas, question.options);
  return {
    result: question.result ?? question.resultado ?? null,
    correctAnswer,
    alternatives,
    explanation: explanation || FEEDBACK_FALLBACK,
    trap,
    addedKnowledge,
    source,
    hasCompleteExplanation: Boolean(explanation),
  };
}

export function buildQuestionExplanation(question = {}) {
  const normalized = normalizeQuestionFeedback(question);
  const sections = SECTION_FIELDS
    .map(([field, label]) => ({ field, label, text: String(question[field] || '').trim() }))
    .filter((section) => section.text);
  if (normalized.trap && !sections.some((section) => section.text === normalized.trap)) {
    sections.push({ field: 'trap', label: 'Pegadinha da banca', text: normalized.trap });
  }
  if (normalized.addedKnowledge && !sections.some((section) => section.text === normalized.addedKnowledge)) {
    sections.push({ field: 'addedKnowledge', label: 'Conhecimento adicional', text: normalized.addedKnowledge });
  }
  const references = firstList(question.referencias, question.references);
  return {
    ...normalized,
    sections,
    references,
    enriched: sections.length > 0 || references.length > 0 || Boolean(normalized.source),
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
