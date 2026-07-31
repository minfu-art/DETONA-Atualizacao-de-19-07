/**
 * Fonte única de verdade da navegação do aluno.
 * Os IDs técnicos permanecem estáveis para preservar rotas, dados e restauração de sessão.
 */
export const NAVIGATION_GROUPS = Object.freeze([
  { id: 'contest', label: 'Concurso', order: 1 },
  { id: 'journey', label: 'Jornada', order: 2 },
  { id: 'evolution', label: 'Evolução', order: 3 },
  { id: 'account', label: 'Conta', order: 4 },
]);

const items = [
  { screen: 'library', label: 'Biblioteca', icon: 'book', group: 'contest', theme: 'library', desktop: true, mobileSecondary: true, mobileGroup: 'content', pageTitle: 'Biblioteca', ariaLabel: 'Abrir Biblioteca', order: 10 },
  { screen: 'home', label: 'Hoje', icon: 'home', group: 'journey', theme: 'today', desktop: true, mobilePrimary: true, pageTitle: 'Hoje', ariaLabel: 'Abrir Hoje', order: 20 },
  { screen: 'map', label: 'Estudar', icon: 'book', group: 'journey', theme: 'study', desktop: true, mobilePrimary: true, pageTitle: 'Estudar', ariaLabel: 'Abrir Estudar', order: 30 },
  { screen: 'edital', label: 'Edital', icon: 'clipboard', group: 'journey', theme: 'study', desktop: true, mobilePrimary: true, pageTitle: 'Edital', ariaLabel: 'Abrir Edital verticalizado', order: 40 },
  { screen: 'expedition', label: 'Plano', icon: 'calendar', group: 'journey', theme: 'plan', desktop: true, mobilePrimary: true, pageTitle: 'Plano', ariaLabel: 'Abrir Plano', order: 50 },
  { screen: 'performance', label: 'Desempenho', icon: 'chartSteps', group: 'evolution', theme: 'performance', desktop: true, mobileSecondary: true, mobileGroup: 'tracking', pageTitle: 'Desempenho', ariaLabel: 'Abrir Desempenho', order: 60 },
  { screen: 'wellbeing', label: 'Hábitos', icon: 'heartPulse', group: 'evolution', theme: 'habits', desktop: true, mobileSecondary: true, mobileGroup: 'tracking', pageTitle: 'Hábitos', ariaLabel: 'Abrir Hábitos', order: 70 },
  { screen: 'rankedEvent', label: 'Simulados', icon: 'trophy', group: 'evolution', theme: 'ranked', desktop: true, mobileSecondary: true, mobileGroup: 'tracking', pageTitle: 'Simulados', ariaLabel: 'Abrir Simulados', order: 80 },
  { screen: 'profile', label: 'Perfil', icon: 'user', group: 'account', theme: 'profile', desktop: true, mobileSecondary: true, mobileGroup: 'content', pageTitle: 'Perfil', ariaLabel: 'Abrir Perfil', order: 90 },
  { screen: 'more', label: 'Mais', icon: 'menu', group: 'mobile', theme: 'today', desktop: false, mobilePrimary: true, kind: 'menu', pageTitle: 'Mais opções', ariaLabel: 'Abrir Mais opções', order: 100 },
];

export const NAVIGATION_ITEMS = Object.freeze(items.map((item) => Object.freeze(item)));

export const MOBILE_MORE_GROUPS = Object.freeze([
  { id: 'tracking', label: 'Acompanhar', order: 1 },
  { id: 'content', label: 'Conta e conteúdo', order: 2 },
]);

export const DESKTOP_NAVIGATION_GROUPS = Object.freeze(NAVIGATION_GROUPS.map((group) => Object.freeze({
  ...group,
  items: Object.freeze(NAVIGATION_ITEMS.filter((item) => item.desktop && item.group === group.id).sort((a, b) => a.order - b.order)),
})).filter((group) => group.items.length));

export const MOBILE_PRIMARY_ITEMS = Object.freeze(NAVIGATION_ITEMS
  .filter((item) => item.mobilePrimary)
  .sort((a, b) => a.order - b.order));

export const MOBILE_MORE_NAVIGATION_GROUPS = Object.freeze(MOBILE_MORE_GROUPS.map((group) => Object.freeze({
  ...group,
  items: Object.freeze(NAVIGATION_ITEMS.filter((item) => item.mobileSecondary && item.mobileGroup === group.id).sort((a, b) => a.order - b.order)),
})));

const ROUTE_ALIASES = Object.freeze({
  topicTree: 'map',
  battle: 'map',
  review: 'map',
  grimorio: 'performance',
  celebration: 'performance',
});

const THEME_ALIASES = Object.freeze({
  topicTree: 'study',
  battle: 'battle',
  review: 'study',
  grimorio: 'performance',
  celebration: 'performance',
  onboarding: 'study',
});

const TITLE_ALIASES = Object.freeze({
  topicTree: 'Estudar',
  battle: 'Questões',
  review: 'Revisão',
  grimorio: 'Desempenho',
  onboarding: 'Configuração inicial',
  celebration: 'Evolução',
});

const itemByScreen = new Map(NAVIGATION_ITEMS.map((item) => [item.screen, item]));
const secondaryScreens = new Set(NAVIGATION_ITEMS.filter((item) => item.mobileSecondary).map((item) => item.screen));
const shellHiddenScreens = new Set(['onboarding', 'celebration']);

export function navigationItemFor(screen) {
  return itemByScreen.get(primaryScreenFor(screen)) || null;
}

export function primaryScreenFor(screen) {
  return ROUTE_ALIASES[screen] || screen;
}

export function themeForScreen(screen) {
  return THEME_ALIASES[screen] || navigationItemFor(screen)?.theme || 'study';
}

export function titleForScreen(screen) {
  return TITLE_ALIASES[screen] || navigationItemFor(screen)?.pageTitle || 'Detona Concursos';
}

export function isMobileSecondaryScreen(screen) {
  return secondaryScreens.has(primaryScreenFor(screen));
}

export function isBottomNavigationVisible(screen) {
  return !shellHiddenScreens.has(screen);
}
