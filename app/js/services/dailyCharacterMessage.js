export const DAILY_CHARACTER_CATALOG = Object.freeze({
  cleric: Object.freeze({
    id: 'cleric',
    name: 'Clériga da Constância',
    image: 'assets/mentor/mentora.png?v1',
    theme: 'Acolhimento, esperança, motivação e retomada.',
  }),
  strategist: Object.freeze({
    id: 'strategist',
    name: 'Estrategista',
    image: 'assets/ui/plan-planner-female.jpg',
    theme: 'Planejamento, foco, priorização e método.',
  }),
  warrior: Object.freeze({
    id: 'warrior',
    name: 'Guerreiro da Disciplina',
    image: 'assets/hero/hero-warrior.png',
    theme: 'Esforço, atitude, coragem e superação.',
  }),
  master: Object.freeze({
    id: 'master',
    name: 'Mestre do Conhecimento',
    image: 'assets/mentor/mentor.png?v1',
    theme: 'Aprendizado, paciência, prática e evolução.',
  }),
});

const messages = [
  ['cleric', 'Um passo ainda conta', 'Você não precisa vencer tudo hoje. Precisa apenas não abandonar a batalha.', 'start', 'Começar o dia', 'home'],
  ['cleric', 'Recomeçar é avançar', 'Uma pausa não apaga sua jornada. Voltar hoje já é uma vitória sobre a desistência.', 'routine', 'Abrir rotina', 'expedition'],
  ['cleric', 'Proteja sua esperança', 'A aprovação também é construída nos dias em que você escolhe continuar com calma.', 'journey', 'Ver minha jornada', 'performance'],
  ['cleric', 'Constância silenciosa', 'Pequenos esforços repetidos criam resultados que um dia pareciam impossíveis.', 'study', 'Continuar estudando', 'edital'],
  ['cleric', 'Respeite seu ritmo', 'Disciplina não é se destruir estudando. É retornar ao compromisso com equilíbrio.', 'routine', 'Abrir rotina', 'expedition'],
  ['cleric', 'Hoje basta começar', 'Quando a tarefa parecer grande, reduza o passo, respire e conclua a primeira parte.', 'start', 'Começar o dia', 'home'],
  ['cleric', 'Sua jornada permanece', 'Um resultado ruim não define você. Ele apenas mostra onde sua força será construída.', 'journey', 'Ver minha jornada', 'performance'],

  ['strategist', 'Escolha o alvo', 'O plano perfeito vale menos que uma tarefa realmente concluída com atenção.', 'study', 'Continuar estudando', 'edital'],
  ['strategist', 'Prioridade vence pressa', 'Faça primeiro o que mais aproxima você da aprovação, não o que parece mais fácil.', 'routine', 'Abrir rotina', 'expedition'],
  ['strategist', 'Método antes de volume', 'Uma sessão com objetivo claro produz mais que horas de estudo sem direção.', 'start', 'Começar o dia', 'home'],
  ['strategist', 'Reduza o campo de batalha', 'Escolha uma matéria, um tópico e uma entrega. Depois avance para o próximo alvo.', 'study', 'Continuar estudando', 'edital'],
  ['strategist', 'Planeje o possível', 'Uma rotina sustentável protege sua constância e transforma intenção em execução.', 'routine', 'Abrir rotina', 'expedition'],
  ['strategist', 'Observe para ajustar', 'Seu progresso mostra o que manter, o que reduzir e onde concentrar a próxima ação.', 'journey', 'Ver minha jornada', 'performance'],
  ['strategist', 'Feche ciclos', 'Antes de abrir outra frente, conclua uma tarefa importante e registre esse avanço.', 'start', 'Começar o dia', 'home'],

  ['warrior', 'Entre em ação', 'Coragem não elimina a dificuldade. Ela faz você começar apesar dela.', 'start', 'Começar o dia', 'home'],
  ['warrior', 'Disciplina em movimento', 'A motivação oscila, mas uma ação concluída mantém sua jornada avançando.', 'study', 'Continuar estudando', 'edital'],
  ['warrior', 'Resista ao primeiro impulso', 'Quando pensar em parar, permaneça por mais alguns minutos e termine o bloco.', 'study', 'Continuar estudando', 'edital'],
  ['warrior', 'Transforme esforço em prova', 'Cada questão enfrentada hoje prepara sua mente para decidir melhor no dia da prova.', 'start', 'Começar o dia', 'home'],
  ['warrior', 'Supere a versão anterior', 'Seu adversário de hoje é apenas o limite que você aceitou ontem.', 'journey', 'Ver minha jornada', 'performance'],
  ['warrior', 'Faça o combinado', 'Disciplina é cumprir o compromisso mesmo quando ninguém está observando.', 'routine', 'Abrir rotina', 'expedition'],
  ['warrior', 'A batalha é diária', 'Você não controla a dificuldade da prova, mas controla a preparação que leva até ela.', 'study', 'Continuar estudando', 'edital'],

  ['master', 'Aprender exige retorno', 'O conhecimento cresce toda vez que você retorna ao que ainda não dominou.', 'study', 'Continuar estudando', 'edital'],
  ['master', 'Erro também ensina', 'Uma resposta errada, quando compreendida, vale mais que um acerto por acaso.', 'study', 'Continuar estudando', 'edital'],
  ['master', 'Pratique com intenção', 'Não procure apenas terminar questões. Procure entender por que cada alternativa existe.', 'start', 'Começar o dia', 'home'],
  ['master', 'Paciência constrói domínio', 'O conteúdo difícil se torna familiar quando você o visita com método e frequência.', 'routine', 'Abrir rotina', 'expedition'],
  ['master', 'Explique para aprender', 'Se você consegue ensinar a ideia com palavras simples, começou a dominá-la de verdade.', 'study', 'Continuar estudando', 'edital'],
  ['master', 'Conhecimento conectado', 'Cada conceito compreendido fortalece outros pontos do edital e melhora suas decisões.', 'journey', 'Ver minha jornada', 'performance'],
  ['master', 'Evolução consciente', 'Compare-se com o que sabia ontem e use essa diferença para orientar o próximo passo.', 'journey', 'Ver minha jornada', 'performance'],
];

export const DAILY_CHARACTER_MESSAGES = Object.freeze(messages.map(([
  characterId,
  title,
  text,
  type,
  actionLabel,
  route,
], index) => Object.freeze({
  id: `daily-character-${String(index + 1).padStart(2, '0')}`,
  characterId,
  title,
  text,
  type,
  actionLabel,
  route,
})));

export function localDateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Data inválida para mensagem diária.');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function localDayNumber(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function dailyCharacterMessage({
  date = new Date(),
  contestId = 'detona',
  userId = 'guest',
} = {}) {
  const dateKey = localDateKey(date);
  const identityOffset = stableHash(`${contestId || 'detona'}|${userId || 'guest'}`);
  const index = (localDayNumber(dateKey) + identityOffset) % DAILY_CHARACTER_MESSAGES.length;
  const selected = DAILY_CHARACTER_MESSAGES[index];
  const character = DAILY_CHARACTER_CATALOG[selected.characterId];

  return Object.freeze({
    id: `${selected.id}:${dateKey}:${contestId || 'detona'}`,
    category: character.id,
    character,
    title: selected.title,
    text: selected.text,
    message: selected.text,
    type: selected.type,
    priority: 'normal',
    actionType: 'navigate',
    actionValue: selected.route,
    actionLabel: selected.actionLabel,
    route: selected.route,
    dateKey,
    contestId: contestId || null,
  });
}
