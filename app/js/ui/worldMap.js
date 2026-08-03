import { $, escapeAttr, escapeHtml } from './helpers.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { discIcon, icon } from './icons.js?v=67';
import {
  STUDY_FILTERS,
  buildDisciplineTopics,
  filterDisciplines,
  resolveDisciplinePresentation,
} from './studyPresentation.js';

function pendingReviews(rows = []) {
  return rows.filter((item) => item?.status !== 'frozen').length;
}
function overallAccuracy(subtopics = []) {
  const started = subtopics.filter((item) => Number(item.attempts_count ?? item.tentativas) > 0);
  if (!started.length) return 0;
  return Math.round(started.reduce((sum, item) => sum + (Number(item.best_accuracy ?? item.melhorPercentual) || 0), 0) / started.length);
}

export async function renderWorldMap(root, navigate, ctx) {
  root.dataset.theme = 'study';
  const [disciplines, subtopics, players, reviewQueue] = await Promise.all([
    progressRepository.getAll(STORES.disciplines),
    progressRepository.getAll(STORES.subtopics),
    progressRepository.getAll(STORES.player),
    progressRepository.getAll(STORES.reviewQueue),
  ]);
  disciplines.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const curriculum = Array.isArray(ctx?.contentPackage?.curriculum) ? ctx.contentPackage.curriculum : [];
  const player = players[0] || {};
  const cards = disciplines.map((discipline) => {
    const ownSubtopics = subtopics.filter((item) => item.discipline_id === discipline.id);
    const presentation = resolveDisciplinePresentation(discipline, ownSubtopics);
    presentation.topicCount = buildDisciplineTopics(discipline, ownSubtopics, curriculum).length;
    return presentation;
  });
  const startedDisciplines = cards.filter((item) => item.status.key !== 'not-started').length;
  const completedSubtopics = subtopics.filter((item) => Number(item.stars) >= 3).length;
  const state = { filter: 'all', search: '' };

  root.innerHTML = `
    <section class="study-screen" aria-labelledby="study-title">
      <header class="study-hero ds-surface">
        <div>
          <span class="ds-eyebrow">Núcleo acadêmico</span>
          <h1 id="study-title">Estudar</h1>
          <p>Escolha uma disciplina e avance pelo edital.</p>
        </div>
        <div class="study-summary" aria-label="Resumo acadêmico">
          <article><span>Progresso do edital</span><strong>${Number(player.edital_completion_pct ?? player.mastery_pct) || 0}%</strong></article>
          <article><span>Disciplinas iniciadas</span><strong>${startedDisciplines} de ${cards.length}</strong></article>
          <article><span>Subtópicos concluídos</span><strong>${completedSubtopics} de ${subtopics.length}</strong></article>
          <article><span>Taxa de acerto geral</span><strong>${overallAccuracy(subtopics)}%</strong></article>
          <article><span>Revisões pendentes</span><strong>${pendingReviews(reviewQueue)}</strong></article>
        </div>
      </header>

      <section class="study-catalog" aria-labelledby="study-disciplines-title">
        <div class="study-catalog__heading">
          <div>
            <span class="ds-eyebrow">Edital por disciplina</span>
            <h2 id="study-disciplines-title">Disciplinas</h2>
          </div>
          <label class="study-search">
            <span>Buscar disciplina</span>
            <input type="search" id="study-search" placeholder="Digite o nome" autocomplete="off">
          </label>
        </div>
        <div class="study-filters" role="group" aria-label="Filtrar disciplinas">
          ${STUDY_FILTERS.map((filter) => `<button type="button" class="study-filter" data-study-filter="${filter.id}" aria-pressed="${filter.id === 'all'}">${escapeHtml(filter.label)}</button>`).join('')}
        </div>
        <p class="study-results" id="study-results" aria-live="polite"></p>
        <div class="study-discipline-grid" id="study-discipline-grid"></div>
      </section>
    </section>`;

  const grid = $('#study-discipline-grid', root);
  const results = $('#study-results', root);

  function paint() {
    const visible = filterDisciplines(cards, state);
    results.textContent = `${visible.length} disciplina${visible.length === 1 ? '' : 's'} encontrada${visible.length === 1 ? '' : 's'}.`;
    grid.innerHTML = visible.length ? visible.map((item) => `
      <button type="button" class="study-discipline-card" data-discipline-id="${escapeAttr(item.id)}" aria-label="Abrir disciplina ${escapeAttr(item.name)}">
        <span class="study-discipline-card__top">
          <span class="study-discipline-card__icon" aria-hidden="true">${discIcon(item.id, 'ico--control')}</span>
          <span class="study-state study-state--${item.status.tone}">${escapeHtml(item.status.label)}</span>
        </span>
        <strong class="study-discipline-card__name">${escapeHtml(item.name)}</strong>
        <span class="study-discipline-card__meta">${item.topicCount} tópico${item.topicCount === 1 ? '' : 's'} · ${item.subtopicCount} subtópicos</span>
        <span class="study-progress-copy"><span>Progresso</span><strong>${item.progress}%</strong></span>
        <progress max="100" value="${item.progress}" aria-label="Progresso em ${escapeAttr(item.name)}: ${item.progress}%"></progress>
        <span class="study-discipline-card__stats">
          <span><small>Taxa de acerto</small><strong>${item.accuracy}%</strong></span>
          <span><small>Concluídos</small><strong>${item.completedSubtopics}/${item.subtopicCount}</strong></span>
        </span>
        <span class="study-discipline-card__action">${escapeHtml(item.actionLabel)} ${icon('chevronRight', 'ico--inline')}</span>
      </button>`).join('') : `
      <div class="ds-empty-state study-empty" role="status">
        <strong>Nenhuma disciplina encontrada</strong>
        <p>Ajuste o filtro ou limpe a busca para visualizar novamente o edital completo.</p>
        <button type="button" class="ds-button ds-button--secondary" id="study-clear-filters">Limpar filtros</button>
      </div>`;

    grid.querySelectorAll('[data-discipline-id]').forEach((button) => {
      button.addEventListener('click', () => {
        ctx.disciplineId = button.dataset.disciplineId;
        ctx.studyTopicId = null;
        ctx.studySubtopicId = null;
        navigate('topicTree');
      });
    });
    $('#study-clear-filters', grid)?.addEventListener('click', () => {
      state.filter = 'all';
      state.search = '';
      $('#study-search', root).value = '';
      root.querySelectorAll('[data-study-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.studyFilter === 'all')));
      paint();
    });
  }

  root.querySelectorAll('[data-study-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.studyFilter;
      root.querySelectorAll('[data-study-filter]').forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
      paint();
    });
  });
  $('#study-search', root)?.addEventListener('input', (event) => {
    state.search = event.currentTarget.value;
    paint();
  });
  paint();
}
