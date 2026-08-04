import { $, closeModal, escapeAttr, escapeHtml, openModal } from './helpers.js';
import { buildQuestionExplanation, normalizeQuestionFeedback } from '../services/questionExplanationService.js';
import {
  answerReviewQuestion, createReviewSession, describeReviewItem,
  finalizeReviewSession, getReviewPlanData, validateReviewSession,
} from '../services/reviewService.js';
import { progressBar } from './components.js';
import { icon } from './icons.js?v=66';
import { isQuestionEligible } from '../core/questionSchema.js';

const CONTEXT_ERROR = 'Esta sessão pertence a outro contexto de estudo e foi encerrada com segurança.';

export async function renderReview(root, navigate, ctx) {
  let session = ctx.reviewSession;
  ctx.requestReviewExit = null;
  if (!session) {
    const plan = await getReviewPlanData(ctx.reviewFilters || {});
    if (!plan.total) {
      renderEmpty(root, plan);
      $('#review-home', root).onclick = () => navigate('home');
      return;
    }
    renderReviewPlan(root, plan);
    $('#review-start', root)?.addEventListener('click', async () => {
      const button = $('#review-start', root);
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Preparando revisão…';
      try {
        session = await createReviewSession(ctx.reviewFilters || {});
        if (!session) throw new Error('REVIEW_EMPTY');
        ctx.reviewSession = session;
        await renderReview(root, navigate, ctx);
      } catch (error) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Iniciar revisão';
        showInlineError(root, error.message === 'REVIEW_EMPTY' ? 'Nenhuma revisão disponível agora.' : 'Não foi possível preparar a revisão. Tente novamente.');
      }
    });
    $('#review-back', root)?.addEventListener('click', () => navigate('home'));
    return;
  }

  const validation = validateReviewSession(session, { isQuestionEligible });
  if (!validation.valid || !session.questions.length) {
    ctx.reviewSession = null;
    renderSessionError(root, validation.errors.includes('SESSION_SIZE_INVALID') ? 'Nenhuma revisão disponível agora.' : CONTEXT_ERROR);
    $('#review-home', root).onclick = () => navigate('home');
    return;
  }

  let locked = false;
  let selectedAnswer = null;
  let selectedButton = null;

  const abandon = (target = 'home') => {
    closeModal();
    ctx.reviewSession = null;
    ctx.allowReviewExit = true;
    navigate(target);
  };

  const confirmExit = (target = 'home') => {
    const modal = openModal(
      'Encerrar esta revisão?',
      '<p>As respostas já confirmadas permanecerão registradas. As questões ainda não respondidas serão encerradas e nenhuma recompensa final da sessão será concedida.</p>',
      '<button type="button" class="btn btn-primary" data-review-stay autofocus>Continuar revisando</button><button type="button" class="btn btn-ghost" data-review-leave>Encerrar revisão</button>',
      { variant: 'confirm' },
    );
    modal.querySelector('[data-review-stay]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-review-leave]')?.addEventListener('click', () => abandon(target));
  };
  ctx.requestReviewExit = confirmExit;

  const renderQuestion = () => {
    selectedAnswer = null;
    selectedButton = null;
    const question = session.questions[session.index];
    const item = session.items[session.index];
    const presentation = describeReviewItem(item);
    root.innerHTML = `<main class="ro-window review-window" aria-labelledby="review-question-title">
      <header class="review-session__top">
        <div><span>Revisão estratégica</span><strong>${session.index + 1}/${session.questions.length}</strong></div>
        <div class="review-session__badges"><span class="review-type review-type--${presentation.tone}">${escapeHtml(presentation.label)}</span><span class="review-priority review-priority--${presentation.priority.tone}">${escapeHtml(presentation.priority.label)}</span></div>
      </header>
      <div class="ro-body">
        <button type="button" class="review-session__exit" id="review-exit" aria-label="Encerrar esta revisão">Encerrar revisão</button>
        <div class="review-why"><strong>Por que revisar?</strong><p>${escapeHtml(presentation.reason)}</p></div>
        <div class="review-state review-state--${item.memoryState}">Memória ${escapeHtml(item.memoryState)}</div>
        <h1 class="q-text" id="review-question-title" tabindex="-1">${escapeHtml(question.statement)}</h1>
        ${progressBar({ value: Math.round(((session.index + 1) / session.questions.length) * 100), label: 'Progresso da revisão', tone: 'data', detail: `${session.index + 1} de ${session.questions.length}` })}
        <fieldset class="review-answer-fieldset"><legend>Selecione uma alternativa e confirme</legend><div class="answer-grid" id="review-answers">${renderAnswers(question)}</div></fieldset>
        <div id="review-error" class="review-inline-error hidden" role="alert"></div>
        <button type="button" class="btn btn-primary btn-block mt-12" id="review-confirm" disabled>Confirmar resposta</button>
        <div id="review-feedback" class="hidden" aria-live="polite" tabindex="-1"></div>
        <button type="button" class="btn btn-primary btn-block mt-12 hidden" id="review-next">Próxima questão</button>
      </div></main>`;
    $('#review-exit', root)?.addEventListener('click', () => confirmExit('home'));
    const confirm = $('#review-confirm', root);
    root.querySelectorAll('.answer-btn').forEach((button) => button.addEventListener('click', () => {
      if (locked) return;
      selectedButton?.classList.remove('is-selected');
      selectedButton?.setAttribute('aria-checked', 'false');
      selectedButton = button;
      selectedAnswer = answerValue(button.dataset.a);
      button.classList.add('is-selected');
      button.setAttribute('aria-checked', 'true');
      confirm.disabled = false;
    }));
    confirm.addEventListener('click', () => confirmAnswer(question, confirm));
    requestAnimationFrame(() => $('#review-question-title', root)?.focus());
  };

  const confirmAnswer = async (question, confirm) => {
    if (locked || selectedButton == null) return;
    locked = true;
    confirm.disabled = true;
    confirm.setAttribute('aria-busy', 'true');
    root.querySelector('.review-window')?.setAttribute('aria-busy', 'true');
    try {
      const result = await answerReviewQuestion(session, selectedAnswer);
      root.querySelectorAll('.answer-btn').forEach((item) => { item.disabled = true; });
      selectedButton.classList.add(result.correct ? 'correct' : 'wrong');
      markCorrectAnswer(root, question, result.correctAnswer);
      const feedbackData = normalizeQuestionFeedback(result.question);
      const explanation = buildQuestionExplanation(result.question);
      const feedback = $('#review-feedback', root);
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<section class="review-feedback ${result.correct ? 'is-correct' : 'is-wrong'}">
        <h2>${result.correct ? 'Resposta correta' : 'Vamos fortalecer este ponto'}</h2>
        <dl><div><dt>Sua resposta</dt><dd>${escapeHtml(formatAnswer(question, result.selectedAnswer))}</dd></div><div><dt>Resposta correta</dt><dd>${escapeHtml(formatAnswer(question, result.correctAnswer))}</dd></div></dl>
        <p>${escapeHtml(explanation.explanation)}</p>
        ${feedbackData.trap ? `<p><strong>Pegadinha:</strong> ${escapeHtml(feedbackData.trap)}</p>` : ''}
        ${feedbackData.addedKnowledge ? `<p><strong>Conhecimento adicional:</strong> ${escapeHtml(feedbackData.addedKnowledge)}</p>` : ''}
        ${feedbackData.source ? `<p><strong>Fonte:</strong> ${escapeHtml(feedbackData.source)}</p>` : ''}
        <p class="review-transition">Memória atual: <strong>${escapeHtml(result.memoryState)}</strong>. Próxima revisão: <strong>${escapeHtml(formatDate(result.nextReviewAt))}</strong>.</p>
      </section>`;
      confirm.classList.add('hidden');
      const next = $('#review-next', root);
      next.classList.remove('hidden');
      next.textContent = result.isLast ? 'Ver resultado' : 'Próxima questão';
      next.onclick = async () => {
        if (result.isLast) await renderResult();
        else { locked = false; renderQuestion(); }
      };
      feedback.focus();
    } catch (error) {
      locked = false;
      confirm.disabled = false;
      showInlineError(root, error.message === 'REVIEW_CONTEXT_CHANGED' ? CONTEXT_ERROR : 'A resposta não foi salva. Sua seleção foi preservada; tente confirmar novamente.');
    } finally {
      confirm.removeAttribute('aria-busy');
      root.querySelector('.review-window')?.removeAttribute('aria-busy');
    }
  };

  const renderResult = async () => {
    root.querySelector('.review-window')?.setAttribute('aria-busy', 'true');
    try {
      const summary = await finalizeReviewSession(session);
      ctx.reviewSession = null;
      ctx.requestReviewExit = null;
      root.innerHTML = `<main class="ro-window result-card" aria-labelledby="review-result-title"><div class="ro-title"><h1 id="review-result-title" tabindex="-1">Resultado da revisão</h1></div><div class="ro-body">
        <div class="review-result-grid">
          <div><small>Questões revisadas</small><strong>${summary.total}</strong></div><div><small>Acertos</small><strong>${summary.correct}</strong></div>
          <div><small>Erros</small><strong>${summary.errors}</strong></div><div><small>Não respondidas</small><strong>${summary.unanswered}</strong></div>
          <div><small>Memória fortalecida</small><strong>${summary.strengthened}</strong></div><div><small>Tempo ativo</small><strong>${formatDuration(summary.activeSeconds)}</strong></div>
          <div><small>XP persistido</small><strong>+${Number(summary.xp?.total) || 0}</strong></div>
        </div>
        <ul class="muted result-list"><li>Continuam quentes: <strong>${summary.hot}</strong></li><li>Passaram para morna: <strong>${summary.transitions.morna}</strong></li><li>Passaram para fria: <strong>${summary.transitions.fria}</strong></li><li>Passaram para congelada: <strong>${summary.transitions.congelada}</strong></li><li>Próxima revisão sugerida: <strong>${escapeHtml(formatDate(summary.nextReviewAt))}</strong></li></ul>
        <button type="button" class="btn btn-primary btn-block mt-12" id="review-finish">Voltar para Hoje</button>
      </div></main>`;
      $('#review-finish', root).onclick = () => navigate('home');
      requestAnimationFrame(() => $('#review-result-title', root)?.focus());
    } catch (error) {
      root.querySelector('.review-window')?.removeAttribute('aria-busy');
      showInlineError(root, error.message === 'REVIEW_CONTEXT_CHANGED' ? CONTEXT_ERROR : 'A finalização foi interrompida. Tente novamente; as etapas já salvas não serão repetidas.');
    }
  };

  renderQuestion();
}

function renderEmpty(root, plan = {}) {
  root.innerHTML = `<main class="review-empty ds-page ds-page--standard ds-surface ds-surface--empty"><span>${icon('shieldCheck')}</span><small>Sistema de suporte à aprovação</small><h1>Memória em dia.</h1><p>Nenhuma revisão está disponível agora.${plan.future ? ` Há ${plan.future} ${plan.future === 1 ? 'revisão futura agendada' : 'revisões futuras agendadas'}.` : ''}</p>
    <div class="review-empty__status"><strong>0 itens agora</strong><span>${plan.invalid ? `${plan.invalid} registro(s) preservado(s) para auditoria técnica` : 'Nenhuma prioridade ativa'}</span></div>
    <section class="review-empty__signals" aria-label="Tipos de revisão monitorados"></section>
    <button type="button" class="btn btn-primary" id="review-home">Voltar para Hoje</button></main>`;
}

function renderSessionError(root, message) {
  root.innerHTML = `<main class="ro-window" aria-labelledby="review-error-title"><div class="ro-body text-center"><h1 id="review-error-title">Revisão encerrada com segurança</h1><p>${escapeHtml(message)}</p><button type="button" class="btn btn-primary mt-12" id="review-home">Voltar para Hoje</button></div></main>`;
}

function showInlineError(root, message) {
  const target = $('#review-error', root) || root.querySelector('[role="alert"]');
  if (!target) return;
  target.textContent = message;
  target.classList.remove('hidden');
}

function renderReviewPlan(root, plan) {
  const recommendation = plan.urgent
    ? `${plan.urgent} ${plan.urgent === 1 ? 'item recorrente exige' : 'itens recorrentes exigem'} atenção agora.`
    : `${plan.due} ${plan.due === 1 ? 'revisão está disponível' : 'revisões estão disponíveis'} agora.`;
  const types = [
    ['error', 'Erro recente', plan.counts.error, 'Corrigir uma resposta incorreta antes que o erro se consolide.'],
    ['confidence', 'Baixa confiança', plan.counts.low_confidence, 'Transformar dúvida em segurança para a próxima prova.'],
    ['recurring', 'Recorrência', plan.counts.recurring, 'Atacar padrões reais de erro que voltaram a aparecer.'],
    ['scheduled', 'Agendada', plan.counts.scheduled, 'Manter o conteúdo acessível com repetição espaçada.'],
  ];
  root.innerHTML = `<main class="review-plan ds-page ds-page--wide"><header class="review-plan__header"><div><span class="ds-kicker">Sistema de suporte à aprovação</span><h1>Revisão estratégica</h1><p>Somente revisões vencidas e elegíveis entram neste bloco.</p></div><button type="button" class="review-plan__back" id="review-back" aria-label="Voltar ao início"><span aria-hidden="true">←</span><span>Voltar</span></button></header>
    <section class="review-plan__hero ds-surface ds-surface--primary" aria-labelledby="review-recommendation-title"><div class="review-plan__hero-copy"><span>Próximo bloco recomendado</span><h2 id="review-recommendation-title">Fortaleça ${plan.total} ${plan.total === 1 ? 'ponto' : 'pontos'} da sua preparação</h2><p>${escapeHtml(recommendation)} A sessão respeita a prioridade da fila e nunca usa revisões futuras para completar dez questões.</p><div class="review-plan__actions"><button type="button" class="btn btn-primary" id="review-start">${icon('bolt')} Iniciar revisão</button><span>${plan.total} ${plan.total === 1 ? 'item neste bloco' : 'itens neste bloco'}</span></div><div id="review-error" class="review-inline-error hidden" role="alert"></div></div>
    <dl class="review-plan__summary"><div><dt>Disponíveis</dt><dd>${plan.due}</dd><small>itens válidos agora</small></div><div><dt>Futuras</dt><dd>${plan.future}</dd><small>não entram na sessão</small></div><div class="${plan.urgent ? 'is-urgent' : ''}"><dt>Urgentes</dt><dd>${plan.urgent}</dd><small>recorrentes vencidos</small></div><div><dt>Próximo ciclo</dt><dd class="is-date">${escapeHtml(formatDate(plan.nextReviewAt))}</dd><small>memória espaçada</small></div></dl></section>
    <section class="review-plan__types ds-surface ds-surface--secondary" aria-labelledby="review-types-title"><div class="review-plan__section-title"><div><span>Por que revisar</span><h2 id="review-types-title">Motivos da fila</h2></div></div><div class="review-type-grid">${types.map(([tone, label, count, description]) => `<article class="review-type-card review-type-card--${tone}"><div><span>${label}</span><strong>${count}</strong></div><p>${description}</p></article>`).join('')}</div></section>
    <section class="review-plan__queue ds-surface ds-surface--data" aria-labelledby="review-queue-title"><div class="review-plan__section-title"><div><span>O que revisar</span><h2 id="review-queue-title">Fila disponível agora</h2></div><p>Ordem determinística por prazo, recorrência, dificuldade e domínio.</p></div><ol class="review-plan__list">${plan.items.map((item) => `<li class="review-plan__item review-plan__item--${item.priority.tone}"><span class="review-plan__order">${String(item.order).padStart(2, '0')}</span><div class="review-plan__item-copy"><div class="review-plan__badges"><span class="review-type review-type--${item.tone}">${escapeHtml(item.label)}</span><span class="review-priority review-priority--${item.priority.tone}">${escapeHtml(item.priority.label)}</span></div><strong>${escapeHtml(item.subtopicName)}</strong><p>${escapeHtml(item.reason)}</p></div><dl class="review-plan__item-meta"><div><dt>Domínio</dt><dd>${item.mastery}%</dd></div><div><dt>Erros</dt><dd>${Number(item.errorCount) || 0}</dd></div><div><dt>Vencimento</dt><dd>${escapeHtml(formatDate(item.nextReviewAt))}</dd></div></dl></li>`).join('')}</ol></section></main>`;
}

function renderAnswers(question) {
  if (question.format === 'certo_errado') return `<button type="button" class="answer-btn certo" role="radio" aria-checked="false" data-a="true"><span class="ans-letter">C</span> Certo</button><button type="button" class="answer-btn errado" role="radio" aria-checked="false" data-a="false"><span class="ans-letter">E</span> Errado</button>`;
  return (question.options || []).map((option) => {
    const letter = String(option).charAt(0);
    return `<button type="button" class="answer-btn" role="radio" aria-checked="false" data-a="${escapeAttr(letter)}"><span class="ans-letter">${escapeHtml(letter)}</span> ${escapeHtml(String(option).replace(/^[A-E]\)\s*/, ''))}</button>`;
  }).join('');
}

function answerValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function markCorrectAnswer(root, question, correctAnswer) {
  const expected = question.format === 'certo_errado'
    ? String(correctAnswer === true || correctAnswer === 'true' || correctAnswer === 'Certo')
    : String(correctAnswer);
  root.querySelector(`.answer-btn[data-a="${CSS.escape(expected)}"]`)?.classList.add('correct');
}

function formatAnswer(question, value) {
  if (question.format === 'certo_errado') return value === true || value === 'true' || value === 'Certo' ? 'Certo' : 'Errado';
  const option = (question.options || []).find((item) => String(item).charAt(0) === String(value));
  return option || String(value ?? '—');
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'a definir';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return `${Math.round(total)} s`;
  return `${Math.floor(total / 60)} min`;
}
