import { rankedEventService } from '../services/rankedEventService.js';
import { closeModal, escapeAttr, escapeHtml, openModal, toast } from './helpers.js';
import { mountPageContainer } from './appShell.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { STORES } from '../core/types.js';
import { createReviewItem } from '../core/reviewQueue.js';
import {
  createRankedClock,
  normalizeRankedAnswers,
  rankedDeadline,
  rankedEventVersion,
  rankedResultInvariant,
  validateRankedEvent,
  validateRankedSession,
} from '../core/rankedSimulation.js';
import { emptyState, loadingState } from './components.js';
import {
  KIRO_ASSET,
  rankedEventAction,
  rankedEventGroups,
  rankedQuestionPresentation,
  rankedRankingReleaseLabel,
  rankedResultStatus,
  rankedScoringLabel,
  rankedStatus,
  rankedStatusLabel,
  rankedTimerPresentation,
} from './rankedVisualModel.js';

function dateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'Data indisponível';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function eventCard(event, { featured = false } = {}) {
  const status = rankedStatus(event);
  return `
    <article class="ranked-event-card${featured ? ' ranked-event-card--featured' : ''}" aria-labelledby="ranked-event-${escapeAttr(event.id)}">
      <div class="ranked-event-card__topline">
        <span class="ranked-event-status ranked-event-status--${escapeAttr(status)}">${escapeHtml(rankedStatusLabel(status))}</span>
        ${featured ? '<span class="ranked-event-card__feature">Desafio em destaque</span>' : ''}
      </div>
      <div class="ranked-event-card__copy">
        <h2 id="ranked-event-${escapeAttr(event.id)}">${escapeHtml(event.title)}</h2>
        <p>${escapeHtml(event.description || 'Confira as regras e prepare-se para este simulado.')}</p>
      </div>
      <dl class="ranked-event-card__facts">
        <div><dt>Início</dt><dd>${escapeHtml(dateTime(event.starts_at))}</dd></div>
        <div><dt>Encerramento</dt><dd>${escapeHtml(dateTime(event.ends_at))}</dd></div>
        <div><dt>Duração</dt><dd>${Number(event.duration_minutes)} min</dd></div>
        <div><dt>Questões</dt><dd>${Number(event.question_count)}</dd></div>
        <div><dt>Pontuação</dt><dd>${escapeHtml(rankedScoringLabel(event.scoring_mode))}</dd></div>
        <div><dt>Classificação</dt><dd>${escapeHtml(rankedRankingReleaseLabel(event.ranking_release_mode))}</dd></div>
      </dl>
      <button type="button" class="ds-button ds-button--primary" data-ranked-event="${escapeAttr(event.id)}" data-ranked-status="${escapeAttr(status)}">${escapeHtml(rankedEventAction(status))}</button>
    </article>`;
}

function kiroMessage(message, { compact = false } = {}) {
  return `<aside class="ranked-kiro${compact ? ' ranked-kiro--compact' : ''}" aria-label="Orientação de Kiro">
    <div class="ranked-kiro__copy"><span>KIRO · MENTOR DOS DESAFIOS</span><p>${escapeHtml(message)}</p></div>
    ${compact ? '' : `<img src="${KIRO_ASSET}" alt="Kiro, mentor dos Simulados Ranqueados" width="768" height="1152" loading="lazy" decoding="async">`}
  </aside>`;
}

function rankedHero({ eyebrow = 'SIMULADOS RANQUEADOS', title = 'Simulados ranqueados', description = '', compact = false, kiroText = 'Escolha seu próximo desafio. Aqui, todos enfrentam as mesmas regras.' } = {}) {
  return `<header class="ranked-hero${compact ? ' ranked-hero--compact' : ''}">
    <div class="ranked-hero__copy"><span>${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>
    ${kiroMessage(kiroText, { compact })}
  </header>`;
}

function questionText(question) {
  return question.payload?.statement || question.payload?.enunciado || question.payload?.texto || 'Enunciado indisponível.';
}

function questionOptions(question) {
  const raw = question.payload?.options || question.payload?.alternativas;
  if (!Array.isArray(raw) || raw.length < 2) {
    return [{ value: 'C', label: 'Certo' }, { value: 'E', label: 'Errado' }];
  }
  return raw.map((option, index) => {
    const label = typeof option === 'object' ? option.text || option.label || option.value : option;
    const prefixed = /^([A-E])[\s).:-]/i.exec(String(label || ''));
    return { value: prefixed?.[1]?.toUpperCase() || String.fromCharCode(65 + index), label: String(label || '') };
  });
}

function buildSession(event, started, ctx) {
  const attempt = started.attempt || {};
  const questions = started.questions || [];
  const userId = String(ctx.user?.id || '');
  const contestId = String(ctx.contest?.id || '');
  const deadline = rankedDeadline(event, attempt);
  if (!started.deadlineAt && deadline == null) throw new Error('O prazo desta tentativa é inválido.');
  const deadlineAt = started.deadlineAt || new Date(deadline).toISOString();
  const answers = Object.fromEntries((attempt.answers || []).map((answer) => {
    const questionId = String(answer.questionId || answer.question_id || '');
    return [questionId, {
      questionId, answer: String(answer.answer || '').toUpperCase(),
    }];
  }));
  return {
    id: String(attempt.id || ''),
    eventId: String(event.id),
    eventVersion: String(started.eventVersion || rankedEventVersion(event)),
    userId,
    contestId,
    scopeKey: `${userId}:${contestId}`,
    questionIds: questions.map((question) => String(question.id)),
    questions,
    answers,
    currentIndex: 0,
    status: String(attempt.status || 'started'),
    startedAt: attempt.started_at,
    deadlineAt,
    serverNow: started.serverNow || new Date().toISOString(),
    submitting: false,
    expired: false,
    alerts: { fiveMinutes: false, oneMinute: false },
  };
}

function currentScope(ctx) {
  const userId = String(ctx.user?.id || '');
  const contestId = String(ctx.contest?.id || '');
  return { userId, contestId, scopeKey: `${userId}:${contestId}` };
}

function sessionAnswers(session) {
  return normalizeRankedAnswers(session.questions, Object.values(session.answers));
}

function renderAttempt(root, event, session, navigate, ctx) {
  ctx.clearRankedTimer?.();
  const scope = currentScope(ctx);
  const validation = validateRankedSession(session, { event, ...scope });
  if (!validation.valid) {
    ctx.rankedEventSession = null;
    renderContextError(root, navigate);
    return;
  }

  root.innerHTML = `
    <div class="ranked-shell ranked-attempt" aria-labelledby="ranked-attempt-title">
      <header class="ranked-attempt__header">
        <div class="ranked-attempt__identity">
          <span class="ranked-kicker">SIMULADO RANQUEADO · TENTATIVA EM ANDAMENTO</span>
          <h1 id="ranked-attempt-title">${escapeHtml(event.title)}</h1>
          <p>Concentre-se. O resultado só aparece após a entrega.</p>
        </div>
        <div class="ranked-timer" data-state="normal">
          <span id="ranked-timer-label">Tempo restante</span>
          <strong id="ranked-timer" role="timer" aria-live="off" aria-labelledby="ranked-timer-label">00:00</strong>
        </div>
        <button type="button" class="ds-button ds-button--ghost" id="ranked-exit">Encerrar simulado</button>
      </header>
      <div id="ranked-time-alert" class="ranked-time-alert hidden" role="status"></div>
      <div class="ranked-progress" aria-label="Progresso da tentativa">
        <div><span id="ranked-progress-label">Questão 1 de ${session.questions.length}</span><strong id="ranked-progress-detail">0 respondidas</strong></div>
        <progress id="ranked-progress-bar" max="${session.questions.length}" value="0">0 de ${session.questions.length}</progress>
      </div>
      <div class="ranked-attempt__layout">
        <form id="ranked-attempt-form" class="ranked-attempt__main" novalidate>
          <div id="ranked-question-slot"></div>
          <div id="ranked-attempt-error" class="ranked-functional-alert hidden" role="alert" tabindex="-1"></div>
          <p id="ranked-submit-state" class="ranked-submit-state hidden" role="status">Estamos registrando suas respostas com segurança.</p>
          <div class="ranked-navigation">
            <button type="button" class="ds-button ds-button--ghost" id="ranked-previous">Questão anterior</button>
            <button type="button" class="ds-button ds-button--secondary" id="ranked-next">Próxima questão</button>
            <button type="submit" class="ds-button ds-button--primary" id="ranked-submit" aria-busy="false">Entregar simulado</button>
          </div>
        </form>
        <aside class="ranked-attempt__aside" aria-labelledby="ranked-map-title">
          <div class="ranked-map__header"><span>VISÃO DA PROVA</span><h2 id="ranked-map-title">Mapa de questões</h2></div>
          <nav class="ranked-question-map" aria-label="Mapa de questões"></nav>
          <div class="ranked-map-legend" aria-label="Legenda do mapa">
            <span><i class="is-current" aria-hidden="true"></i>Atual</span>
            <span><i class="is-answered" aria-hidden="true">✓</i>Respondida</span>
            <span><i class="is-blank" aria-hidden="true">—</i>Em branco</span>
            <span><i class="is-marked" aria-hidden="true">◆</i>Marcada</span>
          </div>
        </aside>
      </div>
      <p class="sr-only" id="ranked-status" aria-live="polite"></p>
    </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });

  const clock = createRankedClock({ deadlineAt: session.deadlineAt, serverNow: session.serverNow });
  const timer = root.querySelector('#ranked-timer');
  const status = root.querySelector('#ranked-status');
  let interval = null;

  const clearTimer = () => {
    if (interval != null) globalThis.clearInterval(interval);
    interval = null;
    if (ctx.clearRankedTimer === clearTimer) ctx.clearRankedTimer = null;
  };
  ctx.clearRankedTimer = clearTimer;

  const renderQuestion = ({ focus = true } = {}) => {
    const question = session.questions[session.currentIndex];
    const selected = session.answers[String(question.id)]?.answer || '';
    root.querySelector('#ranked-question-slot').innerHTML = `
      <fieldset class="ranked-question" ${session.expired || session.submitting ? 'disabled' : ''}>
        <legend id="ranked-question-title" tabindex="-1"><span>Questão ${session.currentIndex + 1} de ${session.questions.length}</span><strong>${escapeHtml(questionText(question))}</strong></legend>
        <div class="ranked-question__answers" role="radiogroup" aria-label="Alternativas da questão ${session.currentIndex + 1}">
          ${questionOptions(question).map((option) => `<label class="ranked-answer${selected === option.value ? ' is-selected' : ''}"><input type="radio" name="ranked-answer" value="${escapeAttr(option.value)}" ${selected === option.value ? 'checked' : ''}><span class="ranked-answer__key" aria-hidden="true">${escapeHtml(option.value)}</span><span class="ranked-answer__text">${escapeHtml(option.label)}</span></label>`).join('')}
          <label class="ranked-answer ranked-answer--blank${selected === '' && session.answers[String(question.id)] ? ' is-selected' : ''}"><input type="radio" name="ranked-answer" value="" ${selected === '' && session.answers[String(question.id)] ? 'checked' : ''}><span class="ranked-answer__key" aria-hidden="true">—</span><span class="ranked-answer__text"><strong>Deixar em branco</strong><small>Você pode escolher outra resposta antes da entrega.</small></span></label>
        </div>
        <label class="ranked-review-mark"><input type="checkbox" id="ranked-mark-review" ${session.answers[String(question.id)]?.marked ? 'checked' : ''}><span><strong>Marcar para revisar antes da entrega</strong><small>Esta marcação vale somente dentro deste simulado.</small></span></label>
      </fieldset>`;
    root.querySelectorAll('input[name="ranked-answer"]').forEach((input) => input.addEventListener('change', () => {
      if (session.expired || session.submitting) return;
      session.answers[String(question.id)] = {
        questionId: String(question.id), answer: input.value,
        marked: Boolean(session.answers[String(question.id)]?.marked),
      };
      renderQuestion({ focus: false });
      status.textContent = `Resposta da questão ${session.currentIndex + 1} selecionada.`;
    }));
    root.querySelector('#ranked-mark-review')?.addEventListener('change', (eventChange) => {
      const previous = session.answers[String(question.id)] || { questionId: String(question.id), answer: '' };
      session.answers[String(question.id)] = { ...previous, marked: eventChange.currentTarget.checked };
      renderQuestion({ focus: false });
    });
    updateNavigation();
    if (focus) requestAnimationFrame(() => root.querySelector('#ranked-question-title')?.focus());
  };

  const updateNavigation = () => {
    const answered = new Set(Object.values(session.answers).filter((answer) => answer.answer).map((answer) => answer.questionId));
    root.querySelector('.ranked-question-map').innerHTML = session.questions.map((question, index) => {
      const questionId = String(question.id);
      const presentation = rankedQuestionPresentation({
        current: index === session.currentIndex,
        answered: answered.has(questionId),
        marked: Boolean(session.answers[questionId]?.marked),
      });
      return `<button type="button" class="ranked-question-map__item ${presentation.className}" data-ranked-question="${index}" aria-current="${index === session.currentIndex ? 'step' : 'false'}" aria-label="Questão ${index + 1}, ${escapeAttr(presentation.label)}"><span>${index + 1}</span>${presentation.states.includes('marcada para revisar') ? '<b aria-hidden="true">◆</b>' : ''}${presentation.states.includes('respondida') ? '<i aria-hidden="true">✓</i>' : '<i aria-hidden="true">—</i>'}</button>`;
    }).join('');
    root.querySelectorAll('[data-ranked-question]').forEach((button) => button.addEventListener('click', () => {
      session.currentIndex = Number(button.dataset.rankedQuestion);
      renderQuestion();
    }));
    root.querySelectorAll('[data-ranked-question]').forEach((button) => {
      button.disabled = session.expired || session.submitting;
    });
    root.querySelector('#ranked-previous').disabled = session.currentIndex === 0 || session.expired || session.submitting;
    root.querySelector('#ranked-next').disabled = session.currentIndex === session.questions.length - 1 || session.expired || session.submitting;
    root.querySelector('#ranked-submit').disabled = session.expired || session.submitting;
    root.querySelector('#ranked-progress-label').textContent = `Questão ${session.currentIndex + 1} de ${session.questions.length}`;
    root.querySelector('#ranked-progress-detail').textContent = `${answered.size} ${answered.size === 1 ? 'respondida' : 'respondidas'}`;
    root.querySelector('#ranked-progress-bar').value = answered.size;
  };

  const showError = (message, title = 'Não foi possível concluir a entrega') => {
    const alert = root.querySelector('#ranked-attempt-error');
    alert.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
    alert.classList.remove('hidden');
    requestAnimationFrame(() => alert.focus());
  };

  const submit = async ({ timedOut = false } = {}) => {
    if (session.submitting || (session.expired && !timedOut)) return;
    const contextValidation = validateRankedSession(session, { event, ...currentScope(ctx) });
    if (!contextValidation.valid) {
      clearTimer();
      ctx.rankedEventSession = null;
      renderContextError(root, navigate);
      return;
    }
    session.submitting = true;
    if (timedOut) session.expired = true;
    if (timedOut) root.querySelector('.ranked-question')?.setAttribute('disabled', '');
    const submitButton = root.querySelector('#ranked-submit');
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = timedOut ? 'Entregando respostas registradas…' : 'Entregando…';
    root.querySelector('#ranked-attempt-form').setAttribute('aria-busy', 'true');
    root.querySelector('#ranked-exit').disabled = true;
    root.querySelector('#ranked-submit-state').classList.remove('hidden');
    updateNavigation();
    try {
      const result = await rankedEventService.submit(event.id, sessionAnswers(session));
      clearTimer();
      const stillCurrent = ctx.rankedEventSession === session
        && validateRankedSession(session, { event, ...currentScope(ctx) }).valid;
      if (!stillCurrent) return;
      session.status = result.attempt?.status || (timedOut ? 'timed_out' : 'submitted');
      ctx.rankedEventResult = { ...(result.attempt || {}), eventId: event.id, eventVersion: session.eventVersion };
      ctx.rankedEventSession = null;
      ctx.requestRankedExit = null;
      ctx.rankedCompletionNotice = timedOut || result.attempt?.status === 'timed_out'
        ? 'O tempo terminou. Suas respostas registradas foram entregues.'
        : null;
      await renderRankedEvent(root, navigate, ctx);
    } catch {
      session.submitting = false;
      submitButton.setAttribute('aria-busy', 'false');
      submitButton.textContent = session.expired ? 'Tentar entrega novamente' : 'Entregar simulado';
      submitButton.disabled = false;
      root.querySelector('#ranked-attempt-form').setAttribute('aria-busy', 'false');
      root.querySelector('#ranked-exit').disabled = false;
      root.querySelector('#ranked-submit-state').classList.add('hidden');
      showError(
        session.expired
          ? 'Suas respostas permanecem preservadas nesta tela. Tente novamente.'
          : 'Suas respostas continuam preservadas. Verifique sua conexão e tente novamente.',
        session.expired ? 'Não foi possível concluir a entrega automática' : 'Não foi possível concluir a entrega',
      );
    }
  };

  const confirmSubmit = () => {
    const unanswered = session.questions.length - Object.values(session.answers).filter((answer) => answer.answer).length;
    const modal = openModal(
      'Entregar este simulado?',
      `<div class="ranked-submit-dialog"><p>Após a entrega, suas respostas não poderão ser alteradas.</p>${unanswered ? `<p>Você ainda possui <strong>${unanswered}</strong> ${unanswered === 1 ? 'questão sem resposta' : 'questões sem resposta'}.</p>` : ''}</div>`,
      '<button type="button" class="btn btn-primary" data-ranked-continue autofocus>Continuar respondendo</button><button type="button" class="btn btn-ghost" data-ranked-deliver>Entregar simulado</button>',
      { variant: 'confirm' },
    );
    modal.querySelector('[data-ranked-continue]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-ranked-deliver]')?.addEventListener('click', () => {
      closeModal();
      submit();
    });
  };

  const abandon = (target = 'home') => {
    closeModal();
    clearTimer();
    ctx.rankedEventSession = null;
    ctx.requestRankedExit = null;
    ctx.allowRankedExit = true;
    navigate(target);
  };

  const confirmExit = (target = 'home') => {
    if (session.submitting) {
      showError('A entrega está em andamento. Aguarde a confirmação antes de sair.');
      return;
    }
    const modal = openModal(
      'Encerrar este simulado?',
      '<div class="ranked-exit-dialog"><p>As respostas ainda não entregues desta tela serão descartadas. Nenhum resultado, ranking ou recompensa será registrado.</p></div>',
      '<button type="button" class="btn btn-primary" data-ranked-stay autofocus>Continuar no simulado</button><button type="button" class="btn btn-ghost" data-ranked-leave>Encerrar tentativa</button>',
      { variant: 'confirm' },
    );
    modal.querySelector('[data-ranked-stay]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-ranked-leave]')?.addEventListener('click', () => abandon(target));
  };
  ctx.requestRankedExit = confirmExit;

  root.querySelector('#ranked-exit')?.addEventListener('click', () => confirmExit('home'));
  root.querySelector('#ranked-previous')?.addEventListener('click', () => {
    if (session.currentIndex <= 0) return;
    session.currentIndex -= 1;
    renderQuestion();
  });
  root.querySelector('#ranked-next')?.addEventListener('click', () => {
    if (session.currentIndex >= session.questions.length - 1) return;
    session.currentIndex += 1;
    renderQuestion();
  });
  root.querySelector('#ranked-attempt-form')?.addEventListener('submit', (submitEvent) => {
    submitEvent.preventDefault();
    if (session.expired) submit({ timedOut: true });
    else confirmSubmit();
  });

  const tick = () => {
    const remaining = clock.remaining();
    const totalSeconds = Math.ceil(remaining / 1000);
    const timerPresentation = rankedTimerPresentation(remaining);
    const timerBox = root.querySelector('.ranked-timer');
    timerBox.dataset.state = timerPresentation.state;
    root.querySelector('#ranked-timer-label').textContent = timerPresentation.label;
    timer.textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    const timeAlert = root.querySelector('#ranked-time-alert');
    if (totalSeconds <= 300 && totalSeconds > 60 && !session.alerts.fiveMinutes) {
      session.alerts.fiveMinutes = true;
      status.textContent = 'Faltam cinco minutos.';
      timeAlert.textContent = 'Faltam cinco minutos.';
      timeAlert.className = 'ranked-time-alert is-attention';
    }
    if (totalSeconds <= 60 && totalSeconds > 0 && !session.alerts.oneMinute) {
      session.alerts.oneMinute = true;
      status.textContent = 'Falta um minuto.';
      timeAlert.textContent = 'Falta um minuto.';
      timeAlert.className = 'ranked-time-alert is-urgent';
    }
    if (remaining === 0) {
      clearTimer();
      status.textContent = 'O tempo terminou. Suas respostas registradas serão entregues.';
      timeAlert.textContent = 'O tempo terminou. Suas respostas registradas serão entregues.';
      timeAlert.className = 'ranked-time-alert is-finished';
      submit({ timedOut: true });
    }
  };
  renderQuestion({ focus: false });
  tick();
  if (!session.expired && !session.submitting) interval = globalThis.setInterval(tick, 1000);
}

function wrongQuestions(attempt, questions) {
  const answers = new Map((attempt?.answers || []).map((row) => [String(row.questionId), row.answer]));
  return questions.filter((question) => {
    const answer = answers.get(String(question.id));
    return answer && answer !== question.correctAnswer;
  });
}

function explanationCards(attempt, questions) {
  const answers = new Map((attempt?.answers || []).map((row) => [String(row.questionId || row.question_id), String(row.answer || '')]));
  return questions.map((question, index) => {
    const selected = answers.get(String(question.id)) || '';
    const correct = String(question.correctAnswer || '');
    const state = !selected ? 'blank' : selected === correct ? 'correct' : 'incorrect';
    const stateLabel = state === 'correct' ? 'Correta' : state === 'incorrect' ? 'Incorreta' : 'Em branco';
    return `<details class="ranked-explanation ranked-explanation--${state}">
      <summary><span>Questão ${index + 1}</span><strong>${stateLabel}</strong></summary>
      <div class="ranked-explanation__body">
        <p><span>Sua resposta</span><strong>${escapeHtml(selected || 'Em branco')}</strong></p>
        <p><span>Resposta correta</span><strong>${escapeHtml(correct)}</strong></p>
        <div><span>Explicação</span><p>${escapeHtml(question.explanation || 'Explicação detalhada ainda não disponível.')}</p></div>
      </div>
    </details>`;
  }).join('');
}

function renderResult(root, event, attempt, ranking = [], questions = [], notice = null) {
  const total = Number(event.question_count) || 0;
  const invariant = rankedResultInvariant({
    total,
    correct: attempt?.correct_count,
    errors: attempt?.incorrect_count,
    unanswered: attempt?.blank_count,
  });
  const wrong = wrongQuestions(attempt, questions);
  const completed = attempt && ['submitted', 'timed_out'].includes(attempt.status);
  const validResult = completed && invariant.valid;
  const resultStatus = rankedResultStatus(attempt);
  if (!validResult) {
    root.innerHTML = `<div class="ranked-shell ranked-state ranked-state--error" aria-labelledby="ranked-result-title">
      <span class="ranked-state__mark" aria-hidden="true">!</span>
      <div><span class="ranked-kicker">VERIFICAÇÃO DE INTEGRIDADE</span><h1 id="ranked-result-title" tabindex="-1">Não foi possível validar o resultado</h1><p>Os dados da entrega não passaram pela verificação de integridade.</p></div>
      <button type="button" class="ds-button ds-button--primary" id="ranked-back-home">Voltar para Hoje</button>
    </div>`;
    mountPageContainer(root, { variant: 'ranked-event' });
    return;
  }
  root.innerHTML = `
    <div class="ranked-shell ranked-result-page" aria-labelledby="ranked-result-title">
      <header class="ranked-result-hero ranked-result-hero--${resultStatus.tone}">
        <div><span class="ranked-kicker">RESULTADO DO SIMULADO</span><h1 id="ranked-result-title" tabindex="-1">Resultado do simulado</h1><p class="ranked-result-hero__event">${escapeHtml(event.title)}</p><strong>${escapeHtml(resultStatus.label)}</strong></div>
        ${kiroMessage(ranking.length
          ? 'Seu desempenho foi registrado. A classificação abaixo usa somente submissões oficiais.'
          : 'Seu desempenho foi registrado. A classificação será exibida quando o evento liberar o ranking.')}
        ${notice ? `<p class="ranked-functional-notice" role="status">${escapeHtml(notice)}</p>` : ''}
      </header>
      <section class="ranked-scoreboard" aria-label="Seu resultado">
        <article class="ranked-scoreboard__primary"><small>Pontuação</small><strong>${Number(attempt.score)}</strong><span>${escapeHtml(rankedScoringLabel(event.scoring_mode))}</span></article>
        <article><small>Acertos</small><strong>${invariant.correct}</strong><span>de ${invariant.total}</span></article>
        <article><small>Erros</small><strong>${invariant.errors}</strong><span>de ${invariant.total}</span></article>
        <article><small>Em branco</small><strong>${invariant.unanswered}</strong><span>de ${invariant.total}</span></article>
        <article><small>Percentual</small><strong>${Number(attempt.accuracy || 0).toLocaleString('pt-BR')}%</strong><span>taxa registrada</span></article>
        <article><small>Tempo</small><strong>${formatDuration(attempt.elapsed_seconds)}</strong><span>duração da tentativa</span></article>
      </section>
      <section class="ranked-ranking" aria-labelledby="ranked-ranking-title">
        ${ranking.length ? `<div class="ranked-section-heading"><span>CLASSIFICAÇÃO OFICIAL</span><h2 id="ranked-ranking-title">Ranking liberado</h2><p>Em caso de empate, são aplicados os critérios oficiais do evento.</p></div><ol>${ranking.map((row) => `
          <li><strong><span>${Number(row.position)}º</span>${escapeHtml(row.displayName)}</strong><span><b>${Number(row.score)} pontos</b><small>${Number(row.correctCount)} acertos · ${formatDuration(row.elapsedSeconds)}</small></span></li>`).join('')}</ol>` : '<div class="ranked-section-heading"><span>CLASSIFICAÇÃO</span><h2 id="ranked-ranking-title">Classificação ainda indisponível</h2><p>A classificação aparece somente quando o evento libera submissões oficiais.</p></div>'}
      </section>
      ${questions.length ? `<section class="ranked-explanations" aria-labelledby="ranked-explanations-title"><div class="ranked-section-heading"><span>APRENDIZADO PÓS-PROVA</span><h2 id="ranked-explanations-title">Explicações liberadas</h2></div>${explanationCards(attempt, questions)}</section>` : '<section class="ranked-protected" aria-label="Gabarito protegido"><strong>Gabarito protegido</strong><p>O gabarito permanece protegido até a liberação oficial do resultado.</p></section>'}
      <div class="ranked-result-actions">
        ${wrong.length ? '<button type="button" class="ds-button ds-button--secondary" id="ranked-add-review" aria-busy="false">Adicionar questões erradas à revisão</button>' : ''}
        <button type="button" class="ds-button ds-button--primary" id="ranked-back-home">Voltar para Hoje</button>
      </div>
    </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-add-review')?.addEventListener('click', async (clickEvent) => {
    clickEvent.currentTarget.disabled = true;
    clickEvent.currentTarget.setAttribute('aria-busy', 'true');
    for (const question of wrong) {
      const payload = question.payload || {};
      const questionId = String(question.id);
      if (await progressRepository.getById(STORES.reviewQueue, questionId)) continue;
      const item = createReviewItem({
        questionId,
        contestId: event.contest_id,
        subtopicId: payload.subtopic_id || payload.subtopicId || payload.topicoEditalId || '',
        disciplineId: payload.discipline_id || payload.disciplineId || payload.disciplinaId || '',
        difficulty: payload.difficulty || payload.dificuldade || 3,
        source: 'ranked_event',
      }, { reason: 'incorrect', now: new Date() });
      await progressRepository.put(STORES.reviewQueue, item);
    }
    clickEvent.currentTarget.textContent = 'Adicionadas à revisão';
    clickEvent.currentTarget.setAttribute('aria-busy', 'false');
  });
}

function renderContextError(root, navigate) {
  root.innerHTML = `<div class="ranked-shell ranked-state ranked-state--context" aria-labelledby="ranked-context-title"><span class="ranked-state__mark" aria-hidden="true">↩</span><div><span class="ranked-kicker">CONTEXTO DE ESTUDO ALTERADO</span><h1 id="ranked-context-title" tabindex="-1">Simulado encerrado com segurança</h1><p>Este simulado pertence a outro contexto de estudo.</p></div><button type="button" class="ds-button ds-button--primary" id="ranked-back-home">Voltar para Hoje</button></div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
  requestAnimationFrame(() => root.querySelector('#ranked-context-title')?.focus());
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const remaining = Math.floor(total % 60);
  return `${minutes} min ${String(remaining).padStart(2, '0')} s`;
}

function renderEmptyRankedState(root, navigate) {
  const empty = emptyState({
    title: 'Nenhum simulado ranqueado ativo',
    description: 'Os próximos desafios aparecerão aqui quando forem liberados.',
    action: '<button type="button" class="ds-button ds-button--primary" id="ranked-back-home">Voltar para Hoje</button>',
  }).replace('<h3>', '<h2 id="ranked-empty-title">').replace('</h3>', '</h2>');
  root.innerHTML = `<div class="ranked-shell">
    ${rankedHero({
      description: 'Enfrente a mesma prova, dentro da mesma janela e com as mesmas regras.',
      kiroText: 'Continue avançando no edital. O próximo desafio chegará no momento certo.',
    })}
    <section class="ranked-state ranked-state--empty" aria-labelledby="ranked-empty-title">${empty}</section>
  </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
}

function renderRankedLoadError(root, navigate, ctx, { result = false } = {}) {
  const title = result ? 'Não foi possível carregar o resultado.' : 'Não foi possível carregar os simulados.';
  root.innerHTML = `<div class="ranked-shell ranked-state ranked-state--error" aria-labelledby="ranked-load-error-title">
    <span class="ranked-state__mark" aria-hidden="true">!</span>
    <div><span class="ranked-kicker">CONEXÃO INTERROMPIDA</span><h1 id="ranked-load-error-title" tabindex="-1">${title}</h1><p>Seu contexto foi preservado. Tente novamente quando a conexão estiver estável.</p></div>
    <div class="ranked-state__actions"><button type="button" class="ds-button ds-button--primary" id="ranked-retry">Tentar novamente</button><button type="button" class="ds-button ds-button--ghost" id="ranked-back-home">Voltar para Hoje</button></div>
  </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-retry')?.addEventListener('click', () => renderRankedEvent(root, navigate, ctx));
  root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
  requestAnimationFrame(() => root.querySelector('#ranked-load-error-title')?.focus());
}

function renderCancelledEvent(root, event, navigate, ctx) {
  root.innerHTML = `<div class="ranked-shell ranked-state ranked-state--cancelled" aria-labelledby="ranked-cancelled-title">
    <span class="ranked-state__mark" aria-hidden="true">×</span>
    <div><span class="ranked-kicker">EVENTO ENCERRADO</span><h1 id="ranked-cancelled-title" tabindex="-1">Simulado cancelado</h1><p>Este evento não está mais disponível.</p><strong>${escapeHtml(event.title)}</strong></div>
    <button type="button" class="ds-button ds-button--primary" id="ranked-back-events">Voltar para Simulados</button>
  </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-events')?.addEventListener('click', () => {
    ctx.rankedEventId = null;
    renderRankedEvent(root, navigate, ctx);
  });
  requestAnimationFrame(() => root.querySelector('#ranked-cancelled-title')?.focus());
}

function renderPreparation(root, event, navigate, ctx) {
  const status = rankedStatus(event);
  if (status === 'cancelled') {
    renderCancelledEvent(root, event, navigate, ctx);
    return;
  }
  const action = status === 'live'
    ? 'Iniciar tentativa'
    : status === 'registration_open'
      ? 'Confirmar inscrição'
      : null;
  root.innerHTML = `<div class="ranked-shell ranked-preparation" aria-labelledby="ranked-preparation-title">
    <header class="ranked-preparation__hero">
      <div><span class="ranked-event-status ranked-event-status--${escapeAttr(status)}">${escapeHtml(rankedStatusLabel(status))}</span><span class="ranked-kicker">PREPARAÇÃO DO DESAFIO</span><h1 id="ranked-preparation-title">${escapeHtml(event.title)}</h1><p>${escapeHtml(event.description || 'Revise as condições antes de continuar.')}</p></div>
      ${kiroMessage('A prova começa somente após sua confirmação. Leia as regras e entre quando estiver pronto.')}
    </header>
    <section class="ranked-preparation__facts" aria-labelledby="ranked-preparation-facts-title">
      <div class="ranked-section-heading"><span>CONDIÇÕES OFICIAIS</span><h2 id="ranked-preparation-facts-title">Antes de começar</h2></div>
      <dl>
        <div><dt>Janela</dt><dd>${escapeHtml(dateTime(event.starts_at))}<small>até ${escapeHtml(dateTime(event.ends_at))}</small></dd></div>
        <div><dt>Duração</dt><dd>${Number(event.duration_minutes)} min<small>limitada pelo encerramento</small></dd></div>
        <div><dt>Questões</dt><dd>${Number(event.question_count)}<small>mesmo conjunto oficial</small></dd></div>
        <div><dt>Pontuação</dt><dd>${escapeHtml(rankedScoringLabel(event.scoring_mode))}<small>sem bônus inventado</small></dd></div>
        <div><dt>Classificação</dt><dd>${escapeHtml(rankedRankingReleaseLabel(event.ranking_release_mode))}<small>somente submissões oficiais</small></dd></div>
        <div><dt>Tentativa</dt><dd>Única<small>respostas congeladas após entrega</small></dd></div>
      </dl>
    </section>
    <section class="ranked-preparation__rules" aria-labelledby="ranked-rules-title">
      <div class="ranked-section-heading"><span>LEIA COM ATENÇÃO</span><h2 id="ranked-rules-title">Regras da tentativa</h2></div>
      <ul><li>Após iniciar, o cronômetro seguirá até o menor limite entre a duração da tentativa e o encerramento do evento.</li><li>O resultado e o gabarito aparecem somente após uma entrega válida e conforme a liberação oficial.</li><li>Após a entrega, suas respostas não poderão ser alteradas.</li></ul>
      <div class="ranked-preparation__warning" role="note"><strong>Respostas locais durante a prova</strong><p>As respostas ainda não entregues permanecem apenas nesta tela. Recarregar ou fechar o aplicativo pode descartá-las.</p></div>
    </section>
    <div id="ranked-preparation-error" class="ranked-functional-alert hidden" role="alert" tabindex="-1"></div>
    <div class="ranked-preparation__actions">
      <button type="button" class="ds-button ds-button--ghost" id="ranked-back-events">Voltar aos eventos</button>
      ${action ? `<button type="button" class="ds-button ds-button--primary" id="ranked-preparation-action" aria-busy="false">${action}</button>` : `<p class="ranked-preparation__availability">Este simulado estará disponível em ${escapeHtml(dateTime(event.starts_at))}.</p>`}
    </div>
  </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-events')?.addEventListener('click', () => {
    ctx.rankedEventId = null;
    renderRankedEvent(root, navigate, ctx);
  });
  root.querySelector('#ranked-preparation-action')?.addEventListener('click', async (clickEvent) => {
    const button = clickEvent.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = status === 'live' ? 'Preparando simulado…' : 'Confirmando inscrição…';
    const startScope = currentScope(ctx);
    try {
      if (status === 'registration_open') {
        await rankedEventService.register(event.id);
        if (currentScope(ctx).scopeKey !== startScope.scopeKey) return;
        toast('Inscrição confirmada.');
        ctx.rankedEventId = null;
        await renderRankedEvent(root, navigate, ctx);
        return;
      }
      const started = await rankedEventService.start(event.id);
      if (currentScope(ctx).scopeKey !== startScope.scopeKey) return;
      if (started.completed || ['submitted', 'timed_out'].includes(started.attempt?.status)) {
        ctx.rankedEventResult = { ...started.attempt, eventId: event.id, eventVersion: started.eventVersion || rankedEventVersion(event) };
        await renderRankedEvent(root, navigate, ctx);
        return;
      }
      const session = buildSession(event, started, ctx);
      const validation = validateRankedSession(session, { event, ...currentScope(ctx) });
      if (!validation.valid) throw new Error('INVALID_ATTEMPT');
      ctx.rankedEventSession = session;
      renderAttempt(root, event, session, navigate, ctx);
    } catch {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      button.textContent = action;
      const alert = root.querySelector('#ranked-preparation-error');
      alert.innerHTML = `<strong>${status === 'live' ? 'Não foi possível preparar a tentativa.' : 'Não foi possível confirmar sua inscrição.'}</strong><p>Seu contexto foi preservado. Tente novamente.</p>`;
      alert.classList.remove('hidden');
      requestAnimationFrame(() => alert.focus());
    }
  });
}

function renderEventList(root, events, navigate, ctx) {
  const groups = rankedEventGroups(events);
  root.innerHTML = `<div class="ranked-shell">
    ${rankedHero({ description: 'Enfrente a mesma prova, dentro da mesma janela e com as mesmas regras.' })}
    ${groups.featured ? `<section class="ranked-event-list ranked-event-list--featured" aria-labelledby="ranked-featured-title"><div class="ranked-section-heading"><span>DESAFIO PRINCIPAL</span><h2 id="ranked-featured-title">Próximo confronto</h2></div>${eventCard(groups.featured, { featured: true })}</section>` : ''}
    ${groups.upcoming.length ? `<section class="ranked-event-list" aria-labelledby="ranked-upcoming-title"><div class="ranked-section-heading"><span>AGENDA</span><h2 id="ranked-upcoming-title">Próximos eventos</h2></div><div class="ranked-event-grid">${groups.upcoming.map((event) => eventCard(event)).join('')}</div></section>` : ''}
    ${groups.recent.length ? `<section class="ranked-event-list" aria-labelledby="ranked-recent-title"><div class="ranked-section-heading"><span>HISTÓRICO RECENTE</span><h2 id="ranked-recent-title">Eventos encerrados</h2></div><div class="ranked-event-grid">${groups.recent.map((event) => eventCard(event)).join('')}</div></section>` : ''}
    <button type="button" class="ds-button ds-button--ghost ranked-back-home" id="ranked-back-home">Voltar para Hoje</button>
  </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
  root.querySelectorAll('[data-ranked-event]').forEach((button) => {
    button.addEventListener('click', () => {
      const event = events.find(({ id }) => id === button.dataset.rankedEvent);
      if (!event) return;
      ctx.rankedEventId = event.id;
      if (rankedStatus(event) === 'cancelled') renderCancelledEvent(root, event, navigate, ctx);
      else renderRankedEvent(root, navigate, ctx);
    });
  });
}

export async function renderRankedEvent(root, navigate, ctx) {
  ctx.clearRankedTimer?.();
  const renderScope = currentScope(ctx);
  root.innerHTML = `<div class="ranked-shell ranked-loading" aria-labelledby="ranked-loading-title"><h1 id="ranked-loading-title">Carregando simulados…</h1>${loadingState({ label: 'Carregando simulados…' })}</div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  let events = [];
  try {
    ({ events = [] } = await rankedEventService.listEvents(renderScope.contestId));
  } catch {
    renderRankedLoadError(root, navigate, ctx);
    return;
  }
  if (currentScope(ctx).scopeKey !== renderScope.scopeKey) return;
  const validEvents = events.filter((event) => validateRankedEvent(event, { contestId: renderScope.contestId }).valid);
  const sessionEvent = ctx.rankedEventSession
    ? validEvents.find(({ id }) => id === ctx.rankedEventSession.eventId)
    : null;
  const selected = sessionEvent || validEvents.find(({ id }) => id === ctx.rankedEventId) || null;
  if (!validEvents.length) return renderEmptyRankedState(root, navigate);
  if ((ctx.rankedEventSession || ctx.rankedEventId) && !selected) return renderContextError(root, navigate);
  if (ctx.rankedEventSession) {
    const session = ctx.rankedEventSession;
    const matchesSelected = session.eventId === selected.id
      && session.eventVersion === rankedEventVersion(selected);
    if (!matchesSelected) {
      ctx.rankedEventSession = null;
      renderContextError(root, navigate);
      return;
    }
    renderAttempt(root, selected, session, navigate, ctx);
    return;
  }
  const status = selected ? rankedStatus(selected) : null;
  const scopedResult = ctx.rankedEventResult
    && selected
    && (!ctx.rankedEventResult.eventId || ctx.rankedEventResult.eventId === selected.id)
    && (!ctx.rankedEventResult.eventVersion || ctx.rankedEventResult.eventVersion === rankedEventVersion(selected))
    ? ctx.rankedEventResult
    : null;
  if (selected && (scopedResult || status === 'finished')) {
    let ranking = [];
    let result = { attempt: scopedResult, questions: [] };
    try { ranking = (await rankedEventService.getRanking(selected.id)).ranking || []; }
    catch { ranking = []; }
    if (status === 'finished') {
      try { result = await rankedEventService.getResult(selected.id); }
      catch {
        if (!scopedResult) {
          renderRankedLoadError(root, navigate, ctx, { result: true });
          return;
        }
      }
    }
    if (currentScope(ctx).scopeKey !== renderScope.scopeKey) return;
    renderResult(root, selected, result.attempt, ranking, result.questions || [], ctx.rankedCompletionNotice);
    ctx.rankedCompletionNotice = null;
    root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
    requestAnimationFrame(() => root.querySelector('#ranked-result-title')?.focus());
    return;
  }
  if (selected) return renderPreparation(root, selected, navigate, ctx);
  renderEventList(root, validEvents, navigate, ctx);
}
