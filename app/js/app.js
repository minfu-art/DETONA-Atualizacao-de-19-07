/**
 * DETONA CONCURSOS — Entry point
 * Arquitetura: IndexedDB SSOT + telas modulares RO-style
 */
import { openDB } from './core/db.js';
import { ensureSeed, getPlayer } from './core/seed.js';
import { recalculateEditalSSOT } from './core/ssot.js';
import { setMuted, SFX } from './core/audio.js';
import { initAppShell, updateAppShell } from './ui/appShell.js?v=73';
import { renderAuth } from './ui/auth.js?v=75';
import { renderLibrary } from './ui/library.js';
import { authService, libraryService, contestDataMigrationService, contestContentService } from './services/appServices.js';
import { canAccessInternalRoute, isDeveloperUser } from './auth/authService.js';
import { redirectForRole } from './auth/roleRouting.js';
import { clearActiveContestId, getActiveContestId, setActiveContestId } from './contest/activeContest.js';
import { clearActiveContestContent, setActiveContestContent } from './contest/contestRuntime.js';
import { errorState, skeleton } from './ui/components.js';
import { isBottomNavigationVisible } from './ui/navigation.js?v=73';
import { isCloudEnabled } from './config/cloudConfig.js';
import {
  bindOnlineFlush,
  createDeferredSyncTask,
  pushAllLocalProgress,
  syncOnContestOpen,
} from './supabase/syncService.js';
import { progressRepository } from './repositories/progressRepository.js';
import { environmentLabel, isLocalDevelopment } from './config/appEnvironment.js';
import { resetAcademicSessionContext, resetContestTransientContext } from './auth/academicSessionContext.js';
import { getStudentEntryLinks } from './services/studentEntryLinks.js';
import { readCheckoutReturn, readCommercialIntent } from './services/studentEntryModel.js';
import { selectActiveJourney } from './services/careerLibraryService.js';
import {
  courseFactoryPreviewService,
  isCourseFactoryStudentPreview,
  PC_BA_CONTEST_ID,
} from './services/courseFactoryPreviewService.js';
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
import {
  clearRuntimeRecoveryMarker,
  initializationFailure,
  recoverStaleRuntime,
} from './core/runtimeRecovery.js';
import {
  STUDENT_HISTORY_HOME,
  STUDENT_HISTORY_INTERNAL,
  STUDENT_HISTORY_KEY,
  shouldReturnHomeFromHistory,
  studentHistoryTransition,
} from './core/studentHistory.js';

function loadRouteStyle(href) {
  if (!href || typeof document === 'undefined') return Promise.resolve();
  const existing = document.querySelector(`link[data-route-style="${href}"]`);
  if (existing?.dataset.loaded === 'true' || existing?.sheet) return Promise.resolve();
  if (existing?._loadPromise) return existing._loadPromise;
  const link = existing || document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.routeStyle = href;
  link._loadPromise = new Promise((resolve, reject) => {
    link.addEventListener('load', () => {
      link.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    link.addEventListener('error', () => {
      link.remove();
      reject(new Error(`Estilo indisponivel: ${href}`));
    }, { once: true });
  });
  if (!existing) document.head.append(link);
  return link._loadPromise;
}

function lazyRoute(load, exportName, styles = []) {
  let rendererPromise = null;
  return async (...args) => {
    rendererPromise ||= Promise.all([load(), ...styles.map(loadRouteStyle)])
      .then(([module]) => {
        const renderer = module[exportName];
        if (typeof renderer !== 'function') throw new Error(`Rota indisponível: ${exportName}`);
        return renderer;
      })
      .catch((error) => {
        rendererPromise = null;
        throw error;
      });
    return (await rendererPromise)(...args);
  };
}

const renderOnboarding = lazyRoute(() => import('./ui/onboarding.js?v=71'), 'renderOnboarding');
const renderHome = lazyRoute(() => import('./ui/home.js?v=85'), 'renderHome', ['./css/dashboard-jrpg.css?v=81']);
const renderWorldMap = lazyRoute(() => import('./ui/worldMap.js?v=74'), 'renderWorldMap');
const renderBattle = lazyRoute(() => import('./ui/battleArena.js?v=77'), 'renderBattle');
const renderGrimorio = lazyRoute(() => import('./ui/grimorio.js?v=69'), 'renderGrimorio');
const renderPerformance = lazyRoute(() => import('./ui/performance.js?v=76'), 'renderPerformance', ['./css/performance-mobile.css?v=5']);
const renderExpedition = lazyRoute(() => import('./ui/expedition.js?v=77'), 'renderExpedition', ['./css/plan-edital.css?v=4']);
const renderWellbeing = lazyRoute(() => import('./ui/wellbeingUI.js?v=74'), 'renderWellbeing');
const renderProfile = lazyRoute(() => import('./ui/profile.js?v=97'), 'renderProfile', ['./css/profile-evolution.css?v=2']);
const renderCelebration = lazyRoute(() => import('./ui/celebration.js?v=68'), 'renderCelebration');
const renderTopicTree = lazyRoute(() => import('./ui/topicTree.js?v=73'), 'renderTopicTree');
const renderReview = lazyRoute(() => import('./ui/review.js?v=86'), 'renderReview', ['./css/review.css?v=1']);
const renderRankedEvent = lazyRoute(() => import('./ui/rankedEvent.js?v=87'), 'renderRankedEvent', ['./css/ranked-functional.css?v=3']);

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
  requestBattleExit: null,
  allowBattleExit: false,
  battleFinalizing: false,
  requestReviewExit: null,
  allowReviewExit: false,
  rankedEventSession: null,
  rankedEventResult: null,
  rankedEventId: null,
  rankedCompletionNotice: null,
  requestRankedExit: null,
  allowRankedExit: false,
  clearRankedTimer: null,
};

let shellInitialized = false;
let contestOpenGeneration = 0;
const INTERACTIVE_SCREENS = new Set(['battle', 'review', 'rankedEvent']);
let pendingContestMaintenance = null;
let onlineFlushBinding = null;

const isInteractiveScreen = () => INTERACTIVE_SCREENS.has(ctx.screen);

function resumeDeferredCloudWork() {
  if (isInteractiveScreen()) return;
  pendingContestMaintenance?.request();
  onlineFlushBinding?.flushWhenSafe().catch(() => {});
}

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
let studentBackNavigationBound = false;

function studentHistoryLevel() {
  return globalThis.history?.state?.[STUDENT_HISTORY_KEY] || null;
}

function writeStudentHistory(level, mode = 'replace') {
  if (!globalThis.history || !globalThis.location) return;
  const state = { ...(globalThis.history.state || {}), [STUDENT_HISTORY_KEY]: level };
  globalThis.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', globalThis.location.href);
}

function shouldUseStudentHistory() {
  return Boolean(authService.getCurrentUser() && getActiveContestId());
}

function prepareStudentHistoryNavigation(screen, { fromHistory = false } = {}) {
  if (!shouldUseStudentHistory() || screen === 'onboarding') return false;
  const transition = studentHistoryTransition({
    screen,
    currentScreen: ctx.screen,
    currentLevel: studentHistoryLevel(),
    fromHistory,
  });
  if (transition.action !== 'back') return false;
  globalThis.history.back();
  return true;
}

function commitStudentHistoryNavigation(screen, { fromHistory = false } = {}) {
  if (!shouldUseStudentHistory() || screen === 'onboarding') return;
  const transition = studentHistoryTransition({
    screen,
    currentScreen: ctx.screen,
    currentLevel: studentHistoryLevel(),
    fromHistory,
  });
  if (transition.action === 'seed') {
    writeStudentHistory(STUDENT_HISTORY_HOME);
    writeStudentHistory(STUDENT_HISTORY_INTERNAL, 'push');
  } else if (transition.action === 'push' || transition.action === 'replace') {
    writeStudentHistory(transition.level, transition.action);
  }
}

function bindStudentBackNavigation() {
  if (studentBackNavigationBound) return;
  studentBackNavigationBound = true;
  globalThis.addEventListener('popstate', async (event) => {
    if (!shouldUseStudentHistory() || !shouldReturnHomeFromHistory({
      level: event.state?.[STUDENT_HISTORY_KEY],
      currentScreen: ctx.screen,
    })) return;
    const previousScreen = ctx.screen;
    await navigate('home', { fromHistory: true });
    // Se uma atividade bloqueou a saída, restaura o nível interno.
    if (ctx.screen === previousScreen && previousScreen !== 'home') {
      writeStudentHistory(STUDENT_HISTORY_INTERNAL, 'push');
    }
  });
}

function resetStudentHistory() {
  if (!globalThis.history?.replaceState || !globalThis.location) return;
  const state = { ...(globalThis.history.state || {}) };
  delete state[STUDENT_HISTORY_KEY];
  globalThis.history.replaceState(state, '', globalThis.location.href);
}

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
  notice.setAttribute('role', 'alert');
  notice.setAttribute('aria-live', 'assertive');
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
  notice.querySelector('[data-reminder-open]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const repository = currentHabitReminderRepository();
      const result = await executeScopedHabitReminderAction({
        reminder,
        currentScope: reminderMatchesCurrentScope(reminder) ? currentHabitReminderScope() : null,
        action: () => dismissHabitReminder(reminder, repository),
        onMismatch: discardOutOfScopeReminder,
      });
      if (!result.executed) return;
      ctx.habitNavigationIntent = { type: 'record', definitionId: reminder.habitDefinitionId };
      habitReminderQueue.advance();
      await navigate('wellbeing');
    } catch (error) {
      button.disabled = false;
      console.warn('[habits] reminder action unavailable', error?.message || error);
    }
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
  SFX.reminder();
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

async function navigate(screen, options = {}) {
  if (ctx.screen === 'battle' && screen !== 'battle' && ctx.battleFinalizing) return;
  if (ctx.screen === 'battle'
    && screen !== 'battle'
    && ctx.battleSession
    && !ctx.allowBattleExit) {
    ctx.requestBattleExit?.(screen);
    return;
  }
  if (ctx.screen === 'review'
    && screen !== 'review'
    && ctx.reviewSession
    && !ctx.reviewSession.finished
    && !ctx.allowReviewExit) {
    ctx.requestReviewExit?.(screen);
    return;
  }
  if (ctx.screen === 'rankedEvent'
    && screen !== 'rankedEvent'
    && ctx.rankedEventSession
    && ctx.rankedEventSession.status === 'started'
    && !ctx.allowRankedExit) {
    ctx.requestRankedExit?.(screen);
    return;
  }
  if (prepareStudentHistoryNavigation(screen, options)) return;
  ctx.allowBattleExit = false;
  ctx.allowReviewExit = false;
  ctx.allowRankedExit = false;
  if (ctx.screen === 'rankedEvent' && screen !== 'rankedEvent') ctx.clearRankedTimer?.();
  if (!canAccessInternalRoute(authService)) {
    showAuth();
    return;
  }
  if (screen === 'library') {
    await showLibrary();
    resumeDeferredCloudWork();
    return;
  }
  if (!getActiveContestId()) {
    await openPreferredJourney(screen);
    return;
  }
  if (ctx.contest?.id !== getActiveContestId()) {
    clearActiveContestId();
    await openPreferredJourney(screen);
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

  commitStudentHistoryNavigation(screen, options);

  updateAppShell({ screen, player: await getPlayer(), contest: ctx.contest, user: ctx.user });
  root.focus({ preventScroll: true });

  window.scrollTo(0, 0);
  if (screen === 'topicTree' && ctx.studySubtopicId) {
    requestAnimationFrame(() => {
      const card = root.querySelector(`[data-subtopic-card="${CSS.escape(ctx.studySubtopicId)}"]`);
      card?.scrollIntoView({ block: 'center' });
      card?.querySelector('[data-study-subtopic]')?.focus({ preventScroll: true });
    });
  }
  checkHabitReminders();
  resumeDeferredCloudWork();
}

async function openPreferredJourney(screen) {
  const user = authService.getCurrentUser();
  if (!user) {
    showAuth();
    return false;
  }

  let libraryState;
  try {
    libraryState = await libraryService.getLibraryState(user);
  } catch {
    await showLibrary({ refresh: true });
    return false;
  }

  const preferred = selectActiveJourney(libraryState.items);
  if (!preferred) {
    await showLibrary({ libraryState });
    return false;
  }

  const root = document.getElementById('screen');
  if (root) {
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = skeleton(5, `Preparando ${preferred.contest.code || 'sua jornada'}`);
  }

  try {
    await openContest(preferred.contest.id, { initialScreen: screen, contestHint: preferred.contest });
    return true;
  } catch (error) {
    await showLibrary({ libraryState });
    const feedback = document.querySelector(`[data-contest-card="${CSS.escape(preferred.contest.id)}"] [data-card-feedback]`);
    if (feedback) feedback.textContent = error?.message || 'Nao foi possivel abrir sua jornada.';
    return false;
  } finally {
    root?.removeAttribute('aria-busy');
  }
}

function showAuth() {
  resetHabitReminderRuntime();
  resetStudentHistory();
  document.getElementById('app')?.classList.add('app-shell--auth');
  document.getElementById('app')?.classList.remove('app-shell--library');
  document.getElementById('bottom-nav')?.classList.add('hidden');
  const root = document.getElementById('screen');
  if (root) {
    delete root.dataset.theme;
    renderAuth(root, { authService, onAuthenticated: initializeAuthenticatedApp });
  }
}

function clearCheckoutReturnUrl() {
  if (!globalThis.history?.replaceState || !globalThis.location) return;
  const url = new URL(globalThis.location.href);
  url.searchParams.delete('checkout');
  url.searchParams.delete('contest');
  globalThis.history.replaceState(globalThis.history.state || {}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function showLibrary({ libraryState = null, refresh = false } = {}) {
  const generation = ++contestOpenGeneration;
  const activeContestId = getActiveContestId();
  clearActiveContestContent();
  ctx.contest = null;
  if (activeContestId) {
    try { ctx.contest = await libraryService.getContest(activeContestId); }
    catch { /* a biblioteca offline usa o snapshot visual, nunca este contexto */ }
  }
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
  root.innerHTML = skeleton(5, 'Carregando sua biblioteca');
  try {
    const state = libraryState || await libraryService.getLibraryState(user, { refresh });
    if (generation !== contestOpenGeneration || user?.id !== authService.getCurrentUser()?.id) return;
    const commerceReturn = readCheckoutReturn(globalThis.location?.search || '');
    const commercialIntent = readCommercialIntent(globalThis.location?.search || '');
    renderLibrary(root, {
      user,
      items: state.items,
      activeContestId,
      commerceReturn,
      commercialIntent,
      offline: state.offline,
      links: getStudentEntryLinks(),
      onOpen: (contestId) => openContest(contestId, {
        contestHint: state.items.find((item) => item.contest.id === contestId)?.contest || null,
      }),
      onRefreshAccess: () => showLibrary({ refresh: true }),
      onPurchase: async (contestId) => {
        const purchase = await libraryService.purchase(user, contestId);
        if (!purchase?.redirectUrl) throw new Error('O pagamento não retornou um destino válido.');
        globalThis.location.assign(purchase.redirectUrl);
      },
      onLogout: logout,
      embedded: true,
    });
    if (commerceReturn) clearCheckoutReturnUrl();
  } catch (error) {
    if (generation !== contestOpenGeneration) return;
    root.innerHTML = errorState({
      title: 'Não foi possível carregar sua biblioteca',
      description: error?.message || 'Verifique sua conexão e tente novamente.',
      action: '<button type="button" class="btn btn-primary" id="library-retry">Tentar novamente</button><button type="button" class="btn btn-ghost" id="library-error-logout">Sair da conta</button>',
    });
    root.querySelector('#library-retry')?.addEventListener('click', () => showLibrary({ refresh: true }));
    root.querySelector('#library-error-logout')?.addEventListener('click', logout);
  }
  const libraryPlayer = activeContestId ? await getPlayer() : null;
  updateAppShell({ screen: 'library', player: libraryPlayer, contest: ctx.contest, user });
  commitStudentHistoryNavigation('library');
  root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function scheduleContestMaintenance({ userId, contestId, generation, syncInBackground }) {
  const schedule = globalThis.requestIdleCallback
    ? (callback) => globalThis.requestIdleCallback(callback, { timeout: 2000 })
    : (callback) => globalThis.setTimeout(callback, 100);
  const isCurrent = () => generation === contestOpenGeneration
    && userId === authService.getCurrentUser()?.id
    && contestId === getActiveContestId();
  const isSafe = () => isCurrent() && !isInteractiveScreen();
  const steps = {
    sync: !syncInBackground,
    ssot: !syncInBackground,
    shell: !syncInBackground,
    readLastPush: false,
    push: false,
    writeLastPush: false,
  };
  let shouldPush = false;
  let pushResult = null;

  pendingContestMaintenance?.cancel();
  pendingContestMaintenance = createDeferredSyncTask({
    schedule,
    isCurrent,
    shouldDefer: isInteractiveScreen,
    run: async () => {
      if (!isSafe()) return false;
      if (!steps.sync) {
        await syncOnContestOpen(userId, contestId);
        steps.sync = true;
        if (!isSafe()) return false;
      }
      if (!steps.ssot) {
        await recalculateEditalSSOT();
        steps.ssot = true;
        if (!isSafe()) return false;
      }
      if (!steps.shell) {
        const player = await getPlayer();
        if (!isSafe()) return false;
        updateAppShell({ screen: ctx.screen, player, contest: ctx.contest, user: ctx.user });
        steps.shell = true;
      }
      if (!steps.readLastPush) {
        const last = await progressRepository.getMeta('cloud_last_push_at');
        steps.readLastPush = true;
        shouldPush = !last;
        if (!isSafe()) return false;
      }
      if (!shouldPush) return true;
      if (!steps.push) {
        pushResult = await pushAllLocalProgress(userId, contestId);
        steps.push = true;
        if (!isSafe()) return false;
      }
      if (!steps.writeLastPush && pushResult?.pushed > 0) {
        await progressRepository.setMeta('cloud_last_push_at', pushResult.at || new Date().toISOString());
        steps.writeLastPush = true;
      }
      return true;
    },
    onError: (error) => {
      if (isCurrent()) console.warn('[cloud] background contest maintenance failed', error?.message || error);
    },
  });
  pendingContestMaintenance.request();
}

async function openContest(contestId, { initialScreen = null, contestHint = null } = {}) {
  const user = authService.getCurrentUser();
  if (!user) throw new Error('Sua sessão expirou. Entre novamente.');
  const generation = ++contestOpenGeneration;
  const assertCurrent = () => {
    if (generation !== contestOpenGeneration || user.id !== authService.getCurrentUser()?.id) {
      const error = new Error('A navegação anterior foi cancelada.');
      error.code = 'STALE_CONTEXT';
      throw error;
    }
  };
  const contestChanged = getActiveContestId() !== contestId;
  if (getActiveContestId() !== contestId) resetHabitReminderRuntime();
  const [contest, loadedContent] = await Promise.all([
    contestHint?.id === contestId
      ? Promise.resolve(contestHint)
      : libraryService.getContest(contestId, { refresh: true }),
    contestContentService.load(user.id, contestId),
  ]);
  assertCurrent();
  if (!contest || contest.contentStatus !== 'ready') throw new Error('Conteudo em preparacao.');
  const contentPackage = loadedContent?.legacyStatic ? null : loadedContent;
  if (contentPackage && contentPackage.contestId !== contestId) throw new Error('Pacote de concurso incorreto.');
  if (contestChanged) {
    resetContestTransientContext(ctx);
    ctx.rankedEventSession = null;
  }
  setActiveContestId(contestId);
  resetHabitReminderRuntime(habitReminderScopeKey(user.id, contestId));
  setActiveContestContent(contentPackage);
  ctx.contest = contest;
  ctx.contentPackage = contentPackage;
  document.getElementById('app')?.classList.remove('app-shell--library');
  await contestDataMigrationService.ensureCompatibility(user.id, contestId);
  assertCurrent();
  await openDB();
  const localPlayer = await getPlayer();
  const cloudSyncEnabled = isCloudEnabled() && !isCourseFactoryStudentPreview();
  const syncInBackground = cloudSyncEnabled && Boolean(localPlayer);
  // Dispositivo novo ainda bloqueia no primeiro pull para restaurar o progresso remoto.
  // Quem já possui base local abre imediatamente e sincroniza depois da primeira tela.
  if (cloudSyncEnabled) {
    if (!syncInBackground) {
      try {
        await syncOnContestOpen(user.id, contestId);
        assertCurrent();
      } catch (err) {
        if (err?.code === 'STALE_CONTEXT') throw err;
        console.warn('[cloud] sync on open failed', err?.message || err);
      }
    }
  }
  await ensureSeed({ contentPackage });
  await recalculateEditalSSOT();
  assertCurrent();
  const player = await getPlayer();
  assertCurrent();
  setMuted(player?.sound_enabled === false);
  if (!player?.onboarded) {
    document.getElementById('bottom-nav')?.classList.add('hidden');
    await navigate('onboarding');
  } else {
    document.getElementById('bottom-nav')?.classList.remove('hidden');
    const requestedScreen = new URLSearchParams(window.location.search).get('screen');
    const destination = initialScreen && ROUTES[initialScreen] && initialScreen !== 'library'
      ? initialScreen
      : requestedScreen === 'wellbeing' ? 'wellbeing' : 'home';
    await navigate(destination);
  }
  if (cloudSyncEnabled) {
    scheduleContestMaintenance({
      userId: user.id,
      contestId,
      generation,
      syncInBackground,
    });
  }
}

async function logout() {
  contestOpenGeneration += 1;
  pendingContestMaintenance?.cancel();
  pendingContestMaintenance = null;
  onlineFlushBinding?.cancelPending();
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

async function initializeAuthenticatedApp({ reason = 'restore' } = {}) {
  const authenticatedUser = authService.getCurrentUser();
  const coursePreview = isCourseFactoryStudentPreview();
  if (isDeveloperUser(authenticatedUser) && !coursePreview) {
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

  if (coursePreview && isDeveloperUser(authenticatedUser)) {
    await openContest(PC_BA_CONTEST_ID, {
      contestHint: courseFactoryPreviewService.studentContest(),
    });
    return;
  }

  if (reason === 'register') {
    clearActiveContestId();
    await showLibrary();
    return;
  }

  const commercialIntent = readCommercialIntent(globalThis.location?.search || '');
  if (commercialIntent) {
    let libraryState;
    try {
      libraryState = await libraryService.getLibraryState(ctx.user);
    } catch (error) {
      if (error?.code !== 'CATALOG_UNAVAILABLE') throw error;
      await showLibrary({ refresh: true });
      return;
    }
    const intended = libraryState.items.find(({ contest }) => contest.id === commercialIntent.contestId);
    if (intended?.owned && intended.contest.contentStatus === 'ready') {
      await openContest(intended.contest.id, { contestHint: intended.contest });
      return;
    }
    await showLibrary({ libraryState });
    return;
  }

  let activeContestId = getActiveContestId();
  let activeContestHint = null;
  if (!activeContestId) {
    let libraryState;
    try {
      libraryState = await libraryService.getLibraryState(ctx.user);
    } catch (error) {
      if (error?.code !== 'CATALOG_UNAVAILABLE') throw error;
      // A Biblioteca possui erro recuperável e nova tentativa próprios.
      // Não rotule uma falha remota do catálogo como falha do IndexedDB.
      await showLibrary({ refresh: true });
      return;
    }
    const readyJourneys = libraryState.items
      .filter((item) => item.owned && item.contest.contentStatus === 'ready');
    if (readyJourneys.length === 1) {
      activeContestId = readyJourneys[0].contest.id;
      activeContestHint = readyJourneys[0].contest;
    }
    if (!activeContestId) {
      await showLibrary({ libraryState });
      return;
    }
  }
  if (activeContestId) {
    try {
      await openContest(activeContestId, { contestHint: activeContestHint });
      return;
    } catch (error) {
      console.warn('[contest] automatic restore failed', error?.message || error);
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
    bindStudentBackNavigation();
    try {
      const { initPwaInstall } = await import('./core/pwaInstall.js');
      initPwaInstall();
    } catch (e) {
      console.warn('PWA install init failed', e);
    }

    onlineFlushBinding = bindOnlineFlush({ canFlush: () => !isInteractiveScreen() });

    if (authService.isPasswordRecoveryLocation()) {
      showAuth();
      return;
    }
    const restored = await authService.restoreSession();
    if (restored) await initializeAuthenticatedApp();
    else showAuth();
    clearRuntimeRecoveryMarker();
  } catch (err) {
    console.error('Init failed', err);
    if (await recoverStaleRuntime(err)) return;
    const failure = initializationFailure(err);
    const root = document.getElementById('screen');
    root.innerHTML = errorState({
      title: failure.title,
      description: failure.description,
      action: '<button type="button" class="btn btn-primary" id="boot-retry">Tentar novamente</button>',
    });
    root.querySelector('#boot-retry')?.addEventListener('click', () => globalThis.location?.reload?.());
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
