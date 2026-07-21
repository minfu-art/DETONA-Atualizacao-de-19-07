/**
 * Rotina Inteligente V2 — schema, defaults e normalização (puro, sem I/O).
 * Schema version: 1
 */

export const ROUTINE_SCHEMA_VERSION = 2;

export const ACTIVITY_TYPES = Object.freeze([
  'teoria', 'questoes', 'revisao', 'revisao_fila', 'lei_seca', 'resumo',
  'flashcards', 'simulado', 'correcao_simulado', 'aula', 'personalizada',
  /* vida / planejamento do edital */
  'estudo', 'trabalho', 'descanso', 'lazer', 'compromisso',
]);

/** Família do bloco para UI (estudo / trabalho / descanso) */
export function activityFamily(type) {
  if (type === 'trabalho' || type === 'compromisso') return 'trabalho';
  if (type === 'descanso' || type === 'lazer') return 'descanso';
  return 'estudo';
}

export const SCHEDULE_TYPES = Object.freeze(['horario_fixo', 'janela_flexivel', 'qualquer_horario']);
export const ANCHOR_TYPES = Object.freeze(['horario', 'apos_evento', 'janela', 'manual']);
export const BLOCK_STATUS = Object.freeze([
  'planned', 'in_progress', 'completed', 'partially_completed', 'skipped', 'rescheduled', 'cancelled',
]);
export const ROUTINE_MODELS = Object.freeze(['leve', 'equilibrada', 'intensa']);
export const SKIP_REASONS = Object.freeze([
  'falta_de_tempo', 'cansaco', 'imprevisto', 'tarefa_grande', 'dificuldade',
  'problema_tecnico', 'mudanca_prioridade', 'esquecimento', 'outro',
]);
export const DISTRACTION_CATEGORIES = Object.freeze([
  'celular', 'rede_social', 'conversa', 'cansaco', 'fome', 'barulho',
  'pensamento', 'tarefa_externa', 'dificuldade_conteudo', 'outra',
]);

export const ROUTINE_STORES = Object.freeze({
  routineProfiles: 'routineProfiles',
  routineBlocks: 'routineBlocks',
  studySessions: 'studySessions',
  routineDailyStates: 'routineDailyStates',
  routineWeeklyReviews: 'routineWeeklyReviews',
  routineAchievements: 'routineAchievements',
  routineDistractions: 'routineDistractions',
  routineReminderSettings: 'routineReminderSettings',
});

export function nowIso() {
  return new Date().toISOString();
}

export function dateKey(d = new Date()) {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function makeId(prefix = 'rt') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultMinGoal() {
  return {
    type: 'minutes', // minutes | questions | blocks | review | combo
    minutes: 10,
    questions: 5,
    blocks: 1,
    reviews: 1,
  };
}

export function defaultEntryAction() {
  return {
    type: 'minutes', // minutes | question | review_error | page | timer
    minutes: 5,
    label: 'Abrir sessão de 5 minutos',
  };
}

export function defaultFocusSettings() {
  return {
    sessionMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cycles: 4,
    autoStartBreak: false,
    soundOnEnd: true,
    vibrateOnEnd: true,
    silentMode: false,
    keepScreenAwake: true,
  };
}

/** Templates iniciais determinísticos */
export function modelTemplate(model = 'equilibrada') {
  const base = {
    availableDays: [1, 2, 3, 4, 5], // seg-sex
    restDays: [0, 6],
    minDailyMinutes: 20,
    maxDailyMinutes: 90,
    weeklyHoursGoal: 6,
    dailyQuestionsGoal: 30,
    preferredSessionMinutes: 25,
    preferredBreakMinutes: 5,
    maxBlocksPerDay: 4,
    energyPeriods: ['noite'],
    preferenceSlot: 'noite', // manha | tarde | noite
    flexible: true,
    fixedCommitments: [],
    dayWindows: {
      1: { start: '19:00', end: '21:00' },
      2: { start: '19:00', end: '21:00' },
      3: { start: '19:00', end: '21:00' },
      4: { start: '19:00', end: '21:00' },
      5: { start: '19:00', end: '21:00' },
    },
  };

  if (model === 'leve') {
    return {
      ...base,
      model: 'leve',
      minDailyMinutes: 10,
      maxDailyMinutes: 45,
      weeklyHoursGoal: 3,
      dailyQuestionsGoal: 15,
      preferredSessionMinutes: 15,
      maxBlocksPerDay: 2,
      flexible: true,
    };
  }
  if (model === 'intensa') {
    return {
      ...base,
      model: 'intensa',
      availableDays: [1, 2, 3, 4, 5, 6],
      restDays: [0],
      minDailyMinutes: 40,
      maxDailyMinutes: 180,
      weeklyHoursGoal: 12,
      dailyQuestionsGoal: 60,
      preferredSessionMinutes: 40,
      maxBlocksPerDay: 6,
      flexible: false,
      dayWindows: {
        ...base.dayWindows,
        6: { start: '09:00', end: '12:00' },
      },
    };
  }
  return { ...base, model: 'equilibrada' };
}

export function createRoutineProfile({
  userId,
  contestId,
  model = 'equilibrada',
  examDate = null,
  overrides = {},
} = {}) {
  const tpl = modelTemplate(model);
  const ts = nowIso();
  return normalizeRoutineProfile({
    id: `profile_${userId || 'u'}_${contestId || 'c'}`,
    userId: userId || null,
    contestId: contestId || null,
    schemaVersion: ROUTINE_SCHEMA_VERSION,
    setupCompleted: false,
    paused: false,
    examDate,
    minGoal: defaultMinGoal(),
    entryAction: defaultEntryAction(),
    focus: defaultFocusSettings(),
    consistency: {
      currentStreak: 0,
      bestStreak: 0,
      shields: 0,
      maxShields: 2,
      autoUseShield: true,
      programmedDaysCompleted: 0,
      sessionsCompleted: 0,
      weeklyReviewsDone: 0,
      retakes: 0,
    },
    reminderSettingsId: null,
    createdAt: ts,
    updatedAt: ts,
    ...tpl,
    ...overrides,
  });
}

export function normalizeRoutineProfile(raw = {}) {
  const tpl = modelTemplate(raw.model || 'equilibrada');
  return {
    id: raw.id || makeId('profile'),
    userId: raw.userId ?? null,
    contestId: raw.contestId ?? null,
    schemaVersion: Number(raw.schemaVersion) || ROUTINE_SCHEMA_VERSION,
    setupCompleted: Boolean(raw.setupCompleted),
    paused: Boolean(raw.paused),
    model: ROUTINE_MODELS.includes(raw.model) ? raw.model : 'equilibrada',
    availableDays: Array.isArray(raw.availableDays) ? raw.availableDays.map(Number) : tpl.availableDays,
    restDays: Array.isArray(raw.restDays) ? raw.restDays.map(Number) : tpl.restDays,
    dayWindows: raw.dayWindows && typeof raw.dayWindows === 'object' ? raw.dayWindows : tpl.dayWindows,
    fixedCommitments: Array.isArray(raw.fixedCommitments) ? raw.fixedCommitments : [],
    minDailyMinutes: clampInt(raw.minDailyMinutes, 5, 600, tpl.minDailyMinutes),
    maxDailyMinutes: clampInt(raw.maxDailyMinutes, 10, 720, tpl.maxDailyMinutes),
    weeklyHoursGoal: clampNum(raw.weeklyHoursGoal, 0.5, 80, tpl.weeklyHoursGoal),
    dailyQuestionsGoal: clampInt(raw.dailyQuestionsGoal, 0, 500, tpl.dailyQuestionsGoal),
    preferredSessionMinutes: clampInt(raw.preferredSessionMinutes, 5, 180, tpl.preferredSessionMinutes),
    preferredBreakMinutes: clampInt(raw.preferredBreakMinutes, 0, 60, tpl.preferredBreakMinutes),
    maxBlocksPerDay: clampInt(raw.maxBlocksPerDay, 1, 12, tpl.maxBlocksPerDay),
    energyPeriods: Array.isArray(raw.energyPeriods) ? raw.energyPeriods : tpl.energyPeriods,
    preferenceSlot: ['manha', 'tarde', 'noite'].includes(raw.preferenceSlot) ? raw.preferenceSlot : 'noite',
    flexible: raw.flexible !== false,
    examDate: raw.examDate || null,
    examTime: raw.examTime || null,
    examLocation: raw.examLocation || null,
    examNotes: raw.examNotes || null,
    journeyStartDate: raw.journeyStartDate || (raw.createdAt ? String(raw.createdAt).slice(0, 10) : null),
    minGoal: { ...defaultMinGoal(), ...(raw.minGoal || {}) },
    entryAction: { ...defaultEntryAction(), ...(raw.entryAction || {}) },
    focus: { ...defaultFocusSettings(), ...(raw.focus || {}) },
    consistency: {
      currentStreak: 0,
      bestStreak: 0,
      shields: 0,
      maxShields: 2,
      autoUseShield: true,
      programmedDaysCompleted: 0,
      sessionsCompleted: 0,
      weeklyReviewsDone: 0,
      retakes: 0,
      ...(raw.consistency || {}),
    },
    reminderSettingsId: raw.reminderSettingsId || null,
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  };
}

export function createRoutineBlock(partial = {}) {
  const ts = nowIso();
  return normalizeRoutineBlock({
    id: makeId('block'),
    userId: null,
    contestId: null,
    date: dateKey(),
    startTime: null,
    endTime: null,
    plannedMinutes: 25,
    actualMinutes: 0,
    subjectId: null,
    topicId: null,
    subtopicId: null,
    activityType: 'questoes',
    title: 'Bloco de estudo',
    description: '',
    priority: 50,
    recurrence: null, // { frequency: 'weekly', days: [1], seriesId }
    scheduleType: 'janela_flexivel',
    anchorType: 'manual',
    anchorDescription: '',
    status: 'planned',
    source: 'user', // user | template | weakspot | review | reduced | reschedule
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    rescheduledFrom: null,
    rescheduledTo: null,
    skipReason: null,
    seriesId: null,
    occurrenceOnly: false,
    ...partial,
  });
}

export function normalizeRoutineBlock(raw = {}) {
  const status = BLOCK_STATUS.includes(raw.status) ? raw.status : 'planned';
  const activityType = ACTIVITY_TYPES.includes(raw.activityType) ? raw.activityType : 'personalizada';
  return {
    id: raw.id || makeId('block'),
    userId: raw.userId ?? null,
    contestId: raw.contestId ?? null,
    date: dateKey(raw.date || dateKey()),
    startTime: raw.startTime || null,
    endTime: raw.endTime || null,
    plannedMinutes: clampInt(raw.plannedMinutes, 1, 480, 25),
    actualMinutes: clampInt(raw.actualMinutes, 0, 720, 0),
    subjectId: raw.subjectId || null,
    topicId: raw.topicId || null,
    subtopicId: raw.subtopicId || null,
    activityType,
    title: String(raw.title || activityLabel(activityType)).slice(0, 120),
    description: String(raw.description || '').slice(0, 500),
    priority: clampInt(raw.priority, 0, 100, 50),
    recurrence: raw.recurrence || null,
    scheduleType: SCHEDULE_TYPES.includes(raw.scheduleType) ? raw.scheduleType : 'janela_flexivel',
    anchorType: ANCHOR_TYPES.includes(raw.anchorType) ? raw.anchorType : 'manual',
    anchorDescription: String(raw.anchorDescription || '').slice(0, 200),
    status,
    source: raw.source || 'user',
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
    completedAt: raw.completedAt || null,
    rescheduledFrom: raw.rescheduledFrom || null,
    rescheduledTo: raw.rescheduledTo || null,
    skipReason: raw.skipReason || null,
    seriesId: raw.seriesId || raw.recurrence?.seriesId || null,
    occurrenceOnly: Boolean(raw.occurrenceOnly),
    schemaVersion: Number(raw.schemaVersion) || ROUTINE_SCHEMA_VERSION,
  };
}

export function createStudySession(partial = {}) {
  const ts = nowIso();
  return {
    id: partial.id || makeId('sess'),
    userId: partial.userId ?? null,
    contestId: partial.contestId ?? null,
    blockId: partial.blockId || null,
    date: dateKey(partial.date || dateKey()),
    plannedMinutes: clampInt(partial.plannedMinutes, 1, 480, 25),
    elapsedSeconds: clampInt(partial.elapsedSeconds, 0, 86400, 0),
    status: partial.status || 'ready', // ready | running | paused | completed | aborted
    focusScore: partial.focusScore ?? null,
    difficultyScore: partial.difficultyScore ?? null,
    interruptReason: partial.interruptReason || null,
    note: partial.note || '',
    startedAt: partial.startedAt || null,
    endedAt: partial.endedAt || null,
    pausedAt: partial.pausedAt || null,
    totalPausedSeconds: clampInt(partial.totalPausedSeconds, 0, 86400, 0),
    mode: partial.mode || 'countdown', // countdown | countup
    createdAt: partial.createdAt || ts,
    updatedAt: partial.updatedAt || ts,
    schemaVersion: ROUTINE_SCHEMA_VERSION,
  };
}

export function createDailyState(partial = {}) {
  return {
    id: partial.id || dateKey(partial.date || dateKey()),
    userId: partial.userId ?? null,
    contestId: partial.contestId ?? null,
    date: dateKey(partial.date || dateKey()),
    programmed: partial.programmed !== false,
    restDay: Boolean(partial.restDay),
    minGoalMet: Boolean(partial.minGoalMet),
    entryActionDone: Boolean(partial.entryActionDone),
    plannedMinutes: clampInt(partial.plannedMinutes, 0, 720, 0),
    actualMinutes: clampInt(partial.actualMinutes, 0, 720, 0),
    extraMinutes: clampInt(partial.extraMinutes, 0, 720, 0),
    plannedQuestions: clampInt(partial.plannedQuestions, 0, 500, 0),
    answeredQuestions: clampInt(partial.answeredQuestions, 0, 500, 0),
    reducedPlanActive: Boolean(partial.reducedPlanActive),
    reducedPlanMinutes: partial.reducedPlanMinutes || null,
    originalPlanSnapshot: partial.originalPlanSnapshot || null,
    shieldUsed: Boolean(partial.shieldUsed),
    status: partial.status || 'open', // open | min_met | complete | missed | rest
    createdAt: partial.createdAt || nowIso(),
    updatedAt: partial.updatedAt || nowIso(),
    schemaVersion: ROUTINE_SCHEMA_VERSION,
  };
}

export function createDistraction(partial = {}) {
  return {
    id: partial.id || makeId('dist'),
    userId: partial.userId ?? null,
    contestId: partial.contestId ?? null,
    sessionId: partial.sessionId || null,
    blockId: partial.blockId || null,
    category: DISTRACTION_CATEGORIES.includes(partial.category) ? partial.category : 'outra',
    at: partial.at || nowIso(),
    note: partial.note || '',
    schemaVersion: ROUTINE_SCHEMA_VERSION,
  };
}

export function createWeeklyReview(partial = {}) {
  return {
    id: partial.id || makeId('wrev'),
    userId: partial.userId ?? null,
    contestId: partial.contestId ?? null,
    weekStart: partial.weekStart || dateKey(),
    weekEnd: partial.weekEnd || dateKey(),
    metrics: partial.metrics || {},
    answers: {
      worked: '',
      hindered: '',
      load: 'adequada', // leve | adequada | excessiva
      bestPeriod: '',
      adjustNext: '',
      ...(partial.answers || {}),
    },
    suggestions: Array.isArray(partial.suggestions) ? partial.suggestions : [],
    appliedSuggestionIds: Array.isArray(partial.appliedSuggestionIds) ? partial.appliedSuggestionIds : [],
    createdAt: partial.createdAt || nowIso(),
    schemaVersion: ROUTINE_SCHEMA_VERSION,
  };
}

export function createAchievement(partial = {}) {
  return {
    id: partial.id || makeId('ach'),
    userId: partial.userId ?? null,
    contestId: partial.contestId ?? null,
    code: partial.code || 'first_step',
    title: partial.title || 'Conquista',
    earnedAt: partial.earnedAt || nowIso(),
    schemaVersion: ROUTINE_SCHEMA_VERSION,
  };
}

export function createReminderSettings(partial = {}) {
  return {
    id: partial.id || 'reminders_default',
    userId: partial.userId ?? null,
    contestId: partial.contestId ?? null,
    inAppEnabled: partial.inAppEnabled !== false,
    webNotificationsEnabled: Boolean(partial.webNotificationsEnabled),
    permissionAsked: Boolean(partial.permissionAsked),
    upcomingMinutes: clampInt(partial.upcomingMinutes, 1, 120, 15),
    weeklyReviewReminder: partial.weeklyReviewReminder !== false,
    createdAt: partial.createdAt || nowIso(),
    updatedAt: partial.updatedAt || nowIso(),
    schemaVersion: ROUTINE_SCHEMA_VERSION,
  };
}

export function activityLabel(type) {
  const map = {
    teoria: 'Teoria',
    questoes: 'Questões',
    revisao: 'Revisão',
    revisao_fila: 'Revisão inteligente',
    lei_seca: 'Lei seca',
    resumo: 'Resumo',
    flashcards: 'Flashcards',
    simulado: 'Simulado',
    correcao_simulado: 'Correção de simulado',
    aula: 'Aula',
    personalizada: 'Atividade personalizada',
    estudo: 'Estudo (edital)',
    trabalho: 'Trabalho',
    descanso: 'Descanso',
    lazer: 'Lazer',
    compromisso: 'Compromisso',
  };
  return map[type] || 'Estudo';
}

export function moduleTargetForActivity(type) {
  if (type === 'trabalho' || type === 'descanso' || type === 'lazer' || type === 'compromisso') return 'expedition';
  if (type === 'revisao' || type === 'revisao_fila') return 'review';
  if (type === 'questoes' || type === 'simulado' || type === 'correcao_simulado' || type === 'estudo') return 'map';
  if (type === 'teoria' || type === 'lei_seca' || type === 'aula') return 'map';
  return 'home';
}

/** Migra rotinas legadas (day_of_week) → perfil básico */
export function migrateLegacyRoutinesToProfile(legacyRoutines = [], { userId, contestId, examDate } = {}) {
  const enabledDays = legacyRoutines.filter((r) => r.enabled !== false).map((r) => Number(r.day_of_week));
  const restDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !enabledDays.includes(d));
  const sample = legacyRoutines.find((r) => r.enabled !== false) || legacyRoutines[0] || {};
  const dayWindows = {};
  for (const r of legacyRoutines) {
    if (r.enabled === false) continue;
    dayWindows[r.day_of_week] = {
      start: r.start_time || '19:00',
      end: r.end_time || '21:00',
    };
  }
  const goalType = sample.goal_type || 'questoes';
  const amount = Number(sample.goal_amount) || 30;
  return createRoutineProfile({
    userId,
    contestId,
    model: 'equilibrada',
    examDate,
    overrides: {
      setupCompleted: legacyRoutines.length > 0,
      availableDays: enabledDays.length ? enabledDays : [1, 2, 3, 4, 5],
      restDays: restDays.length ? restDays : [0, 6],
      dayWindows: Object.keys(dayWindows).length ? dayWindows : undefined,
      dailyQuestionsGoal: goalType === 'questoes' ? amount : 30,
      minDailyMinutes: goalType === 'tempo' ? amount : 20,
      minGoal: goalType === 'questoes'
        ? { type: 'questions', minutes: 10, questions: amount, blocks: 1, reviews: 0 }
        : goalType === 'tempo'
          ? { type: 'minutes', minutes: amount, questions: 5, blocks: 1, reviews: 0 }
          : { type: 'blocks', minutes: 10, questions: 5, blocks: amount, reviews: 0 },
    },
  });
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
