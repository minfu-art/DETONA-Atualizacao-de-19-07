/**
 * Pure presentation model for the Study Plan workspace.
 *
 * This module never writes data and never invokes a service. It only turns
 * routine snapshots into safe, predictable labels used by the interface.
 */

const STATUS = Object.freeze({
  planned: { label: 'Planejado', tone: 'planned', symbol: '○' },
  in_progress: { label: 'Em andamento', tone: 'active', symbol: '▶' },
  partially_completed: { label: 'Parcial', tone: 'partial', symbol: '◐' },
  completed: { label: 'Concluído', tone: 'completed', symbol: '✓' },
  skipped: { label: 'Ignorado', tone: 'muted', symbol: '—' },
  rescheduled: { label: 'Reagendado', tone: 'muted', symbol: '↗' },
  cancelled: { label: 'Cancelado', tone: 'muted', symbol: '×' },
});

export function formatPlanMinutes(value = 0) {
  const minutes = Math.max(0, Number(value) || 0);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function buildBlockPresentation(block = {}, { activity = '', family = 'estudo' } = {}) {
  const status = STATUS[block.status] || { label: String(block.status || 'Planejado'), tone: 'planned', symbol: '○' };
  const canAct = ['planned', 'in_progress', 'partially_completed'].includes(block.status);
  return {
    id: String(block.id || ''),
    title: String(block.title || 'Bloco sem título'),
    description: String(block.description || ''),
    activity,
    family,
    status,
    time: block.startTime ? String(block.startTime) : 'Horário flexível',
    duration: formatPlanMinutes(block.plannedMinutes),
    actual: block.actualMinutes ? formatPlanMinutes(block.actualMinutes) : '',
    context: [block.subjectName, block.disciplineName, block.subtopicName].filter(Boolean).join(' · '),
    canAct,
    primaryLabel: block.status === 'in_progress' || block.status === 'partially_completed' ? 'Retomar' : 'Iniciar',
  };
}

export function buildTodayPresentation({ state = {}, blocks = [], next = null, streak = 0, profile = {}, journey = {} } = {}) {
  const planned = Math.max(0, Number(state.plannedMinutes) || 0);
  const actual = Math.max(0, Number(state.actualMinutes) || 0);
  const progress = planned ? Math.min(100, Math.round((actual / planned) * 100)) : (state.minGoalMet ? 100 : 0);
  const pending = blocks.filter((block) => ['planned', 'in_progress', 'partially_completed'].includes(block.status)).length;
  return {
    planned,
    actual,
    progress,
    streak: Math.max(0, Number(streak) || 0),
    pending,
    hasNext: Boolean(next),
    nextTitle: next?.title || 'Dia sem missão pendente',
    nextDuration: formatPlanMinutes(next?.plannedMinutes || profile.minDailyMinutes || 0),
    nextAction: next?.status === 'in_progress' || next?.status === 'partially_completed' ? 'Retomar missão' : 'Iniciar missão',
    heroTitle: 'Seu plano de hoje',
    heroSubtitle: journey.hasExam
      ? `A prova está a ${journey.daysLeft} dia(s). Hoje há ${formatPlanMinutes(planned)} planejados.`
      : planned
        ? `Hoje há ${formatPlanMinutes(planned)} planejados em ${blocks.length} bloco(s).`
        : 'Organize uma missão possível para avançar com constância.',
  };
}

export function buildWeekPresentation(view = {}) {
  const summary = view.summary || {};
  return {
    title: 'Organize a próxima sequência',
    subtitle: 'Veja a capacidade de cada dia e distribua blocos sem comprimir sua rotina.',
    planned: formatPlanMinutes(summary.plannedMinutes),
    actual: formatPlanMinutes(summary.actualMinutes),
    adherence: `${Math.max(0, Number(summary.adherence) || 0)}%`,
  };
}

export function buildMonthPresentation(view = {}) {
  return {
    title: 'Seu calendário estratégico',
    subtitle: 'Compare a carga dos dias e abra os detalhes sem perder a visão do mês.',
    month: String(view.monthName || ''),
    year: String(view.year || ''),
  };
}

export function buildAvailabilityPresentation(profile = {}, {
  todayCapacityMinutes = 0,
  weeklyCapacityMinutes = 0,
  todayIsRestDay = false,
} = {}) {
  const availableDays = profile.availableDays || [];
  const restDays = profile.restDays || [];
  return {
    title: 'O plano começa pela sua vida real',
    subtitle: 'Defina seus limites para que o cronograma respeite trabalho, descanso e tempo disponível.',
    availableDays: availableDays.length,
    restDays: restDays.length,
    dailyCapacityLabel: todayIsRestDay ? 'Disponibilidade de hoje' : 'Capacidade de hoje',
    dailyCapacity: todayIsRestDay ? 'Hoje é dia de descanso' : formatPlanMinutes(todayCapacityMinutes),
    weeklyCapacity: formatPlanMinutes(weeklyCapacityMinutes),
    preferredSession: formatPlanMinutes(profile.preferredSessionMinutes || 0),
    maxBlocks: Number(profile.maxBlocksPerDay) || 0,
  };
}

export function buildExamJourneyPresentation(snapshot = {}) {
  const journey = snapshot.journey || {};
  return {
    title: 'Sua rota até a prova',
    subtitle: journey.hasExam
      ? `${journey.daysLeft} dia(s) restantes em uma leitura exclusivamente temporal.`
      : 'Defina a data da prova para visualizar sua rota.',
    hasExam: Boolean(journey.hasExam),
    daysLeft: Math.max(0, Number(journey.daysLeft) || 0),
    weeksLeft: Math.max(0, Number(journey.weeksLeft) || 0),
    elapsed: Math.min(100, Math.max(0, Number(journey.elapsedPct) || 0)),
    remaining: Math.min(100, Math.max(0, Number(journey.remainingPct) || 0)),
  };
}

export function buildFocusPresentation({ blocks = [], profile = {} } = {}) {
  return {
    title: 'Uma sessão sem distrações',
    subtitle: blocks.length
      ? `${blocks.length} atividade(s) estão disponíveis para iniciar ou retomar.`
      : 'Você pode iniciar uma sessão livre e registrar o tempo real.',
    defaultMinutes: Number(profile.focus?.sessionMinutes) || 25,
  };
}

export function buildProgressPresentation(snapshot = {}) {
  const metrics = snapshot.metrics || {};
  return {
    title: 'Leitura do seu planejamento',
    subtitle: 'Compare o tempo planejado com a execução real, sem misturar rotina e domínio acadêmico.',
    streak: Math.max(0, Number(metrics.streak) || 0),
    bestStreak: Math.max(0, Number(metrics.bestStreak) || 0),
    consistency: Math.max(0, Number(metrics.weeklyConsistency) || 0),
    plannedHours: Number(metrics.plannedHours) || 0,
    actualHours: Number(metrics.actualHours) || 0,
  };
}

export function buildPlanEmptyState(kind = 'plan') {
  const states = {
    setup: ['Monte um plano que caiba na sua rotina', 'Escolha um ponto de partida. Você poderá ajustar horários e limites depois.'],
    day: ['Hoje está livre', 'Adicione um bloco ou consulte a Semana para organizar a próxima missão.'],
    week: ['Semana sem blocos', 'Use “Adicionar bloco” ou gere o plano quando houver conteúdo elegível.'],
    review: ['Nenhuma revisão disponível', 'A fila de memória será exibida quando houver conteúdo elegível.'],
    history: ['Ainda não há histórico', 'As métricas aparecem depois das primeiras sessões registradas.'],
    exam: ['Data da prova não definida', 'Defina a data da prova para visualizar sua rota.'],
    focus: ['Nenhuma sessão ativa', 'Escolha uma duração e inicie quando estiver pronto.'],
    capacity: ['Sem espaço disponível agora', 'Ajuste sua disponibilidade ou tente outra duração sem apagar o plano original.'],
  };
  const [title, description] = states[kind] || states.day;
  return { title, description };
}

export function buildPlanErrorPresentation(message = '') {
  return {
    title: 'Não foi possível concluir esta ação',
    message: String(message || 'Tente novamente. Seus dados anteriores foram preservados.')
      .replace(/indexeddb|supabase|endpoint|scopekey|stack/gi, 'serviço'),
  };
}
