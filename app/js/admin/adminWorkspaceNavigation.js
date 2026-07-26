export const CONTEST_WORKSPACE_TABS = Object.freeze([
  Object.freeze({ screen: 'contests', module: 'general', label: 'Geral' }),
  Object.freeze({ screen: 'curriculum', module: 'curriculum', label: 'Currículo' }),
  Object.freeze({ screen: 'questions', module: 'questions', label: 'Questões' }),
  Object.freeze({ screen: 'media', module: 'appearance', label: 'Aparência' }),
  Object.freeze({ screen: 'students', module: 'students', label: 'Alunos' }),
  Object.freeze({ screen: 'publication', module: 'publication', label: 'Publicação' }),
]);

const MODULE_BY_SCREEN = Object.freeze({
  overview: 'overview',
  messages: 'messages',
  settings: 'settings',
  audit: 'audit',
  landing: 'landing',
  ...Object.fromEntries(CONTEST_WORKSPACE_TABS.map(({ screen, module }) => [screen, module])),
});

const SCREEN_BY_MODULE = Object.freeze(
  Object.fromEntries(Object.entries(MODULE_BY_SCREEN).map(([screen, module]) => [module, screen])),
);

export function moduleFromScreen(screen) {
  return MODULE_BY_SCREEN[screen] || 'overview';
}

export function screenFromModule(module) {
  return SCREEN_BY_MODULE[module] || 'overview';
}

export function resolveAdminRoute(locationLike, contests = [], defaults = {}) {
  const params = new URLSearchParams(locationLike?.search || '');
  const requestedContestId = params.get('contest');
  const contestId = contests.some(({ id }) => id === requestedContestId)
    ? requestedContestId
    : defaults.contestId || contests[0]?.id || null;
  const requestedModule = params.get('module');
  const screen = requestedModule && SCREEN_BY_MODULE[requestedModule]
    ? SCREEN_BY_MODULE[requestedModule]
    : defaults.screen || 'overview';
  return { contestId, screen };
}

export function buildAdminRouteUrl(locationLike, { contestId, screen }) {
  const url = new URL(locationLike?.href || 'https://admin.local/admin.html');
  if (contestId) url.searchParams.set('contest', contestId);
  else url.searchParams.delete('contest');
  url.searchParams.set('module', moduleFromScreen(screen));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function adjacentWorkspaceScreen(screen, direction) {
  const index = CONTEST_WORKSPACE_TABS.findIndex((tab) => tab.screen === screen);
  if (index < 0) return null;
  return CONTEST_WORKSPACE_TABS[index + direction]?.screen || null;
}
