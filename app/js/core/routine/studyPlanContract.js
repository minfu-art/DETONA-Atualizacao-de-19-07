import { localDateKey } from '../localDate.js';

export const STUDY_PLAN_ALGORITHM_VERSION = 'study-plan-v1';
export const STUDY_PLAN_STATUSES = Object.freeze(['active', 'completed', 'paused', 'invalid']);
export const STUDY_BLOCK_STATUSES = Object.freeze([
  'planned', 'in_progress', 'completed', 'partially_completed', 'skipped', 'rescheduled', 'cancelled',
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
export const QUESTION_ACTIVITY_TYPES = new Set(['questoes', 'simulado', 'correcao_simulado']);
export const CURRICULAR_ACTIVITY_TYPES = new Set(['questoes', 'teoria', 'lei_seca', 'estudo', 'simulado', 'correcao_simulado']);
const NON_CAPACITY_STATUSES = new Set(['cancelled', 'rescheduled']);

function finiteInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 0;
}

function validId(value) {
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value);
}

export function studyPlanScopeKey(userId, contestId) {
  if (!validId(String(userId || '')) || !validId(String(contestId || ''))) return null;
  return `${userId}:${contestId}`;
}

export function stableStudyPlanToken(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function studyPlanIdentity({ userId, contestId, weekStart, version = 1 } = {}) {
  const scopeKey = studyPlanScopeKey(userId, contestId);
  const start = validLocalDate(weekStart) ? weekStart : null;
  if (!scopeKey || !start || !finiteInteger(version) || Number(version) < 1) return null;
  const planId = `study_plan_${stableStudyPlanToken(`${scopeKey}:${start}`)}_${start}`;
  return {
    planId,
    scopeKey,
    version: Number(version),
    generationId: `${planId}:v${Number(version)}`,
    algorithmVersion: STUDY_PLAN_ALGORITHM_VERSION,
  };
}

export function reducedStudyPlanIdentity({ userId, contestId, date, minutes, version = 1 } = {}) {
  const scopeKey = studyPlanScopeKey(userId, contestId);
  if (!scopeKey || !validLocalDate(date) || !Number.isInteger(Number(minutes))
    || Number(minutes) < 5 || !Number.isInteger(Number(version)) || Number(version) < 1) return null;
  const fingerprint = `${scopeKey}:${date}:${Number(minutes)}:${STUDY_PLAN_ALGORITHM_VERSION}`;
  const planId = `study_reduced_${stableStudyPlanToken(fingerprint)}_${date}`;
  return {
    planId,
    scopeKey,
    version: Number(version),
    generationId: `${planId}:v${Number(version)}`,
    algorithmVersion: STUDY_PLAN_ALGORITHM_VERSION,
    journalKey: `study_plan_reduced:${scopeKey}:${date}:${Number(minutes)}:${STUDY_PLAN_ALGORITHM_VERSION}`,
  };
}

export function stableStudyBlockId(planId, block = {}, order = 0) {
  const fingerprint = [
    planId,
    block.date,
    block.startTime,
    block.activityType,
    block.subjectId,
    block.subtopicId,
    block.source,
    order,
  ].join('|');
  return `block_${stableStudyPlanToken(fingerprint)}`;
}

export function validLocalDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  try {
    return localDateKey(`${value}T12:00:00`) === value;
  } catch {
    return false;
  }
}

export function validateExamDate(examDate, { today = localDateKey() } = {}) {
  if (!examDate) return { valid: true, state: 'missing', errors: [] };
  if (!validLocalDate(examDate)) {
    return { valid: false, state: 'invalid', errors: ['exam_date_invalid'] };
  }
  if (examDate < today) {
    return { valid: false, state: 'past', errors: ['exam_date_past'] };
  }
  return { valid: true, state: examDate === today ? 'today' : 'future', errors: [] };
}

export function timeToMinutesStrict(value) {
  if (!TIME_PATTERN.test(String(value || ''))) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function dailyCapacityForDate(profile = {}, date) {
  if (!validLocalDate(date)) return 0;
  const dow = new Date(`${date}T12:00:00`).getDay();
  if (!(profile.availableDays || []).includes(dow) || (profile.restDays || []).includes(dow)) return 0;
  const window = profile.dayWindows?.[dow];
  const start = timeToMinutesStrict(window?.start);
  const end = timeToMinutesStrict(window?.end);
  if (start == null || end == null || end <= start) return 0;
  const configuredMaximum = Number(profile.maxDailyMinutes);
  if (!Number.isInteger(configuredMaximum) || configuredMaximum <= 0) return 0;
  return Math.max(0, Math.min(configuredMaximum, end - start));
}

export function validateStudyAvailability(profile = {}, { weekDates = [] } = {}) {
  const errors = [];
  const available = Array.isArray(profile.availableDays) ? profile.availableDays.map(Number) : [];
  const rest = Array.isArray(profile.restDays) ? profile.restDays.map(Number) : [];
  const validDay = (day) => Number.isInteger(day) && day >= 0 && day <= 6;
  if (!available.length) errors.push('availability_missing');
  if (available.some((day) => !validDay(day)) || rest.some((day) => !validDay(day))) errors.push('availability_day_invalid');
  if (new Set(available).size !== available.length || new Set(rest).size !== rest.length) errors.push('availability_day_duplicate');
  if (available.some((day) => rest.includes(day))) errors.push('availability_day_conflict');

  const minDaily = Number(profile.minDailyMinutes);
  const maxDaily = Number(profile.maxDailyMinutes);
  const session = Number(profile.preferredSessionMinutes);
  const maxBlocks = Number(profile.maxBlocksPerDay);
  const weeklyHours = Number(profile.weeklyHoursGoal);
  if (!Number.isInteger(minDaily) || minDaily <= 0) errors.push('min_daily_invalid');
  if (!Number.isInteger(maxDaily) || maxDaily <= 0 || maxDaily > 720) errors.push('max_daily_invalid');
  if (Number.isFinite(minDaily) && Number.isFinite(maxDaily) && minDaily > maxDaily) errors.push('daily_range_invalid');
  if (!Number.isInteger(session) || session <= 0 || session > 180) errors.push('session_duration_invalid');
  if (!Number.isInteger(maxBlocks) || maxBlocks <= 0 || maxBlocks > 12) errors.push('max_blocks_invalid');
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 80) errors.push('weekly_goal_invalid');

  for (const day of available) {
    const window = profile.dayWindows?.[day];
    const start = timeToMinutesStrict(window?.start);
    const end = timeToMinutesStrict(window?.end);
    if (start == null || end == null || end <= start) errors.push(`availability_window_invalid:${day}`);
  }

  for (const commitment of Array.isArray(profile.fixedCommitments) ? profile.fixedCommitments : []) {
    const days = Array.isArray(commitment?.days) ? commitment.days.map(Number) : [];
    const start = timeToMinutesStrict(commitment?.start);
    const end = timeToMinutesStrict(commitment?.end);
    if (!days.length || days.some((day) => !validDay(day)) || start == null || end == null || end <= start) {
      errors.push('fixed_commitment_invalid');
      continue;
    }
    for (const day of days.filter((candidate) => available.includes(candidate))) {
      const studyStart = timeToMinutesStrict(profile.dayWindows?.[day]?.start);
      const studyEnd = timeToMinutesStrict(profile.dayWindows?.[day]?.end);
      if (studyStart != null && studyEnd != null && start < studyEnd && studyStart < end) {
        errors.push(`fixed_commitment_conflict:${day}`);
      }
    }
  }

  const dates = Array.isArray(weekDates) ? weekDates.filter(validLocalDate) : [];
  const dailyCapacity = Object.fromEntries(dates.map((date) => [date, dailyCapacityForDate(profile, date)]));
  const availableCapacity = Object.values(dailyCapacity).reduce((sum, value) => sum + value, 0);
  const configuredWeekly = Number.isFinite(weeklyHours) && weeklyHours > 0 ? Math.floor(weeklyHours * 60) : 0;
  const weeklyCapacity = configuredWeekly > 0 ? Math.min(availableCapacity, configuredWeekly) : availableCapacity;
  if (dates.length && weeklyCapacity <= 0) errors.push('weekly_capacity_empty');

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    dailyCapacity,
    weeklyCapacity,
  };
}

function countQuestionsBySubtopic(questions = []) {
  const counts = new Map();
  for (const question of questions) {
    const id = String(question?.subtopic_id || question?.topicoEditalId || '');
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export function validateStudyPlan(plan = {}, context = {}) {
  const errors = [];
  const expectedScope = studyPlanScopeKey(context.userId, context.contestId);
  if (!validId(plan.planId)) errors.push('plan_id_invalid');
  if (!validId(plan.userId) || plan.userId !== context.userId) errors.push('plan_user_invalid');
  if (!validId(plan.contestId) || plan.contestId !== context.contestId) errors.push('plan_contest_invalid');
  if (!expectedScope || plan.scopeKey !== expectedScope) errors.push('plan_scope_invalid');
  if (!finiteInteger(plan.version) || Number(plan.version) < 1) errors.push('plan_version_invalid');
  if (!STUDY_PLAN_STATUSES.includes(plan.status)) errors.push('plan_status_invalid');
  if (!validLocalDate(plan.startDate) || !validLocalDate(plan.endDate) || plan.startDate > plan.endDate) errors.push('plan_dates_invalid');

  const exam = validateExamDate(plan.examDate, { today: context.today || localDateKey() });
  if (!exam.valid) errors.push(...exam.errors);
  const availability = validateStudyAvailability(plan.configuration || {}, { weekDates: plan.weekDates || [] });
  if (!availability.valid) errors.push(...availability.errors);

  const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
  if (!blocks.length) errors.push('plan_empty');
  const ids = new Set();
  const dailyLoad = new Map();
  const disciplines = new Map((context.disciplines || []).map((item) => [String(item.id), item]));
  const subtopics = new Map((context.subtopics || []).map((item) => [String(item.id), item]));
  const questionCounts = countQuestionsBySubtopic(context.questions || []);
  const validateCurriculum = Boolean((context.disciplines || []).length || (context.subtopics || []).length || (context.questions || []).length);

  for (const block of blocks) {
    if (!validId(block?.id) || ids.has(block.id)) errors.push('block_id_invalid_or_duplicate');
    if (block?.id) ids.add(block.id);
    if (block?.userId !== context.userId || block?.contestId !== context.contestId) errors.push('block_scope_invalid');
    if (block?.scopeKey !== expectedScope) errors.push('block_scope_key_invalid');
    if (block?.planId !== plan.planId) errors.push('block_plan_invalid');
    if (Number(block?.planVersion) !== Number(plan.version)) errors.push('block_plan_version_invalid');
    if (plan.generationId && block?.generationId !== plan.generationId) errors.push('block_generation_invalid');
    if (!STUDY_BLOCK_STATUSES.includes(block?.status)) errors.push('block_status_invalid');
    if (!validLocalDate(block?.date)) errors.push('block_date_invalid');
    if (!Number.isInteger(Number(block?.plannedMinutes)) || Number(block.plannedMinutes) <= 0) errors.push('block_duration_invalid');
    if (block?.status === 'completed' && (!block.completedAt || !block.completionEvidence)) errors.push('block_completion_without_evidence');
    if (block?.status !== 'completed' && block?.completionEvidence) errors.push('block_evidence_state_conflict');

    if (!NON_CAPACITY_STATUSES.has(block?.status) && validLocalDate(block?.date)) {
      dailyLoad.set(block.date, (dailyLoad.get(block.date) || 0) + (Number(block.plannedMinutes) || 0));
    }

    if (validateCurriculum && CURRICULAR_ACTIVITY_TYPES.has(block?.activityType)) {
      const subtopic = subtopics.get(String(block?.subtopicId || ''));
      if (!subtopic) errors.push('block_subtopic_invalid');
      const disciplineId = String(block?.subjectId || '');
      if (disciplineId && !disciplines.has(disciplineId)) errors.push('block_discipline_invalid');
      if (subtopic && disciplineId && String(subtopic.discipline_id || subtopic.disciplineId || '') !== disciplineId) {
        errors.push('block_curriculum_link_invalid');
      }
      if (QUESTION_ACTIVITY_TYPES.has(block?.activityType) && (questionCounts.get(String(block?.subtopicId || '')) || 0) <= 0) {
        errors.push('block_question_bank_missing');
      }
    }
  }

  for (const [date, load] of dailyLoad) {
    if (load > (availability.dailyCapacity[date] || 0)) errors.push(`daily_capacity_exceeded:${date}`);
  }
  const weeklyLoad = [...dailyLoad.values()].reduce((sum, value) => sum + value, 0);
  if (weeklyLoad > availability.weeklyCapacity) errors.push('weekly_capacity_exceeded');

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    availability,
    exam,
    weeklyLoad,
  };
}

export function validatePlanCompletionEvidence(block = {}, activity = {}, context = {}) {
  const errors = [];
  const expectedScope = studyPlanScopeKey(context.userId, context.contestId);
  if (!block?.id || activity?.blockId !== block.id) errors.push('evidence_block_invalid');
  if (!activity?.id) errors.push('evidence_activity_invalid');
  if (activity?.userId !== context.userId || activity?.contestId !== context.contestId) errors.push('evidence_scope_invalid');
  if (block?.userId !== context.userId || block?.contestId !== context.contestId) errors.push('block_scope_invalid');
  if (!expectedScope || activity?.scopeKey !== expectedScope || block?.scopeKey !== expectedScope) errors.push('evidence_scope_key_invalid');
  if (!block?.planId || activity?.planId !== block.planId) errors.push('evidence_plan_invalid');
  if (!Number.isInteger(Number(block?.planVersion))
    || Number(block.planVersion) < 1
    || Number(activity?.planVersion) !== Number(block.planVersion)) errors.push('evidence_plan_version_invalid');
  if (activity?.status !== 'completed') errors.push('evidence_status_invalid');
  if (!Number.isFinite(Number(activity?.elapsedSeconds)) || Number(activity.elapsedSeconds) < 30) errors.push('evidence_duration_invalid');
  if (!activity?.endedAt || !Number.isFinite(Date.parse(activity.endedAt))) errors.push('evidence_date_invalid');
  if (activity?.activityType !== block?.activityType) errors.push('evidence_activity_type_invalid');
  if (CURRICULAR_ACTIVITY_TYPES.has(block?.activityType)) {
    if (!block?.subjectId || activity?.subjectId !== block.subjectId) errors.push('evidence_subject_invalid');
    if (!block?.subtopicId || activity?.subtopicId !== block.subtopicId) errors.push('evidence_subtopic_invalid');
  } else {
    if (block?.subjectId && activity?.subjectId !== block.subjectId) errors.push('evidence_subject_invalid');
    if (block?.subtopicId && activity?.subtopicId !== block.subtopicId) errors.push('evidence_subtopic_invalid');
  }
  return { valid: errors.length === 0, errors };
}

export function assertStudyPlanScope(record = {}, context = {}) {
  const expectedScope = studyPlanScopeKey(context.userId, context.contestId);
  const recordScope = record.scopeKey || studyPlanScopeKey(record.userId, record.contestId);
  if (!expectedScope || record.userId !== context.userId || record.contestId !== context.contestId || recordScope !== expectedScope) {
    const error = new Error('Este plano pertence a outro contexto de estudo e foi encerrado com segurança.');
    error.code = 'STUDY_PLAN_CONTEXT_CHANGED';
    throw error;
  }
  return true;
}

export function safeStudyPlanError(code) {
  const messages = {
    STUDY_PLAN_CONFIGURATION_REQUIRED: 'Configure sua disponibilidade antes de gerar o plano.',
    STUDY_PLAN_CONFIGURATION_INVALID: 'Revise os dias, horários e limites da sua disponibilidade.',
    STUDY_PLAN_EXAM_DATE_INVALID: 'Atualize a data da prova antes de continuar.',
    STUDY_PLAN_EMPTY: 'Ainda não há conteúdo disponível para montar um plano seguro.',
    STUDY_PLAN_INVALID: 'Este plano possui dados inconsistentes e foi preservado para verificação.',
    STUDY_PLAN_BLOCK_UNAVAILABLE: 'Este bloco não está disponível para esta operação.',
    STUDY_PLAN_EVIDENCE_REQUIRED: 'Conclua uma atividade acadêmica real antes de finalizar o bloco.',
    STUDY_PLAN_ACADEMIC_CONTENT_REQUIRED: 'Este bloco não possui conteúdo acadêmico disponível para ser iniciado.',
    STUDY_PLAN_REDUCED_UNAVAILABLE: 'Não há conteúdo acadêmico elegível ou espaço disponível para montar um plano reduzido agora.',
    STUDY_PLAN_RESCHEDULE_INVALID: 'Não foi possível reagendar sem ultrapassar sua disponibilidade.',
    STUDY_PLAN_PERSISTENCE_FAILED: 'Não foi possível salvar esta alteração. Seus dados anteriores foram preservados; tente novamente.',
  };
  const error = new Error(messages[code] || messages.STUDY_PLAN_INVALID);
  error.code = code;
  return error;
}
