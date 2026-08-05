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
import { emptyState } from './components.js';

const STATUS_LABELS = Object.freeze({
  scheduled: 'Em breve',
  registration_open: 'Inscrições abertas',
  live: 'Ao vivo',
  finished: 'Encerrado',
  cancelled: 'Cancelado',
});

function dateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'Data indisponível';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function eventCard(event) {
  const status = event.effectiveStatus || event.status;
  const action = status === 'registration_open'
    ? 'Inscrever-se'
    : status === 'live'
      ? 'Entrar no simulado'
      : status === 'finished'
        ? 'Ver resultado'
        : 'Ver detalhes';
  return `
    <article class="ranked-event-card">
      <span class="ranked-event-card__status ranked-event-card__status--${escapeAttr(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
      <h2>${escapeHtml(event.title)}</h2>
      <p>${escapeHtml(event.description)}</p>
      <dl>
        <div><dt>Início</dt><dd>${escapeHtml(dateTime(event.starts_at))}</dd></div>
        <div><dt>Duração</dt><dd>${Number(event.duration_minutes)} min</dd></div>
        <div><dt>Questões</dt><dd>${Number(event.question_count)}</dd></div>
      </dl>
      <button type="button" class="btn btn-primary" data-ranked-event="${escapeAttr(event.id)}" data-ranked-status="${escapeAttr(status)}">${escapeHtml(action)}</button>
    </article>`;
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
    <div class="ranked-event-page ranked-attempt" aria-labelledby="ranked-attempt-title">
      <header class="ranked-event-hero ranked-attempt__header">
        <span>SIMULADO RANQUEADO</span>
        <h1 id="ranked-attempt-title">${escapeHtml(event.title)}</h1>
        <p id="ranked-timer" role="timer" aria-live="off" aria-label="Tempo restante"></p>
        <button type="button" class="btn btn-ghost" id="ranked-exit">Encerrar simulado</button>
      </header>
      <nav class="ranked-question-map" aria-label="Mapa de questões"></nav>
      <form id="ranked-attempt-form" novalidate>
        <div id="ranked-question-slot"></div>
        <div id="ranked-attempt-error" class="ranked-functional-alert hidden" role="alert" tabindex="-1"></div>
        <div class="ranked-attempt__navigation">
          <button type="button" class="btn btn-ghost" id="ranked-previous">Questão anterior</button>
          <button type="button" class="btn btn-ghost" id="ranked-next">Próxima questão</button>
          <button type="submit" class="btn btn-primary" id="ranked-submit" aria-busy="false">Entregar simulado</button>
        </div>
      </form>
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
        <legend id="ranked-question-title" tabindex="-1"><strong>Questão ${session.currentIndex + 1} de ${session.questions.length}</strong>${escapeHtml(questionText(question))}</legend>
        <div class="ranked-question__answers" role="radiogroup" aria-label="Alternativas da questão ${session.currentIndex + 1}">
          ${questionOptions(question).map((option) => `<label class="ranked-answer${selected === option.value ? ' is-selected' : ''}"><input type="radio" name="ranked-answer" value="${escapeAttr(option.value)}" ${selected === option.value ? 'checked' : ''}> <span>${escapeHtml(option.label)}</span></label>`).join('')}
          <label class="ranked-answer${selected === '' && session.answers[String(question.id)] ? ' is-selected' : ''}"><input type="radio" name="ranked-answer" value="" ${selected === '' && session.answers[String(question.id)] ? 'checked' : ''}> <span>Deixar em branco</span></label>
        </div>
        <label class="ranked-review-mark"><input type="checkbox" id="ranked-mark-review" ${session.answers[String(question.id)]?.marked ? 'checked' : ''}> Marcar para revisar antes da entrega</label>
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
      const selected = index === session.currentIndex;
      const answerState = answered.has(questionId) ? 'respondida' : 'não respondida';
      const marked = Boolean(session.answers[questionId]?.marked);
      return `<button type="button" class="ranked-question-map__item${selected ? ' is-current' : ''}${answered.has(questionId) ? ' is-answered' : ''}${marked ? ' is-marked' : ''}" data-ranked-question="${index}" aria-current="${selected ? 'step' : 'false'}" aria-label="Questão ${index + 1}, ${answerState}${marked ? ', marcada para revisar' : ''}">${index + 1}</button>`;
    }).join('');
    root.querySelectorAll('[data-ranked-question]').forEach((button) => button.addEventListener('click', () => {
      session.currentIndex = Number(button.dataset.rankedQuestion);
      renderQuestion();
    }));
    root.querySelector('#ranked-previous').disabled = session.currentIndex === 0 || session.expired || session.submitting;
    root.querySelector('#ranked-next').disabled = session.currentIndex === session.questions.length - 1 || session.expired || session.submitting;
    root.querySelector('#ranked-submit').disabled = session.expired || session.submitting;
  };

  const showError = (message) => {
    const alert = root.querySelector('#ranked-attempt-error');
    alert.textContent = message;
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
    submitButton.textContent = timedOut ? 'Entregando respostas salvas…' : 'Entregando…';
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
    } catch (error) {
      session.submitting = false;
      submitButton.setAttribute('aria-busy', 'false');
      submitButton.textContent = session.expired ? 'Tentar entrega novamente' : 'Entregar simulado';
      submitButton.disabled = false;
      showError(session.expired
        ? 'A entrega automática não foi concluída. Suas respostas permanecem preservadas nesta tela; tente novamente.'
        : error.message);
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
    timer.textContent = `Tempo restante: ${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    if (totalSeconds <= 300 && totalSeconds > 60 && !session.alerts.fiveMinutes) {
      session.alerts.fiveMinutes = true;
      status.textContent = 'Faltam cinco minutos para o encerramento.';
    }
    if (totalSeconds <= 60 && totalSeconds > 0 && !session.alerts.oneMinute) {
      session.alerts.oneMinute = true;
      status.textContent = 'Falta um minuto para o encerramento.';
    }
    if (remaining === 0) {
      clearTimer();
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
  root.innerHTML = `
    <div class="ranked-event-page" aria-labelledby="ranked-result-title">
      <header class="ranked-event-hero">
        <span>RESULTADO PERSISTIDO</span>
        <h1 id="ranked-result-title" tabindex="-1">${escapeHtml(event.title)}</h1>
        ${notice ? `<p class="ranked-functional-notice" role="status">${escapeHtml(notice)}</p>` : ''}
      </header>
      ${completed && invariant.valid ? `
        <section class="ranked-result" aria-label="Seu resultado">
          <div><small>Pontuação</small><strong>${Number(attempt.score)}</strong></div>
          <div><small>Acertos</small><strong>${invariant.correct}</strong></div>
          <div><small>Erros</small><strong>${invariant.errors}</strong></div>
          <div><small>Em branco</small><strong>${invariant.unanswered}</strong></div>
          <div><small>Percentual</small><strong>${Number(attempt.accuracy || 0).toLocaleString('pt-BR')}%</strong></div>
          <div><small>Tempo</small><strong>${formatDuration(attempt.elapsed_seconds)}</strong></div>
        </section>` : `<div class="ranked-functional-alert" role="alert">Não foi possível validar integralmente este resultado.</div>`}
      <section class="ranked-ranking" aria-labelledby="ranked-ranking-title">
        <h2 id="ranked-ranking-title">Classificação</h2>
        ${ranking.length ? `<ol>${ranking.map((row) => `
          <li><strong>${Number(row.position)}º ${escapeHtml(row.displayName)}</strong><span>${Number(row.score)} pontos</span></li>`).join('')}</ol>` : '<p>Ranking ainda indisponível. A classificação entre participantes aparece somente quando o evento libera submissões oficiais.</p>'}
      </section>
      ${questions.length ? `<section class="ranked-ranking"><h2>Explicações liberadas</h2>${questions.map((question, index) => `<details><summary>Questão ${index + 1}</summary><p>${escapeHtml(question.explanation || 'Explicação detalhada ainda não disponível.')}</p><p><strong>Resposta:</strong> ${escapeHtml(question.correctAnswer)}</p></details>`).join('')}</section>` : '<p class="ranked-functional-notice">O gabarito permanece protegido até a liberação oficial do resultado.</p>'}
      ${wrong.length ? '<button type="button" class="btn" id="ranked-add-review">Adicionar questões erradas à revisão</button>' : ''}
      <button type="button" class="btn btn-primary" id="ranked-back-home">Voltar para Hoje</button>
    </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-add-review')?.addEventListener('click', async (clickEvent) => {
    clickEvent.currentTarget.disabled = true;
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
  });
}

function renderContextError(root, navigate) {
  root.innerHTML = `<div class="ranked-event-page ranked-functional-state" aria-labelledby="ranked-context-title"><h1 id="ranked-context-title">Simulado encerrado com segurança</h1><p>Este simulado pertence a outro contexto de estudo e foi encerrado com segurança.</p><button type="button" class="btn btn-primary" id="ranked-back-home">Voltar para Hoje</button></div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const remaining = Math.floor(total % 60);
  return `${minutes} min ${String(remaining).padStart(2, '0')} s`;
}

export async function renderRankedEvent(root, navigate, ctx) {
  ctx.clearRankedTimer?.();
  const renderScope = currentScope(ctx);
  const { events = [] } = await rankedEventService.listEvents(renderScope.contestId);
  if (currentScope(ctx).scopeKey !== renderScope.scopeKey) return;
  const validEvents = events.filter((event) => validateRankedEvent(event, { contestId: renderScope.contestId }).valid);
  const selected = validEvents.find(({ id }) => id === ctx.rankedEventId) || validEvents[0] || null;
  if (!selected) {
    root.innerHTML = `<div class="ranked-event-page"><header class="ranked-event-hero"><span>SIMULADOS</span><h1>Simulados ranqueados</h1></header>${emptyState({
      title: 'Nenhum simulado ranqueado ativo',
      description: 'Os próximos desafios aparecerão aqui quando forem liberados.',
      action: '<button type="button" class="ds-button ds-button--primary" id="ranked-back-home">Voltar para Hoje</button>',
    })}</div>`;
    mountPageContainer(root, { variant: 'ranked-event' });
    root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
    return;
  }
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
  const status = selected.effectiveStatus || selected.status;
  const scopedResult = ctx.rankedEventResult
    && (!ctx.rankedEventResult.eventId || ctx.rankedEventResult.eventId === selected.id)
    && (!ctx.rankedEventResult.eventVersion || ctx.rankedEventResult.eventVersion === rankedEventVersion(selected))
    ? ctx.rankedEventResult
    : null;
  if (scopedResult || status === 'finished') {
    let ranking = [];
    let result = { attempt: scopedResult, questions: [] };
    try { ranking = (await rankedEventService.getRanking(selected.id)).ranking || []; }
    catch { ranking = []; }
    if (status === 'finished') {
      try { result = await rankedEventService.getResult(selected.id); }
      catch { result = { attempt: scopedResult, questions: [] }; }
    }
    if (currentScope(ctx).scopeKey !== renderScope.scopeKey) return;
    renderResult(root, selected, result.attempt, ranking, result.questions || [], ctx.rankedCompletionNotice);
    ctx.rankedCompletionNotice = null;
    root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
    requestAnimationFrame(() => root.querySelector('#ranked-result-title')?.focus());
    return;
  }
  root.innerHTML = `
    <div class="ranked-event-page">
      <header class="ranked-event-hero"><span>ARENA DETONA</span><h1>Simulados ranqueados</h1><p>Eventos oficiais usam a mesma prova congelada e a classificação é liberada somente conforme as regras do evento.</p></header>
      <div class="ranked-event-grid">${validEvents.map(eventCard).join('')}</div>
      <button type="button" class="btn" id="ranked-back-home">Voltar para Hoje</button>
    </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
  root.querySelectorAll('[data-ranked-event]').forEach((button) => {
    button.addEventListener('click', async () => {
      const event = validEvents.find(({ id }) => id === button.dataset.rankedEvent);
      if (!event || button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        if (button.dataset.rankedStatus === 'registration_open') {
          await rankedEventService.register(event.id);
          toast('Inscrição confirmada.');
          await renderRankedEvent(root, navigate, ctx);
        } else if (button.dataset.rankedStatus === 'live') {
          const startScope = currentScope(ctx);
          const started = await rankedEventService.start(event.id);
          if (currentScope(ctx).scopeKey !== startScope.scopeKey) return;
          if (started.completed || ['submitted', 'timed_out'].includes(started.attempt?.status)) {
            ctx.rankedEventResult = { ...started.attempt, eventId: event.id, eventVersion: started.eventVersion || rankedEventVersion(event) };
            await renderRankedEvent(root, navigate, ctx);
            return;
          }
          const session = buildSession(event, started, ctx);
          const validation = validateRankedSession(session, { event, ...currentScope(ctx) });
          if (!validation.valid) throw new Error('Não foi possível validar esta tentativa.');
          ctx.rankedEventSession = session;
          ctx.rankedEventId = event.id;
          renderAttempt(root, event, session, navigate, ctx);
        } else if (button.dataset.rankedStatus === 'finished') {
          ctx.rankedEventId = event.id;
          await renderRankedEvent(root, navigate, ctx);
        } else {
          toast(`O evento começa em ${dateTime(event.starts_at)}.`);
        }
      } catch (error) {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        toast(error.message);
      }
    });
  });
}
