import { starsFromAccuracy } from './progression.js';

export const OFFICIAL_MASTERY_QUESTION_COUNT = 10;
const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const uniqueIds = (values = []) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
const firstArray = (...values) => values.find((value) => Array.isArray(value) && value.length)
  || values.find(Array.isArray) || [];

function normalizeQuestionHistory(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([questionId, entry]) => [questionId, {
    attempts: Math.max(0, Number(entry?.attempts) || 0),
    correctCount: Math.max(0, Number(entry?.correctCount) || 0),
    incorrectCount: Math.max(0, Number(entry?.incorrectCount) || 0),
    lastAnsweredAt: entry?.lastAnsweredAt || null,
    lastCorrect: entry?.lastCorrect === true,
  }]));
}

function bestHistory(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length)
    || values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

export function clampMastery(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

export function masteryFromAttempt(correct, total) {
  const correctCount = Number(correct);
  const totalCount = Number(total);
  if (!Number.isInteger(correctCount) || !Number.isInteger(totalCount)) return null;
  if (totalCount !== OFFICIAL_MASTERY_QUESTION_COUNT || correctCount < 0 || correctCount > totalCount) return null;
  return (correctCount / totalCount) * 100;
}

export function subtopicMastery(subtopic) {
  return clampMastery(subtopic?.melhorPercentual ?? subtopic?.best_accuracy ?? 0);
}

export function averageSubtopicMastery(subtopics = []) {
  if (!subtopics.length) return 0;
  return clampMastery(subtopics.reduce((sum, subtopic) => sum + subtopicMastery(subtopic), 0) / subtopics.length);
}

export function disciplineMastery(subtopics = [], disciplineId) {
  return averageSubtopicMastery(subtopics.filter((subtopic) => subtopic.discipline_id === disciplineId));
}

export function globalMastery(subtopics = []) {
  return averageSubtopicMastery(subtopics);
}

export function levelFromMastery(mastery) {
  return Math.floor(clampMastery(mastery));
}

export function migrateSubtopicMastery(subtopic = {}) {
  const next = { ...subtopic };
  const review = new Set(Array.isArray(next.mastery_migration_review) ? next.mastery_migration_review : []);
  let bestPercent = null;
  const recordedCorrect = next.melhorAcertos ?? next.best_correct_answers;
  const recordedTotal = next.totalQuestoes ?? next.best_total_questions;
  if (hasNumber(next.melhorPercentual)) bestPercent = clampMastery(next.melhorPercentual);
  else if (hasNumber(recordedCorrect) && hasNumber(recordedTotal)
    && Number(recordedTotal) > 0 && Number(recordedCorrect) >= 0 && Number(recordedCorrect) <= Number(recordedTotal)) {
    bestPercent = clampMastery((Number(recordedCorrect) / Number(recordedTotal)) * 100);
  } else if (hasNumber(next.best_accuracy)) bestPercent = clampMastery(next.best_accuracy);
  else if (hasNumber(next.accuracy)) bestPercent = clampMastery(next.accuracy);
  if (bestPercent == null) {
    bestPercent = 0;
    if ((next.stars || 0) > 0 || (next.attempts_count || 0) > 0) review.add('domínio antigo ambíguo; estrelas não foram convertidas em percentual');
  }

  let bestCorrect = next.melhorAcertos ?? next.best_correct_answers ?? null;
  let bestTotal = next.totalQuestoes ?? next.best_total_questions ?? null;
  if ((bestCorrect == null || bestTotal == null) && bestPercent % 10 === 0 && (next.attempts_count || 0) > 0) {
    bestCorrect = bestPercent / 10;
    bestTotal = OFFICIAL_MASTERY_QUESTION_COUNT;
  } else if ((next.attempts_count || 0) > 0 && (bestCorrect == null || bestTotal == null)) {
    review.add('quantidade histórica de acertos não pôde ser reconstruída com segurança');
  }

  const attempts = Number(next.tentativas ?? next.attempts_count ?? 0) || 0;
  const lastAttemptAt = next.ultimaData ?? next.ultimaTentativaEm ?? next.last_attempt_at ?? next.last_studied_at ?? null;
  const firstAttemptAt = next.primeiraTentativaEm ?? next.first_attempt_at ?? null;
  const bestResultAt = next.melhorData ?? next.melhorResultadoEm ?? next.best_result_at ?? null;
  const attemptHistory = [...firstArray(next.historico, next.historicoTentativas, next.attempt_history)];
  const answeredIds = uniqueIds(firstArray(next.questoesRespondidas, next.answered_question_ids));
  const incorrectIds = uniqueIds(firstArray(next.questoesErradas, next.incorrect_question_ids));
  const correctIds = uniqueIds(firstArray(next.questoesAcertadas, next.correct_question_ids));
  const reviewIds = uniqueIds(firstArray(next.questoesRevisao, next.review_question_ids, incorrectIds));
  const questionHistory = normalizeQuestionHistory(bestHistory(next.historicoQuestoes, next.question_history));
  if (attempts > 0 && !firstAttemptAt) review.add('data da primeira tentativa histórica indisponível');
  if (attempts > 0 && !bestResultAt) review.add('data do melhor resultado histórico indisponível');

  Object.assign(next, {
    best_accuracy: bestPercent, melhorPercentual: bestPercent,
    stars: starsFromAccuracy(bestPercent),
    best_correct_answers: bestCorrect, melhorAcertos: bestCorrect,
    best_total_questions: bestTotal, totalQuestoes: bestTotal,
    attempts_count: attempts, tentativas: attempts,
    first_attempt_at: firstAttemptAt, primeiraTentativaEm: firstAttemptAt,
    last_attempt_at: lastAttemptAt, ultimaTentativaEm: lastAttemptAt, ultimaData: lastAttemptAt,
    last_attempt_percentage: hasNumber(next.ultimaTentativa) ? clampMastery(next.ultimaTentativa) : (hasNumber(next.last_attempt_percentage) ? clampMastery(next.last_attempt_percentage) : null),
    ultimaTentativa: hasNumber(next.ultimaTentativa) ? clampMastery(next.ultimaTentativa) : (hasNumber(next.last_attempt_percentage) ? clampMastery(next.last_attempt_percentage) : null),
    best_result_at: bestResultAt, melhorResultadoEm: bestResultAt, melhorData: bestResultAt,
    best_attempt_question_ids: [...(next.questoesDaMelhorTentativa ?? next.best_attempt_question_ids ?? [])],
    questoesDaMelhorTentativa: [...(next.questoesDaMelhorTentativa ?? next.best_attempt_question_ids ?? [])],
    attempt_history: attemptHistory, historicoTentativas: [...attemptHistory], historico: [...attemptHistory],
    answered_question_ids: answeredIds, questoesRespondidas: [...answeredIds],
    incorrect_question_ids: incorrectIds, questoesErradas: [...incorrectIds],
    correct_question_ids: correctIds, questoesAcertadas: [...correctIds],
    review_question_ids: reviewIds, questoesRevisao: [...reviewIds],
    question_history: questionHistory, historicoQuestoes: { ...questionHistory },
    mastery_migration_review: [...review],
  });
  return next;
}

export function applyOfficialMasteryAttempt(subtopic, attempt) {
  const mastery = masteryFromAttempt(attempt.correct, attempt.total);
  if (mastery == null) return { subtopic: { ...subtopic }, official: false, improved: false, mastery: null };
  const next = migrateSubtopicMastery(subtopic);
  const attemptedAt = attempt.attemptedAt || new Date().toISOString();
  const questionIds = [...new Set(attempt.questionIds || [])];
  const previousBest = subtopicMastery(next);
  const improved = mastery > previousBest;
  const hadAttempt = (next.attempts_count || 0) > 0 || Number(next.best_total_questions) === OFFICIAL_MASTERY_QUESTION_COUNT;
  const replaceBest = improved || !hadAttempt;
  const attempts = (next.attempts_count || 0) + 1;
  const results = Array.isArray(attempt.results) ? attempt.results : [];
  const correctIds = uniqueIds(results.filter((result) => result.correct).map((result) => result.questionId));
  const incorrectIds = uniqueIds(results.filter((result) => !result.correct).map((result) => result.questionId));
  const historyEntry = { attemptedAt, correct: attempt.correct, total: attempt.total, percentage: mastery, questionIds, correctIds, incorrectIds };

  next.attempts_count = attempts; next.tentativas = attempts;
  next.first_attempt_at ||= attemptedAt; next.primeiraTentativaEm = next.first_attempt_at;
  next.last_attempt_at = attemptedAt; next.ultimaTentativaEm = attemptedAt;
  next.ultimaData = attemptedAt;
  next.last_attempt_percentage = mastery; next.ultimaTentativa = mastery;
  next.last_studied_at = attemptedAt;
  next.attempt_history = [...(next.attempt_history || []), historyEntry].slice(-100);
  next.historicoTentativas = [...next.attempt_history];
  next.historico = [...next.attempt_history];
  next.answered_question_ids = uniqueIds([...(next.answered_question_ids || []), ...questionIds]);
  next.questoesRespondidas = [...next.answered_question_ids];
  next.correct_question_ids = uniqueIds([...(next.correct_question_ids || []), ...correctIds]);
  next.questoesAcertadas = [...next.correct_question_ids];
  next.incorrect_question_ids = uniqueIds([...(next.incorrect_question_ids || []), ...incorrectIds]);
  next.questoesErradas = [...next.incorrect_question_ids];
  next.review_question_ids = uniqueIds([...(next.review_question_ids || []), ...incorrectIds]);
  next.questoesRevisao = [...next.review_question_ids];
  const questionHistory = normalizeQuestionHistory(next.question_history);
  for (const result of results) {
    if (!result?.questionId) continue;
    const previous = questionHistory[result.questionId] || { attempts: 0, correctCount: 0, incorrectCount: 0, lastAnsweredAt: null, lastCorrect: false };
    questionHistory[result.questionId] = {
      attempts: previous.attempts + 1,
      correctCount: previous.correctCount + (result.correct ? 1 : 0),
      incorrectCount: previous.incorrectCount + (result.correct ? 0 : 1),
      lastAnsweredAt: attemptedAt,
      lastCorrect: result.correct === true,
    };
  }
  next.question_history = questionHistory; next.historicoQuestoes = { ...questionHistory };
  if (replaceBest) {
    next.best_accuracy = mastery; next.melhorPercentual = mastery;
    next.best_correct_answers = attempt.correct; next.melhorAcertos = attempt.correct;
    next.best_total_questions = attempt.total; next.totalQuestoes = attempt.total;
    next.best_result_at = attemptedAt; next.melhorResultadoEm = attemptedAt; next.melhorData = attemptedAt;
    next.best_attempt_question_ids = questionIds; next.questoesDaMelhorTentativa = [...questionIds];
  } else {
    next.best_accuracy = previousBest; next.melhorPercentual = previousBest;
  }
  next.stars = starsFromAccuracy(next.best_accuracy);
  return { subtopic: next, official: true, improved, mastery };
}

export function applyGlobalMasteryToPlayer(player, subtopics) {
  const next = { ...player };
  if (!Number.isFinite(Number(next.xp_level))) next.xp_level = Math.max(1, Number(next.level) || 1);
  const mastery = globalMastery(subtopics);
  next.mastery_pct = mastery;
  next.level = levelFromMastery(mastery);
  return next;
}
