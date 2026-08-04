import { buildQuestionExplanation, normalizeQuestionFeedback } from '../services/questionExplanationService.js';

const MEMORY = Object.freeze({
  quente: { label: 'Quente', description: 'Precisa de reforço próximo.', tone: 'hot' },
  morna: { label: 'Morna', description: 'Começando a consolidar.', tone: 'warm' },
  fria: { label: 'Fria', description: 'Conteúdo mais estável.', tone: 'cool' },
  congelada: { label: 'Congelada', description: 'Memória consolidada no ciclo atual.', tone: 'frozen' },
});

const REVIEW_TYPES = Object.freeze({
  error: { label: 'Erro recente', description: 'Corrija um ponto que acabou de falhar.', symbol: '!' },
  low_confidence: { label: 'Baixa confiança', description: 'Transforme dúvida em segurança.', symbol: '?' },
  recurring: { label: 'Recorrência', description: 'Interrompa um padrão de erro que voltou a aparecer.', symbol: '↻' },
  scheduled: { label: 'Agendada', description: 'Mantenha o conteúdo acessível na memória.', symbol: '◷' },
});

function number(value) {
  return Math.max(0, Number(value) || 0);
}

export function validReviewDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function formatReviewDate(value, options = {}) {
  const date = validReviewDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('pt-BR', options.withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'long' }).format(date);
}

export function memoryPresentation(state) {
  return MEMORY[state] || { label: 'Em acompanhamento', description: 'Estado de memória em atualização.', tone: 'neutral' };
}

export function reviewTypePresentation(type) {
  return REVIEW_TYPES[type] || REVIEW_TYPES.scheduled;
}

export function buildReviewPlanPresentation(plan = {}, now = new Date()) {
  const total = number(plan.total);
  const due = number(plan.due);
  const future = number(plan.future);
  const urgent = number(plan.urgent);
  const frozen = number(plan.frozen);
  const nextCycle = formatReviewDate(plan.nextReviewAt, { withTime: true });
  const types = ['error', 'low_confidence', 'recurring', 'scheduled'].map((type) => ({
    type,
    count: number(plan.counts?.[type]),
    ...reviewTypePresentation(type),
  }));
  const items = (plan.items || []).map((item, index) => {
    const memory = memoryPresentation(item.memoryState);
    const reviewAt = validReviewDate(item.nextReviewAt);
    const overdueDays = reviewAt && reviewAt <= now
      ? Math.max(0, Math.floor((now.getTime() - reviewAt.getTime()) / 86400000))
      : 0;
    return {
      ...item,
      order: number(item.order) || index + 1,
      disciplineName: item.disciplineName || item.question?.disciplinaNome
        || item.question?.disciplineName || (item.question?.disciplina !== item.disciplineId ? item.question?.disciplina : '') || '',
      memory,
      reviewDate: formatReviewDate(item.nextReviewAt, { withTime: true }),
      scheduleLabel: overdueDays > 0
        ? `${overdueDays} ${overdueDays === 1 ? 'dia em atraso' : 'dias em atraso'}`
        : 'Disponível agora',
    };
  });
  return {
    total,
    due,
    future,
    urgent,
    frozen,
    nextCycle,
    types,
    items,
    recommendation: `${total} ${total === 1 ? 'ponto prioritário' : 'pontos prioritários'} para fortalecer agora.`,
    availability: due === 1 ? '1 revisão disponível agora.' : `${due} revisões disponíveis agora.`,
  };
}

export function buildReviewFeedbackPresentation(result = {}, question = {}) {
  const previous = memoryPresentation(result.previousMemoryState);
  const current = memoryPresentation(result.memoryState);
  const transitioned = Boolean(result.previousMemoryState && result.memoryState
    && result.previousMemoryState !== result.memoryState);
  const normalized = normalizeQuestionFeedback(question);
  const explanation = buildQuestionExplanation(question);
  const correctMessage = transitioned
    ? 'Boa recuperação. Este conteúdo avançou no ciclo de memória.'
    : 'Resposta correta registrada. O conteúdo permanece no ciclo atual.';
  const incorrectMessage = result.memoryState === 'quente'
    ? 'Este conteúdo voltou para o reforço próximo.'
    : 'Resposta registrada. O conteúdo permanece no ciclo de reforço definido.';
  return {
    correct: result.correct === true,
    title: result.correct === true ? 'Resposta correta' : 'Vamos fortalecer este ponto',
    message: result.correct === true ? correctMessage : incorrectMessage,
    previous,
    current,
    transitioned,
    transitionLabel: transitioned ? `${previous.label} → ${current.label}` : `Permanece ${current.label.toLowerCase()}`,
    nextReview: formatReviewDate(result.nextReviewAt, { withTime: true }),
    normalized,
    explanation,
  };
}

export function buildReviewResultPresentation(summary = {}, results = []) {
  const total = number(summary.total);
  const resultRows = Array.isArray(results) ? results.slice(0, total) : [];
  const correct = resultRows.length ? resultRows.filter((item) => item?.correct === true).length : Math.min(total, number(summary.correct));
  const errors = resultRows.length ? resultRows.filter((item) => item?.correct === false).length : Math.min(total - correct, number(summary.errors));
  const unanswered = Math.max(0, total - correct - errors);
  const transitions = { morna: 0, fria: 0, congelada: 0 };
  let hot = 0;
  let strengthened = 0;
  for (const result of resultRows) {
    const changed = Boolean(result?.previousMemoryState && result?.memoryState
      && result.previousMemoryState !== result.memoryState);
    if (result?.correct === true && changed) strengthened += 1;
    if (changed && Object.hasOwn(transitions, result.memoryState)) transitions[result.memoryState] += 1;
    if (result?.memoryState === 'quente') hot += 1;
  }
  const xp = number(summary.xp?.total);
  const completed = correct + errors === total && unanswered === 0;
  const classification = strengthened > 0
    ? 'Memória avançando'
    : errors > correct ? 'Reforço necessário' : completed ? 'Ciclo concluído' : 'Sessão encerrada';
  return {
    total,
    correct,
    errors,
    unanswered,
    strengthened,
    transitions,
    hot,
    xp,
    classification,
    completed,
    nextReview: formatReviewDate(summary.nextReviewAt, { withTime: true }),
    activeSeconds: number(summary.activeSeconds),
    emblems: Array.isArray(summary.newInsignias) ? summary.newInsignias.filter(Boolean) : [],
  };
}
