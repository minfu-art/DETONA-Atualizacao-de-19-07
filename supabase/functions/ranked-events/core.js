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

function text(value) {
  return String(value ?? '').trim();
}

function timestamp(value) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export function rankedEventVersion(event) {
  return text(event?.version || event?.published_at || event?.publishedAt || event?.id);
}

export function validateRankedEvent(event, context = {}) {
  const errors = [];
  const id = text(event?.id);
  const contestId = text(event?.contest_id || event?.contestId);
  const startsAt = timestamp(event?.starts_at || event?.startsAt);
  const endsAt = timestamp(event?.ends_at || event?.endsAt);
  const durationMinutes = Number(event?.duration_minutes || event?.durationMinutes);
  const questionCount = Number(event?.question_count || event?.questionCount);
  const status = text(event?.effectiveStatus || event?.status);
  const registrationStartsAt = timestamp(event?.registration_starts_at || event?.registrationStartsAt);
  const registrationEndsAt = timestamp(event?.registration_ends_at || event?.registrationEndsAt);
  const scoringMode = text(event?.scoring_mode || event?.scoringMode);
  const rankingReleaseMode = text(event?.ranking_release_mode || event?.rankingReleaseMode);
  if (!id) errors.push('EVENT_ID_REQUIRED');
  if (!contestId) errors.push('EVENT_CONTEST_REQUIRED');
  if (context.contestId && contestId !== text(context.contestId)) errors.push('EVENT_CONTEST_MISMATCH');
  if (startsAt == null || endsAt == null) errors.push('EVENT_DATES_INVALID');
  else if (startsAt >= endsAt) errors.push('EVENT_PERIOD_INVALID');
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) errors.push('EVENT_DURATION_INVALID');
  if (!Number.isInteger(questionCount) || questionCount <= 0) errors.push('EVENT_QUESTION_COUNT_INVALID');
  if (!EVENT_STATUSES.has(status)) errors.push('EVENT_STATUS_INVALID');
  if (!SCORING_MODES.has(scoringMode)) errors.push('EVENT_SCORING_MODE_INVALID');
  if (!RANKING_MODES.has(rankingReleaseMode)) errors.push('EVENT_RANKING_MODE_INVALID');
  if (registrationStartsAt == null || registrationEndsAt == null) errors.push('EVENT_REGISTRATION_DATES_INVALID');
  else if (!(registrationStartsAt < registrationEndsAt && registrationEndsAt <= startsAt)) {
    errors.push('EVENT_REGISTRATION_PERIOD_INVALID');
  }
  if (status !== 'draft' && !(event?.published_at || event?.publishedAt)) errors.push('EVENT_PUBLISHED_AT_REQUIRED');
  if (!rankedEventVersion(event)) errors.push('EVENT_VERSION_REQUIRED');
  if (Array.isArray(context.questions)) {
    const ids = context.questions.map((question) => text(question?.question_id || question?.id));
    if (ids.some((questionId) => !questionId)) errors.push('EVENT_QUESTION_ID_REQUIRED');
    if (new Set(ids).size !== ids.length) errors.push('EVENT_QUESTIONS_DUPLICATED');
    if (ids.length !== questionCount) errors.push('EVENT_QUESTION_COUNT_MISMATCH');
    if (context.isQuestionEligible && context.questions.some((question) => !context.isQuestionEligible(question))) {
      errors.push('EVENT_QUESTION_INELIGIBLE');
    }
    if (context.questions.some((question) => {
      const questionContestId = text(question?.contest_id || question?.contestId);
      return questionContestId && questionContestId !== contestId;
    })) errors.push('EVENT_QUESTION_CONTEST_MISMATCH');
  }
  return { valid: errors.length === 0, errors };
}

export function rankedDeadline(event, attempt) {
  const eventEnd = timestamp(event?.ends_at || event?.endsAt);
  const startedAt = timestamp(attempt?.started_at || attempt?.startedAt);
  const durationMinutes = Number(event?.duration_minutes || event?.durationMinutes);
  if (eventEnd == null || startedAt == null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return Math.min(eventEnd, startedAt + durationMinutes * 60000);
}

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

function allowedAnswerValues(question) {
  const payload = question?.payload || question || {};
  const options = payload.options || payload.alternativas;
  if (!Array.isArray(options) || options.length < 2) return new Set(['C', 'E', '']);
  return new Set(options.map((option, index) => {
    const label = typeof option === 'object' ? option.text || option.label || option.value : option;
    return (/^([A-E])[\s).:-]/i.exec(text(label))?.[1] || String.fromCharCode(65 + index)).toUpperCase();
  }).concat(''));
}

export function normalizeRankedSubmissionAnswers(questions = [], answers = []) {
  const questionById = new Map(questions.map((question) => [text(question?.question_id || question?.id), question]));
  if (questionById.size !== questions.length || [...questionById.keys()].some((questionId) => !questionId)) {
    throw new RankedEventError(409, 'EVENT_QUESTIONS_INVALID', 'O conjunto de questões do evento é inválido.');
  }
  const byQuestion = new Map();
  for (const answer of answers) {
    const questionId = text(answer?.questionId || answer?.question_id);
    const value = text(answer?.answer).toUpperCase();
    const question = questionById.get(questionId);
    if (!question) throw new RankedEventError(400, 'ANSWER_OUTSIDE_EVENT', 'Uma resposta não pertence a este evento.');
    if (byQuestion.has(questionId)) throw new RankedEventError(400, 'DUPLICATE_ANSWER', 'Uma questão recebeu respostas duplicadas.');
    if (!allowedAnswerValues(question).has(value)) {
      throw new RankedEventError(400, 'INVALID_ANSWER_OPTION', 'Uma alternativa enviada é inválida.');
    }
    byQuestion.set(questionId, value);
  }
  return questions.map((question) => {
    const questionId = text(question?.question_id || question?.id);
    return { questionId, answer: byQuestion.get(questionId) || '' };
  });
}

export function scoreRankedAnswers(questions = [], answers = [], scoringMode = 'simple') {
  if (!SCORING_MODES.has(scoringMode)) throw new TypeError('Modo de pontuação inválido.');
  const normalizedAnswers = normalizeRankedSubmissionAnswers(questions, answers);
  const answerByQuestion = new Map(normalizedAnswers.map((answer) => [answer.questionId, answer.answer]));
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

export function validateRankedSession(session, context = {}) {
  const errors = [];
  const questions = Array.isArray(context.questions) ? context.questions : [];
  const event = context.event;
  if (!text(session?.id)) errors.push('SESSION_ID_REQUIRED');
  if (!text(session?.event_id || session?.eventId)) errors.push('SESSION_EVENT_REQUIRED');
  if (event && text(session?.event_id || session?.eventId) !== text(event.id)) errors.push('SESSION_EVENT_MISMATCH');
  if (context.userId && text(session?.user_id || session?.userId) !== text(context.userId)) errors.push('SESSION_USER_MISMATCH');
  if (!['registered', 'started', 'submitted', 'timed_out', 'disqualified'].includes(text(session?.status))) {
    errors.push('SESSION_STATUS_INVALID');
  }
  if (session?.status === 'started' && timestamp(session?.started_at || session?.startedAt) == null) {
    errors.push('SESSION_STARTED_AT_INVALID');
  }
  if (event && rankedDeadline(event, session) == null && session?.status !== 'registered') {
    errors.push('SESSION_DEADLINE_INVALID');
  }
  try { normalizeRankedSubmissionAnswers(questions, session?.answers || []); }
  catch (error) { errors.push(error.code || 'SESSION_ANSWERS_INVALID'); }
  return { valid: errors.length === 0, errors };
}

export function rankAttempts(attempts = [], event = null) {
  const seenUsers = new Set();
  const expectedTotal = Number(event?.question_count || event?.questionCount || 0);
  return [...attempts]
    .filter((attempt) => ['submitted', 'timed_out'].includes(attempt.status)
      && Number.isFinite(Number(attempt.score))
      && Number.isFinite(Number(attempt.accuracy))
      && Number(attempt.accuracy) >= 0
      && Number(attempt.accuracy) <= 100
      && Number.isFinite(Number(attempt.elapsed_seconds))
      && Number(attempt.elapsed_seconds) >= 0
      && [attempt.correct_count ?? 0, attempt.incorrect_count ?? 0, attempt.blank_count ?? 0]
        .every((value) => Number.isInteger(Number(value)) && Number(value) >= 0)
      && (!expectedTotal || Number(attempt.correct_count ?? 0) + Number(attempt.incorrect_count ?? 0)
        + Number(attempt.blank_count ?? 0) === expectedTotal))
    .sort((a, b) => (
      Number(b.score) - Number(a.score)
      || Number(b.accuracy) - Number(a.accuracy)
      || Number(a.elapsed_seconds) - Number(b.elapsed_seconds)
      || new Date(a.submitted_at) - new Date(b.submitted_at)
      || text(a.id).localeCompare(text(b.id))
    ))
    .filter((attempt) => {
      const userId = text(attempt.user_id || attempt.userId);
      if (!userId) return true;
      if (seenUsers.has(userId)) return false;
      seenUsers.add(userId);
      return true;
    })
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
        const events = (await repository.listEvents(payload.contestId))
          .filter((event) => validateRankedEvent(event, { contestId: payload.contestId }).valid);
        if (payload.action === 'get_home_event') {
          return jsonResponse(200, { selected: selectHomeRankedEvent(events, now()) }, corsHeaders);
        }
        return jsonResponse(200, {
          events: events.map((event) => ({ ...event, effectiveStatus: effectiveEventStatus(event, now()) })),
        }, corsHeaders);
      }
      const event = await repository.getEvent(payload.eventId);
      if (!event) throw new RankedEventError(404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
      if (!validateRankedEvent(event).valid) {
        throw new RankedEventError(409, 'EVENT_INVALID', 'Este evento possui uma configuração inválida.');
      }
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
        if (['submitted', 'timed_out'].includes(attempt?.status)) {
          return jsonResponse(200, {
            attempt,
            questions: [],
            completed: true,
            eventVersion: rankedEventVersion(event),
            serverNow: now().toISOString(),
          }, corsHeaders);
        }
        const questions = await repository.getQuestions(event.id, identity.userId);
        if (!validateRankedEvent(event, { questions }).valid) {
          throw new RankedEventError(409, 'EVENT_QUESTIONS_INVALID', 'O conjunto de questões do evento é inválido.');
        }
        const deadline = rankedDeadline(event, attempt);
        return jsonResponse(200, {
          attempt,
          questions: questions.map((question) => publicQuestion(question)),
          eventVersion: rankedEventVersion(event),
          deadlineAt: deadline == null ? null : new Date(deadline).toISOString(),
          serverNow: now().toISOString(),
        }, corsHeaders);
      }
      if (payload.action === 'submit') {
        const attempt = await repository.getAttempt(event.id, identity.userId);
        if (attempt && ['submitted', 'timed_out'].includes(attempt.status)) {
          return jsonResponse(200, { attempt, recovered: true }, corsHeaders);
        }
        if (!attempt || attempt.status !== 'started') {
          throw new RankedEventError(409, 'ATTEMPT_NOT_STARTED', 'Tentativa não iniciada.');
        }
        const questions = await repository.getQuestions(event.id, identity.userId);
        const sessionValidation = validateRankedSession(attempt, { event, questions, userId: identity.userId });
        if (!sessionValidation.valid) {
          throw new RankedEventError(409, 'ATTEMPT_INVALID', 'A tentativa não possui integridade suficiente para entrega.');
        }
        const deadline = rankedDeadline(event, attempt);
        const timedOut = now().getTime() > deadline;
        const submittedAnswers = timedOut && Array.isArray(attempt.answers) && attempt.answers.length
          ? attempt.answers
          : payload.answers;
        const acceptedAnswers = normalizeRankedSubmissionAnswers(questions, submittedAnswers);
        const result = scoreRankedAnswers(questions, acceptedAnswers, event.scoring_mode);
        const elapsedSeconds = Math.max(0, Math.min(
          Math.floor((deadline - new Date(attempt.started_at).getTime()) / 1000),
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
        if (!attempt || !['submitted', 'timed_out'].includes(attempt.status)) {
          throw new RankedEventError(409, 'RESULT_NOT_AVAILABLE', 'Nenhum resultado válido está disponível para esta tentativa.');
        }
        const total = Number(attempt.correct_count) + Number(attempt.incorrect_count) + Number(attempt.blank_count);
        if (total !== Number(event.question_count)) {
          throw new RankedEventError(409, 'RESULT_INVALID', 'O resultado persistido não passou pela validação de integridade.');
        }
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
        ranking: rankAttempts(await repository.listParticipants(event.id), event),
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
