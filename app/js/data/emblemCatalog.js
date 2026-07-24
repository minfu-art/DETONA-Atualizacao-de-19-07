export const EMBLEM_CATEGORIES = Object.freeze([
  { id: 'missions', name: 'Missões', description: 'Batalhas oficiais concluídas.' },
  { id: 'focus', name: 'Foco', description: 'Metas diárias cumpridas.' },
  { id: 'consistency', name: 'Constância', description: 'Melhor sequência de estudos.' },
  { id: 'domain', name: 'Domínio', description: 'Subtópicos dominados por completo.' },
]);

const SERIES = Object.freeze({
  missions: [
    [1, 'Primeiro Golpe'], [10, 'Combatente'], [25, 'Caçador de Editais'],
    [50, 'Guerreiro Constante'], [100, 'Veterano'], [250, 'Mestre de Batalhas'],
    [500, 'Lenda das Missões'],
  ],
  focus: [
    [3, 'Ritmo Inicial'], [7, 'Semana no Controle'], [15, 'Foco Crescente'],
    [30, 'Disciplina Forjada'], [60, 'Constância de Elite'], [100, 'Mestre da Execução'],
  ],
  domain: [
    [1, 'Primeiro Domínio'], [5, 'Especialista Iniciante'], [10, 'Dominador de Conteúdo'],
    [25, 'Mestre do Edital'], [50, 'Elite do Conhecimento'],
  ],
});

const CONSISTENCY_TITLES = Object.freeze({
  3: 'Faísca',
  7: 'Chama Inicial',
  14: 'Ritmo Ativo',
  30: 'Constância Forjada',
  60: 'Foco Inabalável',
  90: 'Elite da Constância',
  120: 'Lenda da Reta Final',
});

export function getConsistencyThresholds(daysUntilExam) {
  const remaining = Math.max(0, Math.min(120, Math.floor(Number(daysUntilExam) || 0)));
  return [3, 7, 14, 30, 60, 90, 120].filter((value) => value <= remaining);
}

function seriesEmblems(category, unit, entries) {
  return entries.map(([threshold, name], index) => ({
    id: `${category}_${threshold}`,
    category,
    name,
    description: `Alcance ${threshold} ${unit}.`,
    criterion: `${threshold} ${unit}`,
    metric: category,
    threshold,
    rarity: index,
  }));
}

export function buildEmblemCatalog(daysUntilExam) {
  const consistency = getConsistencyThresholds(daysUntilExam).map((threshold, index) => ({
    id: `consistency_${threshold}`,
    category: 'consistency',
    name: CONSISTENCY_TITLES[threshold] || 'Marco da Reta Final',
    description: `Mantenha sua melhor sequência por ${threshold} dias.`,
    criterion: `${threshold} dias consecutivos`,
    metric: 'consistency',
    threshold,
    rarity: index,
  }));

  return [
    ...seriesEmblems('missions', 'missões oficiais', SERIES.missions),
    ...seriesEmblems('focus', 'metas diárias', SERIES.focus),
    ...consistency,
    ...seriesEmblems('domain', 'subtópicos em 100%', SERIES.domain),
    {
      id: 'domain_all',
      category: 'domain',
      name: 'Edital Detonado',
      description: 'Domine todos os subtópicos e conclua teoria, revisão e combate.',
      criterion: 'Todo o edital com as três esferas concluídas',
      metric: 'domainAll',
      threshold: 1,
      rarity: 99,
    },
  ];
}
