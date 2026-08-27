import { escapeHtml, formatDate } from './helpers.js';
import { progressBar } from './components.js';
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
  return `
    <section class="active-journey" aria-labelledby="active-journey-title" ${contestTheme(contest)}>
      <div class="active-journey__art">${courseArt(contest, { eager: true })}</div>
      <div class="active-journey__content">
        <span class="library-kicker">CONTINUAR ESTUDANDO</span>
        <div><strong class="active-journey__code">${escapeHtml(contest.code)}</strong>${homologationStatus(contest)}<h2 id="active-journey-title">${escapeHtml(contest.name)}</h2><p>${escapeHtml(contest.role)}</p></div>
        <div class="active-journey__progress">${progressBar({ value: progress, label: 'Domínio do edital', tone: 'plasma' })}</div>
        ${summary?.lastAccessAt ? `<small>Última atividade em ${escapeHtml(formatDate(summary.lastAccessAt))}</small>` : '<small>Sua jornada está pronta para começar.</small>'}
      </div>
      <button type="button" class="active-journey__action" data-open-contest="${escapeHtml(contest.id)}">${contest.previewOnly === true ? 'TESTAR CURSO' : 'CONTINUAR'} <span aria-hidden="true">→</span></button>
      <p class="library-action-feedback" data-card-feedback role="status" aria-live="polite"></p>
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

function commercialIntentCard(resolution, links = {}) {
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
  return `
    <aside class="commercial-intent ${actionable ? 'commercial-intent--ready' : 'commercial-intent--unavailable'}" ${contestTheme(contest)} aria-labelledby="commercial-intent-title">
      <div class="commercial-intent__art">${courseArt(contest, { eager: true })}</div>
      <div class="commercial-intent__content">
        <span class="library-kicker">${preorder ? 'PRÉ-VENDA SELECIONADA NO SITE' : 'CURSO SELECIONADO NO SITE'}</span>
        <h2 id="commercial-intent-title">${escapeHtml(contest.name)}</h2>
        <p>${escapeHtml(contest.role || contest.description || 'Jornada DETONA')}</p>
        ${price ? `<strong class="commercial-intent__price">${escapeHtml(price)} <small>pagamento único</small></strong>` : ''}
      </div>
      <div class="commercial-intent__action">
        ${actionable
          ? `<button type="button" data-commercial-intent="${escapeHtml(contest.id)}">${preorder ? 'GARANTIR PRÉ-VENDA' : 'ADQUIRIR ACESSO'}</button>`
          : `<p>${resolution.state === 'offline' ? 'Conecte-se para validar a disponibilidade.' : 'Pagamento temporariamente indisponível.'}</p>${fallback}`}
        <p class="library-action-feedback" data-commercial-feedback role="status" aria-live="polite"></p>
      </div>
    </aside>`;
}

export function renderLibrary(root, {
  user,
  items,
  activeContestId = null,
  commerceReturn = null,
  commercialIntent = null,
  offline = false,
  links = {},
  onOpen,
  onRefreshAccess = async () => {},
  onPurchase = async () => {},
  onLogout,
  embedded = false,
}) {
  const { owned } = partitionLibrary(items);
  const activeJourney = selectActiveJourney(owned, activeContestId);
  const ownedOrdered = activeJourney
    ? [activeJourney, ...owned.filter(({ contest }) => contest.id !== activeJourney.contest.id)]
    : owned;
  const notice = resolveCheckoutReturn(commerceReturn, items);
  const intentResolution = resolveCommercialIntent(commercialIntent, items);
  const openingContests = new Set();

  root.innerHTML = `
    <div class="library-page student-library student-library--private ${embedded ? 'library-page--embedded' : ''}">
      ${embedded ? '' : `<header class="library-header"><div class="saas-brand"><img class="saas-brand__mark" src="assets/icons/icon-192.png" alt="" width="44" height="44" decoding="async"><strong>DETONA <em>CONCURSOS</em></strong></div><div class="library-account"><span>${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div><button id="library-logout" type="button">Sair</button></div></header>`}
      <header class="private-library-header">
        <div><span class="library-kicker">ÁREA PRIVADA</span><h1 id="library-title">BIBLIOTECA</h1><p>Suas jornadas de preparação.</p></div>
        ${publicCoursesAction({ href: links.courses, offline })}
      </header>
      ${offline ? `<aside class="library-network-state" id="library-offline-courses" role="status"><div><strong>Você está vendo a última biblioteca conhecida.</strong><span>Conecte-se para validar acessos e adicionar novos cursos.</span></div><button class="btn btn-ghost" type="button" data-refresh-access>Atualizar biblioteca</button></aside>` : ''}
      ${notice ? `<aside class="library-commerce-notice library-commerce-notice--${notice.tone}" role="status" aria-live="polite"><div><strong>${escapeHtml(notice.title)}</strong><p>${escapeHtml(notice.description)}</p></div>${notice.pending ? '<button class="btn btn-ghost" type="button" data-refresh-access>Atualizar acesso</button>' : ''}</aside>` : ''}
      ${commercialIntentCard(intentResolution, links)}
      ${activeJourney && !activeJourney.accessVerificationRequired ? continueJourney(activeJourney) : ''}
      ${ownedOrdered.length ? `
        <section class="private-owned-courses" aria-labelledby="owned-courses-title">
          <div class="private-owned-courses__title"><div><span class="library-kicker">ACESSO LIBERADO</span><h2 id="owned-courses-title">Meus Cursos</h2></div><p>${plural(owned.length, 'jornada disponível', 'jornadas disponíveis')}</p></div>
          <div class="private-owned-grid">${ownedOrdered.map((item) => ownedCourseCard(item, { active: item === activeJourney })).join('')}</div>
        </section>` : `
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
  root.querySelector('[data-commercial-intent]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const contestId = button.dataset.commercialIntent;
    const originalLabel = button.textContent;
    if (!contestId || button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'ABRINDO PAGAMENTO...';
    const feedback = root.querySelector('[data-commercial-feedback]');
    if (feedback) feedback.textContent = 'Criando uma sessão segura no provedor de pagamento.';
    try {
      await onPurchase(contestId);
    } catch (error) {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      button.textContent = originalLabel;
      if (feedback) feedback.textContent = error?.message || 'Não foi possível iniciar o pagamento.';
    }
  });
  bindOpenActions(root);
}
