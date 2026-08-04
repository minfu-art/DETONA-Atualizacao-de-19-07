/**
 * DETONA CONCURSOS — Entry point
 * Arquitetura: IndexedDB SSOT + telas modulares RO-style
 */
import { openDB } from './core/db.js';
import { ensureSeed, getPlayer } from './core/seed.js';
import { recalculateEditalSSOT } from './core/ssot.js';
import { setMuted, SFX } from './core/audio.js';
import { renderOnboarding } from './ui/onboarding.js?v=70';
import { renderHome } from './ui/home.js?v=82';
import { renderWorldMap } from './ui/worldMap.js?v=74';
import { renderBattle } from './ui/battleArena.js?v=74';
import { renderGrimorio } from './ui/grimorio.js?v=69';
import { renderPerformance } from './ui/performance.js?v=74';
import { renderExpedition } from './ui/expedition.js?v=75';
import { renderWellbeing } from './ui/wellbeingUI.js?v=73';
import { renderProfile } from './ui/profile.js?v=79';
import { renderCelebration } from './ui/celebration.js?v=68';
import { renderTopicTree } from './ui/topicTree.js?v=70';
import { renderReview } from './ui/review.js?v=83';
import { renderRankedEvent } from './ui/rankedEvent.js';
import { initAppShell, updateAppShell } from './ui/appShell.js?v=72';
import { renderAuth } from './ui/auth.js?v=74';
import { renderLibrary } from './ui/library.js';
import { authService, libraryService, contestDataMigrationService, contestContentService } from './services/appServices.js';
import { canAccessInternalRoute, isDeveloperUser } from './auth/authService.js';
import { redirectForRole } from './auth/roleRouting.js';
import { clearActiveContestId, getActiveContestId, setActiveContestId } from './contest/activeContest.js';
import { clearActiveContestContent, setActiveContestContent } from './contest/contestRuntime.js';
import { errorState, skeleton } from './ui/components.js';
import { isBottomNavigationVisible } from './ui/navigation.js?v=73';
import { isCloudEnabled } from './config/cloudConfig.js';
import { bindOnlineFlush, pushAllLocalProgress, syncOnContestOpen } from './supabase/syncService.js';
import { progressRepository } from './repositories/progressRepository.js';
import { environmentLabel, isLocalDevelopment } from './config/appEnvironment.js';
import { resetAcademicSessionContext } from './auth/academicSessionContext.js';
import {
  createHabitReminderQueue,
  deliverDueHabitReminders,
  dismissHabitReminder,
  executeScopedHabitReminderAction,
  habitReminderScopeKey,
  markHabitReminderPresented,
  snoozeHabitReminder,
} from './services/habitReminderService.js';
import { localPersonalRepository } from './repositories/localPersonalRepository.js';

const ctx = {
  battleSession: null,
  reviewSession: null,
  reviewFilters: null,
  screen: 'home',
  disciplineId: null,
  returnToTree: null,
  studyTopicId: null,
  studySubtopicId: null,
  logout: null,
  contest: null,
  openContest: null,
  user: null,
  contentPackage: null,
};

let shellInitialized = false;

const ROUTES = {
  library: renderLibrary,
  onboarding: renderOnboarding,
  home: renderHome,
  map: renderWorldMap,
  battle: renderBattle,
  performance: renderPerformance,
  grimorio: renderPerformance,
  edital: renderGrimorio,
  expedition: renderExpedition,
  wellbeing: renderWellbeing,
  profile: renderProfile,
  celebration: renderCelebration,
  topicTree: renderTopicTree,
  review: renderReview,
  rankedEvent: renderRankedEvent,
};

let habitReminderRuntimeBound = false;
let habitReminderCheckPromise = null;
let habitReminderRuntimeGeneration = 0;

function currentHabitReminderScope() {
  return habitReminderScopeKey(authService.getCurrentUser()?.id, getActiveContestId());
}

function resetHabitReminderRuntime(scopeKey = null) {
  habitReminderRuntimeGeneration += 1;
  habitReminderCheckPromise = null;
  if (habitReminderQueue.currentScope() === scopeKey) habitReminderQueue.clear();
  else habitReminderQueue.setScope(scopeKey);
  document.getElementById('habit-local-reminder')?.remove();
}

function reminderMatchesCurrentScope(reminder) {
  return Boolean(reminder?.scopeKey && reminder.scopeKey === habitReminderQueue.currentScope()
    && reminder.scopeKey === currentHabitReminderScope());
}

function discardOutOfScopeReminder(reminder) {
  document.getElementById('habit-local-reminder')?.remove();
  habitReminderQueue.discard(reminder);
}

function currentHabitReminderRepository() {
  const userId = authService.getCurrentUser()?.id;
  const contestId = getActiveContestId();
  return userId && contestId ? localPersonalRepository.forScope(userId, contestId) : null;
}

function renderInternalHabitReminder(reminder, { pendingCount = 1, markPresented = false } = {}) {
  document.getElementById('habit-local-reminder')?.remove();
  if (!reminder) return;
  const notice = document.createElement('aside');
  notice.id = 'habit-local-reminder';
  notice.className = 'habit-local-reminder';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.innerHTML = `
    <div><strong data-reminder-title></strong><p data-reminder-body></p><small data-reminder-count></small></div>
    <div class="habit-local-reminder__actions">
      <button type="button" class="btn btn-primary" data-reminder-open>Registrar</button>
      <button type="button" class="btn btn-ghost" data-reminder-snooze>Adiar 10 min</button>
      <button type="button" class="btn btn-ghost" data-reminder-dismiss>Dispensar</button>
    </div>`;
  notice.querySelector('[data-reminder-title]').textContent = reminder.title;
  notice.querySelector('[data-reminder-body]').textContent = reminder.body;
  notice.querySelector('[data-reminder-count]').textContent = pendingCount > 1
    ? `${pendingCount} lembretes pendentes`
    : '1 lembrete pendente';
  notice.querySelector('[data-reminder-open]').addEventListener('click', async () => {
    const repository = currentHabitReminderRepository();
    const result = await executeScopedHabitReminderAction({
      reminder,
      currentScope: reminderMatchesCurrentScope(reminder) ? currentHabitReminderScope() : null,
      action: () => dismissHabitReminder(reminder, repository),
      onMismatch: discardOutOfScopeReminder,
    });
    if (!result.executed) return;
    habitReminderQueue.advance();
    ctx.habitNavigationIntent = { type: 'record', definitionId: reminder.habitDefinitionId };
    navigate('wellbeing');
  });
  notice.querySelector('[data-reminder-snooze]').addEventListener('click', async () => {
    const repository = currentHabitReminderRepository();
    const result = await executeScopedHabitReminderAction({
      reminder,
      currentScope: reminderMatchesCurrentScope(reminder) ? currentHabitReminderScope() : null,
      action: () => snoozeHabitReminder(reminder, 10, repository),
      onMismatch: discardOutOfScopeReminder,
    });
    if (!result.executed) return;
    habitReminderQueue.advance();
  });
  notice.querySelector('[data-reminder-dismiss]').addEventListener('click', async () => {
    const repository = currentHabitReminderRepository();
    const result = await executeScopedHabitReminderAction({
      reminder,
      currentScope: reminderMatchesCurrentScope(reminder) ? currentHabitReminderScope() : null,
      action: () => dismissHabitReminder(reminder, repository),
      onMismatch: discardOutOfScopeReminder,
    });
    if (!result.executed) return;
    habitReminderQueue.advance();
  });
  document.body.append(notice);
  const repository = currentHabitReminderRepository();
  if (markPresented && reminderMatchesCurrentScope(reminder) && repository) markHabitReminderPresented(reminder, repository).catch((error) => {
    console.warn('[habits] reminder checkpoint unavailable', error?.message || error);
  });
}

const habitReminderQueue = createHabitReminderQueue({ onPresent: renderInternalHabitReminder });

function enqueueInternalHabitReminder(reminder) {
  const presentedImmediately = habitReminderQueue.enqueue(reminder);
  if (!presentedImmediately) {
    const count = document.querySelector('#habit-local-reminder [data-reminder-count]');
    if (count) count.textContent = `${habitReminderQueue.pendingCount()} lembretes pendentes`;
  }
  return presentedImmediately;
}

async function checkHabitReminders() {
  const userId = authService.getCurrentUser()?.id;
  const contestId = getActiveContestId();
  const scopeKey = habitReminderScopeKey(userId, contestId);
  if (!scopeKey) return;
  if (habitReminderQueue.currentScope() !== scopeKey) resetHabitReminderRuntime(scopeKey);
  if (habitReminderCheckPromise) return habitReminderCheckPromise;
  const generation = habitReminderRuntimeGeneration;
  const repository = localPersonalRepository.forScope(userId, contestId);
  const onInternal = (reminder) => {
    if (generation !== habitReminderRuntimeGeneration
      || userId !== authService.getCurrentUser()?.id
      || contestId !== getActiveContestId()
      || scopeKey !== habitReminderQueue.currentScope()) return false;
    return enqueueInternalHabitReminder({ ...reminder, scopeKey });
  };
  const checkPromise = deliverDueHabitReminders({ onInternal, repository })
    .catch((error) => console.warn('[habits] local reminder unavailable', error?.message || error))
    .finally(() => {
      if (habitReminderCheckPromise === checkPromise) habitReminderCheckPromise = null;
    });
  habitReminderCheckPromise = checkPromise;
  return checkPromise;
}

function bindHabitReminderRuntime() {
  if (habitReminderRuntimeBound) return;
  habitReminderRuntimeBound = true;
  window.addEventListener('focus', checkHabitReminders);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkHabitReminders();
  });
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'DETONA_NAVIGATE' && event.data?.screen === 'wellbeing') navigate('wellbeing');
  });
  window.setInterval(checkHabitReminders, 60000);
}

async function navigate(screen) {
  if (!canAccessInternalRoute(authService)) {
    showAuth();
    return;
  }
  if (screen === 'library') {
    await showLibrary();
    return;
  }
  if (!getActiveContestId()) {
    await showLibrary();
    return;
  }
  if (!(await libraryService.canAccess(authService.getCurrentUser().id, getActiveContestId()))) {
    await showLibrary();
    return;
  }
  ctx.screen = screen;
  const root = document.getElementById('screen');
  const nav = document.getElementById('bottom-nav');
  if (!root) return;

  // nav highlight
  if (nav) {
    nav.classList.toggle('hidden', !isBottomNavigationVisible(screen));
  }

  root.innerHTML = skeleton(4, `Carregando ${screen}`);
  const fn = ROUTES[screen] || ROUTES.home;
  try {
    await fn(root, navigate, ctx);
  } catch (err) {
    console.error(err);
    root.innerHTML = errorState({
      title: 'Não foi possível abrir esta área',
      description: err.message || String(err),
      action: '<button type="button" class="ds-button ds-button--primary" id="err-home">Voltar para Hoje</button>',
    });
    document.getElementById('err-home')?.addEventListener('click', () => navigate('home'));
  }

  updateAppShell({ screen, player: await getPlayer(), contest: ctx.contest, user: ctx.user });
  root.focus({ preventScroll: true });

  window.scrollTo(0, 0);
  checkHabitReminders();
}

function showAuth() {
  resetHabitReminderRuntime();
  document.getElementById('app')?.classList.add('app-shell--auth');
  document.getElementById('app')?.classList.remove('app-shell--library');
  document.getElementById('bottom-nav')?.classList.add('hidden');
  const root = document.getElementById('screen');
  if (root) {
    delete root.dataset.theme;
    renderAuth(root, { authService, onAuthenticated: initializeAuthenticatedApp });
  }
}

async function showLibrary() {
  const activeContestId = getActiveContestId();
  clearActiveContestContent();
  ctx.contest = activeContestId ? await libraryService.getContest(activeContestId) : null;
  ctx.contentPackage = null;
  ctx.screen = 'library';
  const app = document.getElementById('app');
  app?.classList.remove('app-shell--auth');
  app?.classList.add('app-shell--library');
  document.getElementById('bottom-nav')?.classList.remove('hidden');
  const root = document.getElementById('screen');
  if (!root) return;
  root.dataset.screen = 'library';
  root.dataset.theme = 'library';
  const user = authService.getCurrentUser();
  ctx.user = user;
  const items = await libraryService.getLibrary(user);
  renderLibrary(root, {
    user,
    items,
    activeContestId,
    onOpen: openContest,
    onLogout: logout,
    embedded: true,
  });
  updateAppShell({ screen: 'library', player: await getPlayer(), contest: ctx.contest, user });
  root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function openContest(contestId) {
  const user = authService.getCurrentUser();
  if (getActiveContestId() !== contestId) resetHabitReminderRuntime();
  if (!(await libraryService.canAccess(user.id, contestId))) throw new Error('Acesso nao liberado.');
  const contest = await libraryService.getContest(contestId, { refresh: true });
  if (!contest || contest.contentStatus !== 'ready') throw new Error('Conteudo em preparacao.');
  const loadedContent = await contestContentService.load(user.id, contestId);
  const contentPackage = loadedContent?.legacyStatic ? null : loadedContent;
  if (contentPackage && contentPackage.contestId !== contestId) throw new Error('Pacote de concurso incorreto.');
  setActiveContestId(contestId);
  resetHabitReminderRuntime(habitReminderScopeKey(user.id, contestId));
  setActiveContestContent(contentPackage);
  ctx.contest = contest;
  ctx.contentPackage = contentPackage;
  document.getElementById('app')?.classList.remove('app-shell--library');
  await contestDataMigrationService.ensureCompatibility(user.id, contestId);
  await openDB();
  // Nuvem híbrida: pull antes do seed para não sobrescrever progresso remoto com seed vazio
  if (isCloudEnabled()) {
    try {
      await syncOnContestOpen(user.id, contestId);
    } catch (err) {
      console.warn('[cloud] sync on open failed', err?.message || err);
    }
  }
  await ensureSeed({ contentPackage });
  await recalculateEditalSSOT();
  // Push inicial uma vez (local → nuvem) quando ainda não houve push
  if (isCloudEnabled()) {
    try {
      const last = await progressRepository.getMeta('cloud_last_push_at');
      if (!last) {
        const result = await pushAllLocalProgress(user.id, contestId);
        if (result?.pushed > 0) {
          await progressRepository.setMeta('cloud_last_push_at', result.at || new Date().toISOString());
        }
      }
    } catch (err) {
      console.warn('[cloud] initial push failed', err?.message || err);
    }
  }
  const player = await getPlayer();
  setMuted(player?.sound_enabled === false);
  if (!player?.onboarded) {
    document.getElementById('bottom-nav')?.classList.add('hidden');
    await navigate('onboarding');
  } else {
    document.getElementById('bottom-nav')?.classList.remove('hidden');
    const requestedScreen = new URLSearchParams(window.location.search).get('screen');
    await navigate(requestedScreen === 'wellbeing' ? 'wellbeing' : 'home');
  }
}

async function logout() {
  resetHabitReminderRuntime();
  await authService.logout();
  clearActiveContestId();
  clearActiveContestContent();
  resetAcademicSessionContext(ctx);
  showAuth();
}

ctx.logout = logout;
ctx.openContest = openContest;
ctx.clearHabitReminderRuntime = () => resetHabitReminderRuntime(currentHabitReminderScope());

async function initializeAuthenticatedApp() {
  const authenticatedUser = authService.getCurrentUser();
  if (isDeveloperUser(authenticatedUser)) {
    redirectForRole(authenticatedUser);
    return;
  }
  if (ctx.user?.id && ctx.user.id !== authenticatedUser?.id) {
    resetHabitReminderRuntime();
    resetAcademicSessionContext(ctx);
  }
  ctx.user = authenticatedUser;
  document.getElementById('app')?.classList.remove('app-shell--auth');
  if (!shellInitialized) {
    initAppShell(navigate, { onLogout: logout, onActivate: () => SFX.click() });
    shellInitialized = true;
  }

  let activeContestId = getActiveContestId();
  if (!activeContestId) {
    const readyJourneys = (await libraryService.getLibrary(ctx.user))
      .filter((item) => item.owned && item.contest.contentStatus === 'ready');
    if (readyJourneys.length === 1) activeContestId = readyJourneys[0].contest.id;
  }
  if (activeContestId) {
    const contest = await libraryService.getContest(activeContestId);
    const user = authService.getCurrentUser();
    const canRestore = contest?.contentStatus === 'ready'
      && await libraryService.canAccess(user.id, activeContestId);
    if (canRestore) {
      await openContest(activeContestId);
      return;
    }
    clearActiveContestId();
    resetHabitReminderRuntime();
  }

  await showLibrary();
}

async function init() {
  try {
    if (isLocalDevelopment()) {
      console.warn(`[DETONA] ${environmentLabel()}: autenticação e checkout demonstrativos podem estar ativos.`);
    }
    // PWA + botão Instalar (celular, tablet e PC)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    bindHabitReminderRuntime();
    try {
      const { initPwaInstall } = await import('./core/pwaInstall.js');
      initPwaInstall();
    } catch (e) {
      console.warn('PWA install init failed', e);
    }

    bindOnlineFlush();

    const restored = await authService.restoreSession();
    if (restored) await initializeAuthenticatedApp();
    else showAuth();
  } catch (err) {
    console.error('Init failed', err);
    document.getElementById('screen').innerHTML = `
      <div class="ro-window"><div class="ro-body">
        <p>Falha ao iniciar o IndexedDB: ${err.message}</p>
        <p class="muted mt-8">Use um navegador moderno (Chrome/Edge/Firefox) e abra via http:// (não file://).</p>
      </div></div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

// expose for debug
window.__DETONA = {
  navigate,
  ctx,
  authService,
  libraryService,
  cloud: {
    isEnabled: isCloudEnabled,
    syncOnContestOpen,
  },
};
