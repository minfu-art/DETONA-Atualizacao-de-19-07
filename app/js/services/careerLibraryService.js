export const CAREER_AREA_ORDER = Object.freeze([
  'police_security',
  'courts_legal',
  'administrative',
  'fiscal_control',
  'health_education',
  'armed_forces',
]);

export const CAREER_AREAS = Object.freeze({
  police_security: {
    id: 'police_security',
    name: 'Segurança Pública',
    filterLabel: 'Segurança Pública',
    description: 'Polícias, perícia, segurança e carreiras relacionadas.',
    art: 'assets/library/areas/security.webp',
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
    name: 'Administrativa',
    filterLabel: 'Administrativa',
    description: 'Cargos de apoio, gestão, atendimento e funcionamento dos órgãos públicos.',
    art: 'assets/library/areas/administrative.webp',
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
    name: 'Fiscal e Controle',
    filterLabel: 'Fiscal e Controle',
    description: 'Carreiras de arrecadação, fiscalização, orçamento e controle dos recursos públicos.',
    art: 'assets/library/areas/fiscal-control.webp',
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
    name: 'Tribunais e Jurídica',
    filterLabel: 'Tribunais e Jurídica',
    description: 'Cargos técnicos, administrativos e jurídicos do sistema de Justiça.',
    art: 'assets/library/areas/judiciary.webp',
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
    name: 'Educação e Saúde',
    filterLabel: 'Educação e Saúde',
    description: 'Carreiras públicas voltadas ao cuidado, ensino, ciência e desenvolvimento social.',
    art: 'assets/library/areas/education-health.webp',
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
    name: 'Militar e Defesa',
    filterLabel: 'Militar e Defesa',
    description: 'Concursos e escolas de formação do Exército, Aeronáutica e Marinha.',
    art: 'assets/library/areas/military.webp',
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

const KNOWN_CONTEST_AREA_BY_ID = Object.freeze({
  pc_al_2026: 'police_security',
  pf_2026: 'police_security',
  prf_2026: 'police_security',
  pp_rn_2026: 'police_security',
  pp_pe_2027: 'police_security',
});

const normalizeSearch = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .trim();

export function normalizeCareerArea(value) {
  return CAREER_AREA_ORDER.includes(value) ? value : 'other';
}

export function resolveContestArea(contest = {}) {
  const metadata = contest.metadata && typeof contest.metadata === 'object' ? contest.metadata : {};
  const explicitCandidates = [
    metadata.careerArea,
    metadata.career_area,
    contest.careerArea,
    contest.career_area,
  ];
  const explicit = explicitCandidates.find((value) => CAREER_AREA_ORDER.includes(value));
  if (explicit) return explicit;
  return KNOWN_CONTEST_AREA_BY_ID[String(contest.id || '').toLocaleLowerCase('pt-BR')] || 'other';
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
    const careerArea = resolveContestArea(contest);
    if (area !== 'all' && careerArea !== area) return false;
    if (!needle) return true;
    const areaInfo = getCareerArea(careerArea);
    const subarea = getCareerSubareaLabel(careerArea, contest.careerSubarea);
    const metadata = contest.metadata && typeof contest.metadata === 'object' ? contest.metadata : {};
    return normalizeSearch([
      contest.name,
      contest.code,
      contest.organization,
      contest.role,
      contest.examBoard,
      contest.exam_board,
      contest.board,
      contest.banca,
      metadata.examBoard,
      metadata.exam_board,
      metadata.banca,
      areaInfo.name,
      areaInfo.filterLabel,
      subarea,
    ].join(' ')).includes(needle);
  });
}

export function groupLibraryItems(items) {
  const grouped = new Map();
  for (const areaId of [...CAREER_AREA_ORDER, 'other']) grouped.set(areaId, []);
  for (const item of items) grouped.get(resolveContestArea(item.contest)).push(item);
  return grouped;
}

export function countLibraryItemsByArea(items) {
  const counts = Object.fromEntries([...CAREER_AREA_ORDER, 'other'].map((areaId) => [areaId, 0]));
  for (const { contest } of items) counts[resolveContestArea(contest)] += 1;
  return counts;
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
