import { localDateKey } from '../core/localDate.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { clampPercent, periodCutoff, performanceService } from './performanceService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function safeDate(value) {
  const localDateMatch = typeof value === 'string'
    ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    : null;
  const date = localDateMatch
    ? new Date(
      Number(localDateMatch[1]),
      Number(localDateMatch[2]) - 1,
      Number(localDateMatch[3]),
      12,
    )
    : value
      ? new Date(value)
      : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function recordDateKey(record) {
  const value = record?.date || record?.completedAt || record?.endedAt || record?.finishedAt;
  if (!value) return null;
  try {
    return localDateKey(value);
  } catch {
    return null;
  }
}

function sessionMinutes(session) {
  const seconds = Math.max(0, Number(session?.durationSeconds ?? session?.elapsedSeconds) || 0);
  return seconds ? Math.max(1, Math.round(seconds / 60)) : 0;
}

export function studyMinutesForDate({
  date,
  blocks = [],
  sessions = [],
  dailyStates = [],
} = {}) {
  const blockMinutes = blocks
    .filter((block) => recordDateKey(block) === date)
    .reduce((sum, block) => sum + Math.max(0, Number(block.actualMinutes) || 0), 0);
  const standaloneMinutes = sessions
    .filter((session) => (
      !session.blockId
      && ['completed', 'aborted'].includes(session.status)
      && session.valid !== false
      && recordDateKey(session) === date
    ))
    .reduce((sum, session) => sum + sessionMinutes(session), 0);
  const measuredMinutes = blockMinutes + standaloneMinutes;
  if (measuredMinutes > 0) return measuredMinutes;

  return dailyStates
    .filter((state) => recordDateKey(state) === date)
    .reduce((highest, state) => Math.max(highest, Number(state.actualMinutes) || 0), 0);
}

function attemptDate(attempt) {
  return safeDate(attempt?.attemptedAt || attempt?.attempted_at);
}

function attemptPercent(attempt) {
  const explicit = attempt?.percentage ?? attempt?.accuracy;
  if (explicit != null) return clampPercent(explicit);
  const total = Math.max(0, Number(attempt?.total) || 0);
  const correct = Math.max(0, Number(attempt?.correct) || 0);
  return total ? clampPercent((correct / total) * 100) : 0;
}

function currentMastery(subtopic) {
  const attempts = subtopic?.attempt_history || [];
  const attemptBest = attempts.reduce((best, attempt) => Math.max(best, attemptPercent(attempt)), 0);
  return clampPercent(
    subtopic?.melhorPercentual
    ?? subtopic?.best_accuracy
    ?? subtopic?.mastery_pct
    ?? attemptBest,
  );
}

export function recentProgressAnalysis({
  subtopics = [],
  disciplines = [],
  cutoff,
} = {}) {
  const disciplineMap = new Map(disciplines.map((discipline) => [
    discipline.id,
    {
      id: discipline.id,
      name: discipline.name || 'Disciplina',
      gainSum: 0,
      totalSubtopics: 0,
      touched: false,
    },
  ]));
  let gainSum = 0;

  for (const subtopic of subtopics) {
    const attempts = subtopic.attempt_history || [];
    const baseline = attempts
      .filter((attempt) => {
        const date = attemptDate(attempt);
        return date && cutoff && date < cutoff;
      })
      .reduce((best, attempt) => Math.max(best, attemptPercent(attempt)), 0);
    const touched = attempts.some((attempt) => {
      const date = attemptDate(attempt);
      return date && (!cutoff || date >= cutoff);
    });
    const gain = touched ? Math.max(0, currentMastery(subtopic) - baseline) : 0;
    gainSum += gain;

    const row = disciplineMap.get(subtopic.discipline_id);
    if (row) {
      row.totalSubtopics += 1;
      row.gainSum += gain;
      row.touched ||= touched;
    }
  }

  const disciplinesWithGain = [...disciplineMap.values()]
    .filter((row) => row.touched && row.totalSubtopics > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      gainPercent: Number((row.gainSum / row.totalSubtopics).toFixed(1)),
    }))
    .filter((row) => row.gainPercent > 0)
    .sort((a, b) => b.gainPercent - a.gainPercent || a.name.localeCompare(b.name, 'pt-BR'));

  return {
    globalGainPercent: subtopics.length
      ? Number((gainSum / subtopics.length).toFixed(2))
      : 0,
    bestDiscipline: disciplinesWithGain[0] || null,
  };
}

export function daysUntilExamDate(examDate, now = new Date()) {
  const exam = safeDate(examDate);
  if (!exam) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam.getTime() - start.getTime()) / DAY_MS);
}

export function buildOrionEvolutionModel({
  now = new Date(),
  weeklyDashboard = {},
  todayMinutes = 0,
  dailyGoalMinutes = 0,
  recentProgress = {},
  examDate = null,
} = {}) {
  const overview = weeklyDashboard.overview || {};
  const progress = weeklyDashboard.progress || {};
  const questionsWeek = Math.max(0, Number(overview.correct) || 0)
    + Math.max(0, Number(overview.errors) || 0);
  const correctWeek = Math.max(0, Number(overview.correct) || 0);
  const wrongWeek = Math.max(0, Number(overview.errors) || 0);
  const accuracyWeek = questionsWeek ? Math.round((correctWeek / questionsWeek) * 100) : null;
  const remainingPercent = clampPercent(progress.remaining ?? (100 - (Number(progress.edital) || 0)));
  const weeklyGainPercent = Math.max(0, Number(recentProgress.globalGainPercent) || 0);
  const dailyGainPercent = weeklyGainPercent / 7;
  const estimatedDays = remainingPercent <= 0
    ? 0
    : dailyGainPercent > 0
      ? Math.ceil(remainingPercent / dailyGainPercent)
      : null;
  const examDays = daysUntilExamDate(examDate, now);
  const weekMinutes = Math.max(0, Number(weeklyDashboard.time?.totalMinutes) || 0);
  const hoursPerProgressPoint = weeklyGainPercent > 0 && weekMinutes > 0
    ? (weekMinutes / 60) / weeklyGainPercent
    : null;
  const requiredHoursPerDay = examDays != null
    && examDays > 0
    && hoursPerProgressPoint != null
    && remainingPercent > 0
    ? Number(((remainingPercent * hoursPerProgressPoint) / examDays).toFixed(1))
    : remainingPercent <= 0
      ? 0
      : null;
  const dailyGoal = Math.max(0, Number(dailyGoalMinutes) || 0);
  const today = Math.max(0, Number(todayMinutes) || 0);

  const model = {
    todayMinutes: today,
    dailyGoalMinutes: dailyGoal,
    dailyGoalProgress: dailyGoal ? Math.min(100, Math.round((today / dailyGoal) * 100)) : 0,
    questionsWeek,
    correctWeek,
    wrongWeek,
    accuracyWeek,
    remainingPercent,
    estimatedDays,
    examDays,
    requiredHoursPerDay,
    bestDiscipline: recentProgress.bestDiscipline || null,
    hasRecentPace: weeklyGainPercent > 0,
  };
  model.recommendation = orionRecommendation(model);
  return model;
}

export function orionRecommendation(model) {
  if (model.remainingPercent <= 0) {
    return 'Edital concluído. Agora, mantenha revisões e simulados para consolidar o domínio.';
  }
  if (model.examDays != null && model.examDays <= 0) {
    return 'A data da prova chegou. Preserve a calma e revise apenas os pontos essenciais.';
  }
  if (
    model.examDays != null
    && model.estimatedDays != null
    && model.estimatedDays > model.examDays
    && model.requiredHoursPerDay != null
  ) {
    return `Para concluir antes da prova, tente manter ${model.requiredHoursPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h por dia.`;
  }
  if (model.questionsWeek > 0 && model.accuracyWeek < 55) {
    return 'Sua taxa de acerto pede atenção. Revise os erros antes de aumentar o volume.';
  }
  if (model.bestDiscipline) {
    return `Você está evoluindo bem em ${model.bestDiscipline.name}. Mantenha esse ritmo.`;
  }
  if (model.estimatedDays != null) {
    return `No ritmo atual, você zera o edital em cerca de ${model.estimatedDays} dias.`;
  }
  if (!model.todayMinutes && !model.questionsWeek) {
    return 'Comece hoje para eu analisar seu ritmo e projetar a conclusão do edital.';
  }
  return 'Ainda estou calculando seu ritmo. Continue registrando estudos e batalhas.';
}

export function emptyOrionEvolutionModel() {
  return buildOrionEvolutionModel();
}

export class OrionEvolutionService {
  constructor({
    repository = progressRepository,
    performance = performanceService,
    now = () => new Date(),
  } = {}) {
    this.repository = repository;
    this.performance = performance;
    this.now = now;
  }

  async getSnapshot() {
    const now = this.now();
    const cutoff = periodCutoff('7d', now);
    const [weeklyDashboard, blocks, sessions, dailyStates, profiles, subtopics, disciplines] = await Promise.all([
      this.performance.getDashboard({ period: '7d' }),
      this.repository.getAll(STORES.routineBlocks),
      this.repository.getAll(STORES.studySessions),
      this.repository.getAll(STORES.routineDailyStates),
      this.repository.getAll(STORES.routineProfiles),
      this.repository.getAll(STORES.subtopics),
      this.repository.getAll(STORES.disciplines),
    ]);
    const profile = profiles[0] || null;
    const player = weeklyDashboard.player || null;

    return buildOrionEvolutionModel({
      now,
      weeklyDashboard,
      todayMinutes: studyMinutesForDate({
        date: localDateKey(now),
        blocks,
        sessions,
        dailyStates,
      }),
      dailyGoalMinutes: profile?.maxDailyMinutes || 0,
      recentProgress: recentProgressAnalysis({ subtopics, disciplines, cutoff }),
      examDate: player?.exam_date || profile?.examDate || null,
    });
  }
}

export const orionEvolutionService = new OrionEvolutionService();
