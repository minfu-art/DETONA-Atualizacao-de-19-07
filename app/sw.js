/* DETONA CONCURSOS — Service Worker offline-first */
const CACHE = 'detona-v79-premium-insignias';
const ASSETS = [
  './',
  './index.html',
  './env.runtime.js',
  './css/main.css',
  './css/design-system.css',
  './manifest.json',
  './js/app.js',
  './js/core/pwaInstall.js',
  './js/core/editalUiModel.js',
  './js/core/wellbeingMessages.js',
  './js/core/routine/index.js',
  './js/core/routine/routineSchema.js',
  './js/core/routine/routinePlanner.js',
  './js/core/routine/routineConsistency.js',
  './js/core/routine/routineMetrics.js',
  './js/core/routine/routineFocus.js',
  './js/core/routine/routineCalendar.js',
  './js/services/routineService.js',
  './js/services/academicProgressService.js',
  './js/services/emblemService.js',
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
  './js/auth/activeUser.js',
  './js/auth/authDb.js',
  './js/auth/authService.js',
  './js/auth/cloudAuthService.js',
  './js/auth/passwordHasher.js',
  './js/auth/sessionService.js',
  './js/contest/activeContest.js',
  './js/contest/contestCatalog.js',
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
  './js/services/contestSummaryService.js',
  './js/services/questionExplanationService.js',
  './js/services/reviewService.js',
  './js/services/performanceService.js',
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
  './js/ui/auth.js?v=74',
  './js/ui/library.js',
  './js/ui/heroAssets.js',
  './js/ui/enemyAssets.js',
  './js/ui/icons.js',
  './js/ui/icons.js?v=66',
  './js/ui/icons.js?v=74',
  './js/ui/navigation.js?v=70',
  './js/ui/appShell.js',
  './js/ui/appShell.js?v=70',
  './js/ui/onboarding.js',
  './js/ui/onboarding.js?v=70',
  './js/ui/home.js',
  './js/ui/emblems/emblemArt.js',
  './js/ui/forge.js',
  './js/ui/worldMap.js',
  './js/ui/battleArena.js',
  './js/ui/review.js',
  './js/ui/grimorio.js',
  './js/ui/performance.js',
  './js/ui/expedition.js',
  './js/ui/wellbeingUI.js',
  './js/ui/topicTree.js',
  './js/ui/profile.js',
  './js/ui/celebration.js',
  './assets/hero/hero-warrior.png',
  './assets/hero/tiers/tier-01-09.png',
  './assets/hero/tiers/tier-10-19.png',
  './assets/hero/tiers/tier-20-29.png',
  './assets/hero/tiers/tier-30-39.png',
  './assets/hero/tiers/tier-40-49.png',
  './assets/hero/tiers/tier-50-59.png',
  './assets/hero/tiers/tier-60-69.png',
  './assets/hero/tiers/tier-70-79.png',
  './assets/hero/tiers/tier-80-89.png',
  './assets/hero/tiers/tier-90-99.png',
  './assets/hero/tiers/female/tier-01-09.png',
  './assets/hero/tiers/female/tier-10-19.png',
  './assets/hero/tiers/female/tier-20-29.png',
  './assets/hero/tiers/female/tier-30-39.png',
  './assets/hero/tiers/female/tier-40-49.png',
  './assets/hero/tiers/female/tier-50-59.png',
  './assets/hero/tiers/female/tier-60-69.png',
  './assets/hero/tiers/female/tier-70-89.png',
  './assets/hero/tiers/female/tier-90-99.png',
  './assets/hero/tiers/female/tier-100.png',
  './assets/mentor/mentor.png',
  './assets/mentor/mentora.png',
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
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
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
