/**
 * DETONA CONCURSOS — Modelo de dados rígido (JSDoc)
 * SSOT: todo progresso deriva do store central IndexedDB.
 */

/**
 * @typedef {Object} AppUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} createdAt ISO date
 * @property {string} lastAccessAt ISO date
 * @property {string[]} enabledModules
 * @property {{theme:string, soundEnabled:boolean}} preferences
 */

/**
 * @typedef {Object} ContestEntitlement
 * @property {string} id userId:contestId
 * @property {string} userId
 * @property {string} contestId
 * @property {'active'|'revoked'|'expired'} status
 * @property {string} source
 * @property {string} grantedAt ISO date
 */

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {'male'|'female'} avatar_sprite
 * @property {number} level LV de domínio 0-100, piso de mastery_pct
 * @property {number} mastery_pct média precisa do domínio de todos os subtópicos
 * @property {number} xp_level nível econômico legado, separado do domínio
 * @property {number} xp
 * @property {number} xp_next_level
 * @property {string} exam_date ISO date
 * @property {number} streak_days
 * @property {number} best_streak maior sequência já alcançada
 * @property {number} edital_completion_pct SSOT 0-100
 * @property {string|null} last_study_date YYYY-MM-DD
 * @property {boolean} celebration_shown
 * @property {boolean} onboarded
 * @property {boolean} sound_enabled
 * @property {number} total_stars
 * @property {boolean} endgame_mode
 * @property {boolean} streak_embers true se streak esfriou (brasas)
 * @property {number} rescue_missions_pending
 */

/**
 * @typedef {Object} Discipline
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} biome
 * @property {number} total_subtopics
 * @property {number} completed_subtopics
 * @property {number} mastery_pct média precisa dos subtópicos da disciplina
 * @property {number} order
 */

/**
 * @typedef {'quente'|'morno'|'frio'|'congelado'} MemoryTemp
 */

/**
 * @typedef {Object} Subtopic
 * @property {string} id
 * @property {string} discipline_id
 * @property {string} name
 * @property {string} edital_numbering
 * @property {string} enemy_name
 * @property {string} enemy_sprite
 * @property {number} stars 0-5
 * @property {number} best_accuracy 0-100
 * @property {number} attempts_count
 * @property {number|null} best_correct_answers
 * @property {number|null} best_total_questions
 * @property {string|null} first_attempt_at
 * @property {string|null} last_attempt_at
 * @property {string|null} best_result_at
 * @property {string[]} best_attempt_question_ids
 * @property {Array<{attemptedAt:string,correct:number,total:number,percentage:number,questionIds:string[]}>} attempt_history
 * @property {number|null} last_attempt_percentage
 * @property {string[]} answered_question_ids
 * @property {string[]} incorrect_question_ids
 * @property {string[]} correct_question_ids
 * @property {string[]} review_question_ids
 * @property {Record<string,{attempts:number,correctCount:number,incorrectCount:number,lastAnsweredAt:string|null,lastCorrect:boolean}>} question_history
 * @property {string[]} mastery_migration_review
 * @property {string|null} last_studied_at ISO
 * @property {MemoryTemp} memory_temperature
 */

/**
 * @typedef {Object} Question
 * @property {string} id
 * @property {string} subtopic_id
 * @property {'multipla_escolha'|'certo_errado'} format
 * @property {string} statement
 * @property {string[]} options
 * @property {string|boolean} correct_answer
 * @property {string} explanation
 * @property {boolean} is_user_created
 * @property {string} created_at
 * @property {string} concursoId
 * @property {string} orgao
 * @property {string} instituicao
 * @property {string} cargo
 * @property {string} banca
 * @property {number|null} ano
 * @property {string} disciplina
 * @property {string} assunto
 * @property {string} topicoEditalId
 * @property {string} topicoEdital
 * @property {string} enunciado
 * @property {string[]} alternativas
 * @property {string|boolean|null} respostaCorreta
 * @property {string} explicacao
 * @property {string} porqueCorreta
 * @property {string} porqueAlternativaA
 * @property {string} porqueAlternativaB
 * @property {string} porqueAlternativaC
 * @property {string} porqueAlternativaD
 * @property {string} porqueAlternativaE
 * @property {string} pegadinhaDaBanca
 * @property {string} dicaDeMemorizacao
 * @property {string} resumo
 * @property {string[]} referencias
 * @property {string} dificuldade
 * @property {'ativa'|'revisao'|'arquivada'} situacao
 * @property {string} fonte
 * @property {string[]} tags
 * @property {number} version
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {Object} ReviewQueueItem
 * @property {string} questionId chave única por concurso
 * @property {string} contestId
 * @property {string} subtopicId
 * @property {string} disciplineId
 * @property {string|null} firstErrorAt
 * @property {string|null} lastErrorAt
 * @property {string|null} lastReviewedAt
 * @property {string} nextReviewAt
 * @property {number} errorCount
 * @property {number} correctAfterErrorCount
 * @property {number} consecutiveCorrect
 * @property {number} consecutiveErrors
 * @property {'incorrect'|'correct'|'low_confidence'|'domain_drop'} lastResult
 * @property {'quente'|'morna'|'fria'|'congelada'} memoryState
 * @property {number} priorityScore
 * @property {number} difficulty
 * @property {string} source
 * @property {'pending'|'scheduled'|'frozen'} status
 * @property {Array<{at:string,result:string,reason:string}>} reviewHistory
 */

/**
 * @typedef {Object} VerticalizedItem
 * @property {string} id
 * @property {string} subtopic_id
 * @property {string} edital_numbering
 * @property {string} title
 * @property {'nao_iniciado'|'estudando'|'concluido'} theory_status
 * @property {number} review_count
 * @property {string|null} last_review_date
 * @property {boolean} questions_done auto-sync attempts_count > 0
 * @property {number} accuracy auto-sync best_accuracy
 */

/**
 * @typedef {Object} StudyRoutine
 * @property {number} day_of_week 0-6
 * @property {boolean} enabled
 * @property {'questoes'|'batalhas'|'tempo'} goal_type
 * @property {number} goal_amount
 * @property {string} focus_discipline_id | "auto"
 * @property {string} [start_time] HH:mm
 * @property {string} [end_time] HH:mm
 */

/**
 * @typedef {Object} DailyLog
 * @property {string} date YYYY-MM-DD
 * @property {number} planned_amount
 * @property {number} completed_amount
 * @property {'pendente'|'cumprido'|'parcial'|'perdido'} status
 * @property {number} xp_earned
 * @property {number} [domain_challenges_completed]
 */

/**
 * @typedef {Object} WellbeingHabit
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} unit
 * @property {number} daily_target
 * @property {'agua'|'sono'|'alimentacao'|'exercicio'|'meditacao'|'outro'} category
 * @property {boolean} enabled
 * @property {'count'|'toggle'|'hours'} input_type
 */

/**
 * @typedef {Object} WellbeingLog
 * @property {string} id habit_id|date
 * @property {string} habit_id
 * @property {string} date YYYY-MM-DD
 * @property {number} amount_done
 * @property {boolean} completed
 */

/**
 * @typedef {Object} MVPCard
 * @property {string} id
 * @property {string} subtopic_id
 * @property {string} enemy_name
 * @property {string} date_earned
 * @property {'Comum'|'Rara'|'Épica'|'MVP'} rarity
 */

export const STORES = {
  player: 'player',
  disciplines: 'disciplines',
  subtopics: 'subtopics',
  questions: 'questions',
  verticalized: 'verticalized',
  routines: 'routines',
  dailyLogs: 'dailyLogs',
  mvpCards: 'mvpCards',
  wellbeingHabits: 'wellbeingHabits',
  wellbeingLogs: 'wellbeingLogs',
  reviewQueue: 'reviewQueue',
  meta: 'meta',
  // Rotina Inteligente V2
  routineProfiles: 'routineProfiles',
  routineBlocks: 'routineBlocks',
  studySessions: 'studySessions',
  routineDailyStates: 'routineDailyStates',
  routineWeeklyReviews: 'routineWeeklyReviews',
  routineAchievements: 'routineAchievements',
  routineDistractions: 'routineDistractions',
  routineReminderSettings: 'routineReminderSettings',
};

export const DB_NAME = 'DetonaConcursosDB';
/** v4: stores da Rotina Inteligente V2 (não destrutivo) */
export const DB_VERSION = 4;
