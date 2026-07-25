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
import { adminContestService } from '../services/adminContestService.js';

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
});

let shellMounted = false;

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

async function navigate(screen = 'overview') {
  if (!isDeveloperUser(authService.getCurrentUser())) {
    redirectForRole(authService.getCurrentUser());
    return;
  }
  adminContext.screen = screen;
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
}

async function logout() {
  adminContext.clear();
  await authService.logout();
  shellMounted = false;
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
  adminContext.restoreContest(catalog.rows);
  document.getElementById('admin-auth').hidden = true;
  document.getElementById('admin-app').hidden = false;
  if (!shellMounted) {
    mountAdminShell({ ctx: adminContext, navigate, onLogout: logout });
    shellMounted = true;
  }
  await navigate('overview');
}

async function init() {
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
  getContext: () => ({
    screen: adminContext.screen,
    adminSelectedContestId: adminContext.adminSelectedContestId,
  }),
});
