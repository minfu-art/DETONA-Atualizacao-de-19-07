export const REVIEW_MEMORY_STATES = Object.freeze({
  HOT: 'quente', WARM: 'morna', COLD: 'fria', FROZEN: 'congelada',
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const REVIEW_STATUSES = new Set(['pending', 'scheduled', 'frozen']);
const REVIEW_RESULTS = new Set(['incorrect', 'correct', 'low_confidence', 'domain_drop', 'migration']);
const REVIEW_INTERVAL_DAYS = Object.freeze([1, 6, 15, 30]);
const PROCESSED_ID_LIMIT = 250;

const asDate = (value, fallback = null) => {
  const date = value ? new Date(value) : fallback;
  return date && Number.isFinite(date.getTime()) ? date : fallback;
};

const iso = (value) => asDate(value, new Date(0)).toISOString();
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function addCalendarDays(value, days) {
  const date = asDate(value, null);
  if (!date) return null;
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + Math.max(0, Number(days) || 0));
  return next.toISOString();
}

export function boundedProcessedIds(values = [], nextId = null) {
  const ids = [...new Set([...(Array.isArray(values) ? values : []), nextId].filter(Boolean).map(String))];
  return ids.slice(-PROCESSED_ID_LIMIT);
}

/** Valida sem alterar ou excluir o registro original. */
export function validateReviewQueueItem(item, context = {}) {
  const errors = [];
  const warnings = [];
  const questionId = String(item?.questionId || '').trim();
  const contestId = String(item?.contestId || '').trim();
  const subtopicId = String(item?.subtopicId || '').trim();
  const disciplineId = String(item?.disciplineId || '').trim();
  const question = context.questionById?.get(questionId) || context.questions?.find?.((row) => String(row.id) === questionId);
  const subtopic = context.subtopicById?.get(subtopicId) || context.subtopics?.find?.((row) => String(row.id) === subtopicId);
  const expectedContestId = context.contestId == null ? null : String(context.contestId);
  if (!questionId) errors.push('QUESTION_ID_REQUIRED');
  if (questionId && !question) errors.push('QUESTION_NOT_FOUND');
  if (question && context.isQuestionEligible && !context.isQuestionEligible(question)) errors.push('QUESTION_INELIGIBLE');
  if (!contestId || (expectedContestId && contestId !== expectedContestId)) errors.push('CONTEST_MISMATCH');
  const questionSubtopicId = String(question?.subtopic_id || question?.topicoEditalId || '').trim();
  if (!subtopicId || (questionSubtopicId && subtopicId !== questionSubtopicId)) errors.push('SUBTOPIC_MISMATCH');
  if (!subtopic) errors.push('SUBTOPIC_NOT_FOUND');
  const expectedDisciplineId = String(subtopic?.discipline_id || question?.disciplina || question?.discipline_id || '').trim();
  if (!disciplineId || (expectedDisciplineId && disciplineId !== expectedDisciplineId)) errors.push('DISCIPLINE_MISMATCH');
  if (!asDate(item?.nextReviewAt, null)) errors.push('NEXT_REVIEW_AT_INVALID');
  if (!REVIEW_STATUSES.has(String(item?.status || ''))) errors.push('STATUS_UNKNOWN');
  if (item?.lastResult && !REVIEW_RESULTS.has(String(item.lastResult))) warnings.push('LAST_RESULT_UNKNOWN');
  const scopeKey = `${expectedContestId || contestId}:${questionId}`;
  const previous = context.seen?.get(scopeKey);
  if (previous && previous !== item) errors.push('DUPLICATE_INCOHERENT');
  else context.seen?.set(scopeKey, item);
  return { valid: errors.length === 0, errors, warnings, item, question, subtopic, scopeKey };
}

export function normalizeReviewDifficulty(value) {
  if (typeof value === 'number') return clamp(value, 1, 5);
  const key = String(value || '').trim().toLowerCase();
  return ({ muito_facil: 1, facil: 2, media: 3, medio: 3, dificil: 4, muito_dificil: 5 })[key] || 3;
}

export function memoryStateAfterResult(item, correct) {
  if (!correct) return REVIEW_MEMORY_STATES.HOT;
  const streak = (Number(item?.consecutiveCorrect) || 0) + 1;
  if (streak === 1) return REVIEW_MEMORY_STATES.WARM;
  if (streak < 5) return REVIEW_MEMORY_STATES.COLD;
  return REVIEW_MEMORY_STATES.FROZEN;
}

/** Regra pura de repetição espaçada. */
export function calculateNextReviewAt(item, context = {}) {
  const now = asDate(context.now, new Date());
  const correct = context.correct === true;
  const nextCorrectStreak = correct ? (Number(item?.consecutiveCorrect) || 0) + 1 : 0;
  const intervalIndex = correct ? Math.min(nextCorrectStreak, REVIEW_INTERVAL_DAYS.length - 1) : 0;
  return addCalendarDays(now, REVIEW_INTERVAL_DAYS[intervalIndex]);
}

/** Score determinístico: vencimento domina os demais critérios. */
export function calculateReviewPriority(item, context = {}) {
  const now = asDate(context.now, new Date());
  const due = asDate(item?.nextReviewAt, now);
  const mastery = clamp(context.subtopicMastery, 0, 100);
  const difficulty = normalizeReviewDifficulty(item?.difficulty);
  const deltaHours = (now - due) / HOUR;
  let score = deltaHours >= 0 ? 1000 + Math.min(1000, deltaHours * 2) : Math.max(0, 120 - (Math.abs(deltaHours) * 2));
  score += (Number(item?.errorCount) || 0) * 80;
  score += (100 - mastery) * 3;
  score += difficulty * 40;
  if (!item?.lastReviewedAt) score += 150;
  const lastError = asDate(item?.lastErrorAt, null);
  if (lastError) score += Math.max(0, 100 - ((now - lastError) / DAY) * 10);
  if (item?.lastResult === 'incorrect') score += 75;
  return Math.round(score * 100) / 100;
}

export function createReviewItem(input, context = {}) {
  const now = iso(context.now || new Date());
  const incorrect = context.reason === 'incorrect' || context.reason === 'migration';
  const item = {
    id: `${String(input.contestId || '')}:${String(input.questionId)}`,
    questionId: String(input.questionId),
    contestId: String(input.contestId || ''),
    subtopicId: String(input.subtopicId || ''),
    disciplineId: String(input.disciplineId || ''),
    firstErrorAt: incorrect ? now : (input.firstErrorAt || null),
    lastErrorAt: incorrect ? now : (input.lastErrorAt || null),
    lastReviewedAt: null,
    nextReviewAt: now,
    errorCount: incorrect ? 1 : 0,
    correctAfterErrorCount: 0,
    consecutiveCorrect: 0,
    consecutiveErrors: incorrect ? 1 : 0,
    lastResult: incorrect ? 'incorrect' : (context.reason || 'low_confidence'),
    reason: context.reason || 'low_confidence',
    reviewCount: 0,
    memoryState: REVIEW_MEMORY_STATES.HOT,
    priorityScore: 0,
    difficulty: normalizeReviewDifficulty(input.difficulty),
    source: input.source || context.source || 'battle',
    status: 'pending',
    reviewHistory: [],
    createdAt: now,
    updatedAt: now,
    processed_battle_ids: [],
    processed_review_event_ids: [],
  };
  item.nextReviewAt = calculateNextReviewAt({ ...item, errorCount: 0 }, { ...context, correct: false, difficulty: item.difficulty });
  item.priorityScore = calculateReviewPriority(item, context);
  return item;
}

export function applyReviewEvent(existing, input, context = {}) {
  const now = iso(context.now || new Date());
  const correct = context.correct === true;
  const base = existing ? structuredClone(existing) : createReviewItem(input, { ...context, correct });
  if (!correct) {
    const isError = context.reason === 'incorrect' || context.isReview;
    if (isError) {
      base.firstErrorAt ||= now;
      base.lastErrorAt = now;
      base.errorCount = (Number(base.errorCount) || 0) + (existing ? 1 : 0);
      base.consecutiveErrors = (Number(base.consecutiveErrors) || 0) + (existing ? 1 : 0);
    }
    base.consecutiveCorrect = 0;
    base.lastResult = context.reason === 'low_confidence' ? 'low_confidence' : 'incorrect';
    if (context.reason === 'domain_drop') base.lastResult = 'domain_drop';
  } else {
    base.lastReviewedAt = now;
    base.correctAfterErrorCount = (Number(base.correctAfterErrorCount) || 0) + 1;
    base.consecutiveCorrect = (Number(base.consecutiveCorrect) || 0) + 1;
    base.consecutiveErrors = 0;
    base.lastResult = 'correct';
  }
  if (context.isReview && !correct) base.lastReviewedAt = now;
  if (context.isReview) base.reviewCount = (Number(base.reviewCount) || 0) + 1;
  base.reason = context.reason || base.reason || (context.isReview ? 'review' : 'battle');
  base.memoryState = memoryStateAfterResult(existing || base, correct);
  base.status = base.memoryState === REVIEW_MEMORY_STATES.FROZEN ? 'frozen' : 'scheduled';
  base.difficulty = normalizeReviewDifficulty(input.difficulty ?? base.difficulty);
  base.source ||= input.source || context.source || 'battle';
  const schedulingBase = existing || { ...base, errorCount: 0, consecutiveCorrect: 0 };
  base.nextReviewAt = calculateNextReviewAt(schedulingBase, { ...context, correct, difficulty: base.difficulty });
  base.reviewHistory = [...(base.reviewHistory || []), {
    at: now, result: base.lastResult, reason: context.reason || (context.isReview ? 'review' : 'battle'),
  }].slice(-100);
  base.updatedAt = now;
  base.priorityScore = calculateReviewPriority(base, context);
  return base;
}

export function migrateLegacyReviewItems(subtopics = [], questions = [], context = {}) {
  const now = iso(context.now || new Date());
  const contestId = String(context.contestId || '');
  const questionById = new Map(questions.map((question) => [String(question.id), question]));
  const audit = context.audit && typeof context.audit === 'object' ? context.audit : null;
  if (audit) {
    audit.ignoredAmbiguous = Number(audit.ignoredAmbiguous) || 0;
    audit.invalid = Number(audit.invalid) || 0;
  }
  const items = [];
  for (const subtopic of subtopics) {
    const ids = [...new Set([...(subtopic.review_question_ids || []), ...(subtopic.questoesRevisao || []), ...(subtopic.incorrect_question_ids || [])])];
    for (const questionId of ids) {
      const question = questionById.get(String(questionId));
      const questionSubtopicId = String(question?.subtopic_id || question?.topicoEditalId || '').trim();
      if (!question || (context.isQuestionEligible && !context.isQuestionEligible(question))) {
        if (audit) audit.invalid += 1;
        continue;
      }
      if (!questionSubtopicId || questionSubtopicId !== String(subtopic.id)) {
        if (audit) audit.ignoredAmbiguous += 1;
        continue;
      }
      const history = subtopic.question_history?.[questionId] || {};
      const date = history.lastAnsweredAt || subtopic.last_attempt_at || subtopic.last_studied_at || now;
      const item = createReviewItem({
        questionId, contestId, subtopicId: subtopic.id, disciplineId: subtopic.discipline_id,
        difficulty: question.dificuldade || question.difficulty, source: 'migration',
      }, { now: date, subtopicMastery: subtopic.best_accuracy || 0, source: 'migration', reason: 'migration' });
      item.firstErrorAt = date;
      item.lastErrorAt = date;
      item.errorCount = Math.max(1, Number(history.incorrectCount) || 1);
      item.source = 'migration';
      item.priorityScore = calculateReviewPriority(item, { now, subtopicMastery: subtopic.best_accuracy || 0 });
      items.push(item);
    }
  }
  return items;
}

export function listDueReviewItems(items = [], context = {}) {
  const now = asDate(context.now, new Date());
  const contestId = context.contestId == null ? null : String(context.contestId);
  const seen = new Set();
  const seenValidation = new Map();
  return items
    .filter((item) => (!contestId || String(item.contestId) === contestId)
      && (!context.disciplineId || item.disciplineId === context.disciplineId)
      && (!context.subtopicId || item.subtopicId === context.subtopicId))
    .filter((item) => validateReviewQueueItem(item, { ...context, seen: seenValidation }).valid)
    .filter((item) => item.status !== 'frozen' && asDate(item.nextReviewAt, null) <= now)
    .map((item) => ({ ...item, priorityScore: calculateReviewPriority(item, { now, subtopicMastery: context.masteryBySubtopic?.[item.subtopicId] || 0 }) }))
    .sort((a, b) => {
      const aDue = asDate(a.nextReviewAt, now) <= now ? 1 : 0;
      const bDue = asDate(b.nextReviewAt, now) <= now ? 1 : 0;
      return bDue - aDue
        || b.priorityScore - a.priorityScore
        || (b.errorCount || 0) - (a.errorCount || 0)
        || (context.masteryBySubtopic?.[a.subtopicId] || 0) - (context.masteryBySubtopic?.[b.subtopicId] || 0)
        || String(a.lastReviewedAt || a.firstErrorAt || '').localeCompare(String(b.lastReviewedAt || b.firstErrorAt || ''))
        || a.questionId.localeCompare(b.questionId);
    })
    .filter((item) => {
      const key = `${item.contestId}:${item.questionId}`;
      return !seen.has(key) && seen.add(key);
    });
}

export function selectReviewItems(items = [], context = {}) {
  const limit = Math.min(10, Math.max(1, Number(context.limit) || 10));
  return listDueReviewItems(items, context).slice(0, limit);
}

export function applyReviewHistoryToSubtopic(subtopic, result) {
  const next = structuredClone(subtopic);
  const questionId = result.questionId;
  next.review_history = [...(next.review_history || []), result].slice(-200);
  const previous = next.question_history?.[questionId] || {};
  next.question_history = { ...(next.question_history || {}), [questionId]: {
    ...previous,
    reviewAttempts: (Number(previous.reviewAttempts) || 0) + 1,
    reviewCorrectCount: (Number(previous.reviewCorrectCount) || 0) + (result.correct ? 1 : 0),
    reviewIncorrectCount: (Number(previous.reviewIncorrectCount) || 0) + (result.correct ? 0 : 1),
    lastReviewedAt: result.at,
    lastReviewCorrect: result.correct,
  } };
  return next;
}
