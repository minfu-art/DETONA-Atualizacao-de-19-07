/* DETONA CONCURSOS — Service Worker offline-first */
const CACHE = 'detona-v119-study-plan-capacity';
const CONTENT_CACHE_PREFIX = 'detona-contest-content:';
const ASSETS = [
  './',
  './index.html',
  './env.runtime.js',
  './css/main.css',
  './css/design-system.css',
  './css/review.css',
  './css/ranked-functional.css',
  './css/dashboard-jrpg.css',
  './manifest.json',
  './js/app.js',
  './js/core/pwaInstall.js',
  './js/core/editalUiModel.js',
  './js/core/wellbeingMessages.js',
  './js/core/routine/index.js',
  './js/core/routine/routineSchema.js',
  './js/core/routine/routinePlanner.js',
  './js/core/routine/studyPlanContract.js',
  './js/core/routine/routineConsistency.js',
  './js/core/routine/routineMetrics.js',
  './js/core/routine/routineFocus.js',
  './js/core/routine/routineCalendar.js',
  './js/services/routineService.js',
  './js/services/academicProgressService.js',
  './js/services/dailyGoalService.js',
  './js/services/studyStreakService.js',
  './js/services/emblemService.js',
  './js/services/dailyCharacterMessage.js',
  './js/services/rankedEventService.js',
  './js/core/rankedSimulation.js',
  './js/core/localDate.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-256.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './js/core/types.js',
  './js/core/db.js',
  './js/core/ssot.js',
  './js/core/memory.js',
  './js/core/progression.js',
  './js/core/mastery.js',
  './js/core/kafra.js',
  './js/core/audio.js',
  './js/core/seed.js',
  './js/core/battle.js',
  './js/core/questionImport.js',
  './js/core/questionSchema.js',
  './js/core/questionSelection.js',
  './js/config/questionSourceConfig.js',
  './js/config/env.js',
  './js/config/appEnvironment.js',
  './js/config/cloudConfig.js',
  './js/config/subtopicAliases.js',
  './js/repositories/questionRepository.js',
  './js/services/questionService.js',
  './js/core/reviewQueue.js',
  './js/core/backupSchema.js',
  './js/core/dailyMeta.js',
  './js/core/wellbeing.js',
  './js/privacy/localPersonalData.js',
  './js/repositories/localPersonalRepository.js',
  './js/services/habitReminderService.js',
  './js/services/kaelyHabitService.js',
  './js/auth/activeUser.js',
  './js/auth/academicSessionContext.js',
  './js/auth/authDb.js',
  './js/auth/authService.js',
  './js/auth/cloudAuthService.js',
  './js/auth/passwordHasher.js',
  './js/auth/sessionService.js',
  './js/contest/activeContest.js',
  './js/contest/contestCatalog.js',
  './js/contest/contestRuntime.js',
  './js/repositories/entitlementRepository.js',
  './js/repositories/progressRepository.js',
  './js/repositories/userRepository.js',
  './js/supabase/client.js',
  './js/supabase/authAdapter.js',
  './js/supabase/entitlementRepository.js',
  './js/supabase/hybridProgressAdapter.js',
  './js/supabase/progressCloud.js',
  './js/supabase/syncService.js',
  './js/services/appServices.js',
  './js/services/legacyDataMigrationService.js',
  './js/services/contestDataMigrationService.js',
  './js/services/checkoutService.js',
  './js/services/libraryService.js',
  './js/services/careerLibraryService.js',
  './js/services/contestCatalogService.js',
  './js/services/contestContentService.js',
  './js/services/contestSummaryService.js',
  './js/services/questionExplanationService.js',
  './js/services/reviewService.js',
  './js/services/performanceService.js',
  './js/services/orionEvolutionService.js',
  './js/services/eviDailyMissionService.js',
  './js/data/editalSeed.js',
  './js/data/emblemCatalog.js',
  './js/data/insigniaCatalog.js',
  './js/data/phrases.js',
  './js/data/questions_pc_al_port.json',
  './js/data/questions_pc_al_lote.json',
  './data/questions/index.json',
  './data/questions/analise_de_dados.json',
  './data/questions/contabilidade.json',
  './data/questions/direitos_humanos.json',
  './data/questions/direito_constitucional.json',
  './data/questions/direito_penal.json',
  './data/questions/estatistica.json',
  './data/questions/etica.json',
  './data/questions/legislacao_estadual_estatutos_de_alagoas.json',
  './data/questions/lingua_portuguesa.json',
  './data/questions/raciocinio_logico_matematico.json',
  './data/questions/seguranca_cibernetica.json',
  './data/questions/tecnologia_informacao.json',
  './data/questions/curated/detona_ineditas_pacto_sao_jose.json',
  './data/questions/curated/detona_ineditas_analise_de_dados.json',
  './data/questions/curated/detona_piloto_25_xlsx.json',
  './js/ui/helpers.js',
  './js/ui/components.js',
  './js/ui/auth.js',
  './js/ui/auth.js?v=75',
  './js/ui/library.js',
  './js/ui/heroAssets.js',
  './js/ui/enemyAssets.js',
  './js/ui/icons.js',
  './js/ui/icons.js?v=66',
  './js/ui/icons.js?v=74',
  './js/ui/navigation.js?v=73',
  './js/ui/appShell.js',
  './js/ui/appShell.js?v=72',
  './js/ui/onboarding.js',
  './js/ui/onboarding.js?v=70',
  './js/ui/home.js',
  './js/ui/homeHabitState.js',
  './js/ui/studyPresentation.js',
  './js/ui/orionEvolution.js',
  './js/ui/eviDailyMission.js',
  './js/ui/mentorCommunication.js',
  './js/ui/rankedEvent.js',
  './js/ui/rankedVisualModel.js',
  './js/ui/emblems/emblemArt.js',
  './js/ui/forge.js',
  './js/ui/worldMap.js',
  './js/ui/battleArena.js',
  './js/ui/review.js',
  './js/ui/reviewPresentation.js',
  './js/ui/grimorio.js',
  './js/ui/performance.js',
  './js/ui/expedition.js',
  './js/ui/studyPlanVisualModel.js',
  './css/plan-edital.css',
  './js/ui/wellbeingUI.js',
  './js/ui/topicTree.js',
  './js/ui/profile.js',
  './js/ui/celebration.js',
  './assets/hero/hero-warrior.png',
  './assets/ui/login-command-hall.webp',
  './assets/hero/tiers-v2/male/stage-01.png',
  './assets/hero/tiers-v2/male/stage-02.png',
  './assets/hero/tiers-v2/male/stage-03.png',
  './assets/hero/tiers-v2/male/stage-04.png',
  './assets/hero/tiers-v2/male/stage-05.png',
  './assets/hero/tiers-v2/male/stage-06.png',
  './assets/hero/tiers-v2/male/stage-07.png',
  './assets/hero/tiers-v2/male/stage-08.png',
  './assets/hero/tiers-v2/male/stage-09.png',
  './assets/hero/tiers-v2/male/stage-10.png',
  './assets/hero/tiers-v2/female/stage-01.png',
  './assets/hero/tiers-v2/female/stage-02.png',
  './assets/hero/tiers-v2/female/stage-03.png',
  './assets/hero/tiers-v2/female/stage-04.png',
  './assets/hero/tiers-v2/female/stage-05.png',
  './assets/hero/tiers-v2/female/stage-06.png',
  './assets/hero/tiers-v2/female/stage-07.png',
  './assets/hero/tiers-v2/female/stage-08.png',
  './assets/hero/tiers-v2/female/stage-09.png',
  './assets/hero/tiers-v2/female/stage-10.png',
  './assets/mentor/mentor.png',
  './assets/mentor/mentora.png',
  './assets/mentor/orion-evolution.png',
  './assets/mentor/orion-performance-analyst.webp',
  './assets/mentors/evi.webp',
  './assets/mentors/evi-plan-strategist.webp',
  './assets/mentors/kaely-resistance.webp',
  './assets/mentors/kiro-official.webp',
  './assets/battle/arena-bg.jpg',
  './assets/enemies/enemy-1.png',
  './assets/enemies/enemy-2.png',
  './assets/enemies/enemy-3.png',
  './assets/enemies/enemy-4.png',
  './assets/enemies/enemy-5.png',
  './assets/enemies/enemy-6.png',
  './assets/enemies/enemy-7.png',
  './assets/enemies/enemy-8.png',
  './assets/enemies/enemy-9.png',
  './assets/enemies/enemy-10.png',
  './assets/enemies/enemy-11.png',
  './assets/enemies/enemy-12.png',
  './assets/enemies/enemy-13.png',
  './assets/enemies/enemy-14.png',
  './assets/enemies/enemy-15.png',
  './assets/enemies/enemy-16.png',
  './assets/ui/level-badge.png',
  './assets/insignias/journey-tier-01.webp',
  './assets/insignias/journey-tier-02.webp',
  './assets/insignias/journey-tier-03.webp',
  './assets/insignias/journey-tier-04.webp',
  './assets/insignias/journey-tier-05.webp',
  './assets/insignias/consistency-tier-01.webp',
  './assets/insignias/consistency-tier-02.webp',
  './assets/insignias/consistency-tier-03.webp',
  './assets/insignias/consistency-tier-04.webp',
  './assets/insignias/consistency-tier-05.webp',
  './assets/insignias/consistency-tier-06.webp',
  './assets/insignias/missions-tier-01.webp',
  './assets/insignias/missions-tier-02.webp',
  './assets/insignias/missions-tier-03.webp',
  './assets/insignias/missions-tier-04.webp',
  './assets/insignias/missions-tier-05.webp',
  './assets/insignias/missions-tier-06.webp',
  './assets/insignias/missions-tier-07.webp',
  './assets/insignias/focus-tier-01.webp',
  './assets/insignias/focus-tier-02.webp',
  './assets/insignias/focus-tier-03.webp',
  './assets/insignias/focus-tier-04.webp',
  './assets/insignias/focus-tier-05.webp',
  './assets/insignias/focus-tier-06.webp',
  './assets/insignias/domain-tier-01.webp',
  './assets/insignias/domain-tier-02.webp',
  './assets/insignias/domain-tier-03.webp',
  './assets/insignias/domain-tier-04.webp',
  './assets/insignias/domain-tier-05.webp',
  './assets/insignias/domain-tier-06.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map(async (asset) => {
        try {
          await cache.add(asset);
        } catch (error) {
          // A CI garante que os caminhos existem. Em runtime, uma falha de rede
          // isolada não deve impedir que os demais assets fiquem disponíveis.
          console.warn('[sw] asset não armazenado no pré-cache', asset, error);
        }
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE && !key.startsWith(CONTENT_CACHE_PREFIX)).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const appCode = e.request.mode === 'navigate'
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.json')
    || url.pathname.endsWith('/manifest.json');

  if (appCode) {
    e.respondWith(
      fetch(new Request(e.request, { cache: 'reload' }))
        .then(async (res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            await caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows[0];
    if (existing) {
      existing.postMessage({ type: 'DETONA_NAVIGATE', screen: 'wellbeing' });
      return existing.focus();
    }
    return self.clients.openWindow('./?screen=wellbeing');
  })());
});
