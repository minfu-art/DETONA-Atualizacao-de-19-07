import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';

const PERIOD_DAYS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90, all: null });

export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function periodCutoff(period = '30d', now = new Date()) {
  const days = Object.hasOwn(PERIOD_DAYS, period) ? PERIOD_DAYS[period] : PERIOD_DAYS['30d'];
  if (days == null) return null;
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return cutoff;
}

function inPeriod(value, cutoff) {
  if (!cutoff) return true;
  const date = validDate(value);
  return Boolean(date && date >= cutoff);
}

function totalsFromQuestionHistory(subtopic) {
  const entries = Object.values(subtopic.question_history || {});
  if (!entries.length) return null;
  return entries.reduce((totals, entry) => ({
    answered: totals.answered + (Number(entry.attempts) || 0),
    correct: totals.correct + (Number(entry.correctCount) || 0),
    errors: totals.errors + (Number(entry.incorrectCount) || 0),
  }), { answered: 0, correct: 0, errors: 0 });
}

function totalsFromAttempts(subtopic, cutoff = null) {
  return (subtopic.attempt_history || [])
    .filter((attempt) => inPeriod(attempt.attemptedAt, cutoff))
    .reduce((totals, attempt) => {
      const answered = Math.max(0, Number(attempt.total) || 0);
      const correct = Math.max(0, Math.min(answered, Number(attempt.correct) || 0));
      return {
        answered: totals.answered + answered,
        correct: totals.correct + correct,
        errors: totals.errors + Math.max(0, answered - correct),
      };
    }, { answered: 0, correct: 0, errors: 0 });
}

function totalsFromLegacySets(subtopic) {
  const answered = new Set(subtopic.answered_question_ids || []).size;
  const correct = new Set(subtopic.correct_question_ids || []).size;
  const errors = new Set(subtopic.incorrect_question_ids || []).size;
  return { answered, correct, errors };
}

export function subtopicQuestionTotals(subtopic, cutoff = null) {
  if (cutoff) return totalsFromAttempts(subtopic, cutoff);
  const history = totalsFromQuestionHistory(subtopic);
  if (history) return history;
  if ((subtopic.attempt_history || []).length) return totalsFromAttempts(subtopic);
  return totalsFromLegacySets(subtopic);
}

export function questionTotals(subtopics, cutoff = null) {
  return subtopics.reduce((totals, subtopic) => {
    const current = subtopicQuestionTotals(subtopic, cutoff);
    totals.answered += current.answered;
    totals.correct += current.correct;
    totals.errors += current.errors;
    return totals;
  }, { answered: 0, correct: 0, errors: 0 });
}

function classifyAccuracy(accuracy) {
  if (accuracy == null) return 'Sem respostas';
  if (accuracy >= 75) return 'Forte';
  if (accuracy >= 55) return 'Em evolução';
  if (accuracy >= 35) return 'Atenção';
  return 'Prioridade de revisão';
}

function minutesBySubtopic(blocks, cutoff) {
  const map = new Map();
  for (const block of blocks || []) {
    if (!inPeriod(block.date || block.completedAt, cutoff)) continue;
    const minutes = Number(block.actualMinutes) || 0;
    const sid = block.subtopicId || block.topicId || null;
    if (!minutes || !sid) continue;
    map.set(sid, (map.get(sid) || 0) + minutes);
  }
  return map;
}

function minutesByDiscipline(blocks, cutoff) {
  const map = new Map();
  for (const block of blocks || []) {
    if (!inPeriod(block.date || block.completedAt, cutoff)) continue;
    const minutes = Number(block.actualMinutes) || 0;
    const did = block.subjectId || block.disciplineId || null;
    if (!minutes || !did) continue;
    map.set(did, (map.get(did) || 0) + minutes);
  }
  return map;
}

function subtopicPerformanceRows(related, cutoff, minutesMap) {
  return [...related]
    .sort((a, b) => String(a.edital_numbering || '').localeCompare(String(b.edital_numbering || ''), 'pt', { numeric: true }))
    .map((subtopic) => {
      const totals = subtopicQuestionTotals(subtopic, cutoff);
      const accuracy = totals.answered ? Math.round((totals.correct / totals.answered) * 100) : null;
      const best = clampPercent(subtopic.melhorPercentual ?? subtopic.best_accuracy ?? accuracy ?? 0);
      return {
        id: subtopic.id,
        name: subtopic.name,
        numbering: subtopic.edital_numbering || '',
        answered: totals.answered,
        correct: totals.correct,
        errors: totals.errors,
        accuracy,
        classification: classifyAccuracy(accuracy),
        minutes: minutesMap.get(subtopic.id) || 0,
        stars: Number(subtopic.stars) || 0,
        masteryPct: best,
        memory: subtopic.memory_temperature || null,
      };
    });
}

function disciplinePerformance(disciplines, subtopics, cutoff, blocks = []) {
  const subMinutes = minutesBySubtopic(blocks, cutoff);
  const discMinutes = minutesByDiscipline(blocks, cutoff);
  return [...disciplines]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((discipline) => {
      const related = subtopics.filter((subtopic) => subtopic.discipline_id === discipline.id);
      const totals = questionTotals(related, cutoff);
      const accuracy = totals.answered ? Math.round((totals.correct / totals.answered) * 100) : null;
      const subRows = subtopicPerformanceRows(related, cutoff, subMinutes);
      const minutesFromSubs = subRows.reduce((sum, row) => sum + (row.minutes || 0), 0);
      const minutes = minutesFromSubs || discMinutes.get(discipline.id) || 0;
      return {
        id: discipline.id,
        name: discipline.name,
        order: Number(discipline.order) || 0,
        answered: totals.answered,
        correct: totals.correct,
        errors: totals.errors,
        accuracy,
        classification: classifyAccuracy(accuracy),
        needsReview: accuracy != null && accuracy < 55,
        masteryPct: clampPercent(discipline.mastery_pct),
        minutes,
        subtopics: subRows,
        subtopicCount: related.length,
      };
    });
}

function actualMinutesFromSession(session) {
  const elapsedSeconds = Math.max(0, Number(session.elapsedSeconds) || 0);
  return Math.round(elapsedSeconds / 60);
}

function studyTime({ blocks, sessions, dailyStates, disciplines, cutoff }) {
  const completedBlocks = blocks.filter((block) => inPeriod(block.date || block.completedAt, cutoff));
  const blockMinutes = completedBlocks.reduce((sum, block) => sum + (Number(block.actualMinutes) || 0), 0);
  let source = 'routineBlocks';
  let totalMinutes = blockMinutes;

  if (!totalMinutes) {
    totalMinutes = sessions
      .filter((session) => ['completed', 'aborted'].includes(session.status) && inPeriod(session.date || session.endedAt, cutoff))
      .reduce((sum, session) => sum + actualMinutesFromSession(session), 0);
    source = 'studySessions';
  }
  if (!totalMinutes) {
    totalMinutes = dailyStates
      .filter((state) => inPeriod(state.date, cutoff))
      .reduce((sum, state) => sum + (Number(state.actualMinutes) || 0), 0);
    source = 'routineDailyStates';
  }

  const disciplineMap = new Map(disciplines.map((discipline) => [discipline.id, discipline.name]));
  const grouped = new Map();
  for (const block of completedBlocks) {
    const minutes = Number(block.actualMinutes) || 0;
    if (!minutes || !block.subjectId) continue;
    grouped.set(block.subjectId, (grouped.get(block.subjectId) || 0) + minutes);
  }
  const byDiscipline = [...grouped.entries()]
    .map(([id, minutes]) => ({
      id,
      name: disciplineMap.get(id) || 'Outros estudos',
      minutes,
      percentage: blockMinutes ? Math.round((minutes / blockMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return { totalMinutes, byDiscipline, source, hasDistribution: byDiscipline.length > 0 };
}

function recentEvolution(subtopics, cutoff) {
  return subtopics
    .flatMap((subtopic) => (subtopic.attempt_history || []).map((attempt) => ({
      at: attempt.attemptedAt,
      value: clampPercent(attempt.percentage),
      answered: Number(attempt.total) || 0,
      correct: Number(attempt.correct) || 0,
      subtopicId: subtopic.id,
      name: subtopic.name,
    })))
    .filter((attempt) => attempt.at && inPeriod(attempt.at, cutoff))
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .slice(-12);
}

function reviewMetrics(verticalized, reviewQueue, cutoff, now) {
  const completed = verticalized.reduce((sum, item) => sum + (Number(item.review_count) || 0), 0);
  const active = reviewQueue.filter((item) => item.status !== 'frozen');
  const due = active.filter((item) => {
    const next = validDate(item.nextReviewAt);
    return next && next <= now;
  });
  const completedInPeriod = reviewQueue.reduce((sum, item) => sum + (item.reviewHistory || [])
    .filter((entry) => entry.reason === 'review' && inPeriod(entry.at, cutoff)).length, 0);
  const memory = { quente: 0, morna: 0, fria: 0, congelada: 0 };
  for (const item of reviewQueue) {
    const key = String(item.memoryState || '').replace(/o$/, 'a');
    if (Object.hasOwn(memory, key)) memory[key] += 1;
  }
  return { completed, completedInPeriod, pending: active.length, due: due.length, memory };
}

function summaryText({ edital, totals, disciplines }) {
  const remaining = Math.max(0, 100 - edital);
  const evaluated = disciplines.filter((discipline) => discipline.accuracy != null);
  if (!totals.answered && !edital) {
    return 'Comece sua jornada para construir um histórico de desempenho deste concurso.';
  }
  const fragments = [`Você concluiu ${edital.toFixed(0)}% do edital. Restam ${remaining.toFixed(0)}% da jornada.`];
  if (evaluated.length) {
    const strongest = [...evaluated].sort((a, b) => b.accuracy - a.accuracy)[0];
    const weakest = [...evaluated].sort((a, b) => a.accuracy - b.accuracy)[0];
    fragments.push(`${strongest.name} é atualmente sua disciplina com melhor desempenho.`);
    if (weakest.id !== strongest.id) fragments.push(`${weakest.name} necessita de maior atenção.`);
  }
  return fragments.join(' ');
}

export class PerformanceService {
  constructor({ repository = progressRepository, now = () => new Date() } = {}) {
    this.repository = repository;
    this.now = now;
  }

  async getDashboard({ period = '30d' } = {}) {
    const cutoff = periodCutoff(period, this.now());
    const [players, disciplines, subtopics, verticalized, reviewQueue, blocks, sessions, dailyStates] = await Promise.all([
      this.repository.getAll(STORES.player),
      this.repository.getAll(STORES.disciplines),
      this.repository.getAll(STORES.subtopics),
      this.repository.getAll(STORES.verticalized),
      this.repository.getAll(STORES.reviewQueue),
      this.repository.getAll(STORES.routineBlocks),
      this.repository.getAll(STORES.studySessions),
      this.repository.getAll(STORES.routineDailyStates),
    ]);

    const player = players[0] || null;
    const totals = questionTotals(subtopics, cutoff);
    const allTotals = questionTotals(subtopics, null);
    const accuracy = totals.answered ? Math.round((totals.correct / totals.answered) * 100) : null;
    const edital = clampPercent(player?.edital_completion_pct);
    const disciplineRows = disciplinePerformance(disciplines, subtopics, cutoff, blocks);
    const completedTopics = verticalized.filter((item) => item.theory_status === 'concluido').length;
    const time = studyTime({ blocks, sessions, dailyStates, disciplines, cutoff });
    const reviews = reviewMetrics(verticalized, reviewQueue, cutoff, this.now());
    const evolution = recentEvolution(subtopics, cutoff);

    return {
      period,
      player,
      progress: {
        edital,
        remaining: Math.max(0, 100 - edital),
        completedTopics,
        totalTopics: verticalized.length,
        remainingTopics: Math.max(0, verticalized.length - completedTopics),
      },
      overview: { ...totals, accuracy, allAnswered: allTotals.answered },
      disciplines: disciplineRows,
      time,
      reviews,
      evolution,
      summary: summaryText({ edital, totals, disciplines: disciplineRows }),
      hasQuestionData: totals.answered > 0,
      hasAnyData: edital > 0 || allTotals.answered > 0 || time.totalMinutes > 0 || reviews.completed > 0,
    };
  }
}

export const performanceService = new PerformanceService();
