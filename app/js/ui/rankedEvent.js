import { rankedEventService } from '../services/rankedEventService.js';
import { escapeHtml, toast } from './helpers.js';
import { mountPageContainer } from './appShell.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { STORES } from '../core/types.js';
import { createReviewItem } from '../core/reviewQueue.js';
import { emptyState } from './components.js';

const STATUS_LABELS = Object.freeze({
  scheduled: 'Em breve',
  registration_open: 'Inscrições abertas',
  live: 'Ao vivo',
  finished: 'Encerrado',
  cancelled: 'Cancelado',
});

function dateTime(value) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
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
      <span class="ranked-event-card__status ranked-event-card__status--${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
      <h2>${escapeHtml(event.title)}</h2>
      <p>${escapeHtml(event.description)}</p>
      <dl>
        <div><dt>Início</dt><dd>${escapeHtml(dateTime(event.starts_at))}</dd></div>
        <div><dt>Duração</dt><dd>${Number(event.duration_minutes)} min</dd></div>
        <div><dt>Questões</dt><dd>${Number(event.question_count)}</dd></div>
      </dl>
      <button type="button" class="btn btn-primary" data-ranked-event="${escapeHtml(event.id)}" data-ranked-status="${escapeHtml(status)}">${escapeHtml(action)}</button>
    </article>`;
}

function questionText(question) {
  return question.payload?.statement || question.payload?.enunciado || question.payload?.texto || 'Questão';
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

function renderAttempt(root, event, started, navigate, ctx) {
  const questions = started.questions || [];
  const deadline = Math.min(
    new Date(event.ends_at).getTime(),
    new Date(started.attempt.started_at).getTime() + Number(event.duration_minutes) * 60000,
  );
  root.innerHTML = `
    <div class="ranked-event-page">
      <header class="ranked-event-hero">
        <span>EVENTO RANQUEADO</span>
        <h1>${escapeHtml(event.title)}</h1>
        <p id="ranked-timer" role="timer" aria-live="polite"></p>
      </header>
      <form id="ranked-attempt-form" class="ranked-attempt">
        ${questions.map((question, index) => `
          <fieldset class="ranked-question">
            <legend><strong>${index + 1}.</strong> ${escapeHtml(questionText(question))}</legend>
            ${questionOptions(question).map((option) => `<label><input type="radio" name="answer-${escapeHtml(question.id)}" value="${escapeHtml(option.value)}"> ${escapeHtml(option.label)}</label>`).join('')}
            <label><input type="radio" name="answer-${escapeHtml(question.id)}" value=""> Em branco</label>
          </fieldset>`).join('')}
        <button type="submit" class="btn btn-primary">Enviar respostas</button>
      </form>
    </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });

  let submitting = false;
  const submit = async () => {
    if (submitting) return;
    submitting = true;
    const answers = questions.map((question) => ({
      questionId: question.id,
      answer: root.querySelector(`input[name="answer-${CSS.escape(question.id)}"]:checked`)?.value || '',
    }));
    try {
      const result = await rankedEventService.submit(event.id, answers);
      ctx.rankedEventResult = result.attempt;
      await renderRankedEvent(root, navigate, ctx);
    } catch (error) {
      submitting = false;
      toast(error.message);
    }
  };
  root.querySelector('#ranked-attempt-form')?.addEventListener('submit', (submitEvent) => {
    submitEvent.preventDefault();
    submit();
  });
  const timer = root.querySelector('#ranked-timer');
  const tick = () => {
    const remaining = Math.max(0, deadline - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    timer.textContent = `Tempo restante: ${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    if (!remaining) submit();
  };
  tick();
  const interval = globalThis.setInterval(tick, 1000);
  root.addEventListener('DOMNodeRemoved', () => globalThis.clearInterval(interval), { once: true });
}

function wrongQuestions(attempt, questions) {
  const answers = new Map((attempt?.answers || []).map((row) => [String(row.questionId), row.answer]));
  return questions.filter((question) => {
    const answer = answers.get(String(question.id));
    return answer && answer !== question.correctAnswer;
  });
}

function renderResult(root, event, attempt, ranking = [], questions = []) {
  const wrong = wrongQuestions(attempt, questions);
  root.innerHTML = `
    <div class="ranked-event-page">
      <header class="ranked-event-hero">
        <span>RESULTADO</span>
        <h1>${escapeHtml(event.title)}</h1>
      </header>
      ${attempt ? `
        <section class="ranked-result" aria-label="Seu resultado">
          <div><small>Pontuação</small><strong>${Number(attempt.score)}</strong></div>
          <div><small>Acertos</small><strong>${Number(attempt.correct_count)}</strong></div>
          <div><small>Erros</small><strong>${Number(attempt.incorrect_count)}</strong></div>
          <div><small>Em branco</small><strong>${Number(attempt.blank_count)}</strong></div>
        </section>` : ''}
      <section class="ranked-ranking">
        <h2>Classificação</h2>
        <ol>${ranking.map((row) => `
          <li><strong>${Number(row.position)}º ${escapeHtml(row.displayName)}</strong><span>${Number(row.score)} pontos</span></li>`).join('') || '<li>Ranking ainda sem participantes.</li>'}</ol>
      </section>
      ${questions.length ? `<section class="ranked-ranking"><h2>Explicações</h2>${questions.map((question, index) => `<details><summary>Questão ${index + 1}</summary><p>${escapeHtml(question.explanation || 'Explicação indisponível.')}</p><p><strong>Resposta:</strong> ${escapeHtml(question.correctAnswer)}</p></details>`).join('')}</section>` : ''}
      ${wrong.length ? '<button type="button" class="btn" id="ranked-add-review">Adicionar questões erradas à revisão</button>' : ''}
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

export async function renderRankedEvent(root, navigate, ctx) {
  const { events = [] } = await rankedEventService.listEvents(ctx.contest.id);
  const selected = events.find(({ id }) => id === ctx.rankedEventId) || events[0] || null;
  if (!selected) {
    root.innerHTML = `<div class="ranked-event-page"><header class="ranked-event-hero"><span>ARENA DETONA</span><h1>Simulados</h1></header>${emptyState({
      title: 'Nenhum simulado ranqueado ativo',
      description: 'Os próximos desafios aparecerão aqui quando forem liberados.',
      action: '<button type="button" class="ds-button ds-button--primary" id="ranked-back-home">Voltar para Hoje</button>',
    })}</div>`;
    mountPageContainer(root, { variant: 'ranked-event' });
    root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
    return;
  }
  const status = selected.effectiveStatus || selected.status;
  if (ctx.rankedEventResult || status === 'finished') {
    let ranking = [];
    let result = { attempt: ctx.rankedEventResult || null, questions: [] };
    try {
      ranking = (await rankedEventService.getRanking(selected.id)).ranking || [];
    } catch {
      ranking = [];
    }
    if (status === 'finished') {
      try {
        result = await rankedEventService.getResult(selected.id);
      } catch {
        result = { attempt: ctx.rankedEventResult || null, questions: [] };
      }
    }
    renderResult(root, selected, result.attempt, ranking, result.questions || []);
    return;
  }
  root.innerHTML = `
    <div class="ranked-event-page">
      <header class="ranked-event-hero"><span>ARENA DETONA</span><h1>Eventos ranqueados</h1></header>
      <div class="ranked-event-grid">${events.map(eventCard).join('')}</div>
      <button type="button" class="btn" id="ranked-back-home">Voltar para Hoje</button>
    </div>`;
  mountPageContainer(root, { variant: 'ranked-event' });
  root.querySelector('#ranked-back-home')?.addEventListener('click', () => navigate('home'));
  root.querySelectorAll('[data-ranked-event]').forEach((button) => {
    button.addEventListener('click', async () => {
      const event = events.find(({ id }) => id === button.dataset.rankedEvent);
      if (!event) return;
      button.disabled = true;
      try {
        if (button.dataset.rankedStatus === 'registration_open') {
          await rankedEventService.register(event.id);
          toast('Inscrição confirmada.');
          await renderRankedEvent(root, navigate, ctx);
        } else if (button.dataset.rankedStatus === 'live') {
          const started = await rankedEventService.start(event.id);
          renderAttempt(root, event, started, navigate, ctx);
        } else if (button.dataset.rankedStatus === 'finished') {
          ctx.rankedEventId = event.id;
          await renderRankedEvent(root, navigate, ctx);
        } else {
          toast(`O evento começa em ${dateTime(event.starts_at)}.`);
        }
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    });
  });
}
