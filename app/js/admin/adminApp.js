import { authService } from '../services/appServices.js';
import { isDeveloperUser } from '../auth/authService.js';
import { redirectForRole } from '../auth/roleRouting.js';
import { renderAuth } from '../ui/auth.js';
import { adminContext } from './adminContext.js';
import { mountAdminShell, updateAdminShell } from './adminShell.js';
import { renderAdminDashboard } from './adminDashboard.js';
import { renderAdminAccessScreen } from './adminAccessScreen.js';
import { renderAdminMessagesScreen } from './adminMessagesScreen.js';
import { renderAdminPreparedScreen } from './adminPreparedScreen.js';
import { renderAdminContestsScreen } from './adminContestsScreen.js';
import { renderAdminCurriculumScreen } from './adminCurriculumScreen.js';
import { renderAdminQuestionsScreen } from './adminQuestionsScreen.js';
import { renderAdminMediaScreen } from './adminMediaScreen.js';
import { renderAdminLandingScreen } from './adminLandingScreen.js';
import { renderAdminSettingsScreen } from './adminSettingsScreen.js';
import { renderAdminPublicationScreen } from './adminPublicationScreen.js';
import { adminContestService } from '../services/adminContestService.js';
import { buildAdminRouteUrl, resolveAdminRoute } from './adminWorkspaceNavigation.js';

const ROUTES = Object.freeze({
  overview: renderAdminDashboard,
  students: renderAdminAccessScreen,
  messages: renderAdminMessagesScreen,
  contests: renderAdminContestsScreen,
  curriculum: renderAdminCurriculumScreen,
  questions: renderAdminQuestionsScreen,
  media: renderAdminMediaScreen,
  landing: renderAdminLandingScreen,
  settings: renderAdminSettingsScreen,
  publication: renderAdminPublicationScreen,
});

const UNSAVED_MESSAGE = 'Existem alterações não salvas. Deseja sair desta etapa e descartá-las?';
let shellMounted = false;
let hasUnsavedChanges = false;
let currentRouteUrl = '';

function markSaved() {
  hasUnsavedChanges = false;
}

function canLeaveCurrentScreen() {
  return !hasUnsavedChanges || globalThis.confirm?.(UNSAVED_MESSAGE) === true;
}

function syncRoute(screen, mode = 'push') {
  const url = buildAdminRouteUrl(globalThis.location, {
    contestId: adminContext.adminSelectedContestId,
    screen,
  });
  if (mode === 'replace') globalThis.history?.replaceState?.({ screen }, '', url);
  else if (url !== currentRouteUrl) globalThis.history?.pushState?.({ screen }, '', url);
  currentRouteUrl = url;
}

function showLogin(message = '') {
  document.getElementById('admin-app').hidden = true;
  const auth = document.getElementById('admin-auth');
  const root = document.getElementById('admin-auth-screen');
  auth.hidden = false;
  renderAuth(root, { authService, onAuthenticated: initializeAuthenticatedAdmin });
  if (message) {
    const feedback = root.querySelector('#auth-error');
    if (feedback) feedback.textContent = message;
  }
}

async function navigate(screen = 'overview', { historyMode = 'push', skipGuard = false } = {}) {
  if (!isDeveloperUser(authService.getCurrentUser())) {
    redirectForRole(authService.getCurrentUser());
    return false;
  }
  if (!skipGuard && !canLeaveCurrentScreen()) return false;
  markSaved();
  adminContext.screen = screen;
  syncRoute(screen, historyMode);
  const root = document.getElementById('admin-screen');
  root.innerHTML = '<div class="admin-loading" role="status">Carregando módulo…</div>';
  updateAdminShell(screen);
  try {
    const renderer = ROUTES[screen];
    if (renderer) await renderer(root, adminContext);
    else renderAdminPreparedScreen(root, adminContext, screen);
  } catch (error) {
    root.innerHTML = `<div class="admin-alert" role="alert">${error.message || 'Falha ao carregar o módulo.'}</div>`;
  }
  root.focus({ preventScroll: true });
  globalThis.scrollTo?.(0, 0);
  return true;
}

async function selectContest(contestId, { historyMode = 'push', skipGuard = false } = {}) {
  if (contestId === adminContext.adminSelectedContestId) return true;
  if (!skipGuard && !canLeaveCurrentScreen()) return false;
  markSaved();
  adminContext.selectContest(contestId);
  await navigate(adminContext.screen, { historyMode, skipGuard: true });
  return true;
}

async function logout() {
  if (!canLeaveCurrentScreen()) return;
  markSaved();
  adminContext.clear({ preserveWorkspace: true });
  await authService.logout();
  showLogin();
}

async function initializeAuthenticatedAdmin() {
  const user = authService.getCurrentUser();
  if (!user) {
    showLogin();
    return;
  }
  if (!isDeveloperUser(user)) {
    redirectForRole(user);
    return;
  }
  adminContext.user = user;
  const catalog = await adminContestService.listContests();
  const route = resolveAdminRoute(globalThis.location, catalog.rows, {
    contestId: adminContext.adminSelectedContestId,
    screen: adminContext.screen,
  });
  adminContext.restoreContest(catalog.rows, route.contestId);
  document.getElementById('admin-auth').hidden = true;
  document.getElementById('admin-app').hidden = false;
  if (!shellMounted) {
    mountAdminShell({
      ctx: adminContext,
      navigate,
      onContestChange: selectContest,
      onLogout: logout,
    });
    shellMounted = true;
  }
  await navigate(route.screen, { historyMode: 'replace', skipGuard: true });
}

function registerNavigationGuards() {
  document.addEventListener('input', (event) => {
    if (event.target.closest('form.admin-form:not([data-ignore-unsaved])')) hasUnsavedChanges = true;
  });
  document.addEventListener('change', (event) => {
    if (event.target.closest('form.admin-form:not([data-ignore-unsaved])')) hasUnsavedChanges = true;
  });
  globalThis.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = '';
  });
  globalThis.addEventListener('popstate', async () => {
    const route = resolveAdminRoute(globalThis.location, adminContext.availableContests, {
      contestId: adminContext.adminSelectedContestId,
      screen: adminContext.screen,
    });
    if (!canLeaveCurrentScreen()) {
      syncRoute(adminContext.screen, 'push');
      return;
    }
    markSaved();
    if (route.contestId && route.contestId !== adminContext.adminSelectedContestId) {
      adminContext.selectContest(route.contestId);
    }
    await navigate(route.screen, { historyMode: 'replace', skipGuard: true });
  });
}

async function init() {
  registerNavigationGuards();
  try {
    const restored = await authService.restoreSession();
    if (restored) await initializeAuthenticatedAdmin();
    else showLogin();
  } catch (error) {
    showLogin(error.message || 'Não foi possível restaurar a sessão.');
  }
}

document.addEventListener('DOMContentLoaded', init);

globalThis.__DETONA_ADMIN = Object.freeze({
  navigate,
  selectContest,
  markSaved,
  getContext: () => ({
    screen: adminContext.screen,
    adminSelectedContestId: adminContext.adminSelectedContestId,
    hasUnsavedChanges,
  }),
});
