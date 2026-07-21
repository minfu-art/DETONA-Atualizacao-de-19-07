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

function repo() {
  return progressRepository;
}

export class RoutineService {
  constructor({ repository = progressRepository } = {}) {
    this.repository = repository;
  }

  userId() {
    return this.repository.userId();
  }

  contestId() {
    return this.repository.contestId();
  }

  async ensureProfile() {
    const profiles = await this.repository.getAll(STORES.routineProfiles);
    if (profiles.length) {
      const p = normalizeRoutineProfile(profiles[0]);
      await this.repository.put(STORES.routineProfiles, p);
      return p;
    }
    const legacy = await this.repository.getAll(STORES.routines);
    const player = (await this.repository.getAll(STORES.player))[0];
    const profile = migrateLegacyRoutinesToProfile(legacy, {
      userId: this.userId(),
      contestId: this.contestId(),
      examDate: player?.exam_date || null,
    });
    await this.repository.put(STORES.routineProfiles, profile);
    const reminders = createReminderSettings({
      id: `reminders_${this.userId()}_${this.contestId()}`,
      userId: this.userId(),
      contestId: this.contestId(),
    });
    await this.repository.put(STORES.routineReminderSettings, reminders);
    profile.reminderSettingsId = reminders.id;
    await this.repository.put(STORES.routineProfiles, profile);
    return profile;
  }

  async saveProfile(patch) {
    const current = await this.ensureProfile();
    const next = normalizeRoutineProfile({
      ...current,
      ...patch,
      id: current.id,
      userId: this.userId(),
      contestId: this.contestId(),
      updatedAt: nowIso(),
    });
    await this.repository.put(STORES.routineProfiles, next);
    await this.syncLegacyRoutines(next);
    return next;
  }

  /** Mantém StudyRoutine legado em sincronia para home/battle */
  async syncLegacyRoutines(profile) {
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
    await this.repository.putMany(STORES.routines, rows);
  }

  async completeSetup({ model = 'equilibrada', overrides = {}, generatePlan = true } = {}) {
    const profile = await this.saveProfile({
      ...overrides,
      model,
      setupCompleted: true,
    });
    if (generatePlan) {
      await this.regenerateCurrentWeek(profile);
    }
    return profile;
  }

  async regenerateCurrentWeek(profile) {
    profile = profile || await this.ensureProfile();
    const week = weekDatesFrom();
    const subtopics = await this.repository.getAll(STORES.subtopics);
    const weak = weakSpotSuggestions(subtopics, { limit: 6 });
    let dueReviews = 0;
    try {
      const rq = await this.repository.getAll(STORES.reviewQueue);
      const today = dateKey();
      dueReviews = rq.filter((i) => i.status !== 'frozen' && (i.nextReviewAt || '') <= `${today}T23:59:59`).length;
    } catch { /* ignore */ }

    const existing = await this.repository.getAll(STORES.routineBlocks);
    // remove planned template blocks da semana atual (preserva completed/history)
    for (const b of existing) {
      if (week.includes(b.date) && ['planned'].includes(b.status) && ['template', 'weakspot', 'review'].includes(b.source)) {
        await this.repository.remove(STORES.routineBlocks, b.id);
      }
    }

    const generated = generateWeekPlan(profile, {
      weekDates: week,
      weakSubtopics: weak,
      dueReviews,
      userId: this.userId(),
      contestId: this.contestId(),
    });
    if (generated.length) await this.repository.putMany(STORES.routineBlocks, generated);
    return generated;
  }

  async listBlocks({ from, to } = {}) {
    const all = await this.repository.getAll(STORES.routineBlocks);
    return all.filter((b) => {
      if (from && b.date < from) return false;
      if (to && b.date > to) return false;
      return true;
    });
  }

  async getBlocksForDate(date = dateKey()) {
    const all = await this.listBlocks({ from: date, to: date });
    return sortBlocksForDay(all);
  }

  async upsertBlock(partial) {
    const block = normalizeRoutineBlock({
      ...partial,
      userId: this.userId(),
      contestId: this.contestId(),
      updatedAt: nowIso(),
    });
    await this.repository.put(STORES.routineBlocks, block);
    return block;
  }

  async createBlock(partial) {
    return this.upsertBlock(createRoutineBlock({
      ...partial,
      userId: this.userId(),
      contestId: this.contestId(),
    }));
  }

  async startBlock(blockId) {
    const block = await this.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    const next = normalizeRoutineBlock({ ...block, status: 'in_progress', updatedAt: nowIso() });
    await this.repository.put(STORES.routineBlocks, next);
    return next;
  }

  async completeBlock(blockId, { actualMinutes = null, partial = false, skipReason = null } = {}) {
    const block = await this.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    const minutes = actualMinutes == null ? (block.actualMinutes || 0) : Math.max(0, Number(actualMinutes) || 0);
    const next = normalizeRoutineBlock({
      ...block,
      actualMinutes: minutes,
      status: partial ? 'partially_completed' : 'completed',
      skipReason: partial ? (skipReason || block.skipReason) : null,
      completedAt: nowIso(),
      updatedAt: nowIso(),
    });
    await this.repository.put(STORES.routineBlocks, next);
    await this.refreshDailyState(block.date);
    return next;
  }

  async skipBlock(blockId, skipReason = null) {
    const block = await this.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    const next = normalizeRoutineBlock({
      ...block,
      status: 'skipped',
      skipReason,
      updatedAt: nowIso(),
    });
    await this.repository.put(STORES.routineBlocks, next);
    await this.refreshDailyState(block.date);
    return next;
  }

  async rescheduleBlock(blockId, option = 'find_week') {
    const profile = await this.ensureProfile();
    const block = await this.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    const week = weekDatesFrom();
    const existing = await this.repository.getAll(STORES.routineBlocks);
    const today = dateKey();

    if (option === 'today') {
      const suggestion = normalizeRoutineBlock({
        ...block,
        id: `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        date: today,
        status: 'planned',
        rescheduledFrom: block.id,
        source: 'reschedule',
        actualMinutes: 0,
        completedAt: null,
        updatedAt: nowIso(),
        createdAt: nowIso(),
      });
      return { suggestion, preview: true, reason: 'Reagendar para hoje (confirme).' };
    }
    if (option === 'tomorrow') {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() + 1);
      const suggestion = normalizeRoutineBlock({
        ...block,
        id: `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        date: dateKey(d),
        status: 'planned',
        rescheduledFrom: block.id,
        source: 'reschedule',
        actualMinutes: 0,
        completedAt: null,
        updatedAt: nowIso(),
        createdAt: nowIso(),
      });
      return { suggestion, preview: true, reason: 'Reagendar para amanhã (confirme).' };
    }
    if (option === 'next_week') {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() + 7);
      const suggestion = normalizeRoutineBlock({
        ...block,
        id: `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        date: dateKey(d),
        status: 'planned',
        rescheduledFrom: block.id,
        source: 'reschedule',
        actualMinutes: 0,
        completedAt: null,
      });
      return { suggestion, preview: true, reason: 'Mover para a próxima semana (confirme).' };
    }
    if (option === 'pending') {
      return { suggestion: null, keepPending: true, reason: 'Manter como pendente sem reagendar.' };
    }
    if (option === 'cancel') {
      return { suggestion: null, cancel: true, reason: 'Cancelar bloco conscientemente.' };
    }

    const found = suggestRescheduleSlot(block, profile, existing, { weekDates: week, today });
    return { ...found, preview: true };
  }

  async confirmReschedule(blockId, suggestion) {
    const block = await this.repository.getById(STORES.routineBlocks, blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    if (!suggestion) throw new Error('Sugestão inválida.');
    const { from, to } = applyReschedule(block, suggestion);
    from.userId = this.userId();
    from.contestId = this.contestId();
    to.userId = this.userId();
    to.contestId = this.contestId();
    await this.repository.put(STORES.routineBlocks, from);
    await this.repository.put(STORES.routineBlocks, to);
    await this.refreshDailyState(from.date);
    await this.refreshDailyState(to.date);
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

  async getDailyState(date = dateKey()) {
    const id = date;
    let state = await this.repository.getById(STORES.routineDailyStates, id);
    if (!state) {
      const profile = await this.ensureProfile();
      const flags = isProgrammedDay(profile, date);
      state = createDailyState({
        id,
        date,
        userId: this.userId(),
        contestId: this.contestId(),
        programmed: flags.programmed,
        restDay: flags.restDay,
      });
      await this.repository.put(STORES.routineDailyStates, state);
    }
    return state;
  }

  async refreshDailyState(date = dateKey()) {
    const profile = await this.ensureProfile();
    const blocks = await this.getBlocksForDate(date);
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
      const log = await this.repository.getById(STORES.dailyLogs, date);
      answeredQuestions = log?.completed_amount || 0;
    } catch { /* ignore */ }

    const prev = await this.getDailyState(date);
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
      userId: this.userId(),
      contestId: this.contestId(),
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
    await this.repository.put(STORES.routineDailyStates, state);

    // sincroniza dailyLog legado sem XP de rotina
    try {
      let log = await this.repository.getById(STORES.dailyLogs, date);
      if (!log) {
        log = {
          date,
          planned_amount: profile.dailyQuestionsGoal || 30,
          completed_amount: answeredQuestions,
          status: minGoalMet ? 'cumprido' : 'pendente',
          xp_earned: 0,
          meta_bonus_granted: false,
        };
      } else {
        log = {
          ...log,
          status: minGoalMet ? 'cumprido' : (log.completed_amount > 0 ? 'parcial' : log.status),
        };
      }
      await this.repository.put(STORES.dailyLogs, log);
    } catch { /* ignore */ }

    return state;
  }

  async closeDay(date = dateKey()) {
    const profile = await this.ensureProfile();
    const state = await this.refreshDailyState(date);
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
      const yState = await this.repository.getById(STORES.routineDailyStates, yKey);
      if (yState?.programmed && !yState.restDay && !yState.minGoalMet) {
        result.consistency = markRetake(result.consistency, true);
      }
    }
    profile.consistency = result.consistency;
    profile.updatedAt = nowIso();
    await this.repository.put(STORES.routineProfiles, profile);

    if (result.shieldUsed) {
      state.shieldUsed = true;
      await this.repository.put(STORES.routineDailyStates, state);
    }

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

    return { state, consistency: profile.consistency, shieldUsed: result.shieldUsed, message: result.message, unlocked };
  }

  async recordSessionResult(session, actualMinutes, { blockId = null, partial = false } = {}) {
    session.userId = this.userId();
    session.contestId = this.contestId();
    await this.repository.put(STORES.studySessions, session);
    const profile = await this.ensureProfile();
    profile.consistency = {
      ...profile.consistency,
      sessionsCompleted: (profile.consistency.sessionsCompleted || 0) + (session.status === 'completed' ? 1 : 0),
    };
    await this.repository.put(STORES.routineProfiles, profile);

    if (blockId) {
      const block = await this.repository.getById(STORES.routineBlocks, blockId);
      if (block) {
        const minutes = validSessionMinutes(session.elapsedSeconds, {
          completed: session.status === 'completed',
          aborted: session.status === 'aborted',
        });
        await this.completeBlock(blockId, {
          actualMinutes: minutes || actualMinutes || 0,
          partial: partial || session.status === 'aborted',
        });
      }
    } else {
      await this.refreshDailyState(session.date || dateKey());
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

  /** Garante que rotina não altera domínio/estrelas — helper de teste/documentação */
  static academicSideEffects() {
    return { grantsXp: false, changesMastery: false, changesStars: false, changesLevel: false };
  }
}

export const routineService = new RoutineService();

// re-export store names for migrations/docs
export { ROUTINE_STORES, activityLabel };
