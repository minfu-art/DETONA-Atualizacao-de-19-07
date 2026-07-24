import { STORES } from '../core/types.js';
import { getActiveContestId } from '../contest/activeContest.js';
import {
  applyReviewEvent, applyReviewHistoryToSubtopic, calculateReviewPriority,
  migrateLegacyReviewItems, selectReviewItems,
} from '../core/reviewQueue.js';
import { questionService } from './questionService.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { grantXpEvent, XP_REWARDS } from './academicProgressService.js';
import { applyDailyGoalActivity } from './dailyGoalService.js';
import { applyValidStudyDay } from './studyStreakService.js';
import { refreshEmblems } from './emblemService.js';
import { localDateKey } from '../core/localDate.js';

const MIGRATION_KEY = 'intelligent_review_migration_v1';
const MAX_ACTIVE_REVIEW_GAP_SECONDS = 10 * 60;
const REVIEW_FINALIZATION_STEPS = Object.freeze([
  'history', 'xp', 'dailyGoal', 'streak', 'activity', 'emblems',
]);

export async function ensureReviewQueueMigration({
  repository = progressRepository,
} = {}) {
  if (await repository.getMeta(MIGRATION_KEY)) return repository.getAll(STORES.reviewQueue);
  const [existing, subtopics, questions] = await Promise.all([
    repository.getAll(STORES.reviewQueue),
    repository.getAll(STORES.subtopics),
    questionService.listar(),
  ]);
  const known = new Set(existing.map((item) => item.questionId));
  const migrated = migrateLegacyReviewItems(subtopics, questions, {
    contestId: getActiveContestId(), now: new Date(),
  }).filter((item) => !known.has(item.questionId));
  if (migrated.length) await repository.putMany(STORES.reviewQueue, migrated);
  await repository.setMeta(MIGRATION_KEY, { migratedAt: new Date().toISOString(), itemsCreated: migrated.length });
  return [...existing, ...migrated];
}

function createReviewSessionId() {
  if (globalThis.crypto?.randomUUID) return `review_${globalThis.crypto.randomUUID()}`;
  return `review_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function trackReviewActivity(session, at = new Date()) {
  if (!session || typeof session !== 'object') return 0;
  const current = at instanceof Date ? at : new Date(at);
  const currentMs = current.getTime();
  const previousMs = Date.parse(session.lastActiveAt || session.startedAt || '');
  if (Number.isFinite(currentMs) && Number.isFinite(previousMs) && currentMs >= previousMs) {
    session.activeSeconds = Math.max(0, Number(session.activeSeconds) || 0) + Math.min(
      MAX_ACTIVE_REVIEW_GAP_SECONDS,
      Math.max(0, Math.round((currentMs - previousMs) / 1000)),
    );
    session.lastActiveAt = current.toISOString();
  }
  return Math.max(0, Number(session.activeSeconds) || 0);
}

function questionInput(question, subtopic) {
  return {
    questionId: question.id,
    contestId: getActiveContestId(),
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
  const domainDropped = previousAttemptPercentage != null
    && ((session.correct / session.questions.length) * 100) < Number(previousAttemptPercentage);
  let added = 0;
  const battleId = String(session?.id || '').trim();
  for (const result of session.results) {
    const question = session.questions.find((item) => item.id === result.questionId);
    if (!question) continue;
    const shouldQueue = !result.correct || result.confidence === 'low' || domainDropped;
    if (!shouldQueue) continue;
    const existing = await repository.getById(STORES.reviewQueue, question.id);
    const processedBattleIds = [...new Set(existing?.processed_battle_ids || [])];
    if (battleId && processedBattleIds.includes(battleId)) continue;
    const reason = !result.correct ? 'incorrect' : result.confidence === 'low' ? 'low_confidence' : 'domain_drop';
    const item = applyReviewEvent(existing, questionInput(question, subtopic), {
      now, correct: false, reason, subtopicMastery: subtopic.best_accuracy || 0,
    });
    if (battleId) item.processed_battle_ids = [...processedBattleIds, battleId];
    item.updated_at = now.toISOString();
    await repository.put(STORES.reviewQueue, item);
    if (!existing) added += 1;
  }
  return added;
}

export async function createReviewSession(filters = {}, {
  repository = progressRepository,
  now = () => new Date(),
} = {}) {
  await ensureReviewQueueMigration({ repository });
  const [items, subtopics, questions] = await Promise.all([
    repository.getAll(STORES.reviewQueue),
    repository.getAll(STORES.subtopics),
    questionService.listar(),
  ]);
  const masteryBySubtopic = Object.fromEntries(subtopics.map((item) => [item.id, item.best_accuracy || 0]));
  const selected = selectReviewItems(items, {
    ...filters, contestId: getActiveContestId(), masteryBySubtopic, now: filters.now || new Date(), limit: 10,
  });
  const byId = new Map(questions.map((question) => [question.id, question]));
  const sessionQuestions = selected.map((item) => byId.get(item.questionId)).filter(Boolean);
  const startedAt = now().toISOString();
  return {
    id: createReviewSessionId(),
    contestId: getActiveContestId(),
    items: selected.filter((item) => byId.has(item.questionId)),
    questions: sessionQuestions,
    index: 0, correct: 0, errors: 0, results: [], finished: false,
    startedAt,
    lastActiveAt: startedAt,
    activeSeconds: 0,
  };
}

export function describeReviewItem(item, now = new Date()) {
  const recurring = (Number(item?.errorCount) || 0) >= 2 || (Number(item?.consecutiveErrors) || 0) >= 2;
  const type = item?.lastResult === 'low_confidence'
    ? 'low_confidence'
    : recurring || item?.lastResult === 'domain_drop'
      ? 'recurring'
      : item?.lastResult === 'incorrect'
        ? 'error'
        : 'scheduled';
  const due = !item?.nextReviewAt || new Date(item.nextReviewAt) <= now;
  const definitions = {
    error: { label: 'Erro recente', reason: 'Resposta incorreta registrada durante uma missão.', tone: 'error' },
    low_confidence: { label: 'Baixa confiança', reason: 'Você acertou ou respondeu, mas sinalizou dúvida no conteúdo.', tone: 'confidence' },
    recurring: { label: 'Recorrência', reason: 'Este item voltou à fila por erros repetidos ou queda de desempenho.', tone: 'recurring' },
    scheduled: { label: 'Agendada', reason: 'Revisão programada pelo ciclo de memória espaçada.', tone: 'scheduled' },
  };
  const definition = definitions[type];
  const priority = due && type === 'recurring'
    ? { label: 'Urgente', tone: 'urgent' }
    : due
      ? { label: 'Alta', tone: 'high' }
      : { label: 'Programada', tone: 'scheduled' };
  return { type, due, ...definition, priority };
}

export async function getReviewPlanData(filters = {}, now = new Date(), {
  repository = progressRepository,
} = {}) {
  await ensureReviewQueueMigration({ repository });
  const [items, subtopics, questions] = await Promise.all([
    repository.getAll(STORES.reviewQueue),
    repository.getAll(STORES.subtopics),
    questionService.listar(),
  ]);
  const masteryBySubtopic = Object.fromEntries(subtopics.map((item) => [item.id, item.best_accuracy || 0]));
  const subtopicById = new Map(subtopics.map((item) => [item.id, item]));
  const questionById = new Map(questions.map((item) => [item.id, item]));
  const selected = selectReviewItems(items, {
    ...filters, contestId: getActiveContestId(), masteryBySubtopic, now, limit: 10,
  }).filter((item) => questionById.has(item.questionId));
  const planItems = selected.map((item, index) => {
    const presentation = describeReviewItem(item, now);
    const question = questionById.get(item.questionId);
    const subtopic = subtopicById.get(item.subtopicId);
    return {
      ...item,
      ...presentation,
      order: index + 1,
      question,
      subtopicName: subtopic?.name || 'Conteúdo do edital',
      mastery: Number(subtopic?.best_accuracy) || 0,
    };
  });
  const counts = { error: 0, low_confidence: 0, recurring: 0, scheduled: 0 };
  for (const item of planItems) counts[item.type] += 1;
  return {
    items: planItems,
    counts,
    total: planItems.length,
    due: planItems.filter((item) => item.due).length,
    urgent: planItems.filter((item) => item.priority.tone === 'urgent').length,
    nextReviewAt: planItems.map((item) => item.nextReviewAt).filter(Boolean).sort()[0] || null,
  };
}

function isCorrectAnswer(question, userAnswer) {
  if (question.format === 'certo_errado') {
    const answer = userAnswer === true || userAnswer === 'true' || userAnswer === 'Certo' || userAnswer === 'C';
    const expected = question.correct_answer === true || question.correct_answer === 'true' || question.correct_answer === 'Certo';
    return answer === expected;
  }
  return String(userAnswer) === String(question.correct_answer);
}

export async function answerReviewQuestion(session, userAnswer, now = new Date(), {
  repository = progressRepository,
} = {}) {
  const question = session.questions[session.index];
  const queueItem = session.items[session.index];
  if (!question || !queueItem || session.finished) return null;
  trackReviewActivity(session, now);
  const correct = isCorrectAnswer(question, userAnswer);
  const eventId = `review:${session.id}:${question.id}`;
  const persistedQueueItem = await repository.getById(STORES.reviewQueue, question.id) || queueItem;
  const processedReviewEventIds = [...new Set(persistedQueueItem.processed_review_event_ids || [])];
  if (processedReviewEventIds.includes(eventId)) {
    const previous = session.results.find((item) => item.eventId === eventId);
    return {
      correct: previous?.correct ?? correct,
      question,
      explanation: question.explanation,
      memoryState: previous?.memoryState || persistedQueueItem.memoryState,
      isLast: session.finished,
      applied: false,
    };
  }
  const subtopic = await repository.getById(STORES.subtopics, queueItem.subtopicId);
  const updatedItem = applyReviewEvent(queueItem, questionInput(question, subtopic), {
    now, correct, isReview: true, reason: 'review', subtopicMastery: subtopic.best_accuracy || 0,
  });
  updatedItem.processed_review_event_ids = [...processedReviewEventIds, eventId].slice(-1000);
  await repository.put(STORES.reviewQueue, updatedItem);
  const historyResult = {
    eventId,
    questionId: question.id,
    correct,
    at: now.toISOString(),
    memoryState: updatedItem.memoryState,
  };
  await repository.put(STORES.subtopics, applyReviewHistoryToSubtopic(subtopic, historyResult));
  const verticalized = await repository.getById(STORES.verticalized, `v_${subtopic.id}`);
  if (verticalized) {
    const processed = [...new Set(verticalized.processed_review_event_ids || [])];
    if (!processed.includes(eventId)) {
      await repository.put(STORES.verticalized, {
        ...verticalized,
        review_count: (Number(verticalized.review_count) || 0) + 1,
        last_review_date: now.toISOString(),
        processed_review_event_ids: [...processed, eventId].slice(-1000),
      });
    }
  }
  session.items[session.index] = updatedItem;
  session.results.push({ ...historyResult, previousMemoryState: queueItem.memoryState });
  if (correct) session.correct += 1;
  else session.errors += 1;
  if (session.index >= session.questions.length - 1) {
    session.finished = true;
    session.finishedAt = now.toISOString();
  }
  else session.index += 1;
  return {
    correct,
    question,
    explanation: question.explanation,
    memoryState: updatedItem.memoryState,
    isLast: session.finished,
    applied: true,
  };
}

function reviewJournalKey(sessionId) {
  return `review_finalization:${sessionId}`;
}

async function saveReviewJournal(repository, journal, nowIso, step = null, completed = false) {
  if (step) journal.steps[step] = true;
  journal.updated_at = nowIso;
  if (completed) {
    journal.status = 'completed';
    journal.completed_at = nowIso;
  }
  await repository.put(STORES.meta, structuredClone(journal));
}

export async function finalizeReviewSession(session, {
  repository = progressRepository,
  now = () => new Date(),
} = {}) {
  if (!session?.id || session.finished !== true || !session.results?.length) {
    throw new Error('REVIEW_SESSION_NOT_FINISHED');
  }
  const finished = session.finishedAt ? new Date(session.finishedAt) : now();
  const finishedAt = finished.toISOString();
  const key = reviewJournalKey(session.id);
  const stored = await repository.getById(STORES.meta, key);
  const journal = {
    key,
    reviewSessionId: session.id,
    status: stored?.status === 'completed' ? 'completed' : 'processing',
    steps: Object.fromEntries(REVIEW_FINALIZATION_STEPS.map((step) => [
      step, stored?.steps?.[step] === true,
    ])),
    started_at: stored?.started_at || session.startedAt,
    updated_at: stored?.updated_at || finishedAt,
    completed_at: stored?.completed_at || null,
    summary: stored?.summary || null,
  };
  if (journal.status === 'completed') {
    return { ...journal.summary, applied: false, newInsignias: [] };
  }
  if (!stored) await repository.put(STORES.meta, structuredClone(journal));

  const strengthened = session.results.filter((result) => result.correct && result.memoryState !== result.previousMemoryState).length;
  const transitions = { morna: 0, fria: 0, congelada: 0 };
  for (const result of session.results) if (Object.hasOwn(transitions, result.memoryState)) transitions[result.memoryState] += 1;
  const nextDates = session.items.map((item) => item.nextReviewAt).filter(Boolean).sort();
  const summary = {
    reviewed: session.results.length, correct: session.correct, errors: session.errors,
    strengthened, hot: session.items.filter((item) => item.memoryState === 'quente').length,
    transitions, nextReviewAt: nextDates[0] || null, finishedAt,
  };
  journal.summary = summary;

  if (!journal.steps.history) {
    const history = (await repository.getMeta('review_session_history')) || [];
    const withoutDuplicate = history.filter((item) => item.id !== session.id);
    await repository.setMeta('review_session_history', [
      ...withoutDuplicate,
      { id: session.id, ...summary },
    ].slice(-100));
    await saveReviewJournal(repository, journal, finishedAt, 'history');
  }

  if (!journal.steps.xp) {
    await grantXpEvent({
      eventId: `review:${session.id}`,
      type: 'review_completed',
      amount: XP_REWARDS.REVIEW_COMPLETED,
      occurredAt: finishedAt,
    }, { repository });
    await saveReviewJournal(repository, journal, finishedAt, 'xp');
  }

  if (!journal.steps.dailyGoal) {
    summary.dailyGoal = await applyDailyGoalActivity({
      eventId: `review:${session.id}`,
      type: 'review',
      questionCount: summary.reviewed,
      battleCount: 0,
      activeMinutes: Math.floor(Math.max(0, Number(session.activeSeconds) || 0) / 60),
      occurredAt: finished,
    }, { repository });
    await saveReviewJournal(repository, journal, finishedAt, 'dailyGoal');
  }

  const valid = summary.reviewed > 0 && Number(session.activeSeconds) > 0;
  if (!journal.steps.streak) {
    summary.streak = await applyValidStudyDay({
      eventId: `review:${session.id}`,
      occurredAt: finished,
      valid,
      source: 'intelligent_review',
    }, { repository });
    await saveReviewJournal(repository, journal, finishedAt, 'streak');
  }

  if (!journal.steps.activity) {
    const disciplineIds = [...new Set(session.items.map((item) => item.disciplineId).filter(Boolean))];
    const subtopicIds = [...new Set(session.items.map((item) => item.subtopicId).filter(Boolean))];
    const seconds = Math.max(0, Math.round(Number(session.activeSeconds) || 0));
    summary.activity = {
      id: `academic_review:${session.id}`,
      type: 'review',
      source: 'intelligent_review',
      date: localDateKey(finished),
      startedAt: session.startedAt,
      finishedAt,
      durationSeconds: seconds,
      elapsedSeconds: seconds,
      status: 'completed',
      valid,
      updatedAt: finishedAt,
      ...(disciplineIds.length === 1 ? { disciplineId: disciplineIds[0], subjectId: disciplineIds[0] } : {}),
      ...(subtopicIds.length === 1 ? { subtopicId: subtopicIds[0] } : {}),
    };
    await repository.put(STORES.studySessions, summary.activity);
    await saveReviewJournal(repository, journal, finishedAt, 'activity');
  }

  let newInsignias = [];
  if (!journal.steps.emblems) {
    const result = await refreshEmblems({ repository });
    newInsignias = result.unlocked || [];
    await saveReviewJournal(repository, journal, finishedAt, 'emblems', true);
  }
  journal.summary = summary;
  await saveReviewJournal(repository, journal, finishedAt, null, true);
  return { ...summary, applied: true, newInsignias };
}

export async function getReviewDashboardData(now = new Date(), {
  repository = progressRepository,
} = {}) {
  await ensureReviewQueueMigration({ repository });
  const [items, subtopics] = await Promise.all([
    repository.getAll(STORES.reviewQueue),
    repository.getAll(STORES.subtopics),
  ]);
  const active = items.filter((item) => item.status !== 'frozen' || new Date(item.nextReviewAt) <= now);
  const due = active.filter((item) => new Date(item.nextReviewAt) <= now);
  const upcoming = items.map((item) => item.nextReviewAt).filter(Boolean).sort()[0] || null;
  const fragile = subtopics
    .map((subtopic) => ({ id: subtopic.id, name: subtopic.name, mastery: Number(subtopic.best_accuracy) || 0,
      pending: active.filter((item) => item.subtopicId === subtopic.id).length }))
    .filter((item) => item.pending > 0).sort((a, b) => a.mastery - b.mastery || b.pending - a.pending).slice(0, 3);
  const atRisk = active.filter((item) => item.memoryState === 'quente' || item.memoryState === 'morna').length;
  return { pending: active.length, due: due.length, nextReviewAt: upcoming, fragile, atRisk };
}

export function refreshReviewPriorities(items, masteryBySubtopic, now = new Date()) {
  return items.map((item) => ({ ...item, priorityScore: calculateReviewPriority(item, {
    now, subtopicMastery: masteryBySubtopic[item.subtopicId] || 0,
  }) }));
}
