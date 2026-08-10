const PERIOD_LABELS = Object.freeze({
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  all: 'Todo o histórico',
});

export const PERFORMANCE_PERIODS = Object.freeze(Object.entries(PERIOD_LABELS));

export const PERFORMANCE_CHART_COLORS = Object.freeze([
  '#22d3ee',
  '#38bdf8',
  '#6366f1',
  '#8b5cf6',
  '#0ea5e9',
  '#818cf8',
]);

export function clampVisualPercent(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(100, Math.max(0, numeric));
}

export function formatPerformancePercent(value, digits = 0) {
  if (value == null || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toFixed(digits)}%`;
}

export function formatPerformanceMinutes(totalMinutes) {
  if (totalMinutes == null || totalMinutes === '') return '—';
  const numeric = Number(totalMinutes);
  if (!Number.isFinite(numeric) || numeric < 0) return '—';
  const minutes = Math.round(numeric);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function formatPerformanceDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Data não disponível';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function performanceToneFromClassification(classification) {
  const normalized = String(classification || '').toLocaleLowerCase('pt-BR');
  if (normalized === 'forte') return 'strong';
  if (normalized === 'em evolução') return 'growing';
  if (normalized === 'atenção') return 'attention';
  if (normalized === 'prioridade de revisão') return 'priority';
  return 'neutral';
}

function completionModel(progress = {}) {
  const value = progress.completion != null && Number.isFinite(Number(progress.completion))
    ? Number(progress.completion)
    : null;
  const remaining = progress.remainingCompletion != null && Number.isFinite(Number(progress.remainingCompletion))
    ? Number(progress.remainingCompletion)
    : null;
  const totalTopics = Math.max(0, Number(progress.totalTopics) || 0);
  const theoryCompleted = Math.max(0, Number(progress.completedTopics) || 0);
  return {
    value,
    display: formatPerformancePercent(value),
    visual: clampVisualPercent(value) ?? 0,
    remaining,
    remainingDisplay: formatPerformancePercent(remaining),
    remainingVisual: clampVisualPercent(remaining) ?? 0,
    totalTopics,
    theoryCompleted,
    theoryPending: Math.max(0, totalTopics - theoryCompleted),
    available: value != null,
  };
}

function accuracyModel(overview = {}) {
  const value = overview.accuracy != null && Number.isFinite(Number(overview.accuracy))
    ? Number(overview.accuracy)
    : null;
  const answered = Math.max(0, Number(overview.answered) || 0);
  const correct = Math.max(0, Number(overview.correct) || 0);
  const errors = Math.max(0, Number(overview.errors) || 0);
  return {
    value,
    display: formatPerformancePercent(value),
    visual: clampVisualPercent(value) ?? 0,
    available: value != null,
    answered,
    correct,
    errors,
  };
}

function timeModel(time = {}) {
  const totalMinutes = Math.max(0, Number(time.totalMinutes) || 0);
  const undistributedMinutes = Math.max(0, Number(time.undistributedMinutes) || 0);
  return {
    ...time,
    totalMinutes,
    totalDisplay: totalMinutes > 0 ? formatPerformanceMinutes(totalMinutes) : '—',
    hasRecordedTime: totalMinutes > 0,
    undistributedMinutes,
    undistributedDisplay: formatPerformanceMinutes(undistributedMinutes),
    undistributedPercentage: totalMinutes > 0 ? Math.round((undistributedMinutes / totalMinutes) * 100) : 0,
  };
}

function orionModel(data, periodLabel) {
  const hasData = Boolean(data?.hasAnyData);
  const projectionAvailable = data?.quality?.projection?.available === true;
  return {
    title: hasData ? 'Leitura estratégica do período' : 'Seu painel ainda está começando',
    summary: hasData
      ? String(data?.summary || 'Os dados registrados neste período já estão disponíveis para análise.')
      : 'Responda questões e registre sessões de estudo para construir sua análise de desempenho.',
    context: `Dados reais de ${periodLabel.toLocaleLowerCase('pt-BR')}.`,
    projectionAvailable,
    projectionMessage: projectionAvailable
      ? 'Estimativa baseada no histórico comparável de conclusão integral.'
      : 'Histórico de conclusão ainda insuficiente para projeção.',
  };
}

export function buildPerformanceVisualModel(data = {}, contest = {}) {
  const period = Object.hasOwn(PERIOD_LABELS, data.period) ? data.period : '30d';
  const periodLabel = PERIOD_LABELS[period];
  const completion = completionModel(data.progress);
  const accuracy = accuracyModel(data.overview);
  const time = timeModel(data.time);
  const reviews = {
    completedInPeriod: Math.max(0, Number(data.reviews?.completedInPeriod) || 0),
    totalCompleted: Math.max(0, Number(data.reviews?.totalCompleted) || 0),
    active: Math.max(0, Number(data.reviews?.active) || 0),
    due: Math.max(0, Number(data.reviews?.due) || 0),
    frozen: Math.max(0, Number(data.reviews?.frozen) || 0),
    memory: {
      quente: Math.max(0, Number(data.reviews?.memory?.quente) || 0),
      morna: Math.max(0, Number(data.reviews?.memory?.morna) || 0),
      fria: Math.max(0, Number(data.reviews?.memory?.fria) || 0),
      congelada: Math.max(0, Number(data.reviews?.memory?.congelada) || 0),
    },
  };
  return {
    period,
    periodLabel,
    contest: {
      name: contest?.name || contest?.code || 'Concurso ativo',
      role: contest?.role || contest?.cargo || '',
    },
    completion,
    accuracy,
    questions: {
      answered: accuracy.answered,
      correct: accuracy.correct,
      errors: accuracy.errors,
    },
    time,
    reviews,
    disciplines: Array.isArray(data.disciplines) ? data.disciplines : [],
    evolution: Array.isArray(data.evolution) ? data.evolution : [],
    qualityWarning: Array.isArray(data.quality?.warnings) && data.quality.warnings.length > 0,
    hasAnyData: Boolean(data.hasAnyData),
    orion: orionModel(data, periodLabel),
  };
}
