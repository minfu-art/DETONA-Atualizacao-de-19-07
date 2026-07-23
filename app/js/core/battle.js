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
import { questionService } from '../services/questionService.js';
import { progressRepository } from '../repositories/progressRepository.js';

const finalizingBattleIds = new Set();
let battleIdSequence = 0;

function createBattleId() {
  if (globalThis.crypto?.randomUUID) return `bat_${globalThis.crypto.randomUUID()}`;
  battleIdSequence += 1;
  return `bat_${Date.now()}_${battleIdSequence}`;
}

function battleValidationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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
    if (player.last_study_date === yesterday) {
      if (player.streak_embers) {
        player.rescue_missions_pending = Math.max(0, (player.rescue_missions_pending || 1) - 1);
        if (player.rescue_missions_pending === 0) {
          player.streak_embers = false;
          player.streak_days = (player.streak_days || 0) + 1;
        }
      } else {
        player.streak_days = (player.streak_days || 0) + 1;
      }
    } else if (player.last_study_date && player.last_study_date < yesterday) {
      player.streak_embers = true;
      player.rescue_missions_pending = 1;
    } else if (!player.last_study_date) {
      player.streak_days = 1;
    }
    player.last_study_date = today;
  }
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
    const [players, allSubtopics] = await Promise.all([
      repository.getAll(STORES.player),
      repository.getAll(STORES.subtopics),
    ]);
    let player = players[0];
    const subtopic = allSubtopics.find((item) => item.id === validated.subtopicId);
    if (!player || !subtopic) throw new Error('Contexto de domínio não encontrado.');
    if (hasOfficialBattleAttempt(subtopic, validated.battleId)) {
      throw battleValidationError('BATTLE_ALREADY_FINALIZED', 'Esta batalha já foi finalizada.');
    }

    const finalizedAt = now();
    const attemptedAt = finalizedAt.toISOString();
    const previousBest = subtopicMastery(subtopic);
    const previousAttemptPercentage = subtopic.last_attempt_percentage;
    const previousStars = starsFromAccuracy(previousBest);
    const disciplineBefore = disciplineMastery(allSubtopics, subtopic.discipline_id);
    const globalBefore = globalMastery(allSubtopics);
    const reviewBefore = new Set(subtopic.review_question_ids || subtopic.questoesRevisao || []);
    const masteryResult = applyOfficialMasteryAttempt(subtopic, {
      battleId: validated.battleId,
      correct: session.correct,
      total,
      attemptedAt,
      questionIds: validated.questionIds,
      results: session.results,
    });
    if (!masteryResult.official) throw new Error('Simulado incompleto: o domínio não foi alterado.');
    if (masteryResult.duplicate) {
      throw battleValidationError('BATTLE_ALREADY_FINALIZED', 'Esta batalha já foi finalizada.');
    }

    const updatedSubtopic = masteryResult.subtopic;
    updatedSubtopic.memory_temperature = computeMemoryTemperature(updatedSubtopic.last_studied_at);
    updatedSubtopic.updated_at = attemptedAt;
    await repository.put(STORES.subtopics, updatedSubtopic);
    const queueAdded = await reviewRecorder(
      session,
      updatedSubtopic,
      previousAttemptPercentage,
      new Date(attemptedAt),
      repository,
    );
    const updatedSubtopics = allSubtopics.map((item) => item.id === updatedSubtopic.id ? updatedSubtopic : item);
    const disciplineAfter = disciplineMastery(updatedSubtopics, updatedSubtopic.discipline_id);
    const globalAfter = globalMastery(updatedSubtopics);
    const reviewAdded = Math.max(queueAdded, (updatedSubtopic.review_question_ids || []).filter((id) => !reviewBefore.has(id)).length);
    const stars = starsFromAccuracy(updatedSubtopic.best_accuracy);

    let newCard = null;
    if (stars === 5 && previousStars < 5) {
      const existing = await repository.getAll(STORES.mvpCards);
      if (!existing.find((card) => card.subtopic_id === updatedSubtopic.id)) {
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
    player.total_stars = updatedSubtopics.reduce((sum, item) => sum + (item.stars || 0), 0);

    const today = attemptedAt.slice(0, 10);
    const yesterdayDate = new Date(finalizedAt);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    applyStudyStreak(player, today, yesterday);

    const routines = await repository.getAll(STORES.routines);
    const routine = routines.find((item) => item.day_of_week === finalizedAt.getDay()) || {
      goal_type: 'questoes', goal_amount: 30, enabled: true,
    };
    let log = await repository.getById(STORES.dailyLogs, today);
    if (!log) {
      log = {
        date: today,
        planned_amount: routine.enabled === false ? 0 : (routine.goal_amount || 30),
        completed_amount: 0,
        status: 'pendente',
        xp_earned: 0,
        domain_challenges_completed: 0,
      };
    }
    if (log.planned_amount == null || log.planned_amount === 0) {
      log.planned_amount = routine.enabled === false ? 0 : (routine.goal_amount || 30);
    }
    log.completed_amount += routine.goal_type === 'batalhas' ? 1 : session.answered;
    if (log.planned_amount > 0 && log.completed_amount >= log.planned_amount) log.status = 'cumprido';
    else if (log.completed_amount > 0) log.status = 'parcial';
    log.domain_challenges_completed = (log.domain_challenges_completed || 0) + 1;
    log.updated_at = attemptedAt;
    player.updated_at = attemptedAt;
    await repository.put(STORES.dailyLogs, log);
    await repository.put(STORES.player, player);

    const ssot = await recalculate(repository, { updatedAt: attemptedAt });
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
      player: ssot.player || player,
    };
  } finally {
    finalizingBattleIds.delete(validated.battleId);
  }
}
