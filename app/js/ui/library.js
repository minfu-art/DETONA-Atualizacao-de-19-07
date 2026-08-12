import { escapeHtml, formatDate } from './helpers.js';
import { emptyState, progressBar, statusBadge } from './components.js';
import {
  CAREER_AREAS,
  CAREER_AREA_ORDER,
  countLibraryItemsByArea,
  filterLibraryItems,
  getCareerArea,
  getCareerSubareaLabel,
  resolveContestArea,
  selectActiveJourney,
} from '../services/careerLibraryService.js';
import {
  formatCanonicalPrice,
  partitionCommercialLibrary,
  resolveCheckoutReturn,
} from '../services/studentEntryModel.js';

const plural = (amount, singular, multiple) => `${amount} ${amount === 1 ? singular : multiple}`;

function statusFor(item) {
  if (item.accessVerificationRequired) return ['CONEXÃO NECESSÁRIA', 'warning'];
  if (item.owned) return ['MEU CURSO', 'success'];
  if (item.contest.salesStatus === 'available' && item.contest.contentStatus === 'ready') return ['DISPONÍVEL', 'info'];
  if (item.contest.salesStatus === 'monitoring') return ['EM ACOMPANHAMENTO', 'info'];
  if (['suspended', 'unavailable'].includes(item.contest.salesStatus)) return ['INDISPONÍVEL', 'warning'];
  return ['EM PREPARAÇÃO', 'warning'];
}

function contestCard(item, { active = false } = {}) {
  const { contest, owned, summary } = item;
  const area = getCareerArea(resolveContestArea(contest));
  const subarea = getCareerSubareaLabel(area.id, contest.careerSubarea);
  const action = item.checkoutAction || { label: 'Indisponível', action: 'none', disabled: true };
  const [status, statusTone] = statusFor(item);
  const isDemand = !owned && ['monitoring', 'coming_soon'].includes(contest.salesStatus);
  const price = !owned && !isDemand && !item.accessVerificationRequired ? formatCanonicalPrice(contest) : null;
  const cover = contest.coverAsset
    ? `<img src="${escapeHtml(contest.coverAsset)}" alt="" loading="lazy" decoding="async">`
    : `<span class="contest-card__emblem" aria-hidden="true">${escapeHtml(contest.icon)}</span>`;
  const actionAttribute = isDemand
    ? `data-interest-contest="${escapeHtml(contest.id)}" data-interested="${contest.interested === true}" aria-pressed="${contest.interested === true}"`
    : action.action === 'open'
    ? `data-open-contest="${escapeHtml(contest.id)}"`
    : action.action === 'purchase'
      ? `data-purchase-contest="${escapeHtml(contest.id)}"`
      : action.action === 'details'
        ? `data-view-details="${escapeHtml(contest.id)}"`
        : '';
  const actionLabel = isDemand
    ? contest.interested === true
      ? '✓ Interesse registrado'
      : contest.salesStatus === 'monitoring' ? 'Tenho interesse' : 'Quero ser avisado'
    : action.label;
  const interestText = Number(contest.interestCount || 0) > 0
    ? `${Number(contest.interestCount)} candidatos demonstraram interesse`
    : 'Seja um dos primeiros interessados';
  return `
    <article class="contest-card ${owned ? 'contest-card--owned' : 'contest-card--offer'} ${active ? 'contest-card--active' : ''}" data-contest-card="${escapeHtml(contest.id)}" style="--contest:${escapeHtml(contest.color)};--contest-accent:${escapeHtml(contest.accent)}">
      <div class="contest-card__visual">
        ${cover}
        ${statusBadge(status, statusTone)}
      </div>
      <div class="contest-card__body">
        <div class="contest-card__identity"><span class="contest-card__code">${escapeHtml(contest.code)}</span><span>${escapeHtml(subarea || area.name)}</span></div>
        <h3>${escapeHtml(contest.name)}</h3>
        <p class="contest-card__role">${escapeHtml(contest.role)}</p>
        <p class="contest-card__description">${escapeHtml(contest.description)}</p>
        <dl class="contest-card__metrics">
          <div><dt>Área</dt><dd>${escapeHtml(area.filterLabel)}</dd></div>
          <div><dt>Subtópicos</dt><dd>${Number(contest.subtopicCount || 0)}</dd></div>
          <div><dt>Questões</dt><dd>${Number(contest.questionCount || 0)}</dd></div>
        </dl>
        ${contest.examBoard ? `<p class="contest-card__fact"><strong>Banca:</strong> ${escapeHtml(contest.examBoard)}</p>` : ''}
        ${contest.examDate ? `<p class="contest-card__fact"><strong>Prova:</strong> ${escapeHtml(formatDate(contest.examDate))}</p>` : ''}
        ${isDemand ? `<div class="contest-card__interest"><strong data-interest-count>${escapeHtml(interestText)}</strong>${contest.interestGoal ? `<span data-interest-goal="${Number(contest.interestGoal)}">${Number(contest.interestCount || 0)} / ${Number(contest.interestGoal)} interessados</span>` : ''}</div>` : ''}
        ${owned && !item.accessVerificationRequired ? `<div class="contest-card__progress">${progressBar({ value: summary?.editalCompletionPct || 0, label: 'Progresso do edital', tone: 'plasma' })}<span class="contest-card__last">${summary?.lastAccessAt ? `Última atividade em ${formatDate(summary.lastAccessAt)}` : 'Sua jornada está pronta para começar.'}</span></div>` : ''}
        ${!owned && !isDemand ? `<div class="contest-card__commerce-detail" data-commerce-detail>
          <strong>Como funciona o acesso</strong>
          <p>A compra é confirmada pelo servidor. Depois da confirmação, o curso aparece em Meus cursos sem alterar seu progresso em outras jornadas.</p>
        </div>` : ''}
        ${isDemand ? '<p class="contest-card__interest-note">Seu interesse indica demanda por este curso. Nenhuma comunicação externa é enviada nesta fase.</p>' : ''}
        <div class="contest-card__footer">
          ${price ? `<div class="contest-card__price"><small>Investimento</small><strong>${escapeHtml(price)}</strong></div>` : '<span></span>'}
          <button type="button" class="btn ${isDemand || action.action === 'open' || action.action === 'purchase' ? 'btn-primary' : 'btn-ghost'}" ${actionAttribute} ${action.action === 'details' ? 'aria-expanded="false"' : ''} ${item.accessVerificationRequired || (!isDemand && action.disabled) ? 'disabled' : ''}>${escapeHtml(actionLabel)}</button>
        </div>
        <p class="contest-card__feedback" data-card-feedback role="status" aria-live="polite"></p>
      </div>
    </article>`;
}

function areaDiscoveryCard(areaId, amount) {
  const area = CAREER_AREAS[areaId];
  return `
    <button class="library-area-card" type="button" data-career-filter="${areaId}" aria-pressed="false" aria-controls="library-available-results library-upcoming-results">
      <img src="${area.art}" alt="" width="1672" height="941" loading="lazy" decoding="async" data-area-art>
      <span class="library-area-card__shade" aria-hidden="true"></span>
      <span class="library-area-card__selection" aria-hidden="true">✓</span>
      <span class="library-area-card__copy">
        <strong>${escapeHtml(area.name)}</strong>
        <p>${escapeHtml(area.description)}</p>
        <small>${plural(amount, 'concurso no catálogo', 'concursos no catálogo')}</small>
      </span>
    </button>`;
}

function renderCatalogResults(items, area, search) {
  const filtered = filterLibraryItems(items, { area, search });
  if (!filtered.length) {
    return `<div class="library-filter-empty" role="status">
      <span aria-hidden="true">⌕</span>
      <h3>Nenhum concurso encontrado para estes filtros.</h3>
      <p>Limpe a busca ou a área selecionada para consultar novamente o catálogo completo.</p>
      <div>
        ${search ? '<button class="btn btn-ghost" type="button" data-clear-search>Limpar busca</button>' : ''}
        ${area !== 'all' ? '<button class="btn btn-ghost" type="button" data-clear-area>Limpar área</button>' : ''}
      </div>
    </div>`;
  }
  return `<div class="contest-grid">${filtered.map((item) => contestCard(item)).join('')}</div>`;
}

function supportLinks(links = {}) {
  const entries = [
    links.support ? ['Contato e suporte', links.support] : null,
    links.terms ? ['Termos de Uso', links.terms] : null,
    links.privacy ? ['Privacidade', links.privacy] : null,
  ].filter(Boolean);
  return entries.map(([label, href]) => `<a href="${escapeHtml(href)}" ${href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`).join('');
}

export function renderLibrary(root, {
  user,
  items,
  activeContestId = null,
  commerceReturn = null,
  offline = false,
  links = {},
  onOpen,
  onPurchase = async () => {},
  onInterest = async () => {},
  onRefreshAccess = async () => {},
  onLogout,
  embedded = false,
}) {
  const { owned, available, upcoming } = partitionCommercialLibrary(items);
  const offers = [...available, ...upcoming];
  const activeJourney = selectActiveJourney(owned, activeContestId);
  const ownedOrdered = activeJourney
    ? [activeJourney, ...owned.filter(({ contest }) => contest.id !== activeJourney.contest.id)]
    : owned;
  const areaCounts = countLibraryItemsByArea(offers);
  const notice = resolveCheckoutReturn(commerceReturn, items);
  const state = { area: 'all', search: '' };

  root.innerHTML = `
    <div class="library-page student-library ${embedded ? 'library-page--embedded' : ''}">
      ${embedded ? '' : `<header class="library-header">
        <div class="saas-brand"><img class="saas-brand__mark" src="assets/icons/icon-192.png" alt="" width="44" height="44" decoding="async"><strong>DETONA <em>CONCURSOS</em></strong></div>
        <div class="library-account"><span>${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div><button id="library-logout" type="button">Sair</button></div>
      </header>`}
      <section class="library-hero" aria-labelledby="library-title">
        <div class="library-hero__copy"><span class="saas-kicker">Portal de preparação</span><p class="library-greeting">Olá, <strong>${escapeHtml(user.name.split(' ')[0])}</strong>.</p><h1 id="library-title">BIBLIOTECA DE CONCURSOS</h1><p>Escolha sua área, encontre seu concurso e continue sua preparação.</p></div>
        <div class="library-summary" aria-label="Resumo dos seus cursos"><strong>${owned.length}</strong><span>${owned.length === 1 ? 'curso adquirido' : 'cursos adquiridos'}</span></div>
      </section>
      ${offline ? `<aside class="library-network-state" role="status"><strong>Você está vendo a última biblioteca conhecida.</strong><span>Conecte-se para validar acessos e consultar ofertas atuais.</span><button class="btn btn-ghost" type="button" data-refresh-access>Atualizar biblioteca</button></aside>` : ''}
      ${notice ? `<aside class="library-commerce-notice library-commerce-notice--${notice.tone}" role="status" aria-live="polite"><div><strong>${escapeHtml(notice.title)}</strong><p>${escapeHtml(notice.description)}</p></div>${notice.pending ? '<button class="btn btn-ghost" type="button" data-refresh-access>Atualizar acesso</button>' : notice.retryAllowed ? `<button class="btn btn-ghost" type="button" data-retry-checkout="${escapeHtml(notice.contestId)}">Tentar novamente</button>` : ''}</aside>` : ''}
      <section class="library-search-panel" aria-labelledby="library-search-title">
        <div><span class="saas-kicker">Encontre sua próxima jornada</span><h2 id="library-search-title">O que você quer estudar?</h2></div>
        <label class="library-search"><span>Pesquisar no catálogo</span><input id="library-search" type="search" autocomplete="off" placeholder="Pesquisar concurso, órgão, cargo ou banca"></label>
      </section>
      <section class="library-areas" aria-labelledby="library-areas-title">
        <div class="library-section__title"><div><span class="saas-kicker">Navegação visual</span><h2 id="library-areas-title">Explore por área</h2></div><button class="library-area-reset active" type="button" data-career-filter="all" aria-pressed="true" aria-controls="library-available-results library-upcoming-results">Todos os concursos</button></div>
        <div class="library-area-grid">
          ${CAREER_AREA_ORDER.map((areaId) => areaDiscoveryCard(areaId, areaCounts[areaId])).join('')}
        </div>
      </section>
      <section class="library-section library-section--owned" aria-labelledby="owned-courses-title">
        <div class="library-section__title"><div><span class="saas-kicker">Acesso liberado</span><h2 id="owned-courses-title">Meus cursos</h2></div><p>${plural(owned.length, 'jornada disponível', 'jornadas disponíveis')}</p></div>
        ${ownedOrdered.length
          ? `<div class="contest-grid contest-grid--owned">${ownedOrdered.map((item) => contestCard(item, { active: item === activeJourney })).join('')}</div>`
          : emptyState({ title: 'Sua biblioteca está pronta', description: 'Você ainda não possui um curso. Explore o catálogo oficial abaixo para conhecer as jornadas disponíveis.' })}
      </section>
      <section class="library-section library-section--catalog" aria-labelledby="catalog-title">
        <div class="library-section__title"><div><span class="saas-kicker">Catálogo oficial</span><h2 id="catalog-title">Cursos disponíveis</h2></div><p data-available-count>${plural(available.length, 'curso encontrado', 'cursos encontrados')}</p></div>
        <div id="library-available-results" aria-live="polite"></div>
      </section>
      <section class="library-section library-section--upcoming" aria-labelledby="upcoming-title">
        <div class="library-section__title"><div><span class="saas-kicker">Descubra o que vem a seguir</span><h2 id="upcoming-title">Próximos concursos</h2></div><p data-upcoming-count>${plural(upcoming.length, 'concurso acompanhado', 'concursos acompanhados')}</p></div>
        <div id="library-upcoming-results" aria-live="polite"></div>
      </section>
      <footer class="student-entry-footer"><span>Precisa de ajuda para entrar ou recuperar seu acesso?</span><nav aria-label="Ajuda e documentos">${supportLinks(links)}</nav></footer>
    </div>`;

  const bindCards = (scope) => {
    scope.querySelectorAll('[data-area-art]').forEach((image) => image.addEventListener('error', () => {
      image.hidden = true;
      image.closest('.library-area-card')?.classList.add('library-area-card--fallback');
    }, { once: true }));
    scope.querySelectorAll('[data-open-contest]').forEach((button) => button.addEventListener('click', async () => {
      const originalLabel = button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Preparando jornada...';
      const feedback = button.closest('[data-contest-card]')?.querySelector('[data-card-feedback]');
      if (feedback) feedback.textContent = 'Carregando o curso e sincronizando seu progresso. Isso pode levar alguns segundos.';
      try { await onOpen(button.dataset.openContest); }
      catch (error) {
        if (feedback) feedback.textContent = error?.code === 'STALE_CONTEXT' ? '' : (error?.message || 'Não foi possível abrir este curso.');
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        button.textContent = originalLabel;
      }
    }));
    scope.querySelectorAll('[data-purchase-contest]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      const feedback = button.closest('[data-contest-card]')?.querySelector('[data-card-feedback]');
      try { await onPurchase(button.dataset.purchaseContest); }
      catch (error) {
        if (feedback) feedback.textContent = error?.message || 'Não foi possível iniciar a compra. Tente novamente.';
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
      }
    }));
    scope.querySelectorAll('[data-interest-contest]').forEach((button) => button.addEventListener('click', async () => {
      const current = button.dataset.interested === 'true';
      const card = button.closest('[data-contest-card]');
      const feedback = card?.querySelector('[data-card-feedback]');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        const result = await onInterest(button.dataset.interestContest, !current);
        button.dataset.interested = String(result.interested);
        button.setAttribute('aria-pressed', String(result.interested));
        button.textContent = result.interested
          ? '✓ Interesse registrado'
          : card?.querySelector('.ds-badge')?.textContent?.includes('ACOMPANHAMENTO')
            ? 'Tenho interesse' : 'Quero ser avisado';
        const count = card?.querySelector('[data-interest-count]');
        if (count) count.textContent = result.interestCount > 0
          ? `${result.interestCount} candidatos demonstraram interesse`
          : 'Seja um dos primeiros interessados';
        const goal = card?.querySelector('[data-interest-goal]');
        if (goal) goal.textContent = `${result.interestCount} / ${goal.dataset.interestGoal} interessados`;
        if (feedback) feedback.textContent = result.interested ? 'Interesse registrado.' : 'Interesse removido.';
      } catch (error) {
        if (feedback) feedback.textContent = error?.message || 'Não foi possível atualizar seu interesse.';
      } finally {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
      }
    }));
    scope.querySelectorAll('[data-view-details]').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('[data-contest-card]');
      card.classList.toggle('contest-card--details');
      const expanded = card.classList.contains('contest-card--details');
      button.textContent = expanded ? 'Ocultar detalhes' : 'Ver curso';
      button.setAttribute('aria-expanded', String(expanded));
    }));
  };

  const availableResults = root.querySelector('#library-available-results');
  const upcomingResults = root.querySelector('#library-upcoming-results');
  const searchInput = root.querySelector('#library-search');
  const availableCount = root.querySelector('[data-available-count]');
  const upcomingCount = root.querySelector('[data-upcoming-count]');

  const syncAreaSelection = () => {
    root.querySelectorAll('[data-career-filter]').forEach((candidate) => {
      const selected = candidate.dataset.careerFilter === state.area;
      candidate.classList.toggle('active', selected);
      candidate.setAttribute('aria-pressed', String(selected));
    });
  };

  const clearSearch = () => {
    state.search = '';
    searchInput.value = '';
    updateResults();
    searchInput.focus();
  };

  const clearArea = () => {
    state.area = 'all';
    syncAreaSelection();
    updateResults();
  };

  const updateResults = () => {
    const filteredAvailable = filterLibraryItems(available, state);
    const filteredUpcoming = filterLibraryItems(upcoming, state);
    availableCount.textContent = plural(filteredAvailable.length, 'curso encontrado', 'cursos encontrados');
    upcomingCount.textContent = plural(filteredUpcoming.length, 'concurso acompanhado', 'concursos acompanhados');
    availableResults.innerHTML = renderCatalogResults(available, state.area, state.search);
    upcomingResults.innerHTML = renderCatalogResults(upcoming, state.area, state.search);
    [availableResults, upcomingResults].forEach((results) => {
      bindCards(results);
      results.querySelector('[data-clear-search]')?.addEventListener('click', clearSearch);
      results.querySelector('[data-clear-area]')?.addEventListener('click', clearArea);
    });
  };

  root.querySelector('#library-logout')?.addEventListener('click', onLogout);
  root.querySelectorAll('[data-refresh-access]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    await onRefreshAccess();
  }));
  root.querySelector('[data-retry-checkout]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try { await onPurchase(button.dataset.retryCheckout); }
    catch {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
    }
  });
  searchInput?.addEventListener('input', (event) => {
    state.search = event.currentTarget.value;
    updateResults();
  });
  root.querySelectorAll('[data-career-filter]').forEach((button) => button.addEventListener('click', () => {
    state.area = button.dataset.careerFilter;
    syncAreaSelection();
    updateResults();
  }));
  bindCards(root.querySelector('.library-areas'));
  bindCards(root.querySelector('.library-section--owned'));
  updateResults();
}
