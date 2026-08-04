import { STORES } from '../core/types.js';
import { getActiveContestId } from '../contest/activeContest.js';
import { getActiveUserId } from '../auth/activeUser.js';
import {
  applyReviewEvent, applyReviewHistoryToSubtopic, boundedProcessedIds,
  calculateReviewPriority, listDueReviewItems, migrateLegacyReviewItems, selectReviewItems,
  validateReviewQueueItem,
} from '../core/reviewQueue.js';
import { questionService } from './questionService.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { grantXpEvent, XP_REWARDS } from './academicProgressService.js';
import { applyDailyGoalActivity } from './dailyGoalService.js';
import { applyValidStudyDay } from './studyStreakService.js';
import { refreshEmblems } from './emblemService.js';
import { localDateKey } from '../core/localDate.js';
import { isQuestionEligible } from '../core/questionSchema.js';

const MIGRATION_KEY = 'intelligent_review_migration_v2';
const MAX_ACTIVE_REVIEW_GAP_SECONDS = 10 * 60;
const REVIEW_FINALIZATION_STEPS = Object.freeze([
  'history', 'xp', 'dailyGoal', 'streak', 'activity', 'emblems', 'summary',
]);

const text = (value) => String(value ?? '').trim();
const validDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

function scopeFrom(repository, supplied = {}) {
  const repositoryUserId = typeof repository.userId === 'function' ? repository.userId() : repository.userId;
  const repositoryContestId = typeof repository.contestId === 'function' ? repository.contestId() : repository.contestId;
  const userId = text(supplied.userId || repositoryUserId || getActiveUserId());
  const contestId = text(supplied.contestId || repositoryContestId || getActiveContestId());
  if (!contestId) throw new Error('REVIEW_CONTEXT_REQUIRED');
  return { userId, contestId, scopeKey: `${userId || 'local'}:${contestId}` };
}

function scopedRepository(repository, scope) {
  return typeof repository.forScope === 'function' && scope.userId
    ? repository.forScope(scope.userId, scope.contestId)
    : repository;
}

function assertSessionScope(session, scope = {}) {
  const currentUserId = text(scope.userId || getActiveUserId());
  const currentContestId = text(scope.contestId || getActiveContestId());
  if (session?.userId && !currentUserId) throw new Error('REVIEW_CONTEXT_CHANGED');
  if (session?.contestId && currentContestId && text(session.contestId) !== currentContestId) {
    throw new Error('REVIEW_CONTEXT_CHANGED');
  }
  if (session?.userId && currentUserId && text(session.userId) !== currentUserId) {
    throw new Error('REVIEW_CONTEXT_CHANGED');
  }
  if (session?.scopeKey && currentContestId) {
    const expected = `${currentUserId || 'local'}:${currentContestId}`;
    if (session.scopeKey !== expected) throw new Error('REVIEW_CONTEXT_CHANGED');
  }
  return true;
}

function currentValidationScope({ userId = null, contestId = null } = {}) {
  const currentUserId = text(userId || getActiveUserId());
  const currentContestId = text(contestId || getActiveContestId());
  if (!currentContestId) return {};
  return {
    userId: currentUserId,
    contestId: currentContestId,
    scopeKey: `${currentUserId || 'local'}:${currentContestId}`,
  };
}

function sessionValidationContext(scopeContext = {}, subtopics = []) {
  return {
    ...scopeContext,
    subtopics,
    subtopicById: new Map(subtopics.map((item) => [text(item.id), item])),
    isQuestionEligible,
  };
}

function validationContext({ questions, subtopics, contestId }) {
  return {
    questions,
    subtopics,
    contestId,
    questionById: new Map(questions.map((item) => [text(item.id), item])),
    subtopicById: new Map(subtopics.map((item) => [text(item.id), item])),
    isQuestionEligible,
  };
}

export async function ensureReviewQueueMigration({
  repository = progressRepository,
  userId = null,
  contestId = null,
  now = () => new Date(),
  questionProvider = questionService,
} = {}) {
  const scope = scopeFrom(repository, { userId, contestId });
  const repo = scopedRepository(repository, scope);
  const key = `${MIGRATION_KEY}:${scope.scopeKey}`;
  if (await repo.getMeta(key)) return repo.getAll(STORES.reviewQueue);
  const [existing, subtopics, questions] = await Promise.all([
    repo.getAll(STORES.reviewQueue), repo.getAll(STORES.subtopics), questionProvider.listar(),
  ]);
  const context = validationContext({ questions, subtopics, contestId: scope.contestId });
  const known = new Set(existing.map((item) => `${scope.scopeKey}:${text(item.questionId)}`));
  const legacyAudit = { ignoredAmbiguous: 0, invalid: 0 };
  const candidates = migrateLegacyReviewItems(subtopics, questions, {
    contestId: scope.contestId, now: now(), isQuestionEligible, audit: legacyAudit,
  });
  const migrated = [];
  let invalid = 0;
  let duplicate = 0;
  for (const item of candidates) {
    const itemKey = `${scope.scopeKey}:${text(item.questionId)}`;
    if (known.has(itemKey)) { duplicate += 1; continue; }
    if (!validateReviewQueueItem(item, context).valid) { invalid += 1; continue; }
    known.add(itemKey);
    migrated.push(item);
  }
  if (migrated.length) await repo.putMany(STORES.reviewQueue, migrated);
  await repo.setMeta(key, {
    scopeKey: scope.scopeKey,
    migratedAt: now().toISOString(),
    migrated: migrated.length,
    ignoredDuplicates: duplicate,
    ignoredAmbiguous: legacyAudit.ignoredAmbiguous,
    invalid: invalid + legacyAudit.invalid,
  });
  return [...existing, ...migrated];
}

function createReviewSessionId() {
  if (globalThis.crypto?.randomUUID) return `review_${globalThis.crypto.randomUUID()}`;
  return `review_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function trackReviewActivity(session, at = new Date()) {
  if (!session || typeof session !== 'object') return 0;
  const current = validDate(at);
  const previous = validDate(session.lastActiveAt || session.startedAt);
  if (current && previous && current >= previous) {
    session.activeSeconds = Math.max(0, Number(session.activeSeconds) || 0) + Math.min(
      MAX_ACTIVE_REVIEW_GAP_SECONDS,
      Math.max(0, Math.round((current - previous) / 1000)),
    );
    session.lastActiveAt = current.toISOString();
  }
  return Math.max(0, Number(session.activeSeconds) || 0);
}

function questionInput(question, subtopic, contestId) {
  return {
    questionId: question.id,
    contestId,
    subtopicId: subtopic.id,
    disciplineId: subtopic.discipline_id,
    difficulty: question.dificuldade || question.difficulty,
    source: question.fonte || question.source || 'battle',
  };
}

export async function recordBattleReviewEvents(
  session,
  subtopic,
  previousAttemptPercentage = null,
  now = new Date(),
  repository = progressRepository,
) {
  const total = Number(session?.questions?.length) || 0;
  const domainDropped = previousAttemptPercentage != null && total > 0
    && ((Number(session.correct) || 0) / total) * 100 < Number(previousAttemptPercentage);
  let added = 0;
  const battleId = text(session?.id);
  const candidates = (session?.results || []).map((result) => ({
    result,
    question: session.questions.find((item) => item.id === result.questionId),
  })).filter(({ question }) => question && isQuestionEligible(question)
    && text(question.subtopic_id || question.topicoEditalId) === text(subtopic?.id));
  if (!candidates.length) return 0;
  const scope = scopeFrom(repository, { contestId: session?.contestId || getActiveContestId() });
  const repo = scopedRepository(repository, scope);
  for (const { result, question } of candidates) {
    const shouldQueue = !result.correct || result.confidence === 'low' || domainDropped;
    if (!shouldQueue) continue;
    const existing = await repo.getById(STORES.reviewQueue, question.id);
    if (battleId && (existing?.processed_battle_ids || []).includes(battleId)) continue;
    const reason = !result.correct ? 'incorrect' : result.confidence === 'low' ? 'low_confidence' : 'domain_drop';
    const item = applyReviewEvent(existing, questionInput(question, subtopic, scope.contestId), {
      now, correct: false, reason, subtopicMastery: subtopic.best_accuracy || 0,
    });
    item.processed_battle_ids = boundedProcessedIds(existing?.processed_battle_ids, battleId);
    await repo.put(STORES.reviewQueue, item);
    if (!existing) added += 1;
  }
  return added;
}

export function validateReviewSession(session, context = {}) {
  const errors = [];
  const questionsAreArray = Array.isArray(session?.questions);
  const itemsAreArray = Array.isArray(session?.items);
  const resultsAreArray = Array.isArray(session?.results);
  const questions = questionsAreArray ? session.questions : [];
  const items = itemsAreArray ? session.items : [];
  const results = resultsAreArray ? session.results : [];
  const sessionUserId = text(session?.userId);
  const sessionContestId = text(session?.contestId);
  const sessionScopeKey = text(session?.scopeKey);
  if (!text(session?.id)) errors.push('SESSION_ID_REQUIRED');
  if (!sessionContestId) errors.push('CONTEST_ID_REQUIRED');
  if (!sessionScopeKey) errors.push('SCOPE_KEY_REQUIRED');
  if ((context.authenticated === true || text(context.userId)) && !sessionUserId) errors.push('USER_ID_REQUIRED');
  const expectedScopeKey = `${sessionUserId || 'local'}:${sessionContestId}`;
  if (sessionScopeKey && sessionScopeKey !== expectedScopeKey) errors.push('SCOPE_KEY_MISMATCH');
  if (Object.hasOwn(context, 'userId') && context.userId != null && sessionUserId !== text(context.userId)) errors.push('USER_ID_MISMATCH');
  if (Object.hasOwn(context, 'contestId') && context.contestId != null && sessionContestId !== text(context.contestId)) errors.push('CONTEST_ID_MISMATCH');
  if (Object.hasOwn(context, 'scopeKey') && context.scopeKey != null && sessionScopeKey !== text(context.scopeKey)) errors.push('CONTEXT_SCOPE_KEY_MISMATCH');
  if (!questionsAreArray) errors.push('QUESTIONS_ARRAY_REQUIRED');
  if (!itemsAreArray) errors.push('ITEMS_ARRAY_REQUIRED');
  if (!resultsAreArray) errors.push('RESULTS_ARRAY_REQUIRED');
  if (!questions.length || questions.length > 10) errors.push('SESSION_SIZE_INVALID');
  if (items.length !== questions.length) errors.push('ITEM_QUESTION_LENGTH_MISMATCH');
  const questionIds = new Set();
  const itemQuestionIds = new Set();
  questions.forEach((question, index) => {
    const item = items[index];
    const questionId = text(question?.id);
    const itemQuestionId = text(item?.questionId);
    if (!questionId) errors.push('QUESTION_ID_REQUIRED');
    if (!itemQuestionId) errors.push('ITEM_QUESTION_ID_REQUIRED');
    if (!question || !item || questionId !== itemQuestionId) errors.push('ITEM_QUESTION_MISMATCH');
    if (questionId && questionIds.has(questionId)) errors.push('DUPLICATE_QUESTION');
    if (itemQuestionId && itemQuestionIds.has(itemQuestionId)) errors.push('DUPLICATE_ITEM');
    if (questionId) questionIds.add(questionId);
    if (itemQuestionId) itemQuestionIds.add(itemQuestionId);
    const knownQuestion = context.questionById?.get?.(questionId)
      || context.questions?.find?.((row) => text(row?.id) === questionId);
    if ((context.questionById || context.questions) && !knownQuestion) errors.push('QUESTION_NOT_FOUND');
    if (question && context.isQuestionEligible && !context.isQuestionEligible(question)) errors.push('QUESTION_INELIGIBLE');
    const questionSubtopicId = text(question?.subtopic_id || question?.topicoEditalId);
    if (item && questionSubtopicId && questionSubtopicId !== text(item.subtopicId)) errors.push('SUBTOPIC_MISMATCH');
    const subtopic = context.subtopicById?.get?.(text(item?.subtopicId))
      || context.subtopics?.find?.((row) => text(row?.id) === text(item?.subtopicId));
    const expectedDisciplineId = text(subtopic?.discipline_id
      || question?.disciplinaId || question?.disciplina || question?.discipline_id);
    if (item && expectedDisciplineId && text(item.disciplineId) !== expectedDisciplineId) errors.push('DISCIPLINE_MISMATCH');
    if (item && text(item.contestId) !== sessionContestId) errors.push('ITEM_CONTEST_MISMATCH');
    const questionContestId = text(question?.concursoId || question?.contestId || question?.contest_id);
    if (questionContestId && questionContestId !== sessionContestId) errors.push('QUESTION_CONTEST_MISMATCH');
  });
  const eventIds = new Set();
  const resultQuestionIds = new Set();
  results.forEach((result, index) => {
    const eventId = text(result?.eventId);
    const questionId = text(result?.questionId);
    if (!eventId) errors.push('RESULT_EVENT_ID_REQUIRED');
    if (!questionId) errors.push('RESULT_QUESTION_ID_REQUIRED');
    if (eventId && eventIds.has(eventId)) errors.push('DUPLICATE_RESULT_EVENT');
    if (questionId && resultQuestionIds.has(questionId)) errors.push('DUPLICATE_RESULT_QUESTION');
    if (eventId) eventIds.add(eventId);
    if (questionId) resultQuestionIds.add(questionId);
    if (!questionIds.has(questionId)) errors.push('RESULT_QUESTION_EXTERNAL');
    if (questionId !== text(questions[index]?.id)) errors.push('RESULT_ORDER_MISMATCH');
    if (typeof result?.correct !== 'boolean') errors.push('RESULT_CORRECT_INVALID');
  });
  const actualCorrect = results.filter((result) => result?.correct === true).length;
  const actualErrors = results.filter((result) => result?.correct === false).length;
  const correct = session?.correct;
  const errorCount = session?.errors;
  if (!Number.isInteger(correct) || correct < 0) errors.push('CORRECT_COUNTER_INVALID');
  else if (correct !== actualCorrect) errors.push('CORRECT_COUNTER_MISMATCH');
  if (!Number.isInteger(errorCount) || errorCount < 0) errors.push('ERROR_COUNTER_INVALID');
  else if (errorCount !== actualErrors) errors.push('ERROR_COUNTER_MISMATCH');
  if (Number.isInteger(correct) && Number.isInteger(errorCount) && correct + errorCount !== results.length) errors.push('COUNTER_TOTAL_MISMATCH');
  const index = session?.index;
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) errors.push('INDEX_INVALID');
  const finished = session?.finished === true;
  if (typeof session?.finished !== 'boolean') errors.push('FINISHED_STATE_INVALID');
  if (finished) {
    if (results.length !== questions.length) errors.push('FINISHED_WITHOUT_ALL_RESULTS');
    if (Number.isInteger(correct) && Number.isInteger(errorCount) && correct + errorCount !== questions.length) errors.push('FINISHED_COUNTERS_INCOMPLETE');
    if (index !== questions.length - 1) errors.push('FINISHED_INDEX_INVALID');
    if (!validDate(session?.finishedAt)) errors.push('FINISHED_AT_INVALID');
  } else {
    if (results.length >= questions.length && questions.length) errors.push('UNFINISHED_WITH_ALL_RESULTS');
    if (index !== results.length) errors.push('ACTIVE_INDEX_MISMATCH');
  }
  return { valid: errors.length === 0, errors, session };
}

async function reviewData(repo, contestId, questionProvider = questionService) {
  const [items, subtopics, disciplines, questions] = await Promise.all([
    repo.getAll(STORES.reviewQueue), repo.getAll(STORES.subtopics),
    repo.getAll(STORES.disciplines), questionProvider.listar(),
  ]);
  const context = validationContext({ questions, subtopics, contestId });
  const seen = new Map();
  const validations = items.map((item) => validateReviewQueueItem(item, { ...context, seen }));
  return {
    items,
    subtopics,
    disciplines,
    questions,
    context,
    validItems: validations.filter((entry) => entry.valid).map((entry) => entry.item),
    invalidItems: validations.filter((entry) => !entry.valid),
  };
}

export async function createReviewSession(filters = {}, {
  repository = progressRepository,
  now = () => new Date(),
  userId = null,
  contestId = null,
  questionProvider = questionService,
} = {}) {
  const scope = scopeFrom(repository, { userId, contestId });
  const repo = scopedRepository(repository, scope);
  await ensureReviewQueueMigration({ repository: repo, ...scope, now, questionProvider });
  const data = await reviewData(repo, scope.contestId, questionProvider);
  const masteryBySubtopic = Object.fromEntries(data.subtopics.map((item) => [item.id, item.best_accuracy || 0]));
  const current = validDate(filters.now) || now();
  const items = data.validItems;
  const selected = selectReviewItems(items, {
    ...filters,
    ...data.context,
    contestId: scope.contestId,
    masteryBySubtopic,
    now: current,
    limit: 10,
  });
  const byId = data.context.questionById;
  const sessionItems = selected.filter((item) => byId.has(text(item.questionId)));
  if (!sessionItems.length) return null;
  const startedAt = now().toISOString();
  return {
    id: createReviewSessionId(),
    userId: scope.userId,
    contestId: scope.contestId,
    scopeKey: scope.scopeKey,
    items: sessionItems,
    questions: sessionItems.map((item) => byId.get(text(item.questionId))),
    index: 0,
    correct: 0,
    errors: 0,
    results: [],
    finished: false,
    startedAt,
    lastActiveAt: startedAt,
    activeSeconds: 0,
  };
}

export function describeReviewItem(item, now = new Date()) {
  const recurring = (Number(item?.errorCount) || 0) >= 2 || (Number(item?.consecutiveErrors) || 0) >= 2;
  const type = item?.lastResult === 'low_confidence'
    ? 'low_confidence'
    : recurring || item?.lastResult === 'domain_drop' ? 'recurring'
      : item?.lastResult === 'incorrect' ? 'error' : 'scheduled';
  const next = validDate(item?.nextReviewAt);
  const due = Boolean(next && next <= now);
  const definitions = {
    error: { label: 'Erro recente', reason: 'Resposta incorreta registrada durante uma missão.', tone: 'error' },
    low_confidence: { label: 'Baixa confiança', reason: 'Você respondeu com dúvida e recebeu reforço direcionado.', tone: 'confidence' },
    recurring: { label: 'Recorrência', reason: 'Este item voltou à fila por erros repetidos ou queda real de desempenho.', tone: 'recurring' },
    scheduled: { label: 'Agendada', reason: 'Revisão programada pelo ciclo de memória espaçada.', tone: 'scheduled' },
  };
  const priority = due && type === 'recurring'
    ? { label: 'Urgente', tone: 'urgent' }
    : due ? { label: 'Alta', tone: 'high' }
      : { label: 'Programada', tone: 'scheduled' };
  return { type, due, ...definitions[type], priority };
}

export async function getReviewPlanData(filters = {}, now = new Date(), {
  repository = progressRepository,
  userId = null,
  contestId = null,
} = {}) {
  const scope = scopeFrom(repository, { userId, contestId });
  const repo = scopedRepository(repository, scope);
  await ensureReviewQueueMigration({ repository: repo, ...scope });
  const data = await reviewData(repo, scope.contestId);
  const masteryBySubtopic = Object.fromEntries(data.subtopics.map((item) => [item.id, item.best_accuracy || 0]));
  const subtopicById = data.context.subtopicById;
  const disciplineById = new Map(data.disciplines.map((item) => [text(item.id), item]));
  const items = data.validItems;
  const selectionContext = {
    ...filters,
    ...data.context,
    contestId: scope.contestId,
    masteryBySubtopic,
    now,
  };
  const allDue = listDueReviewItems(items, selectionContext);
  const selected = allDue.slice(0, 10);
  const planItems = selected.map((item, index) => {
    const subtopic = subtopicById.get(text(item.subtopicId));
    return {
      ...item,
      ...describeReviewItem(item, now),
      order: index + 1,
      question: data.context.questionById.get(text(item.questionId)),
      subtopicName: subtopic?.name || 'Conteúdo do edital',
      disciplineName: disciplineById.get(text(subtopic?.discipline_id))?.name || '',
      mastery: Number(subtopic?.best_accuracy) || 0,
    };
  });
  const counts = { error: 0, low_confidence: 0, recurring: 0, scheduled: 0 };
  const describedDue = allDue.map((item) => ({ ...item, ...describeReviewItem(item, now) }));
  for (const item of describedDue) counts[item.type] += 1;
  const validFuture = data.validItems.filter((item) => item.status !== 'frozen' && validDate(item.nextReviewAt) > now);
  return {
    scopeKey: scope.scopeKey,
    items: planItems,
    counts,
    total: planItems.length,
    due: allDue.length,
    urgent: describedDue.filter((item) => item.priority.tone === 'urgent').length,
    future: validFuture.length,
    frozen: data.validItems.filter((item) => item.status === 'frozen').length,
    invalid: data.invalidItems.length,
    nextReviewAt: validFuture.map((item) => item.nextReviewAt).sort()[0] || planItems.map((item) => item.nextReviewAt).sort()[0] || null,
  };
}

function isCorrectAnswer(question, userAnswer) {
  if (question.format === 'certo_errado') {
    const answer = userAnswer === true || userAnswer === 'true' || userAnswer === 'Certo' || userAnswer === 'C';
    const expected = question.correct_answer === true || question.correct_answer === 'true' || question.correct_answer === 'Certo';
    return answer === expected;
  }
  return text(userAnswer) === text(question.correct_answer);
}

function answerJournalKey(session, questionId) {
  return `review_answer:${session.scopeKey}:${session.id}:${questionId}`;
}

async function saveJournal(repo, journal) {
  await repo.put(STORES.meta, structuredClone(journal));
}

function reconcileSession(session, result, updatedItem) {
  const already = session.results.some((entry) => entry.eventId === result.eventId);
  if (!already) {
    session.items[session.index] = structuredClone(updatedItem);
    session.results.push(structuredClone(result));
    if (result.correct) session.correct += 1;
    else session.errors += 1;
    if (session.results.length >= session.questions.length) {
      session.finished = true;
      session.finishedAt = result.at;
      session.index = Math.max(0, session.questions.length - 1);
    } else session.index += 1;
  }
  return already;
}

export async function answerReviewQuestion(session, userAnswer, now = new Date(), {
  repository = progressRepository,
  userId = null,
  contestId = null,
} = {}) {
  assertSessionScope(session, { userId, contestId });
  const currentScope = currentValidationScope({ userId, contestId });
  const preliminary = validateReviewSession(session, sessionValidationContext(currentScope));
  if (!preliminary.valid || session.finished) throw new Error('REVIEW_SESSION_INVALID');
  const scope = { userId: text(session.userId), contestId: text(session.contestId), scopeKey: text(session.scopeKey) };
  const repo = scopedRepository(repository, scope);
  const subtopics = await repo.getAll(STORES.subtopics);
  const validationContext = sessionValidationContext(currentScope, subtopics);
  const validation = validateReviewSession(session, validationContext);
  if (!validation.valid) throw new Error('REVIEW_SESSION_INVALID');
  const question = session.questions[session.index];
  const queueItem = session.items[session.index];
  if (!question || !queueItem) throw new Error('REVIEW_QUESTION_UNAVAILABLE');
  const eventId = `review:${session.id}:${question.id}`;
  const key = answerJournalKey(session, question.id);
  let journal = await repo.getById(STORES.meta, key);
  const eventAlreadyCompleted = journal?.status === 'completed';
  if (!journal) {
    const subtopic = await repo.getById(STORES.subtopics, queueItem.subtopicId);
    if (!subtopic || text(subtopic.discipline_id) !== text(queueItem.disciplineId)) throw new Error('REVIEW_SUBTOPIC_INVALID');
    const persisted = await repo.getById(STORES.reviewQueue, question.id) || queueItem;
    const correct = isCorrectAnswer(question, userAnswer);
    const updatedItem = applyReviewEvent(persisted, questionInput(question, subtopic, session.contestId), {
      now, correct, isReview: true, reason: 'review', subtopicMastery: subtopic.best_accuracy || 0,
    });
    updatedItem.processed_review_event_ids = boundedProcessedIds(persisted.processed_review_event_ids, eventId);
    const result = {
      eventId,
      questionId: question.id,
      correct,
      selectedAnswer: userAnswer,
      correctAnswer: question.correct_answer,
      at: now.toISOString(),
      memoryState: updatedItem.memoryState,
      previousMemoryState: persisted.memoryState,
      nextReviewAt: updatedItem.nextReviewAt,
    };
    journal = {
      key,
      sessionId: session.id,
      scopeKey: session.scopeKey,
      contestId: session.contestId,
      userId: session.userId || null,
      status: 'processing',
      steps: { queue: false, subtopic: false, verticalized: false },
      updatedItem,
      result,
      started_at: now.toISOString(),
      updated_at: now.toISOString(),
      completed_at: null,
    };
    await saveJournal(repo, journal);
  }
  if (journal.scopeKey !== session.scopeKey || journal.sessionId !== session.id) throw new Error('REVIEW_CONTEXT_CHANGED');
  const result = journal.result;
  if (!journal.steps.queue) {
    assertSessionScope(session, { userId, contestId });
    await repo.put(STORES.reviewQueue, journal.updatedItem);
    journal.steps.queue = true;
    journal.updated_at = now.toISOString();
    await saveJournal(repo, journal);
  }
  if (!journal.steps.subtopic) {
    assertSessionScope(session, { userId, contestId });
    const subtopic = await repo.getById(STORES.subtopics, queueItem.subtopicId);
    const processed = subtopic?.processed_review_event_ids || [];
    if (!subtopic) throw new Error('REVIEW_SUBTOPIC_INVALID');
    if (!processed.includes(result.eventId)) {
      const updated = applyReviewHistoryToSubtopic(subtopic, result);
      updated.processed_review_event_ids = boundedProcessedIds(processed, result.eventId);
      await repo.put(STORES.subtopics, updated);
    }
    journal.steps.subtopic = true;
    journal.updated_at = now.toISOString();
    await saveJournal(repo, journal);
  }
  if (!journal.steps.verticalized) {
    assertSessionScope(session, { userId, contestId });
    const verticalized = await repo.getById(STORES.verticalized, `v_${queueItem.subtopicId}`);
    if (verticalized) {
      const processed = verticalized.processed_review_event_ids || [];
      if (!processed.includes(result.eventId)) {
        await repo.put(STORES.verticalized, {
          ...verticalized,
          review_count: (Number(verticalized.review_count) || 0) + 1,
          last_review_date: result.at,
          processed_review_event_ids: boundedProcessedIds(processed, result.eventId),
        });
      }
    }
    journal.steps.verticalized = true;
    journal.status = 'completed';
    journal.completed_at = now.toISOString();
    journal.updated_at = now.toISOString();
    await saveJournal(repo, journal);
  }
  trackReviewActivity(session, now);
  const already = reconcileSession(session, result, journal.updatedItem);
  const reconciled = validateReviewSession(session, validationContext);
  if (!reconciled.valid) throw new Error('REVIEW_SESSION_CORRUPTED');
  return {
    ...result,
    question,
    explanation: question.explanation,
    isLast: session.finished,
    applied: !already && !eventAlreadyCompleted && journal.status === 'completed',
  };
}

function reviewJournalKey(session) {
  return `review_finalization:${session.scopeKey}:${session.id}`;
}

async function saveFinalizationJournal(repo, journal, nowIso, step = null, completed = false) {
  if (step) journal.steps[step] = true;
  journal.updated_at = nowIso;
  if (completed) {
    journal.status = 'completed';
    journal.completed_at = nowIso;
  }
  await saveJournal(repo, journal);
}

export async function getReviewResult(sessionId, context = {}, {
  repository = progressRepository,
} = {}) {
  const scope = scopeFrom(repository, context);
  const repo = scopedRepository(repository, scope);
  const key = `review_finalization:${scope.scopeKey}:${sessionId}`;
  const journal = await repo.getById(STORES.meta, key);
  if (!journal || journal.status !== 'completed' || journal.scopeKey !== scope.scopeKey) return null;
  return structuredClone(journal.summary);
}

export async function finalizeReviewSession(session, {
  repository = progressRepository,
  now = () => new Date(),
  userId = null,
  contestId = null,
} = {}) {
  assertSessionScope(session, { userId, contestId });
  const currentScope = currentValidationScope({ userId, contestId });
  const preliminary = validateReviewSession(session, sessionValidationContext(currentScope));
  if (!preliminary.valid || session.finished !== true || !session.results?.length) throw new Error('REVIEW_SESSION_NOT_FINISHED');
  const scope = { userId: text(session.userId), contestId: text(session.contestId), scopeKey: text(session.scopeKey) };
  const repo = scopedRepository(repository, scope);
  const subtopics = await repo.getAll(STORES.subtopics);
  const validation = validateReviewSession(session, sessionValidationContext(currentScope, subtopics));
  if (!validation.valid) throw new Error('REVIEW_SESSION_NOT_FINISHED');
  const finished = validDate(session.finishedAt) || now();
  const finishedAt = finished.toISOString();
  const key = reviewJournalKey(session);
  const stored = await repo.getById(STORES.meta, key);
  const journal = {
    key,
    reviewSessionId: session.id,
    scopeKey: session.scopeKey,
    contestId: session.contestId,
    userId: session.userId || null,
    status: stored?.status === 'completed' ? 'completed' : 'processing',
    steps: Object.fromEntries(REVIEW_FINALIZATION_STEPS.map((step) => [step, stored?.steps?.[step] === true])),
    started_at: stored?.started_at || session.startedAt,
    updated_at: stored?.updated_at || finishedAt,
    completed_at: stored?.completed_at || null,
    summary: stored?.summary || null,
  };
  if (journal.status === 'completed') return { ...journal.summary, applied: false, newInsignias: [] };
  if (!stored) await saveJournal(repo, journal);
  const transitions = { morna: 0, fria: 0, congelada: 0 };
  for (const result of session.results) if (Object.hasOwn(transitions, result.memoryState)) transitions[result.memoryState] += 1;
  const summary = journal.summary || {
    total: session.questions.length,
    reviewed: session.results.length,
    correct: session.results.filter((result) => result.correct).length,
    errors: session.results.filter((result) => !result.correct).length,
    unanswered: Math.max(0, session.questions.length - session.results.length),
    strengthened: session.results.filter((result) => result.correct && result.memoryState !== result.previousMemoryState).length,
    hot: session.items.filter((item) => item.memoryState === 'quente').length,
    transitions,
    nextReviewAt: session.items.map((item) => item.nextReviewAt).filter((value) => validDate(value)).sort()[0] || null,
    activeSeconds: Math.max(0, Number(session.activeSeconds) || 0),
    finishedAt,
  };
  journal.summary = summary;
  if (!journal.steps.history) {
    const history = (await repo.getMeta('review_session_history')) || [];
    await repo.setMeta('review_session_history', [...history.filter((item) => item.id !== session.id), { id: session.id, ...summary }].slice(-100));
    await saveFinalizationJournal(repo, journal, finishedAt, 'history');
  }
  if (!journal.steps.xp) {
    summary.xp = await grantXpEvent({
      eventId: `review:${session.id}`, type: 'review_completed', amount: XP_REWARDS.REVIEW_COMPLETED, occurredAt: finishedAt,
    }, { repository: repo });
    journal.summary = summary;
    await saveFinalizationJournal(repo, journal, finishedAt, 'xp');
  }
  if (!journal.steps.dailyGoal) {
    summary.dailyGoal = await applyDailyGoalActivity({
      eventId: `review:${session.id}`, type: 'review', questionCount: summary.reviewed,
      battleCount: 0, activeMinutes: Math.floor(summary.activeSeconds / 60), occurredAt: finished,
    }, { repository: repo });
    journal.summary = summary;
    await saveFinalizationJournal(repo, journal, finishedAt, 'dailyGoal');
  }
  const valid = summary.reviewed > 0 && summary.activeSeconds > 0;
  if (!journal.steps.streak) {
    summary.streak = await applyValidStudyDay({
      eventId: `review:${session.id}`, occurredAt: finished, valid, source: 'intelligent_review',
    }, { repository: repo });
    journal.summary = summary;
    await saveFinalizationJournal(repo, journal, finishedAt, 'streak');
  }
  if (!journal.steps.activity) {
    const disciplineIds = [...new Set(session.items.map((item) => item.disciplineId).filter(Boolean))];
    const subtopicIds = [...new Set(session.items.map((item) => item.subtopicId).filter(Boolean))];
    summary.activity = {
      id: `academic_review:${session.id}`, type: 'review', source: 'intelligent_review',
      date: localDateKey(finished), startedAt: session.startedAt, finishedAt,
      durationSeconds: summary.activeSeconds, elapsedSeconds: summary.activeSeconds,
      status: 'completed', valid, updatedAt: finishedAt,
      ...(disciplineIds.length === 1 ? { disciplineId: disciplineIds[0], subjectId: disciplineIds[0] } : {}),
      ...(subtopicIds.length === 1 ? { subtopicId: subtopicIds[0] } : {}),
    };
    await repo.put(STORES.studySessions, summary.activity);
    journal.summary = summary;
    await saveFinalizationJournal(repo, journal, finishedAt, 'activity');
  }
  let newInsignias = [];
  if (!journal.steps.emblems) {
    const result = await refreshEmblems({ repository: repo });
    newInsignias = result.unlocked || [];
    summary.newEmblemIds = newInsignias.map((item) => item.id);
    journal.summary = summary;
    await saveFinalizationJournal(repo, journal, finishedAt, 'emblems');
  }
  journal.summary = summary;
  await saveFinalizationJournal(repo, journal, finishedAt, 'summary', true);
  return { ...summary, applied: true, newInsignias };
}

export async function getReviewDashboardData(now = new Date(), {
  repository = progressRepository,
  userId = null,
  contestId = null,
} = {}) {
  const scope = scopeFrom(repository, { userId, contestId });
  const repo = scopedRepository(repository, scope);
  await ensureReviewQueueMigration({ repository: repo, ...scope });
  const data = await reviewData(repo, scope.contestId);
  const active = data.validItems.filter((item) => item.status !== 'frozen');
  const due = active.filter((item) => validDate(item.nextReviewAt) <= now);
  const upcoming = active.map((item) => item.nextReviewAt).filter((value) => validDate(value) > now).sort()[0] || null;
  const fragile = data.subtopics
    .map((subtopic) => ({
      id: subtopic.id, name: subtopic.name, mastery: Number(subtopic.best_accuracy) || 0,
      pending: due.filter((item) => item.subtopicId === subtopic.id).length,
    }))
    .filter((item) => item.pending > 0)
    .sort((a, b) => a.mastery - b.mastery || b.pending - a.pending)
    .slice(0, 3);
  const atRisk = due.filter((item) => item.memoryState === 'quente' || item.memoryState === 'morna').length;
  return { pending: due.length, due: due.length, future: active.length - due.length, invalid: data.invalidItems.length, nextReviewAt: upcoming, fragile, atRisk };
}

export function refreshReviewPriorities(items, masteryBySubtopic, now = new Date()) {
  return items.map((item) => ({
    ...item,
    priorityScore: calculateReviewPriority(item, { now, subtopicMastery: masteryBySubtopic[item.subtopicId] || 0 }),
  }));
}
