const EVENT_STATUSES = new Set([
  'draft', 'scheduled', 'registration_open', 'live', 'finished', 'cancelled',
]);
const ATTEMPT_STATUSES = new Set(['registered', 'started', 'submitted', 'timed_out', 'disqualified']);
const SCORING_MODES = new Set(['simple', 'cebraspe']);
const RANKING_MODES = new Set(['immediate', 'after_event']);

function text(value) {
  return String(value ?? '').trim();
}

function milliseconds(value) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function field(value, snake, camel) {
  return value?.[snake] ?? value?.[camel];
}

export function rankedEventVersion(event) {
  return text(event?.version || event?.published_at || event?.publishedAt || event?.id);
}

export function validateRankedEvent(event, context = {}) {
  const errors = [];
  const id = text(event?.id);
  const contestId = text(field(event, 'contest_id', 'contestId'));
  const expectedContestId = text(context.contestId);
  const startsAt = milliseconds(field(event, 'starts_at', 'startsAt'));
  const endsAt = milliseconds(field(event, 'ends_at', 'endsAt'));
  const durationMinutes = Number(field(event, 'duration_minutes', 'durationMinutes'));
  const questionCount = Number(field(event, 'question_count', 'questionCount'));
  const status = text(event?.effectiveStatus || event?.status);
  const registrationStartsAt = milliseconds(field(event, 'registration_starts_at', 'registrationStartsAt'));
  const registrationEndsAt = milliseconds(field(event, 'registration_ends_at', 'registrationEndsAt'));
  const scoringMode = text(field(event, 'scoring_mode', 'scoringMode'));
  const rankingReleaseMode = text(field(event, 'ranking_release_mode', 'rankingReleaseMode'));
  const version = rankedEventVersion(event);

  if (!id) errors.push('EVENT_ID_REQUIRED');
  if (!contestId) errors.push('EVENT_CONTEST_REQUIRED');
  if (expectedContestId && contestId !== expectedContestId) errors.push('EVENT_CONTEST_MISMATCH');
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
  if (status !== 'draft' && !field(event, 'published_at', 'publishedAt')) errors.push('EVENT_PUBLISHED_AT_REQUIRED');
  if (!version) errors.push('EVENT_VERSION_REQUIRED');

  const questions = Array.isArray(context.questions) ? context.questions : null;
  if (questions) {
    const ids = questions.map((question) => text(question?.id || question?.question_id));
    if (ids.some((questionId) => !questionId)) errors.push('EVENT_QUESTION_ID_REQUIRED');
    if (new Set(ids).size !== ids.length) errors.push('EVENT_QUESTIONS_DUPLICATED');
    if (questionCount !== questions.length) errors.push('EVENT_QUESTION_COUNT_MISMATCH');
    if (context.isQuestionEligible && questions.some((question) => !context.isQuestionEligible(question))) {
      errors.push('EVENT_QUESTION_INELIGIBLE');
    }
    if (questions.some((question) => {
      const questionContestId = text(field(question, 'contest_id', 'contestId'));
      return questionContestId && questionContestId !== contestId;
    })) errors.push('EVENT_QUESTION_CONTEST_MISMATCH');
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      id, contestId, startsAt, endsAt, durationMinutes, questionCount, status, version,
      scoringMode, rankingReleaseMode,
    },
  };
}

export function rankedDeadline(event, attempt) {
  const eventEnd = milliseconds(field(event, 'ends_at', 'endsAt'));
  const startedAt = milliseconds(field(attempt, 'started_at', 'startedAt'));
  const durationMinutes = Number(field(event, 'duration_minutes', 'durationMinutes'));
  if (eventEnd == null || startedAt == null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return Math.min(eventEnd, startedAt + durationMinutes * 60000);
}

export function createRankedClock({ deadlineAt, serverNow, monotonicNow = () => performance.now() } = {}) {
  const deadline = milliseconds(deadlineAt);
  const serverStart = milliseconds(serverNow);
  if (deadline == null || serverStart == null) throw new TypeError('RANKED_CLOCK_INVALID');
  const monotonicStart = Number(monotonicNow());
  if (!Number.isFinite(monotonicStart)) throw new TypeError('RANKED_CLOCK_INVALID');
  return Object.freeze({
    deadlineAt: new Date(deadline).toISOString(),
    remaining(now = monotonicNow()) {
      const elapsed = Math.max(0, Number(now) - monotonicStart);
      return Math.max(0, deadline - (serverStart + elapsed));
    },
    expired(now = monotonicNow()) {
      return this.remaining(now) === 0;
    },
  });
}

export function allowedRankedAnswers(question) {
  const raw = question?.payload?.options || question?.payload?.alternativas;
  if (!Array.isArray(raw) || raw.length < 2) return new Set(['C', 'E', '']);
  return new Set(raw.map((option, index) => {
    const label = typeof option === 'object' ? option.text || option.label || option.value : option;
    return (/^([A-E])[\s).:-]/i.exec(text(label))?.[1] || String.fromCharCode(65 + index)).toUpperCase();
  }).concat(''));
}

export function normalizeRankedAnswers(questions = [], answers = []) {
  const questionById = new Map(questions.map((question) => [text(question?.id || question?.question_id), question]));
  const normalized = [];
  const seen = new Set();
  for (const item of answers) {
    const questionId = text(item?.questionId || item?.question_id);
    const answer = text(item?.answer).toUpperCase();
    if (!questionId || !questionById.has(questionId)) throw new TypeError('RANKED_ANSWER_EXTERNAL');
    if (seen.has(questionId)) throw new TypeError('RANKED_ANSWER_DUPLICATED');
    if (!allowedRankedAnswers(questionById.get(questionId)).has(answer)) throw new TypeError('RANKED_ANSWER_INVALID');
    seen.add(questionId);
    normalized.push({ questionId, answer });
  }
  return questions.map((question) => {
    const questionId = text(question?.id || question?.question_id);
    return normalized.find((answer) => answer.questionId === questionId) || { questionId, answer: '' };
  });
}

export function validateRankedSession(session, context = {}) {
  const errors = [];
  const event = context.event;
  const eventCheck = validateRankedEvent(event, { contestId: context.contestId, questions: session?.questions });
  const questionIds = Array.isArray(session?.questionIds) ? session.questionIds.map(text) : [];
  const questions = Array.isArray(session?.questions) ? session.questions : [];
  const expectedQuestionIds = questions.map((question) => text(question?.id || question?.question_id));

  if (!text(session?.id)) errors.push('SESSION_ID_REQUIRED');
  if (!text(session?.eventId)) errors.push('SESSION_EVENT_REQUIRED');
  if (!text(session?.eventVersion)) errors.push('SESSION_VERSION_REQUIRED');
  if (!text(session?.userId)) errors.push('SESSION_USER_REQUIRED');
  if (!text(session?.contestId)) errors.push('SESSION_CONTEST_REQUIRED');
  if (!text(session?.scopeKey)) errors.push('SESSION_SCOPE_REQUIRED');
  if (text(session?.scopeKey) !== `${text(session?.userId)}:${text(session?.contestId)}`) errors.push('SESSION_SCOPE_INVALID');
  if (event && text(session?.eventId) !== text(event.id)) errors.push('SESSION_EVENT_MISMATCH');
  if (event && text(session?.eventVersion) !== rankedEventVersion(event)) errors.push('SESSION_VERSION_MISMATCH');
  if (context.userId && text(session?.userId) !== text(context.userId)) errors.push('SESSION_USER_MISMATCH');
  if (context.contestId && text(session?.contestId) !== text(context.contestId)) errors.push('SESSION_CONTEST_MISMATCH');
  if (context.scopeKey && text(session?.scopeKey) !== text(context.scopeKey)) errors.push('SESSION_SCOPE_MISMATCH');
  if (new Set(questionIds).size !== questionIds.length) errors.push('SESSION_QUESTIONS_DUPLICATED');
  if (questionIds.length !== expectedQuestionIds.length
    || questionIds.some((questionId, index) => questionId !== expectedQuestionIds[index])) {
    errors.push('SESSION_QUESTION_ORDER_MISMATCH');
  }
  if (!ATTEMPT_STATUSES.has(text(session?.status))) errors.push('SESSION_STATUS_INVALID');
  if (!Number.isInteger(session?.currentIndex) || session.currentIndex < 0
    || (questions.length && session.currentIndex >= questions.length)) errors.push('SESSION_INDEX_INVALID');
  if (milliseconds(session?.startedAt) == null || milliseconds(session?.deadlineAt) == null) errors.push('SESSION_TIME_INVALID');
  const expectedDeadline = event ? rankedDeadline(event, { startedAt: session?.startedAt }) : null;
  if (expectedDeadline != null && milliseconds(session?.deadlineAt) !== expectedDeadline) errors.push('SESSION_DEADLINE_MISMATCH');
  if (session?.status === 'started' && session?.submittedAt) errors.push('SESSION_SUBMISSION_STATE_INVALID');
  try { normalizeRankedAnswers(questions, Object.values(session?.answers || {})); }
  catch (error) { errors.push(error.message); }
  errors.push(...eventCheck.errors.filter((error) => !errors.includes(error)));
  return { valid: errors.length === 0, errors };
}

export function rankedResultInvariant(result) {
  const total = Math.max(0, Number(result?.total) || 0);
  const correct = Math.max(0, Number(result?.correct ?? result?.correct_count) || 0);
  const errors = Math.max(0, Number(result?.errors ?? result?.incorrect_count) || 0);
  const unanswered = Math.max(0, Number(result?.unanswered ?? result?.blank_count) || 0);
  return { valid: correct + errors + unanswered === total, total, correct, errors, unanswered };
}
