/**
 * DETONA CONCURSOS — Entry point
 * Arquitetura: IndexedDB SSOT + telas modulares RO-style
 */
import { openDB } from './core/db.js';
import { ensureSeed, getPlayer } from './core/seed.js';
import { recalculateEditalSSOT } from './core/ssot.js';
import { setMuted, SFX } from './core/audio.js';
import { renderOnboarding } from './ui/onboarding.js?v=70';
import { renderHome } from './ui/home.js?v=79';
import { renderForge } from './ui/forge.js?v=71';
import { renderWorldMap } from './ui/worldMap.js?v=73';
import { renderBattle } from './ui/battleArena.js?v=74';
import { renderGrimorio } from './ui/grimorio.js?v=69';
import { renderPerformance } from './ui/performance.js?v=73';
import { renderExpedition } from './ui/expedition.js?v=72';
import { renderWellbeing } from './ui/wellbeingUI.js?v=68';
import { renderProfile } from './ui/profile.js?v=79';
import { renderCelebration } from './ui/celebration.js?v=68';
import { renderTopicTree } from './ui/topicTree.js?v=69';
import { renderReview } from './ui/review.js?v=71';
import { ICO } from './ui/icons.js?v=66';
import { initAppShell, updateAppShell } from './ui/appShell.js?v=70';
import { renderAuth } from './ui/auth.js?v=74';
import { renderLibrary } from './ui/library.js';
import { authService, libraryService, contestDataMigrationService } from './services/appServices.js';
import { canAccessDeveloperRoute, canAccessInternalRoute } from './auth/authService.js';
import { clearActiveContestId, getActiveContestId, setActiveContestId } from './contest/activeContest.js';
import { getContestById } from './contest/contestCatalog.js';
import { skeleton } from './ui/components.js';
import { primaryScreenFor } from './ui/navigation.js?v=70';
import { isCloudEnabled } from './config/cloudConfig.js';
import { bindOnlineFlush, pushAllLocalProgress, syncOnContestOpen } from './supabase/syncService.js';
import { progressRepository } from './repositories/progressRepository.js';
import { environmentLabel, isLocalDevelopment } from './config/appEnvironment.js';

const ctx = {
  battleSession: null,
  reviewSession: null,
  reviewFilters: null,
  screen: 'home',
  disciplineId: null,
  returnToTree: null,
  logout: null,
  contest: null,
  openContest: null,
  user: null,
};

let shellInitialized = false;

function injectNavIcons() {
  document.querySelectorAll('.nav-ico[data-ico]').forEach((el) => {
    const name = el.dataset.ico;
    const fn = ICO[name];
    if (fn) el.innerHTML = fn();
  });
}

const ROUTES = {
  library: renderLibrary,
  onboarding: renderOnboarding,
  home: renderHome,
  map: renderWorldMap,
  battle: renderBattle,
  forge: renderForge,
  performance: renderPerformance,
  grimorio: renderPerformance,
  edital: renderGrimorio,
  expedition: renderExpedition,
  wellbeing: renderWellbeing,
  profile: renderProfile,
  celebration: renderCelebration,
  topicTree: renderTopicTree,
  review: renderReview,
};

const NAV_VISIBLE = new Set(['home', 'map', 'edital', 'expedition', 'performance', 'wellbeing', 'profile', 'topicTree', 'review']);

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
  if (screen === 'forge' && !canAccessDeveloperRoute(authService)) {
    screen = 'home';
  }
  ctx.screen = screen;
  const root = document.getElementById('screen');
  const nav = document.getElementById('bottom-nav');
  if (!root) return;

  // nav highlight
  if (nav) {
    nav.classList.toggle('hidden', !NAV_VISIBLE.has(screen) && screen !== 'battle');
    nav.querySelectorAll('.nav-item').forEach((item) => {
      const active = item.dataset.screen === primaryScreenFor(screen);
      item.classList.toggle('active', active);
    });
  }

  root.innerHTML = skeleton(4, `Carregando ${screen}`);
  const fn = ROUTES[screen] || ROUTES.home;
  try {
    await fn(root, navigate, ctx);
  } catch (err) {
    console.error(err);
    root.innerHTML = `
      <div class="ro-window" role="alert"><div class="ro-body">
        <p style="color:var(--danger)">Erro: ${err.message || err}</p>
        <button type="button" class="btn btn-primary mt-12" id="err-home">Hoje</button>
      </div></div>`;
    document.getElementById('err-home')?.addEventListener('click', () => navigate('home'));
  }

  updateAppShell({ screen, player: await getPlayer(), contest: ctx.contest, user: ctx.user });
  root.focus({ preventScroll: true });

  window.scrollTo(0, 0);
}

function showAuth() {
  document.getElementById('app')?.classList.add('app-shell--auth');
  document.getElementById('app')?.classList.remove('app-shell--library');
  document.getElementById('bottom-nav')?.classList.add('hidden');
  const root = document.getElementById('screen');
  if (root) renderAuth(root, { authService, onAuthenticated: initializeAuthenticatedApp });
}

async function showLibrary() {
  clearActiveContestId();
  ctx.contest = null;
  ctx.screen = 'library';
  const app = document.getElementById('app');
  app?.classList.remove('app-shell--auth');
  app?.classList.add('app-shell--library');
  const root = document.getElementById('screen');
  if (!root) return;
  root.dataset.screen = 'library';
  const user = authService.getCurrentUser();
  ctx.user = user;
  const items = await libraryService.getLibrary(user);
  renderLibrary(root, {
    user,
    items,
    onOpen: openContest,
    onPurchase: async (contestId) => {
      await libraryService.purchase(user, contestId);
      await showLibrary();
    },
    onLogout: logout,
  });
  root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function openContest(contestId) {
  const user = authService.getCurrentUser();
  if (!(await libraryService.canAccess(user.id, contestId))) throw new Error('Acesso nao liberado.');
  const contest = getContestById(contestId);
  if (!contest || contest.contentStatus !== 'ready') throw new Error('Conteudo em preparacao.');
  setActiveContestId(contestId);
  ctx.contest = contest;
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
  await ensureSeed();
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
    await navigate('home');
  }
}

async function logout() {
  await authService.logout();
  clearActiveContestId();
  ctx.user = null;
  ctx.screen = 'auth';
  showAuth();
}

ctx.logout = logout;
ctx.openContest = openContest;

async function initializeAuthenticatedApp() {
  ctx.user = authService.getCurrentUser();
  document.getElementById('app')?.classList.remove('app-shell--auth');
  injectNavIcons();

  if (!shellInitialized) {
    initAppShell(navigate, { onLogout: logout });
    document.getElementById('bottom-nav')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn) return;
      SFX.click();
      navigate(btn.dataset.screen);
    });
    shellInitialized = true;
  }

  let activeContestId = getActiveContestId();
  if (!activeContestId) {
    const readyJourneys = (await libraryService.getLibrary(ctx.user))
      .filter((item) => item.owned && item.contest.contentStatus === 'ready');
    if (readyJourneys.length === 1) activeContestId = readyJourneys[0].contest.id;
  }
  if (activeContestId) {
    const contest = getContestById(activeContestId);
    const user = authService.getCurrentUser();
    const canRestore = contest?.contentStatus === 'ready'
      && await libraryService.canAccess(user.id, activeContestId);
    if (canRestore) {
      await openContest(activeContestId);
      return;
    }
    clearActiveContestId();
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
