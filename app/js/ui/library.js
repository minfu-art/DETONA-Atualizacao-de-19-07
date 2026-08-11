import { escapeHtml, formatDate } from './helpers.js';
import { emptyState, progressBar, statusBadge } from './components.js';
import { heroSrcForLevel } from './heroAssets.js';
import {
  CAREER_AREAS,
  CAREER_AREA_ORDER,
  filterLibraryItems,
  getCareerArea,
  getCareerSubareaLabel,
  groupLibraryItems,
  selectActiveJourney,
  summarizeArea,
} from '../services/careerLibraryService.js';
import {
  formatCanonicalPrice,
  partitionLibrary,
  resolveCheckoutReturn,
} from '../services/studentEntryModel.js';

const plural = (amount, singular, multiple) => `${amount} ${amount === 1 ? singular : multiple}`;

function statusFor(item) {
  if (item.accessVerificationRequired) return ['Conexão necessária', 'warning'];
  if (item.owned && item.contest.contentStatus === 'ready') return ['Seu curso', 'success'];
  if (item.contest.salesStatus === 'available' && item.contest.contentStatus === 'ready') return ['Disponível', 'info'];
  if (item.contest.salesStatus === 'suspended') return ['Indisponível', 'warning'];
  return ['Em preparação', 'warning'];
}

function contestCard(item, { active = false } = {}) {
  const { contest, owned, summary } = item;
  const area = getCareerArea(contest.careerArea);
  const subarea = getCareerSubareaLabel(area.id, contest.careerSubarea);
  const action = item.checkoutAction || { label: 'Indisponível', action: 'none', disabled: true };
  const [status, statusTone] = statusFor(item);
  const price = !owned && !item.accessVerificationRequired ? formatCanonicalPrice(contest) : null;
  const cover = contest.coverAsset
    ? `<img src="${escapeHtml(contest.coverAsset)}" alt="" loading="lazy" decoding="async">`
    : `<span class="contest-card__emblem" aria-hidden="true">${escapeHtml(contest.icon)}</span>`;
  const actionAttribute = action.action === 'open'
    ? `data-open-contest="${escapeHtml(contest.id)}"`
    : action.action === 'purchase'
      ? `data-purchase-contest="${escapeHtml(contest.id)}"`
      : action.action === 'details'
        ? `data-view-details="${escapeHtml(contest.id)}"`
        : '';
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
        ${owned && !item.accessVerificationRequired ? `<div class="contest-card__progress">${progressBar({ value: summary?.editalCompletionPct || 0, label: 'Progresso do edital', tone: 'plasma' })}<span class="contest-card__last">${summary?.lastAccessAt ? `Última atividade em ${formatDate(summary.lastAccessAt)}` : 'Sua jornada está pronta para começar.'}</span></div>` : ''}
        ${!owned ? `<div class="contest-card__commerce-detail" data-commerce-detail>
          <strong>Como funciona o acesso</strong>
          <p>A compra é confirmada pelo servidor. Depois da confirmação, o curso aparece em Meus cursos sem alterar seu progresso em outras jornadas.</p>
        </div>` : ''}
        <div class="contest-card__footer">
          ${price ? `<div class="contest-card__price"><small>Investimento</small><strong>${escapeHtml(price)}</strong></div>` : '<span></span>'}
          <button type="button" class="btn ${action.action === 'open' || action.action === 'purchase' ? 'btn-primary' : 'btn-ghost'}" ${actionAttribute} ${action.action === 'details' ? 'aria-expanded="false"' : ''} ${action.disabled ? 'disabled' : ''}>${escapeHtml(action.label)}</button>
        </div>
        <p class="contest-card__feedback" data-card-feedback role="status" aria-live="polite"></p>
      </div>
    </article>`;
}

function areaHeader(areaId, items) {
  const area = CAREER_AREAS[areaId];
  const stats = summarizeArea(items);
  const art = area.art
    ? `<img src="${area.art}" alt="" loading="lazy" decoding="async" data-area-art>`
    : '';
  return `
    <header class="career-area__header">
      <div class="career-area__art ${area.art ? '' : 'career-area__art--fallback'}" aria-hidden="true">${art}<span>${escapeHtml(area.filterLabel.slice(0, 2).toUpperCase())}</span></div>
      <div class="career-area__copy">
        <span class="saas-kicker">Área de carreira</span>
        <h3>${escapeHtml(area.name)}</h3>
        <p>${escapeHtml(area.description)}</p>
      </div>
      <dl class="career-area__stats">
        <div><dt>Concursos</dt><dd>${stats.total}</dd></div>
        <div><dt>Ativos</dt><dd>${stats.active}</dd></div>
        <div><dt>Em preparação</dt><dd>${stats.preparing}</dd></div>
      </dl>
    </header>`;
}

function renderAreaSections(items, area, search) {
  const filtered = filterLibraryItems(items, { area, search });
  const grouped = groupLibraryItems(filtered);
  const visibleAreas = area === 'all'
    ? [...CAREER_AREA_ORDER, 'other'].filter((areaId) => grouped.get(areaId).length)
    : [area];
  if (!filtered.length) {
    return emptyState({
      title: search ? 'Nenhum curso encontrado' : 'Novos cursos estão em preparação',
      description: search ? 'Tente outro termo ou selecione uma área diferente.' : 'As próximas jornadas aparecerão aqui com dados oficiais do catálogo.',
    });
  }
  return visibleAreas.map((areaId) => {
    const areaItems = grouped.get(areaId) || [];
    return `<section class="career-area" data-career-area="${areaId}">
      ${areaHeader(areaId, areaItems)}
      ${areaItems.length
        ? `<div class="contest-grid">${areaItems.map((item) => contestCard(item)).join('')}</div>`
        : emptyState({ title: 'Área em preparação', description: 'Novos concursos serão apresentados aqui.' })}
    </section>`;
  }).join('');
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
  onRefreshAccess = async () => {},
  onLogout,
  embedded = false,
}) {
  const { owned, offers } = partitionLibrary(items);
  const activeJourney = selectActiveJourney(owned, activeContestId);
  const ownedOrdered = activeJourney
    ? [activeJourney, ...owned.filter(({ contest }) => contest.id !== activeJourney.contest.id)]
    : owned;
  const guideLevel = activeJourney?.summary?.level || 20;
  const notice = resolveCheckoutReturn(commerceReturn, items);
  const state = { area: 'all', search: '' };

  root.innerHTML = `
    <div class="library-page student-library ${embedded ? 'library-page--embedded' : ''}">
      ${embedded ? '' : `<header class="library-header">
        <div class="saas-brand"><img class="saas-brand__mark" src="assets/icons/icon-192.png" alt="" width="44" height="44" decoding="async"><strong>DETONA <em>CONCURSOS</em></strong></div>
        <div class="library-account"><span>${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div><button id="library-logout" type="button">Sair</button></div>
      </header>`}
      <section class="library-hero">
        <div class="library-hero__copy"><span class="saas-kicker">Central do aluno</span><p class="library-greeting">Olá, <strong>${escapeHtml(user.name.split(' ')[0])}</strong>.</p><h1>Seus cursos, no lugar certo.</h1><p>Continue uma jornada que já é sua ou conheça os próximos concursos do catálogo oficial.</p><div class="library-summary"><strong>${owned.length}</strong><span>${owned.length === 1 ? 'curso adquirido' : 'cursos adquiridos'}</span></div></div>
        <div class="library-guide" aria-hidden="true"><span class="library-guide__orbit"></span><img src="${heroSrcForLevel(guideLevel)}" alt="" width="560" height="560" decoding="async"><div><small>Sua preparação continua</small><strong>Escolha uma jornada.</strong></div></div>
      </section>
      ${offline ? `<aside class="library-network-state" role="status"><strong>Você está vendo a última biblioteca conhecida.</strong><span>Conecte-se para validar acessos e consultar ofertas atuais.</span><button class="btn btn-ghost" type="button" data-refresh-access>Atualizar biblioteca</button></aside>` : ''}
      ${notice ? `<aside class="library-commerce-notice library-commerce-notice--${notice.tone}" role="status" aria-live="polite"><div><strong>${escapeHtml(notice.title)}</strong><p>${escapeHtml(notice.description)}</p></div>${notice.pending ? '<button class="btn btn-ghost" type="button" data-refresh-access>Atualizar acesso</button>' : notice.retryAllowed ? `<button class="btn btn-ghost" type="button" data-retry-checkout="${escapeHtml(notice.contestId)}">Tentar novamente</button>` : ''}</aside>` : ''}
      <section class="library-section library-section--owned" aria-labelledby="owned-courses-title">
        <div class="library-section__title"><div><span class="saas-kicker">Acesso liberado</span><h2 id="owned-courses-title">Meus cursos</h2></div><p>${plural(owned.length, 'jornada disponível', 'jornadas disponíveis')}</p></div>
        ${ownedOrdered.length
          ? `<div class="contest-grid contest-grid--owned">${ownedOrdered.map((item) => contestCard(item, { active: item === activeJourney })).join('')}</div>`
          : emptyState({ title: 'Sua biblioteca está pronta', description: 'Você ainda não possui um curso. Explore o catálogo oficial abaixo para conhecer as jornadas disponíveis.' })}
      </section>
      <section class="library-section library-section--catalog" aria-labelledby="catalog-title">
        <div class="library-section__title"><div><span class="saas-kicker">Catálogo oficial</span><h2 id="catalog-title">Outros cursos</h2></div><p>${plural(offers.length, 'curso no catálogo', 'cursos no catálogo')}</p></div>
        <div class="library-discovery">
          <label class="library-search"><span>Buscar curso</span><input id="library-search" type="search" autocomplete="off" placeholder="Nome, sigla, órgão, cargo, área ou subárea"></label>
          <nav class="career-filters" aria-label="Filtrar concursos por área">
            <button type="button" class="active" data-career-filter="all" aria-pressed="true">Todos</button>
            ${CAREER_AREA_ORDER.map((areaId) => `<button type="button" data-career-filter="${areaId}" aria-pressed="false">${escapeHtml(CAREER_AREAS[areaId].filterLabel)}</button>`).join('')}
          </nav>
        </div>
        <div id="library-area-results" aria-live="polite"></div>
      </section>
      <footer class="student-entry-footer"><span>Precisa de ajuda para entrar ou recuperar seu acesso?</span><nav aria-label="Ajuda e documentos">${supportLinks(links)}</nav></footer>
    </div>`;

  const bindCards = (scope) => {
    scope.querySelectorAll('[data-area-art]').forEach((image) => image.addEventListener('error', () => {
      image.hidden = true;
      image.parentElement.classList.add('career-area__art--fallback');
    }, { once: true }));
    scope.querySelectorAll('[data-open-contest]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      const feedback = button.closest('[data-contest-card]')?.querySelector('[data-card-feedback]');
      try { await onOpen(button.dataset.openContest); }
      catch (error) {
        if (feedback) feedback.textContent = error?.code === 'STALE_CONTEXT' ? '' : (error?.message || 'Não foi possível abrir este curso.');
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
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
    scope.querySelectorAll('[data-view-details]').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('[data-contest-card]');
      card.classList.toggle('contest-card--details');
      const expanded = card.classList.contains('contest-card--details');
      button.textContent = expanded ? 'Ocultar detalhes' : 'Ver curso';
      button.setAttribute('aria-expanded', String(expanded));
    }));
  };

  const results = root.querySelector('#library-area-results');
  const updateResults = () => {
    results.innerHTML = renderAreaSections(offers, state.area, state.search);
    bindCards(results);
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
  root.querySelector('#library-search')?.addEventListener('input', (event) => {
    state.search = event.currentTarget.value;
    updateResults();
  });
  root.querySelectorAll('[data-career-filter]').forEach((button) => button.addEventListener('click', () => {
    state.area = button.dataset.careerFilter;
    root.querySelectorAll('[data-career-filter]').forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle('active', selected);
      candidate.setAttribute('aria-pressed', String(selected));
    });
    updateResults();
  }));
  bindCards(root.querySelector('.library-section--owned'));
  updateResults();
}
