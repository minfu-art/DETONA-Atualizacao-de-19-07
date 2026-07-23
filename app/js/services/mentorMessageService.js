function localDateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown-date';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function message(date, category, values) {
  return Object.freeze({
    id: `mentor:${localDateKey(date)}:${category}`,
    category,
    priority: 'normal',
    actionType: 'none',
    actionValue: null,
    actionLabel: null,
    ...values,
  });
}

export function getMentorMessage(input = {}) {
  const {
    player = {},
    meta = {},
    routine = null,
    reviewData = {},
    wellbeingState = {},
    daysUntilExam = null,
    missionFocus = null,
    missionLeft = 0,
    currentDate = new Date(),
  } = input;

  if (Number(reviewData.due) > 0) {
    const due = Number(reviewData.due);
    return message(currentDate, 'review', {
      title: 'Reforce antes de avançar',
      message: `Você tem ${due} ${due === 1 ? 'revisão vencida' : 'revisões vencidas'}. Recupere esses conteúdos antes que a memória perca força.`,
      actionLabel: 'Abrir revisão',
      actionType: 'internal_route',
      actionValue: 'review',
      priority: 'high',
    });
  }

  if (
    daysUntilExam !== null
    && daysUntilExam !== ''
    && Number.isFinite(Number(daysUntilExam))
    && Number(daysUntilExam) >= 0
    && Number(daysUntilExam) <= 30
  ) {
    const days = Number(daysUntilExam);
    return message(currentDate, 'exam', {
      title: 'Entramos na reta final',
      message: `Faltam ${days} ${days === 1 ? 'dia' : 'dias'} para a prova. Priorize revisões e os subtópicos de menor domínio.`,
      actionLabel: 'Ver desempenho',
      actionType: 'internal_route',
      actionValue: 'performance',
      priority: 'high',
    });
  }

  if (meta.complete === false && meta.idle !== true && routine?.enabled !== false) {
    const left = Math.max(0, Number(missionLeft) || 0);
    return message(currentDate, 'daily_goal', {
      title: 'Feche o ciclo de hoje',
      message: `Faltam ${left} para cumprir a meta que você definiu. Complete uma missão antes de encerrar o dia.`,
      actionLabel: 'Começar missão',
      actionType: 'start_daily_mission',
      actionValue: null,
    });
  }

  const habits = Array.isArray(wellbeingState.cards) ? wellbeingState.cards : [];
  const completedHabits = habits.filter((card) => card.completed).length;
  if (habits.length > 0 && completedHabits < habits.length) {
    return message(currentDate, 'wellbeing', {
      title: 'Prepare o corpo e a mente',
      message: 'Água por perto, notificações desligadas e um bloco curto de foco. Facilite o primeiro passo.',
      actionLabel: 'Abrir preparação',
      actionType: 'internal_route',
      actionValue: 'wellbeing',
    });
  }

  if (Number(player.streak_days) >= 2) {
    const streak = Number(player.streak_days);
    return message(currentDate, 'streak', {
      title: 'Proteja sua sequência',
      message: `Você está há ${streak} dias no controle. Hoje não precisa ser perfeito; precisa ser concluído.`,
      actionLabel: 'Começar missão',
      actionType: 'start_daily_mission',
      actionValue: null,
    });
  }

  const focusName = typeof missionFocus === 'object' ? missionFocus?.name : missionFocus;
  const focusId = typeof missionFocus === 'object' ? missionFocus?.id : null;
  if (focusName) {
    return message(currentDate, 'weak_discipline', {
      title: `Seu alvo agora é ${focusName}`,
      message: 'Esse é o ponto com menor domínio. Uma missão concentrada aqui gera mais avanço do que estudar sem direção.',
      actionLabel: 'Abrir disciplina',
      actionType: 'open_weak_discipline',
      actionValue: focusId,
    });
  }

  return message(currentDate, 'consistency', {
    title: 'Constância vence intensidade',
    message: 'Você não precisa terminar o edital hoje. Precisa cumprir o compromisso de hoje.',
  });
}
