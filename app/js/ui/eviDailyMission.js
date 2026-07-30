import { escapeHtml } from './helpers.js';
import { icon } from './icons.js?v=67';

export function renderEviDailyMission(model, { direct = false } = {}) {
  const progress = Math.max(0, Math.min(100, Number(model?.overallProgress) || 0));
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (progress / 100) * circumference;
  const star = model?.dailyStar || { status: 'locked', label: 'Estrela bloqueada' };
  const nextMission = model?.nextMission || {};

  return `
    <section class="evi-card evi-card--${escapeHtml(model?.state || 'no_plan')}"
      data-home-mentor-communication="${direct ? 'direct' : 'neutral'}"
      aria-labelledby="evi-card-title">
      <div class="evi-card__glow" aria-hidden="true"></div>
      <div class="evi-card__content">
        <div class="evi-card__head">
          <span class="evi-card__identity"><strong>EVI</strong> · GUIA DE MISSÕES</span>
          <span class="evi-card__star evi-card__star--${escapeHtml(star.status)}"
            aria-label="${escapeHtml(star.label)}">${icon('star', 'ico--sm')} <span>${escapeHtml(star.label)}</span></span>
        </div>
        <div class="evi-card__dashboard">
          <div class="evi-progress"
            role="progressbar"
            aria-label="Progresso do plano acadêmico de hoje"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${progress}">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="evi-progress__bg" cx="50" cy="50" r="42"></circle>
              <circle class="evi-progress__fg" cx="50" cy="50" r="42"
                stroke-dasharray="${circumference.toFixed(2)}"
                stroke-dashoffset="${offset.toFixed(2)}"></circle>
            </svg>
            <span><strong>${progress}%</strong><small>do plano</small></span>
          </div>
          <div class="evi-card__stats">
            <span><small>Questões</small><strong>${Number(model?.questionsCompleted) || 0} / ${Number(model?.questionGoal) || 0}</strong></span>
            ${Number(model?.reviewsPlanned) > 0
              ? `<span><small>Revisões</small><strong>${Number(model?.reviewsCompleted) || 0} / ${Number(model?.reviewsPlanned) || 0}</strong></span>`
              : '<span class="evi-card__no-reviews"><small>Revisões</small><strong>Nenhuma prevista hoje</strong></span>'}
          </div>
        </div>
        <div class="evi-card__guidance" aria-live="polite">
          <span>PRÓXIMA MISSÃO</span>
          <strong>${escapeHtml(nextMission.title || 'Planejar uma missão possível')}</strong>
          <p>${direct
            ? escapeHtml(model?.message || 'Você não precisa fazer tudo. Apenas a próxima missão certa.')
            : 'Dados do plano acadêmico e da próxima missão prevista.'}</p>
        </div>
        <button type="button" class="evi-card__action" id="evi-daily-action"
          aria-label="${escapeHtml(model?.actionLabel || 'Planejar o dia')} com Evi">
          ${escapeHtml(model?.actionLabel || 'Planejar o dia')} ${icon('chevronRight', 'ico--sm')}
        </button>
        ${direct ? '<blockquote>“Você não precisa fazer tudo. Apenas a próxima missão certa.”</blockquote>' : ''}
      </div>
      <div class="evi-card__art">
        <img src="./assets/mentors/evi.webp" alt="Evi, guia de missões do DETONA" width="1024" height="1024">
        <span class="evi-card__fallback" aria-hidden="true">EVI</span>
      </div>
    </section>`;
}
