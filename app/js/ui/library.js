import { escapeHtml, formatDate } from './helpers.js';
import { emptyState, progressBar, statusBadge } from './components.js';
import { heroSrcForLevel } from './heroAssets.js';
import {
  CAREER_AREAS,
  CAREER_AREA_ORDER,
  contestPrimaryAction,
  filterLibraryItems,
  getCareerArea,
  getCareerSubareaLabel,
  groupLibraryItems,
  selectActiveJourney,
  summarizeArea,
} from '../services/careerLibraryService.js';

const plural = (amount, singular, multiple) => `${amount} ${amount === 1 ? singular : multiple}`;

function contestCard(item, { active = false } = {}) {
  const { contest, owned, summary } = item;
  const ready = contest.contentStatus === 'ready';
  const area = getCareerArea(contest.careerArea);
  const subarea = getCareerSubareaLabel(area.id, contest.careerSubarea);
  const action = contestPrimaryAction(item);
  const cover = contest.coverAsset
    ? `<img src="${escapeHtml(contest.coverAsset)}" alt="" loading="lazy" decoding="async">`
    : `<span class="contest-card__emblem" aria-hidden="true">${escapeHtml(contest.icon)}</span>`;
  const actionAttribute = action.action === 'open'
    ? `data-open-contest="${escapeHtml(contest.id)}"`
    : action.action === 'details'
      ? `data-view-details="${escapeHtml(contest.id)}"`
      : '';
  return `
    <article class="contest-card ${owned ? 'contest-card--owned' : ''} ${active ? 'contest-card--active' : ''}" data-contest-card="${escapeHtml(contest.id)}" style="--contest:${escapeHtml(contest.color)};--contest-accent:${escapeHtml(contest.accent)}">
      <div class="contest-card__visual">
        ${cover}
        ${statusBadge(owned && ready ? 'Jornada ativa' : ready ? 'Disponível' : 'Em preparação', owned && ready ? 'success' : ready ? 'info' : 'warning')}
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
        ${owned && ready ? `<div class="contest-card__progress">${progressBar({ value: summary?.editalCompletionPct || 0, label: 'Progresso do edital', tone: 'plasma' })}<span class="contest-card__last">${summary?.lastAccessAt ? `Última atividade em ${formatDate(summary.lastAccessAt)}` : 'Sua jornada está pronta para começar.'}</span></div>` : ''}
        <div class="contest-card__footer">
          <button type="button" class="btn ${action.action === 'open' ? 'btn-primary' : ''}" ${actionAttribute} ${action.disabled ? 'disabled' : ''}>${action.label}</button>
        </div>
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
        <h2>${escapeHtml(area.name)}</h2>
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
  if (!filtered.length && area === 'all') {
    return emptyState({
      title: 'Nenhum concurso encontrado',
      description: 'Tente outro termo ou selecione uma área diferente.',
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

export function renderLibrary(root, {
  user,
  items,
  activeContestId = null,
  onOpen,
  onLogout,
}) {
  const activeJourney = selectActiveJourney(items, activeContestId);
  const exploreItems = activeJourney
    ? items.filter(({ contest }) => contest.id !== activeJourney.contest.id)
    : items;
  const owned = items.filter((item) => item.owned);
  const guideLevel = activeJourney?.summary?.level || 20;
  const state = { area: 'all', search: '' };

  root.innerHTML = `
    <div class="library-page">
      <header class="library-header">
        <div class="saas-brand"><img class="saas-brand__mark" src="assets/icons/icon-192.png" alt="" width="44" height="44" decoding="async"><strong>DETONA <em>CONCURSOS</em></strong></div>
        <div class="library-account"><span>${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div><button id="library-logout" type="button">Sair</button></div>
      </header>
      <section class="library-hero">
        <div class="library-hero__copy"><span class="saas-kicker">Minha biblioteca</span><p class="library-greeting">Olá, <strong>${escapeHtml(user.name.split(' ')[0])}</strong>. Sua evolução é construída todos os dias.</p><h1>Escolha sua próxima missão.</h1><p>Encontre concursos pela carreira que combina com seu objetivo.</p><div class="library-summary"><strong>${owned.length}</strong><span>${owned.length === 1 ? 'concurso ativo' : 'concursos ativos'}</span></div></div>
        <div class="library-guide" aria-hidden="true"><span class="library-guide__orbit"></span><img src="${heroSrcForLevel(guideLevel)}" alt="" width="560" height="560" decoding="async"><div><small>Conhecimento é poder</small><strong>Continue de onde parou.</strong></div></div>
      </section>
      <section class="library-section library-section--active" aria-labelledby="active-journey-title">
        <div class="library-section__title"><div><span class="saas-kicker">Jornada atual</span><h2 id="active-journey-title">Continue de onde parou</h2></div></div>
        <div class="contest-grid contest-grid--active">${activeJourney
          ? contestCard(activeJourney, { active: true })
          : emptyState({ title: 'Escolha sua primeira jornada', description: 'Explore as áreas abaixo para conhecer os concursos disponíveis.' })}</div>
      </section>
      <section class="library-section library-section--catalog" aria-labelledby="catalog-title">
        <div class="library-section__title"><div><span class="saas-kicker">Biblioteca DETONA</span><h2 id="catalog-title">Explore outras áreas</h2></div><p>${plural(exploreItems.length, 'concurso no catálogo', 'concursos no catálogo')}</p></div>
        <div class="library-discovery">
          <label class="library-search"><span>Buscar concurso</span><input id="library-search" type="search" autocomplete="off" placeholder="Nome, sigla, órgão, cargo, área ou subárea"></label>
          <nav class="career-filters" aria-label="Filtrar concursos por área">
            <button type="button" class="active" data-career-filter="all" aria-pressed="true">Todos</button>
            ${CAREER_AREA_ORDER.map((areaId) => `<button type="button" data-career-filter="${areaId}" aria-pressed="false">${escapeHtml(CAREER_AREAS[areaId].filterLabel)}</button>`).join('')}
          </nav>
        </div>
        <div id="library-area-results" aria-live="polite"></div>
      </section>
    </div>`;

  const results = root.querySelector('#library-area-results');
  const updateResults = () => {
    results.innerHTML = renderAreaSections(exploreItems, state.area, state.search);
    results.querySelectorAll('[data-area-art]').forEach((image) => image.addEventListener('error', () => {
      image.hidden = true;
      image.parentElement.classList.add('career-area__art--fallback');
    }, { once: true }));
    results.querySelectorAll('[data-open-contest]').forEach((button) => button.addEventListener('click', () => onOpen(button.dataset.openContest)));
    results.querySelectorAll('[data-view-details]').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('[data-contest-card]');
      card.classList.toggle('contest-card--details');
      button.textContent = card.classList.contains('contest-card--details') ? 'Ocultar detalhes' : 'Ver detalhes';
    }));
  };

  root.querySelector('#library-logout').addEventListener('click', onLogout);
  root.querySelectorAll('.contest-grid--active [data-open-contest]').forEach((button) => button.addEventListener('click', () => onOpen(button.dataset.openContest)));
  root.querySelector('#library-search').addEventListener('input', (event) => {
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
  updateResults();
}
