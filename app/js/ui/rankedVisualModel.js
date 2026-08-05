const STATUS_LABELS = Object.freeze({
  scheduled: 'Em breve',
  registration_open: 'Inscrições abertas',
  live: 'Ao vivo',
  finished: 'Encerrado',
  cancelled: 'Cancelado',
});

const STATUS_ACTIONS = Object.freeze({
  scheduled: 'Ver detalhes',
  registration_open: 'Inscrever-se',
  live: 'Entrar no simulado',
  finished: 'Ver resultado',
  cancelled: 'Ver detalhes',
});

const STATUS_PRIORITY = Object.freeze({
  live: 0,
  registration_open: 1,
  scheduled: 2,
  finished: 3,
  cancelled: 4,
});

export const KIRO_ASSET = 'assets/mentors/kiro-ranked-strategist.webp';

export function rankedStatus(event) {
  return String(event?.effectiveStatus || event?.status || 'scheduled');
}

export function rankedStatusLabel(status) {
  return STATUS_LABELS[status] || 'Indisponível';
}

export function rankedEventAction(status) {
  return STATUS_ACTIONS[status] || 'Ver detalhes';
}

export function rankedScoringLabel(mode) {
  return mode === 'cebraspe'
    ? 'Acertos menos erros'
    : 'Quantidade de acertos';
}

export function rankedRankingReleaseLabel(mode) {
  return mode === 'immediate'
    ? 'Após a entrega, conforme liberação do evento'
    : 'Após o encerramento do evento';
}

export function rankedEventGroups(events = []) {
  const ordered = [...events].sort((left, right) => {
    const statusDifference = (STATUS_PRIORITY[rankedStatus(left)] ?? 99)
      - (STATUS_PRIORITY[rankedStatus(right)] ?? 99);
    if (statusDifference) return statusDifference;
    return new Date(left?.starts_at || 0) - new Date(right?.starts_at || 0);
  });
  const featured = ordered.find((event) => ['live', 'registration_open', 'scheduled'].includes(rankedStatus(event))) || null;
  return {
    featured,
    upcoming: ordered.filter((event) => event !== featured && ['live', 'registration_open', 'scheduled'].includes(rankedStatus(event))),
    recent: ordered.filter((event) => ['finished', 'cancelled'].includes(rankedStatus(event))),
  };
}

export function rankedTimerPresentation(remainingMilliseconds) {
  const remaining = Math.max(0, Number(remainingMilliseconds) || 0);
  if (remaining === 0) return { state: 'finished', label: 'Tempo encerrado' };
  if (remaining <= 60_000) return { state: 'urgent', label: 'Último minuto' };
  if (remaining <= 300_000) return { state: 'attention', label: 'Atenção ao tempo' };
  return { state: 'normal', label: 'Tempo restante' };
}

export function rankedQuestionPresentation({ current = false, answered = false, marked = false, submitted = false } = {}) {
  const states = [];
  if (current) states.push('atual');
  states.push(answered ? 'respondida' : 'em branco');
  if (marked) states.push('marcada para revisar');
  if (submitted) states.push('entregue');
  return {
    states,
    label: states.join(', '),
    className: [
      current ? 'is-current' : '',
      answered ? 'is-answered' : 'is-blank',
      marked ? 'is-marked' : '',
      submitted ? 'is-submitted' : '',
    ].filter(Boolean).join(' '),
  };
}

export function rankedResultStatus(attempt) {
  if (attempt?.status === 'timed_out') {
    return { label: 'Tempo encerrado e respostas entregues', tone: 'timed-out' };
  }
  return { label: 'Entrega registrada', tone: 'submitted' };
}
