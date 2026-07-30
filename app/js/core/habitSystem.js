import { localDateKey } from './localDate.js';

export const HABIT_CATEGORIES = Object.freeze({
  STUDY: 'study',
  WELLBEING: 'wellbeing',
});

export const HABIT_SOURCES = Object.freeze({
  MANUAL: 'manual',
  ACADEMIC_AUTO: 'academic_auto',
  ROUTINE_AUTO: 'routine_auto',
  MIGRATION: 'migration',
});

export const HABIT_RECORD_TYPES = Object.freeze({
  BOOLEAN: 'boolean',
  QUANTITATIVE: 'quantitative',
  SCALE: 'scale',
  TIME: 'time',
  AUTOMATIC: 'automatic',
});

export const MAX_ACTIVE_HABITS = 5;
export const RECOMMENDED_ACTIVE_HABITS = 3;
export const DEFAULT_MINIMUM_PERCENT = 60;
export const MAX_CONSISTENCY_SHIELDS = 2;

export const HABIT_CATALOG = Object.freeze([
  {
    id: 'daily_questions',
    category: HABIT_CATEGORIES.STUDY,
    label: 'Cumprir meta de questões',
    description: 'Alcance a quantidade de questões planejada para o dia.',
    icon: '✓',
    unit: 'questões',
    defaultTarget: 20,
    allowedTargets: [5, 10, 15, 20, 30, 40, 50],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.AUTOMATIC,
  },
  {
    id: 'review_errors',
    category: HABIT_CATEGORIES.STUDY,
    label: 'Revisar erros',
    description: 'Realize pelo menos uma revisão prevista para hoje.',
    icon: '↻',
    unit: 'revisões',
    defaultTarget: 1,
    allowedTargets: [1, 2, 3, 5],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.AUTOMATIC,
  },
  {
    id: 'theory_block',
    category: HABIT_CATEGORIES.STUDY,
    label: 'Estudar teoria',
    description: 'Conclua o bloco de teoria que você planejou.',
    icon: '▤',
    unit: 'blocos',
    defaultTarget: 1,
    allowedTargets: [1, 2, 3],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.BOOLEAN,
  },
  {
    id: 'plan_tomorrow',
    category: HABIT_CATEGORIES.STUDY,
    label: 'Planejar o próximo dia',
    description: 'Deixe o primeiro passo de amanhã definido.',
    icon: '◇',
    unit: 'planejamento',
    defaultTarget: 1,
    allowedTargets: [1],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.BOOLEAN,
  },
  {
    id: 'distraction_free',
    category: HABIT_CATEGORIES.STUDY,
    label: 'Estudar sem redes sociais',
    description: 'Proteja um período de estudo contra distrações.',
    icon: '◎',
    unit: 'blocos',
    defaultTarget: 1,
    allowedTargets: [1, 2, 3],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.BOOLEAN,
  },
  {
    id: 'finish_priority',
    category: HABIT_CATEGORIES.STUDY,
    label: 'Concluir a prioridade do dia',
    description: 'Finalize a missão principal planejada para hoje.',
    icon: '⚑',
    unit: 'missão',
    defaultTarget: 1,
    allowedTargets: [1],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.AUTOMATIC,
  },
  {
    id: 'water',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Beber água',
    description: 'Registre os copos de água que você escolheu acompanhar.',
    icon: '●',
    unit: 'copos',
    defaultTarget: 8,
    allowedTargets: [4, 5, 6, 7, 8, 10, 12],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.QUANTITATIVE,
  },
  {
    id: 'exercise',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Exercício físico',
    description: 'Registre o tempo de movimento escolhido por você.',
    icon: '▲',
    unit: 'min',
    defaultTarget: 30,
    allowedTargets: [5, 10, 15, 20, 30, 45, 60],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.QUANTITATIVE,
  },
  {
    id: 'meditation',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Meditação ou respiração',
    description: 'Faça uma pausa de respiração ou meditação.',
    icon: '◉',
    unit: 'min',
    defaultTarget: 10,
    allowedTargets: [1, 3, 5, 10, 15, 20],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.QUANTITATIVE,
  },
  {
    id: 'conscious_break',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Pausa consciente',
    description: 'Afaste-se por alguns minutos e retorne com intenção.',
    icon: 'Ⅱ',
    unit: 'pausas',
    defaultTarget: 1,
    allowedTargets: [1, 2, 3, 4],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.QUANTITATIVE,
  },
  {
    id: 'nutrition',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Alimentação planejada',
    description: 'Registre uma refeição que você decidiu planejar.',
    icon: '◆',
    unit: 'refeições',
    defaultTarget: 1,
    allowedTargets: [1, 2, 3, 4],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.BOOLEAN,
  },
  {
    id: 'sleep_schedule',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Respeitar horário de sono',
    description: 'Registre se cumpriu o horário de sono escolhido.',
    icon: '☾',
    unit: 'registro',
    defaultTarget: 1,
    allowedTargets: [1],
    isMedicalSensitive: true,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.TIME,
  },
  {
    id: 'reading',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Leitura fora das telas',
    description: 'Reserve um período para leitura longe das telas.',
    icon: '▥',
    unit: 'min',
    defaultTarget: 15,
    allowedTargets: [5, 10, 15, 20, 30, 45, 60],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.QUANTITATIVE,
  },
  {
    id: 'personal_supplement',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Suplementação pessoal',
    description: 'Registro pessoal, sem indicação, dosagem ou recomendação do DETONA.',
    icon: '○',
    unit: 'registro',
    defaultTarget: 1,
    allowedTargets: [1],
    isMedicalSensitive: true,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.BOOLEAN,
  },
  {
    id: 'creatine',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Creatina',
    description: 'Lembrete pessoal, sem indicação ou informação de dose.',
    icon: 'C',
    unit: 'registro',
    defaultTarget: 1,
    allowedTargets: [1],
    isMedicalSensitive: true,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.BOOLEAN,
  },
  {
    id: 'medication',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Medicação',
    description: 'Lembrete pessoal discreto que não substitui orientação profissional.',
    icon: 'M',
    unit: 'registro',
    defaultTarget: 1,
    allowedTargets: [1],
    isMedicalSensitive: true,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.BOOLEAN,
  },
  {
    id: 'wake_time',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Horário de acordar',
    description: 'Compare o horário planejado com o horário registrado.',
    icon: 'A',
    unit: 'registro',
    defaultTarget: 1,
    allowedTargets: [1],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.TIME,
  },
  {
    id: 'energy_level',
    category: HABIT_CATEGORIES.WELLBEING,
    label: 'Energia percebida',
    description: 'Registre como você percebe sua energia, sem diagnóstico ou recomendação.',
    icon: 'E',
    unit: 'nível',
    defaultTarget: 3,
    allowedTargets: [1, 2, 3, 4, 5],
    isMedicalSensitive: false,
    status: 'active',
    recordType: HABIT_RECORD_TYPES.SCALE,
  },
]);

const CATALOG_MAP = new Map(HABIT_CATALOG.map((item) => [item.id, item]));

export const LEGACY_HABIT_MAP = Object.freeze({
  wb_agua: 'water',
  wb_exercicio: 'exercise',
  wb_alimentacao: 'nutrition',
  wb_meditacao: 'meditation',
  wb_sono: 'sleep_schedule',
});

export function getHabitCatalogItem(habitId) {
  return CATALOG_MAP.get(String(habitId || '')) || null;
}

export function habitDefinitionId(habitId) {
  return `habit:${habitId}`;
}

export function habitDailyLogId(definitionId, localDate) {
  return `${definitionId}|${localDate}`;
}

export function normalizeActiveDays(days = [0, 1, 2, 3, 4, 5, 6]) {
  return [...new Set((Array.isArray(days) ? days : [])
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);
}

export function validateHabitSelection(habitIds = []) {
  const valid = [...new Set(habitIds)].filter((id) => CATALOG_MAP.has(id));
  return {
    valid,
    exceedsMaximum: valid.length > MAX_ACTIVE_HABITS,
    belowRecommended: valid.length > 0 && valid.length < RECOMMENDED_ACTIVE_HABITS,
    canSave: valid.length <= MAX_ACTIVE_HABITS,
    canSkip: true,
  };
}

export function createHabitDefinition({
  habitId,
  userId,
  contestId,
  target = null,
  unit = null,
  activeDays = [0, 1, 2, 3, 4, 5, 6],
  reminderTime = null,
  orderIndex = 0,
  enabled = true,
  recordType = null,
  windowStart = null,
  windowEnd = null,
  cutoffTime = null,
  cupSizeMl = null,
  mealAnchor = null,
  discreteMode = false,
  privateLabel = null,
  desiredSleepTime = null,
  desiredWakeTime = null,
  activityType = null,
  minimumPossible = null,
  location = null,
  note = null,
  reminderEnabled = true,
  reminderLeadMinutes = 0,
  pausedUntil = null,
  modelVersion = 2,
  now = new Date().toISOString(),
} = {}) {
  const catalog = getHabitCatalogItem(habitId);
  if (!catalog) throw new Error('HABIT_NOT_FOUND');
  const requestedTarget = Number(target ?? catalog.defaultTarget);
  const safeTarget = catalog.allowedTargets.includes(requestedTarget)
    ? requestedTarget
    : catalog.defaultTarget;
  return {
    id: habitDefinitionId(habitId),
    userId: String(userId || ''),
    contestId: String(contestId || ''),
    habitId,
    target: safeTarget,
    unit: unit || catalog.unit,
    activeDays: normalizeActiveDays(activeDays),
    reminderTime: /^\d{2}:\d{2}$/.test(String(reminderTime || '')) ? reminderTime : null,
    recordType: Object.values(HABIT_RECORD_TYPES).includes(recordType)
      ? recordType
      : catalog.recordType || HABIT_RECORD_TYPES.BOOLEAN,
    windowStart: /^\d{2}:\d{2}$/.test(String(windowStart || '')) ? windowStart : null,
    windowEnd: /^\d{2}:\d{2}$/.test(String(windowEnd || '')) ? windowEnd : null,
    cutoffTime: /^\d{2}:\d{2}$/.test(String(cutoffTime || '')) ? cutoffTime : null,
    cupSizeMl: Math.max(0, Number(cupSizeMl) || 0) || null,
    mealAnchor: String(mealAnchor || '').slice(0, 60) || null,
    discreteMode: Boolean(discreteMode),
    privateLabel: String(privateLabel || '').slice(0, 80) || null,
    desiredSleepTime: /^\d{2}:\d{2}$/.test(String(desiredSleepTime || '')) ? desiredSleepTime : null,
    desiredWakeTime: /^\d{2}:\d{2}$/.test(String(desiredWakeTime || '')) ? desiredWakeTime : null,
    activityType: String(activityType || '').slice(0, 60) || null,
    minimumPossible: Math.max(0, Number(minimumPossible) || 0) || null,
    location: String(location || '').slice(0, 100) || null,
    note: String(note || '').slice(0, 500) || null,
    reminderEnabled: reminderEnabled !== false,
    reminderLeadMinutes: Math.max(0, Math.min(1440, Number(reminderLeadMinutes) || 0)),
    pausedUntil: /^\d{4}-\d{2}-\d{2}$/.test(String(pausedUntil || '')) ? pausedUntil : null,
    modelVersion: Math.max(2, Number(modelVersion) || 2),
    orderIndex: Math.max(0, Number(orderIndex) || 0),
    enabled: enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createHabitDailyLog({
  definition,
  localDate = localDateKey(),
  completedValue = 0,
  source = HABIT_SOURCES.MANUAL,
  status = null,
  plannedTime = null,
  actualTime = null,
  note = null,
  quality = null,
  skipReason = null,
  originalPlannedTime = null,
  now = new Date().toISOString(),
} = {}) {
  if (!definition?.id) throw new Error('HABIT_DEFINITION_REQUIRED');
  const value = Math.max(0, Number(completedValue) || 0);
  const target = Math.max(1, Number(definition.target) || 1);
  const normalizedStatus = ['planned', 'completed', 'partial', 'minimum', 'skipped', 'missed']
    .includes(status)
    ? status
    : value >= target
      ? 'completed'
      : value > 0
        ? 'partial'
        : 'planned';
  const completed = normalizedStatus === 'completed' || (status == null && value >= target);
  return {
    id: habitDailyLogId(definition.id, localDate),
    userId: definition.userId,
    contestId: definition.contestId,
    habitDefinitionId: definition.id,
    habitId: definition.habitId,
    localDate,
    completedValue: value,
    plannedValue: target,
    actualValue: value,
    unit: definition.unit,
    plannedTime: /^\d{2}:\d{2}$/.test(String(plannedTime || definition.reminderTime || ''))
      ? (plannedTime || definition.reminderTime)
      : null,
    originalPlannedTime: /^\d{2}:\d{2}$/.test(String(originalPlannedTime || '')) ? originalPlannedTime : null,
    actualTime: /^\d{2}:\d{2}$/.test(String(actualTime || '')) ? actualTime : null,
    status: completed ? 'completed' : normalizedStatus,
    note: String(note || '').slice(0, 500) || null,
    quality: quality == null ? null : Math.max(1, Math.min(5, Number(quality) || 1)),
    skipReason: String(skipReason || '').slice(0, 160) || null,
    completed,
    completedAt: completed ? now : null,
    source: Object.values(HABIT_SOURCES).includes(source) ? source : HABIT_SOURCES.MANUAL,
    updatedAt: now,
    // Compatibilidade com o espelho wellbeing_logs atual.
    habit_id: definition.id,
    date: localDate,
    amount_done: value,
  };
}

export function mergeHabitLogs(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const localValue = Math.max(0, Number(local.completedValue ?? local.amount_done) || 0);
  const remoteValue = Math.max(0, Number(remote.completedValue ?? remote.amount_done) || 0);
  const newest = Date.parse(remote.updatedAt || remote.updated_at || 0)
    > Date.parse(local.updatedAt || local.updated_at || 0)
    ? remote
    : local;
  const completedValue = Math.max(localValue, remoteValue);
  return {
    ...newest,
    completedValue,
    amount_done: completedValue,
    completed: Boolean(local.completed || remote.completed),
    completedAt: local.completedAt || remote.completedAt || null,
  };
}

export function migrateLegacyWellbeing({ habits = [], logs = [], userId, contestId, now } = {}) {
  const definitions = [];
  const migratedLogs = [];
  const ignoredHabitIds = [];
  const definitionByLegacyId = new Map();
  const earliestLogDate = new Map();
  for (const log of logs) {
    if (!LEGACY_HABIT_MAP[log?.habit_id] || !/^\d{4}-\d{2}-\d{2}$/.test(String(log?.date || ''))) continue;
    const current = earliestLogDate.get(log.habit_id);
    if (!current || log.date < current) earliestLogDate.set(log.habit_id, log.date);
  }

  for (const legacy of habits) {
    const habitId = LEGACY_HABIT_MAP[legacy?.id];
    if (!habitId) {
      ignoredHabitIds.push(legacy?.id);
      continue;
    }
    const definition = createHabitDefinition({
      habitId,
      userId,
      contestId,
      target: Number(legacy.daily_target) || null,
      enabled: legacy.enabled !== false,
      orderIndex: definitions.length,
      now: earliestLogDate.has(legacy.id)
        ? `${earliestLogDate.get(legacy.id)}T12:00:00.000Z`
        : now,
    });
    definitions.push(definition);
    definitionByLegacyId.set(legacy.id, definition);
  }

  for (const legacy of logs) {
    const definition = definitionByLegacyId.get(legacy?.habit_id);
    const date = legacy?.date;
    if (!definition || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) continue;
    migratedLogs.push(createHabitDailyLog({
      definition,
      localDate: date,
      completedValue: Number(legacy.amount_done) || (legacy.completed ? definition.target : 0),
      source: HABIT_SOURCES.MIGRATION,
      now: legacy.updatedAt || legacy.updated_at || now,
    }));
  }

  return { definitions, logs: migratedLogs, ignoredHabitIds };
}

export function isHabitPlannedOn(definition, date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  const createdDate = String(definition?.createdAt || '').slice(0, 10);
  return definition?.enabled !== false
    && (!definition?.pausedUntil || date > definition.pausedUntil)
    && (!createdDate || date >= createdDate)
    && normalizeActiveDays(definition?.activeDays).includes(day);
}

export function dailyHabitStatus({
  definitions = [],
  logs = [],
  date = localDateKey(),
  minimumPercent = DEFAULT_MINIMUM_PERCENT,
} = {}) {
  const planned = definitions.filter((definition) => isHabitPlannedOn(definition, date));
  const byDefinition = new Map(logs
    .filter((log) => (log.localDate || log.date) === date)
    .map((log) => [log.habitDefinitionId || log.habit_id, log]));
  const completed = planned.filter((definition) => byDefinition.get(definition.id)?.completed);
  const studyPlanned = planned.filter((definition) => getHabitCatalogItem(definition.habitId)?.category === HABIT_CATEGORIES.STUDY);
  const studyCompleted = studyPlanned.filter((definition) => byDefinition.get(definition.id)?.completed);
  const percentage = planned.length ? Math.round((completed.length / planned.length) * 100) : 0;
  const academicMinimum = studyPlanned.length === 0 || studyCompleted.length >= 1;
  const minimumReached = planned.length > 0
    && percentage >= Math.max(1, Math.min(100, Number(minimumPercent) || DEFAULT_MINIMUM_PERCENT))
    && academicMinimum;
  return {
    date,
    planned: planned.length,
    completed: completed.length,
    percentage,
    academicMinimum,
    minimumReached,
    allCompleted: planned.length > 0 && completed.length === planned.length,
  };
}

function dateRange(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    dates.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function calculateHabitConsistency({
  definitions = [],
  logs = [],
  today = localDateKey(),
  minimumPercent = DEFAULT_MINIMUM_PERCENT,
} = {}) {
  const end = new Date(`${today}T12:00:00`);
  const weekStart = new Date(end);
  weekStart.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const monthStart = new Date(end);
  monthStart.setDate(end.getDate() - 29);
  const allDates = dateRange(localDateKey(monthStart), today);
  const states = allDates.map((date) => dailyHabitStatus({ definitions, logs, date, minimumPercent }));
  const plannedStates = states.filter((state) => state.planned > 0);
  const weeklyStates = states.filter((state) => state.date >= localDateKey(weekStart) && state.planned > 0);
  const metDates = new Set(plannedStates.filter((state) => state.minimumReached).map((state) => state.date));

  let currentStreak = 0;
  let bestStreak = 0;
  let running = 0;
  let comebackCount = 0;
  let sawMiss = false;
  let sawCompletedDay = false;
  for (const state of plannedStates) {
    if (state.minimumReached) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
      if (sawMiss && sawCompletedDay) {
        comebackCount += 1;
        sawMiss = false;
      }
      sawCompletedDay = true;
    } else {
      running = 0;
      if (sawCompletedDay) sawMiss = true;
    }
  }
  for (let index = plannedStates.length - 1; index >= 0; index -= 1) {
    if (!metDates.has(plannedStates[index].date)) break;
    currentStreak += 1;
  }
  const todayState = states.find((state) => state.date === today)
    || dailyHabitStatus({ definitions, logs, date: today, minimumPercent });
  return {
    streakCurrent: currentStreak,
    streakBest: bestStreak,
    weeklyConsistency: weeklyStates.length
      ? Math.round((weeklyStates.filter((state) => state.minimumReached).length / weeklyStates.length) * 100)
      : 0,
    thirtyDayConsistency: plannedStates.length
      ? Math.round((plannedStates.filter((state) => state.minimumReached).length / plannedStates.length) * 100)
      : 0,
    completedToday: todayState.completed,
    plannedToday: todayState.planned,
    comebackCount,
    today: todayState,
  };
}

export function applyConsistencyShield({
  previous = {},
  plannedDayCompleted,
  weekCompletedDays = 0,
  weekClosed = false,
} = {}) {
  const next = {
    streakCurrent: Math.max(0, Number(previous.streakCurrent) || 0),
    streakBest: Math.max(0, Number(previous.streakBest) || 0),
    shields: Math.min(MAX_CONSISTENCY_SHIELDS, Math.max(0, Number(previous.shields) || 0)),
    shieldWeeks: [...new Set(previous.shieldWeeks || [])],
  };
  let shieldUsed = false;
  if (plannedDayCompleted) {
    next.streakCurrent += 1;
    next.streakBest = Math.max(next.streakBest, next.streakCurrent);
  } else if (next.shields > 0) {
    next.shields -= 1;
    shieldUsed = true;
  } else {
    next.streakCurrent = 0;
  }
  if (weekClosed && Number(weekCompletedDays) >= 6) {
    next.shields = Math.min(MAX_CONSISTENCY_SHIELDS, next.shields + 1);
  }
  return { ...next, shieldUsed };
}

export function calculateDailyVigor({ status, comeback = false } = {}) {
  const percentage = Math.max(0, Math.min(100, Number(status?.percentage) || 0));
  const balance = status?.academicMinimum ? 0.15 : 0;
  const minimum = status?.minimumReached ? 0.25 : 0;
  const returnBonus = comeback ? 0.1 : 0;
  return Math.min(1, Number((percentage / 100 * 0.5 + balance + minimum + returnBonus).toFixed(2)));
}

export function applyAcademicAutomation({ definitions = [], logs = [], date = localDateKey(), signals = {}, now } = {}) {
  const allowed = new Map([
    ['daily_questions', Math.max(0, Number(signals.questionsCompleted) || 0)],
    ['review_errors', Math.max(0, Number(signals.reviewsCompleted) || 0)],
    ['finish_priority', signals.priorityCompleted ? 1 : 0],
  ]);
  const result = [...logs];
  for (const definition of definitions) {
    if (!allowed.has(definition.habitId) || !isHabitPlannedOn(definition, date)) continue;
    const value = allowed.get(definition.habitId);
    const index = result.findIndex((log) => log.id === habitDailyLogId(definition.id, date));
    const existing = index >= 0 ? result[index] : null;
    if (value <= Number(existing?.completedValue || existing?.amount_done || 0)) continue;
    const next = createHabitDailyLog({
      definition,
      localDate: date,
      completedValue: value,
      source: HABIT_SOURCES.ACADEMIC_AUTO,
      now,
    });
    if (index >= 0) result[index] = next;
    else result.push(next);
  }
  return result;
}

export function habitPrivacyStatement() {
  return 'O DETONA acompanha apenas os hábitos que você escolher. Estes registros não substituem orientação médica ou profissional.';
}
