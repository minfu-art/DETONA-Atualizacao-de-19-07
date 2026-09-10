import { escapeHtml, formatDate } from './helpers.js';
import { CHECKOUT_ARTWORK } from '../contest/checkoutArtwork.js';
import { progressBar } from './components.js';
import { icon } from './icons.js';
import { selectActiveJourney } from '../services/careerLibraryService.js';
import {
  formatCanonicalPrice,
  partitionLibrary,
  resolveCheckoutReturn,
  resolveCommercialIntent,
} from '../services/studentEntryModel.js';
import {
  closeReservedCheckoutWindow,
  reserveCheckoutBrowserWindow,
} from '../services/checkoutNavigation.js';

const plural = (amount, singular, multiple) => `${amount} ${amount === 1 ? singular : multiple}`;
const safePercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

function courseArt(contest, { eager = false } = {}) {
  const artwork = contest.coverAsset || CHECKOUT_ARTWORK[contest.id];
  if (artwork) {
    return `<img src="${escapeHtml(artwork)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
  }
  return `<div class="owned-course-art__fallback" aria-hidden="true"><span>${escapeHtml(contest.icon || 'D')}</span><strong>${escapeHtml(contest.code)}</strong><small>DETONA CONCURSOS</small></div>`;
}

function contestTheme(contest) {
  return `style="--contest:${escapeHtml(contest.color)};--contest-accent:${escapeHtml(contest.accent)}"`;
}

function homologationStatus(contest) {
  if (contest.previewOnly !== true) return '';
  return '<div class="owned-course-card__testing" role="status"><strong>EM TESTE</strong><span>NÃO PUBLICADO</span></div>';
}

function publicCoursesAction({ href, offline, label = '+ ADICIONAR CURSOS', className = '' }) {
  const classes = `library-public-courses ${className}`.trim();
  if (offline || !href) {
    return `<button type="button" class="${classes}" data-public-courses disabled aria-describedby="library-offline-courses">${escapeHtml(label)}</button>`;
  }
  return `<a class="${classes}" data-public-courses href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function continueJourney(item) {
  const { contest, summary } = item;
  const progress = safePercent(summary?.editalCompletionPct);
  const subtopicCount = Number(contest.subtopicCount || 0);
  const questionCount = Number(contest.questionCount || 0);
  const started = progress > 0 || Boolean(summary?.lastAccessAt);
  const actionLabel = started ? 'CONTINUAR ESTUDANDO' : 'COMEÇAR JORNADA';
  const statusCopy = summary?.lastAccessAt
    ? `Última atividade em ${escapeHtml(formatDate(summary.lastAccessAt))}`
    : 'Sua primeira missão está pronta.';
  const facts = [
    subtopicCount > 0 ? `<span><strong>${subtopicCount.toLocaleString('pt-BR')}</strong> subtópicos</span>` : '',
    questionCount > 0 ? `<span><strong>${questionCount.toLocaleString('pt-BR')}</strong> questões</span>` : '',
  ].filter(Boolean).join('');

  return `
    <section class="active-journey" aria-labelledby="active-journey-title" ${contestTheme(contest)}>
      <div class="active-journey__backdrop" aria-hidden="true">${courseArt(contest, { eager: true })}</div>
      <div class="active-journey__content">
        <div class="active-journey__eyebrow">
          <span class="active-journey__access">${icon('shieldCheck', 'ico--inline')} ACESSO LIBERADO</span>
          <strong class="active-journey__code">${escapeHtml(contest.code)}</strong>
        </div>
        ${homologationStatus(contest)}
        <div class="active-journey__title">
          <span class="library-kicker">SUA JORNADA PRINCIPAL</span>
          <h2 id="active-journey-title">${escapeHtml(contest.name)}</h2>
          <p>${escapeHtml(contest.role)}</p>
        </div>
        <div class="active-journey__progress">
          <div class="active-journey__progress-copy"><span>PROGRESSO NO EDITAL</span><strong>${progress}%</strong></div>
          ${progressBar({ value: progress, label: 'Progresso no edital', tone: 'plasma' })}
        </div>
        ${facts ? `<div class="active-journey__facts" aria-label="Conteúdo da jornada">${facts}</div>` : ''}
        <div class="active-journey__footer">
          <small>${statusCopy}</small>
          <button type="button" class="active-journey__action" data-open-contest="${escapeHtml(contest.id)}">${contest.previewOnly === true ? 'TESTAR CURSO' : actionLabel} <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <p class="library-action-feedback" data-card-feedback role="status" aria-live="polite"></p>
    </section>`;
}

function ownedCourseCard(item, { active = false } = {}) {
  const { contest, summary } = item;
  const progress = safePercent(summary?.editalCompletionPct);
  const contentUnavailable = contest.contentStatus !== 'ready';
  const preorder = contest.salesStatus === 'preorder';
  const disabled = item.accessVerificationRequired === true || contentUnavailable;
  const started = progress > 0 || Boolean(summary?.lastAccessAt);
  const accessLabel = item.accessVerificationRequired
    ? 'VALIDAÇÃO NECESSÁRIA'
    : contentUnavailable && preorder ? 'PRÉ-VENDA CONFIRMADA' : 'ACESSO LIBERADO';
  const actionLabel = item.accessVerificationRequired
    ? 'CONECTE-SE PARA VALIDAR'
    : contentUnavailable
      ? preorder ? 'PRÉ-VENDA CONFIRMADA' : 'CONTEÚDO EM PREPARAÇÃO'
      : contest.previewOnly === true
        ? 'TESTAR CURSO'
        : started ? 'CONTINUAR CURSO' : 'COMEÇAR CURSO';
  const facts = [
    Number(contest.subtopicCount || 0) > 0 ? `${Number(contest.subtopicCount).toLocaleString('pt-BR')} subtópicos` : '',
    Number(contest.questionCount || 0) > 0 ? `${Number(contest.questionCount).toLocaleString('pt-BR')} questões` : '',
  ].filter(Boolean).join(' · ');
  const titleId = `owned-course-${escapeHtml(contest.id)}`;

  return `
    <article class="owned-course-card ${active ? 'owned-course-card--active' : ''}" data-contest-card="${escapeHtml(contest.id)}" ${contestTheme(contest)} aria-labelledby="${titleId}">
      <div class="owned-course-card__art">
        ${courseArt(contest)}
        <span class="owned-course-card__access">${icon('shieldCheck', 'ico--inline')} ${accessLabel}</span>
      </div>
      <div class="owned-course-card__body">
        <div class="owned-course-card__heading"><span class="owned-course-card__code">${escapeHtml(contest.code)}</span>${homologationStatus(contest)}</div>
        <h3 id="${titleId}">${escapeHtml(contest.name)}</h3>
        <p class="owned-course-card__role">${escapeHtml(contest.role)}</p>
        <div class="owned-course-card__mastery"><span>PROGRESSO NO EDITAL</span><strong>${progress}%</strong></div>
        ${progressBar({ value: progress, label: 'Progresso no edital', tone: 'plasma' })}
        ${facts ? `<p class="owned-course-card__counts">${facts}</p>` : ''}
        <p class="owned-course-card__last">${contentUnavailable && preorder ? 'Seu acesso está garantido. Avisaremos quando a jornada inicial for liberada.' : summary?.lastAccessAt ? `Última atividade em ${escapeHtml(formatDate(summary.lastAccessAt))}` : 'Pronto para começar.'}</p>
        <button type="button" class="owned-course-card__action" data-open-contest="${escapeHtml(contest.id)}" ${disabled ? 'disabled' : ''}>${actionLabel} <span aria-hidden="true">→</span></button>
        <p class="library-action-feedback" data-card-feedback role="status" aria-live="polite"></p>
      </div>
    </article>`;
}

function supportLinks(links = {}) {
  const entries = [
    links.support ? ['Contato e suporte', links.support] : null,
    links.terms ? ['Termos de Uso', links.terms] : null,
    links.privacy ? ['Privacidade', links.privacy] : null,
  ].filter(Boolean);
  return entries.map(([label, href]) => `<a href="${escapeHtml(href)}" ${href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`).join('');
}

const ACQUISITION_FEATURES = Object.freeze([
  Object.freeze({
    icon: 'question',
    eyebrow: 'PRÁTICA DIRECIONADA',
    title: 'Banco de questões',
    description: 'Treine pelo conteúdo do edital e transforme cada resposta em informação para o próximo passo.',
  }),
  Object.freeze({
    icon: 'book',
    eyebrow: 'ENSINO',
    title: 'Edital como trilha de aprendizagem',
    description: 'O conteúdo deixa de ser uma lista solta e passa a orientar o que estudar em cada etapa.',
  }),
  Object.freeze({
    icon: 'map',
    eyebrow: 'ORGANIZAÇÃO',
    title: 'Edital verticalizado',
    description: 'Disciplinas, tópicos e subtópicos organizados para você enxergar avanço e lacunas com clareza.',
  }),
  Object.freeze({
    icon: 'swordsCrossed',
    eyebrow: 'CONSTÂNCIA',
    title: 'Missões, gamificação e revisões',
    description: 'Metas e encaminhamentos de revisão ajudam a manter ritmo sem perder o foco no aprendizado.',
  }),
  Object.freeze({
    icon: 'chartSteps',
    eyebrow: 'ESTRATÉGIA',
    title: 'Seu estado de preparação',
    description: 'Acompanhe domínio, desempenho, tempo e memória para decidir onde seu esforço vale mais.',
  }),
  Object.freeze({
    icon: 'trophy',
    eyebrow: 'SIMULADOS',
    title: 'Ranking entre matriculados',
    description: 'Participe de simulados e compare seu resultado com os demais alunos quando houver evento ativo.',
  }),
]);

function formatExamDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function acquisitionMetrics(contest) {
  const metrics = [];
  const questionCount = Number(contest.questionCount || 0);
  const subtopicCount = Number(contest.subtopicCount || 0);
  const examDate = formatExamDate(contest.examDate);
  if (questionCount > 0) metrics.push({ value: questionCount.toLocaleString('pt-BR'), label: 'questões no banco' });
  if (subtopicCount > 0) metrics.push({ value: subtopicCount.toLocaleString('pt-BR'), label: 'subtópicos organizados' });
  if (examDate) metrics.push({ value: examDate, label: 'data da prova' });
  return metrics.map(({ value, label }) => `<div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('');
}

function acquisitionFeatures() {
  return ACQUISITION_FEATURES.map((feature) => `
    <article class="acquisition-feature">
      <span class="acquisition-feature__icon">${icon(feature.icon)}</span>
      <div><small>${escapeHtml(feature.eyebrow)}</small><h3>${escapeHtml(feature.title)}</h3><p>${escapeHtml(feature.description)}</p></div>
    </article>`).join('');
}

function paymentTrustBlock({ compact = false } = {}) {
  return `
    <div class="acquisition-payment-trust ${compact ? 'acquisition-payment-trust--compact' : ''}" aria-label="Segurança do pagamento">
      <div class="acquisition-payment-trust__brand">
        <img src="assets/brands/mercado-pago-logo-footer-official.svg" alt="Mercado Pago" loading="lazy" decoding="async">
      </div>
      <strong>${icon('lock', 'ico--inline')} Pagamento seguro processado pelo Mercado Pago</strong>
      <p>Você será redirecionado para pagar. O DETONA não recebe os dados do seu cartão.</p>
      <div class="acquisition-payment-trust__proofs">
        <span>${icon('checkCircle', 'ico--inline')} Retorno automático ao DETONA</span>
        <span>${icon('shield', 'ico--inline')} 7 dias de garantia pelo DETONA</span>
      </div>
    </div>`;
}

function checkoutReturnCard(notice, { preview = false } = {}) {
  if (!notice) return '';
  const action = notice.action === 'enter'
    ? '<button type="button" class="checkout-return__primary" data-return-enter>ENTRAR NA MINHA JORNADA</button>'
    : notice.action === 'retry'
      ? '<button type="button" class="checkout-return__primary" data-return-retry>TENTAR NOVAMENTE</button>'
      : notice.action === 'offer'
        ? '<button type="button" class="checkout-return__primary" data-return-offer>VOLTAR PARA A OFERTA</button>'
        : '<button type="button" class="checkout-return__secondary" data-refresh-access>ATUALIZAR SITUAÇÃO</button>';
  return `
    <section class="checkout-return checkout-return--${escapeHtml(notice.tone)}" data-checkout-return aria-labelledby="checkout-return-title">
      <span class="checkout-return__icon">${notice.confirmed ? icon('checkCircle') : notice.state === 'pending' ? icon('focus') : notice.state === 'rejected' ? icon('alert') : icon('shield')}</span>
      <div><span class="library-kicker">RETORNO DO MERCADO PAGO</span><h2 id="checkout-return-title">${escapeHtml(notice.title)}</h2><p>${escapeHtml(notice.description)}</p></div>
      <aside><strong>${icon('shieldCheck', 'ico--inline')} Validação feita pelo backend</strong><span>O DETONA nunca libera acesso apenas pelos parâmetros da URL de retorno.</span></aside>
      <div class="checkout-return__actions">${action}${preview ? '<small>Estado demonstrativo do preview local.</small>' : ''}</div>
    </section>`;
}

function commercialIntentCard(resolution, links = {}, { preview = false, offerHidden = false } = {}) {
  if (!resolution) return '';
  const fallback = links.courses
    ? `<a href="${escapeHtml(links.courses)}" target="_blank" rel="noopener noreferrer">Voltar aos cursos</a>`
    : '';
  if (!resolution.item) {
    return `<aside class="commercial-intent commercial-intent--unavailable" role="status"><div><span class="library-kicker">CURSO SELECIONADO</span><h2>Esta jornada não está disponível neste app.</h2><p>Volte ao site oficial para conferir os cursos atuais.</p></div>${fallback}</aside>`;
  }
  const { contest } = resolution.item;
  if (resolution.state === 'owned') {
    return `<aside class="commercial-intent commercial-intent--owned" role="status"><div><span class="library-kicker">ACESSO JÁ LIBERADO</span><h2>${escapeHtml(contest.name)}</h2><p>Esta jornada já pertence à sua conta e aparece em Meus Cursos.</p></div></aside>`;
  }
  const price = formatCanonicalPrice(contest);
  const actionable = resolution.state === 'ready' && price;
  const preorder = contest.salesStatus === 'preorder';
  const metrics = acquisitionMetrics(contest);
  return `
    <div data-acquisition-offer ${offerHidden ? 'hidden' : ''}>
    <section class="commercial-intent ${actionable ? 'commercial-intent--ready' : 'commercial-intent--unavailable'}" ${contestTheme(contest)} aria-labelledby="commercial-intent-title">
      <div class="acquisition-hero acquisition-hero--compact" ${CHECKOUT_ARTWORK[contest.id] ? `style="--checkout-art:url('${escapeHtml(new URL('../../' + CHECKOUT_ARTWORK[contest.id], import.meta.url).href)}')"` : ''}>
        <div class="commercial-intent__content">
          <span class="library-kicker">${preorder ? 'PRÉ-VENDA SELECIONADA' : 'CURSO SELECIONADO'}</span>
          <p class="acquisition-code">${escapeHtml(contest.code)}</p>
          <h2 id="commercial-intent-title">${escapeHtml(contest.name)}</h2>
          <p class="acquisition-role">${escapeHtml(contest.role || 'Preparação completa')}</p>
          <p class="acquisition-description">${escapeHtml(contest.description || 'Uma jornada de preparação organizada pelo edital.')}</p>
          ${metrics ? `<div class="acquisition-metrics" aria-label="Dados do curso">${metrics}</div>` : ''}
        </div>
        <aside class="commercial-intent__action" aria-label="Aquisição do curso">
          <span>${preorder ? 'RESERVA DA JORNADA' : 'ACESSO AO CURSO'}</span>
          ${price ? `<strong class="commercial-intent__price">${escapeHtml(price)}</strong><small>pagamento único</small>` : ''}
          <ul>
            <li>${icon('check', 'ico--inline')} Curso vinculado à sua conta</li>
            <li>${icon('check', 'ico--inline')} Acesso liberado após confirmação</li>
            <li>${icon('shieldCheck', 'ico--inline')} 7 dias de garantia pelo DETONA</li>
          </ul>
          ${paymentTrustBlock({ compact: true })}
          <p class="checkout-redirect-guide">Você será direcionado ao Mercado Pago para finalizar sua compra. Prefere pagar pelo navegador? Se aparecer o aviso para abrir outro aplicativo com as opções “Voltar” e “Continuar”, toque em <strong>“Voltar”</strong>.</p>
          ${actionable
            ? `<button type="button" data-commercial-intent="${escapeHtml(contest.id)}">CONTINUAR PARA O PAGAMENTO SEGURO <span aria-hidden="true">→</span></button>`
            : `<p>${resolution.state === 'offline' ? 'Conecte-se para validar a disponibilidade.' : 'Pagamento temporariamente indisponível.'}</p>${fallback}`}
          <p class="library-action-feedback" data-commercial-feedback role="status" aria-live="polite"></p>
        </aside>
      </div>
      <div class="acquisition-value" aria-labelledby="acquisition-value-title">
        <h2 id="acquisition-value-title">Seu sonho pode ser grande. O preço para começar não precisa ser.</h2>
        <picture class="acquisition-price-manifesto">
          <source media="(max-width: 600px)" srcset="assets/manifesto-price-mobile.webp">
          <img src="assets/manifesto-price-desktop.webp" alt="O valor do DETONA é simbólico: não queremos que o preço seja a barreira entre alguém e o seu sonho." loading="lazy" decoding="async">
        </picture>
      </div>
    </section>
    </div>`;
}

export function renderLibrary(root, {
  user,
  items,
  activeContestId = null,
  commerceReturn = null,
  commerceStatus = null,
  commercialIntent = null,
  checkoutPreview = false,
  offline = false,
  validating = false,
  links = {},
  onOpen,
  onRefreshAccess = async () => {},
  onPurchase = async () => {},
  onConfirmedPurchase = async () => {},
  onLogout,
  embedded = false,
}) {
  const { owned } = partitionLibrary(items);
  const activeJourney = selectActiveJourney(owned, activeContestId);
  const activeJourneyVisible = activeJourney && !activeJourney.accessVerificationRequired;
  const ownedOrdered = activeJourneyVisible
    ? owned.filter(({ contest }) => contest.id !== activeJourney.contest.id)
    : owned;
  const notice = resolveCheckoutReturn(commerceReturn, items, commerceStatus);
  const intentResolution = resolveCommercialIntent(commercialIntent, items);
  const acquisitionMode = Boolean(intentResolution?.item && intentResolution.state !== 'owned');
  const returnMode = Boolean(notice);
  const openingContests = new Set();
  const checkoutAttempts = new Set();
  const libraryCount = plural(owned.length, 'jornada liberada', 'jornadas liberadas');

  root.innerHTML = `
    <div class="library-page student-library student-library--private ${acquisitionMode ? 'student-library--acquisition' : ''} ${embedded ? 'library-page--embedded' : ''}">
      ${embedded ? '' : `<header class="library-header"><div class="saas-brand"><img class="saas-brand__mark" src="assets/icons/icon-192.png" alt="" width="44" height="44" decoding="async"><strong>DETONA <em>CONCURSOS</em></strong></div><div class="library-account"><span>${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div><button id="library-logout" type="button">Sair</button></div></header>`}
      <header class="private-library-header ${acquisitionMode ? 'private-library-header--acquisition' : ''}">
        <div class="private-library-header__copy">
          <span class="library-kicker">${acquisitionMode ? 'AQUISIÇÃO SEGURA' : 'BIBLIOTECA DO ALUNO'}</span>
          <h1 id="library-title">${acquisitionMode ? 'CONHEÇA SUA JORNADA' : 'Meus cursos'}</h1>
          <p>${acquisitionMode ? 'Veja tudo o que fará parte da sua preparação.' : owned.length ? 'Continue de onde parou ou escolha outra jornada comprada.' : 'Quando uma jornada for liberada, ela aparecerá aqui pronta para começar.'}</p>
          ${acquisitionMode || !owned.length ? '' : `<span class="library-access-count">${icon('book', 'ico--inline')} ${escapeHtml(libraryCount)}</span>`}
        </div>
        ${acquisitionMode ? publicCoursesAction({ href: links.courses, offline, label: 'VER OUTROS CURSOS' }) : ''}
      </header>
      ${validating ? `<aside class="library-network-state" role="status" aria-live="polite"><div><strong>Atualizando seus acessos...</strong><span>Você já pode visualizar a Biblioteca enquanto concluímos a validação segura.</span></div></aside>` : ''}
      ${offline ? `<aside class="library-network-state" id="library-offline-courses" role="status"><div><strong>Você está vendo a última biblioteca conhecida.</strong><span>Conecte-se para validar acessos e adicionar novos cursos.</span></div><button class="btn btn-ghost" type="button" data-refresh-access>Atualizar biblioteca</button></aside>` : ''}
      ${checkoutReturnCard(notice, { preview: checkoutPreview })}
      ${commercialIntentCard(intentResolution, links, { preview: checkoutPreview, offerHidden: returnMode })}
      ${acquisitionMode ? '' : activeJourneyVisible ? continueJourney(activeJourney) : ''}
      ${acquisitionMode ? '' : owned.length ? (ownedOrdered.length ? `
          <section class="private-owned-courses" aria-labelledby="owned-courses-title">
            <div class="private-owned-courses__title"><div><span class="library-kicker">${activeJourneyVisible ? 'OUTRAS JORNADAS' : 'SEUS ACESSOS'}</span><h2 id="owned-courses-title">${activeJourneyVisible ? 'Outros cursos comprados' : 'Cursos comprados'}</h2></div><p>${plural(ownedOrdered.length, 'curso nesta seção', 'cursos nesta seção')}<span class="private-owned-courses__swipe" aria-hidden="true">DESLIZE →</span></p></div>
            <div class="private-owned-grid">${ownedOrdered.map((item) => ownedCourseCard(item, { active: item === activeJourney })).join('')}</div>
          </section>` : '') : `
        <section class="private-library-empty" aria-labelledby="private-library-empty-title">
          <span class="private-library-empty__mark" aria-hidden="true">D</span>
          <div><span class="library-kicker">SUA PRÓXIMA CONQUISTA</span><h2 id="private-library-empty-title">Sua primeira jornada começa aqui.</h2><p>Escolha o concurso que você quer conquistar e conheça as jornadas DETONA.</p></div>
          ${publicCoursesAction({ href: links.courses, offline, label: 'EXPLORAR CURSOS', className: 'private-library-empty__action' })}
        </section>`}
      ${acquisitionMode || !owned.length ? '' : `
        <aside class="library-add-course-panel">
          <div><span class="library-kicker">CATÁLOGO DETONA</span><strong>Quer adicionar outra jornada?</strong><small>A compra acontece no site oficial e o novo acesso aparece aqui após a confirmação.</small></div>
          ${publicCoursesAction({ href: links.courses, offline, label: 'VER OUTROS CURSOS' })}
        </aside>`}
      <footer class="student-entry-footer"><span>Precisa de ajuda para entrar ou recuperar seu acesso?</span><nav aria-label="Ajuda e documentos">${supportLinks(links)}</nav></footer>
    </div>`;

  const bindOpenActions = (scope) => {
    if (!scope) return;
    scope.querySelectorAll('[data-open-contest]').forEach((button) => button.addEventListener('click', async () => {
      const contestId = button.dataset.openContest;
      if (openingContests.has(contestId)) return;
      openingContests.add(contestId);
      const relatedButtons = [...root.querySelectorAll(`[data-open-contest="${CSS.escape(contestId)}"]`)];
      const originalLabels = new Map(relatedButtons.map((candidate) => [candidate, candidate.innerHTML]));
      relatedButtons.forEach((candidate) => {
        candidate.disabled = true;
        candidate.setAttribute('aria-busy', 'true');
        candidate.textContent = 'PREPARANDO JORNADA...';
      });
      const feedback = button.closest('[data-contest-card], .active-journey')?.querySelector('[data-card-feedback]');
      if (feedback) feedback.textContent = 'Carregando o curso e sincronizando seu progresso.';
      try { await onOpen(contestId); }
      catch (error) {
        if (feedback) feedback.textContent = error?.code === 'STALE_CONTEXT' ? '' : (error?.message || 'Não foi possível abrir este curso.');
        relatedButtons.forEach((candidate) => {
          candidate.disabled = false;
          candidate.setAttribute('aria-busy', 'false');
          candidate.innerHTML = originalLabels.get(candidate);
        });
      } finally {
        openingContests.delete(contestId);
      }
    }));
  };

  root.querySelector('#library-logout')?.addEventListener('click', onLogout);
  root.querySelectorAll('[data-refresh-access]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    await onRefreshAccess();
  }));
  const showCommercialPanel = (panel) => {
    const offer = root.querySelector('[data-acquisition-offer]');
    const returned = root.querySelector('[data-checkout-return]');
    if (offer) offer.hidden = panel !== 'offer';
    if (returned) returned.hidden = panel !== 'return';
    offer?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  root.querySelector('[data-commercial-intent]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const contestId = button.dataset.commercialIntent;
    if (!contestId || button.disabled || checkoutAttempts.has(contestId)) return;
    const feedback = root.querySelector('[data-commercial-feedback]');
    if (checkoutPreview) {
      if (feedback) feedback.textContent = 'Preview local: nenhuma sessão e nenhuma cobrança foram criadas.';
      return;
    }
    checkoutAttempts.add(contestId);
    // Reserva a aba durante o gesto do usuário. Depois da chamada assíncrona,
    // navegadores móveis poderiam bloquear a abertura ou entregá-la ao app do provedor.
    const checkoutWindow = reserveCheckoutBrowserWindow();
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'PREPARANDO AMBIENTE SEGURO...';
    if (feedback) feedback.textContent = 'Criando ou recuperando uma única sessão de checkout.';
    try {
      await onPurchase(contestId, { checkoutWindow });
    } catch (error) {
      closeReservedCheckoutWindow(checkoutWindow);
      checkoutAttempts.delete(contestId);
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      button.textContent = 'CONTINUAR PARA O PAGAMENTO SEGURO →';
      if (feedback) feedback.textContent = error?.message || 'Não foi possível iniciar o pagamento.';
    }
  });
  root.querySelector('[data-return-offer]')?.addEventListener('click', () => showCommercialPanel('offer'));
  root.querySelector('[data-return-retry]')?.addEventListener('click', () => showCommercialPanel('offer'));
  root.querySelector('[data-return-enter]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (checkoutPreview) {
      button.insertAdjacentHTML('afterend', '<small class="checkout-preview-note">Preview: nenhum acesso foi liberado.</small>');
      return;
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    await onConfirmedPurchase(notice?.contestId);
  });
  bindOpenActions(root);
}
