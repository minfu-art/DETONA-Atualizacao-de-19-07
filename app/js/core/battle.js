import { STORES } from './types.js';
import { starsFromAccuracy, rarityFromStars } from './progression.js';
import { computeMemoryTemperature } from './memory.js';
import { recalculateEditalSSOT, MIN_QUESTIONS_BATTLE, getQuestionCounts } from './ssot.js';
import { isQuestionEligible } from './questionSchema.js';
import {
  applyOfficialMasteryAttempt, disciplineMastery, globalMastery,
  hasOfficialBattleAttempt, levelFromMastery, subtopicMastery,
} from './mastery.js';
import {
  CHALLENGE_QUESTION_COUNT, selectIntelligentQuestions, selectionHistoryFromSubtopic,
} from './questionSelection.js';
import { recordBattleReviewEvents } from '../services/reviewService.js';
import {
  battleXpBreakdown,
  grantBattleXp,
  recordBattleActivity,
} from '../services/academicProgressService.js';
import { questionService } from '../services/questionService.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { applyDailyGoalActivity } from '../services/dailyGoalService.js';
import { applyValidStudyDay } from '../services/studyStreakService.js';
import { refreshEmblems } from '../services/emblemService.js';
import { localDateKey } from './localDate.js';

const finalizingBattleIds = new Set();
let battleIdSequence = 0;
const BATTLE_FINALIZATION_STEPS = Object.freeze([
  'mastery',
  'review',
  'card',
  'dailyLog',
  'player',
  'xp',
  'activity',
  'emblems',
  'ssot',
]);

const MAX_ACTIVE_QUESTION_GAP_SECONDS = 10 * 60;

function createBattleId() {
  if (globalThis.crypto?.randomUUID) return `bat_${globalThis.crypto.randomUUID()}`;
  battleIdSequence += 1;
  return `bat_${Date.now()}_${battleIdSequence}`;
}

export function trackBattleActivity(session, at = new Date()) {
  if (!session || typeof session !== 'object') return 0;
  const current = at instanceof Date ? at : new Date(at);
  const currentMs = current.getTime();
  const previousMs = Date.parse(session.lastActiveAt || session.startedAt || '');
  if (Number.isFinite(currentMs) && Number.isFinite(previousMs) && currentMs >= previousMs) {
    const elapsed = Math.min(
      MAX_ACTIVE_QUESTION_GAP_SECONDS,
      Math.max(0, Math.round((currentMs - previousMs) / 1000)),
    );
    session.activeSeconds = Math.max(0, Number(session.activeSeconds) || 0) + elapsed;
  }
  if (Number.isFinite(currentMs)) session.lastActiveAt = current.toISOString();
  return Math.max(0, Number(session.activeSeconds) || 0);
}

function battleValidationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function battleJournalKey(battleId) {
  return `battle_finalization:${battleId}`;
}

function normalizeBattleJournal(value, { battleId, subtopicId, startedAt }) {
  const source = value && typeof value === 'object' ? value : {};
  const steps = Object.fromEntries(BATTLE_FINALIZATION_STEPS.map((step) => [
    step,
    source.steps?.[step] === true,
  ]));
  return {
    key: battleJournalKey(battleId),
    battleId,
    subtopicId,
    status: source.status === 'completed' ? 'completed' : 'processing',
    steps,
    started_at: source.started_at || startedAt,
    updated_at: source.updated_at || startedAt,
    completed_at: source.completed_at || null,
  };
}

async function persistBattleJournal(repository, journal, now, {
  completed = false,
  step = null,
} = {}) {
  if (step) journal.steps[step] = true;
  journal.updated_at = now().toISOString();
  if (completed) {
    journal.status = 'completed';
    journal.completed_at = journal.updated_at;
  }
  await repository.put(STORES.meta, structuredClone(journal));
}

function findBattleAttempt(subtopic, battleId) {
  const histories = [
    subtopic?.attempt_history,
    subtopic?.historicoTentativas,
    subtopic?.historico,
  ];
  for (const history of histories) {
    if (!Array.isArray(history)) continue;
    const index = history.findIndex((entry) => String(entry?.battleId || '') === battleId);
    if (index >= 0) return { entry: history[index], history, index };
  }
  return null;
}

export function validateOfficialBattleSession(session) {
  if (!session || typeof session !== 'object') {
    throw battleValidationError('BATTLE_SESSION_REQUIRED', 'A sessão da batalha é obrigatória.');
  }
  const battleId = typeof session.id === 'string' ? session.id.trim() : '';
  if (!battleId) {
    throw battleValidationError('BATTLE_ID_REQUIRED', 'A batalha precisa de um identificador válido.');
  }
  if (session.finished !== true) {
    throw battleValidationError('BATTLE_NOT_FINISHED', 'A batalha ainda não foi concluída.');
  }
  if (!Array.isArray(session.questions) || session.questions.length !== CHALLENGE_QUESTION_COUNT) {
    throw battleValidationError('BATTLE_QUESTIONS_INVALID', 'A batalha oficial precisa conter exatamente 10 questões.');
  }
  if (!Number.isInteger(session.answered) || session.answered !== CHALLENGE_QUESTION_COUNT) {
    throw battleValidationError('BATTLE_ANSWERS_INVALID', 'A batalha oficial precisa ter exatamente 10 respostas.');
  }
  if (!Array.isArray(session.results) || session.results.length !== CHALLENGE_QUESTION_COUNT) {
    throw battleValidationError('BATTLE_RESULTS_INVALID', 'A batalha oficial precisa ter exatamente 10 resultados.');
  }
  const subtopicId = String(session.subtopic_id || '').trim();
  if (!subtopicId) {
    throw battleValidationError('BATTLE_SUBTOPIC_REQUIRED', 'A batalha precisa estar vinculada a um subtópico.');
  }
  const questionIds = session.questions.map((question) => String(question?.id || '').trim());
  if (questionIds.some((id) => !id) || new Set(questionIds).size !== CHALLENGE_QUESTION_COUNT) {
    throw battleValidationError('BATTLE_DUPLICATE_QUESTION', 'A batalha oficial precisa ter 10 questões únicas.');
  }
  if (session.questions.some((question) => (
    String(question?.subtopic_id || question?.topicoEditalId || '').trim() !== subtopicId
  ))) {
    throw battleValidationError('BATTLE_MIXED_SUBTOPICS', 'Todas as questões devem pertencer ao subtópico da batalha.');
  }
  const allowedQuestionIds = new Set(questionIds);
  const resultQuestionIds = session.results.map((result) => String(result?.questionId || '').trim());
  if (resultQuestionIds.some((id) => !allowedQuestionIds.has(id))) {
    throw battleValidationError('BATTLE_EXTERNAL_RESULT', 'Existe resultado de uma questão que não pertence à batalha.');
  }
  if (new Set(resultQuestionIds).size !== CHALLENGE_QUESTION_COUNT) {
    throw battleValidationError('BATTLE_DUPLICATE_RESULT', 'Existe resultado duplicado para a mesma questão.');
  }
  if (session.results.some((result) => typeof result?.correct !== 'boolean')) {
    throw battleValidationError('BATTLE_RESULT_INVALID', 'Todos os resultados precisam informar se a resposta está correta.');
  }
  if (!Number.isInteger(session.correct) || session.correct < 0 || session.correct > CHALLENGE_QUESTION_COUNT) {
    throw battleValidationError('BATTLE_CORRECT_INVALID', 'A quantidade de acertos da batalha é inválida.');
  }
  const actualCorrect = session.results.filter((result) => result.correct === true).length;
  if (session.correct !== actualCorrect) {
    throw battleValidationError('BATTLE_CORRECT_MISMATCH', 'A quantidade de acertos não corresponde aos resultados.');
  }
  return {
    battleId,
    subtopicId,
    questionIds,
    correctIds: session.results.filter((result) => result.correct).map((result) => String(result.questionId)),
    incorrectIds: session.results.filter((result) => !result.correct).map((result) => String(result.questionId)),
  };
}

/** Pool de batalha: nunca usa questões DEMO (mesmo se restarem no store legado). */
async function loadBattlePool(subtopicId) {
  const sid = String(subtopicId || '');
  const matchSub = (q) => {
    const a = String(q.subtopic_id || '');
    const b = String(q.topicoEditalId || '');
    return a === sid || b === sid;
  };
  const imported = (await questionService.listar({ subtopicId: sid, mode: 'json' }))
    .filter(isQuestionEligible)
    .filter(matchSub);
  if (imported.length >= CHALLENGE_QUESTION_COUNT) return imported;
  // fallback híbrido + varredura por topicoEditalId
  const hybrid = (await questionService.listar({ subtopicId: sid }))
    .filter(isQuestionEligible)
    .filter(matchSub);
  if (hybrid.length >= CHALLENGE_QUESTION_COUNT) return hybrid;
  // último recurso: lista geral e filtra (cobre caches/aliases)
  return (await questionService.listar({ mode: 'json' }))
    .filter(isQuestionEligible)
    .filter(matchSub);
}

function prioritizeUnseenDetonaQuestion(selected, pool, history = {}) {
  const featured = pool.find((question) => /DETONA INÉDITA/i.test(`${question.fonte || ''} ${question.metadata?.colecao || ''}`)
    && !(Number(history?.[question.id]?.attempts) > 0));
  if (!featured || selected.some((question) => question.id === featured.id && selected[0]?.id === featured.id)) return selected;
  return [featured, ...selected.filter((question) => question.id !== featured.id)].slice(0, CHALLENGE_QUESTION_COUNT);
}

export function applyStudyStreak(player, today, yesterday) {
  if (player.last_study_date !== today) {
    player.streak_days = player.last_study_date === yesterday
      ? Math.max(0, Number(player.streak_days) || 0) + 1
      : 1;
    player.last_study_date = today;
    player.streak_embers = false;
    player.rescue_missions_pending = 0;
  }
  player.best_streak = Math.max(Number(player.best_streak) || 0, Number(player.streak_days) || 0);
  return player;
}

export async function canStartBattle(subtopicId) {
  const questions = await questionService.listar({ subtopicId });
  return questions.filter(isQuestionEligible).length >= MIN_QUESTIONS_BATTLE;
}

export async function createBattleSession(subtopicId, opts = {}) {
  let subtopic = opts.daily ? null : await progressRepository.getById(STORES.subtopics, subtopicId);
  if (!subtopic && !opts.daily) throw new Error('Subtópico não encontrado');

  let questions = [];
  if (opts.daily) {
    const daily = await pickDailyQuestions(opts.endgame);
    subtopic = daily.subtopic;
    subtopicId = subtopic?.id;
    questions = daily.questions;
  } else {
    const pool = await loadBattlePool(subtopicId);
    if (pool.length < CHALLENGE_QUESTION_COUNT) {
      throw new Error(`Este subtópico precisa de ${CHALLENGE_QUESTION_COUNT} questões disponíveis; hoje possui ${pool.length}.`);
    }
    const history = selectionHistoryFromSubtopic(subtopic);
    questions = selectIntelligentQuestions(pool, history, CHALLENGE_QUESTION_COUNT, new Date(), subtopic.id);
    questions = prioritizeUnseenDetonaQuestion(questions, pool, history);
  }

  if (!subtopic || questions.length !== CHALLENGE_QUESTION_COUNT) {
    throw new Error(`O desafio precisa de exatamente ${CHALLENGE_QUESTION_COUNT} questões válidas do mesmo subtópico.`);
  }

  const startedAt = new Date().toISOString();
  return {
    id: createBattleId(),
    subtopic_id: subtopicId,
    subtopic,
    mode: opts.daily ? 'daily' : 'subtopic',
    questions,
    index: 0,
    correct: 0,
    answered: 0,
    combo: 0,
    maxCombo: 0,
    monsterHp: 100,
    playerHp: 100,
    finished: false,
    results: [],
    startedAt,
    lastActiveAt: startedAt,
    activeSeconds: 0,
  };
}

async function pickDailyQuestions(endgame = false) {
  const subtopics = await progressRepository.getAll(STORES.subtopics);
  const counts = await getQuestionCounts();
  const armed = subtopics.filter((subtopic) => (counts[subtopic.id] || 0) >= CHALLENGE_QUESTION_COUNT);
  const score = (subtopic) => {
    let value = 0;
    if (subtopic.memory_temperature === 'congelado') value += 100;
    else if (subtopic.memory_temperature === 'frio') value += 80;
    else if (subtopic.memory_temperature === 'morno') value += 40;
    value += (5 - (subtopic.stars || 0)) * 10;
    if (endgame && subtopic.memory_temperature !== 'quente') value += 50;
    return value;
  };

  for (const subtopic of [...armed].sort((a, b) => score(b) - score(a))) {
    const pool = await loadBattlePool(subtopic.id);
    const history = selectionHistoryFromSubtopic(subtopic);
    let selected = selectIntelligentQuestions(pool, history, CHALLENGE_QUESTION_COUNT, new Date(), subtopic.id);
    selected = prioritizeUnseenDetonaQuestion(selected, pool, history);
    if (selected.length === CHALLENGE_QUESTION_COUNT) return { subtopic, questions: selected };
  }
  return { subtopic: null, questions: [] };
}

export function answerQuestion(session, userAnswer, options = {}) {
  const question = session.questions[session.index];
  if (!question || session.finished) return null;
  trackBattleActivity(session, options.now || new Date());

  let correct = false;
  if (question.format === 'certo_errado') {
    const answer = userAnswer === true || userAnswer === 'true' || userAnswer === 'Certo' || userAnswer === 'C';
    const expected = question.correct_answer === true || question.correct_answer === 'true' || question.correct_answer === 'Certo';
    correct = answer === expected;
  } else {
    correct = String(userAnswer) === String(question.correct_answer);
  }

  session.answered += 1;
  let critical = false;
  if (correct) {
    session.correct += 1;
    session.combo += 1;
    session.maxCombo = Math.max(session.maxCombo, session.combo);
    session.monsterHp = Math.max(0, session.monsterHp - 10);
    critical = session.combo === CHALLENGE_QUESTION_COUNT;
  } else {
    session.combo = 0;
    session.playerHp = Math.max(0, session.playerHp - 8);
  }

  session.results.push({ questionId: question.id, correct, userAnswer, confidence: options.confidence || 'normal' });
  const isLast = session.index >= session.questions.length - 1;
  if (isLast) session.finished = true;
  else session.index += 1;

  return {
    correct,
    explanation: question.explanation,
    question,
    statement: question.statement,
    monsterHp: session.monsterHp,
    playerHp: session.playerHp,
    combo: session.combo,
    critical,
    addedToReview: !correct,
    isLast: session.finished,
    emote: correct ? (Math.random() > 0.5 ? '/gg' : '/no1') : (Math.random() > 0.5 ? '/omg' : '/gasp'),
  };
}

export async function finalizeBattle(session, {
  repository = progressRepository,
  reviewRecorder = recordBattleReviewEvents,
  recalculate = recalculateEditalSSOT,
  now = () => new Date(),
} = {}) {
  const validated = validateOfficialBattleSession(session);
  if (finalizingBattleIds.has(validated.battleId)) {
    throw battleValidationError('BATTLE_FINALIZATION_IN_PROGRESS', 'Esta batalha já está sendo finalizada.');
  }
  finalizingBattleIds.add(validated.battleId);

  try {
    const total = CHALLENGE_QUESTION_COUNT;
    const newResult = (session.correct / total) * 100;
    const journalKey = battleJournalKey(validated.battleId);
    const startedAt = now().toISOString();
    const storedJournal = await repository.getById(STORES.meta, journalKey);
    const journal = normalizeBattleJournal(storedJournal, {
      battleId: validated.battleId,
      subtopicId: validated.subtopicId,
      startedAt,
    });
    if (journal.status === 'completed') {
      throw battleValidationError('BATTLE_ALREADY_FINALIZED', 'Esta batalha já foi finalizada.');
    }
    if (!storedJournal) await repository.put(STORES.meta, structuredClone(journal));

    const [players, allSubtopics] = await Promise.all([
      repository.getAll(STORES.player),
      repository.getAll(STORES.subtopics),
    ]);
    let player = players[0];
    let subtopic = allSubtopics.find((item) => item.id === validated.subtopicId);
    if (!player || !subtopic) throw new Error('Contexto de domínio não encontrado.');

    const finalizedAt = new Date(journal.started_at);
    const attemptedAt = finalizedAt.toISOString();
    const previousBest = subtopicMastery(subtopic);
    let previousAttemptPercentage = subtopic.last_attempt_percentage;
    const disciplineBefore = disciplineMastery(allSubtopics, subtopic.discipline_id);
    const globalBefore = globalMastery(allSubtopics);
    const reviewBefore = new Set(subtopic.review_question_ids || subtopic.questoesRevisao || []);
    let masteryResult = {
      subtopic,
      official: true,
      improved: false,
      mastery: subtopicMastery(subtopic),
      duplicate: hasOfficialBattleAttempt(subtopic, validated.battleId),
    };
    let storedAttempt = findBattleAttempt(subtopic, validated.battleId);
    let masteryAppliedNow = false;

    if (!journal.steps.mastery && storedAttempt) {
      journal.steps.mastery = true;
      await persistBattleJournal(repository, journal, now, { step: 'mastery' });
    } else if (!journal.steps.mastery) {
      masteryResult = applyOfficialMasteryAttempt(subtopic, {
        battleId: validated.battleId,
        correct: session.correct,
        total,
        attemptedAt,
        questionIds: validated.questionIds,
        results: session.results,
      });
      if (!masteryResult.official) throw new Error('Simulado incompleto: o domínio não foi alterado.');
      const masteredSubtopic = masteryResult.subtopic;
      masteredSubtopic.memory_temperature = computeMemoryTemperature(masteredSubtopic.last_studied_at);
      masteredSubtopic.updated_at = attemptedAt;
      await repository.put(STORES.subtopics, masteredSubtopic);
      await persistBattleJournal(repository, journal, now, { step: 'mastery' });
      subtopic = masteredSubtopic;
      storedAttempt = findBattleAttempt(subtopic, validated.battleId);
      masteryAppliedNow = true;
    } else if (!storedAttempt) {
      throw new Error('BATTLE_MASTERY_STATE_MISSING');
    }

    const updatedSubtopic = subtopic;
    if (!masteryAppliedNow) {
      if (storedAttempt?.index > 0) {
        previousAttemptPercentage = storedAttempt.history[storedAttempt.index - 1]?.percentage ?? null;
      } else if (storedAttempt) {
        previousAttemptPercentage = null;
      }
    }
    let queueAdded = 0;
    if (!journal.steps.review) {
      queueAdded = await reviewRecorder(
        session,
        updatedSubtopic,
        previousAttemptPercentage,
        new Date(attemptedAt),
        repository,
      );
      await persistBattleJournal(repository, journal, now, { step: 'review' });
    }

    const updatedSubtopics = allSubtopics.map((item) => item.id === updatedSubtopic.id ? updatedSubtopic : item);
    const disciplineAfter = disciplineMastery(updatedSubtopics, updatedSubtopic.discipline_id);
    const globalAfter = globalMastery(updatedSubtopics);
    const reviewAdded = Math.max(queueAdded, (updatedSubtopic.review_question_ids || []).filter((id) => !reviewBefore.has(id)).length);
    const stars = starsFromAccuracy(updatedSubtopic.best_accuracy);

    let newCard = null;
    if (!journal.steps.card && stars === 5 && updatedSubtopic.best_result_at === storedAttempt?.entry?.attemptedAt) {
      const existing = await repository.getAll(STORES.mvpCards);
      newCard = existing.find((card) => card.subtopic_id === updatedSubtopic.id) || null;
      if (!newCard) {
        newCard = {
          id: `card_${updatedSubtopic.id}`,
          subtopic_id: updatedSubtopic.id,
          enemy_name: updatedSubtopic.enemy_name,
          date_earned: attemptedAt,
          rarity: rarityFromStars(5),
          updated_at: attemptedAt,
        };
        await repository.put(STORES.mvpCards, newCard);
      }
    }
    if (!journal.steps.card) {
      await persistBattleJournal(repository, journal, now, { step: 'card' });
    }

    const today = localDateKey(finalizedAt);
    let dailyGoalResult = null;
    if (!journal.steps.dailyLog) {
      dailyGoalResult = await applyDailyGoalActivity({
        eventId: `battle:${validated.battleId}`,
        type: 'battle',
        questionCount: session.answered,
        battleCount: 1,
        activeMinutes: Math.floor(Math.max(0, Number(session.activeSeconds) || 0) / 60),
        occurredAt: finalizedAt,
      }, { repository });
      await persistBattleJournal(repository, journal, now, { step: 'dailyLog' });
    } else {
      const log = await repository.getById(STORES.dailyLogs, today);
      dailyGoalResult = { log, completedNow: false, bonus: { granted: false } };
    }

    if (!journal.steps.player) {
      player = (await repository.getAll(STORES.player))[0];
      const latestSubtopics = await repository.getAll(STORES.subtopics);
      player.total_stars = latestSubtopics.reduce((sum, item) => sum + (item.stars || 0), 0);
      player.updated_at = attemptedAt;
      await repository.put(STORES.player, player);
      const streakResult = await applyValidStudyDay({
        eventId: `battle:${validated.battleId}`,
        occurredAt: finalizedAt,
        valid: session.answered > 0,
        source: 'official_battle',
      }, { repository });
      player = streakResult.player || player;
      await persistBattleJournal(repository, journal, now, { step: 'player' });
    }

    const latestLog = await repository.getById(STORES.dailyLogs, today);
    const xpBreakdown = battleXpBreakdown({
      correct: session.correct,
      maxCombo: session.maxCombo,
      dailyGoalCompleted: false,
    });
    if (!journal.steps.xp) {
      const xpResult = await grantBattleXp({
        battleId: validated.battleId,
        correct: session.correct,
        maxCombo: session.maxCombo,
        dailyGoalCompleted: false,
        occurredAt: attemptedAt,
      }, { repository });
      player = xpResult.player || player;
      if (latestLog && !(latestLog.processed_xp_event_ids || []).includes(`battle:${validated.battleId}`)) {
        latestLog.xp_earned = (Number(latestLog.xp_earned) || 0) + xpBreakdown.total;
        latestLog.processed_xp_event_ids = [
          ...new Set([...(latestLog.processed_xp_event_ids || []), `battle:${validated.battleId}`]),
        ];
        latestLog.updated_at = attemptedAt;
        await repository.put(STORES.dailyLogs, latestLog);
      }
      await persistBattleJournal(repository, journal, now, { step: 'xp' });
    }

    let activity = null;
    if (!journal.steps.activity) {
      activity = await recordBattleActivity({
        battleId: validated.battleId,
        disciplineId: updatedSubtopic.discipline_id,
        subtopicId: updatedSubtopic.id,
        startedAt: session.startedAt || journal.started_at,
        finishedAt: attemptedAt,
        activeSeconds: session.activeSeconds,
      }, { repository });
      await persistBattleJournal(repository, journal, now, { step: 'activity' });
    } else {
      activity = await repository.getById(STORES.studySessions, `academic_battle:${validated.battleId}`);
    }

    let newInsignias = [];
    if (!journal.steps.emblems) {
      const emblemResult = await refreshEmblems({ repository });
      newInsignias = emblemResult.unlocked || [];
      await persistBattleJournal(repository, journal, now, { step: 'emblems' });
    }

    let ssot = { player };
    if (!journal.steps.ssot) {
      ssot = await recalculate(repository, { updatedAt: attemptedAt });
      await persistBattleJournal(repository, journal, now, { step: 'ssot', completed: true });
    } else if (journal.status !== 'completed') {
      await persistBattleJournal(repository, journal, now, { completed: true });
    }

    return {
      accuracy: newResult,
      newResult,
      previousBest,
      mastery: subtopicMastery(updatedSubtopic),
      improved: masteryResult.improved,
      stars,
      resultStars: starsFromAccuracy(newResult),
      correct: session.correct,
      total,
      maxCombo: session.maxCombo,
      disciplineBefore,
      disciplineAfter,
      disciplineImpact: disciplineAfter - disciplineBefore,
      levelBefore: levelFromMastery(globalBefore),
      levelAfter: levelFromMastery(globalAfter),
      levelImpact: levelFromMastery(globalAfter) - levelFromMastery(globalBefore),
      attempts: updatedSubtopic.attempts_count,
      reviewAdded,
      newCard,
      xpEarned: xpBreakdown.total,
      xpBreakdown,
      dailyGoal: dailyGoalResult,
      newInsignias,
      activity,
      activityMinutes: Math.round((Number(activity?.durationSeconds) || 0) / 60),
      player: ssot.player || player,
    };
  } finally {
    finalizingBattleIds.delete(validated.battleId);
  }
}
