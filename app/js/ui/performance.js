import { performanceService } from '../services/performanceService.js';
import { ICO, discIcon } from './icons.js?v=67';
import { escapeHtml } from './helpers.js';
import {
  PERFORMANCE_CHART_COLORS,
  PERFORMANCE_PERIODS,
  buildPerformanceVisualModel,
  clampVisualPercent,
  formatPerformanceDate,
  formatPerformanceMinutes,
  formatPerformancePercent,
  performanceToneFromClassification,
} from './performanceVisualModel.js?v=1';

const PERFORMANCE_MENTOR_ART = 'assets/mentor/orion-performance-analyst.webp?v=1';

function progressAttributes(value, unavailableLabel) {
  return value == null
    ? `aria-valuetext="${escapeHtml(unavailableLabel)}"`
    : `aria-valuenow="${Math.round(clampVisualPercent(value))}"`;
}

function periodControls(model) {
  const options = PERFORMANCE_PERIODS.map(([value, label]) => (
    `<option value="${value}"${value === model.period ? ' selected' : ''}>${label}</option>`
  )).join('');
  const buttons = PERFORMANCE_PERIODS.map(([value, label]) => (
    `<button type="button" data-performance-period="${value}" aria-pressed="${value === model.period}">${label}</button>`
  )).join('');
  return `<div class="performance-period-control" aria-label="Período da análise">
    <div class="performance-period-segments" role="group" aria-label="Filtrar desempenho por período">${buttons}</div>
    <label class="performance-period-select"><span>Período</span><select aria-label="Filtrar desempenho por período">${options}</select></label>
  </div>`;
}

function pageHeader(model) {
  return `<header class="performance-page-header">
    <button type="button" class="performance-action-button performance-back" id="performance-back" aria-label="Voltar para Hoje">${ICO.home?.() || ''}</button>
    <div class="performance-page-heading">
      <span>Central analítica</span>
      <h1>Desempenho</h1>
      <p>Veja o que seus dados mostram sobre sua preparação.</p>
      <div class="performance-contest-context">
        <strong>${escapeHtml(model.contest.name)}</strong>${model.contest.role ? `<span>${escapeHtml(model.contest.role)}</span>` : ''}
      </div>
    </div>
    ${periodControls(model)}
    <button type="button" class="performance-action-button performance-profile" id="performance-profile" aria-label="Abrir meu perfil">${ICO.user?.() || 'P'}<span>Perfil</span></button>
  </header>`;
}

function orionHero(model) {
  return `<section class="performance-orion" aria-labelledby="performance-orion-title">
    <div class="performance-orion__copy">
      <div class="performance-orion__identity"><span>Orion</span><strong>Analista de desempenho</strong></div>
      <h2 id="performance-orion-title">${escapeHtml(model.orion.title)}</h2>
      <p class="performance-orion__summary">${escapeHtml(model.orion.summary)}</p>
      <div class="performance-orion__context">
        <span>${escapeHtml(model.orion.context)}</span>
        <span>${escapeHtml(model.orion.projectionMessage)}</span>
      </div>
      ${model.qualityWarning ? '<p class="performance-quality-note" role="status">Alguns registros antigos não puderam entrar nesta análise.</p>' : ''}
    </div>
    <div class="performance-orion__art">
      <img src="${PERFORMANCE_MENTOR_ART}" alt="Orion analisando o desempenho do estudante" width="1024" height="1536" decoding="async" />
    </div>
  </section>`;
}

function completionKpi(model) {
  const value = model.completion.value;
  const aria = progressAttributes(value, 'Conclusão do edital indisponível');
  return `<article class="performance-kpi performance-kpi--completion">
    <div class="performance-kpi__label"><span>Conclusão do edital</span><i aria-hidden="true">${ICO.chart?.() || ''}</i></div>
    <strong>${escapeHtml(model.completion.display)}</strong>
    <p>Itens que concluíram todas as etapas do DETONA.</p>
    <div class="performance-progress" role="progressbar" aria-label="Conclusão integral do edital" aria-valuemin="0" aria-valuemax="100" ${aria}>
      <span style="--perf-progress:${model.completion.visual}%"></span>
    </div>
  </article>`;
}

function accuracyKpi(model) {
  const aria = progressAttributes(model.accuracy.value, 'Taxa de acertos indisponível');
  const context = model.accuracy.available
    ? `${model.questions.answered} questões no período`
    : 'Ainda não há respostas no período';
  return `<article class="performance-kpi performance-kpi--accuracy">
    <div class="performance-kpi__label"><span>Taxa de acertos</span><i aria-hidden="true">${ICO.target?.() || ''}</i></div>
    <strong>${escapeHtml(model.accuracy.display)}</strong>
    <p>${escapeHtml(context)}</p>
    <div class="performance-progress" role="progressbar" aria-label="Taxa de acertos" aria-valuemin="0" aria-valuemax="100" ${aria}>
      <span style="--perf-progress:${model.accuracy.visual}%"></span>
    </div>
  </article>`;
}

function questionsKpi(model) {
  return `<article class="performance-kpi performance-kpi--questions">
    <div class="performance-kpi__label"><span>Questões</span><i aria-hidden="true">${ICO.book?.() || ''}</i></div>
    <strong>${model.questions.answered}</strong>
    <p>${model.questions.correct} certas · ${model.questions.errors} erradas</p>
  </article>`;
}

function timeKpi(model) {
  return `<article class="performance-kpi performance-kpi--time">
    <div class="performance-kpi__label"><span>Tempo estudado</span><i aria-hidden="true">${ICO.clock?.() || ''}</i></div>
    <strong>${escapeHtml(model.time.totalDisplay)}</strong>
    <p>${model.time.hasRecordedTime ? 'Tempo acadêmico registrado' : 'Nenhuma sessão registrada'}</p>
  </article>`;
}

function kpiSection(model) {
  return `<section class="performance-kpis" aria-labelledby="performance-kpis-title">
    <div class="performance-section-heading"><div><span>Visão geral</span><h2 id="performance-kpis-title">Indicadores principais</h2><p>Leitura rápida do seu progresso acadêmico no período.</p></div></div>
    <div class="performance-kpi-grid">${completionKpi(model)}${accuracyKpi(model)}${questionsKpi(model)}${timeKpi(model)}</div>
  </section>`;
}

export function masteryHeroCard(data) {
  const model = buildPerformanceVisualModel(data);
  const aria = progressAttributes(model.completion.value, 'Conclusão do edital indisponível');
  const remainingAria = progressAttributes(model.completion.remaining, 'Percentual ainda não concluído indisponível');
  return `<section class="performance-completion-detail" aria-labelledby="performance-progress-title">
    <div>
      <span>Progresso integral do edital</span>
      <h2 id="performance-progress-title">Conclusão do edital</h2>
      <strong>${escapeHtml(model.completion.display)}</strong>
      <p>Teoria concluída, revisão realizada e domínio mínimo.</p>
      <div class="performance-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${aria} aria-label="Conclusão do edital"><span style="--perf-progress:${model.completion.visual}%"></span></div>
    </div>
    <dl>
      <div><dt>Teoria concluída</dt><dd>${model.completion.theoryCompleted} com teoria concluída · ${model.completion.totalTopics} no total</dd></div>
      <div><dt>Teoria pendente</dt><dd>${model.completion.theoryPending}</dd></div>
      <div><dt>Ainda não concluído</dt><dd>${escapeHtml(model.completion.remainingDisplay)}</dd></div>
    </dl>
    <div class="sr-only" role="progressbar" aria-label="Percentual ainda não concluído" aria-valuemin="0" aria-valuemax="100" ${remainingAria}></div>
  </section>`;
}

export function sortDisciplines(rows, mode = 'edital') {
  const result = [...rows];
  if (mode === 'lowest') return result.sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  if (mode === 'highest') return result.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
  return result.sort((a, b) => a.order - b.order);
}

function classificationBadge(classification, tone) {
  return `<span class="performance-classification performance-classification--${tone}"><i aria-hidden="true"></i>${escapeHtml(classification || 'Sem respostas')}</span>`;
}

function subtopicRowsHtml(subtopics = []) {
  if (!subtopics.length) return '<p class="performance-subtopic-empty">Nenhum subtópico cadastrado nesta disciplina.</p>';
  return `<ol class="performance-subtopic-list">${subtopics.map((subtopic) => {
    const tone = performanceToneFromClassification(subtopic.classification);
    const available = subtopic.accuracy != null;
    const visual = clampVisualPercent(subtopic.accuracy) ?? 0;
    const aria = progressAttributes(subtopic.accuracy, 'Taxa de acertos indisponível');
    return `<li class="performance-subtopic performance-tone--${tone}" data-subtopic="${escapeHtml(subtopic.id)}">
      <div class="performance-subtopic__heading">
        <div>${subtopic.numbering ? `<span>${escapeHtml(subtopic.numbering)}</span>` : ''}<h4>${escapeHtml(subtopic.name)}</h4></div>
        <strong>${escapeHtml(formatPerformancePercent(subtopic.accuracy))}</strong>
      </div>
      <div class="performance-progress" role="progressbar" aria-label="Taxa de acertos em ${escapeHtml(subtopic.name)}" aria-valuemin="0" aria-valuemax="100" ${aria}><span style="--perf-progress:${visual}%"></span></div>
      <dl class="performance-subtopic__metrics">
        <div><dt>Questões</dt><dd>${subtopic.answered}</dd></div>
        <div><dt>Certas</dt><dd>${subtopic.correct}</dd></div>
        <div><dt>Erradas</dt><dd>${subtopic.errors}</dd></div>
        <div><dt>Tempo</dt><dd>${subtopic.minutes ? escapeHtml(formatPerformanceMinutes(subtopic.minutes)) : '—'}</dd></div>
      </dl>
      <div class="performance-subtopic__footer">
        ${classificationBadge(subtopic.classification, tone)}
        <div class="performance-subtopic__secondary">
          ${subtopic.masteryPct != null ? `<span>Domínio: ${escapeHtml(formatPerformancePercent(subtopic.masteryPct))}</span>` : ''}
          ${subtopic.stars ? `<span>Estrelas: ${subtopic.stars}</span>` : ''}
          ${subtopic.memory ? `<span>Memória: ${escapeHtml(subtopic.memory)}</span>` : ''}
        </div>
      </div>
      ${available ? '' : '<span class="sr-only">Sem respostas registradas neste subtópico.</span>'}
    </li>`;
  }).join('')}</ol>`;
}

function disciplineRows(rows, mode = 'edital') {
  return sortDisciplines(rows, mode).map((discipline) => {
    const tone = performanceToneFromClassification(discipline.classification);
    const visual = clampVisualPercent(discipline.accuracy) ?? 0;
    const aria = progressAttributes(discipline.accuracy, 'Taxa de acertos indisponível');
    const panelId = `performance-discipline-panel-${escapeHtml(discipline.id)}`;
    const triggerId = `performance-discipline-trigger-${escapeHtml(discipline.id)}`;
    return `<li class="performance-discipline-row performance-tone--${tone}" data-disc-id="${escapeHtml(discipline.id)}">
      <button type="button" class="performance-discipline-trigger" aria-expanded="false" aria-controls="${panelId}" id="${triggerId}">
        <span class="performance-discipline-trigger__icon" aria-hidden="true">${discIcon(discipline.id, 'ico--sm')}</span>
        <span class="performance-discipline-trigger__copy"><strong>${escapeHtml(discipline.name)}</strong><small>${discipline.answered} questões · ${discipline.subtopicCount || 0} subtópicos · ${discipline.minutes ? escapeHtml(formatPerformanceMinutes(discipline.minutes)) : 'sem tempo registrado'}</small></span>
        ${classificationBadge(discipline.classification, tone)}
        <span class="performance-discipline-trigger__accuracy">${escapeHtml(formatPerformancePercent(discipline.accuracy))}</span>
        <span class="performance-discipline-trigger__chevron" aria-hidden="true">${ICO.chevronDown?.() || '▾'}</span>
      </button>
      <div class="performance-progress performance-progress--discipline" role="progressbar" aria-label="Taxa de acertos em ${escapeHtml(discipline.name)}" aria-valuemin="0" aria-valuemax="100" ${aria}><span style="--perf-progress:${visual}%"></span></div>
      <div class="performance-discipline-panel" id="${panelId}" role="region" aria-labelledby="${triggerId}" hidden>
        <dl class="performance-discipline-summary">
          <div><dt>Taxa de acertos</dt><dd>${escapeHtml(formatPerformancePercent(discipline.accuracy))}</dd></div>
          <div><dt>Questões</dt><dd>${discipline.answered}</dd></div>
          <div><dt>Certas / erradas</dt><dd>${discipline.correct} / ${discipline.errors}</dd></div>
          <div><dt>Tempo</dt><dd>${discipline.minutes ? escapeHtml(formatPerformanceMinutes(discipline.minutes)) : '—'}</dd></div>
          <div><dt>Subtópicos</dt><dd>${discipline.subtopicCount || 0}</dd></div>
          <div><dt>Domínio</dt><dd>${discipline.masteryPct == null ? '—' : escapeHtml(formatPerformancePercent(discipline.masteryPct))}</dd></div>
        </dl>
        <h3>Subtópicos</h3>
        ${subtopicRowsHtml(discipline.subtopics || [])}
      </div>
    </li>`;
  }).join('');
}

function disciplinesSection(model) {
  return `<section class="performance-panel performance-disciplines" aria-labelledby="performance-disciplines-title">
    <div class="performance-section-heading performance-section-heading--with-control">
      <div><span>Precisão por matéria</span><h2 id="performance-disciplines-title">Desempenho por disciplina</h2><p>A taxa de acertos é o indicador principal desta comparação.</p></div>
      <label class="performance-sort"><span>Ordenar disciplinas</span><select id="performance-discipline-sort"><option value="edital">Ordem do edital</option><option value="lowest">Menor desempenho</option><option value="highest">Maior desempenho</option></select></label>
    </div>
    ${model.disciplines.length
      ? `<ol id="performance-discipline-list" class="performance-discipline-list">${disciplineRows(model.disciplines)}</ol>`
      : '<div class="performance-empty"><strong>Sem disciplinas avaliadas</strong><p>As disciplinas aparecerão quando este concurso possuir conteúdo disponível.</p></div>'}
  </section>`;
}

function evolutionChart(model) {
  if (model.evolution.length < 2) {
    return '<div class="performance-empty"><strong>Evolução ainda em formação</strong><p>Continue respondendo questões para formar uma série comparável.</p></div>';
  }
  const width = 100;
  const height = 48;
  const points = model.evolution.map((item, index) => ({
    ...item,
    x: (index / (model.evolution.length - 1)) * width,
    y: height - ((clampVisualPercent(item.value) ?? 0) / 100) * height,
  }));
  const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const accessible = points.map((point) => `Em ${formatPerformanceDate(point.at)}: ${formatPerformancePercent(point.value)} de acertos em ${point.answered} respostas.`).join(' ');
  return `<div class="performance-evolution-chart">
    <svg viewBox="0 -4 100 58" role="img" aria-labelledby="performance-evolution-svg-title performance-evolution-svg-desc" preserveAspectRatio="none">
      <title id="performance-evolution-svg-title">Evolução da taxa de acertos por dia</title>
      <desc id="performance-evolution-svg-desc">${escapeHtml(accessible)}</desc>
      <g class="performance-evolution-grid" aria-hidden="true"><line x1="0" y1="0" x2="100" y2="0"/><line x1="0" y1="24" x2="100" y2="24"/><line x1="0" y1="48" x2="100" y2="48"/></g>
      <polyline points="${line}" vector-effect="non-scaling-stroke"/>
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2" vector-effect="non-scaling-stroke"><title>${escapeHtml(`${formatPerformanceDate(point.at)} · ${formatPerformancePercent(point.value)} · ${point.answered} respostas`)}</title></circle>`).join('')}
    </svg>
    <div class="performance-evolution-axis" aria-hidden="true"><span>${formatPerformanceDate(points[0].at)}</span><span>Taxa de acertos</span><span>${formatPerformanceDate(points.at(-1).at)}</span></div>
    <p class="sr-only">${escapeHtml(accessible)}</p>
  </div>`;
}

function evolutionSection(model) {
  return `<section class="performance-panel performance-evolution" aria-labelledby="performance-evolution-title">
    <div class="performance-section-heading"><div><span>Tendência real</span><h2 id="performance-evolution-title">Evolução</h2><p>Taxa de acertos ponderada pelo volume de respostas de cada dia.</p></div></div>
    ${evolutionChart(model)}
  </section>`;
}

function timeChart(model) {
  if (!model.time.hasRecordedTime) {
    return '<div class="performance-empty"><strong>Ainda não há tempo registrado</strong><p>Conclua uma sessão de foco para visualizar o tempo real de estudo.</p></div>';
  }
  if (!model.time.hasDistribution) {
    return `<div class="performance-time-unidentified" role="status"><strong>${escapeHtml(model.time.totalDisplay)}</strong><span>Tempo total</span><p>Todo o tempo registrado está sem disciplina identificada. Nenhum minuto foi redistribuído.</p></div>`;
  }
  let cursor = 0;
  const segments = model.time.byDiscipline.map((item, index) => {
    const start = cursor;
    cursor += item.percentage;
    return `${PERFORMANCE_CHART_COLORS[index % PERFORMANCE_CHART_COLORS.length]} ${start}% ${cursor}%`;
  });
  if (model.time.undistributedMinutes > 0) segments.push(`#64748b ${cursor}% 100%`);
  const list = model.time.byDiscipline.map((item, index) => `<li>
    <i style="--perf-legend:${PERFORMANCE_CHART_COLORS[index % PERFORMANCE_CHART_COLORS.length]}" aria-hidden="true"></i>
    <span>${escapeHtml(item.name)}</span><strong>${escapeHtml(formatPerformanceMinutes(item.minutes))}</strong><small>${item.percentage}% do tempo total</small>
  </li>`).join('');
  const unidentified = model.time.undistributedMinutes > 0 ? `<li class="performance-time-undistributed">
    <i style="--perf-legend:#64748b" aria-hidden="true"></i><span>Tempo sem disciplina identificada</span><strong>${escapeHtml(model.time.undistributedDisplay)}</strong><small>${model.time.undistributedPercentage}% do tempo total</small>
  </li>` : '';
  return `<div class="performance-time-content">
    <div class="performance-donut" style="--perf-time-chart:conic-gradient(${segments.join(',')})" role="img" aria-label="Distribuição do tempo por disciplina. Total: ${escapeHtml(model.time.totalDisplay)}"><div><span>Tempo total</span><strong>${escapeHtml(model.time.totalDisplay)}</strong></div></div>
    <ul>${list}${unidentified}</ul>
  </div>`;
}

function timeSection(model) {
  return `<section class="performance-panel performance-time" aria-labelledby="performance-time-title">
    <div class="performance-section-heading"><div><span>Tempo acadêmico real</span><h2 id="performance-time-title">Foco por disciplina</h2><p>Distribuição das sessões registradas no período.</p></div></div>
    ${timeChart(model)}
  </section>`;
}

function reviewsSection(model) {
  const memory = model.reviews.memory;
  return `<section class="performance-panel performance-reviews" aria-labelledby="performance-reviews-title">
    <div class="performance-section-heading"><div><span>Retenção</span><h2 id="performance-reviews-title">Memória e revisões</h2><p>Estado da fila de revisão, sem equivaler memória a domínio.</p></div></div>
    <div class="performance-review-grid">
      <article><span>No período</span><strong>${model.reviews.completedInPeriod}</strong><small>revisões realizadas</small></article>
      <article><span>Total histórico</span><strong>${model.reviews.totalCompleted}</strong><small>revisões registradas</small></article>
      <article><span>Ativas</span><strong>${model.reviews.active}</strong><small>itens na fila</small></article>
      <article class="${model.reviews.due > 0 ? 'is-due' : ''}"><span>Vencidas</span><strong>${model.reviews.due}</strong><small>pedem atenção</small></article>
      <article><span>Congeladas</span><strong>${model.reviews.frozen}</strong><small>fora da fila ativa</small></article>
    </div>
    <div class="performance-memory" aria-label="Estados de memória">
      <span class="memory-hot"><i aria-hidden="true"></i>Quente <strong>${memory.quente}</strong></span>
      <span class="memory-warm"><i aria-hidden="true"></i>Morna <strong>${memory.morna}</strong></span>
      <span class="memory-cold"><i aria-hidden="true"></i>Fria <strong>${memory.fria}</strong></span>
      <span class="memory-frozen"><i aria-hidden="true"></i>Congelada <strong>${memory.congelada}</strong></span>
    </div>
    ${model.reviews.due > 0 ? '<button type="button" class="performance-review-cta" id="performance-review-now">Revisar agora</button>' : ''}
  </section>`;
}

function detailsSection(model) {
  return `<section class="performance-details" aria-labelledby="performance-details-title">
    <div><span>Detalhes da leitura</span><h2 id="performance-details-title">Progresso integral do edital</h2><p>Conclusão integral e teoria concluída permanecem indicadores diferentes.</p></div>
    ${masteryHeroCard({ progress: {
      completion: model.completion.value,
      remainingCompletion: model.completion.remaining,
      totalTopics: model.completion.totalTopics,
      completedTopics: model.completion.theoryCompleted,
    } })}
  </section>`;
}

export function renderPerformancePage(data, contest) {
  const model = buildPerformanceVisualModel(data, contest);
  return `${pageHeader(model)}
    <div class="performance-dashboard" aria-live="off">
      <div class="performance-update-status" id="performance-update-status" role="status" aria-live="polite" hidden>Atualizando período…</div>
      ${orionHero(model)}
      ${kpiSection(model)}
      ${disciplinesSection(model)}
      <div class="performance-analytics-grid">${evolutionSection(model)}${timeSection(model)}</div>
      ${reviewsSection(model)}
      ${detailsSection(model)}
    </div>`;
}

function bind(root, navigate, data, rerender) {
  root.querySelectorAll('[data-performance-period]').forEach((button) => button.addEventListener('click', () => rerender(button.dataset.performancePeriod)));
  root.querySelector('.performance-period-select select')?.addEventListener('change', (event) => rerender(event.target.value));
  root.querySelector('#performance-back')?.addEventListener('click', () => navigate('home'));
  root.querySelector('#performance-profile')?.addEventListener('click', () => navigate('profile'));
  root.querySelector('#performance-review-now')?.addEventListener('click', () => navigate('review'));

  const bindAccordion = () => {
    root.querySelectorAll('.performance-discipline-trigger').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.closest('.performance-discipline-row');
        const panel = item?.querySelector('.performance-discipline-panel');
        if (!item || !panel) return;
        const willOpen = panel.hidden;
        root.querySelectorAll('.performance-discipline-row').forEach((other) => {
          if (other === item) return;
          other.classList.remove('is-open');
          const otherPanel = other.querySelector('.performance-discipline-panel');
          const otherButton = other.querySelector('.performance-discipline-trigger');
          if (otherPanel) otherPanel.hidden = true;
          otherButton?.setAttribute('aria-expanded', 'false');
        });
        item.classList.toggle('is-open', willOpen);
        panel.hidden = !willOpen;
        button.setAttribute('aria-expanded', String(willOpen));
      });
    });
  };

  root.querySelector('#performance-discipline-sort')?.addEventListener('change', (event) => {
    const list = root.querySelector('#performance-discipline-list');
    if (!list) return;
    list.innerHTML = disciplineRows(data.disciplines, event.target.value);
    bindAccordion();
  });
  bindAccordion();
}

export async function renderPerformance(root, navigate, ctx = {}) {
  let requestVersion = 0;
  const initialScope = `${ctx.user?.id || ''}:${ctx.contest?.id || ''}`;
  const renderPeriod = async (period = '30d') => {
    const version = ++requestVersion;
    root.setAttribute('aria-busy', 'true');
    const loading = root.querySelector('#performance-update-status');
    if (loading) loading.hidden = false;
    if (!root.querySelector('.performance-dashboard')) {
      root.innerHTML = '<div class="performance-initial-loading" role="status" aria-live="polite"><span></span><strong>Preparando análise do Orion…</strong></div>';
    }
    try {
      const data = await performanceService.getDashboard({ period });
      const currentScope = `${ctx.user?.id || ''}:${ctx.contest?.id || ''}`;
      if (version !== requestVersion || currentScope !== initialScope
        || (ctx.screen && !['performance', 'grimorio'].includes(ctx.screen))) return;
      root.innerHTML = renderPerformancePage(data, ctx.contest);
      bind(root, navigate, data, renderPeriod);
    } catch (error) {
      if (version !== requestVersion) return;
      if (!root.querySelector('.performance-dashboard')) throw error;
      root.querySelector('.performance-inline-error')?.remove();
      root.insertAdjacentHTML('afterbegin', '<p class="performance-inline-error" role="alert">Não foi possível atualizar este período. Os dados anteriores foram preservados.</p>');
      console.error('[performance] dashboard unavailable', error);
    } finally {
      if (version === requestVersion) {
        root.setAttribute('aria-busy', 'false');
        const currentLoading = root.querySelector('#performance-update-status');
        if (currentLoading) currentLoading.hidden = true;
      }
    }
  };
  await renderPeriod('30d');
}
