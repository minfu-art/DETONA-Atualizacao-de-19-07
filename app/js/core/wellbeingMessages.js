/**
 * Mensagens e conteúdo educativo da Preparação do Dia.
 * Sem menção a XP. Sem promessas médicas.
 */

export const DAY_MESSAGES = Object.freeze({
  inicio: [
    'Seu foco começa antes da primeira questão.',
    'Hoje, comece pequeno. O importante é entrar em movimento.',
    'Pequenas ações feitas com constância sustentam grandes aprovações.',
    'Cuidar da sua energia também faz parte da sua preparação.',
    'Uma mente menos agitada aprende melhor.',
    'Você não precisa fazer tudo. Precisa continuar.',
    'Preparar o corpo e a mente reduz a resistência para começar.',
    'Pequenas ações ajudam você a estudar com mais clareza.',
    'Uma preparação leve pode fazer seu estudo render melhor.',
  ],
  baixa_energia: [
    'Hoje não precisa ser perfeito. Precisa ser possível.',
    'Se a energia estiver baixa, faça o mínimo com intenção.',
    'Reduzir a carga pode ajudar você a continuar.',
    'Um microcompromisso mantém sua preparação viva.',
    'Pausar sem culpa também é estratégia.',
  ],
  constancia: [
    'Constância nasce de pequenas ações repetidas.',
    'O importante não é fazer tudo. É não se desconectar.',
    'Toda pequena vitória reduz a resistência do próximo passo.',
    'Constância não é nunca falhar. É voltar.',
    'Você está construindo base, não apenas completando tarefas.',
  ],
  encerramento: [
    'Fechar bem o dia ajuda a começar melhor amanhã.',
    'Deixe o próximo passo preparado.',
    'Encerrar com clareza protege sua constância.',
  ],
});

export const EDUCATION_CARDS = Object.freeze([
  {
    id: 'respira',
    icon: 'focus',
    title: 'Respiração curta',
    text: 'Respirar por um minuto antes de estudar pode ajudar a reduzir a agitação e facilitar o começo.',
  },
  {
    id: 'pausa',
    icon: 'plan',
    title: 'Pausas conscientes',
    text: 'Pausas curtas e conscientes podem sustentar melhor o foco ao longo do dia de estudo.',
  },
  {
    id: 'ambiente',
    icon: 'study',
    title: 'Ambiente pronto',
    text: 'Organizar o ambiente reduz o atrito para começar a estudar e evita distrações desnecessárias.',
  },
  {
    id: 'agua',
    icon: 'focus',
    title: 'Hidratação e ritmo',
    text: 'Hidratação e descanso ajudam a manter atenção e regularidade nas sessões de estudo.',
  },
  {
    id: 'fecho',
    icon: 'plan',
    title: 'Fechar o dia',
    text: 'Fechar bem o dia e deixar o próximo passo claro ajuda a voltar com mais leveza amanhã.',
  },
  {
    id: 'constancia',
    icon: 'evolution',
    title: 'Constância real',
    text: 'Constância não é nunca falhar. É voltar. Pequenas ações mantêm sua preparação viva.',
  },
]);

export const PRODUCTIVE_RITUAL = Object.freeze([
  { step: 1, text: 'Respire por 1 minuto, sem pressa.' },
  { step: 2, text: 'Beba um copo d’água.' },
  { step: 3, text: 'Organize a mesa ou o espaço de estudo.' },
  { step: 4, text: 'Defina a primeira tarefa pequena do dia.' },
  { step: 5, text: 'Comece leve — 5 a 15 minutos bastam para entrar em movimento.' },
]);

export const HARD_DAY_RITUAL = Object.freeze([
  { step: 1, text: 'Faça apenas a versão mínima do dia.' },
  { step: 2, text: 'Reduza a carga sem culpa — isso também é estratégia.' },
  { step: 3, text: 'Mantenha um microcompromisso (5–10 min ou 1 hábito).' },
  { step: 4, text: 'Se precisar, pause e proteja o amanhã.' },
  { step: 5, text: 'Preserve o movimento: o importante é não se desconectar.' },
]);

/** Rótulos humanos para hábitos do seed (sem recriar o modelo de dados). */
export const HABIT_PRESENTATION = Object.freeze({
  wb_agua: {
    title: 'Beber água',
    blurb: 'Um copo agora ajuda a manter o ritmo do dia.',
    actionLabel: 'Registrei um copo',
  },
  wb_exercicio: {
    title: 'Mover o corpo',
    blurb: 'Alguns minutos de movimento aliviam a tensão do estudo.',
    actionLabel: '+5 min',
  },
  wb_alimentacao: {
    title: 'Alimentação consciente',
    blurb: 'Uma refeição atenta sustenta energia para estudar.',
    actionLabel: 'Marcar como feito',
  },
  wb_meditacao: {
    title: 'Respirar / pausa',
    blurb: 'Um minuto de pausa pode clarear a mente antes das questões.',
    actionLabel: '+1 min de pausa',
  },
  wb_sono: {
    title: 'Descanso e sono',
    blurb: 'Fechar o dia com clareza protege a constância de amanhã.',
    actionLabel: 'Registrar horas',
  },
});

export function pickMessage(pool, seed = Date.now()) {
  const list = Array.isArray(pool) && pool.length ? pool : DAY_MESSAGES.inicio;
  const idx = Math.abs(Number(seed) || 0) % list.length;
  return list[idx];
}

/** Mensagem do dia por horário local (sem backend). */
export function messageForNow(date = new Date()) {
  const h = date.getHours();
  const daySeed = Number(date.toISOString().slice(0, 10).replace(/-/g, ''));
  if (h < 6) return pickMessage(DAY_MESSAGES.encerramento, daySeed + h);
  if (h < 12) return pickMessage(DAY_MESSAGES.inicio, daySeed + h);
  if (h < 18) return pickMessage(DAY_MESSAGES.constancia, daySeed + h);
  if (h < 22) return pickMessage(DAY_MESSAGES.constancia, daySeed + 7 + h);
  return pickMessage(DAY_MESSAGES.encerramento, daySeed + h);
}

export function greetingForNow(date = new Date(), name = '') {
  const h = date.getHours();
  const who = name ? `, ${name.split(' ')[0]}` : '';
  if (h < 12) return `Bom dia${who}`;
  if (h < 18) return `Boa tarde${who}`;
  return `Boa noite${who}`;
}

export function progressHumanLabel(done, total) {
  if (!total) return 'Hoje sua base começa aqui';
  if (done <= 0) return '3 pequenas ações para fortalecer seu dia';
  if (done >= total) return 'Seu dia está em ritmo — base cuidada';
  if (done === 1) return 'Você já deu o primeiro passo de preparação';
  return `Você já concluiu ${done} práticas de preparação`;
}
