import { localDateKey } from '../core/localDate.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';

const REVIEW_TYPES = new Set(['revisao', 'revisao_fila']);
const QUESTION_TYPES = new Set(['questoes', 'simulado', 'correcao_simulado']);
const NON_ACADEMIC_TYPES = new Set(['trabalho', 'descanso', 'lazer', 'compromisso']);
const ACTIVE_BLOCK_STATUSES = new Set([
  'planned', 'in_progress', 'partially_completed', 'completed', 'skipped',
]);
const STARTED_BLOCK_STATUSES = new Set(['in_progress', 'partially_completed']);
const ACTIVE_SESSION_STATUSES = new Set(['running', 'paused']);

const STATE_MESSAGES = Object.freeze({
  start: 'Comece sua primeira missão para gerar progresso.',
  in_progress: 'Você já começou. Retome de onde parou e feche este bloco.',
  review_due: 'Uma revisão planejada venceu. Resolva agora para proteger a memória.',
  almost_done: 'Falta pouco. Conclua a próxima missão e garanta a estrela do dia.',
  completed: 'Plano concluído. Sua estrela do dia foi conquistada.',
  no_plan: 'Defina sua primeira meta diária.',
  overloaded: 'Há muita coisa para hoje. Foque somente na próxima missão certa.',
});

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function asDateTime(value) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function isAcademicBlock(block) {
  const type = String(block?.activityType || '');
  if (!type || NON_ACADEMIC_TYPES.has(type)) return false;
  if (type.startsWith('wb_') || type.startsWith('habit_') || type.startsWith('kaela_')) return false;
  return ACTIVE_BLOCK_STATUSES.has(String(block?.status || 'planned'));
}

function isCompleted(block) {
  return block?.status === 'completed';
}

function routeForBlock(block) {
  const type = String(block?.activityType || '');
  if (REVIEW_TYPES.has(type)) return 'review';
  if (QUESTION_TYPES.has(type)) return 'battle';
  return 'expedition';
}

function actionForBlock(block, { started = false } = {}) {
  const route = routeForBlock(block);
  if (route === 'review') return { actionLabel: 'Abrir revisão', actionRoute: route };
  if (started && route === 'battle') return { actionLabel: 'Continuar batalha', actionRoute: route };
  return { actionLabel: 'Começar missão', actionRoute: route };
}

function blockTitle(block, fallback = 'Missão planejada') {
  return String(block?.title || block?.description || fallback).trim();
}

function dueReviewIds(reviewQueue, localDate) {
  const endOfDay = new Date(`${localDate}T23:59:59.999`).getTime();
  return new Set((reviewQueue || [])
    .filter((item) => item?.status !== 'frozen' && asDateTime(item?.nextReviewAt) <= endOfDay)
    .map((item) => String(item?.id || item?.questionId || item?.subtopicId || ''))
    .filter(Boolean));
}

function ratio(done, planned) {
  if (!planned) return null;
  return clamp(done / planned, 0, 1);
}

function adaptiveProgress(categories) {
  const present = categories.filter((category) => category.planned > 0);
  if (!present.length) return 0;
  const availableWeight = present.reduce((sum, category) => sum + category.weight, 0);
  if (!availableWeight) return 0;
  const progress = present.reduce((sum, category) => {
    const normalizedWeight = category.weight / availableWeight;
    return sum + normalizedWeight * ratio(category.completed, category.planned);
  }, 0);
  return Math.round(clamp(progress * 100));
}

function resolveNextMission({
  localDate,
  dailyGoal,
  academicBlocks,
  reviewQueue,
  studySessions,
  activeMission,
  overallProgress,
}) {
  const dueIds = dueReviewIds(reviewQueue, localDate);
  const plannedReview = academicBlocks
    .filter((block) => REVIEW_TYPES.has(block.activityType) && !isCompleted(block))
    .find((block) => {
      const references = [
        block.reviewQueueId, block.questionId, block.subtopicId, block.sourceId,
      ].map(String);
      return dueIds.size === 0
        ? asDateTime(block.deadlineAt || block.dueAt || block.endTime) <= new Date(`${localDate}T23:59:59.999`).getTime()
        : references.some((id) => dueIds.has(id)) || block.source === 'review';
    });
  if (plannedReview) {
    return {
      id: plannedReview.id,
      type: 'review_due',
      title: blockTitle(plannedReview, 'Revisão vencida do plano'),
      reason: 'Revisão vencida e já incluída no plano de hoje.',
      ...actionForBlock(plannedReview),
    };
  }

  const incomplete = academicBlocks.filter((block) => !isCompleted(block));
  const urgent = [...incomplete]
    .filter((block) => block.deadlineAt || block.dueAt || block.startTime || Number(block.priority) >= 80)
    .sort((a, b) => (
      asDateTime(a.deadlineAt || a.dueAt || `${localDate}T${a.startTime || '23:59'}`)
      - asDateTime(b.deadlineAt || b.dueAt || `${localDate}T${b.startTime || '23:59'}`)
      || Number(b.priority || 0) - Number(a.priority || 0)
    ))[0];
  if (urgent) {
    return {
      id: urgent.id,
      type: 'urgent',
      title: blockTitle(urgent),
      reason: 'Esta é a prioridade com horário, prazo ou urgência mais alta.',
      ...actionForBlock(urgent),
    };
  }

  const activeBlockIds = new Set((studySessions || [])
    .filter((session) => ACTIVE_SESSION_STATUSES.has(session?.status))
    .map((session) => String(session?.blockId || '')));
  const started = incomplete.find((block) => (
    STARTED_BLOCK_STATUSES.has(block.status) || activeBlockIds.has(String(block.id))
  ));
  if (started) {
    return {
      id: started.id,
      type: 'started',
      title: blockTitle(started),
      reason: 'Esta atividade já foi iniciada.',
      ...actionForBlock(started, { started: true }),
    };
  }

  if (dailyGoal.questionGoal > dailyGoal.questionsCompleted) {
    const remaining = dailyGoal.questionGoal - dailyGoal.questionsCompleted;
    return {
      id: 'daily-question-goal',
      type: 'daily_goal',
      title: activeMission?.type === 'battle'
        ? String(activeMission.title || `Resolver ${remaining} questões`)
        : `Resolver ${remaining} ${remaining === 1 ? 'questão' : 'questões'} da meta`,
      reason: 'É o próximo passo necessário para completar a meta acadêmica de hoje.',
      actionLabel: 'Começar missão',
      actionRoute: activeMission?.type === 'review' ? 'review' : 'battle',
    };
  }

  const planned = [...incomplete].sort((a, b) => (
    Number(b.priority || 0) - Number(a.priority || 0)
    || String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99'))
  ))[0];
  if (planned) {
    return {
      id: planned.id,
      type: 'planned',
      title: blockTitle(planned),
      reason: 'É o próximo bloco ainda pendente do seu plano.',
      ...actionForBlock(planned),
    };
  }

  if (overallProgress >= 100) {
    return {
      id: 'completed-day',
      type: 'completed',
      title: 'Plano acadêmico do dia concluído',
      reason: 'Confira o resultado e preserve seu ritmo.',
      actionLabel: 'Ver resultado',
      actionRoute: 'performance',
    };
  }

  if (!dailyGoal.questionGoal && academicBlocks.length === 0) {
    return {
      id: 'plan-day',
      type: 'no_plan',
      title: 'Planejar uma missão possível',
      reason: 'Ainda não há tarefas acadêmicas planejadas para hoje.',
      actionLabel: 'Planejar o dia',
      actionRoute: 'expedition',
    };
  }

  if (activeMission?.title) {
    return {
      id: 'maintenance-mission',
      type: 'maintenance',
      title: String(activeMission.title),
      reason: 'Uma missão leve mantém sua evolução sem inventar novas obrigações.',
      actionLabel: 'Começar missão',
      actionRoute: activeMission.type === 'review'
        ? 'review'
        : activeMission.type === 'battle'
          ? 'battle'
          : 'expedition',
    };
  }

  return {
    id: 'plan-day',
    type: 'no_plan',
    title: 'Planejar uma missão possível',
    reason: 'Ainda não há tarefas acadêmicas planejadas para hoje.',
    actionLabel: 'Planejar o dia',
    actionRoute: 'expedition',
  };
}

function resolveState({ overallProgress, plannedUnits, incompleteUnits, pendingMissionCount, nextMission }) {
  if (!plannedUnits) return 'no_plan';
  if (overallProgress >= 100 || incompleteUnits <= 0) return 'completed';
  if (pendingMissionCount > 6) return 'overloaded';
  if (nextMission.type === 'review_due') return 'review_due';
  if (nextMission.type === 'started') return 'in_progress';
  if (overallProgress >= 80 || incompleteUnits === 1) return 'almost_done';
  return overallProgress > 0 ? 'in_progress' : 'start';
}

function questionCountFromHistory(questionHistory, localDate) {
  return (questionHistory || []).filter((entry) => {
    const date = String(entry?.date || entry?.finished_at || entry?.completedAt || '').slice(0, 10);
    return date === localDate;
  }).length;
}

export function dailyMissionStarKey(userId, contestId, localDate) {
  return `dailyMissionStar:${userId}:${contestId}:${localDate}`;
}

export function buildEviDailyMissionModel({
  userId = null,
  contestId = null,
  localDate = localDateKey(),
  dailyGoal = {},
  routineTasks = [],
  reviewQueue = [],
  studySessions = [],
  questionHistory = [],
  activeMission = null,
} = {}) {
  const enabled = dailyGoal?.enabled !== false;
  const questionGoal = enabled
    ? Math.max(0, Number(dailyGoal?.questionGoal ?? dailyGoal?.planned ?? dailyGoal?.goal ?? 0) || 0)
    : 0;
  const historyCount = questionCountFromHistory(questionHistory, localDate);
  const questionsCompleted = Math.max(
    0,
    Number(dailyGoal?.questionsCompleted ?? dailyGoal?.completed ?? historyCount) || 0,
  );
  const academicBlocks = (routineTasks || []).filter((block) => (
    String(block?.date || localDate) === localDate && isAcademicBlock(block)
  ));
  const reviewBlocks = academicBlocks.filter((block) => REVIEW_TYPES.has(block.activityType));
  const otherBlocks = academicBlocks.filter((block) => (
    !REVIEW_TYPES.has(block.activityType)
    && (!QUESTION_TYPES.has(block.activityType) || questionGoal === 0)
  ));
  const reviewsPlanned = reviewBlocks.length;
  const reviewsCompleted = reviewBlocks.filter(isCompleted).length;
  const tasksPlanned = otherBlocks.length;
  const tasksCompleted = otherBlocks.filter(isCompleted).length;
  const questionProgress = questionGoal
    ? Math.round(clamp((questionsCompleted / questionGoal) * 100))
    : 0;
  const overallProgress = adaptiveProgress([
    { planned: questionGoal, completed: Math.min(questionsCompleted, questionGoal), weight: 0.5 },
    { planned: reviewsPlanned, completed: reviewsCompleted, weight: 0.3 },
    { planned: tasksPlanned, completed: tasksCompleted, weight: 0.2 },
  ]);
  const plannedUnits = questionGoal + reviewsPlanned + tasksPlanned;
  const incompleteUnits = Math.max(0, questionGoal - Math.min(questionsCompleted, questionGoal))
    + Math.max(0, reviewsPlanned - reviewsCompleted)
    + Math.max(0, tasksPlanned - tasksCompleted);
  const pendingMissionCount = (questionGoal > questionsCompleted ? 1 : 0)
    + reviewBlocks.filter((block) => !isCompleted(block)).length
    + otherBlocks.filter((block) => !isCompleted(block)).length;
  const nextMission = resolveNextMission({
    localDate,
    dailyGoal: { questionGoal, questionsCompleted },
    academicBlocks,
    reviewQueue,
    studySessions,
    activeMission,
    overallProgress,
  });
  const state = resolveState({
    overallProgress,
    plannedUnits,
    incompleteUnits,
    pendingMissionCount,
    nextMission,
  });
  const earned = plannedUnits > 0 && (overallProgress >= 100 || incompleteUnits === 0);
  const almost = !earned && plannedUnits > 0 && (overallProgress >= 80 || incompleteUnits === 1);
  const dailyStar = {
    id: userId && contestId ? dailyMissionStarKey(userId, contestId, localDate) : null,
    status: earned ? 'earned' : almost ? 'almost' : 'locked',
    earned,
    label: earned ? 'Estrela conquistada' : almost ? 'Quase lá' : 'Estrela bloqueada',
  };

  return {
    questionGoal,
    questionsCompleted,
    questionProgress,
    reviewsPlanned,
    reviewsCompleted,
    tasksPlanned,
    tasksCompleted,
    overallProgress,
    nextMission,
    dailyStar,
    state,
    message: STATE_MESSAGES[state],
    actionLabel: nextMission.actionLabel,
    actionRoute: nextMission.actionRoute,
  };
}

export function emptyEviDailyMissionModel() {
  return buildEviDailyMissionModel();
}

export class EviDailyMissionService {
  constructor({
    repository = progressRepository,
    now = () => new Date(),
    userId = () => repository.userId(),
    contestId = () => repository.contestId(),
  } = {}) {
    this.repository = repository;
    this.now = now;
    this.userId = userId;
    this.contestId = contestId;
  }

  async getSnapshot({ dailyGoal = {}, activeMission = null } = {}) {
    const now = this.now();
    const localDate = localDateKey(now);
    const userId = this.userId();
    const contestId = this.contestId();
    const [routineTasks, reviewQueue, studySessions, subtopics] = await Promise.all([
      this.repository.getAll(STORES.routineBlocks),
      this.repository.getAll(STORES.reviewQueue),
      this.repository.getAll(STORES.studySessions),
      this.repository.getAll(STORES.subtopics),
    ]);
    const questionHistory = (subtopics || []).flatMap((subtopic) => subtopic?.attempt_history || []);
    const model = buildEviDailyMissionModel({
      userId,
      contestId,
      localDate,
      dailyGoal,
      routineTasks,
      reviewQueue,
      studySessions,
      questionHistory,
      activeMission,
    });

    if (model.dailyStar.earned && model.dailyStar.id) {
      const existing = await this.repository.getMeta(model.dailyStar.id);
      if (!existing) {
        await this.repository.setMeta(model.dailyStar.id, {
          id: model.dailyStar.id,
          type: 'dailyMissionStar',
          userId,
          contestId,
          localDate,
          earnedAt: now.toISOString(),
        });
      }
      model.dailyStar = {
        ...model.dailyStar,
        earnedAt: existing?.earnedAt || now.toISOString(),
        newlyEarned: !existing,
      };
    }

    return model;
  }
}

export const eviDailyMissionService = new EviDailyMissionService();
