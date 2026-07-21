import { $, escapeAttr, escapeHtml } from './helpers.js';
import { buildQuestionExplanation } from '../services/questionExplanationService.js';
import { answerReviewQuestion, createReviewSession, describeReviewItem, finalizeReviewSession, getReviewPlanData } from '../services/reviewService.js';
import { feedbackMessage, progressBar } from './components.js';
import { icon } from './icons.js?v=66';

export async function renderReview(root, navigate, ctx) {
  let session = ctx.reviewSession;
  if (!session) {
    const plan = await getReviewPlanData(ctx.reviewFilters || {});
    if (!plan.total) {
      root.innerHTML = `<main class="review-empty"><span>${icon('shieldCheck')}</span><small>Sistema de suporte à aprovação</small><h1>Memória em dia.</h1><p>Nenhuma revisão precisa da sua atenção agora. O sistema continuará observando seus resultados e organizará a fila automaticamente.</p>
        <div class="review-empty__status"><strong>0 itens</strong><span>Nenhuma prioridade ativa</span></div>
        <section class="review-empty__signals" aria-label="Tipos de revisão monitorados">
          <article class="review-type-card review-type-card--error"><div><span>Erro recente</span><strong>0</strong></div><p>Respostas incorretas entram na fila para correção.</p></article>
          <article class="review-type-card review-type-card--confidence"><div><span>Baixa confiança</span><strong>0</strong></div><p>Dúvidas sinalizadas recebem reforço direcionado.</p></article>
          <article class="review-type-card review-type-card--recurring"><div><span>Recorrência</span><strong>0</strong></div><p>Erros repetidos ganham prioridade maior.</p></article>
          <article class="review-type-card review-type-card--scheduled"><div><span>Agendada</span><strong>0</strong></div><p>O ciclo de memória define o momento de voltar.</p></article>
        </section>
        <button type="button" class="btn btn-primary" id="review-home">Voltar para Hoje</button></main>`;
      $('#review-home', root).onclick = () => navigate('home');
      return;
    }
    renderReviewPlan(root, plan);
    $('#review-start', root)?.addEventListener('click', async () => {
      const button = $('#review-start', root);
      button.disabled = true;
      button.textContent = 'Preparando revisão…';
      session = await createReviewSession(ctx.reviewFilters || {});
      ctx.reviewSession = session;
      await renderReview(root, navigate, ctx);
    });
    $('#review-back', root)?.addEventListener('click', () => navigate('home'));
    return;
  }
  if (!session.questions.length) {
    root.innerHTML = `<div class="ro-window"><div class="ro-title">Revisão inteligente</div><div class="ro-body text-center">
      <p>Nenhuma revisão disponível agora.</p><p class="muted">Quando houver um erro, baixa confiança ou queda de desempenho, a fila será atualizada automaticamente.</p>
      <button type="button" class="btn btn-primary mt-12" id="review-home">Voltar para Hoje</button></div></div>`;
    $('#review-home', root).onclick = () => navigate('home');
    return;
  }

  let locked = false;
  const renderQuestion = () => {
    const question = session.questions[session.index];
    const item = session.items[session.index];
    const presentation = describeReviewItem(item);
    root.innerHTML = `<div class="ro-window review-window">
      <div class="review-session__top">
        <div><span>Revisão estratégica</span><strong>${session.index + 1}/${session.questions.length}</strong></div>
        <div class="review-session__badges"><span class="review-type review-type--${presentation.tone}">${presentation.label}</span><span class="review-priority review-priority--${presentation.priority.tone}">${presentation.priority.label}</span></div>
      </div>
      <div class="ro-body">
        <div class="review-why"><strong>Por que revisar?</strong><p>${escapeHtml(presentation.reason)}</p></div>
        <div class="review-state review-state--${item.memoryState}">Memória ${escapeHtml(item.memoryState)}</div>
        <p class="q-text">${escapeHtml(question.statement)}</p>
        ${progressBar({ value: Math.round(((session.index + 1) / session.questions.length) * 100), label: 'Progresso da revisão', tone: 'data', detail: `${session.index + 1} de ${session.questions.length}` })}
        <div class="answer-grid" id="review-answers">${renderAnswers(question)}</div>
        <div id="review-feedback" class="hidden" aria-live="polite"></div>
        <button type="button" class="btn btn-primary btn-block mt-12 hidden" id="review-next">Próxima →</button>
      </div></div>`;
    $('#review-answers', root).querySelectorAll('.answer-btn').forEach((button) => button.addEventListener('click', () => onAnswer(button)));
  };

  const onAnswer = async (button) => {
    if (locked) return;
    locked = true;
    let answer = button.dataset.a;
    if (answer === 'true') answer = true;
    if (answer === 'false') answer = false;
    const result = await answerReviewQuestion(session, answer);
    root.querySelectorAll('.answer-btn').forEach((item) => { item.disabled = true; });
    button.classList.add(result.correct ? 'correct' : 'wrong');
    const explanation = buildQuestionExplanation(result.question);
    const feedback = $('#review-feedback', root);
    feedback.classList.remove('hidden');
    feedback.innerHTML = feedbackMessage({ correct: result.correct, explanation: explanation.explanation })
      + `<p class="review-transition">Estado atual: <strong>${escapeHtml(result.memoryState)}</strong></p>`;
    const next = $('#review-next', root);
    next.classList.remove('hidden');
    next.textContent = result.isLast ? 'Ver resultado' : 'Próxima →';
    next.onclick = async () => {
      if (result.isLast) await renderResult();
      else { locked = false; renderQuestion(); }
    };
  };

  const renderResult = async () => {
    const summary = await finalizeReviewSession(session);
    ctx.reviewSession = null;
    root.innerHTML = `<div class="ro-window result-card"><div class="ro-title">Resultado da revisão</div><div class="ro-body">
      <div class="review-result-grid">
        <div><small>Questões revisadas</small><strong>${summary.reviewed}</strong></div>
        <div><small>Acertos</small><strong>${summary.correct}</strong></div>
        <div><small>Erros</small><strong>${summary.errors}</strong></div>
        <div><small>Memória fortalecida</small><strong>${summary.strengthened}</strong></div>
      </div>
      <ul class="muted result-list">
        <li>Continuam quentes: <strong>${summary.hot}</strong></li>
        <li>Passaram para morna: <strong>${summary.transitions.morna}</strong></li>
        <li>Passaram para fria: <strong>${summary.transitions.fria}</strong></li>
        <li>Passaram para congelada: <strong>${summary.transitions.congelada}</strong></li>
        <li>Próxima revisão sugerida: <strong>${formatDate(summary.nextReviewAt)}</strong></li>
      </ul>
      <button type="button" class="btn btn-primary btn-block mt-12" id="review-finish">Voltar para Hoje</button>
    </div></div>`;
    $('#review-finish', root).onclick = () => navigate('home');
  };

  renderQuestion();
}

function renderReviewPlan(root, plan) {
  const recommendation = plan.urgent
    ? `${plan.urgent} ${plan.urgent === 1 ? 'item recorrente exige' : 'itens recorrentes exigem'} atenÃ§Ã£o agora.`
    : plan.due
      ? `${plan.due} ${plan.due === 1 ? 'revisÃ£o estÃ¡ vencida' : 'revisÃµes estÃ£o vencidas'} e pronta para reforÃ§o.`
      : 'Seu prÃ³ximo ciclo de memÃ³ria jÃ¡ estÃ¡ organizado por prioridade.';
  const types = [
    ['error', 'Erro recente', plan.counts.error, 'Corrigir uma resposta incorreta antes que o erro se consolide.'],
    ['confidence', 'Baixa confianÃ§a', plan.counts.low_confidence, 'Transformar dÃºvida em seguranÃ§a para a prÃ³xima prova.'],
    ['recurring', 'RecorrÃªncia', plan.counts.recurring, 'Atacar padrÃµes de erro que voltaram a aparecer.'],
    ['scheduled', 'Agendada', plan.counts.scheduled, 'Manter o conteÃºdo acessÃ­vel com repetiÃ§Ã£o espaÃ§ada.'],
  ];
  root.innerHTML = `<main class="review-plan">
    <header class="review-plan__header">
      <div><span class="ds-kicker">Sistema de suporte Ã  aprovaÃ§Ã£o</span><h1>RevisÃ£o estratÃ©gica</h1><p>O sistema reuniu o que mais precisa da sua atenÃ§Ã£o e ordenou pelo impacto na sua memÃ³ria.</p></div>
      <button type="button" class="review-plan__back" id="review-back" aria-label="Voltar ao inÃ­cio"><span aria-hidden="true">â†</span><span>Voltar</span></button>
    </header>

    <section class="review-plan__hero" aria-labelledby="review-recommendation-title">
      <div class="review-plan__hero-copy">
        <span>PrÃ³ximo bloco recomendado</span>
        <h2 id="review-recommendation-title">FortaleÃ§a ${plan.total} ${plan.total === 1 ? 'ponto' : 'pontos'} da sua preparaÃ§Ã£o</h2>
        <p>${escapeHtml(recommendation)} A sessÃ£o respeita a prioridade da fila e tem no mÃ¡ximo 10 questÃµes.</p>
        <div class="review-plan__actions"><button type="button" class="btn btn-primary" id="review-start">${icon('bolt')} Iniciar revisÃ£o</button><span>${plan.total} ${plan.total === 1 ? 'item' : 'itens'} neste bloco</span></div>
      </div>
      <dl class="review-plan__summary">
        <div><dt>Quantidade</dt><dd>${plan.total}</dd><small>itens priorizados</small></div>
        <div><dt>Para hoje</dt><dd>${plan.due}</dd><small>jÃ¡ disponÃ­veis</small></div>
        <div class="${plan.urgent ? 'is-urgent' : ''}"><dt>Urgentes</dt><dd>${plan.urgent}</dd><small>recorrentes vencidos</small></div>
        <div><dt>PrÃ³ximo ciclo</dt><dd class="is-date">${escapeHtml(formatDate(plan.nextReviewAt))}</dd><small>memÃ³ria espaÃ§ada</small></div>
      </dl>
    </section>

    <section class="review-plan__types" aria-labelledby="review-types-title">
      <div class="review-plan__section-title"><div><span>Por que revisar</span><h2 id="review-types-title">Motivos da fila</h2></div><p>Cada cor representa uma causa, nÃ£o um novo caminho de navegaÃ§Ã£o.</p></div>
      <div class="review-type-grid">${types.map(([tone, label, count, description]) => `<article class="review-type-card review-type-card--${tone}"><div><span>${label}</span><strong>${count}</strong></div><p>${description}</p></article>`).join('')}</div>
    </section>

    <section class="review-plan__queue" aria-labelledby="review-queue-title">
      <div class="review-plan__section-title"><div><span>O que revisar</span><h2 id="review-queue-title">Fila recomendada</h2></div><p>Ordem calculada por prazo, recorrÃªncia, dificuldade e domÃ­nio.</p></div>
      <ol class="review-plan__list">${plan.items.map((item) => `<li class="review-plan__item review-plan__item--${item.priority.tone}">
        <span class="review-plan__order">${String(item.order).padStart(2, '0')}</span>
        <div class="review-plan__item-copy"><div class="review-plan__badges"><span class="review-type review-type--${item.tone}">${escapeHtml(item.label)}</span><span class="review-priority review-priority--${item.priority.tone}">${escapeHtml(item.priority.label)}</span></div><strong>${escapeHtml(item.subtopicName)}</strong><p>${escapeHtml(item.reason)}</p></div>
        <dl class="review-plan__item-meta"><div><dt>DomÃ­nio</dt><dd>${item.mastery}%</dd></div><div><dt>Erros</dt><dd>${Number(item.errorCount) || 0}</dd></div><div><dt>RevisÃ£o</dt><dd>${escapeHtml(formatDate(item.nextReviewAt))}</dd></div></dl>
      </li>`).join('')}</ol>
    </section>
  </main>`;
}

function renderAnswers(question) {
  if (question.format === 'certo_errado') return `
    <button type="button" class="answer-btn certo" data-a="true"><span class="ans-letter">C</span> Certo</button>
    <button type="button" class="answer-btn errado" data-a="false"><span class="ans-letter">E</span> Errado</button>`;
  return (question.options || []).map((option) => {
    const letter = String(option).charAt(0);
    return `<button type="button" class="answer-btn" data-a="${escapeAttr(letter)}"><span class="ans-letter">${escapeHtml(letter)}</span> ${escapeHtml(String(option).replace(/^[A-E]\)\s*/, ''))}</button>`;
  }).join('');
}

function formatDate(value) {
  if (!value) return 'a definir';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
