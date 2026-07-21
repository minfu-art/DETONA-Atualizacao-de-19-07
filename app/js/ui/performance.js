import { performanceService } from '../services/performanceService.js';
import { ICO } from './icons.js?v=67';
import { escapeHtml } from './helpers.js';
import { emptyState } from './components.js';

const PERIOD_OPTIONS = Object.freeze([
  ['7d', '7 dias'],
  ['30d', '30 dias'],
  ['90d', '90 dias'],
  ['all', 'Todo o histórico'],
]);

const CHART_COLORS = ['#a855f7', '#22d3ee', '#fb923c', '#facc15', '#22c55e', '#f472b6', '#60a5fa'];

function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Data não disponível';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function performanceTone(accuracy) {
  if (accuracy == null) return 'neutral';
  if (accuracy >= 75) return 'strong';
  if (accuracy >= 55) return 'growing';
  if (accuracy >= 35) return 'attention';
  return 'priority';
}

function periodFilter(selected, id) {
  return `<label class="performance-period">
    <span>Período</span>
    <select id="${id}" aria-label="Filtrar desempenho por período">
      ${PERIOD_OPTIONS.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('')}
    </select>
  </label>`;
}

function compactHeader(contest, period) {
  const contestName = contest?.name || contest?.code || 'Concurso ativo';
  const role = contest?.role || contest?.cargo || '';
  return `<header class="performance-mobile-header">
    <button type="button" class="performance-icon-button" id="performance-back" aria-label="Voltar para Hoje">${ICO.home?.() || ''}</button>
    <div>
      <span>Evolução</span>
      <strong>${escapeHtml(contestName)}</strong>
      ${role ? `<small>${escapeHtml(role)}</small>` : ''}
    </div>
    ${periodFilter(period, 'performance-period-mobile')}
    <button type="button" class="performance-avatar" id="performance-profile" aria-label="Abrir meu perfil">${ICO.user?.() || 'P'}</button>
  </header>`;
}

const EVOLUTION_HERO = 'assets/ui/hero-evolution-dynamic.png?v=1';

/** Caixa unificada: domínio do edital no topo + progresso geral + conteúdo restante + herói à esquerda */
function masteryHeroCard(data) {
  const edital = Number(data.progress.edital) || 0;
  const remaining = Number(data.progress.remaining) || Math.max(0, 100 - edital);
  const topicsDetail = data.progress.totalTopics
    ? `${data.progress.completedTopics} concluídos · ${data.progress.remainingTopics} restantes`
    : 'Tópicos do edital';
  const defeated = remaining <= 0;
  return `<section class="ev-mastery-card${defeated ? ' is-defeated' : ''}" aria-labelledby="performance-progress-title">
    <div class="ev-mastery-card__bar-top" aria-label="Domínio do edital">
      <div class="ev-mastery-card__bar-meta">
        <span>Domínio do edital</span>
        <strong>${edital.toFixed(1)}%</strong>
      </div>
      <div class="ev-mastery-card__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(edital)}" aria-label="Domínio do edital">
        <span style="width:${Math.min(100, edital)}%"></span>
      </div>
    </div>
    <div class="ev-mastery-card__body">
      <div class="ev-mastery-card__hero" aria-hidden="true">
        <img src="${EVOLUTION_HERO}" alt="" class="ev-mastery-card__hero-img" width="420" height="560" decoding="async" />
      </div>
      <div class="ev-mastery-card__stats">
        <div class="ev-mastery-stat ev-mastery-stat--progress">
          <small>Progresso geral</small>
          <h2 id="performance-progress-title">Edital dominado</h2>
          <strong>${edital.toFixed(0)}%</strong>
          <p>${escapeHtml(topicsDetail)}</p>
        </div>
        <div class="ev-mastery-stat ev-mastery-stat--rest">
          <small>Conteúdo restante</small>
          <h2 id="performance-monster-title">${defeated ? 'Edital dominado' : 'Ainda pela frente'}</h2>
          <strong>${remaining.toFixed(0)}%</strong>
          <div class="ev-mastery-stat__hp" role="progressbar" aria-label="Conteúdo restante" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(remaining)}">
            <span style="width:${Math.min(100, remaining)}%"></span>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function overviewCards(data) {
  const accuracy = data.overview.accuracy == null ? '—' : `${data.overview.accuracy}%`;
  const accuracyDetail = data.hasQuestionData ? `${data.overview.correct} acertos` : 'Ainda não há respostas no período';
  return `<section class="performance-overview" aria-labelledby="performance-overview-title">
    <div class="performance-section-heading"><div><span>Visão geral</span><h2 id="performance-overview-title">Indicadores do período</h2></div></div>
    <div class="performance-metric-grid">
      <article><span>Taxa de acertos</span><strong>${accuracy}</strong><small>${escapeHtml(accuracyDetail)}</small></article>
      <article><span>Questões</span><strong>${data.overview.answered}</strong><small>${data.overview.errors} erros registrados</small></article>
      <article><span>Tempo total</span><strong>${formatMinutes(data.time.totalMinutes)}</strong><small>Estudo registrado</small></article>
      <article><span>Revisões</span><strong>${data.reviews.completed}</strong><small>Total acumulado · ${data.reviews.pending} na fila</small></article>
    </div>
  </section>`;
}

export function sortDisciplines(rows, mode = 'edital') {
  const result = [...rows];
  if (mode === 'lowest') return result.sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  if (mode === 'highest') return result.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
  return result.sort((a, b) => a.order - b.order);
}

function disciplineRows(rows, mode = 'edital') {
  const ordered = sortDisciplines(rows, mode);
  return ordered.map((discipline) => {
    const tone = performanceTone(discipline.accuracy);
    const value = discipline.accuracy ?? 0;
    const percent = discipline.accuracy == null ? '—' : `${discipline.accuracy}%`;
    return `<li class="performance-discipline performance-discipline--${tone} ev-disc-box">
      <div class="performance-discipline__title">
        <strong>${escapeHtml(discipline.name)}</strong>
        <span>${escapeHtml(percent)}</span>
      </div>
      <div class="performance-discipline__bar" role="progressbar" aria-label="Taxa de acertos em ${escapeHtml(discipline.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="--discipline-value:${value}%"></span></div>
      <div class="performance-discipline__details">
        <span>${discipline.answered} resp.</span>
        <span>${discipline.errors} erros</span>
        <strong>${escapeHtml(discipline.classification)}</strong>
      </div>
    </li>`;
  }).join('');
}

function disciplinesCard(data) {
  return `<section class="performance-panel performance-disciplines" aria-labelledby="performance-disciplines-title">
    <div class="performance-section-heading">
      <div><span>Desempenho por disciplina</span><h2 id="performance-disciplines-title">Caixas de domínio</h2></div>
      <label class="performance-sort"><span>Ordenar</span><select id="performance-discipline-sort"><option value="edital">Ordem do edital</option><option value="lowest">Menor desempenho</option><option value="highest">Maior desempenho</option></select></label>
    </div>
    ${data.disciplines.length
      ? `<ol id="performance-discipline-list" class="ev-disc-grid">${disciplineRows(data.disciplines)}</ol>`
      : emptyState({ title: 'Sem disciplinas avaliadas', description: 'As disciplinas aparecerão quando este concurso possuir conteúdo disponível.' })}
  </section>`;
}

function timeChart(data) {
  if (!data.time.totalMinutes) {
    return emptyState({ title: 'Ainda não há tempo registrado', description: 'Conclua uma sessão de foco para visualizar o tempo real de estudo.' });
  }
  if (!data.time.hasDistribution) {
    return `<div class="performance-time-empty" role="status"><strong>${formatMinutes(data.time.totalMinutes)}</strong><p>Tempo total registrado. As sessões atuais não identificam uma disciplina, por isso a distribuição não pode ser calculada sem inventar valores.</p></div>`;
  }
  let cursor = 0;
  const segments = data.time.byDiscipline.map((item, index) => {
    const start = cursor;
    cursor += item.percentage;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${cursor}%`;
  }).join(',');
  return `<div class="performance-time-content">
    <div class="performance-donut" style="--time-chart:conic-gradient(${segments})" role="img" aria-label="Distribuição do tempo por disciplina"><div><strong>${formatMinutes(data.time.totalMinutes)}</strong><span>Total</span></div></div>
    <ul>${data.time.byDiscipline.map((item, index) => `<li><i style="--legend-color:${CHART_COLORS[index % CHART_COLORS.length]}"></i><span>${escapeHtml(item.name)}</span><strong>${item.percentage}%</strong><small>${formatMinutes(item.minutes)}</small></li>`).join('')}</ul>
  </div>`;
}

function timeCard(data) {
  return `<section class="performance-panel performance-time" aria-labelledby="performance-time-title">
    <div class="performance-section-heading"><div><span>Distribuição do tempo</span><h2 id="performance-time-title">Foco por disciplina</h2></div></div>
    ${timeChart(data)}
  </section>`;
}

function evolutionChart(data) {
  if (data.evolution.length < 2) {
    return emptyState({ title: 'Evolução ainda em formação', description: 'Continue estudando para visualizar sua evolução ao longo do tempo.' });
  }
  const width = 100;
  const height = 46;
  const points = data.evolution.map((item, index) => {
    const x = data.evolution.length === 1 ? width / 2 : (index / (data.evolution.length - 1)) * width;
    const y = height - (item.value / 100) * height;
    return { ...item, x, y };
  });
  const path = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const readable = points.map((point) => `${formatDate(point.at)}: ${point.value.toFixed(0)}% em ${point.name}`).join('; ');
  return `<div class="performance-evolution-chart">
    <svg viewBox="0 -6 100 60" role="img" aria-labelledby="performance-evolution-svg-title performance-evolution-svg-desc" preserveAspectRatio="none">
      <title id="performance-evolution-svg-title">Evolução recente da taxa de acertos</title>
      <desc id="performance-evolution-svg-desc">${escapeHtml(readable)}</desc>
      <g class="performance-evolution-grid"><line x1="0" y1="0" x2="100" y2="0"/><line x1="0" y1="23" x2="100" y2="23"/><line x1="0" y1="46" x2="100" y2="46"/></g>
      <polyline points="${path}" vector-effect="non-scaling-stroke"/>
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="1.8" vector-effect="non-scaling-stroke"><title>${escapeHtml(`${formatDate(point.at)} · ${point.value.toFixed(0)}%`)}</title></circle>`).join('')}
    </svg>
    <div class="performance-evolution-axis"><span>${formatDate(points[0].at)}</span><span>Taxa de acertos</span><span>${formatDate(points.at(-1).at)}</span></div>
    <p class="sr-only">${escapeHtml(readable)}</p>
  </div>`;
}

function evolutionCard(data) {
  return `<section class="performance-panel performance-evolution" aria-labelledby="performance-evolution-title">
    <div class="performance-section-heading"><div><span>Evolução recente</span><h2 id="performance-evolution-title">Taxa de acertos por tentativa</h2></div></div>
    ${evolutionChart(data)}
  </section>`;
}

function reviewsCard(data) {
  const memories = [
    ['quente', 'Quente'], ['morna', 'Morna'], ['fria', 'Fria'], ['congelada', 'Congelada'],
  ];
  return `<section class="performance-panel performance-reviews" aria-labelledby="performance-reviews-title">
    <div class="performance-section-heading"><div><span>Revisões</span><h2 id="performance-reviews-title">Memória e atenção</h2></div></div>
    <div class="performance-review-metrics"><div><span>Na fila</span><strong>${data.reviews.pending}</strong></div><div><span>Vencidas</span><strong>${data.reviews.due}</strong></div><div><span>Realizadas</span><strong>${data.reviews.completed}</strong></div></div>
    <ul class="performance-memory-list">${memories.map(([key, label]) => `<li class="memory-${key}"><span>${label}</span><strong>${data.reviews.memory[key]}</strong></li>`).join('')}</ul>
    ${data.reviews.pending ? '<button type="button" class="btn btn-primary btn-block" id="performance-review">Iniciar revisão</button>' : '<p class="performance-panel-note">Nenhuma revisão pendente neste concurso.</p>'}
  </section>`;
}

function summaryCard(data) {
  return `<section class="performance-summary" aria-labelledby="performance-summary-title">
    <span aria-hidden="true">${ICO.chart?.() || ''}</span>
    <div><h2 id="performance-summary-title">Resumo da jornada</h2><p>${escapeHtml(data.summary)}</p></div>
  </section>`;
}

function page(data, contest) {
  const contestName = contest?.name || contest?.code || 'Concurso ativo';
  const contestRole = contest?.role || contest?.cargo || '';
  return `${compactHeader(contest, data.period)}
    <header class="performance-desktop-header">
      <div><span>Inteligência de estudo</span><h1>Evolução</h1><p>${escapeHtml(contestName)}${contestRole ? ` · ${escapeHtml(contestRole)}` : ''}</p></div>
      <div>${periodFilter(data.period, 'performance-period-desktop')}<button type="button" class="performance-avatar" id="performance-profile-desktop" aria-label="Abrir meu perfil">${ICO.user?.() || 'P'}<span>Meu perfil</span></button></div>
    </header>
    <main class="performance-dashboard">
      <div class="performance-top-grid performance-top-grid--mastery">${masteryHeroCard(data)}${overviewCards(data)}</div>
      <div class="performance-middle-grid">${disciplinesCard(data)}${reviewsCard(data)}</div>
      <div class="performance-bottom-grid">${timeCard(data)}${evolutionCard(data)}</div>
      ${summaryCard(data)}
    </main>`;
}

function bind(root, navigate, ctx, data, rerender) {
  root.querySelectorAll('.performance-period select').forEach((select) => select.addEventListener('change', () => rerender(select.value)));
  root.querySelector('#performance-back')?.addEventListener('click', () => navigate('home'));
  root.querySelector('#performance-profile')?.addEventListener('click', () => navigate('profile'));
  root.querySelector('#performance-profile-desktop')?.addEventListener('click', () => navigate('profile'));
  root.querySelector('#performance-review')?.addEventListener('click', () => {
    ctx.reviewSession = null;
    ctx.reviewFilters = {};
    navigate('review');
  });
  root.querySelector('#performance-discipline-sort')?.addEventListener('change', (event) => {
    const list = root.querySelector('#performance-discipline-list');
    if (list) list.innerHTML = disciplineRows(data.disciplines, event.target.value);
  });
}

export async function renderPerformance(root, navigate, ctx = {}) {
  const renderPeriod = async (period = '30d') => {
    root.setAttribute('aria-busy', 'true');
    const data = await performanceService.getDashboard({ period });
    root.innerHTML = page(data, ctx.contest);
    root.setAttribute('aria-busy', 'false');
    bind(root, navigate, ctx, data, renderPeriod);
  };
  await renderPeriod('30d');
}
