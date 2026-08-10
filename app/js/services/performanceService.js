import { localDateKey } from '../core/localDate.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';

const PERIOD_DAYS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90, all: null });
const EXECUTED_BLOCK_STATUSES = new Set(['completed', 'partially_completed']);
const VALID_SESSION_STATUSES = new Set(['completed', 'aborted']);

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nonNegative(value) {
  const numeric = finiteNumber(value);
  return numeric != null && numeric >= 0 ? numeric : null;
}

export function clampPercent(value) {
  const numeric = finiteNumber(value);
  return numeric == null ? 0 : Math.max(0, Math.min(100, numeric));
}

function localKey(value) {
  if (!value) return null;
  try {
    return localDateKey(value);
  } catch {
    return null;
  }
}

export function periodCutoff(period = '30d', now = new Date()) {
  const days = Object.hasOwn(PERIOD_DAYS, period) ? PERIOD_DAYS[period] : PERIOD_DAYS['30d'];
  if (days == null) return null;
  const cutoff = new Date(now);
  if (Number.isNaN(cutoff.getTime())) return null;
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return cutoff;
}

function inPeriod(value, cutoff) {
  if (!cutoff) return true;
  const valueKey = localKey(value);
  const cutoffKey = localKey(cutoff);
  return Boolean(valueKey && cutoffKey && valueKey >= cutoffKey);
}

function emptyTotals(source = 'none', warnings = []) {
  return { answered: 0, correct: 0, errors: 0, source, warnings };
}

function validQuestionHistoryTotals(subtopic) {
  const history = subtopic?.question_history;
  if (!history || typeof history !== 'object' || Array.isArray(history) || !Object.keys(history).length) return null;
  const totals = emptyTotals('question_history');
  for (const entry of Object.values(history)) {
    const answered = finiteNumber(entry?.attempts);
    const correct = finiteNumber(entry?.correctCount);
    const errors = finiteNumber(entry?.incorrectCount);
    if (![answered, correct, errors].every((value) => Number.isInteger(value) && value >= 0)
      || correct + errors !== answered) {
      totals.warnings.push('INVALID_QUESTION_HISTORY_ENTRY');
      continue;
    }
    totals.answered += answered;
    totals.correct += correct;
    totals.errors += errors;
  }
  return totals;
}

function canonicalAttemptId(attempt) {
  return attempt?.battleId || attempt?.attemptId || attempt?.eventId || attempt?.id || null;
}

function validAttemptTotals(subtopic, cutoff = null) {
  const attempts = Array.isArray(subtopic?.attempt_history) ? subtopic.attempt_history : [];
  if (!attempts.length) return null;
  const totals = emptyTotals('attempt_history');
  const seen = new Set();
  for (const attempt of attempts) {
    const eventId = canonicalAttemptId(attempt);
    if (eventId && seen.has(String(eventId))) {
      totals.warnings.push('DUPLICATE_ATTEMPT_ID_IGNORED');
      continue;
    }
    if (eventId) seen.add(String(eventId));
    const attemptedAt = attempt?.attemptedAt || attempt?.attempted_at;
    if (cutoff && !inPeriod(attemptedAt, cutoff)) continue;
    if (!cutoff && !localKey(attemptedAt)) totals.warnings.push('UNDATED_ATTEMPT_INCLUDED_IN_ALL_HISTORY');
    const answered = finiteNumber(attempt?.total);
    const correct = finiteNumber(attempt?.correct);
    if (!Number.isInteger(answered) || answered <= 0
      || !Number.isInteger(correct) || correct < 0 || correct > answered) {
      totals.warnings.push('INVALID_ATTEMPT_IGNORED');
      continue;
    }
    totals.answered += answered;
    totals.correct += correct;
    totals.errors += answered - correct;
  }
  return totals;
}

function legacyQuestionTotals(subtopic) {
  const answeredList = Array.isArray(subtopic?.answered_question_ids) ? subtopic.answered_question_ids : [];
  const correctList = Array.isArray(subtopic?.correct_question_ids) ? subtopic.correct_question_ids : [];
  const incorrectList = Array.isArray(subtopic?.incorrect_question_ids) ? subtopic.incorrect_question_ids : [];
  if (!answeredList.length && !correctList.length && !incorrectList.length) return null;
  const answeredIds = new Set([...answeredList, ...correctList, ...incorrectList].filter(Boolean).map(String));
  const incorrectIds = new Set(incorrectList.filter(Boolean).map(String));
  const correctIds = new Set(correctList.filter(Boolean).map(String));
  const overlap = [...correctIds].filter((id) => incorrectIds.has(id));
  overlap.forEach((id) => correctIds.delete(id));
  const correct = [...correctIds].filter((id) => answeredIds.has(id)).length;
  return {
    answered: answeredIds.size,
    correct,
    errors: Math.max(0, answeredIds.size - correct),
    source: 'legacy_question_ids',
    warnings: overlap.length ? ['AMBIGUOUS_LEGACY_ANSWER_TREATED_AS_ERROR'] : [],
  };
}

export function subtopicQuestionTotalsDetailed(subtopic, cutoff = null) {
  const history = validQuestionHistoryTotals(subtopic);
  const allAttempts = validAttemptTotals(subtopic, null);
  const periodAttempts = cutoff ? validAttemptTotals(subtopic, cutoff) : allAttempts;
  const legacy = legacyQuestionTotals(subtopic);

  if (cutoff) {
    if (periodAttempts) {
      const reliableAll = Math.max(history?.answered || 0, allAttempts?.answered || 0);
      const warnings = [...periodAttempts.warnings];
      if (!history && !allAttempts?.answered) warnings.push('PERIOD_SOURCE_UNAVAILABLE');
      if (periodAttempts.answered > reliableAll) warnings.push('PERIOD_EXCEEDS_RELIABLE_HISTORY');
      return { ...periodAttempts, warnings };
    }
    return emptyTotals('none', history || legacy ? ['UNDATED_HISTORY_EXCLUDED_FROM_PERIOD'] : []);
  }

  if (history && (!allAttempts || history.answered >= allAttempts.answered)) return history;
  if (allAttempts) {
    return {
      ...allAttempts,
      warnings: [
        ...allAttempts.warnings,
        ...(history ? ['QUESTION_HISTORY_INCOMPLETE_USING_ATTEMPT_HISTORY'] : []),
      ],
    };
  }
  return legacy || emptyTotals();
}

export function subtopicQuestionTotals(subtopic, cutoff = null) {
  const { answered, correct, errors } = subtopicQuestionTotalsDetailed(subtopic, cutoff);
  return { answered, correct, errors };
}

function questionTotalsDetailed(subtopics, cutoff = null) {
  const sources = new Set();
  const warnings = [];
  const totals = (subtopics || []).reduce((sum, subtopic) => {
    const current = subtopicQuestionTotalsDetailed(subtopic, cutoff);
    sum.answered += current.answered;
    sum.correct += current.correct;
    sum.errors += current.errors;
    if (current.source !== 'none') sources.add(current.source);
    warnings.push(...current.warnings);
    return sum;
  }, { answered: 0, correct: 0, errors: 0 });
  return {
    ...totals,
    source: sources.size ? [...sources].sort().join('+') : 'none',
    warnings: [...new Set(warnings)],
    hasEnoughData: totals.answered > 0,
  };
}

export function questionTotals(subtopics, cutoff = null) {
  const { answered, correct, errors } = questionTotalsDetailed(subtopics, cutoff);
  return { answered, correct, errors };
}

function classifyAccuracy(accuracy) {
  if (accuracy == null) return 'Sem respostas';
  if (accuracy >= 75) return 'Forte';
  if (accuracy >= 55) return 'Em evolução';
  if (accuracy >= 35) return 'Atenção';
  return 'Prioridade de revisão';
}

function recordDate(record) {
  return record?.date || record?.completedAt || record?.endedAt || record?.finishedAt || null;
}

function blockTimeRecord(block, cutoff) {
  const dateKey = localKey(recordDate(block));
  if (!dateKey || !EXECUTED_BLOCK_STATUSES.has(block?.status) || !inPeriod(dateKey, cutoff)) return null;
  const minutes = nonNegative(block?.actualMinutes);
  if (minutes == null || minutes <= 0) return null;
  return {
    id: `block:${block.id || 'unknown'}`,
    dateKey,
    minutes,
    disciplineId: block.subjectId || block.disciplineId || null,
    subtopicId: block.subtopicId || block.topicId || null,
    source: 'routineBlocks',
  };
}

function sessionTimeRecord(session, cutoff) {
  const dateKey = localKey(recordDate(session));
  if (!dateKey || session?.blockId || !VALID_SESSION_STATUSES.has(session?.status) || session?.valid !== true
    || !inPeriod(dateKey, cutoff)) return null;
  const seconds = nonNegative(session?.durationSeconds ?? session?.elapsedSeconds);
  if (seconds == null || seconds <= 0) return null;
  return {
    id: `session:${session.id || 'unknown'}`,
    dateKey,
    minutes: Math.max(1, Math.round(seconds / 60)),
    disciplineId: session.subjectId || session.disciplineId || null,
    subtopicId: session.subtopicId || null,
    source: 'studySessions',
  };
}

export function studyTimeSnapshot({ blocks = [], sessions = [], dailyStates = [], disciplines = [], subtopics = [], cutoff = null } = {}) {
  const blockRecords = blocks.map((block) => blockTimeRecord(block, cutoff)).filter(Boolean);
  const sessionRecords = sessions.map((session) => sessionTimeRecord(session, cutoff)).filter(Boolean);
  const detailed = [...blockRecords, ...sessionRecords];
  const detailedDates = new Set(detailed.map((record) => record.dateKey).filter(Boolean));
  const fallbackByDate = new Map();
  for (const state of dailyStates || []) {
    const dateKey = localKey(recordDate(state));
    const minutes = nonNegative(state?.actualMinutes);
    if (!dateKey || !inPeriod(dateKey, cutoff) || detailedDates.has(dateKey) || minutes == null || minutes <= 0) continue;
    fallbackByDate.set(dateKey, Math.max(fallbackByDate.get(dateKey) || 0, minutes));
  }
  const fallbackRecords = [...fallbackByDate.entries()].map(([dateKey, minutes]) => ({
    id: `daily:${dateKey}`, dateKey, minutes, disciplineId: null, subtopicId: null, source: 'routineDailyStates',
  }));
  const records = [...detailed, ...fallbackRecords];
  const totalMinutes = records.reduce((sum, record) => sum + record.minutes, 0);
  const disciplineMap = new Map((disciplines || []).map((discipline) => [discipline.id, discipline.name]));
  const subtopicDisciplineMap = new Map((subtopics || []).map((subtopic) => [subtopic.id, subtopic.discipline_id]));
  const grouped = new Map();
  for (const record of records) {
    const disciplineId = record.disciplineId || subtopicDisciplineMap.get(record.subtopicId) || null;
    if (!disciplineId || !disciplineMap.has(disciplineId)) continue;
    record.disciplineId = disciplineId;
    grouped.set(disciplineId, (grouped.get(disciplineId) || 0) + record.minutes);
  }
  const distributedMinutes = [...grouped.values()].reduce((sum, minutes) => sum + minutes, 0);
  const byDiscipline = [...grouped.entries()]
    .map(([id, minutes]) => ({
      id,
      name: disciplineMap.get(id),
      minutes,
      percentage: totalMinutes ? Math.round((minutes / totalMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, 'pt-BR'));
  const sources = [...new Set(records.map((record) => record.source))];
  return {
    totalMinutes,
    distributedMinutes,
    undistributedMinutes: Math.max(0, totalMinutes - distributedMinutes),
    byDiscipline,
    records,
    source: sources.length ? sources.join('+') : 'none',
    quality: fallbackRecords.length ? 'fallback' : detailed.length ? 'canonical' : 'empty',
    isEstimated: false,
    hasDistribution: distributedMinutes > 0,
    warnings: fallbackRecords.length ? ['DAILY_STATE_USED_FOR_DAYS_WITHOUT_DETAILED_TIME'] : [],
  };
}

function minutesMaps(records) {
  const bySubtopic = new Map();
  const directByDiscipline = new Map();
  for (const record of records) {
    if (record.subtopicId) bySubtopic.set(record.subtopicId, (bySubtopic.get(record.subtopicId) || 0) + record.minutes);
    else if (record.disciplineId) directByDiscipline.set(record.disciplineId, (directByDiscipline.get(record.disciplineId) || 0) + record.minutes);
  }
  return { bySubtopic, directByDiscipline };
}

function subtopicPerformanceRows(related, cutoff, timeMaps) {
  return [...related]
    .sort((a, b) => String(a.edital_numbering || '').localeCompare(String(b.edital_numbering || ''), 'pt', { numeric: true }))
    .map((subtopic) => {
      const totals = subtopicQuestionTotalsDetailed(subtopic, cutoff);
      const accuracy = totals.answered ? (totals.correct / totals.answered) * 100 : null;
      const masteryValue = finiteNumber(subtopic.melhorPercentual ?? subtopic.best_accuracy ?? subtopic.mastery_pct);
      return {
        id: subtopic.id,
        name: subtopic.name,
        numbering: subtopic.edital_numbering || '',
        answered: totals.answered,
        correct: totals.correct,
        errors: totals.errors,
        accuracy,
        classification: classifyAccuracy(accuracy),
        minutes: timeMaps.bySubtopic.get(subtopic.id) || 0,
        stars: Math.max(0, Number(subtopic.stars) || 0),
        masteryPct: masteryValue == null ? null : clampPercent(masteryValue),
        memory: subtopic.memory_temperature || null,
        quality: { source: totals.source, warnings: totals.warnings },
      };
    });
}

function disciplinePerformance(disciplines, subtopics, cutoff, timeRecords = []) {
  const timeMaps = minutesMaps(timeRecords);
  return [...disciplines]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)))
    .map((discipline) => {
      const related = subtopics.filter((subtopic) => subtopic.discipline_id === discipline.id);
      const totals = questionTotalsDetailed(related, cutoff);
      const accuracy = totals.answered ? (totals.correct / totals.answered) * 100 : null;
      const subRows = subtopicPerformanceRows(related, cutoff, timeMaps);
      const minutes = subRows.reduce((sum, row) => sum + row.minutes, 0)
        + (timeMaps.directByDiscipline.get(discipline.id) || 0);
      const masteryValue = finiteNumber(discipline.mastery_pct);
      return {
        id: discipline.id,
        name: discipline.name,
        order: Number(discipline.order) || 0,
        answered: totals.answered,
        correct: totals.correct,
        errors: totals.errors,
        accuracy,
        classification: classifyAccuracy(accuracy),
        needsReview: totals.answered >= 10 && accuracy < 55,
        masteryPct: masteryValue == null ? null : clampPercent(masteryValue),
        minutes,
        subtopics: subRows,
        subtopicCount: related.length,
        quality: { source: totals.source, warnings: totals.warnings },
      };
    });
}

export function recentEvolution(subtopics, cutoff) {
  const buckets = new Map();
  for (const subtopic of subtopics || []) {
    const attempts = Array.isArray(subtopic?.attempt_history) ? subtopic.attempt_history : [];
    const seen = new Set();
    for (const attempt of attempts) {
      const eventId = canonicalAttemptId(attempt);
      if (eventId && seen.has(String(eventId))) continue;
      if (eventId) seen.add(String(eventId));
      const dateKey = localKey(attempt?.attemptedAt || attempt?.attempted_at);
      const answered = finiteNumber(attempt?.total);
      const correct = finiteNumber(attempt?.correct);
      if (!dateKey || !inPeriod(dateKey, cutoff) || !Number.isInteger(answered) || answered <= 0
        || !Number.isInteger(correct) || correct < 0 || correct > answered) continue;
      const bucket = buckets.get(dateKey) || { dateKey, at: `${dateKey}T12:00:00`, answered: 0, correct: 0, errors: 0 };
      bucket.answered += answered;
      bucket.correct += correct;
      bucket.errors += answered - correct;
      buckets.set(dateKey, bucket);
    }
  }
  return [...buckets.values()]
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map((point) => ({ ...point, accuracy: (point.correct / point.answered) * 100, value: (point.correct / point.answered) * 100 }))
    .slice(-30);
}

function validReviewDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function reviewMetrics(verticalized, reviewQueue, cutoff, now) {
  const totalCompleted = verticalized.reduce((sum, item) => {
    const count = nonNegative(item?.review_count);
    return sum + (count == null ? 0 : count);
  }, 0);
  const frozen = reviewQueue.filter((item) => item?.status === 'frozen');
  const active = reviewQueue.filter((item) => item?.status !== 'frozen');
  const due = active.filter((item) => {
    const next = validReviewDate(item?.nextReviewAt);
    return next && next <= now;
  });
  const completedInPeriod = reviewQueue.reduce((sum, item) => sum + (Array.isArray(item?.reviewHistory) ? item.reviewHistory : [])
    .filter((entry) => entry?.reason === 'review' && validReviewDate(entry?.at) && inPeriod(entry.at, cutoff)).length, 0);
  const memory = { quente: 0, morna: 0, fria: 0, congelada: 0 };
  for (const item of reviewQueue) {
    const key = String(item?.memoryState || '').replace(/o$/, 'a');
    if (Object.hasOwn(memory, key)) memory[key] += 1;
  }
  return {
    completed: totalCompleted,
    totalCompleted,
    completedInPeriod,
    pending: active.length,
    active: active.length,
    due: due.length,
    frozen: frozen.length,
    memory,
  };
}

function completionSnapshot(player) {
  const raw = player?.edital_completion_pct;
  const numeric = finiteNumber(raw);
  if (raw == null || numeric == null) {
    return { completion: null, remainingCompletion: null, source: 'none', quality: 'missing', warnings: raw == null ? [] : ['INVALID_EDITAL_COMPLETION'] };
  }
  const completion = clampPercent(numeric);
  return {
    completion,
    remainingCompletion: 100 - completion,
    source: 'player.edital_completion_pct',
    quality: numeric === completion ? 'canonical' : 'normalized',
    warnings: numeric === completion ? [] : ['EDITAL_COMPLETION_CLAMPED'],
  };
}

function summaryText({ completion, totals, disciplines }) {
  if (!totals.answered && completion == null) return 'Comece sua jornada para construir um histórico de desempenho deste concurso.';
  const fragments = [];
  if (completion != null) fragments.push(`Você concluiu integralmente ${completion.toFixed(0)}% do edital.`);
  const evaluated = disciplines.filter((discipline) => discipline.accuracy != null && discipline.answered >= 10);
  if (evaluated.length) {
    const strongest = [...evaluated].sort((a, b) => b.accuracy - a.accuracy)[0];
    fragments.push(`${strongest.name} teve a maior taxa de acertos entre as disciplinas com amostra suficiente no período.`);
  } else if (totals.answered) {
    fragments.push(`Você respondeu ${totals.answered} questões no período; continue para formar uma amostra comparável por disciplina.`);
  }
  return fragments.join(' ');
}

function scopedRepository(repository) {
  if (typeof repository?.forScope !== 'function') return { repository, context: { userId: null, contestId: null, scopeKey: null } };
  const userId = repository.userId();
  const contestId = repository.contestId();
  const scoped = repository.forScope(userId, contestId);
  return { repository: scoped, context: { userId, contestId, scopeKey: scoped.scopeKey } };
}

export class PerformanceService {
  constructor({ repository = progressRepository, now = () => new Date() } = {}) {
    this.repository = repository;
    this.now = now;
  }

  async getDashboard({ period = '30d', repository: fixedRepository = null } = {}) {
    const selectedPeriod = Object.hasOwn(PERIOD_DAYS, period) ? period : '30d';
    const cutoff = periodCutoff(selectedPeriod, this.now());
    const captured = fixedRepository
      ? {
        repository: fixedRepository,
        context: {
          userId: fixedRepository.userId || null,
          contestId: fixedRepository.contestId || null,
          scopeKey: fixedRepository.scopeKey || null,
        },
      }
      : scopedRepository(this.repository);
    const repository = captured.repository;
    const [players, disciplines, subtopics, verticalized, reviewQueue, blocks, sessions, dailyStates] = await Promise.all([
      repository.getAll(STORES.player),
      repository.getAll(STORES.disciplines),
      repository.getAll(STORES.subtopics),
      repository.getAll(STORES.verticalized),
      repository.getAll(STORES.reviewQueue),
      repository.getAll(STORES.routineBlocks),
      repository.getAll(STORES.studySessions),
      repository.getAll(STORES.routineDailyStates),
    ]);
    const player = players[0] || null;
    const totals = questionTotalsDetailed(subtopics, cutoff);
    const allTotals = questionTotalsDetailed(subtopics, null);
    if (totals.answered > allTotals.answered) totals.warnings.push('PERIOD_EXCEEDS_RELIABLE_HISTORY');
    const accuracy = totals.answered ? (totals.correct / totals.answered) * 100 : null;
    const completion = completionSnapshot(player);
    const time = studyTimeSnapshot({ blocks, sessions, dailyStates, disciplines, subtopics, cutoff });
    const disciplineRows = disciplinePerformance(disciplines, subtopics, cutoff, time.records);
    const completedTopics = verticalized.filter((item) => item.theory_status === 'concluido').length;
    const reviews = reviewMetrics(verticalized, reviewQueue, cutoff, this.now());
    const evolution = recentEvolution(subtopics, cutoff);
    const disciplineIds = new Set(disciplines.map((discipline) => discipline.id));
    const hasOrphanSubtopics = subtopics.some((subtopic) => !disciplineIds.has(subtopic.discipline_id));
    const warnings = [...new Set([
      ...completion.warnings,
      ...totals.warnings,
      ...time.warnings,
      ...(hasOrphanSubtopics ? ['ORPHAN_SUBTOPICS_EXCLUDED_FROM_DISCIPLINES'] : []),
    ])];

    return {
      period: selectedPeriod,
      context: captured.context,
      player,
      progress: {
        completion: completion.completion,
        remainingCompletion: completion.remainingCompletion,
        edital: completion.completion,
        completedTopics,
        totalTopics: verticalized.length,
        remainingTopics: Math.max(0, verticalized.length - completedTopics),
        source: completion.source,
        quality: completion.quality,
      },
      overview: {
        answered: totals.answered,
        correct: totals.correct,
        errors: totals.errors,
        accuracy,
        allAnswered: allTotals.answered,
        source: totals.source,
        hasEnoughData: totals.answered >= 10,
      },
      disciplines: disciplineRows,
      time,
      reviews,
      evolution,
      summary: summaryText({ completion: completion.completion, totals, disciplines: disciplineRows }),
      quality: {
        warnings,
        accuracy: { source: totals.source, hasEnoughData: totals.answered >= 10 },
        evolution: { source: 'attempt_history_by_local_day', sampleSize: evolution.length, hasEnoughData: evolution.length >= 2 },
        projection: { available: false, reason: 'EDITAL_COMPLETION_HISTORY_UNAVAILABLE' },
      },
      hasQuestionData: totals.answered > 0,
      hasAnyData: (completion.completion || 0) > 0 || allTotals.answered > 0 || time.totalMinutes > 0 || reviews.totalCompleted > 0,
    };
  }
}

export const performanceService = new PerformanceService();
