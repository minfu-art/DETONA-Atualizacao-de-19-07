import { STORES, getAll, getById, put, putMany, getMeta, setMeta } from '../core/db.js';
import { getActiveContestId } from '../contest/activeContest.js';
import {
  applyReviewEvent, applyReviewHistoryToSubtopic, calculateReviewPriority,
  migrateLegacyReviewItems, selectReviewItems,
} from '../core/reviewQueue.js';
import { questionService } from './questionService.js';

const MIGRATION_KEY = 'intelligent_review_migration_v1';

export async function ensureReviewQueueMigration() {
  if (await getMeta(MIGRATION_KEY)) return getAll(STORES.reviewQueue);
  const [existing, subtopics, questions] = await Promise.all([
    getAll(STORES.reviewQueue), getAll(STORES.subtopics), questionService.listar(),
  ]);
  const known = new Set(existing.map((item) => item.questionId));
  const migrated = migrateLegacyReviewItems(subtopics, questions, {
    contestId: getActiveContestId(), now: new Date(),
  }).filter((item) => !known.has(item.questionId));
  if (migrated.length) await putMany(STORES.reviewQueue, migrated);
  await setMeta(MIGRATION_KEY, { migratedAt: new Date().toISOString(), itemsCreated: migrated.length });
  return [...existing, ...migrated];
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

export async function recordBattleReviewEvents(session, subtopic, previousAttemptPercentage = null, now = new Date()) {
  const domainDropped = previousAttemptPercentage != null
    && ((session.correct / session.questions.length) * 100) < Number(previousAttemptPercentage);
  let added = 0;
  for (const result of session.results) {
    const question = session.questions.find((item) => item.id === result.questionId);
    if (!question) continue;
    const shouldQueue = !result.correct || result.confidence === 'low' || domainDropped;
    if (!shouldQueue) continue;
    const existing = await getById(STORES.reviewQueue, question.id);
    const reason = !result.correct ? 'incorrect' : result.confidence === 'low' ? 'low_confidence' : 'domain_drop';
    const item = applyReviewEvent(existing, questionInput(question, subtopic), {
      now, correct: false, reason, subtopicMastery: subtopic.best_accuracy || 0,
    });
    await put(STORES.reviewQueue, item);
    if (!existing) added += 1;
  }
  return added;
}

export async function createReviewSession(filters = {}) {
  await ensureReviewQueueMigration();
  const [items, subtopics, questions] = await Promise.all([
    getAll(STORES.reviewQueue), getAll(STORES.subtopics), questionService.listar(),
  ]);
  const masteryBySubtopic = Object.fromEntries(subtopics.map((item) => [item.id, item.best_accuracy || 0]));
  const selected = selectReviewItems(items, {
    ...filters, contestId: getActiveContestId(), masteryBySubtopic, now: filters.now || new Date(), limit: 10,
  });
  const byId = new Map(questions.map((question) => [question.id, question]));
  const sessionQuestions = selected.map((item) => byId.get(item.questionId)).filter(Boolean);
  return {
    id: `review_${Date.now()}`,
    contestId: getActiveContestId(),
    items: selected.filter((item) => byId.has(item.questionId)),
    questions: sessionQuestions,
    index: 0, correct: 0, errors: 0, results: [], finished: false,
    startedAt: new Date().toISOString(),
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

export async function getReviewPlanData(filters = {}, now = new Date()) {
  await ensureReviewQueueMigration();
  const [items, subtopics, questions] = await Promise.all([
    getAll(STORES.reviewQueue), getAll(STORES.subtopics), questionService.listar(),
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

export async function answerReviewQuestion(session, userAnswer, now = new Date()) {
  const question = session.questions[session.index];
  const queueItem = session.items[session.index];
  if (!question || !queueItem || session.finished) return null;
  const correct = isCorrectAnswer(question, userAnswer);
  const subtopic = await getById(STORES.subtopics, queueItem.subtopicId);
  const updatedItem = applyReviewEvent(queueItem, questionInput(question, subtopic), {
    now, correct, isReview: true, reason: 'review', subtopicMastery: subtopic.best_accuracy || 0,
  });
  await put(STORES.reviewQueue, updatedItem);
  const historyResult = { questionId: question.id, correct, at: now.toISOString(), memoryState: updatedItem.memoryState };
  await put(STORES.subtopics, applyReviewHistoryToSubtopic(subtopic, historyResult));
  const verticalized = await getById(STORES.verticalized, `v_${subtopic.id}`);
  if (verticalized) await put(STORES.verticalized, {
    ...verticalized,
    review_count: (Number(verticalized.review_count) || 0) + 1,
    last_review_date: now.toISOString(),
  });
  session.items[session.index] = updatedItem;
  session.results.push({ ...historyResult, previousMemoryState: queueItem.memoryState });
  if (correct) session.correct += 1;
  else session.errors += 1;
  if (session.index >= session.questions.length - 1) session.finished = true;
  else session.index += 1;
  return { correct, question, explanation: question.explanation, memoryState: updatedItem.memoryState, isLast: session.finished };
}

export async function finalizeReviewSession(session) {
  const strengthened = session.results.filter((result) => result.correct && result.memoryState !== result.previousMemoryState).length;
  const transitions = { morna: 0, fria: 0, congelada: 0 };
  for (const result of session.results) if (Object.hasOwn(transitions, result.memoryState)) transitions[result.memoryState] += 1;
  const nextDates = session.items.map((item) => item.nextReviewAt).filter(Boolean).sort();
  const summary = {
    reviewed: session.results.length, correct: session.correct, errors: session.errors,
    strengthened, hot: session.items.filter((item) => item.memoryState === 'quente').length,
    transitions, nextReviewAt: nextDates[0] || null, finishedAt: new Date().toISOString(),
  };
  const history = (await getMeta('review_session_history')) || [];
  await setMeta('review_session_history', [...history, { id: session.id, ...summary }].slice(-100));
  return summary;
}

export async function getReviewDashboardData(now = new Date()) {
  await ensureReviewQueueMigration();
  const [items, subtopics] = await Promise.all([getAll(STORES.reviewQueue), getAll(STORES.subtopics)]);
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
