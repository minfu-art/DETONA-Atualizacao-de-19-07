import { isQuestionEligible } from './questionSchema.js';

export const CHALLENGE_QUESTION_COUNT = 10;
const DAY_MS = 86400000;

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectionHistoryFromSubtopic(subtopic = {}) {
  const history = subtopic.question_history || subtopic.historicoQuestoes || {};
  if (history && typeof history === 'object' && !Array.isArray(history) && Object.keys(history).length) return history;

  const answered = new Set(subtopic.answered_question_ids || subtopic.questoesRespondidas || []);
  const correct = new Set(subtopic.correct_question_ids || subtopic.questoesAcertadas || []);
  const incorrect = new Set(subtopic.incorrect_question_ids || subtopic.questoesErradas || []);
  const lastAnsweredAt = subtopic.last_attempt_at || subtopic.ultimaData || null;
  return Object.fromEntries([...answered].map((questionId) => [questionId, {
    attempts: 1,
    correctCount: correct.has(questionId) ? 1 : 0,
    incorrectCount: incorrect.has(questionId) ? 1 : 0,
    lastAnsweredAt,
    lastCorrect: correct.has(questionId) && !incorrect.has(questionId),
  }]));
}

export function questionPriority(question, history = {}, now = new Date()) {
  const entry = history?.[question.id];
  if (!entry || !(Number(entry.attempts) > 0) || !entry.lastAnsweredAt) return { tier: 1, lastAnsweredAt: 0 };

  const answeredAt = timestamp(entry.lastAnsweredAt);
  const ageDays = Math.max(0, (now.getTime() - answeredAt) / DAY_MS);
  if (ageDays >= 30) return { tier: 2, lastAnsweredAt: answeredAt };
  if (entry.lastCorrect === false || Number(entry.incorrectCount) > 0) return { tier: 3, lastAnsweredAt: answeredAt };
  if (ageDays >= 7) return { tier: 4, lastAnsweredAt: answeredAt };
  return { tier: 5, lastAnsweredAt: answeredAt };
}

export function selectIntelligentQuestions(
  questions = [], history = {}, count = CHALLENGE_QUESTION_COUNT,
  now = new Date(), subtopicId = null, random = Math.random,
) {
  const unique = new Map();
  const targetSubtopicId = subtopicId || questions.find(isQuestionEligible)?.subtopic_id;
  for (const question of questions) {
    if (!isQuestionEligible(question) || question.subtopic_id !== targetSubtopicId || unique.has(question.id)) continue;
    unique.set(question.id, question);
  }
  return [...unique.values()]
    .map((question) => ({ question, priority: questionPriority(question, history, now), tieBreaker: random() }))
    .sort((a, b) => a.priority.tier - b.priority.tier
      || a.priority.lastAnsweredAt - b.priority.lastAnsweredAt
      || a.tieBreaker - b.tieBreaker
      || String(a.question.id).localeCompare(String(b.question.id)))
    .slice(0, count)
    .map(({ question }) => question);
}
