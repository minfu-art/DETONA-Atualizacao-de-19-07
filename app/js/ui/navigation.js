/**
 * Vocabulário visual da navegação.
 * Os IDs técnicos permanecem estáveis para não afetar rotas, dados ou restauração de sessão.
 */
export const PRIMARY_NAV_ITEMS = Object.freeze([
  { screen: 'home', icon: 'home', label: 'Hoje' },
  { screen: 'map', icon: 'book', label: 'Estudar' },
  { screen: 'edital', icon: 'clipboard', label: 'Edital' },
  { screen: 'expedition', icon: 'calendar', label: 'Plano' },
  { screen: 'performance', icon: 'chartSteps', label: 'Evolução' },
]);

export const UTILITY_NAV_ITEMS = Object.freeze([
  { screen: 'wellbeing', icon: 'seedling', label: 'Preparação' },
]);

export const SCREEN_TITLES = Object.freeze({
  library: 'Biblioteca',
  ...Object.fromEntries(PRIMARY_NAV_ITEMS.map(({ screen, label }) => [screen, label])),
  topicTree: 'Estudar',
  battle: 'Questões',
  review: 'Revisão',
  forge: 'Banco de questões',
  wellbeing: 'Preparação',
  profile: 'Meu perfil',
  onboarding: 'Configuração inicial',
  celebration: 'Evolução',
});

const PRIMARY_ROUTE_ALIASES = Object.freeze({
  topicTree: 'map',
  battle: 'map',
  review: 'map',
  celebration: 'performance',
});

export function primaryScreenFor(screen) {
  return PRIMARY_ROUTE_ALIASES[screen] || screen;
}
