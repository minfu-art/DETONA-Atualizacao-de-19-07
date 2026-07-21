/** Frases motivacionais DETONA: energia alta, ação acadêmica sempre explícita. */
export const PHRASES_NORMAL = [
  'Cada questão respondida aproxima você da aprovação.',
  'Missão do dia: avançar com clareza e constância.',
  'O edital fica menor quando o estudo vira rotina.',
  'Errou? Entenda o motivo, revise e tente novamente.',
  'A força da preparação está no que você repete todos os dias.',
  'Comece pelo ponto mais fraco e transforme-o em vantagem.',
  'Dez questões bem analisadas já mantêm sua evolução ativa.',
  'Teoria, revisão e questões: execute o próximo passo.',
  'Sua sequência mostra compromisso, não perfeição.',
  'A prova cobra clareza. Treine com foco.',
  'Cada acerto confirma domínio; cada erro aponta o próximo estudo.',
  'O mapa está aberto. Escolha um subtópico e avance.',
  'Revise antes que o conteúdo perca força na memória.',
  'Conhecimento cresce com disciplina, não com sorte.',
  'Respire. Foque. Responda. Aprenda.',
  'A aprovação é construída em sessões consistentes.',
  'Hoje não precisa ser perfeito. Precisa ser executado.',
  'Use seus dados: fortaleça o que ainda limita seu desempenho.',
  'Seu progresso é real quando o edital e os acertos avançam.',
  'Continue. A constância de hoje reduz a pressão de amanhã.',
];

export const PHRASES_ENDGAME = [
  'Edital dominado. Agora mantenha a memória ativa.',
  'Continue revisando os conteúdos que perderam força.',
  'A reta final exige precisão, não excesso.',
  'Preserve o domínio com revisões e questões selecionadas.',
  'Preparação avançada: mantenha constância e controle.',
  'O progresso chegou longe. Continue protegendo o que conquistou.',
];

export function randomPhrase(endgame = false) {
  const pool = endgame ? PHRASES_ENDGAME : PHRASES_NORMAL;
  return pool[Math.floor(Math.random() * pool.length)];
}
