import { localDateKey } from '../core/localDate.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { periodCutoff, performanceService, studyTimeSnapshot } from './performanceService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_RECOMMENDATION_SAMPLE = 10;

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeLocalDate(value) {
  const match = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
    : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dateKey(value) {
  try {
    return value ? localDateKey(value) : null;
  } catch {
    return null;
  }
}

function recordDateKey(record) {
  return dateKey(record?.date || record?.completedAt || record?.endedAt || record?.finishedAt);
}

export function studyMinutesForDate({ date, blocks = [], sessions = [], dailyStates = [] } = {}) {
  const target = dateKey(date);
  if (!target) return 0;
  return studyTimeSnapshot({
    blocks: blocks.filter((record) => recordDateKey(record) === target),
    sessions: sessions.filter((record) => recordDateKey(record) === target),
    dailyStates: dailyStates.filter((record) => recordDateKey(record) === target),
  }).totalMinutes;
}

export function dailyMinutesGoal(profile) {
  const explicit = profile?.minGoal?.type === 'minutes' ? finiteNumber(profile.minGoal.minutes) : null;
  if (explicit != null && explicit > 0) return { minutes: explicit, source: 'routineProfile.minGoal.minutes' };
  const minimum = finiteNumber(profile?.minDailyMinutes);
  if (minimum != null && minimum > 0) return { minutes: minimum, source: 'routineProfile.minDailyMinutes' };
  return { minutes: null, source: 'none' };
}

function attemptDate(attempt) {
  return safeLocalDate(attempt?.attemptedAt || attempt?.attempted_at);
}

function validAttempt(attempt) {
  const total = finiteNumber(attempt?.total);
  const correct = finiteNumber(attempt?.correct);
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(correct) || correct < 0 || correct > total) return null;
  return { total, correct };
}

export function recentProgressAnalysis({ subtopics = [], disciplines = [], cutoff } = {}) {
  const rows = new Map(disciplines.map((discipline) => [discipline.id, {
    id: discipline.id,
    name: discipline.name || 'Disciplina',
    answered: 0,
    correct: 0,
  }]));
  const seen = new Set();
  let answered = 0;
  let correct = 0;
  for (const subtopic of subtopics) {
    for (const attempt of Array.isArray(subtopic?.attempt_history) ? subtopic.attempt_history : []) {
      const at = attemptDate(attempt);
      if (!at || (cutoff && at < cutoff)) continue;
      const id = attempt?.battleId || attempt?.attemptId || attempt?.eventId || attempt?.id || null;
      const scopedId = id ? `${subtopic.id}:${id}` : null;
      if (scopedId && seen.has(scopedId)) continue;
      if (scopedId) seen.add(scopedId);
      const normalized = validAttempt(attempt);
      if (!normalized) continue;
      answered += normalized.total;
      correct += normalized.correct;
      const row = rows.get(subtopic.discipline_id);
      if (row) {
        row.answered += normalized.total;
        row.correct += normalized.correct;
      }
    }
  }
  const comparable = [...rows.values()]
    .filter((row) => row.answered >= MIN_RECOMMENDATION_SAMPLE)
    .map((row) => ({ ...row, accuracy: (row.correct / row.answered) * 100 }))
    .sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered || a.name.localeCompare(b.name, 'pt-BR'));
  return {
    answered,
    correct,
    accuracy: answered ? (correct / answered) * 100 : null,
    metric: 'period_accuracy',
    sampleSize: answered,
    bestDiscipline: comparable[0] || null,
    globalGainPercent: null,
  };
}

export function examDateStatus(examDate, now = new Date()) {
  const exam = safeLocalDate(examDate);
  const today = safeLocalDate(localDateKey(now));
  if (!exam || !today) return { state: 'missing', days: null };
  exam.setHours(12, 0, 0, 0);
  today.setHours(12, 0, 0, 0);
  const signedDays = Math.round((exam.getTime() - today.getTime()) / DAY_MS);
  return { state: signedDays < 0 ? 'past' : signedDays === 0 ? 'today' : 'future', days: Math.max(0, signedDays) };
}

export function daysUntilExamDate(examDate, now = new Date()) {
  return examDateStatus(examDate, now).days;
}

export function completionProjection(completionHistory = [], { currentCompletion = null } = {}) {
  const points = (Array.isArray(completionHistory) ? completionHistory : [])
    .map((item) => ({
      date: safeLocalDate(item?.at || item?.date),
      completion: finiteNumber(item?.completion ?? item?.edital_completion_pct),
      contestId: item?.contestId || null,
    }))
    .filter((item) => item.date && item.completion != null && item.completion >= 0 && item.completion <= 100)
    .sort((a, b) => a.date - b.date);
  if (points.length < 2) return { available: false, estimatedDays: null, reason: 'INSUFFICIENT_COMPARABLE_COMPLETION_HISTORY' };
  const first = points[0];
  const last = points.at(-1);
  if (first.contestId && last.contestId && first.contestId !== last.contestId) {
    return { available: false, estimatedDays: null, reason: 'CONTEST_SCOPE_MISMATCH' };
  }
  const elapsedDays = Math.round((last.date - first.date) / DAY_MS);
  const gain = last.completion - first.completion;
  const current = finiteNumber(currentCompletion ?? last.completion);
  if (elapsedDays < 1 || gain <= 0 || current == null || current < 0 || current > 100) {
    return { available: false, estimatedDays: null, reason: 'NON_POSITIVE_OR_UNSTABLE_COMPLETION_PACE' };
  }
  return {
    available: true,
    estimatedDays: Math.ceil((100 - current) / (gain / elapsedDays)),
    reason: null,
    sampleSize: points.length,
    metric: 'edital_completion_pct',
  };
}

/** @deprecated Use completionProjection with edital_completion_pct snapshots. */
export function coverageProjection(coverageHistory = [], { currentCoverage = null } = {}) {
  return completionProjection(
    (Array.isArray(coverageHistory) ? coverageHistory : []).map((item) => ({
      ...item,
      completion: item?.completion ?? item?.edital_completion_pct ?? item?.coverage,
    })),
    { currentCompletion: currentCoverage },
  );
}

export function buildOrionEvolutionModel({
  now = new Date(),
  weeklyDashboard = {},
  todayMinutes = 0,
  dailyGoalMinutes = null,
  dailyGoalSource = 'none',
  recentProgress = {},
  examDate = null,
  examDateSource = 'none',
  completionHistory = [],
} = {}) {
  const overview = weeklyDashboard.overview || {};
  const progress = weeklyDashboard.progress || {};
  const derivedAnswered = (finiteNumber(overview.correct) || 0) + (finiteNumber(overview.errors) || 0);
  const questionsWeek = Math.max(0, finiteNumber(overview.answered) ?? derivedAnswered);
  const correctWeek = Math.max(0, Math.min(questionsWeek, finiteNumber(overview.correct) || 0));
  const wrongWeek = Math.max(0, questionsWeek - correctWeek);
  const accuracyWeek = questionsWeek ? (correctWeek / questionsWeek) * 100 : null;
  const completion = finiteNumber(progress.completion ?? progress.edital);
  const remainingPercent = completion == null ? null : Math.max(0, Math.min(100, 100 - completion));
  const projection = completionProjection(completionHistory, { currentCompletion: completion });
  const exam = examDateStatus(examDate, now);
  const examDays = exam.days;
  const goal = finiteNumber(dailyGoalMinutes);
  const dailyGoal = goal != null && goal > 0 ? goal : null;
  const today = Math.max(0, finiteNumber(todayMinutes) || 0);

  const model = {
    todayMinutes: today,
    dailyGoalMinutes: dailyGoal,
    dailyGoalSource: dailyGoal ? dailyGoalSource : 'none',
    dailyGoalProgress: dailyGoal ? (today / dailyGoal) * 100 : null,
    questionsWeek,
    correctWeek,
    wrongWeek,
    accuracyWeek,
    completion,
    remainingPercent,
    estimatedDays: projection.available ? projection.estimatedDays : null,
    examDays,
    examState: exam.state,
    examDateSource: examDate ? examDateSource : 'none',
    requiredHoursPerDay: null,
    bestDiscipline: recentProgress.bestDiscipline || null,
    hasRecentPace: projection.available,
    reviewsDue: Math.max(0, finiteNumber(weeklyDashboard.reviews?.due) || 0),
    quality: {
      accuracy: { source: overview.source || 'none', sampleSize: questionsWeek, hasEnoughData: questionsWeek >= MIN_RECOMMENDATION_SAMPLE },
      projection,
      warnings: [...new Set(weeklyDashboard.quality?.warnings || [])],
    },
  };
  model.recommendation = orionRecommendation(model);
  return model;
}

export function orionRecommendation(model) {
  if (!model.todayMinutes && !model.questionsWeek) return 'Comece hoje para eu analisar dados reais do seu estudo.';
  if (model.examState === 'past') return 'A data registrada para a prova já passou. Atualize-a no plano se houver um novo cronograma.';
  if (model.examState === 'today') return 'A data da prova é hoje. Faça apenas uma revisão leve e preserve sua rotina.';
  if (model.quality?.warnings?.length) return 'Alguns registros não puderam ser usados. Os indicadores exibem somente dados válidos.';
  if (model.questionsWeek >= MIN_RECOMMENDATION_SAMPLE && model.accuracyWeek < 55) {
    return `Você respondeu ${model.questionsWeek} questões nesta semana com ${Math.round(model.accuracyWeek)}% de acertos. Revise os erros antes de aumentar o volume.`;
  }
  if (model.reviewsDue > 0) return `Você tem ${model.reviewsDue} revisões vencidas. Priorize a fila para reforçar a memória.`;
  if (model.bestDiscipline) {
    return `${model.bestDiscipline.name} teve a maior taxa de acertos entre as disciplinas com ao menos ${MIN_RECOMMENDATION_SAMPLE} respostas na semana.`;
  }
  if (model.questionsWeek > 0) {
    return `Você respondeu ${model.questionsWeek} questões nesta semana. Continue para formar uma amostra comparável por disciplina.`;
  }
  return 'Ainda não há histórico suficiente para projetar a conclusão do edital.';
}

export function emptyOrionEvolutionModel() {
  return buildOrionEvolutionModel();
}

function scopedRepository(repository) {
  if (typeof repository?.forScope !== 'function') return repository;
  if (repository.scopeKey && typeof repository.userId !== 'function') return repository;
  return repository.forScope(repository.userId(), repository.contestId());
}

export class OrionEvolutionService {
  constructor({ repository = progressRepository, performance = performanceService, now = () => new Date() } = {}) {
    this.repository = repository;
    this.performance = performance;
    this.now = now;
  }

  async getSnapshot() {
    const now = this.now();
    const cutoff = periodCutoff('7d', now);
    const repository = scopedRepository(this.repository);
    const [weeklyDashboard, blocks, sessions, dailyStates, profiles, subtopics, disciplines] = await Promise.all([
      this.performance.getDashboard({ period: '7d', repository }),
      repository.getAll(STORES.routineBlocks),
      repository.getAll(STORES.studySessions),
      repository.getAll(STORES.routineDailyStates),
      repository.getAll(STORES.routineProfiles),
      repository.getAll(STORES.subtopics),
      repository.getAll(STORES.disciplines),
    ]);
    const profile = profiles[0] || null;
    const player = weeklyDashboard.player || null;
    const goal = dailyMinutesGoal(profile);
    const examDate = player?.exam_date || profile?.examDate || null;
    const examDateSource = player?.exam_date ? 'player.exam_date' : profile?.examDate ? 'routineProfile.examDate' : 'none';

    return buildOrionEvolutionModel({
      now,
      weeklyDashboard,
      todayMinutes: studyMinutesForDate({ date: localDateKey(now), blocks, sessions, dailyStates }),
      dailyGoalMinutes: goal.minutes,
      dailyGoalSource: goal.source,
      recentProgress: recentProgressAnalysis({ subtopics, disciplines, cutoff }),
      examDate,
      examDateSource,
      completionHistory: [],
    });
  }
}

export const orionEvolutionService = new OrionEvolutionService();
