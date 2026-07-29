export const CAREER_AREA_ORDER = Object.freeze([
  'police_security',
  'administrative',
  'fiscal_control',
  'courts_legal',
  'health_education',
  'armed_forces',
]);

export const CAREER_AREAS = Object.freeze({
  police_security: {
    id: 'police_security',
    name: 'Área Policial e Segurança',
    filterLabel: 'Policial',
    description: 'Carreiras de investigação, patrulhamento, perícia, custódia e segurança pública.',
    art: 'assets/library/police-security.webp',
    subareas: {
      federal_police: 'Polícia Federal',
      federal_highway_police: 'Polícia Rodoviária Federal',
      civil_police: 'Polícia Civil',
      military_police: 'Polícia Militar',
      prison_police: 'Polícia Penal',
      municipal_guard: 'Guarda Municipal',
      criminal_forensics: 'Perícia Criminal',
      firefighters: 'Bombeiros',
    },
  },
  administrative: {
    id: 'administrative',
    name: 'Área Administrativa',
    filterLabel: 'Administrativa',
    description: 'Cargos de apoio, gestão, atendimento e funcionamento dos órgãos públicos.',
    art: 'assets/library/administrative.webp',
    subareas: {
      general_administration: 'Administração geral',
      social_security: 'Previdência',
      statistics_research: 'Estatística e pesquisa',
      municipalities: 'Prefeituras',
      universities: 'Universidades',
      public_agencies: 'Autarquias',
    },
  },
  fiscal_control: {
    id: 'fiscal_control',
    name: 'Área Fiscal e de Controle',
    filterLabel: 'Fiscal',
    description: 'Carreiras de arrecadação, fiscalização, orçamento e controle dos recursos públicos.',
    art: 'assets/library/fiscal-control.webp',
    subareas: {
      federal_revenue: 'Receita Federal',
      state_revenue: 'Sefaz',
      municipal_tax: 'Fiscal municipal',
      audit_courts: 'Tribunais de Contas',
      comptrollers: 'Controladorias',
    },
  },
  courts_legal: {
    id: 'courts_legal',
    name: 'Área de Tribunais e Jurídica',
    filterLabel: 'Tribunais',
    description: 'Cargos técnicos, administrativos e jurídicos do sistema de Justiça.',
    art: 'assets/library/courts-legal.webp',
    subareas: {
      state_courts: 'Tribunais de Justiça',
      federal_courts: 'Justiça Federal',
      labor_courts: 'Justiça do Trabalho',
      electoral_courts: 'Justiça Eleitoral',
      public_prosecution: 'Ministério Público',
      public_defense: 'Defensoria',
      attorneys_offices: 'Procuradorias',
      legal_careers: 'Carreiras jurídicas',
    },
  },
  health_education: {
    id: 'health_education',
    name: 'Área da Saúde e Educação',
    filterLabel: 'Saúde e Educação',
    description: 'Carreiras públicas voltadas ao cuidado, ensino, ciência e desenvolvimento social.',
    art: 'assets/library/health-education.webp',
    subareas: {
      health: 'Saúde',
      basic_education: 'Educação básica',
      technical_education: 'Ensino técnico',
      higher_education: 'Ensino superior',
      public_hospitals: 'Hospitais públicos',
      ebserh: 'Ebserh',
    },
  },
  armed_forces: {
    id: 'armed_forces',
    name: 'Área Militar — Forças Armadas',
    filterLabel: 'Militar',
    description: 'Concursos e escolas de formação do Exército, Aeronáutica e Marinha.',
    art: 'assets/library/armed-forces.webp',
    subareas: {
      army: 'Exército',
      air_force: 'Aeronáutica',
      navy: 'Marinha',
    },
  },
  other: {
    id: 'other',
    name: 'Outros concursos',
    filterLabel: 'Outros',
    description: 'Concursos que ainda aguardam classificação editorial por área.',
    art: null,
    subareas: {},
  },
});

const normalizeSearch = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .trim();

export function normalizeCareerArea(value) {
  return CAREER_AREA_ORDER.includes(value) ? value : 'other';
}

export function getCareerArea(value) {
  return CAREER_AREAS[normalizeCareerArea(value)];
}

export function getCareerSubareaLabel(areaId, subareaId) {
  if (!subareaId) return '';
  return getCareerArea(areaId).subareas[subareaId] || String(subareaId).replaceAll('_', ' ');
}

export function selectActiveJourney(items, activeContestId = null) {
  const eligible = items.filter(({ owned, contest }) => owned && contest.contentStatus === 'ready');
  const selected = eligible.find(({ contest }) => contest.id === activeContestId);
  if (selected) return selected;
  return eligible.sort((left, right) => {
    const leftDate = Date.parse(left.summary?.lastAccessAt || 0) || 0;
    const rightDate = Date.parse(right.summary?.lastAccessAt || 0) || 0;
    return rightDate - leftDate;
  })[0] || null;
}

export function filterLibraryItems(items, { area = 'all', search = '' } = {}) {
  const needle = normalizeSearch(search);
  return items.filter(({ contest }) => {
    const careerArea = normalizeCareerArea(contest.careerArea);
    if (area !== 'all' && careerArea !== area) return false;
    if (!needle) return true;
    const areaInfo = getCareerArea(careerArea);
    const subarea = getCareerSubareaLabel(careerArea, contest.careerSubarea);
    return normalizeSearch([
      contest.name,
      contest.code,
      contest.organization,
      contest.role,
      areaInfo.name,
      areaInfo.filterLabel,
      subarea,
    ].join(' ')).includes(needle);
  });
}

export function groupLibraryItems(items) {
  const grouped = new Map();
  for (const areaId of [...CAREER_AREA_ORDER, 'other']) grouped.set(areaId, []);
  for (const item of items) grouped.get(normalizeCareerArea(item.contest.careerArea)).push(item);
  return grouped;
}

export function summarizeArea(items) {
  return {
    total: items.length,
    active: items.filter(({ contest }) => contest.contentStatus === 'ready').length,
    preparing: items.filter(({ contest }) => contest.contentStatus !== 'ready').length,
  };
}

export function contestPrimaryAction(item) {
  if (item.owned && item.contest.contentStatus === 'ready') {
    return { label: item.summary ? 'Continuar jornada' : 'Começar jornada', action: 'open', disabled: false };
  }
  if (item.contest.contentStatus === 'ready') {
    return { label: 'Ver detalhes', action: 'details', disabled: false };
  }
  return { label: 'Em breve', action: 'none', disabled: true };
}
