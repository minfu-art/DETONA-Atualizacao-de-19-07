import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  allowedRankedAnswers,
  createRankedClock,
  normalizeRankedAnswers,
  rankedDeadline,
  rankedEventVersion,
  rankedResultInvariant,
  validateRankedEvent,
  validateRankedSession,
} from '../app/js/core/rankedSimulation.js';
import {
  createRankedEventHandler,
  normalizeRankedSubmissionAnswers,
  publicQuestion,
  rankAttempts,
  scoreRankedAnswers,
} from '../supabase/functions/ranked-events/core.js';
import { resetAcademicSessionContext } from '../app/js/auth/academicSessionContext.js';

const uiSource = readFileSync(new URL('../app/js/ui/rankedEvent.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app/js/app.js', import.meta.url), 'utf8');
const edgeSource = readFileSync(new URL('../supabase/functions/ranked-events/index.ts', import.meta.url), 'utf8');

function event(overrides = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    contest_id: 'pp_pe_2027',
    title: 'Simulado seguro',
    description: 'Evento canônico para testes.',
    registration_starts_at: '2026-07-29T08:00:00.000Z',
    registration_ends_at: '2026-07-29T09:59:00.000Z',
    starts_at: '2026-07-29T10:00:00.000Z',
    ends_at: '2026-07-29T12:00:00.000Z',
    duration_minutes: 60,
    question_count: 2,
    scoring_mode: 'cebraspe',
    ranking_release_mode: 'after_event',
    status: 'scheduled',
    published_at: '2026-07-29T07:00:00.000Z',
    ...overrides,
  };
}

function questions(overrides = {}) {
  return [
    { id: 'q1', question_id: 'q1', contest_id: 'pp_pe_2027', order_index: 0, payload: { enunciado: 'Q1', correct_answer: 'C' }, ...overrides },
    { id: 'q2', question_id: 'q2', contest_id: 'pp_pe_2027', order_index: 1, payload: { enunciado: 'Q2', correct_answer: 'E' } },
  ];
}

function session(overrides = {}) {
  const currentEvent = event();
  const currentQuestions = questions().map(({ question_id: _questionId, ...question }) => question);
  return {
    id: 'attempt-1',
    eventId: currentEvent.id,
    eventVersion: rankedEventVersion(currentEvent),
    userId: 'user-a',
    contestId: currentEvent.contest_id,
    scopeKey: `user-a:${currentEvent.contest_id}`,
    questionIds: ['q1', 'q2'],
    questions: currentQuestions,
    answers: {},
    currentIndex: 0,
    status: 'started',
    startedAt: currentEvent.starts_at,
    deadlineAt: '2026-07-29T11:00:00.000Z',
    serverNow: currentEvent.starts_at,
    ...overrides,
  };
}

function eventContext(overrides = {}) {
  return { event: event(), userId: 'user-a', contestId: 'pp_pe_2027', scopeKey: 'user-a:pp_pe_2027', ...overrides };
}

function request(body) {
  return new Request('https://local/ranked-events', {
    method: 'POST',
    headers: { authorization: 'Bearer safe-test-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('contrato canônico aceita evento válido e deriva versão publicada', () => {
  const result = validateRankedEvent(event(), { contestId: 'pp_pe_2027', questions: questions() });
  assert.equal(result.valid, true);
  assert.equal(rankedEventVersion(event()), '2026-07-29T07:00:00.000Z');
});

test('contrato do evento rejeita identidade, concurso, datas, duração, status e modos inválidos', () => {
  assert.ok(validateRankedEvent(event({ id: '' })).errors.includes('EVENT_ID_REQUIRED'));
  assert.ok(validateRankedEvent(event({ contest_id: '' })).errors.includes('EVENT_CONTEST_REQUIRED'));
  assert.ok(validateRankedEvent(event({ starts_at: 'inválida' })).errors.includes('EVENT_DATES_INVALID'));
  assert.ok(validateRankedEvent(event({ starts_at: '2026-07-29T13:00:00Z' })).errors.includes('EVENT_PERIOD_INVALID'));
  assert.ok(validateRankedEvent(event({ duration_minutes: 0 })).errors.includes('EVENT_DURATION_INVALID'));
  assert.ok(validateRankedEvent(event({ status: 'open' })).errors.includes('EVENT_STATUS_INVALID'));
  assert.ok(validateRankedEvent(event({ scoring_mode: 'bonus' })).errors.includes('EVENT_SCORING_MODE_INVALID'));
  assert.ok(validateRankedEvent(event({ ranking_release_mode: 'estimated' })).errors.includes('EVENT_RANKING_MODE_INVALID'));
  assert.ok(validateRankedEvent(event({ registration_ends_at: '2026-07-29T10:30:00Z' })).errors.includes('EVENT_REGISTRATION_PERIOD_INVALID'));
  assert.ok(validateRankedEvent(event({ published_at: null })).errors.includes('EVENT_PUBLISHED_AT_REQUIRED'));
});

test('contrato do evento rejeita quantidade, duplicação, inelegibilidade e questão de outro concurso', () => {
  assert.ok(validateRankedEvent(event(), { questions: [questions()[0]] }).errors.includes('EVENT_QUESTION_COUNT_MISMATCH'));
  assert.ok(validateRankedEvent(event(), { questions: [questions()[0], questions()[0]] }).errors.includes('EVENT_QUESTIONS_DUPLICATED'));
  assert.ok(validateRankedEvent(event(), { questions: questions(), isQuestionEligible: ({ id }) => id !== 'q2' }).errors.includes('EVENT_QUESTION_INELIGIBLE'));
  assert.ok(validateRankedEvent(event(), { questions: questions({ contest_id: 'outro' }) }).errors.includes('EVENT_QUESTION_CONTEST_MISMATCH'));
});

test('prazo usa o menor limite entre duração da tentativa e encerramento do evento', () => {
  assert.equal(rankedDeadline(event(), { started_at: '2026-07-29T10:30:00Z' }), Date.parse('2026-07-29T11:30:00Z'));
  assert.equal(rankedDeadline(event(), { started_at: '2026-07-29T11:30:00Z' }), Date.parse('2026-07-29T12:00:00Z'));
  assert.equal(rankedDeadline(event({ duration_minutes: 0 }), { started_at: '2026-07-29T11:30:00Z' }), null);
});

test('cronômetro usa relógio monotônico, suporta tick atrasado e nunca fica negativo', () => {
  let tick = 1000;
  const clock = createRankedClock({
    deadlineAt: '2026-07-29T10:01:00Z',
    serverNow: '2026-07-29T10:00:00Z',
    monotonicNow: () => tick,
  });
  assert.equal(clock.remaining(), 60000);
  tick = 31000;
  assert.equal(clock.remaining(), 30000);
  tick = 121000;
  assert.equal(clock.remaining(), 0);
  assert.equal(clock.expired(), true);
  tick = 500;
  assert.equal(clock.remaining(), 60000);
});

test('respostas são normalizadas na ordem oficial, incluindo não respondidas', () => {
  assert.deepEqual(normalizeRankedAnswers(questions(), [{ questionId: 'q2', answer: 'e' }]), [
    { questionId: 'q1', answer: '' },
    { questionId: 'q2', answer: 'E' },
  ]);
  assert.deepEqual([...allowedRankedAnswers(questions()[0])], ['C', 'E', '']);
});

test('respostas externas, duplicadas e alternativas inválidas são rejeitadas', () => {
  assert.throws(() => normalizeRankedAnswers(questions(), [{ questionId: 'externa', answer: 'C' }]), /RANKED_ANSWER_EXTERNAL/);
  assert.throws(() => normalizeRankedAnswers(questions(), [{ questionId: 'q1', answer: 'C' }, { questionId: 'q1', answer: 'E' }]), /RANKED_ANSWER_DUPLICATED/);
  assert.throws(() => normalizeRankedAnswers(questions(), [{ questionId: 'q1', answer: 'X' }]), /RANKED_ANSWER_INVALID/);
  assert.throws(() => normalizeRankedSubmissionAnswers(questions(), [{ questionId: 'q2', answer: 'X' }]), /alternativa enviada é inválida/i);
});

test('sessão válida preserva escopo, versão, conjunto e ordem oficiais', () => {
  assert.equal(validateRankedSession(session(), eventContext()).valid, true);
});

test('sessão rejeita usuário, concurso, escopo, evento e versão externos', () => {
  assert.ok(validateRankedSession(session({ userId: 'user-b' }), eventContext()).errors.includes('SESSION_USER_MISMATCH'));
  assert.ok(validateRankedSession(session({ contestId: 'outro' }), eventContext()).errors.includes('SESSION_CONTEST_MISMATCH'));
  assert.ok(validateRankedSession(session({ scopeKey: 'forjado' }), eventContext()).errors.includes('SESSION_SCOPE_INVALID'));
  assert.ok(validateRankedSession(session({ eventId: 'outro' }), eventContext()).errors.includes('SESSION_EVENT_MISMATCH'));
  assert.ok(validateRankedSession(session({ eventVersion: 'antiga' }), eventContext()).errors.includes('SESSION_VERSION_MISMATCH'));
});

test('sessão rejeita ordem, índice, prazo, estado e respostas corrompidos', () => {
  assert.ok(validateRankedSession(session({ questionIds: ['q2', 'q1'] }), eventContext()).errors.includes('SESSION_QUESTION_ORDER_MISMATCH'));
  assert.ok(validateRankedSession(session({ currentIndex: 2 }), eventContext()).errors.includes('SESSION_INDEX_INVALID'));
  assert.ok(validateRankedSession(session({ deadlineAt: '2026-07-29T10:30:00Z' }), eventContext()).errors.includes('SESSION_DEADLINE_MISMATCH'));
  assert.ok(validateRankedSession(session({ status: 'completed' }), eventContext()).errors.includes('SESSION_STATUS_INVALID'));
  assert.ok(validateRankedSession(session({ answers: { x: { questionId: 'externa', answer: 'C' } } }), eventContext()).errors.includes('RANKED_ANSWER_EXTERNAL'));
});

test('correção é determinística e mantém a invariante com correta, errada e branco', () => {
  const answers = [{ questionId: 'q1', answer: 'C' }, { questionId: 'q2', answer: '' }];
  const first = scoreRankedAnswers(questions(), answers, 'cebraspe');
  const second = scoreRankedAnswers(questions(), answers, 'cebraspe');
  assert.deepEqual(first, second);
  assert.deepEqual(first, { correctCount: 1, incorrectCount: 0, blankCount: 1, score: 1, accuracy: 100 });
  assert.equal(first.correctCount + first.incorrectCount + first.blankCount, 2);
  assert.deepEqual(scoreRankedAnswers([], [], 'simple'), { correctCount: 0, incorrectCount: 0, blankCount: 0, score: 0, accuracy: 0 });
});

test('invariante do resultado rejeita contagens incoerentes', () => {
  assert.equal(rankedResultInvariant({ total: 10, correct: 5, errors: 3, unanswered: 2 }).valid, true);
  assert.equal(rankedResultInvariant({ total: 10, correct: 5, errors: 3, unanswered: 3 }).valid, false);
});

test('questão pública nunca inclui gabarito ou explicação antes da liberação', () => {
  const safe = publicQuestion({ question_id: 'q1', payload: { enunciado: 'Teste', correct_answer: 'C', explanation: 'Segredo' } });
  assert.doesNotMatch(JSON.stringify(safe), /correct_answer|Segredo|explanation/);
});

test('gabarito continua bloqueado após o evento quando não existe entrega válida', async () => {
  const currentEvent = event({
    status: 'finished',
    registration_ends_at: '2026-07-29T08:59:00Z',
    starts_at: '2026-07-29T09:00:00Z',
    ends_at: '2026-07-29T10:00:00Z',
  });
  const handler = createRankedEventHandler({
    resolveIdentity: async () => ({ userId: 'student', role: 'student' }),
    repository: {
      getEvent: async () => currentEvent,
      hasEntitlement: async () => true,
      getAttempt: async () => ({ id: 'attempt-1', event_id: currentEvent.id, user_id: 'student', status: 'started', started_at: '2026-07-29T09:00:00Z' }),
    },
    now: () => new Date('2026-07-29T11:00:00Z'),
  });
  const response = await handler(request({ action: 'get_result', eventId: currentEvent.id }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'RESULT_NOT_AVAILABLE');
});

test('ranking usa somente submissões completas, elimina participante duplicado e é determinístico', () => {
  const rows = [
    { id: 'b', user_id: 'u1', display_name: 'Aluno 1', status: 'submitted', score: 8, accuracy: 80, elapsed_seconds: 90, submitted_at: '2026-07-29T11:00:00Z', correct_count: 8, incorrect_count: 2 },
    { id: 'a', user_id: 'u1', display_name: 'Aluno 1', status: 'submitted', score: 9, accuracy: 90, elapsed_seconds: 80, submitted_at: '2026-07-29T10:59:00Z', correct_count: 9, incorrect_count: 1 },
    { id: 'c', user_id: 'u2', display_name: 'Aluno 2', status: 'started', score: 10, accuracy: 100, elapsed_seconds: 10, submitted_at: null, correct_count: 10, incorrect_count: 0 },
    { id: 'd', user_id: 'u3', display_name: 'Aluno 3', status: 'timed_out', score: 9, accuracy: 90, elapsed_seconds: 80, submitted_at: '2026-07-29T10:59:00Z', correct_count: 9, incorrect_count: 1 },
  ];
  const ranking = rankAttempts(rows);
  assert.deepEqual(ranking.map(({ displayName }) => displayName), ['Aluno 1', 'Aluno 3']);
  assert.deepEqual(ranking.map(({ position }) => position), [1, 2]);
  assert.doesNotMatch(JSON.stringify(ranking), /user_id|u1|u3/);
});

test('ranking do evento rejeita resultado com contagens incompatíveis', () => {
  const ranking = rankAttempts([{
    id: 'a', user_id: 'u1', display_name: 'Aluno', status: 'submitted', score: 10,
    accuracy: 100, elapsed_seconds: 10, submitted_at: '2026-07-29T11:00:00Z',
    correct_count: 1, incorrect_count: 0, blank_count: 0,
  }], event({ question_count: 2 }));
  assert.deepEqual(ranking, []);
});

test('entrega repetida recupera o resultado canônico sem segunda persistência', async () => {
  const currentEvent = event({ status: 'live' });
  let attempt = {
    id: 'attempt-1', event_id: currentEvent.id, user_id: 'student', status: 'started', started_at: '2026-07-29T10:00:00Z', answers: [],
  };
  let writes = 0;
  const repository = {
    getEvent: async () => currentEvent,
    hasEntitlement: async () => true,
    getAttempt: async () => attempt,
    getQuestions: async () => questions().map(({ id: _id, ...question }) => question),
    submit: async (_event, _user, result) => {
      writes += 1;
      attempt = { ...attempt, ...result, status: result.status, submitted_at: result.submittedAt };
      return attempt;
    },
  };
  const handler = createRankedEventHandler({
    resolveIdentity: async () => ({ userId: 'student', role: 'student' }), repository,
    now: () => new Date('2026-07-29T10:10:00Z'),
  });
  const body = { action: 'submit', eventId: currentEvent.id, answers: [{ questionId: 'q1', answer: 'C' }] };
  assert.equal((await handler(request(body))).status, 200);
  const repeated = await handler(request(body));
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).recovered, true);
  assert.equal(writes, 1);
});

test('evento futuro, encerrado ou cancelado não inicia tentativa', async () => {
  for (const currentEvent of [
    event({ starts_at: '2026-07-30T10:00:00Z', ends_at: '2026-07-30T12:00:00Z' }),
    event({ starts_at: '2026-07-28T10:00:00Z', ends_at: '2026-07-28T12:00:00Z' }),
    event({ status: 'cancelled' }),
  ]) {
    const handler = createRankedEventHandler({
      resolveIdentity: async () => ({ userId: 'student', role: 'student' }),
      repository: { getEvent: async () => currentEvent, hasEntitlement: async () => true },
      now: () => new Date('2026-07-29T10:10:00Z'),
    });
    assert.equal((await handler(request({ action: 'start', eventId: currentEvent.id }))).status, 409);
  }
});

test('interface contém navegação, confirmação, expiração, foco e proteção contra duplo envio', () => {
  assert.match(uiSource, /<fieldset class="ranked-question"/);
  assert.match(uiSource, /aria-label="Mapa de questões"/);
  assert.match(uiSource, /Entregar este simulado\?/);
  assert.match(uiSource, /Após a entrega, suas respostas não poderão ser alteradas\./);
  assert.match(uiSource, /Continuar respondendo/);
  assert.match(uiSource, /autofocus/);
  assert.match(uiSource, /session\.submitting/);
  assert.match(uiSource, /clearRankedTimer/);
  assert.match(uiSource, /O tempo terminou\. Suas respostas registradas foram entregues\./);
  assert.doesNotMatch(uiSource, /correctAnswer[\s\S]*renderQuestion/);
});

test('simulado permanece isolado de recompensas e o app protege troca de contexto', () => {
  assert.doesNotMatch(uiSource, /academicProgressService|dailyGoalService|studyStreakService|emblemService|applyXp|grantXp/);
  assert.match(appSource, /requestRankedExit/);
  assert.match(appSource, /contestChanged[\s\S]*rankedEventSession = null/);
  assert.match(edgeSource, /eq\('event_id', event\.id\)\.eq\('user_id', userId\)\.eq\('status', 'started'\)/);
});

test('logout limpa a sessão ranqueada transitória e encerra o interval', () => {
  let cleared = 0;
  const context = { rankedEventSession: session(), clearRankedTimer: () => { cleared += 1; }, user: { id: 'user-a' } };
  resetAcademicSessionContext(context);
  assert.equal(cleared, 1);
  assert.equal(context.rankedEventSession, null);
  assert.equal(context.clearRankedTimer, null);
  assert.equal(context.user, null);
});
