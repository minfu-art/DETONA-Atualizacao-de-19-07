import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const uiRoot = new URL('../app/js/ui/', import.meta.url);
const cssUrl = new URL('../app/css/design-system.css', import.meta.url);
const mainCssUrl = new URL('../app/css/main.css', import.meta.url);
const dashboardCssUrl = new URL('../app/css/dashboard-jrpg.css', import.meta.url);
const appUrl = new URL('../app/js/app.js', import.meta.url);
const indexUrl = new URL('../app/index.html', import.meta.url);
const battleUiUrl = new URL('../app/js/ui/battleArena.js', import.meta.url);
const battleCoreUrl = new URL('../app/js/core/battle.js', import.meta.url);
const enemyAssetsUrl = new URL('../app/js/ui/enemyAssets.js', import.meta.url);
const reviewUiUrl = new URL('../app/js/ui/review.js', import.meta.url);
const reviewServiceUrl = new URL('../app/js/services/reviewService.js', import.meta.url);
const grimorioUrl = new URL('../app/js/ui/grimorio.js', import.meta.url);
const forgeUrl = new URL('../app/js/ui/forge.js', import.meta.url);
const shellUrl = new URL('../app/js/ui/appShell.js', import.meta.url);
const worldMapUrl = new URL('../app/js/ui/worldMap.js', import.meta.url);
const homeUrl = new URL('../app/js/ui/home.js', import.meta.url);
const topicTreeUrl = new URL('../app/js/ui/topicTree.js', import.meta.url);
const studyPresentationUrl = new URL('../app/js/ui/studyPresentation.js', import.meta.url);
const performanceUrl = new URL('../app/js/ui/performance.js', import.meta.url);
const performanceCssUrl = new URL('../app/css/performance-mobile.css', import.meta.url);
const performanceServiceUrl = new URL('../app/js/services/performanceService.js', import.meta.url);
const navigationUrl = new URL('../app/js/ui/navigation.js', import.meta.url);
const adminAppUrl = new URL('../app/js/admin/adminApp.js', import.meta.url);
const adminHtmlUrl = new URL('../app/admin.html', import.meta.url);

test('navegação principal usa uma única fonte sem renomear rotas internas', async () => {
  const [navigation, shell, html, app] = await Promise.all([
    readFile(navigationUrl, 'utf8'),
    readFile(shellUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
    readFile(appUrl, 'utf8'),
  ]);
  for (const [screen, label] of [['home', 'Hoje'], ['map', 'Estudar'], ['edital', 'Edital'], ['expedition', 'Plano'], ['performance', 'Desempenho'], ['wellbeing', 'Hábitos'], ['rankedEvent', 'Simulados'], ['library', 'Biblioteca'], ['profile', 'Perfil']]) {
    assert.match(navigation, new RegExp(`screen: '${screen}'.+label: '${label}'`));
  }
  assert.doesNotMatch(html, /data-screen="(?:home|map|edital|expedition|performance)"/);
  assert.match(shell, /DESKTOP_NAVIGATION_GROUPS/);
  assert.match(shell, /MOBILE_PRIMARY_ITEMS/);
  assert.match(shell, /MOBILE_MORE_NAVIGATION_GROUPS/);
  assert.match(shell, /primaryScreenFor\(screen\)/);
  assert.match(app, /isBottomNavigationVisible\(screen\)/);
  assert.match(navigation, /topicTree: 'map'/);
  assert.match(navigation, /battle: 'map'/);
  assert.match(navigation, /review: 'map'/);
});

test('telas nao acessam IndexedDB diretamente', async () => {
  const files = (await readdir(uiRoot)).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const source = await readFile(new URL(file, uiRoot), 'utf8');
    assert.doesNotMatch(source, /core\/db\.js/, file);
  }
});

test('acoes de UI usam botoes com tipo explicito', async () => {
  const files = (await readdir(uiRoot)).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const source = await readFile(new URL(file, uiRoot), 'utf8');
    const buttons = source.match(/<button\b[^>]*>/g) || [];
    for (const button of buttons) {
      assert.match(button, /\btype=/, `${file}: ${button}`);
      assert.equal((button.match(/\btype=/g) || []).length, 1, `${file}: atributo type duplicado em ${button}`);
    }
  }
});

test('design system cobre mobile, desktop, toque, foco e movimento reduzido', async () => {
  const css = await readFile(cssUrl, 'utf8');
  assert.match(css, /@media \(max-width:767px\)/);
  assert.match(css, /@media \(min-width:768px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /safe-area-inset-bottom/);
  for (const token of ['--detona-bg-deep', '--detona-purple', '--detona-orange', '--detona-cyan', '--detona-gold']) {
    assert.match(css, new RegExp(token));
  }
});

test('autenticacao e biblioteca integram arte aprovada sem usar os mockups como tela', async () => {
  const [auth, library] = await Promise.all([
    readFile(new URL('../app/js/ui/auth.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/ui/library.js', import.meta.url), 'utf8'),
  ]);
  assert.match(auth, /login-command-hall\.webp/);
  assert.match(auth, /auth-backdrop/);
  assert.match(library, /library-guide/);
  assert.doesNotMatch(auth + library, /ref-dashboard\.png|DETONA_UI_CONCEITO/);
});

test('login vertical preserva autenticação e aproxima a composição da arte DETONA', async () => {
  const [auth, css] = await Promise.all([
    readFile(new URL('../app/js/ui/auth.js', import.meta.url), 'utf8'),
    readFile(cssUrl, 'utf8'),
  ]);
  for (const marker of ['detona-login-card', 'auth-logo-lockup', 'auth-backdrop', 'auth-story-copy', 'auth-input', 'auth-submit']) {
    assert.match(auth, new RegExp(marker));
    assert.match(css, new RegExp(`\\.${marker}`));
  }
  assert.match(auth, /Seu próximo nível/);
  assert.match(auth, /PREPARAÇÃO DE ALTA PERFORMANCE/);
  assert.match(auth, /Esqueci minha senha/);
  assert.match(auth, /authService\.register\(input\).*authService\.login\(input\)/s);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /body:has\(\.app-shell--auth\) \.pwa-install-banner/);
});

test('autenticacao remove o recuo da sidebar e troca para coluna unica antes de comprimir o formulario', async () => {
  const css = await readFile(cssUrl, 'utf8');
  assert.match(css, /\.app-shell--auth \.app-shell__main\s*\{[^}]*width:100%[^}]*margin-left:0/s);
  assert.match(css, /\.saas-auth__form-wrap\s*\{[^}]*width:100%[^}]*max-width:430px[^}]*min-width:0/s);
  assert.match(css, /@media \(max-width:1100px\)\s*\{[^}]*\.saas-auth\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/s);
  assert.match(css, /\*,\*::before,\*::after\s*\{\s*box-sizing:border-box/);
  const html = await readFile(indexUrl, 'utf8');
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=/);
});

test('rotas academicas continuam protegidas e developer e separado antes da jornada', async () => {
  const [source, admin] = await Promise.all([readFile(appUrl, 'utf8'), readFile(adminAppUrl, 'utf8')]);
  assert.match(source, /canAccessInternalRoute\(authService\)/);
  assert.match(source, /getActiveContestId\(\)/);
  assert.match(source, /libraryService\.canAccess/);
  assert.match(source, /isDeveloperUser\(authenticatedUser\)/);
  assert.match(source, /redirectForRole\(authenticatedUser\)/);
  assert.match(admin, /isDeveloperUser\(authService\.getCurrentUser\(\)\)/);
  assert.doesNotMatch(admin, /getActiveContestId|libraryService\.canAccess|progressRepository/);
});

test('desempenho possui rota e serviço próprios derivados apenas de dados reais existentes', async () => {
  const [app, performance, service] = await Promise.all([
    readFile(appUrl, 'utf8'), readFile(performanceUrl, 'utf8'), readFile(performanceServiceUrl, 'utf8'),
  ]);
  assert.match(app, /performance:\s*renderPerformance/);
  assert.match(app, /grimorio:\s*renderPerformance/);
  assert.match(app, /edital:\s*renderGrimorio/);
  for (const store of ['player', 'disciplines', 'subtopics', 'verticalized', 'reviewQueue', 'routineBlocks', 'studySessions']) {
    assert.match(service, new RegExp(`STORES\\.${store}`));
  }
  assert.match(performance, /Domínio do edital/);
  assert.doesNotMatch(performance + service, /ranking|moeda|checkout|applyXp/i);
});

test('painel de desempenho usa Orion e identidade visual própria sem renomear a rota interna', async () => {
  const [performance, navigation, css, mobileCss] = await Promise.all([
    readFile(performanceUrl, 'utf8'),
    readFile(navigationUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
    readFile(performanceCssUrl, 'utf8'),
  ]);
  assert.match(performance, /<h1>Desempenho<\/h1>/);
  assert.match(performance, /orion-performance-analyst\.webp/);
  assert.match(performance, /Orion analisando o desempenho do estudante/);
  assert.match(navigation, /screen: 'performance'.+label: 'Desempenho'/);
  assert.match(css, /--performance-blue:#38bdf8/);
  assert.match(mobileCss, /\.ev-mastery-card__mentor/);
  assert.doesNotMatch(performance, /hero-evolution-dynamic/);
});

test('desempenho remove o painel lateral de revisões e amplia a leitura das disciplinas', async () => {
  const [performance, css, mobileCss] = await Promise.all([
    readFile(performanceUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
    readFile(performanceCssUrl, 'utf8'),
  ]);
  assert.match(performance, /performance-middle-grid performance-middle-grid--single/);
  assert.doesNotMatch(performance, /performance-reviews|performance-review-metrics|id="performance-review"/);
  assert.match(css, /\.performance-middle-grid--single\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(mobileCss, /\.performance-middle-grid--single \.ev-disc-accordion[^{]*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(mobileCss, /\.performance-middle-grid--single \.ev-disc-acc\.is-open[^{]*\{[^}]*grid-column:\s*1 \/ -1/s);
});

test('edital verticalizado mostra taxa de acerto e permite enfrentar subtópico', async () => {
  const [source, css] = await Promise.all([readFile(grimorioUrl, 'utf8'), readFile(cssUrl, 'utf8')]);
  assert.match(source, /progressBar\(/);
  assert.match(source, /Taxa de acerto/);
  assert.match(source, /Iniciar questões/);
  assert.match(source, /createBattleSession/);
  assert.match(source, /MIN_QUESTIONS_BATTLE/);
  assert.match(source, /ev-filters/);
  assert.match(source, /ev-card|ev-subcard|ev-dcard/);
  assert.match(source, /Questões respondidas/);
  assert.match(source, /Meta mínima/);
  assert.match(source, /data-open-disc/);
  assert.match(source, /data-open-sub/);
  assert.match(source, /data-toggle-disc/);
  assert.match(source, /data-toggle-group/);
  assert.match(css, /ev-topic-group__body\[hidden\].*display:none !important/);
  assert.match(source, /Ver subtópicos|disciplines/);
  assert.doesNotMatch(source, /\$\{questionCount\}\/\$\{MIN_QUESTIONS_BATTLE\} questões mínimas/);
});

test('administracao sai do shell academico e usa aplicacao developer independente', async () => {
  const [shell, html, tree, studyPresentation, adminHtml, adminApp] = await Promise.all([
    readFile(shellUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
    readFile(topicTreeUrl, 'utf8'),
    readFile(studyPresentationUrl, 'utf8'),
    readFile(adminHtmlUrl, 'utf8'),
    readFile(adminAppUrl, 'utf8'),
  ]);
  assert.doesNotMatch(html, /data-screen="forge"/);
  assert.doesNotMatch(shell, /data-developer-only|DEVELOPER_ITEM|screen:\s*'forge'/);
  assert.doesNotMatch(tree, /m-forge|navigate\('forge'\)/);
  assert.match(studyPresentation, /Questões ainda não disponíveis/);
  assert.match(adminHtml, /js\/admin\/adminApp\.js/);
  assert.match(adminApp, /developer|renderAdminAccessScreen|renderAdminMessagesScreen/);
});

test('Estudar inicia na visão geral sem abrir Português automaticamente', async () => {
  const source = await readFile(worldMapUrl, 'utf8');
  assert.match(source, /Escolha uma disciplina e avance pelo edital/);
  assert.match(source, /study-discipline-card/);
  assert.match(source, /discIcon\(item\.id/);
  assert.match(source, /ctx\.disciplineId = button\.dataset\.disciplineId/);
  assert.doesNotMatch(source, /createBattleSession|enemyImgHtml|biome/);
});

test('personagem possui animação de repouso na tela inicial e na batalha', async () => {
  const css = await readFile(mainCssUrl, 'utf8');
  assert.match(css, /\.hero-img--home\s*\{[^}]*animation:\s*heroIdle/s);
  assert.match(css, /\.fighter \.hero-img--battle\s*\{[^}]*animation:\s*heroBattleIdle/s);
  assert.match(css, /\.hero-img--profile\s*\{[^}]*animation:\s*heroPortraitIdle/s);
  assert.match(css, /@keyframes heroBattleIdle/);
  assert.match(css, /heroBattleIdleFlip/);
});

test('Home Hoje prioriza próxima missão e mantém somente indicadores acionáveis', async () => {
  const source = await readFile(homeUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');
  const dashboardCss = await readFile(dashboardCssUrl, 'utf8');
  assert.match(source, /renderTodayCommandCenter/);
  assert.match(source, /Sua próxima missão/);
  assert.match(source, /Revisões pendentes/);
  assert.doesNotMatch(source, /Progresso do dia/);
  assert.match(source, /FALTAM/);
  assert.match(source, /mentorCommunication/);
  assert.match(source, /officialMentorHtml/);
  assert.doesNotMatch(source, /Conquistas recentes/);
  assert.match(dashboardCss, /\.dj-mentor/);
  assert.match(css, /today-mission/);
  assert.match(css, /today-grid/);
  assert.match(source, /renderOrionEvolution\(orionEvolution\)/);
  assert.match(css, /orion-evolution/);
});

test('resultado do desafio comunica domínio e XP sem misturar LV acadêmico', async () => {
  const [ui, core] = await Promise.all([readFile(battleUiUrl, 'utf8'), readFile(battleCoreUrl, 'utf8')]);
  for (const label of [
    'Resultado da missão', 'Domínio atualizado', 'Melhor resultado', 'Disciplina',
    'Nível global', 'Tentativas', 'Revisão',
  ]) assert.match(ui, new RegExp(label));
  assert.match(ui, /XP e recompensas confirmadas/);
  assert.match(ui, /summary\.xpEarned/);
  assert.match(core, /grantBattleXp/);
  assert.doesNotMatch(core, /player\.level\s*[+*/-]?=/);
});

test('fundo da arena resolve a partir da folha de estilos', async () => {
  const source = await readFile(enemyAssetsUrl, 'utf8');
  assert.match(source, /\.\.\/assets\/battle\/arena-bg\.jpg/);
});

test('batalha prioriza leitura, confirmação, confiança e explicação didática', async () => {
  const source = await readFile(battleUiUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');
  assert.match(source, /battle-question__statement/);
  assert.match(source, /Escolha sua resposta/);
  assert.match(source, /id="btn-answer" disabled/);
  assert.match(source, /answer-confidence/);
  assert.match(source, /renderBattleFeedback/);
  assert.match(source, /Esta questão entrou no seu ciclo de revisão/);
  assert.match(source, /Entenda a lógica da resposta/);
  assert.match(css, /battle-feedback--correct/);
  assert.match(css, /battle-feedback--wrong/);
  assert.match(css, /battle-confidence\.is-attention/);
  assert.match(css, /battle-review-note--review/);
});

test('revisão informa memória, próxima data e XP persistido sem domínio oficial', async () => {
  const presentationUrl = new URL('../app/js/ui/reviewPresentation.js', import.meta.url);
  const [ui, service, presentation] = await Promise.all([
    readFile(reviewUiUrl, 'utf8'), readFile(reviewServiceUrl, 'utf8'), readFile(presentationUrl, 'utf8'),
  ]);
  for (const label of ['Questões revisadas', 'Acertos', 'Erros', 'Memória fortalecida', 'Permanecem quentes', 'Próxima revisão']) {
    assert.match(ui, new RegExp(label));
  }
  assert.match(ui, /XP persistido/);
  assert.match(presentation, /summary\.xp/);
  assert.doesNotMatch(service, /recalculateEditalSSOT|applyOfficialMasteryAttempt|levelFromMastery|applyXp/);
});

test('review presents a strategic plan without changing the queue engine', async () => {
  const [ui, service, css, home] = await Promise.all([
    readFile(reviewUiUrl, 'utf8'), readFile(reviewServiceUrl, 'utf8'), readFile(cssUrl, 'utf8'), readFile(homeUrl, 'utf8'),
  ]);
  for (const marker of ['review-summary__recommendation', 'review-start', 'review-queue__list', 'review-priority']) {
    assert.match(ui, new RegExp(marker));
  }
  assert.match(ui, /Consolidação da memória/);
  assert.match(ui, /Revisão inteligente/);
  assert.match(ui, /\$\{view\.total\} \$\{view\.total === 1/);
  assert.doesNotMatch(ui, /\u00c3|\u00c2|\u00e2\u20ac/);
  assert.match(service, /selectReviewItems\(items/);
  assert.match(service, /describeReviewItem/);
  for (const marker of ['review-type--error', 'review-type--confidence', 'review-type--recurring', 'review-type--scheduled']) {
    assert.match(css, new RegExp(marker));
  }
  assert.match(ui, /review-state__signals/);
  assert.match(home, /today-review.*addEventListener\('click'.*startReview\(\)/s);
});
