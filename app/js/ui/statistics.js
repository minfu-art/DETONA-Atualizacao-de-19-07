import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { enemyImgHtml } from './enemyAssets.js';
import { escapeHtml } from './helpers.js';
import { mountPageContainer, sectionHeader, statsPanel } from './appShell.js';
import { emptyState, progressBar, statusBadge } from './components.js';

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export function historyTotals(subtopics) {
  let answered = 0;
  let correct = 0;
  let errors = 0;
  for (const subtopic of subtopics) {
    const entries = Object.values(subtopic.question_history || {});
    if (entries.length) {
      for (const entry of entries) {
        answered += Number(entry.attempts) || 0;
        correct += Number(entry.correctCount) || 0;
        errors += Number(entry.incorrectCount) || 0;
      }
      continue;
    }
    answered += new Set(subtopic.answered_question_ids || []).size;
    correct += new Set(subtopic.correct_question_ids || []).size;
    errors += new Set(subtopic.incorrect_question_ids || []).size;
  }
  return { answered, correct, errors };
}

function recentAttempts(subtopics) {
  return subtopics
    .flatMap((subtopic) => (subtopic.attempt_history || []).map((attempt) => ({
      at: attempt.attemptedAt,
      value: clamp(attempt.percentage),
      name: subtopic.name,
    })))
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8);
}

function disciplineRows(disciplines) {
  return [...disciplines]
    .sort((a, b) => (Number(b.mastery_pct) || 0) - (Number(a.mastery_pct) || 0))
    .map((discipline, index) => {
      const value = clamp(discipline.mastery_pct);
      const tone = value >= 70 ? 'success' : value >= 40 ? 'data' : 'plasma';
      return `<li><span class="statistics-discipline__rank">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(discipline.name)}</strong>${progressBar({ value, label: `Domínio em ${discipline.name}`, tone, detail: `${value.toFixed(0)}%` })}</div></li>`;
    }).join('');
}

export async function renderStatistics(root, navigate) {
  const [players, disciplines, subtopics, verticalized, reviewQueue] = await Promise.all([
    progressRepository.getAll(STORES.player),
    progressRepository.getAll(STORES.disciplines),
    progressRepository.getAll(STORES.subtopics),
    progressRepository.getAll(STORES.verticalized),
    progressRepository.getAll(STORES.reviewQueue),
  ]);
  const player = players[0];
  const totals = historyTotals(subtopics);
  const accuracy = totals.answered ? Math.round((totals.correct / totals.answered) * 100) : 0;
  const edital = clamp(player?.edital_completion_pct);
  const reviews = verticalized.reduce((sum, item) => sum + (Number(item.review_count) || 0), 0);
  const pendingReviews = reviewQueue.filter((item) => item.status !== 'frozen').length;
  const recent = recentAttempts(subtopics);
  const strongest = [...disciplines].sort((a, b) => (Number(b.mastery_pct) || 0) - (Number(a.mastery_pct) || 0))[0];
  const weakest = [...disciplines].sort((a, b) => (Number(a.mastery_pct) || 0) - (Number(b.mastery_pct) || 0))[0];

  root.innerHTML = `
    <section class="statistics-hero">
      <div class="statistics-hero__copy">
        <span>${statusBadge('Dados da jornada', 'info')}</span>
        <strong>${edital.toFixed(1)}%</strong>
        <p>do edital dominado</p>
        ${progressBar({ value: edital, label: 'Progresso geral do edital', tone: 'plasma', detail: `${edital.toFixed(1)}%` })}
      </div>
      <div class="statistics-enemy">
        ${enemyImgHtml('enemy-16', { className: 'statistics-enemy__image', size: 'lg' })}
        <div><small>Conteúdo do edital</small><strong>${(100 - edital).toFixed(1)}% restante</strong></div>
      </div>
    </section>

    <section class="statistics-grid" aria-label="Indicadores de desempenho">
      <article><small>Taxa de acerto</small><strong>${accuracy}%</strong><span>${totals.correct} acertos registrados</span></article>
      <article><small>Respostas</small><strong>${totals.answered}</strong><span>${totals.errors} erros registrados</span></article>
      <article><small>Revisões</small><strong>${reviews}</strong><span>${pendingReviews} na fila inteligente</span></article>
      <article><small>Sequência</small><strong>${player?.streak_days || 0}d</strong><span>constância atual</span></article>
    </section>

    <div class="statistics-layout">
      <section class="ds-game-panel ds-game-panel--data statistics-disciplines" aria-labelledby="statistics-disciplines-title">
        <header id="statistics-disciplines-title">Desempenho por disciplina</header>
        <div class="ds-game-panel__body">
          ${disciplines.length ? `<ol>${disciplineRows(disciplines)}</ol>` : emptyState({ title: 'Sem disciplinas avaliadas', description: 'Os dados aparecerão após suas primeiras atividades.' })}
        </div>
      </section>

      <section class="ds-game-panel ds-game-panel--energy statistics-insights" aria-labelledby="statistics-insights-title">
        <header id="statistics-insights-title">Leitura estratégica</header>
        <div class="ds-game-panel__body">
          <div class="statistics-insight"><small>Ponto forte atual</small><strong>${escapeHtml(strongest?.name || 'Aguardando dados')}</strong><span>${clamp(strongest?.mastery_pct).toFixed(0)}% de domínio</span></div>
          <div class="statistics-insight"><small>Próximo foco sugerido</small><strong>${escapeHtml(weakest?.name || 'Aguardando dados')}</strong><span>${clamp(weakest?.mastery_pct).toFixed(0)}% de domínio</span></div>
          <button type="button" class="btn btn-primary btn-block" id="statistics-edital">Abrir edital</button>
        </div>
      </section>
    </div>

    <section class="ds-game-panel statistics-recent" aria-labelledby="statistics-recent-title">
      <header id="statistics-recent-title">Evolução recente</header>
      <div class="ds-game-panel__body">
        ${recent.length ? `<ol>${recent.map((item) => `<li><div><strong>${escapeHtml(item.name)}</strong><small>${new Date(item.at).toLocaleDateString('pt-BR')}</small></div><span style="--attempt:${item.value}%"><i></i><b>${item.value.toFixed(0)}%</b></span></li>`).join('')}</ol>` : emptyState({ title: 'Sua evolução começa na primeira batalha', description: 'Os resultados recentes serão exibidos aqui sem inventar dados.' })}
      </div>
    </section>`;

  mountPageContainer(root, {
    variant: 'statistics',
    header: sectionHeader({
      eyebrow: 'Inteligência de estudo',
      title: 'Desempenho',
      subtitle: 'Entenda seus pontos fortes, identifique lacunas e reduza o conteúdo pendente.',
    }),
    stats: statsPanel([
      { label: 'Nível', value: player?.level || 0 },
      { label: 'Questões', value: totals.answered },
      { label: 'Aproveitamento', value: `${accuracy}%` },
    ]),
  });

  root.querySelector('#statistics-edital')?.addEventListener('click', () => navigate('edital'));
}
