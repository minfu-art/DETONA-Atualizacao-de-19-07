import { escapeHtml, formatDate } from './helpers.js';
import { progressBar } from './components.js';
import { icon } from './icons.js';
import { selectActiveJourney } from '../services/careerLibraryService.js';
import {
  formatCanonicalPrice,
  partitionLibrary,
  resolveCheckoutReturn,
  resolveCommercialIntent,
} from '../services/studentEntryModel.js';

const plural = (amount, singular, multiple) => `${amount} ${amount === 1 ? singular : multiple}`;
const safePercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

function courseArt(contest, { eager = false } = {}) {
  if (contest.coverAsset) {
    return `<img src="${escapeHtml(contest.coverAsset)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
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
  return `
    <section class="active-journey" aria-labelledby="active-journey-title" ${contestTheme(contest)}>
      <div class="active-journey__backdrop" aria-hidden="true">${courseArt(contest, { eager: true })}</div>
      <div class="active-journey__content">
        <span class="active-journey__access">${icon('shieldCheck', 'ico--inline')} ACESSO LIBERADO</span>
        <strong class="active-journey__code">${escapeHtml(contest.code)}</strong>
        ${homologationStatus(contest)}
        <div class="active-journey__title"><span class="library-kicker">SUA JORNADA PRINCIPAL</span><h2 id="active-journey-title">${escapeHtml(contest.name)}</h2><p>${escapeHtml(contest.role)}</p></div>
        <p class="active-journey__description">${escapeHtml(contest.description || 'Uma preparação completa, organizada pelo edital e guiada pelo seu desempenho.')}</p>
        <div class="active-journey__metrics" aria-label="Resumo da jornada">
          ${subtopicCount > 0 ? `<div><strong>${subtopicCount.toLocaleString('pt-BR')}</strong><span>subtópicos organizados</span></div>` : ''}
          ${questionCount > 0 ? `<div><strong>${questionCount.toLocaleString('pt-BR')}</strong><span>questões disponíveis</span></div>` : ''}
          <div><strong>${progress}%</strong><span>domínio do edital</span></div>
        </div>
        <div class="active-journey__progress">${progressBar({ value: progress, label: 'Domínio do edital', tone: 'plasma' })}</div>
        <div class="active-journey__footer">
          <small>${summary?.lastAccessAt ? `Última atividade em ${escapeHtml(formatDate(summary.lastAccessAt))}` : 'Tudo pronto para iniciar sua preparação.'}</small>
          <button type="button" class="active-journey__action" data-open-contest="${escapeHtml(contest.id)}">${contest.previewOnly === true ? 'TESTAR CURSO' : 'ENTRAR NA JORNADA'} <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <p class="library-action-feedback" data-card-feedback role="status" aria-live="polite"></p>
    </section>`;
}

function journeyFeatureOverview(item) {
  if (!item) return '';
  return `
    <section class="journey-toolkit" aria-labelledby="journey-toolkit-title" ${contestTheme(item.contest)}>
      <div class="journey-toolkit__heading">
        <div><span class="library-kicker">SEU ECOSSISTEMA DETONA</span><h2 id="journey-toolkit-title">Tudo o que conduz sua preparação.</h2></div>
        <p>Conteúdo, prática, revisão e estratégia trabalham juntos para mostrar o próximo passo.</p>
      </div>
      <div class="journey-toolkit__grid">${acquisitionFeatures()}</div>
    </section>`;
}

function ownedCourseCard(item, { active = false } = {}) {
  const { contest, summary } = item;
  const progress = safePercent(summary?.editalCompletionPct);
  const contentUnavailable = contest.contentStatus !== 'ready';
  const preorder = contest.salesStatus === 'preorder';
  const disabled = item.accessVerificationRequired === true || contentUnavailable;
  return `
    <article class="owned-course-card ${active ? 'owned-course-card--active' : ''}" data-contest-card="${escapeHtml(contest.id)}" ${contestTheme(contest)}>
      <div class="owned-course-card__art">${courseArt(contest)}</div>
      <div class="owned-course-card__body">
        <span class="owned-course-card__code">${escapeHtml(contest.code)}</span>
        ${homologationStatus(contest)}
        <h3>${escapeHtml(contest.name)}</h3>
        <p>${escapeHtml(contest.role)}</p>
        <div class="owned-course-card__mastery"><span>DOMÍNIO DO EDITAL</span><strong>${progress}%</strong></div>
        ${progressBar({ value: progress, label: 'Domínio do edital', tone: 'plasma' })}
        <p class="owned-course-card__counts">${Number(contest.subtopicCount || 0)} subtópicos <span aria-hidden="true">·</span> ${Number(contest.questionCount || 0).toLocaleString('pt-BR')} questões</p>
        <p class="owned-course-card__last">${contentUnavailable && preorder ? 'Seu acesso está garantido. Avisaremos quando a jornada inicial for liberada.' : summary?.lastAccessAt ? `Última atividade em ${escapeHtml(formatDate(summary.lastAccessAt))}` : 'Ainda sem atividade registrada.'}</p>
        <button type="button" class="owned-course-card__action" data-open-contest="${escapeHtml(contest.id)}" ${disabled ? 'disabled' : ''}>${item.accessVerificationRequired ? 'CONECTE-SE PARA VALIDAR' : contentUnavailable ? preorder ? 'PRÉ-VENDA CONFIRMADA' : 'CONTEÚDO EM PREPARAÇÃO' : contest.previewOnly === true ? 'TESTAR CURSO' : 'CONTINUAR'}</button>
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
      <div class="acquisition-hero">
        <div class="commercial-intent__art">
          ${courseArt(contest, { eager: true })}
          <span class="acquisition-art__badge">JORNADA DETONA</span>
        </div>
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
          ${actionable
            ? `<button type="button" data-commercial-intent="${escapeHtml(contest.id)}">CONTINUAR PARA O PAGAMENTO SEGURO <span aria-hidden="true">→</span></button>`
            : `<p>${resolution.state === 'offline' ? 'Conecte-se para validar a disponibilidade.' : 'Pagamento temporariamente indisponível.'}</p>${fallback}`}
          <p class="library-action-feedback" data-commercial-feedback role="status" aria-live="polite"></p>
        </aside>
      </div>
      <div class="acquisition-value" aria-labelledby="acquisition-value-title">
        <div class="acquisition-section-heading"><span class="library-kicker">MOTOR DE PREPARAÇÃO</span><h2 id="acquisition-value-title">Tudo trabalha junto para levar você até a prova.</h2><p>Não é apenas um banco de questões. É um sistema que organiza estudo, prática, revisão e tomada de decisão.</p></div>
        <div class="acquisition-feature-grid">${acquisitionFeatures()}</div>
      </div>
      <div class="acquisition-flow" aria-label="Ciclo de preparação DETONA">
        <span class="acquisition-flow__label">SEU CICLO DE PREPARAÇÃO</span>
        <ol>
          <li><strong>01</strong><span>Entenda o edital</span></li>
          <li><strong>02</strong><span>Estude por missões</span></li>
          <li><strong>03</strong><span>Pratique questões</span></li>
          <li><strong>04</strong><span>Revise no momento certo</span></li>
          <li><strong>05</strong><span>Meça e ajuste a estratégia</span></li>
        </ol>
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

  root.innerHTML = `
    <div class="library-page student-library student-library--private ${acquisitionMode ? 'student-library--acquisition' : ''} ${embedded ? 'library-page--embedded' : ''}">
      ${embedded ? '' : `<header class="library-header"><div class="saas-brand"><img class="saas-brand__mark" src="assets/icons/icon-192.png" alt="" width="44" height="44" decoding="async"><strong>DETONA <em>CONCURSOS</em></strong></div><div class="library-account"><span>${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div><button id="library-logout" type="button">Sair</button></div></header>`}
      <header class="private-library-header ${acquisitionMode ? 'private-library-header--acquisition' : ''}">
        <div><span class="library-kicker">${acquisitionMode ? 'AQUISIÇÃO SEGURA' : 'ÁREA PRIVADA'}</span><h1 id="library-title">${acquisitionMode ? 'CONHEÇA SUA JORNADA' : 'BIBLIOTECA'}</h1><p>${acquisitionMode ? 'Veja tudo o que fará parte da sua preparação.' : 'Suas jornadas de preparação.'}</p></div>
        ${publicCoursesAction({ href: links.courses, offline, label: acquisitionMode ? 'VER OUTROS CURSOS' : '+ ADICIONAR CURSOS' })}
      </header>
      ${validating ? `<aside class="library-network-state" role="status" aria-live="polite"><div><strong>Atualizando seus acessos...</strong><span>Você já pode visualizar a Biblioteca enquanto concluímos a validação segura.</span></div></aside>` : ''}
      ${offline ? `<aside class="library-network-state" id="library-offline-courses" role="status"><div><strong>Você está vendo a última biblioteca conhecida.</strong><span>Conecte-se para validar acessos e adicionar novos cursos.</span></div><button class="btn btn-ghost" type="button" data-refresh-access>Atualizar biblioteca</button></aside>` : ''}
      ${checkoutReturnCard(notice, { preview: checkoutPreview })}
      ${commercialIntentCard(intentResolution, links, { preview: checkoutPreview, offerHidden: returnMode })}
      ${acquisitionMode ? '' : activeJourneyVisible ? continueJourney(activeJourney) : ''}
      ${acquisitionMode ? '' : activeJourneyVisible ? journeyFeatureOverview(activeJourney) : ''}
      ${acquisitionMode ? '' : owned.length ? (ownedOrdered.length ? `
          <section class="private-owned-courses" aria-labelledby="owned-courses-title">
            <div class="private-owned-courses__title"><div><span class="library-kicker">OUTROS ACESSOS</span><h2 id="owned-courses-title">Meus Cursos</h2></div><p>${plural(owned.length, 'jornada na Biblioteca', 'jornadas na Biblioteca')}</p></div>
            <div class="private-owned-grid">${ownedOrdered.map((item) => ownedCourseCard(item, { active: item === activeJourney })).join('')}</div>
          </section>` : '') : `
        <section class="private-library-empty" aria-labelledby="private-library-empty-title">
          <span class="private-library-empty__mark" aria-hidden="true">D</span>
          <div><span class="library-kicker">SUA PRÓXIMA CONQUISTA</span><h2 id="private-library-empty-title">Sua primeira jornada começa aqui.</h2><p>Escolha o concurso que você quer conquistar e conheça as jornadas DETONA.</p></div>
          ${publicCoursesAction({ href: links.courses, offline, label: 'EXPLORAR CURSOS', className: 'private-library-empty__action' })}
        </section>`}
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
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'PREPARANDO AMBIENTE SEGURO...';
    if (feedback) feedback.textContent = 'Criando ou recuperando uma única sessão de checkout.';
    try {
      await onPurchase(contestId);
    } catch (error) {
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
