import { escapeHtml } from './helpers.js';
import { icon } from './icons.js?v=67';

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function metricCard({ iconName, label, value, detail = '', tone = '', extra = '' }) {
  return `
    <article class="orion-metric ${tone ? `orion-metric--${tone}` : ''}">
      <span class="orion-metric__icon" aria-hidden="true">${icon(iconName, 'ico--sm')}</span>
      <div class="orion-metric__copy">
        <small>${escapeHtml(label)}</small>
        <strong>${value}</strong>
        ${detail ? `<span>${detail}</span>` : ''}
      </div>
      ${extra}
    </article>`;
}

export function renderOrionEvolution(model = {}, { direct = false } = {}) {
  const rawGoalProgress = Number(model.dailyGoalProgress);
  const displayedProgress = Number.isFinite(rawGoalProgress)
    ? Math.max(0, Math.min(100, rawGoalProgress))
    : 0;
  const accuracy = model.accuracyWeek == null
    ? '<span class="orion-metric__empty">Sem dados suficientes</span>'
    : `${Math.round(model.accuracyWeek)}%`;
  const estimate = model.estimatedDays == null
    ? '<span class="orion-metric__empty">Sem histórico comparável</span>'
    : model.estimatedDays === 0
      ? 'Concluído'
      : `${model.estimatedDays} dias`;
  const examDeadline = model.examDays == null
    ? '<span class="orion-metric__empty">Defina a data da prova</span>'
    : model.examState === 'past'
      ? '<span class="orion-metric__empty">Data já passou</span>'
      : model.examDays <= 0
      ? '<span class="orion-metric__empty">Prova hoje</span>'
      : `${model.examDays} dias`;
  const best = model.bestDiscipline
    ? escapeHtml(model.bestDiscipline.name)
    : '<span class="orion-metric__empty">Sem avanço recente</span>';
  const bestDetail = model.bestDiscipline
    ? `${Math.round(Number(model.bestDiscipline.accuracy) || 0)}% · ${Number(model.bestDiscipline.answered) || 0} respostas`
    : '';
  const goalDetail = model.dailyGoalMinutes
    ? `Meta: ${formatDuration(model.dailyGoalMinutes)}`
    : 'Defina sua meta diária';

  const cards = [
    metricCard({
      iconName: 'focus',
      label: 'Tempo estudado hoje',
      value: escapeHtml(formatDuration(model.todayMinutes)),
      detail: escapeHtml(goalDetail),
      tone: 'time',
      extra: model.dailyGoalMinutes
        ? `<div class="orion-metric__progress" role="progressbar" aria-label="Progresso da meta diária" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${displayedProgress}"><span style="width:${displayedProgress}%"></span></div>`
        : '',
    }),
    metricCard({
      iconName: 'question',
      label: 'Questões na semana',
      value: `${model.questionsWeek || 0}`,
      detail: 'últimos 7 dias',
    }),
    metricCard({
      iconName: 'chart',
      label: 'Taxa de acerto',
      value: accuracy,
      detail: model.accuracyWeek == null ? '' : 'na semana',
      tone: model.accuracyWeek != null && model.accuracyWeek < 55 ? 'attention' : '',
    }),
    metricCard({
      iconName: 'check',
      label: 'Resultado semanal',
      value: `<span class="orion-metric__split"><b>${model.correctWeek || 0} certas</b><b>${model.wrongWeek || 0} erradas</b></span>`,
      tone: 'answers',
    }),
    metricCard({
      iconName: 'calendar',
      label: 'Projeção de conclusão',
      value: estimate,
      detail: model.estimatedDays != null && model.estimatedDays > 0 ? `${Math.round(model.remainingPercent || 0)}% restante` : '',
    }),
    metricCard({
      iconName: 'chartSteps',
      label: 'Prazo até a prova',
      value: examDeadline,
      detail: model.examDateSource && model.examDateSource !== 'none' ? 'data registrada' : '',
      tone: 'pace',
    }),
    metricCard({
      iconName: 'bolt',
      label: 'Maior taxa recente',
      value: best,
      detail: escapeHtml(bestDetail),
      tone: 'best',
    }),
  ].join('');

  return `
    <section class="orion-evolution"
      data-home-mentor-communication="${direct ? 'direct' : 'neutral'}"
      aria-labelledby="orion-evolution-title">
      <div class="orion-evolution__hud" aria-hidden="true"></div>
      <div class="orion-evolution__content">
        <header class="orion-evolution__head">
          <span class="orion-evolution__eyebrow">Análise estratégica</span>
          <h2 id="orion-evolution-title">EVOLUÇÃO DO DIA</h2>
          <p>Seu desempenho de hoje, analisado por Orion.</p>
        </header>
        <div class="orion-evolution__metrics">${cards}</div>
        <p class="orion-evolution__message">
          <span aria-hidden="true">${icon('bolt', 'ico--sm')}</span>
          <strong>${direct ? 'ORION:' : 'LEITURA DOS DADOS'}</strong>
          ${direct
            ? escapeHtml(model.recommendation || 'Comece hoje para gerar sua análise.')
            : 'Indicadores calculados a partir das atividades acadêmicas registradas.'}
        </p>
        <div class="orion-evolution__actions">
          <button type="button" class="orion-evolution__performance" id="orion-open-performance" aria-label="Ver meu desempenho e estatísticas completas">
            <span class="orion-evolution__performance-icon" aria-hidden="true">${icon('chartSteps', 'ico--sm')}</span>
            <span class="orion-evolution__performance-copy"><strong>Ver meu desempenho</strong><small>Estatísticas, evolução e tempo de estudo</small></span>
            <span class="orion-evolution__performance-arrow" aria-hidden="true">${icon('chevronRight', 'ico--sm')}</span>
          </button>
        </div>
      </div>
      <div class="orion-evolution__art" aria-hidden="true">
        <span class="orion-evolution__scan"></span>
        <img src="./assets/mentor/orion-evolution.png" alt="" loading="lazy" decoding="async">
        <span class="orion-evolution__name">ORION <small>ESTRATEGISTA DE EVOLUÇÃO</small></span>
      </div>
    </section>`;
}
