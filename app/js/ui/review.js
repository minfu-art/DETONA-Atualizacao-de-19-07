import { $, closeModal, escapeAttr, escapeHtml, openModal } from './helpers.js';
import {
  answerReviewQuestion, createReviewSession, describeReviewItem,
  finalizeReviewSession, getReviewPlanData, validateReviewSession,
} from '../services/reviewService.js';
import {
  buildReviewFeedbackPresentation, buildReviewPlanPresentation,
  buildReviewResultPresentation, memoryPresentation,
} from './reviewPresentation.js';
import { progressBar } from './components.js';
import { icon } from './icons.js?v=66';
import { isQuestionEligible } from '../core/questionSchema.js';

const CONTEXT_ERROR = 'Esta sessão pertence a outro contexto de estudo.';

export async function renderReview(root, navigate, ctx) {
  let session = ctx.reviewSession;
  ctx.requestReviewExit = null;
  if (!session) {
    renderReviewLoading(root);
    let plan;
    try {
      plan = await getReviewPlanData(ctx.reviewFilters || {});
    } catch {
      renderReviewLoadError(root);
      $('#review-home', root)?.addEventListener('click', () => navigate('home'));
      return;
    }
    if (!plan.total) {
      renderEmpty(root, plan);
      $('#review-home', root)?.addEventListener('click', () => navigate('home'));
      $('#review-study', root)?.addEventListener('click', () => navigate('map'));
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
        showInlineError(root, error.message === 'REVIEW_EMPTY'
          ? 'Nenhuma revisão disponível agora.'
          : 'Não foi possível preparar a revisão. Tente novamente.');
      }
    });
    $('#review-back', root)?.addEventListener('click', () => navigate('home'));
    return;
  }

  const validation = validateReviewSession(session, { isQuestionEligible });
  if (!validation.valid || !session.questions.length) {
    ctx.reviewSession = null;
    renderSessionError(root, validation.errors.includes('SESSION_SIZE_INVALID')
      ? 'Nenhuma revisão está disponível agora.'
      : CONTEXT_ERROR);
    $('#review-home', root)?.addEventListener('click', () => navigate('home'));
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
      '<div class="review-exit-dialog"><p>As respostas já confirmadas permanecerão registradas. As questões ainda não respondidas serão encerradas e nenhuma recompensa final da sessão será concedida.</p></div>',
      '<button type="button" class="btn btn-primary" data-review-stay autofocus>Continuar revisando</button><button type="button" class="btn btn-ghost review-exit-dialog__leave" data-review-leave>Encerrar revisão</button>',
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
    const memory = memoryPresentation(item.memoryState);
    const statement = question.statement || question.enunciado || question.question || question.text || 'Enunciado indisponível.';
    const position = session.index + 1;
    const total = session.questions.length;
    root.innerHTML = `<main class="review-shell review-session" aria-labelledby="review-question-title">
      <header class="review-session__top">
        <div class="review-session__identity"><span>${icon('brain')}</span><div><span>Revisão inteligente</span><strong>Questão ${position} de ${total}</strong></div></div>
        <div class="review-session__badges"><span class="review-type review-type--${presentation.tone}">${escapeHtml(presentation.label)}</span><span class="review-priority review-priority--${presentation.priority.tone}">${escapeHtml(presentation.priority.label)}</span></div>
        <button type="button" class="review-session__exit" id="review-exit" aria-label="Encerrar esta revisão">Encerrar revisão</button>
      </header>
      <div class="review-session__progress">${progressBar({ value: Math.round((position / total) * 100), label: 'Progresso da revisão', tone: 'data', detail: `${position} de ${total}` })}</div>
      <div class="review-session__body">
        <aside class="review-session__context" aria-label="Contexto da revisão">
          <section class="review-why"><span>${icon('refresh')}</span><div><h2>Por que revisar este conteúdo?</h2><p>${escapeHtml(presentation.reason)}</p></div></section>
          <section class="review-memory review-memory--${memory.tone}" aria-label="Estado atual da memória: ${escapeAttr(memory.label)}"><span>${icon('brain')}</span><div><strong>${escapeHtml(memory.label)}</strong><p>${escapeHtml(memory.description)}</p></div></section>
        </aside>
        <section class="review-question" aria-labelledby="review-question-title">
          <span class="review-question__eyebrow">Recupere o conceito antes de confirmar</span>
          <h1 id="review-question-title" tabindex="-1">${escapeHtml(statement)}</h1>
          <fieldset class="review-answer-fieldset"><legend>Selecione uma alternativa</legend><div class="review-answers" id="review-answers" role="radiogroup" aria-label="Alternativas da questão">${renderAnswers(question)}</div></fieldset>
          <div id="review-error" class="review-inline-error hidden" role="alert" tabindex="-1"></div>
          <div class="review-session__action"><button type="button" class="btn btn-primary btn-block" id="review-confirm" disabled aria-busy="false">Confirmar resposta</button></div>
          <div id="review-feedback" class="hidden" aria-live="polite" role="status" tabindex="-1"></div>
          <div class="review-session__action"><button type="button" class="btn btn-primary btn-block hidden" id="review-next">Próxima questão</button></div>
        </section>
      </div>
    </main>`;
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
    confirm.textContent = 'Confirmando…';
    confirm.setAttribute('aria-busy', 'true');
    root.querySelector('.review-shell')?.setAttribute('aria-busy', 'true');
    hideInlineError(root);
    try {
      const result = await answerReviewQuestion(session, selectedAnswer);
      root.querySelectorAll('.answer-btn').forEach((item) => { item.disabled = true; });
      selectedButton.classList.add(result.correct ? 'correct' : 'wrong');
      markCorrectAnswer(root, question, result.correctAnswer);
      const feedbackView = buildReviewFeedbackPresentation(result, result.question);
      const feedback = $('#review-feedback', root);
      feedback.classList.remove('hidden');
      feedback.innerHTML = renderFeedback(feedbackView, question, result);
      confirm.classList.add('hidden');
      const next = $('#review-next', root);
      next.classList.remove('hidden');
      next.textContent = result.isLast ? 'Ver resultado' : 'Próxima questão';
      next.onclick = async () => {
        if (result.isLast) await renderResult(next);
        else {
          locked = false;
          renderQuestion();
        }
      };
      feedback.focus();
    } catch (error) {
      locked = false;
      confirm.disabled = false;
      confirm.textContent = 'Confirmar resposta';
      showInlineError(root, error.message === 'REVIEW_CONTEXT_CHANGED'
        ? CONTEXT_ERROR
        : 'A resposta não foi salva. Sua seleção foi preservada; tente confirmar novamente.');
    } finally {
      confirm.setAttribute('aria-busy', 'false');
      root.querySelector('.review-shell')?.removeAttribute('aria-busy');
    }
  };

  const renderResult = async (actionButton) => {
    actionButton.disabled = true;
    actionButton.textContent = 'Concluindo…';
    actionButton.setAttribute('aria-busy', 'true');
    root.querySelector('.review-shell')?.setAttribute('aria-busy', 'true');
    hideInlineError(root);
    try {
      const summary = await finalizeReviewSession(session);
      const view = buildReviewResultPresentation(summary, session.results);
      ctx.reviewSession = null;
      ctx.requestReviewExit = null;
      renderReviewResult(root, view);
      $('#review-finish', root)?.addEventListener('click', () => navigate('home'));
      $('#review-plan', root)?.addEventListener('click', () => navigate('review'));
      $('#review-study', root)?.addEventListener('click', () => navigate('map'));
      requestAnimationFrame(() => $('#review-result-title', root)?.focus());
    } catch (error) {
      actionButton.disabled = false;
      actionButton.textContent = 'Tentar novamente';
      actionButton.setAttribute('aria-busy', 'false');
      root.querySelector('.review-shell')?.removeAttribute('aria-busy');
      showInlineError(root, error.message === 'REVIEW_CONTEXT_CHANGED'
        ? CONTEXT_ERROR
        : 'Não foi possível concluir agora. As etapas já salvas foram preservadas.');
    }
  };

  renderQuestion();
}

function renderReviewLoading(root) {
  root.innerHTML = `<main class="review-shell review-state review-state--loading" aria-labelledby="review-loading-title" aria-busy="true">
    <span class="review-state__icon" aria-hidden="true">${icon('brain')}</span><span class="ds-kicker">Organizando sua memória</span>
    <h1 id="review-loading-title">Revisão inteligente</h1><p>O DETONA está priorizando o que precisa de reforço agora.</p>
    <div class="review-state__skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
  </main>`;
}

function renderReviewLoadError(root) {
  root.innerHTML = `<main class="review-shell review-state review-state--error" aria-labelledby="review-load-error-title">
    <span class="review-state__icon" aria-hidden="true">${icon('alert')}</span><span class="ds-kicker">Revisão inteligente</span>
    <h1 id="review-load-error-title">Não foi possível abrir seu plano</h1><p>Seus dados permanecem preservados. Volte para Hoje e tente novamente em instantes.</p>
    <button type="button" class="btn btn-primary" id="review-home">Voltar para Hoje</button>
  </main>`;
}

function renderEmpty(root, plan = {}) {
  const future = Math.max(0, Number(plan.future) || 0);
  const message = future
    ? `Há ${future} ${future === 1 ? 'revisão agendada' : 'revisões agendadas'} para os próximos ciclos.`
    : 'Continue estudando. O DETONA criará novas revisões quando identificar conteúdos que precisam de reforço.';
  root.innerHTML = `<main class="review-shell review-state review-state--empty" aria-labelledby="review-empty-title">
    <span class="review-state__icon" aria-hidden="true">${icon('shieldCheck')}</span><span class="ds-kicker">Revisão inteligente</span>
    <h1 id="review-empty-title">Memória em dia.</h1><p>Nenhuma revisão está disponível agora.</p><p>${escapeHtml(message)}</p>
    <section class="review-state__signals" aria-label="Tipos de revisão monitorados">
      <span><b aria-hidden="true">!</b> Erro recente</span><span><b aria-hidden="true">?</b> Baixa confiança</span><span><b aria-hidden="true">↻</b> Recorrência</span><span><b aria-hidden="true">◷</b> Agendada</span>
    </section>
    <div class="review-state__actions"><button type="button" class="btn btn-primary" id="review-home">Voltar para Hoje</button><button type="button" class="btn btn-ghost" id="review-study">Continuar estudando</button></div>
  </main>`;
}

function renderSessionError(root, message) {
  root.innerHTML = `<main class="review-shell review-state review-state--error" aria-labelledby="review-error-title">
    <span class="review-state__icon" aria-hidden="true">${icon('shieldCheck')}</span><span class="ds-kicker">Contexto protegido</span>
    <h1 id="review-error-title">Revisão encerrada com segurança</h1><p>${escapeHtml(message)}</p>
    <button type="button" class="btn btn-primary" id="review-home">Voltar para Hoje</button>
  </main>`;
}

function showInlineError(root, message) {
  const target = $('#review-error', root) || root.querySelector('[role="alert"]');
  if (!target) return;
  target.textContent = message;
  target.classList.remove('hidden');
  requestAnimationFrame(() => target.focus?.());
}

function hideInlineError(root) {
  const target = $('#review-error', root);
  if (!target) return;
  target.textContent = '';
  target.classList.add('hidden');
}

function renderReviewPlan(root, plan) {
  const view = buildReviewPlanPresentation(plan);
  root.innerHTML = `<main class="review-shell review-plan" aria-labelledby="review-plan-title">
    <header class="review-plan__header"><div><span class="ds-kicker">Consolidação da memória</span><h1 id="review-plan-title">Revisão inteligente</h1><p>O DETONA prioriza os conteúdos que precisam ser recuperados antes que sejam esquecidos.</p></div><button type="button" class="review-plan__back" id="review-back" aria-label="Voltar para Hoje"><span aria-hidden="true">←</span><span>Voltar</span></button></header>
    <section class="review-summary" aria-label="Resumo do plano de revisão">
      <article class="review-summary__recommendation" aria-labelledby="review-recommendation-title"><span class="review-summary__icon" aria-hidden="true">${icon('brain')}</span><div><span>Próximo bloco recomendado</span><h2 id="review-recommendation-title">${escapeHtml(view.recommendation)}</h2><p>${escapeHtml(view.availability)} O bloco respeita a prioridade acadêmica e contém apenas o que está disponível neste momento.</p><div class="review-summary__actions"><button type="button" class="btn btn-primary" id="review-start">${icon('refresh')} Iniciar revisão</button><span>${view.total} ${view.total === 1 ? 'item neste bloco' : 'itens neste bloco'}</span></div><div id="review-error" class="review-inline-error hidden" role="alert" tabindex="-1"></div></div></article>
      <dl class="review-summary__metrics">
        ${renderPlanMetric('Disponíveis agora', view.due, 'Entram na revisão', 'data')}
        ${renderPlanMetric('Futuras', view.future, 'Próximos ciclos', 'future')}
        ${renderPlanMetric('Urgentes', view.urgent, 'Pedem atenção', 'urgent')}
        ${renderPlanMetric('Congeladas', view.frozen, 'Consolidadas no ciclo', 'frozen')}
        ${view.nextCycle ? `<div class="review-summary__metric review-summary__metric--cycle"><dt>Próximo ciclo</dt><dd>${escapeHtml(view.nextCycle)}</dd><small>Data persistida</small></div>` : ''}
      </dl>
    </section>
    <section class="review-types" aria-labelledby="review-types-title"><div class="review-section-heading"><div><span>Origem das prioridades</span><h2 id="review-types-title">Por que estes conteúdos voltaram?</h2></div><p>Cada motivo usa dados reais do seu histórico de estudo.</p></div><div class="review-types__grid">${view.types.map((type) => `<article class="review-type-card review-type-card--${type.type}"><span class="review-type-card__icon" aria-hidden="true">${type.symbol}</span><div><span>${escapeHtml(type.label)}</span><strong>${type.count}</strong><p>${escapeHtml(type.description)}</p></div></article>`).join('')}</div></section>
    <section class="review-queue" aria-labelledby="review-queue-title"><div class="review-section-heading"><div><span>Seu próximo bloco</span><h2 id="review-queue-title">Conteúdos disponíveis agora</h2></div><p>A ordem considera prazo, recorrência, dificuldade e domínio já registrados.</p></div><ol class="review-queue__list">${view.items.map(renderPlanItem).join('')}</ol></section>
  </main>`;
}

function renderPlanMetric(label, value, detail, tone) {
  return `<div class="review-summary__metric review-summary__metric--${tone}${value ? '' : ' is-zero'}"><dt>${escapeHtml(label)}</dt><dd>${value}</dd><small>${escapeHtml(detail)}</small></div>`;
}

function renderPlanItem(item) {
  const memory = item.memory;
  return `<li class="review-queue__item review-queue__item--${item.priority.tone}">
    <span class="review-queue__order" aria-label="Item ${item.order}">${String(item.order).padStart(2, '0')}</span>
    <div class="review-queue__content"><div class="review-plan__badges"><span class="review-type review-type--${item.tone}">${escapeHtml(item.label)}</span><span class="review-priority review-priority--${item.priority.tone}">${escapeHtml(item.priority.label)}</span></div><strong title="${escapeAttr(item.subtopicName)}">${escapeHtml(item.subtopicName)}</strong>${item.disciplineName ? `<span class="review-queue__discipline">${escapeHtml(item.disciplineName)}</span>` : ''}<p>${escapeHtml(item.reason)}</p></div>
    <dl class="review-queue__meta"><div><dt>Domínio atual</dt><dd>${Number(item.mastery) || 0}%</dd></div><div><dt>Memória</dt><dd><span class="review-memory-dot review-memory-dot--${memory.tone}" aria-hidden="true"></span>${escapeHtml(memory.label)}</dd><small>${escapeHtml(memory.description)}</small></div><div><dt>Prazo</dt><dd>${escapeHtml(item.scheduleLabel)}</dd>${item.reviewDate ? `<small>${escapeHtml(item.reviewDate)}</small>` : ''}</div></dl>
  </li>`;
}

function renderAnswers(question) {
  if (question.format === 'certo_errado') {
    return '<button type="button" class="answer-btn certo" role="radio" aria-checked="false" data-a="true"><span class="ans-letter">C</span><span>Certo</span></button><button type="button" class="answer-btn errado" role="radio" aria-checked="false" data-a="false"><span class="ans-letter">E</span><span>Errado</span></button>';
  }
  return (question.options || []).map((option) => {
    const letter = String(option).charAt(0);
    return `<button type="button" class="answer-btn" role="radio" aria-checked="false" data-a="${escapeAttr(letter)}"><span class="ans-letter">${escapeHtml(letter)}</span><span>${escapeHtml(String(option).replace(/^[A-E]\)\s*/, ''))}</span></button>`;
  }).join('');
}

function renderFeedback(view, question, result) {
  const explanation = view.explanation;
  const seen = new Set([String(explanation.explanation || '').trim()].filter(Boolean));
  const sections = [];
  for (const section of explanation.sections || []) {
    const text = String(section.text || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    sections.push({ label: section.label, text });
  }
  const extra = [
    ['Pegadinha', view.normalized.trap],
    ['Conhecimento adicional', view.normalized.addedKnowledge],
  ];
  for (const [label, value] of extra) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    sections.push({ label, text });
  }
  const references = (explanation.references || []).filter(Boolean);
  return `<section class="review-feedback ${view.correct ? 'is-correct' : 'is-wrong'}" aria-labelledby="review-feedback-title">
    <header class="review-feedback__header"><span aria-hidden="true">${view.correct ? icon('check') : icon('refresh')}</span><div><h2 id="review-feedback-title">${escapeHtml(view.title)}</h2><p>${escapeHtml(view.message)}</p></div></header>
    <dl class="review-feedback__answers"><div><dt>Sua resposta</dt><dd>${escapeHtml(formatAnswer(question, result.selectedAnswer))}</dd></div><div><dt>Resposta correta</dt><dd>${escapeHtml(formatAnswer(question, result.correctAnswer))}</dd></div></dl>
    <section class="review-explanation" aria-labelledby="review-explanation-title"><h3 id="review-explanation-title">Explicação</h3><p>${escapeHtml(explanation.explanation)}</p>${sections.map((section) => `<div><strong>${escapeHtml(section.label)}</strong><p>${escapeHtml(section.text)}</p></div>`).join('')}${view.normalized.source ? `<div><strong>Fonte</strong><p>${escapeHtml(view.normalized.source)}</p></div>` : ''}${references.length ? `<div><strong>Referências</strong><ul>${references.map((reference) => `<li>${escapeHtml(reference)}</li>`).join('')}</ul></div>` : ''}</section>
    <section class="review-memory-transition" aria-label="Transição da memória"><div><span>Estado anterior</span><strong>${escapeHtml(view.previous.label)}</strong></div><span class="review-memory-transition__arrow" aria-hidden="true">→</span><div><span>Estado atual</span><strong>${escapeHtml(view.current.label)}</strong></div><p>${escapeHtml(view.transitionLabel)}</p>${view.nextReview ? `<small>Próxima revisão: <strong>${escapeHtml(view.nextReview)}</strong></small>` : ''}</section>
  </section>`;
}

function renderReviewResult(root, view) {
  const transitions = [
    ['Passaram para morna', view.transitions.morna],
    ['Passaram para fria', view.transitions.fria],
    ['Passaram para congelada', view.transitions.congelada],
    ['Permanecem quentes', view.hot],
  ].filter(([, value]) => value > 0);
  const emblemNames = view.emblems.map((item) => item?.name || item?.title || item?.label).filter(Boolean);
  root.innerHTML = `<main class="review-shell review-result" aria-labelledby="review-result-title">
    <header class="review-result__header"><span class="review-result__icon" aria-hidden="true">${icon('brain')}</span><span class="ds-kicker">Ciclo de consolidação</span><h1 id="review-result-title" tabindex="-1">Resultado da revisão</h1><p>${escapeHtml(view.classification)}</p></header>
    <section class="review-result__summary" aria-label="Resumo da revisão"><div><span>Questões revisadas</span><strong>${view.total}</strong></div><div class="is-success"><span>Acertos</span><strong>${view.correct}</strong></div><div class="is-error"><span>Erros</span><strong>${view.errors}</strong></div><div><span>Não respondidas</span><strong>${view.unanswered}</strong></div><div class="is-memory"><span>Memória fortalecida</span><strong>${view.strengthened}</strong></div><div><span>Tempo ativo</span><strong>${formatDuration(view.activeSeconds)}</strong></div></section>
    <section class="review-result__memory" aria-labelledby="review-result-memory-title"><div><span>Memória após a sessão</span><h2 id="review-result-memory-title">Transições confirmadas</h2></div>${transitions.length ? `<ul>${transitions.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${value}</strong></li>`).join('')}</ul>` : '<p>Nenhuma mudança de estado foi registrada nesta sessão.</p>'}${view.nextReview ? `<p class="review-result__next">Próxima revisão: <strong>${escapeHtml(view.nextReview)}</strong></p>` : ''}</section>
    <section class="review-result__reward" aria-label="Resultado de experiência"><span>${icon('bolt')}</span><div><strong>${view.xp > 0 ? `+${view.xp} XP persistidos` : 'Nenhum XP adicional foi concedido nesta sessão.'}</strong><p>Somente recompensas confirmadas pelo sistema aparecem aqui.</p></div></section>
    ${emblemNames.length ? `<section class="review-result__emblems" aria-labelledby="review-result-emblems-title"><h2 id="review-result-emblems-title">Emblemas conquistados</h2><ul>${emblemNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul></section>` : ''}
    <div class="review-result__actions"><button type="button" class="btn btn-primary" id="review-finish">Voltar para Hoje</button><button type="button" class="btn btn-ghost" id="review-study">Continuar estudando</button><button type="button" class="btn btn-ghost" id="review-plan">Ver plano de revisão</button></div>
  </main>`;
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

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return `${Math.round(total)} s`;
  const minutes = Math.floor(total / 60);
  const remaining = Math.round(total % 60);
  return remaining ? `${minutes} min ${remaining} s` : `${minutes} min`;
}
