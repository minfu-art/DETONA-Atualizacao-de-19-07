export const RANKED_EVENT_ACTIONS = Object.freeze([
  'list_events',
  'get_home_event',
  'register',
  'start',
  'submit',
  'get_result',
  'get_ranking',
  'list_admin_events',
  'save_draft',
  'publish_event',
  'cancel_event',
  'list_participants',
]);

export const ADMIN_EVENT_ACTIONS = Object.freeze([
  'list_admin_events',
  'save_draft',
  'publish_event',
  'cancel_event',
  'list_participants',
]);

const EVENT_STATUSES = new Set(['draft', 'scheduled', 'registration_open', 'live', 'finished', 'cancelled']);
const SCORING_MODES = new Set(['simple', 'cebraspe']);
const RANKING_MODES = new Set(['immediate', 'after_event']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

function cleanText(value, label, max) {
  const clean = String(value || '').trim();
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/u.test(clean)) {
    throw new RankedEventError(400, 'INVALID_INPUT', `${label} inválido.`);
  }
  return clean;
}

function isoDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new RankedEventError(400, 'INVALID_INPUT', `${label} inválido.`);
  }
  return date.toISOString();
}

function integer(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new RankedEventError(400, 'INVALID_INPUT', `${label} inválido.`);
  }
  return number;
}

function submittedAnswer(value) {
  const answer = String(value || '').trim().toUpperCase();
  if (!/^[A-E]?$/.test(answer)) {
    throw new RankedEventError(400, 'INVALID_ANSWERS', 'Respostas inválidas.');
  }
  return answer;
}

export class RankedEventError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'RankedEventError';
    this.status = status;
    this.code = code;
  }
}

export function effectiveEventStatus(event, now = new Date()) {
  if (!event || event.status === 'cancelled' || event.status === 'draft') return event?.status || null;
  const current = new Date(now).getTime();
  const starts = new Date(event.starts_at).getTime();
  const ends = new Date(event.ends_at).getTime();
  const registrationStarts = new Date(event.registration_starts_at).getTime();
  const registrationEnds = new Date(event.registration_ends_at).getTime();
  if (current >= ends) return 'finished';
  if (current >= starts) return 'live';
  if (current >= registrationStarts && current <= registrationEnds) return 'registration_open';
  return 'scheduled';
}

export function rankingIsReleased(event, now = new Date()) {
  if (!event || event.status === 'cancelled' || event.status === 'draft') return false;
  if (event.ranking_release_mode === 'immediate') return effectiveEventStatus(event, now) === 'live'
    || effectiveEventStatus(event, now) === 'finished';
  return effectiveEventStatus(event, now) === 'finished';
}

export function selectHomeRankedEvent(events = [], now = new Date()) {
  const current = new Date(now).getTime();
  const candidates = events.map((event) => ({
    event,
    effectiveStatus: effectiveEventStatus(event, now),
  }));
  const live = candidates.find(({ effectiveStatus }) => effectiveStatus === 'live');
  if (live) return live;
  const upcoming = candidates
    .filter(({ event, effectiveStatus }) => (
      ['scheduled', 'registration_open'].includes(effectiveStatus)
      && new Date(event.starts_at).getTime() >= current
      && new Date(event.starts_at).getTime() - current <= 48 * 60 * 60 * 1000
    ))
    .sort((a, b) => new Date(a.event.starts_at) - new Date(b.event.starts_at))[0];
  if (upcoming) return upcoming;
  return candidates
    .filter(({ event, effectiveStatus }) => (
      effectiveStatus === 'finished'
      && current - new Date(event.ends_at).getTime()
        <= Number(event.result_display_hours || 24) * 60 * 60 * 1000
    ))
    .sort((a, b) => new Date(b.event.ends_at) - new Date(a.event.ends_at))[0] || null;
}

function normalizeExpectedAnswer(payload = {}) {
  const value = payload.correct_answer
    ?? payload.correctAnswer
    ?? payload.answer
    ?? payload.gabarito
    ?? payload.resposta
    ?? payload.respostaCorreta
    ?? payload.correct_option;
  if (typeof value === 'boolean') return value ? 'C' : 'E';
  const normalized = String(value ?? '').trim().toUpperCase();
  if (['TRUE', 'CERTO', 'C'].includes(normalized)) return 'C';
  if (['FALSE', 'ERRADO', 'E'].includes(normalized)) return 'E';
  return normalized;
}

export function scoreRankedAnswers(questions = [], answers = [], scoringMode = 'simple') {
  if (!SCORING_MODES.has(scoringMode)) throw new TypeError('Modo de pontuação inválido.');
  const answerByQuestion = new Map(
    answers.map((answer) => [String(answer.questionId || answer.question_id), String(answer.answer || '').trim().toUpperCase()]),
  );
  let correct = 0;
  let incorrect = 0;
  let blank = 0;
  for (const question of questions) {
    const id = String(question.question_id || question.id);
    const answer = answerByQuestion.get(id);
    if (!answer) blank += 1;
    else if (answer === normalizeExpectedAnswer(question.payload || question)) correct += 1;
    else incorrect += 1;
  }
  const score = scoringMode === 'cebraspe' ? correct - incorrect : correct;
  const answered = correct + incorrect;
  const accuracy = answered ? Number(((correct / answered) * 100).toFixed(3)) : 0;
  return {
    correctCount: correct,
    incorrectCount: incorrect,
    blankCount: blank,
    score,
    accuracy,
  };
}

export function rankAttempts(attempts = []) {
  return [...attempts]
    .filter((attempt) => ['submitted', 'timed_out'].includes(attempt.status))
    .sort((a, b) => (
      Number(b.score) - Number(a.score)
      || Number(b.accuracy) - Number(a.accuracy)
      || Number(a.elapsed_seconds) - Number(b.elapsed_seconds)
      || new Date(a.submitted_at) - new Date(b.submitted_at)
    ))
    .map((attempt, index) => ({
      position: index + 1,
      displayName: attempt.display_name,
      avatar: attempt.avatar || null,
      score: Number(attempt.score),
      correctCount: Number(attempt.correct_count),
      incorrectCount: Number(attempt.incorrect_count),
      elapsedSeconds: Number(attempt.elapsed_seconds),
    }));
}

export function publicQuestion(question, { includeExplanation = false } = {}) {
  const payload = { ...(question.payload || question) };
  const explanation = payload.explanation ?? payload.explicacao ?? payload.comentario ?? null;
  for (const key of [
    'correct_answer', 'correctAnswer', 'answer', 'gabarito', 'resposta',
    'respostaCorreta', 'correct_option', 'resposta_correta',
    'explanation', 'explicacao', 'comentario', 'justification',
  ]) delete payload[key];
  return {
    id: String(question.question_id || question.id),
    orderIndex: Number(question.order_index || 0),
    payload,
    ...(includeExplanation ? { explanation } : {}),
  };
}

export function validateRankedEventPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RankedEventError(400, 'INVALID_JSON', 'Envie um objeto JSON válido.');
  }
  const action = String(input.action || '');
  if (!RANKED_EVENT_ACTIONS.includes(action)) {
    throw new RankedEventError(400, 'INVALID_ACTION', 'Ação de evento inválida.');
  }
  if (action === 'list_events' || action === 'get_home_event' || action === 'list_admin_events') {
    const contestId = String(input.contestId || '');
    if (!ID_PATTERN.test(contestId)) throw new RankedEventError(400, 'INVALID_CONTEST', 'Concurso inválido.');
    return { action, contestId };
  }
  if (action === 'save_draft') {
    const event = input.event || {};
    const contestId = String(event.contest_id || event.contestId || '');
    if (!ID_PATTERN.test(contestId)) throw new RankedEventError(400, 'INVALID_CONTEST', 'Concurso inválido.');
    const startsAt = isoDate(event.starts_at || event.startsAt, 'Início');
    const endsAt = isoDate(event.ends_at || event.endsAt, 'Encerramento');
    const registrationStartsAt = isoDate(
      event.registration_starts_at || event.registrationStartsAt,
      'Início das inscrições',
    );
    const registrationEndsAt = isoDate(
      event.registration_ends_at || event.registrationEndsAt,
      'Fim das inscrições',
    );
    if (!(registrationStartsAt < registrationEndsAt && registrationEndsAt <= startsAt && startsAt < endsAt)) {
      throw new RankedEventError(400, 'INVALID_PERIOD', 'Períodos do evento inválidos.');
    }
    const scoringMode = String(event.scoring_mode || event.scoringMode || '');
    const rankingReleaseMode = String(event.ranking_release_mode || event.rankingReleaseMode || '');
    if (!SCORING_MODES.has(scoringMode) || !RANKING_MODES.has(rankingReleaseMode)) {
      throw new RankedEventError(400, 'INVALID_MODE', 'Configuração do evento inválida.');
    }
    const id = event.id == null || event.id === '' ? null : String(event.id);
    if (id && !UUID_PATTERN.test(id)) throw new RankedEventError(400, 'INVALID_EVENT', 'Evento inválido.');
    return {
      action,
      event: {
        id,
        contest_id: contestId,
        title: cleanText(event.title, 'Título', 160),
        description: cleanText(event.description, 'Descrição', 1000),
        starts_at: startsAt,
        ends_at: endsAt,
        registration_starts_at: registrationStartsAt,
        registration_ends_at: registrationEndsAt,
        duration_minutes: integer(event.duration_minutes || event.durationMinutes, 'Duração', 1, 360),
        question_count: integer(event.question_count || event.questionCount, 'Quantidade de questões', 1, 200),
        scoring_mode: scoringMode,
        ranking_release_mode: rankingReleaseMode,
        result_display_hours: integer(event.result_display_hours || event.resultDisplayHours || 24, 'Prazo do resultado', 1, 168),
      },
    };
  }
  const eventId = String(input.eventId || '');
  if (!UUID_PATTERN.test(eventId)) throw new RankedEventError(400, 'INVALID_EVENT', 'Evento inválido.');
  if (action === 'submit') {
    if (!Array.isArray(input.answers) || input.answers.length > 200) {
      throw new RankedEventError(400, 'INVALID_ANSWERS', 'Respostas inválidas.');
    }
    return {
      action,
      eventId,
      answers: input.answers.map((answer) => ({
        questionId: cleanText(answer?.questionId, 'Questão', 160),
        answer: submittedAnswer(answer?.answer),
      })),
    };
  }
  return { action, eventId };
}

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match?.[1]) throw new RankedEventError(401, 'UNAUTHORIZED', 'Sessão ausente ou inválida.');
  return match[1];
}

export function createRankedEventHandler({
  resolveIdentity,
  repository,
  now = () => new Date(),
  corsHeaders = {},
}) {
  return async function rankedEventHandler(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }, corsHeaders);
    }
    try {
      const identity = await resolveIdentity(bearerToken(request));
      if (!identity?.userId) throw new RankedEventError(401, 'UNAUTHORIZED', 'Sessão ausente ou inválida.');
      let raw;
      try { raw = await request.json(); } catch {
        throw new RankedEventError(400, 'INVALID_JSON', 'Envie um objeto JSON válido.');
      }
      const payload = validateRankedEventPayload(raw);
      if (ADMIN_EVENT_ACTIONS.includes(payload.action)) {
        if (identity.role !== 'developer') {
          throw new RankedEventError(403, 'FORBIDDEN', 'Acesso restrito à equipe autorizada.');
        }
        if (payload.action === 'list_admin_events') {
          return jsonResponse(200, {
            events: await repository.listEvents(payload.contestId, { includeDrafts: true }),
          }, corsHeaders);
        }
        if (payload.action === 'save_draft') {
          return jsonResponse(200, { event: await repository.saveDraft(payload.event, identity.userId) }, corsHeaders);
        }
        if (payload.action === 'publish_event') {
          return jsonResponse(200, { event: await repository.publishEvent(payload.eventId, identity.userId, now()) }, corsHeaders);
        }
        if (payload.action === 'cancel_event') {
          return jsonResponse(200, { event: await repository.cancelEvent(payload.eventId, identity.userId, now()) }, corsHeaders);
        }
        return jsonResponse(200, {
          participants: await repository.listParticipants(payload.eventId),
        }, corsHeaders);
      }
      if (payload.action === 'list_events' || payload.action === 'get_home_event') {
        if (!(await repository.hasEntitlement(identity.userId, payload.contestId))) {
          throw new RankedEventError(403, 'ENTITLEMENT_REQUIRED', 'Acesso ao concurso não liberado.');
        }
        const events = await repository.listEvents(payload.contestId);
        if (payload.action === 'get_home_event') {
          return jsonResponse(200, { selected: selectHomeRankedEvent(events, now()) }, corsHeaders);
        }
        return jsonResponse(200, {
          events: events.map((event) => ({ ...event, effectiveStatus: effectiveEventStatus(event, now()) })),
        }, corsHeaders);
      }
      const event = await repository.getEvent(payload.eventId);
      if (!event) throw new RankedEventError(404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
      if (!(await repository.hasEntitlement(identity.userId, event.contest_id))) {
        throw new RankedEventError(403, 'ENTITLEMENT_REQUIRED', 'Acesso ao concurso não liberado.');
      }
      if (payload.action === 'register') {
        const current = now();
        if (current < new Date(event.registration_starts_at) || current > new Date(event.registration_ends_at)) {
          throw new RankedEventError(409, 'REGISTRATION_CLOSED', 'Inscrições encerradas.');
        }
        return jsonResponse(200, { attempt: await repository.register(event, identity) }, corsHeaders);
      }
      if (payload.action === 'start') {
        if (effectiveEventStatus(event, now()) !== 'live') {
          throw new RankedEventError(409, 'EVENT_NOT_LIVE', 'O evento ainda não está ao vivo.');
        }
        const attempt = await repository.start(event, identity.userId, now());
        const questions = await repository.getQuestions(event.id, identity.userId);
        return jsonResponse(200, {
          attempt,
          questions: questions.map((question) => publicQuestion(question)),
          serverNow: now().toISOString(),
        }, corsHeaders);
      }
      if (payload.action === 'submit') {
        const attempt = await repository.getAttempt(event.id, identity.userId);
        if (!attempt || attempt.status !== 'started') {
          throw new RankedEventError(409, 'ATTEMPT_NOT_STARTED', 'Tentativa não iniciada.');
        }
        const questions = await repository.getQuestions(event.id, identity.userId);
        const deadline = Math.min(
          new Date(event.ends_at).getTime(),
          new Date(attempt.started_at).getTime() + Number(event.duration_minutes) * 60000,
        );
        const timedOut = now().getTime() > deadline;
        const acceptedAnswers = timedOut ? [] : payload.answers;
        const result = scoreRankedAnswers(questions, acceptedAnswers, event.scoring_mode);
        const elapsedSeconds = Math.max(0, Math.min(
          Number(event.duration_minutes) * 60,
          Math.floor((now().getTime() - new Date(attempt.started_at).getTime()) / 1000),
        ));
        const saved = await repository.submit(event, identity.userId, {
          ...result,
          answers: acceptedAnswers,
          elapsedSeconds,
          status: timedOut ? 'timed_out' : 'submitted',
          submittedAt: now().toISOString(),
        });
        return jsonResponse(200, { attempt: saved }, corsHeaders);
      }
      if (payload.action === 'get_result') {
        if (effectiveEventStatus(event, now()) !== 'finished') {
          throw new RankedEventError(403, 'RESULT_NOT_RELEASED', 'Resultado ainda não liberado.');
        }
        const attempt = await repository.getAttempt(event.id, identity.userId);
        const questions = await repository.getQuestions(event.id, identity.userId);
        return jsonResponse(200, {
          attempt,
          questions: questions.map((question) => ({
            ...publicQuestion(question, { includeExplanation: true }),
            correctAnswer: normalizeExpectedAnswer(question.payload || question),
          })),
        }, corsHeaders);
      }
      if (!rankingIsReleased(event, now())) {
        throw new RankedEventError(403, 'RANKING_NOT_RELEASED', 'Ranking ainda não liberado.');
      }
      return jsonResponse(200, {
        ranking: rankAttempts(await repository.listParticipants(event.id)),
      }, corsHeaders);
    } catch (error) {
      if (error instanceof RankedEventError) {
        return jsonResponse(error.status, { error: { code: error.code, message: error.message } }, corsHeaders);
      }
      return jsonResponse(500, {
        error: { code: 'OPERATION_FAILED', message: 'Não foi possível concluir a operação do evento.' },
      }, corsHeaders);
    }
  };
}
