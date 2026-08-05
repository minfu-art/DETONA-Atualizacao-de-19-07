/**
 * Rotina Inteligente V2 — orquestração (IndexedDB via progressRepository).
 * Não concede XP, estrelas ou domínio acadêmico.
 */
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import {
  createRoutineProfile,
  createRoutineBlock,
  createDailyState,
  createStudySession,
  createAchievement,
  createWeeklyReview,
  createReminderSettings,
  migrateLegacyRoutinesToProfile,
  normalizeRoutineProfile,
  normalizeRoutineBlock,
  dateKey,
  nowIso,
  ROUTINE_STORES,
  activityLabel,
  moduleTargetForActivity,
} from '../core/routine/routineSchema.js';
import {
  generateWeekPlan,
  buildReducedPlan,
  suggestRescheduleSlot,
  applyReschedule,
  sortBlocksForDay,
  nextActionableBlock,
  weekDatesFrom,
  weakSpotSuggestions,
  planningAlerts,
  expandWeeklyRecurrence,
} from '../core/routine/routinePlanner.js';
import {
  evaluateMinGoal,
  applyDayToConsistency,
  evaluateAchievements,
  isProgrammedDay,
  entryActionCompleted,
  validSessionMinutes,
  markRetake,
} from '../core/routine/routineConsistency.js';
import { computeWeekMetrics, buildLocalSuggestions, loadAdjustmentAdvice, applyLoadPercent } from '../core/routine/routineMetrics.js';
import { createFocusController } from '../core/routine/routineFocus.js';
import { applyDailyGoalActivity } from './dailyGoalService.js';
import { applyValidStudyDay } from './studyStreakService.js';
import { focusXpForMinutes, grantXpEvent } from './academicProgressService.js';
import { refreshEmblems } from './emblemService.js';
import {
  weekDatesFrom as calendarWeekDates,
  shiftWeek,
  monthMatrix,
  shiftMonth,
  aggregateDays,
  examJourney,
  chibiState,
  weekSummaryStats,
  dayLoadLevel,
  MONTH_NAMES,
} from '../core/routine/routineCalendar.js';
import {
  assertStudyPlanScope,
  safeStudyPlanError,
  stableStudyBlockId,
  studyPlanIdentity,
  studyPlanScopeKey,
  validateExamDate,
  validatePlanCompletionEvidence,
  validateStudyAvailability,
  validateStudyPlan,
  validLocalDate,
} from '../core/routine/studyPlanContract.js';

function repo() {
  return progressRepository;
}

const AUTOMATIC_PLAN_SOURCES = new Set(['template', 'weakspot', 'review']);
const ACTIVE_PLAN_STATUSES = new Set(['planned', 'in_progress', 'partially_completed', 'completed']);

function automaticPlanFingerprint(block = {}) {
  return [
    block.date,
    block.startTime,
    block.endTime,
    block.plannedMinutes,
    block.activityType,
    block.title,
    block.subjectId,
    block.subtopicId,
    block.source,
  ].map((value) => String(value ?? '')).join('|');
}

export class RoutineService {
  constructor({ repository = progressRepository } = {}) {
    this.repository = repository;
    this.weekPlanGeneration = null;
  }

  userId() {
    return this.repository.userId();
  }

  contestId() {
    return this.repository.contestId();
  }

  captureScope() {
    const userId = this.userId();
    const contestId = this.contestId();
    const scopeKey = studyPlanScopeKey(userId, contestId);
    const repository = typeof this.repository.forScope === 'function'
      ? this.repository.forScope(userId, contestId)
      : this.repository;
    return { userId, contestId, scopeKey, repository };
  }

  assertActiveScope(context) {
    if (this.userId() !== context.userId || this.contestId() !== context.contestId) {
      const error = new Error('Este plano pertence a outro contexto de estudo e foi encerrado com segurança.');
      error.code = 'STUDY_PLAN_CONTEXT_CHANGED';
      throw error;
    }
  }

  async readMeta(repository, key) {
    if (typeof repository.getMeta === 'function') return repository.getMeta(key);
    const row = await repository.getById(STORES.meta, key);
    return row?.value ?? row ?? null;
  }

  async writeMeta(repository, key, value) {
    if (typeof repository.setMeta === 'function') return repository.setMeta(key, value);
    return repository.put(STORES.meta, { key, value });
  }

  async ensureProfile(context = this.captureScope()) {
    const { repository, userId, contestId, scopeKey } = context;
    const profiles = await repository.getAll(STORES.routineProfiles);
    if (profiles.length) {
      return normalizeRoutineProfile({ ...profiles[0], userId, contestId, scopeKey });
    }
    const legacy = await repository.getAll(STORES.routines);
    const player = (await repository.getAll(STORES.player))[0];
    const profile = migrateLegacyRoutinesToProfile(legacy, {
      userId,
      contestId,
      examDate: player?.exam_date || null,
    });
    profile.scopeKey = scopeKey;
    this.assertActiveScope(context);
    await repository.put(STORES.routineProfiles, profile);
    const reminders = createReminderSettings({
      id: `reminders_${userId}_${contestId}`,
      userId,
      contestId,
    });
    await repository.put(STORES.routineReminderSettings, reminders);
    profile.reminderSettingsId = reminders.id;
    await repository.put(STORES.routineProfiles, profile);
    return profile;
  }

  async saveProfile(patch, context = this.captureScope()) {
    const current = await this.ensureProfile(context);
    const candidate = { ...current, ...patch };
    if (candidate.setupCompleted) {
      const week = weekDatesFrom();
      const availability = validateStudyAvailability(candidate, { weekDates: week });
      if (!availability.valid) throw safeStudyPlanError('STUDY_PLAN_CONFIGURATION_INVALID');
      const exam = validateExamDate(candidate.examDate);
      if (!exam.valid) throw safeStudyPlanError('STUDY_PLAN_EXAM_DATE_INVALID');
    }
    const next = normalizeRoutineProfile({
      ...candidate,
      id: current.id,
      userId: context.userId,
      contestId: context.contestId,
      scopeKey: context.scopeKey,
      updatedAt: nowIso(),
    });
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineProfiles, next);
    await this.syncLegacyRoutines(next, context);
    return next;
  }

  /** Mantém StudyRoutine legado em sincronia para home/battle */
  async syncLegacyRoutines(profile, context = this.captureScope()) {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((dow) => {
      const enabled = (profile.availableDays || []).includes(dow) && !(profile.restDays || []).includes(dow);
      const win = profile.dayWindows?.[dow] || { start: '19:00', end: '21:00' };
      return {
        day_of_week: dow,
        enabled,
        goal_type: profile.minGoal?.type === 'minutes' ? 'tempo' : 'questoes',
        goal_amount: profile.minGoal?.type === 'minutes'
          ? (profile.minGoal.minutes || profile.minDailyMinutes || 20)
          : (profile.dailyQuestionsGoal || 30),
        focus_discipline_id: 'auto',
        start_time: win.start || '19:00',
        end_time: win.end || '21:00',
      };
    });
    this.assertActiveScope(context);
    await context.repository.putMany(STORES.routines, rows);
  }

  async completeSetup({ model = 'equilibrada', overrides = {}, generatePlan = true } = {}) {
    const context = this.captureScope();
    const profile = await this.saveProfile({
      ...overrides,
      model,
      setupCompleted: true,
    }, context);
    if (generatePlan) {
      await this.regenerateCurrentWeek(profile, context);
    }
    return profile;
  }

  async repairGeneratedPlanDuplicates(week = weekDatesFrom(), context = this.captureScope()) {
    const existing = await context.repository.getAll(STORES.routineBlocks);
    const seen = new Set();
    let removed = 0;
    const candidates = existing
      .filter((block) => (
        week.includes(block.date)
        && block.status === 'planned'
        && AUTOMATIC_PLAN_SOURCES.has(block.source)
      ))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));

    for (const block of candidates) {
      const fingerprint = automaticPlanFingerprint(block);
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        continue;
      }
      this.assertActiveScope(context);
      await context.repository.remove(STORES.routineBlocks, block.id);
      removed += 1;
    }
    return removed;
  }

  async regenerateCurrentWeek(profile, capturedContext = null) {
    const context = capturedContext || this.captureScope();
    if (this.weekPlanGeneration) {
      if (this.weekPlanGeneration.scopeKey !== context.scopeKey) {
        const error = new Error('Este plano pertence a outro contexto de estudo e foi encerrado com segurança.');
        error.code = 'STUDY_PLAN_CONTEXT_CHANGED';
        throw error;
      }
      return this.weekPlanGeneration.promise;
    }
    const promise = this.generateCurrentWeekOnce(profile, context);
    this.weekPlanGeneration = { scopeKey: context.scopeKey, promise };
    try {
      return await promise;
    } finally {
      this.weekPlanGeneration = null;
    }
  }

  async generateCurrentWeekOnce(profile, context = this.captureScope()) {
    const { repository, userId, contestId, scopeKey } = context;
    profile = profile || await this.ensureProfile(context);
    const week = weekDatesFrom();
    const generationDates = week.filter((candidate) => candidate >= dateKey());
    if (!profile.setupCompleted) {
      return { created: false, reason: 'configuration_required', blocks: [], repairedDuplicates: 0 };
    }
    const availability = validateStudyAvailability(profile, { weekDates: week });
    if (!availability.valid) throw safeStudyPlanError('STUDY_PLAN_CONFIGURATION_INVALID');
    const exam = validateExamDate(profile.examDate);
    if (!exam.valid) throw safeStudyPlanError('STUDY_PLAN_EXAM_DATE_INVALID');

    const repairedDuplicates = await this.repairGeneratedPlanDuplicates(week, context);
    const existing = await repository.getAll(STORES.routineBlocks);
    const activePlan = existing.filter((block) => (
      week.includes(block.date)
      && AUTOMATIC_PLAN_SOURCES.has(block.source)
      && ACTIVE_PLAN_STATUSES.has(block.status)
    ));
    if (activePlan.length) {
      return {
        created: false,
        reason: 'already_exists',
        blocks: activePlan,
        repairedDuplicates,
      };
    }

    const [subtopics, disciplines, questions] = await Promise.all([
      repository.getAll(STORES.subtopics),
      repository.getAll(STORES.disciplines),
      repository.getAll(STORES.questions),
    ]);
    const disciplineIds = new Set(disciplines.map((item) => String(item.id)));
    const questionSubtopics = new Set(questions.map((item) => String(item.subtopic_id || item.topicoEditalId || '')).filter(Boolean));
    const eligibleSubtopics = subtopics.filter((item) => (
      disciplineIds.has(String(item.discipline_id || item.disciplineId || ''))
      && questionSubtopics.has(String(item.id))
    ));
    const weak = weakSpotSuggestions(eligibleSubtopics, { limit: 6 });
    let dueReviews = 0;
    try {
      const rq = await repository.getAll(STORES.reviewQueue);
      const today = dateKey();
      const questionIds = new Set(questions.map((item) => String(item.id)));
      dueReviews = rq.filter((i) => (
        i.status !== 'frozen'
        && (i.nextReviewAt || '') <= `${today}T23:59:59`
        && questionIds.has(String(i.questionId || i.id || ''))
      )).length;
    } catch { /* ignore */ }

    const identity = studyPlanIdentity({ userId, contestId, weekStart: week[0], version: 1 });
    const generated = generateWeekPlan(profile, {
      weekDates: generationDates,
      weakSubtopics: weak,
      dueReviews,
      userId,
      contestId,
    }).map((block, index) => normalizeRoutineBlock({
      ...block,
      id: stableStudyBlockId(identity.planId, block, index),
      userId,
      contestId,
      scopeKey,
      planId: identity.planId,
      planVersion: identity.version,
      generationId: identity.generationId,
      algorithmVersion: identity.algorithmVersion,
    }));
    if (!generated.length) {
      return { created: false, reason: 'no_available_content', blocks: [], repairedDuplicates };
    }

    const plan = {
      ...identity,
      userId,
      contestId,
      status: 'active',
      startDate: week[0],
      endDate: week[6],
      examDate: profile.examDate || null,
      configuration: profile,
      weekDates: generationDates,
      blocks: generated,
    };
    const validation = validateStudyPlan(plan, {
      userId,
      contestId,
      today: dateKey(),
      disciplines,
      subtopics,
      questions,
    });
    if (!validation.valid) throw safeStudyPlanError('STUDY_PLAN_INVALID');

    const journalKey = `study_plan_generation:${identity.planId}:${identity.generationId}`;
    const previous = await this.readMeta(repository, journalKey);
    if (previous?.status === 'completed') {
      const persisted = await repository.getAll(STORES.routineBlocks);
      return {
        created: false,
        reason: 'already_exists',
        blocks: persisted.filter((block) => block.planId === identity.planId),
        repairedDuplicates,
      };
    }
    const journal = {
      key: journalKey,
      scopeKey,
      planId: identity.planId,
      generationId: identity.generationId,
      status: 'processing',
      startedAt: previous?.startedAt || nowIso(),
      updatedAt: nowIso(),
    };
    await this.writeMeta(repository, journalKey, journal);
    this.assertActiveScope(context);
    await repository.putMany(STORES.routineBlocks, generated);
    await this.writeMeta(repository, journalKey, {
      ...journal,
      status: 'completed',
      updatedAt: nowIso(),
      completedAt: nowIso(),
      blockIds: generated.map((block) => block.id),
    });
    return {
      created: true,
      reason: null,
      blocks: generated,
      repairedDuplicates,
    };
  }

  async listBlocks({ from, to } = {}, context = this.captureScope()) {
    const all = await context.repository.getAll(STORES.routineBlocks);
    return all.filter((b) => {
      if (from && b.date < from) return false;
      if (to && b.date > to) return false;
      return true;
    });
  }

  async getBlocksForDate(date = dateKey(), context = this.captureScope()) {
    if (!validLocalDate(date)) throw safeStudyPlanError('STUDY_PLAN_INVALID');
    const all = await this.listBlocks({ from: date, to: date }, context);
    return sortBlocksForDay(all);
  }

  async upsertBlock(partial, context = this.captureScope()) {
    if (!validLocalDate(partial?.date || '')) throw safeStudyPlanError('STUDY_PLAN_INVALID');
    const plannedMinutes = Number(partial?.plannedMinutes);
    if (!Number.isInteger(plannedMinutes) || plannedMinutes <= 0 || plannedMinutes > 480) {
      throw safeStudyPlanError('STUDY_PLAN_INVALID');
    }
    if ((partial?.userId && partial.userId !== context.userId)
      || (partial?.contestId && partial.contestId !== context.contestId)) {
      throw safeStudyPlanError('STUDY_PLAN_INVALID');
    }
    const block = normalizeRoutineBlock({
      ...partial,
      userId: context.userId,
      contestId: context.contestId,
      scopeKey: context.scopeKey,
      updatedAt: nowIso(),
    });
    assertStudyPlanScope(block, context);
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineBlocks, block);
    return block;
  }

  async createBlock(partial, context = this.captureScope()) {
    return this.upsertBlock(createRoutineBlock({
      ...partial,
      userId: context.userId,
      contestId: context.contestId,
      scopeKey: context.scopeKey,
    }), context);
  }

  async startBlock(blockId) {
    const context = this.captureScope();
    const block = await context.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    assertStudyPlanScope(block, context);
    if (block.status === 'in_progress') return block;
    if (!['planned', 'partially_completed'].includes(block.status)) {
      throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    }
    const next = normalizeRoutineBlock({
      ...block,
      status: 'in_progress',
      startedAt: block.startedAt || nowIso(),
      updatedAt: nowIso(),
    });
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineBlocks, next);
    return next;
  }

  async completeBlock(blockId, {
    actualMinutes = null,
    partial = false,
    skipReason = null,
    skipAcademicActivity = false,
    evidence = null,
  } = {}) {
    const context = this.captureScope();
    const block = await context.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    assertStudyPlanScope(block, context);
    if (block.status === 'completed') return block;
    if (['rescheduled', 'cancelled', 'skipped'].includes(block.status)) {
      throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    }
    if (!partial) {
      const completion = validatePlanCompletionEvidence(block, evidence || {}, context);
      if (!completion.valid) throw safeStudyPlanError('STUDY_PLAN_EVIDENCE_REQUIRED');
    }
    const minutes = actualMinutes == null ? (block.actualMinutes || 0) : Math.max(0, Number(actualMinutes) || 0);
    const completedAt = partial ? null : evidence.endedAt;
    const eventId = partial ? null : `block:${block.id}:${evidence.id}`;
    const next = normalizeRoutineBlock({
      ...block,
      actualMinutes: minutes,
      status: partial ? 'partially_completed' : 'completed',
      skipReason: partial ? (skipReason || block.skipReason) : null,
      completedAt,
      activityId: partial ? block.activityId : evidence.id,
      sessionId: partial ? block.sessionId : evidence.id,
      completionEvidence: partial ? null : {
        activityId: evidence.id,
        blockId: block.id,
        status: evidence.status,
        elapsedSeconds: Number(evidence.elapsedSeconds),
        endedAt: evidence.endedAt,
        subtopicId: evidence.subtopicId || null,
      },
      processedEventIds: eventId
        ? [...new Set([...(block.processedEventIds || []), eventId])]
        : block.processedEventIds,
      updatedAt: nowIso(),
    });
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineBlocks, next);
    await this.refreshDailyState(block.date, context);
    if (!skipAcademicActivity && next.status === 'completed' && minutes > 0) {
      await applyDailyGoalActivity({
        eventId,
        type: 'block',
        questionCount: 0,
        battleCount: 0,
        activeMinutes: minutes,
        occurredAt: next.completedAt,
      }, { repository: context.repository });
      await applyValidStudyDay({
        eventId,
        occurredAt: next.completedAt,
        valid: true,
        source: 'routine_block',
      }, { repository: context.repository });
      await refreshEmblems({ repository: context.repository });
    }
    return next;
  }

  async skipBlock(blockId, skipReason = null) {
    const context = this.captureScope();
    const block = await context.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    assertStudyPlanScope(block, context);
    if (block.status === 'skipped') return block;
    if (['completed', 'rescheduled', 'cancelled'].includes(block.status)) {
      throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    }
    const next = normalizeRoutineBlock({
      ...block,
      status: 'skipped',
      skipReason,
      skippedAt: block.skippedAt || nowIso(),
      updatedAt: nowIso(),
    });
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineBlocks, next);
    await this.refreshDailyState(block.date, context);
    return next;
  }

  async rescheduleBlock(blockId, option = 'find_week') {
    const context = this.captureScope();
    const profile = await this.ensureProfile(context);
    const block = await context.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    assertStudyPlanScope(block, context);
    if (['completed', 'rescheduled', 'cancelled', 'skipped'].includes(block.status)) {
      throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    }
    const existing = await context.repository.getAll(STORES.routineBlocks);
    const today = dateKey();

    if (option === 'pending') {
      return { suggestion: null, keepPending: true, reason: 'Manter como pendente sem reagendar.' };
    }
    if (option === 'cancel') {
      return { suggestion: null, cancel: true, reason: 'Cancelar bloco conscientemente.' };
    }

    let week = weekDatesFrom();
    let targetToday = today;
    if (option === 'today') week = [today];
    if (option === 'tomorrow') {
      const target = new Date(`${today}T12:00:00`);
      target.setDate(target.getDate() + 1);
      targetToday = dateKey(target);
      week = [targetToday];
    }
    if (option === 'next_week') {
      const target = new Date(`${today}T12:00:00`);
      target.setDate(target.getDate() + 7);
      targetToday = dateKey(target);
      week = weekDatesFrom(targetToday);
    }
    const found = suggestRescheduleSlot(block, profile, existing, {
      weekDates: week,
      today: targetToday,
      preferTomorrow: option === 'find_week',
    });
    return { ...found, preview: true };
  }

  async confirmReschedule(blockId, suggestion) {
    const context = this.captureScope();
    const block = await context.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    assertStudyPlanScope(block, context);
    if (!suggestion || suggestion.rescheduledFrom !== block.id) {
      throw safeStudyPlanError('STUDY_PLAN_RESCHEDULE_INVALID');
    }
    if (block.status === 'rescheduled' && block.rescheduledTo === suggestion.id) {
      const existingTarget = await context.repository.getById(STORES.routineBlocks, suggestion.id);
      if (existingTarget) return { from: block, to: existingTarget };
    }
    if (['completed', 'rescheduled', 'cancelled', 'skipped'].includes(block.status)) {
      throw safeStudyPlanError('STUDY_PLAN_BLOCK_UNAVAILABLE');
    }
    const scopedSuggestion = {
      ...suggestion,
      userId: suggestion.userId || context.userId,
      contestId: suggestion.contestId || context.contestId,
      scopeKey: suggestion.scopeKey || context.scopeKey,
    };
    assertStudyPlanScope(scopedSuggestion, context);
    const profile = await this.ensureProfile(context);
    const existing = await context.repository.getAll(STORES.routineBlocks);
    const verified = suggestRescheduleSlot(block, profile, existing, {
      weekDates: [suggestion.date],
      today: suggestion.date,
    });
    if (!verified.ok
      || verified.suggestion.id !== suggestion.id
      || verified.suggestion.startTime !== suggestion.startTime
      || verified.suggestion.endTime !== suggestion.endTime) {
      throw safeStudyPlanError('STUDY_PLAN_RESCHEDULE_INVALID');
    }
    const journalKey = `study_plan_reschedule:${block.id}:${suggestion.id}`;
    const stored = await this.readMeta(context.repository, journalKey);
    if (stored?.status === 'completed') {
      const [from, to] = await Promise.all([
        context.repository.getById(STORES.routineBlocks, block.id),
        context.repository.getById(STORES.routineBlocks, suggestion.id),
      ]);
      if (from && to) return { from, to };
    }
    const { from, to } = applyReschedule(block, suggestion);
    Object.assign(from, { userId: context.userId, contestId: context.contestId, scopeKey: context.scopeKey });
    Object.assign(to, { userId: context.userId, contestId: context.contestId, scopeKey: context.scopeKey });
    await this.writeMeta(context.repository, journalKey, {
      key: journalKey,
      scopeKey: context.scopeKey,
      status: 'processing',
      updatedAt: nowIso(),
    });
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineBlocks, from);
    await context.repository.put(STORES.routineBlocks, to);
    await this.writeMeta(context.repository, journalKey, {
      key: journalKey,
      scopeKey: context.scopeKey,
      status: 'completed',
      completedAt: nowIso(),
      updatedAt: nowIso(),
    });
    await this.refreshDailyState(from.date, context);
    await this.refreshDailyState(to.date, context);
    return { from, to };
  }

  async activateReducedPlan(minutes = 20) {
    const profile = await this.ensureProfile();
    const today = dateKey();
    const blocks = await this.getBlocksForDate(today);
    const subtopics = await this.repository.getAll(STORES.subtopics);
    const weak = weakSpotSuggestions(subtopics, { limit: 3 });
    let dueReviews = 0;
    try {
      const rq = await this.repository.getAll(STORES.reviewQueue);
      dueReviews = rq.filter((i) => i.status !== 'frozen' && (i.nextReviewAt || '') <= `${today}T23:59:59`).length;
    } catch { /* ignore */ }

    const reduced = buildReducedPlan({
      minutes,
      profile,
      dueReviews,
      weakSubtopics: weak,
      essentialBlocks: blocks,
      userId: this.userId(),
      contestId: this.contestId(),
      date: today,
    });

    const state = await this.getDailyState(today);
    state.reducedPlanActive = true;
    state.reducedPlanMinutes = minutes;
    state.originalPlanSnapshot = blocks.map((b) => b.id);
    state.updatedAt = nowIso();
    await this.repository.put(STORES.routineDailyStates, state);

    // NÃO remove originais — adiciona blocos reduzidos
    if (reduced.length) await this.repository.putMany(STORES.routineBlocks, reduced);
    return { reduced, state };
  }

  async getDailyState(date = dateKey(), context = this.captureScope()) {
    const id = date;
    let state = await context.repository.getById(STORES.routineDailyStates, id);
    if (!state) {
      const profile = await this.ensureProfile(context);
      const flags = isProgrammedDay(profile, date);
      state = createDailyState({
        id,
        date,
        userId: context.userId,
        contestId: context.contestId,
        scopeKey: context.scopeKey,
        programmed: flags.programmed,
        restDay: flags.restDay,
      });
      this.assertActiveScope(context);
      await context.repository.put(STORES.routineDailyStates, state);
    }
    return state;
  }

  async refreshDailyState(date = dateKey(), context = this.captureScope()) {
    const profile = await this.ensureProfile(context);
    const blocks = await this.getBlocksForDate(date, context);
    const flags = isProgrammedDay(profile, date);
    const plannedMinutes = blocks
      .filter((b) => !['cancelled', 'rescheduled'].includes(b.status) && b.source !== 'reduced')
      .reduce((s, b) => s + (b.plannedMinutes || 0), 0);
    const actualMinutes = blocks.reduce((s, b) => s + (b.actualMinutes || 0), 0);
    const completedBlocks = blocks.filter((b) => b.status === 'completed').length;
    const completedReviews = blocks.filter((b) => ['revisao', 'revisao_fila'].includes(b.activityType) && b.status === 'completed').length;

    // questões do dailyLog legado (batalhas) — apenas leitura
    let answeredQuestions = 0;
    try {
      const log = await context.repository.getById(STORES.dailyLogs, date);
      answeredQuestions = log?.completed_amount || 0;
    } catch { /* ignore */ }

    const prev = await this.getDailyState(date, context);
    const minGoalMet = evaluateMinGoal(profile.minGoal, {
      actualMinutes,
      answeredQuestions,
      completedBlocks,
      completedReviews,
    });
    const entryDone = entryActionCompleted(profile.entryAction, {
      actualMinutes,
      answeredQuestions,
      completedReviews,
      sessionStarted: completedBlocks > 0 || actualMinutes > 0,
    });

    const adhPlanned = Math.max(plannedMinutes, profile.minDailyMinutes || 0);
    const extra = Math.max(0, actualMinutes - adhPlanned);

    const state = createDailyState({
      ...prev,
      id: date,
      date,
      userId: context.userId,
      contestId: context.contestId,
      scopeKey: context.scopeKey,
      programmed: flags.programmed,
      restDay: flags.restDay,
      plannedMinutes,
      actualMinutes,
      extraMinutes: extra,
      plannedQuestions: profile.dailyQuestionsGoal || 0,
      answeredQuestions,
      minGoalMet,
      entryActionDone: entryDone,
      status: flags.restDay ? 'rest' : minGoalMet ? 'min_met' : 'open',
      updatedAt: nowIso(),
    });
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineDailyStates, state);

    return state;
  }

  async closeDay(date = dateKey()) {
    const context = this.captureScope();
    const profile = await this.ensureProfile(context);
    const state = await this.refreshDailyState(date, context);
    if (state.consistencyApplied) {
      return {
        state,
        consistency: profile.consistency,
        shieldUsed: Boolean(state.shieldUsed),
        message: 'Este dia já foi registrado.',
        unlocked: [],
      };
    }
    const eventId = `study_plan_day_close:${context.scopeKey}:${date}`;
    const result = applyDayToConsistency(profile.consistency, {
      programmed: state.programmed,
      restDay: state.restDay,
      minGoalMet: state.minGoalMet,
      useShieldIfNeeded: true,
    });
    if (state.minGoalMet) {
      // se ontem falhou e hoje cumpriu → retomada
      const y = new Date(`${date}T12:00:00`);
      y.setDate(y.getDate() - 1);
      const yKey = dateKey(y);
      const yState = await context.repository.getById(STORES.routineDailyStates, yKey);
      if (yState?.programmed && !yState.restDay && !yState.minGoalMet) {
        result.consistency = markRetake(result.consistency, true);
      }
    }
    profile.consistency = result.consistency;
    profile.updatedAt = nowIso();
    this.assertActiveScope(context);
    await context.repository.put(STORES.routineProfiles, profile);

    state.shieldUsed = Boolean(result.shieldUsed);
    state.consistencyApplied = true;
    state.closedAt = state.closedAt || nowIso();
    state.processedEventIds = [...new Set([...(state.processedEventIds || []), eventId])];
    state.updatedAt = nowIso();
    await context.repository.put(STORES.routineDailyStates, state);

    const earned = await context.repository.getAll(STORES.routineAchievements);
    const unlocked = evaluateAchievements(profile.consistency, earned.map((a) => a.code));
    for (const u of unlocked) {
      await context.repository.put(STORES.routineAchievements, createAchievement({
        id: `${u.code}_${context.userId}_${context.contestId}`,
        userId: context.userId,
        contestId: context.contestId,
        code: u.code,
        title: u.title,
      }));
    }

    return { state, consistency: profile.consistency, shieldUsed: result.shieldUsed, message: result.message, unlocked };
  }

  async recordSessionResult(session, actualMinutes, { blockId = null, partial = false } = {}) {
    const context = this.captureScope();
    if ((session?.userId && session.userId !== context.userId)
      || (session?.contestId && session.contestId !== context.contestId)) {
      throw safeStudyPlanError('STUDY_PLAN_INVALID');
    }
    session = {
      ...session,
      userId: context.userId,
      contestId: context.contestId,
      scopeKey: context.scopeKey,
      blockId: blockId || session.blockId || null,
    };
    assertStudyPlanScope(session, context);
    const eventId = `focus:${session.id}`;
    const journalKey = `focus_finalization:${session.id}`;
    const stored = await context.repository.getById(STORES.meta, journalKey);
    const steps = {
      session: stored?.steps?.session === true,
      profile: stored?.steps?.profile === true,
      block: stored?.steps?.block === true,
      dailyGoal: stored?.steps?.dailyGoal === true,
      streak: stored?.steps?.streak === true,
      xp: stored?.steps?.xp === true,
      emblems: stored?.steps?.emblems === true,
    };
    const journal = {
      key: journalKey,
      eventId,
      status: stored?.status === 'completed' ? 'completed' : 'processing',
      steps,
      started_at: stored?.started_at || session.startedAt || nowIso(),
      updated_at: nowIso(),
      completed_at: stored?.completed_at || null,
      scopeKey: context.scopeKey,
    };
    if (journal.status === 'completed') return session;
    if (!stored) await context.repository.put(STORES.meta, structuredClone(journal));
    const checkpoint = async (step, completed = false) => {
      journal.steps[step] = true;
      journal.updated_at = nowIso();
      if (completed) {
        journal.status = 'completed';
        journal.completed_at = journal.updated_at;
      }
      this.assertActiveScope(context);
      await context.repository.put(STORES.meta, structuredClone(journal));
    };

    if (!journal.steps.session) {
      this.assertActiveScope(context);
      await context.repository.put(STORES.studySessions, session);
      await checkpoint('session');
    }
    if (!journal.steps.profile) {
      const profile = await this.ensureProfile(context);
      const processed = [...new Set(profile.consistency?.processedSessionIds || [])];
      profile.consistency = {
        ...profile.consistency,
        sessionsCompleted: (profile.consistency?.sessionsCompleted || 0)
          + (session.status === 'completed' && !processed.includes(session.id) ? 1 : 0),
        processedSessionIds: [...processed, session.id].slice(-1000),
      };
      await context.repository.put(STORES.routineProfiles, profile);
      await checkpoint('profile');
    }

    if (!journal.steps.block && blockId) {
      const block = await context.repository.getById(STORES.routineBlocks, blockId);
      if (block) {
        assertStudyPlanScope(block, context);
        const minutes = validSessionMinutes(session.elapsedSeconds, {
          completed: session.status === 'completed',
          aborted: session.status === 'aborted',
        });
        await this.completeBlock(blockId, {
          actualMinutes: minutes || actualMinutes || 0,
          partial: partial || session.status === 'aborted',
          skipAcademicActivity: true,
          evidence: { ...session, blockId: block.id },
        });
      }
      await checkpoint('block');
    } else if (!journal.steps.block) {
      await this.refreshDailyState(session.date || dateKey(), context);
      await checkpoint('block');
    }

    const minutes = validSessionMinutes(session.elapsedSeconds, {
      completed: session.status === 'completed',
      aborted: session.status === 'aborted',
    });
    const valid = session.status === 'completed' && minutes > 0;
    const finishedAt = session.finishedAt || session.endedAt || nowIso();
    if (!journal.steps.dailyGoal) {
      session.dailyGoal = await applyDailyGoalActivity({
        eventId,
        type: 'focus',
        questionCount: 0,
        battleCount: 0,
        activeMinutes: valid ? minutes : 0,
        occurredAt: finishedAt,
      }, { repository: context.repository });
      await checkpoint('dailyGoal');
    }
    if (!journal.steps.streak) {
      session.streak = await applyValidStudyDay({
        eventId,
        occurredAt: finishedAt,
        valid,
        source: 'focus_session',
      }, { repository: context.repository });
      await checkpoint('streak');
    }
    if (!journal.steps.xp) {
      const amount = valid ? focusXpForMinutes(minutes) : 0;
      if (amount > 0) {
        session.xp = await grantXpEvent({
          eventId,
          type: 'focus_completed',
          amount,
          occurredAt: finishedAt,
        }, { repository: context.repository });
      }
      await checkpoint('xp');
    }
    if (!journal.steps.emblems) {
      const emblems = await refreshEmblems({ repository: context.repository });
      session.newInsignias = emblems.unlocked || [];
      await checkpoint('emblems', true);
    }
    return session;
  }

  async addDistraction(distraction) {
    distraction.userId = this.userId();
    distraction.contestId = this.contestId();
    await this.repository.put(STORES.routineDistractions, distraction);
    return distraction;
  }

  async getTodayDashboard() {
    const profile = await this.ensureProfile();
    const today = dateKey();
    const blocks = await this.getBlocksForDate(today);
    const state = await this.refreshDailyState(today);
    const next = nextActionableBlock(blocks, today);
    const player = (await this.repository.getAll(STORES.player))[0];
    return {
      profile,
      state,
      blocks,
      next,
      streak: profile.consistency?.currentStreak || 0,
      bestStreak: profile.consistency?.bestStreak || 0,
      shields: profile.consistency?.shields || 0,
      contestId: this.contestId(),
      playerName: player?.name || 'Estudante',
      date: today,
      moduleTarget: next ? moduleTargetForActivity(next.activityType) : 'home',
    };
  }

  async getWeekView(reference = dateKey()) {
    const profile = await this.ensureProfile();
    const week = weekDatesFrom(reference);
    const repairedDuplicates = 0;
    const blocks = await this.listBlocks({ from: week[0], to: week[6] });
    const states = [];
    for (const d of week) states.push(await this.getDailyState(d));
    const alerts = planningAlerts(profile, blocks, week);
    const days = aggregateDays(blocks, week, states);
    const summary = weekSummaryStats(days);
    return {
      profile,
      week,
      weekStart: week[0],
      blocks,
      states,
      alerts,
      days,
      summary,
      maxDaily: profile.maxDailyMinutes || 90,
      repairedDuplicates,
    };
  }

  async getMonthView(year, monthIndex) {
    const profile = await this.ensureProfile();
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = monthIndex ?? now.getMonth();
    const cells = monthMatrix(y, m);
    const dates = cells.map((c) => c.date);
    const from = dates[0];
    const to = dates[dates.length - 1];
    const blocks = await this.listBlocks({ from, to });
    const states = [];
    for (const d of dates) {
      // only load states for in-month to reduce work
      const cell = cells.find((c) => c.date === d);
      if (cell?.inMonth) states.push(await this.getDailyState(d));
    }
    const days = aggregateDays(blocks, dates, states);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    const enriched = cells.map((c) => {
      const agg = byDate[c.date] || {
        date: c.date, blocks: [], plannedMinutes: 0, actualMinutes: 0,
        completed: 0, reviews: 0, restDay: false, minGoalMet: false,
      };
      return {
        ...c,
        ...agg,
        load: dayLoadLevel(agg.plannedMinutes, profile.maxDailyMinutes || 90),
        isToday: c.date === dateKey(),
        isExam: profile.examDate && c.date === String(profile.examDate).slice(0, 10),
      };
    });
    return {
      profile,
      year: y,
      monthIndex: m,
      monthName: MONTH_NAMES[m],
      cells: enriched,
      prev: shiftMonth(y, m, -1),
      next: shiftMonth(y, m, 1),
    };
  }

  async getExamJourney() {
    const profile = await this.ensureProfile();
    const player = (await this.repository.getAll(STORES.player))[0];
    const examDate = profile.examDate || player?.exam_date || null;
    const startDate = profile.journeyStartDate || profile.createdAt?.slice(0, 10) || null;
    const journey = examJourney({ examDate, startDate, today: dateKey() });
    const chibi = chibiState(journey);
    return {
      profile,
      playerName: player?.name || 'Estudante',
      examDate,
      examTime: profile.examTime || null,
      examLocation: profile.examLocation || null,
      examNotes: profile.examNotes || null,
      journey,
      chibi,
    };
  }

  async setExamMeta({ examDate, examTime, examLocation, examNotes, journeyStartDate } = {}) {
    const patch = {};
    if (examDate !== undefined) patch.examDate = examDate || null;
    if (examTime !== undefined) patch.examTime = examTime || null;
    if (examLocation !== undefined) patch.examLocation = examLocation || null;
    if (examNotes !== undefined) patch.examNotes = examNotes || null;
    if (journeyStartDate !== undefined) patch.journeyStartDate = journeyStartDate || null;
    const profile = await this.saveProfile(patch);
    // espelha data da prova no player (campo acadêmico de meta, não XP)
    if (examDate !== undefined) {
      const players = await this.repository.getAll(STORES.player);
      const player = players[0];
      if (player) {
        player.exam_date = examDate || null;
        await this.repository.put(STORES.player, player);
      }
    }
    return profile;
  }

  async shiftWeekView(weekStart, deltaWeeks) {
    return this.getWeekView(shiftWeek(weekStart || dateKey(), deltaWeeks));
  }

  async getProgressSnapshot() {
    const profile = await this.ensureProfile();
    const week = weekDatesFrom();
    const blocks = await this.listBlocks({ from: week[0], to: week[6] });
    const states = [];
    for (const d of week) states.push(await this.refreshDailyState(d));
    const sessions = (await this.repository.getAll(STORES.studySessions))
      .filter((s) => s.date >= week[0] && s.date <= week[6]);
    const distractions = (await this.repository.getAll(STORES.routineDistractions));
    const metrics = computeWeekMetrics({
      dayStates: states,
      blocks,
      sessions,
      distractions,
      consistency: profile.consistency,
    });
    const achievements = await this.repository.getAll(STORES.routineAchievements);
    const loadAdvice = loadAdjustmentAdvice({
      weekAdherence: [metrics.weeklyConsistency],
    });
    return { profile, metrics, achievements, loadAdvice };
  }

  async createWeeklyReview(answers = {}) {
    const profile = await this.ensureProfile();
    const week = weekDatesFrom();
    const snap = await this.getProgressSnapshot();
    const suggestions = buildLocalSuggestions({
      metrics: snap.metrics,
      answers,
      profile,
    });
    const review = createWeeklyReview({
      userId: this.userId(),
      contestId: this.contestId(),
      weekStart: week[0],
      weekEnd: week[6],
      metrics: snap.metrics,
      answers,
      suggestions,
    });
    await this.repository.put(STORES.routineWeeklyReviews, review);
    profile.consistency = {
      ...profile.consistency,
      weeklyReviewsDone: (profile.consistency.weeklyReviewsDone || 0) + 1,
    };
    await this.repository.put(STORES.routineProfiles, profile);
    const earned = await this.repository.getAll(STORES.routineAchievements);
    const unlocked = evaluateAchievements(profile.consistency, earned.map((a) => a.code));
    for (const u of unlocked) {
      await this.repository.put(STORES.routineAchievements, createAchievement({
        id: `${u.code}_${this.userId()}_${this.contestId()}`,
        userId: this.userId(),
        contestId: this.contestId(),
        code: u.code,
        title: u.title,
      }));
    }
    return { review, unlocked };
  }

  async applySuggestion(suggestion, { confirm = false } = {}) {
    if (!confirm) return { applied: false, reason: 'Confirmação necessária.' };
    const profile = await this.ensureProfile();
    if (suggestion?.type === 'reduce_load') {
      const next = applyLoadPercent(profile, suggestion.percent || 15, 'reduce');
      await this.saveProfile(next);
      return { applied: true, profile: next };
    }
    if (suggestion?.type === 'increase_load') {
      const next = applyLoadPercent(profile, suggestion.percent || 10, 'increase');
      await this.saveProfile(next);
      return { applied: true, profile: next };
    }
    return { applied: false, reason: 'Sugestão informativa — ajuste manual no perfil.' };
  }

  async duplicateBlock(blockId) {
    const block = await this.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    return this.createBlock({
      ...block,
      id: undefined,
      status: 'planned',
      actualMinutes: 0,
      completedAt: null,
      rescheduledFrom: null,
      rescheduledTo: null,
      source: 'user',
    });
  }

  async copyDay(fromDate, toDate) {
    const blocks = await this.getBlocksForDate(fromDate);
    const copies = [];
    for (const b of blocks) {
      if (['cancelled', 'rescheduled'].includes(b.status)) continue;
      copies.push(await this.createBlock({
        ...b,
        id: undefined,
        date: toDate,
        status: 'planned',
        actualMinutes: 0,
        completedAt: null,
        source: 'user',
      }));
    }
    return copies;
  }

  createFocus(options) {
    return createFocusController({
      ...options,
      userId: this.userId(),
      contestId: this.contestId(),
    });
  }

  navigateTargetForBlock(block) {
    return moduleTargetForActivity(block?.activityType);
  }

  /** Foco válido concede XP próprio, sem alterar domínio, estrelas ou LV acadêmico. */
  static academicSideEffects() {
    return { grantsXp: true, changesMastery: false, changesStars: false, changesLevel: false };
  }
}

export const routineService = new RoutineService();

// re-export store names for migrations/docs
export { ROUTINE_STORES, activityLabel };
