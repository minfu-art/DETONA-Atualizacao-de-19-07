/**
 * Edital verticalizado — navegação em 3 níveis:
 * Disciplinas → Subtópicos → Detalhe do subtópico
 * Regras SSOT/domínio/XP intactas.
 */
import { $, toast, escapeHtml, formatDate, starsHtml } from './helpers.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { getQuestionCounts, recalculateEditalSSOT, MIN_QUESTIONS_BATTLE } from '../core/ssot.js';
import { createBattleSession } from '../core/battle.js?v=68';
import { SFX } from '../core/audio.js';
import { tempLabel, computeMemoryTemperature } from '../core/memory.js';
import { mountPageContainer, sectionHeader } from './appShell.js';
import { progressBar } from './components.js';
import { icon, semanticIcon } from './icons.js?v=66';
import { getContestById } from '../contest/contestCatalog.js';
import { getActiveContestId } from '../contest/activeContest.js';
import {
  EDITAL_FILTERS,
  EDITAL_SORTS,
  enrichItems,
  filterEnriched,
  matchesSearch,
  sortEnriched,
  buildDisciplineCards,
  loadNavState,
  saveNavState,
  groupByNumberingPrefix,
  buildEditalInsights,
} from '../core/editalUiModel.js?v=68';

// nextReviewHint is defined in grimorio for formatDate coupling
function nextReviewHint(item) {
  if (!item.last_review_date) {
    if ((item.review_count || 0) === 0) return 'Ainda sem revisão registrada';
    return 'Revisão recomendada agora';
  }
  const last = new Date(item.last_review_date);
  const next = new Date(last.getTime() + 14 * 86400000);
  if (Date.now() > next.getTime()) return `Vencida desde ${formatDate(next.toISOString())}`;
  return formatDate(next.toISOString());
}

function indicatorChip({ on, label, category, detail = '' }) {
  const state = on ? 'concluído' : 'pendente';
  return `
    <span class="ev-ind ${on ? 'is-on' : 'is-off'}" title="${escapeHtml(label)}: ${state}${detail ? ` · ${detail}` : ''}"
      aria-label="${escapeHtml(label)}: ${state}${detail ? `, ${detail}` : ''}">
      <span class="ev-ind__ico" aria-hidden="true">${semanticIcon(category, 'ico--indicator')}</span>
      <span class="ev-ind__txt">${escapeHtml(label)}</span>
      ${detail ? `<span class="ev-ind__detail">${escapeHtml(detail)}</span>` : ''}
    </span>`;
}

function statusGlyph(status) {
  const map = { pronto: 'focus', bloqueado: 'lock', concluido: 'check', andamento: 'focus', nao_iniciado: 'circle' };
  return icon(map[status?.key] || 'circle', 'ico--state');
}

export async function renderGrimorio(root, navigate, ctx = {}) {
  const contestId = getActiveContestId() || 'default';
  const navState = loadNavState(contestId);

  /** @type {'disciplines'|'discipline'|'subtopic'} */
  let view = 'disciplines';
  let filter = 'all';
  let search = '';
  let sort = navState.sort || 'nome';
  let activeDisciplineId = navState.lastDisciplineId || null;
  let activeSubtopicId = navState.lastSubtopicId || null;
  /** disciplinas abertas como caixas expansíveis na visão principal */
  const expandedDisciplineIds = new Set(navState.lastDisciplineId ? [navState.lastDisciplineId] : []);
  /** grupos recolhidos dentro da disciplina */
  const collapsedGroups = {};

  const persist = () => {
    saveNavState(contestId, {
      lastDisciplineId: activeDisciplineId || '',
      lastSubtopicId: activeSubtopicId || '',
      sort,
    });
  };

  async function paint() {
    const [items, subtopics, disciplines, player, questionCounts] = await Promise.all([
      progressRepository.getAll(STORES.verticalized),
      progressRepository.getAll(STORES.subtopics),
      progressRepository.getAll(STORES.disciplines),
      progressRepository.getAll(STORES.player).then((p) => p[0]),
      getQuestionCounts(),
    ]);
    const subMap = Object.fromEntries(subtopics.map((s) => [s.id, s]));
    const discMap = Object.fromEntries(disciplines.map((d) => [d.id, d]));
    disciplines.sort((a, b) => (a.order || 0) - (b.order || 0));

    const now = Date.now();
    const contest = getContestById(contestId) || ctx.contest;
    const contestLabel = contest?.code || contest?.name || contestId || 'Concurso';
    const enrichedAll = enrichItems(items, subMap, questionCounts, now);

    let pipeline = filterEnriched(enrichedAll, filter);
    if (search.trim()) {
      pipeline = pipeline.filter((e) => {
        const disc = e.disciplineId ? discMap[e.disciplineId] : null;
        return matchesSearch(e, disc, search);
      });
    }
    pipeline = sortEnriched(pipeline, sort);

    const discCards = buildDisciplineCards(disciplines, enrichedAll, discMap)
      .filter((c) => {
        if (!search.trim() && filter === 'all') return true;
        // disciplina aparece se tiver item filtrado
        return pipeline.some((e) => e.disciplineId === c.discipline.id)
          || matchesSearch({ item: { title: c.discipline.name, edital_numbering: '', id: c.discipline.id }, sub: null }, c.discipline, search);
      });

    // Se disciplina ativa sumiu, volta para lista
    if (activeDisciplineId && !discCards.some((c) => c.discipline.id === activeDisciplineId)) {
      if (view !== 'disciplines') {
        // mantém se existe na lista completa
        if (!enrichedAll.some((e) => e.disciplineId === activeDisciplineId)) {
          activeDisciplineId = null;
          view = 'disciplines';
        }
      }
    }

    const completeCount = enrichedAll.filter((e) => e.spheres.complete).length;
    const overdueCount = enrichedAll.filter((e) => e.overdue && !e.spheres.complete).length;
    const editalPct = player?.edital_completion_pct ?? 0;
    const insights = buildEditalInsights(enrichedAll);
    const strongName = insights.strong[0]?.item.title || 'Comece a responder para descobrir';
    const weakName = insights.weak[0]?.item.title || 'Nenhuma fragilidade detectada';
    const pendingName = insights.nextAction?.item.title || 'Tudo concluído';

    const activeDiscCard = discCards.find((c) => c.discipline.id === activeDisciplineId)
      || (activeDisciplineId ? buildDisciplineCards(disciplines, enrichedAll, discMap).find((c) => c.discipline.id === activeDisciplineId) : null);

    const discSubtopics = activeDisciplineId
      ? sortEnriched(
        pipeline.filter((e) => e.disciplineId === activeDisciplineId),
        sort,
      )
      : [];

    // se busca na view disciplines com um único subtópico match, ainda mostra disciplinas
    const activeEntry = activeSubtopicId
      ? enrichedAll.find((e) => e.item.id === activeSubtopicId || e.item.subtopic_id === activeSubtopicId)
      : null;

    root.innerHTML = `
      <div class="ev-screen ev-nav-${view}" data-ev-view="${view}">
        <header class="ev-header" aria-label="Resumo do edital">
          <div class="ev-header__row">
            <div class="ev-header__copy">
              <span class="ev-kicker">${escapeHtml(contestLabel)}</span>
              <h2 class="ev-title">Edital verticalizado</h2>
            </div>
          </div>
          <section class="ev-overview" aria-label="Painel de progresso e domínio">
            <div class="ev-overview__progress">
              <div><span>Progresso geral</span><strong>${Number(editalPct).toFixed(1)}%</strong></div>
              ${progressBar({ value: editalPct, label: 'Progresso geral do edital', detail: `${completeCount}/${items.length} concluídos`, tone: editalPct >= 70 ? 'success' : 'plasma' })}
              <p>${insights.pendingCount ? `${insights.pendingCount} subtópicos ainda pedem ação.` : 'Edital concluído. Continue consolidando sua memória.'}</p>
            </div>
            <article class="ev-insight ev-insight--strong">
              <span>Força atual</span><strong>${insights.strongCount}</strong><p>${escapeHtml(strongName)}</p>
            </article>
            <article class="ev-insight ev-insight--weak">
              <span>Ponto fraco</span><strong>${insights.weakCount}</strong><p>${escapeHtml(weakName)}</p>
            </article>
            <article class="ev-insight ev-insight--pending">
              <span>Pendente</span><strong>${insights.pendingCount}</strong><p>${escapeHtml(pendingName)}</p>
            </article>
          </section>
          <div class="ev-search-wrap">
            <label class="sr-only" for="ev-search">Buscar disciplina ou subtópico</label>
            <input type="search" id="ev-search" class="ev-search"
              placeholder="Buscar disciplina, subtópico ou código…"
              value="${escapeHtml(search)}" autocomplete="off" />
          </div>
        </header>

        <div class="ev-toolbar">
          <div class="ev-filters" role="toolbar" aria-label="Filtros">
            ${EDITAL_FILTERS.map((f) => `
              <button type="button" class="ev-filter ${filter === f.id ? 'is-active' : ''}" data-f="${f.id}" aria-pressed="${filter === f.id}">${escapeHtml(f.label)}</button>
            `).join('')}
          </div>
          <label class="ev-sort">
            <span class="sr-only">Ordenar</span>
            <select id="ev-sort" aria-label="Ordenar">
              ${EDITAL_SORTS.map((s) => `<option value="${s.id}" ${sort === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="ev-layout" id="ev-layout">
          ${renderBody({
            view,
            discCards,
            activeDiscCard,
            discSubtopics,
            activeEntry,
            discMap,
            pipeline,
          })}
        </div>
      </div>
    `;

    mountPageContainer(root, {
      variant: 'grimorio',
      header: sectionHeader({
        eyebrow: 'Conhecimento',
        title: 'Edital verticalizado',
        subtitle: 'Disciplinas → tópicos → subtópicos → ações',
      }),
    });
    root.querySelector('.page-container--grimorio .section-header')?.classList.add('ev-shell-header');

    bindChrome();
    bindBody();
  }

  function renderBody({ view, discCards, activeDiscCard, discSubtopics, activeEntry, pipeline = [] }) {
    // Desktop: 2–3 colunas; mobile: um nível por vez
    if (view === 'disciplines') {
      return `
        <section class="ev-panel ev-panel--disciplines" aria-label="Disciplinas do edital">
          <h3 class="ev-panel__title">Tópicos do edital</h3>
          <p class="muted ev-panel__intro">Abra um tópico para ver os subtópicos e o desempenho detalhado.</p>
          <div class="ev-topic-stack">
            ${discCards.length ? discCards.map((card) => renderDisciplineAccordion(
              card,
              pipeline.filter((entry) => entry.disciplineId === card.discipline.id),
            )).join('') : '<p class="muted ev-empty">Nenhuma disciplina neste filtro.</p>'}
          </div>
        </section>`;
    }

    if (view === 'discipline' && activeDiscCard) {
      const d = activeDiscCard.discipline;
      const groups = groupByNumberingPrefix(discSubtopics);
      const showGroups = groups.length > 1 && groups.some((g) => g.items.length > 1);

      return `
        <section class="ev-panel ev-panel--subs" aria-label="Subtópicos de ${escapeHtml(d.name)}">
          <div class="ev-breadcrumb">
            <button type="button" class="ev-back btn btn-ghost" data-nav="disciplines" aria-label="Voltar para disciplinas">← Edital</button>
            <span class="ev-crumb-sep" aria-hidden="true">/</span>
            <strong>${semanticIcon('discipline', 'ico--inline')} ${escapeHtml(d.name)}</strong>
          </div>
          <div class="ev-disc-summary">
            <div><small>Progresso</small><strong>${activeDiscCard.pct}%</strong></div>
            <div><small>Concluídos</small><strong>${activeDiscCard.complete}/${activeDiscCard.total}</strong></div>
            <div><small>Respondidas</small><strong>${activeDiscCard.answered}</strong></div>
            <div><small>Acerto médio</small><strong>${activeDiscCard.avgAccuracy}%</strong></div>
            ${activeDiscCard.overdue ? `<div class="is-warn"><small>Atrasados</small><strong>${activeDiscCard.overdue}</strong></div>` : ''}
          </div>
          ${progressBar({
            value: activeDiscCard.pct,
            label: `Progresso de ${d.name}`,
            detail: `${activeDiscCard.pct}%`,
            tone: activeDiscCard.pct >= 70 ? 'success' : 'plasma',
          })}
          <div class="ev-sub-list">
            ${discSubtopics.length
              ? (showGroups
                ? groups.map((g) => {
                  const open = collapsedGroups[g.prefix] !== true;
                  return `
                    <div class="ev-group ${open ? 'is-open' : ''}">
                      <button type="button" class="ev-group__head" data-toggle-group="${escapeHtml(g.prefix)}" aria-expanded="${open}">
                        <span>${escapeHtml(g.title)}</span>
                        <span class="muted">${g.items.length}</span>
                        <span aria-hidden="true">${icon(open ? 'chevronDown' : 'chevronRight', 'ico--control')}</span>
                      </button>
                      <div class="ev-group__body" ${open ? '' : 'hidden'}>
                        ${g.items.map((e) => renderSubCard(e, false)).join('')}
                      </div>
                    </div>`;
                }).join('')
                : discSubtopics.map((e) => renderSubCard(e, false)).join(''))
              : '<p class="muted ev-empty">Nenhum subtópico neste filtro.</p>'}
          </div>
        </section>`;
    }

    if (view === 'subtopic' && activeEntry && activeDiscCard) {
      return `
        <div class="ev-desktop-split">
          <section class="ev-panel ev-panel--subs ev-panel--side" aria-label="Lista da disciplina">
            <div class="ev-breadcrumb">
              <button type="button" class="ev-back btn btn-ghost" data-nav="disciplines">← Edital</button>
              <button type="button" class="ev-back btn btn-ghost" data-nav="discipline">← ${escapeHtml(activeDiscCard.discipline.name)}</button>
            </div>
            <div class="ev-sub-list ev-sub-list--compact">
              ${discSubtopics.map((e) => renderSubCard(e, e.item.id === activeEntry.item.id)).join('')
                || renderSubCard(activeEntry, true)}
            </div>
          </section>
          <section class="ev-panel ev-panel--detail" aria-label="Detalhe do subtópico">
            ${renderSubDetail(activeEntry)}
          </section>
        </div>
        <div class="ev-mobile-only-detail">
          <div class="ev-breadcrumb">
            <button type="button" class="ev-back btn btn-ghost" data-nav="discipline">← ${escapeHtml(activeDiscCard.discipline.name)}</button>
          </div>
          ${renderSubDetail(activeEntry)}
        </div>`;
    }

    // fallback
    view = 'disciplines';
    return renderBody({ view, discCards, activeDiscCard: null, discSubtopics: [], activeEntry: null });
  }

  function renderDisciplineAccordion(card, filteredItems = []) {
    const d = card.discipline;
    const open = expandedDisciplineIds.has(d.id);
    const visibleItems = filteredItems.length ? filteredItems : card.items;
    const topicGroups = groupByNumberingPrefix(visibleItems);
    const panelId = `ev-topic-${d.id}`;
    return `
      <article class="ev-topic ${open ? 'is-open' : ''}" data-disc-id="${d.id}">
        <button type="button" class="ev-topic__trigger" data-toggle-disc="${d.id}"
          aria-expanded="${open}" aria-controls="${panelId}">
          <div class="ev-topic__main">
            <span class="ev-topic__icon" aria-hidden="true">${semanticIcon('discipline')}</span>
            <div class="ev-topic__copy">
              <strong>${escapeHtml(d.name)}</strong>
              <span>${card.complete}/${card.total} subtópicos concluídos</span>
            </div>
            <strong class="ev-topic__pct">${card.pct}%</strong>
            <span class="ev-topic__chevron" aria-hidden="true">${icon(open ? 'minus' : 'plus', 'ico--control')}</span>
          </div>
          <div class="ev-topic__bar" role="progressbar" aria-label="Progresso de ${escapeHtml(d.name)}"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="${card.pct}"><span style="width:${card.pct}%"></span></div>
          <div class="ev-topic__stats" aria-label="Estatísticas do tópico">
            <span><small>Respondidas</small><strong>${card.answered}</strong></span>
            <span><small>Acertos</small><strong class="is-correct">${card.correct}</strong></span>
            <span><small>Erros</small><strong class="is-wrong">${card.wrong}</strong></span>
            <span><small>Taxa de acerto</small><strong>${card.avgAccuracy}%</strong></span>
            ${card.overdue ? `<span><small>Revisões atrasadas</small><strong class="is-warn">${card.overdue}</strong></span>` : ''}
          </div>
        </button>
        <div class="ev-topic__panel" id="${panelId}" ${open ? '' : 'hidden'}>
          <div class="ev-topic__panel-head">
            <div><strong>Tópicos da disciplina</strong><small>${topicGroups.length} tópicos · ${visibleItems.length} subtópicos</small></div>
            <span>Abra um tópico para localizar forças, fragilidades e pendências.</span>
          </div>
          <div class="ev-topic-groups">
            ${topicGroups.length ? topicGroups.map((group) => renderTopicGroup(d, group)).join('') : '<p class="muted ev-empty">Nenhum subtópico neste filtro.</p>'}
          </div>
        </div>
      </article>`;
  }

  function renderTopicGroup(discipline, group) {
    const key = `${discipline.id}:${group.prefix}`;
    const open = collapsedGroups[key] === false;
    const state = group.complete === group.total
      ? { label: 'Dominado', tone: 'strong' }
      : group.overdue > 0 || (group.accuracy > 0 && group.accuracy < 60)
        ? { label: 'Atenção', tone: 'weak' }
        : group.progress > 0
          ? { label: 'Em evolução', tone: 'progress' }
          : { label: 'Pendente', tone: 'pending' };
    return `
      <section class="ev-topic-group ev-topic-group--${state.tone} ${open ? 'is-open' : ''}">
        <button type="button" class="ev-topic-group__trigger" data-toggle-group="${escapeHtml(key)}" aria-expanded="${open}">
          <span class="ev-topic-group__code">${escapeHtml(group.prefix)}</span>
          <div class="ev-topic-group__copy">
            <strong>${escapeHtml(group.title)}</strong>
            <span>${group.complete}/${group.total} subtópicos concluídos</span>
          </div>
          <div class="ev-topic-group__mastery">
            <span class="ev-mastery ev-mastery--${state.tone}">${state.label}</span>
            <span class="ev-topic-group__stars" aria-label="${group.stars} de 5 estrelas">${starsHtml(group.stars)}</span>
          </div>
          <strong class="ev-topic-group__pct">${group.progress}%</strong>
          <span class="ev-topic-group__chevron" aria-hidden="true">${icon(open ? 'minus' : 'plus', 'ico--control')}</span>
        </button>
        <div class="ev-topic-group__bar" aria-hidden="true"><span style="width:${group.progress}%"></span></div>
        <div class="ev-topic-group__metrics">
          <span><small>Domínio</small><strong>${group.accuracy}%</strong></span>
          <span><small>Pendentes</small><strong>${group.pending}</strong></span>
          ${group.overdue ? `<span><small>Atrasados</small><strong class="is-warn">${group.overdue}</strong></span>` : ''}
        </div>
        <div class="ev-topic-group__body" ${open ? '' : 'hidden'}>
          ${group.items.map((entry) => renderSubCard(entry, false)).join('')}
        </div>
      </section>`;
  }

  function renderDisciplineCard(card) {
    const d = card.discipline;
    return `
      <article class="ev-dcard" data-open-disc="${d.id}">
        <button type="button" class="ev-dcard__btn" data-open-disc="${d.id}" aria-label="Abrir ${escapeHtml(d.name)}">
          <div class="ev-dcard__top">
            <strong class="ev-dcard__name">${semanticIcon('discipline', 'ico--inline')} ${escapeHtml(d.name)}</strong>
            <span class="ev-dcard__pct">${card.pct}%</span>
          </div>
          <div class="ev-mini-bar" role="progressbar" aria-valuenow="${card.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso ${card.pct}%">
            <span style="width:${card.pct}%"></span>
          </div>
          <div class="ev-dcard__meta">
            <span>${card.complete}/${card.total} subtópicos</span>
            <span>${card.answered} resp.</span>
            <span>Acerto ${card.avgAccuracy}%</span>
            ${card.overdue ? `<span class="ev-disc__late">${card.overdue} atras.</span>` : ''}
          </div>
          <span class="ev-dcard__cta">Ver subtópicos ›</span>
        </button>
      </article>`;
  }

  function renderSubCard(e, selected) {
    const { item, sub, spheres, progress, accuracy, questionCount, status, answered, correct, wrong } = e;
    const memory = sub?.memory_temperature || computeMemoryTemperature(sub?.last_studied_at);
    const mastery = answered === 0
      ? { label: 'Pendente', tone: 'pending' }
      : accuracy >= 70 && (spheres.stars || 0) >= 3
        ? { label: 'Forte', tone: 'strong' }
        : accuracy < 60 || e.overdue
          ? { label: 'Frágil', tone: 'weak' }
          : { label: 'Em evolução', tone: 'progress' };
    // Ação curta — sem botão grande no compacto (evita corte na barra inferior)
    return `
      <article class="ev-card ev-subcard status-${status.key} ${selected ? 'is-selected' : ''}" data-open-sub="${item.id}" data-id="${item.id}">
        <button type="button" class="ev-subcard__hit" data-open-sub="${item.id}"
          aria-label="${escapeHtml(item.edital_numbering)} ${escapeHtml(item.title)}. ${escapeHtml(status.label)}. ${progress}%.">
          <div class="ev-card__top">
            <div class="ev-card__id">
              <span class="ev-code">${escapeHtml(item.edital_numbering || '')}</span>
              <strong class="ev-card__title">${escapeHtml(item.title)}</strong>
            </div>
            <div class="ev-card__badges">
              <span class="ev-mastery ev-mastery--${mastery.tone}">${mastery.label}</span>
              <span class="ev-status ev-status--${status.tone}">
                <span aria-hidden="true">${statusGlyph(status)}</span>
                <span class="ev-status__label">${escapeHtml(status.label)}</span>
              </span>
            </div>
          </div>
          <div class="ev-card__progress-row">
            <div class="ev-mini-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
              <span style="width:${progress}%"></span>
            </div>
            <strong class="ev-mini-pct">${progress}%</strong>
            <span class="ev-acc-pill" title="Domínio registrado">Domínio ${accuracy}%</span>
            <span class="ev-subcard__stars" aria-label="${spheres.stars || 0} de 5 estrelas">${starsHtml(spheres.stars || 0)}</span>
          </div>
          <div class="ev-substats" aria-label="Estatísticas do subtópico">
            <span><small>Respondidas</small><strong>${answered}</strong></span>
            <span><small>Acertos</small><strong class="is-correct">${correct}</strong></span>
            <span><small>Erros</small><strong class="is-wrong">${wrong}</strong></span>
            <span><small>Memória</small><strong>${escapeHtml(tempLabel(memory))}</strong></span>
            <span><small>No banco</small><strong>${questionCount}</strong></span>
          </div>
          <div class="ev-card__inds">
            ${indicatorChip({ on: spheres.theoryOn, label: 'Teoria', category: 'study' })}
            ${indicatorChip({ on: spheres.reviewOn, label: 'Revisão', category: 'review', detail: `${item.review_count || 0}x` })}
            ${indicatorChip({ on: spheres.combatOn, label: 'Questões', category: 'focus', detail: `${spheres.stars || 0}★` })}
            <span class="ev-qcount">${questionCount} q.</span>
            <span class="ev-short-act">${escapeHtml(status.shortAction || status.action)}</span>
          </div>
        </button>
      </article>`;
  }

  function renderSubDetail(e) {
    const { item, sub, spheres, questionCount, status, progress, accuracy, answered } = e;
    const correctN = Array.isArray(sub?.correct_question_ids) ? sub.correct_question_ids.length : 0;
    const wrongN = Array.isArray(sub?.incorrect_question_ids) ? sub.incorrect_question_ids.length : 0;
    const memory = sub?.memory_temperature || computeMemoryTemperature(sub?.last_studied_at);
    const lastAt = sub?.last_studied_at || sub?.last_attempt_at || item.last_review_date;
    const armed = questionCount >= MIN_QUESTIONS_BATTLE;
    const theoryLabel = item.theory_status === 'concluido' ? 'Concluída' : item.theory_status === 'estudando' ? 'Estudando' : 'Não iniciada';

    return `
      <div class="ev-detail" data-id="${item.id}">
        <header class="ev-detail__head">
          <span class="ev-code">${escapeHtml(item.edital_numbering || '')}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <span class="ev-status ev-status--${status.tone}"><span aria-hidden="true">${statusGlyph(status)}</span> ${escapeHtml(status.label)}</span>
        </header>
        <div class="ev-metrics">
          <div class="ev-metric">
            <small>Progresso do subtópico</small>
            <strong>${progress}%</strong>
            <span class="muted">Etapas: teoria · revisão · combate</span>
            ${progressBar({ value: progress, label: `Progresso do subtópico ${item.title}`, detail: `${progress}%`, tone: progress >= 100 ? 'success' : 'plasma' })}
          </div>
          <div class="ev-metric">
            <small>Taxa de acerto</small>
            <strong>${accuracy}%</strong>
            <span class="muted">Melhor desempenho em questões</span>
            ${progressBar({ value: accuracy, label: `Taxa de acerto em ${item.title}`, detail: `${accuracy}%`, tone: accuracy >= 70 ? 'success' : 'plasma' })}
          </div>
        </div>
        <dl class="ev-details">
          <div><dt>Questões respondidas</dt><dd>${answered}</dd></div>
          <div><dt>Meta mínima</dt><dd>${MIN_QUESTIONS_BATTLE} questões no banco</dd></div>
          <div><dt>Acertos / erros</dt><dd>${correctN} / ${wrongN}</dd></div>
          <div><dt>Questões no banco</dt><dd>${questionCount}</dd></div>
          <div><dt>Última atividade</dt><dd>${lastAt ? formatDate(lastAt) : '—'}</dd></div>
          <div><dt>Próxima revisão</dt><dd>${escapeHtml(nextReviewHint(item))}</dd></div>
          <div><dt>Memória atual</dt><dd>${escapeHtml(tempLabel(memory))}</dd></div>
          <div><dt>Teoria</dt><dd>${escapeHtml(theoryLabel)}</dd></div>
          <div><dt>Revisão</dt><dd>${spheres.reviewOn ? 'Etapa ok' : 'Pendente'} · ${item.review_count || 0}x</dd></div>
          <div><dt>Questões</dt><dd>${spheres.combatOn ? 'Domínio confirmado' : `${spheres.stars || 0}/3 estrelas`}</dd></div>
        </dl>
        <div class="ev-expanded-actions">
          <button type="button" class="btn" data-act="theory" data-id="${item.id}">Começar teoria / alternar</button>
          <button type="button" class="btn" data-act="review" data-id="${item.id}">Fazer revisão</button>
          <button type="button" class="btn" data-act="primary" data-kind="blocked" data-id="${item.id}">Resolver questões</button>
          <button type="button" class="btn btn-primary grim-item__battle" data-act="battle" data-id="${item.id}" ${armed ? '' : 'disabled'}>
            Iniciar questões
          </button>
          <button type="button" class="btn btn-ghost" data-act="primary" data-kind="result" data-id="${item.id}">Ver desempenho</button>
        </div>
        ${armed ? '' : `<small class="grim-item__waiting">Conteúdo em preparação — Meta mínima: ${MIN_QUESTIONS_BATTLE} questões no banco (hoje: ${questionCount}).</small>`}
        <p class="muted ev-hint">${answered} questões respondidas · Meta mínima: ${MIN_QUESTIONS_BATTLE} · ${questionCount} no banco</p>
      </div>`;
  }

  function bindChrome() {
    root.querySelectorAll('.ev-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        filter = btn.dataset.f;
        paint();
      });
    });
    const searchInput = $('#ev-search', root);
    let t = null;
    searchInput?.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        search = searchInput.value || '';
        paint();
        const el = root.querySelector('#ev-search');
        if (el) {
          el.focus();
          const len = el.value.length;
          try { el.setSelectionRange(len, len); } catch { /* ignore */ }
        }
      }, 160);
    });
    $('#ev-sort', root)?.addEventListener('change', (ev) => {
      sort = ev.target.value || 'nome';
      persist();
      paint();
    });
  }

  function bindBody() {
    root.querySelectorAll('[data-nav="disciplines"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        view = 'disciplines';
        activeSubtopicId = null;
        persist();
        paint();
      });
    });
    root.querySelectorAll('[data-nav="discipline"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        view = 'disciplines';
        activeSubtopicId = null;
        if (activeDisciplineId) expandedDisciplineIds.add(activeDisciplineId);
        persist();
        paint();
      });
    });
    root.querySelectorAll('[data-toggle-disc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        const id = btn.dataset.toggleDisc;
        if (!id) return;
        if (expandedDisciplineIds.has(id)) expandedDisciplineIds.delete(id);
        else expandedDisciplineIds.add(id);
        activeDisciplineId = id;
        activeSubtopicId = null;
        persist();
        paint();
      });
    });
    root.querySelectorAll('[data-open-disc]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        SFX.click();
        const id = el.dataset.openDisc || el.closest('[data-open-disc]')?.dataset.openDisc;
        if (!id) return;
        activeDisciplineId = id;
        activeSubtopicId = null;
        view = 'discipline';
        persist();
        paint();
      });
    });
    root.querySelectorAll('[data-open-sub]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        // se clicou em botão de ação dentro do detalhe, não interceptar
        if (ev.target.closest('[data-act]')) return;
        SFX.click();
        const id = el.dataset.openSub || el.closest('[data-open-sub]')?.dataset.openSub;
        if (!id) return;
        const disciplineId = el.closest('[data-disc-id]')?.dataset.discId;
        if (disciplineId) activeDisciplineId = disciplineId;
        activeSubtopicId = id;
        view = 'subtopic';
        persist();
        paint();
      });
    });
    root.querySelectorAll('[data-toggle-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        const g = btn.dataset.toggleGroup;
        collapsedGroups[g] = btn.getAttribute('aria-expanded') === 'true';
        paint();
      });
    });

    // Ações de negócio (inalteradas)
    root.querySelectorAll('[data-act="theory"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        SFX.click();
        const id = btn.dataset.id || root.querySelector('.ev-detail')?.dataset.id;
        const items = await progressRepository.getAll(STORES.verticalized);
        const item = items.find((i) => i.id === id);
        if (!item) return;
        const cycle = { nao_iniciado: 'estudando', estudando: 'concluido', concluido: 'nao_iniciado' };
        item.theory_status = cycle[item.theory_status] || 'estudando';
        await progressRepository.put(STORES.verticalized, item);
        await recalculateEditalSSOT();
        toast(item.theory_status === 'concluido' ? 'Teoria concluída' : 'Teoria atualizada');
        paint();
      });
    });
    root.querySelectorAll('[data-act="review"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        SFX.click();
        const id = btn.dataset.id || root.querySelector('.ev-detail')?.dataset.id;
        const items = await progressRepository.getAll(STORES.verticalized);
        const item = items.find((i) => i.id === id);
        if (!item) return;
        item.review_count = (item.review_count || 0) + 1;
        item.last_review_date = new Date().toISOString();
        await progressRepository.put(STORES.verticalized, item);
        await recalculateEditalSSOT();
        toast('+1 Revisão registrada');
        paint();
      });
    });
    root.querySelectorAll('[data-act="battle"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        SFX.click();
        const id = btn.dataset.id || root.querySelector('.ev-detail')?.dataset.id;
        const items = await progressRepository.getAll(STORES.verticalized);
        const item = items.find((i) => i.id === id);
        if (!item) return;
        try {
          ctx.battleSession = await createBattleSession(item.subtopic_id);
          navigate('battle');
        } catch (error) {
          toast(error.message || 'Não foi possível iniciar a batalha.');
        }
      });
    });
    root.querySelectorAll('[data-act="primary"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        SFX.click();
        const kind = btn.dataset.kind;
        const id = btn.dataset.id || root.querySelector('.ev-detail')?.dataset.id;
        const items = await progressRepository.getAll(STORES.verticalized);
        const item = items.find((i) => i.id === id);
        if (!item) return;
        if (kind === 'start' || kind === 'continue') {
          if (item.theory_status === 'nao_iniciado') {
            item.theory_status = 'estudando';
            await progressRepository.put(STORES.verticalized, item);
            await recalculateEditalSSOT();
          }
          toast('Teoria em andamento');
          paint();
          return;
        }
        if (kind === 'blocked' || kind === 'result') {
          // Resolver questões / ver desempenho → mapa da disciplina
          navigate('map');
          return;
        }
      });
    });
  }

  await paint();
}
