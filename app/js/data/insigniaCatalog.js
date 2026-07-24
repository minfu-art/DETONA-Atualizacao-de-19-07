import { getConsistencyThresholds } from './emblemCatalog.js';

export const INSIGNIA_CATEGORIES = Object.freeze([
  { id: 'journey', name: 'Jornada / XP', description: 'Sua energia e esforço acumulados na jornada.' },
  { id: 'consistency', name: 'Constância', description: 'A chama do hábito cresce com sua melhor sequência.' },
  { id: 'missions', name: 'Missões', description: 'Seu brasão evolui a cada batalha oficial concluída.' },
  { id: 'focus', name: 'Foco / Metas', description: 'Precisão construída em dias únicos de meta cumprida.' },
  { id: 'domain', name: 'Domínio', description: 'Conhecimento conquistado em subtópicos dominados.' },
]);

const STATIC_TIERS = Object.freeze({
  journey: [
    [0, 'Fragmento de Jornada', 'O primeiro fragmento da sua energia.'],
    [500, 'Selo de Jornada', 'A jornada começa a ganhar forma.'],
    [2000, 'Núcleo de Energia', 'Um núcleo sólido de esforço acumulado.'],
    [5000, 'Emblema de Ascensão', 'Energia suficiente para uma nova forma.'],
    [10000, 'Relíquia de Jornada', 'A forma lendária da sua jornada.'],
  ],
  missions: [
    [1, 'Primeiro Golpe', 'Conclua sua primeira batalha oficial.'],
    [10, 'Combatente', 'Conclua 10 batalhas oficiais únicas.'],
    [25, 'Caçador de Editais', 'Conclua 25 batalhas oficiais únicas.'],
    [50, 'Guerreiro Constante', 'Conclua 50 batalhas oficiais únicas.'],
    [100, 'Veterano', 'Conclua 100 batalhas oficiais únicas.'],
    [250, 'Mestre de Batalhas', 'Conclua 250 batalhas oficiais únicas.'],
    [500, 'Lenda das Missões', 'Conclua 500 batalhas oficiais únicas.'],
  ],
  focus: [
    [3, 'Ritmo Inicial', 'Cumpra a meta diária em 3 datas únicas.'],
    [7, 'Semana no Controle', 'Cumpra a meta diária em 7 datas únicas.'],
    [15, 'Foco Crescente', 'Cumpra a meta diária em 15 datas únicas.'],
    [30, 'Disciplina Forjada', 'Cumpra a meta diária em 30 datas únicas.'],
    [60, 'Constância de Elite', 'Cumpra a meta diária em 60 datas únicas.'],
    [100, 'Mestre da Execução', 'Cumpra a meta diária em 100 datas únicas.'],
  ],
  domain: [
    [1, 'Primeiro Domínio', 'Domine 1 subtópico em 100%.'],
    [5, 'Especialista Iniciante', 'Domine 5 subtópicos em 100%.'],
    [10, 'Dominador de Conteúdo', 'Domine 10 subtópicos em 100%.'],
    [25, 'Mestre do Edital', 'Domine 25 subtópicos em 100%.'],
    [50, 'Elite do Conhecimento', 'Domine 50 subtópicos em 100%.'],
    ['all', 'Edital Detonado', 'Domine todo o edital e conclua as três esferas.'],
  ],
});

const CONSISTENCY_NAMES = [
  'Faísca',
  'Chama Inicial',
  'Chama Ativa',
  'Tocha da Disciplina',
  'Fogo Inabalável',
  'Chama Suprema',
];

function assetFor(category, tier) {
  return `assets/insignias/${category}-tier-${String(tier).padStart(2, '0')}.webp`;
}

function normalizeConsistencyThresholds(daysUntilExam) {
  const thresholds = getConsistencyThresholds(daysUntilExam ?? 120);
  if (thresholds.length <= 6) return thresholds;
  return [...thresholds.slice(0, 5), thresholds.at(-1)];
}

export function buildInsigniaTiers(category, contestContext = {}) {
  const entries = category === 'consistency'
    ? normalizeConsistencyThresholds(contestContext.daysUntilExam).map((threshold, index) => [
      threshold,
      CONSISTENCY_NAMES[index],
      `Mantenha sua melhor sequência por ${threshold} dias.`,
    ])
    : STATIC_TIERS[category] || [];

  return entries.map(([threshold, name, description], index) => ({
    id: `${category}_tier_${index + 1}`,
    category,
    tier: index + 1,
    threshold,
    name,
    description,
    criterion: threshold === 'all'
      ? 'Todo o edital com domínio, teoria, revisão e esferas concluídas'
      : category === 'journey'
        ? `${Number(threshold).toLocaleString('pt-BR')} XP total`
        : category === 'consistency'
          ? `${threshold} dias de melhor sequência`
          : category === 'missions'
            ? `${threshold} batalhas oficiais únicas`
            : category === 'focus'
              ? `${threshold} metas diárias em datas únicas`
              : `${threshold} subtópicos em 100%`,
    asset: assetFor(category, index + 1),
  }));
}

function metricFor(category, metrics) {
  return Number(metrics?.[category]) || 0;
}

function tierIsAchieved(tier, metrics) {
  if (tier.category === 'domain' && tier.threshold === 'all') return Number(metrics?.domainAll) >= 1;
  return metricFor(tier.category, metrics) >= Number(tier.threshold);
}

export function getJourneyInsigniaTier(xpTotal) {
  const progress = getCurrentInsigniaProgress('journey', { journey: Number(xpTotal) || 0 });
  return progress.currentTier;
}

export function getCurrentInsigniaProgress(category, metrics = {}, contestContext = {}) {
  const tiers = buildInsigniaTiers(category, contestContext);
  if (!tiers.length) {
    const fallback = {
      id: `${category}_tier_1`,
      category,
      tier: 1,
      threshold: null,
      name: CONSISTENCY_NAMES[0],
      description: 'A reta final da prova já começou.',
      criterion: 'Continue estudando até a prova',
      asset: assetFor(category, 1),
    };
    return {
      category,
      currentTier: 1,
      currentInsignia: { ...fallback, state: 'current' },
      progressValue: metricFor(category, metrics),
      nextThreshold: null,
      unlockedTiers: [],
      lockedTiers: [],
      tiers: [{ ...fallback, state: 'current' }],
    };
  }

  const achieved = tiers.map((tier) => tierIsAchieved(tier, metrics));
  let currentIndex = achieved.reduce((last, value, index) => value ? index : last, -1);
  if (currentIndex < 0) currentIndex = 0;
  const decorated = tiers.map((tier, index) => ({
    ...tier,
    state: index < currentIndex ? 'earned' : index === currentIndex ? 'current' : 'locked',
    achieved: achieved[index],
  }));
  const currentInsignia = decorated[currentIndex];
  const next = achieved[currentIndex] ? decorated[currentIndex + 1] : currentInsignia;
  return {
    category,
    currentTier: currentIndex + 1,
    currentInsignia,
    progressValue: metricFor(category, metrics),
    nextThreshold: next?.threshold ?? null,
    unlockedTiers: decorated.filter((tier) => tier.state === 'earned'),
    lockedTiers: decorated.filter((tier) => tier.state === 'locked'),
    tiers: decorated,
  };
}

