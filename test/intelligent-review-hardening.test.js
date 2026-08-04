import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STORES } from '../app/js/core/types.js';
import {
  applyReviewEvent,
  boundedProcessedIds,
  calculateNextReviewAt,
  createReviewItem,
  listDueReviewItems,
  migrateLegacyReviewItems,
  selectReviewItems,
  validateReviewQueueItem,
} from '../app/js/core/reviewQueue.js';
import {
  answerReviewQuestion,
  validateReviewSession,
} from '../app/js/services/reviewService.js';
import { clearActiveContestId, setActiveContestId } from '../app/js/contest/activeContest.js';
import { clearActiveUserId, setActiveUserId } from '../app/js/auth/activeUser.js';
import { isQuestionEligible } from '../app/js/core/questionSchema.js';

const NOW = new Date('2028-02-28T15:30:00.000Z');

function question(id = 'q1', overrides = {}) {
  return {
    id,
    concursoId: 'contest-a',
    subtopic_id: 's1',
    topicoEditalId: 's1',
    disciplina: 'd1',
    statement: `Questão ${id}`,
    format: 'certo_errado',
    options: ['Certo', 'Errado'],
    correct_answer: true,
    situacao: 'ativa',
    explanation: 'Explicação factual.',
    ...overrides,
  };
}

function subtopic(overrides = {}) {
  return { id: 's1', discipline_id: 'd1', name: 'Subtópico 1', best_accuracy: 40, ...overrides };
}

function item(id = 'q1', overrides = {}) {
  return {
    ...createReviewItem({
      questionId: id,
      contestId: 'contest-a',
      subtopicId: 's1',
      disciplineId: 'd1',
      difficulty: 3,
      source: 'battle',
    }, { now: new Date('2028-02-27T15:30:00.000Z'), reason: 'incorrect' }),
    nextReviewAt: '2028-02-28T14:00:00.000Z',
    ...overrides,
  };
}

function validationContext(overrides = {}) {
  const questions = overrides.questions || [question()];
  const subtopics = overrides.subtopics || [subtopic()];
  return {
    contestId: 'contest-a',
    questions,
    subtopics,
    questionById: new Map(questions.map((row) => [row.id, row])),
    subtopicById: new Map(subtopics.map((row) => [row.id, row])),
    isQuestionEligible,
    ...overrides,
  };
}

function keyFor(store, value) {
  if (store === STORES.meta) return value.key;
  if (store === STORES.reviewQueue) return value.questionId;
  return value.id || value.date || value.key;
}

function memoryRepository(seed = {}, { failOnce = null } = {}) {
  const rows = Object.fromEntries(Object.values(STORES).map((store) => [store, structuredClone(seed[store] || [])]));
  const metaValues = new Map();
  let failed = false;
  return {
    rows,
    async getAll(store) { return structuredClone(rows[store] || []); },
    async getById(store, id) {
      return structuredClone((rows[store] || []).find((row) => String(keyFor(store, row)) === String(id)) || null);
    },
    async put(store, value) {
      if (!failed && failOnce?.(store, value)) { failed = true; throw new Error('PERSISTENCE_INTERRUPTED'); }
      const list = rows[store] || (rows[store] = []);
      const index = list.findIndex((row) => String(keyFor(store, row)) === String(keyFor(store, value)));
      if (index >= 0) list[index] = structuredClone(value); else list.push(structuredClone(value));
      return structuredClone(value);
    },
    async putMany(store, values) { for (const value of values) await this.put(store, value); },
    async getMeta(key) { return structuredClone(metaValues.get(key) ?? null); },
    async setMeta(key, value) { metaValues.set(key, structuredClone(value)); return value; },
  };
}

function session(overrides = {}) {
  const queueItem = item();
  return {
    id: 'review-session-a',
    userId: 'user-a',
    contestId: 'contest-a',
    scopeKey: 'user-a:contest-a',
    items: [queueItem],
    questions: [question()],
    index: 0,
    correct: 0,
    errors: 0,
    results: [],
    finished: false,
    startedAt: '2028-02-28T15:00:00.000Z',
    lastActiveAt: '2028-02-28T15:00:00.000Z',
    activeSeconds: 0,
    ...overrides,
  };
}

test('item canônico válido preserva vínculo acadêmico e datas', () => {
  const result = validateReviewQueueItem(item(), validationContext());
  assert.equal(result.valid, true);
  assert.equal(result.scopeKey, 'contest-a:q1');
});

test('itens sem questão, removidos, inelegíveis ou com vínculos divergentes são inválidos e preservados', () => {
  const base = validationContext();
  assert.ok(validateReviewQueueItem({ ...item(), questionId: '' }, base).errors.includes('QUESTION_ID_REQUIRED'));
  assert.ok(validateReviewQueueItem(item('missing'), base).errors.includes('QUESTION_NOT_FOUND'));
  const archived = validationContext({ questions: [question('q1', { situacao: 'arquivada' })] });
  assert.ok(validateReviewQueueItem(item(), archived).errors.includes('QUESTION_INELIGIBLE'));
  assert.ok(validateReviewQueueItem({ ...item(), contestId: 'contest-b' }, base).errors.includes('CONTEST_MISMATCH'));
  assert.ok(validateReviewQueueItem({ ...item(), subtopicId: 's2' }, base).errors.includes('SUBTOPIC_MISMATCH'));
  assert.ok(validateReviewQueueItem({ ...item(), nextReviewAt: 'inválida' }, base).errors.includes('NEXT_REVIEW_AT_INVALID'));
  assert.ok(validateReviewQueueItem({ ...item(), status: 'misterioso' }, base).errors.includes('STATUS_UNKNOWN'));
});

test('duplicação incoerente é classificada sem apagar o registro', () => {
  const seen = new Map();
  const context = { ...validationContext(), seen };
  assert.equal(validateReviewQueueItem(item(), context).valid, true);
  const duplicate = item('q1', { errorCount: 9 });
  const result = validateReviewQueueItem(duplicate, context);
  assert.ok(result.errors.includes('DUPLICATE_INCOHERENT'));
  assert.equal(duplicate.errorCount, 9);
});

test('calendário civil aplica 1, 6, 15 e 30 dias inclusive em ano bissexto', () => {
  const base = item('q1', { consecutiveCorrect: 0 });
  assert.equal(calculateNextReviewAt(base, { now: NOW, correct: false }), '2028-02-29T15:30:00.000Z');
  assert.equal(calculateNextReviewAt(base, { now: NOW, correct: true }), '2028-03-05T15:30:00.000Z');
  assert.equal(calculateNextReviewAt({ ...base, consecutiveCorrect: 1 }, { now: NOW, correct: true }), '2028-03-14T15:30:00.000Z');
  assert.equal(calculateNextReviewAt({ ...base, consecutiveCorrect: 2 }, { now: NOW, correct: true }), '2028-03-29T15:30:00.000Z');
});

test('erro reinicia memória quente; acertos avançam sem apagar histórico', () => {
  const first = applyReviewEvent(item(), question(), { now: NOW, correct: true, isReview: true, reason: 'review' });
  assert.equal(first.memoryState, 'morna');
  const error = applyReviewEvent(first, question(), { now: NOW, correct: false, isReview: true, reason: 'review' });
  assert.equal(error.memoryState, 'quente');
  assert.ok(error.reviewHistory.length >= 2);
  assert.ok(error.errorCount >= 2);
});

test('seleção usa somente vencidas, exclui futuras e congeladas, deduplica e limita a 10', () => {
  const questions = Array.from({ length: 14 }, (_, index) => question(`q${index + 1}`));
  const context = validationContext({ questions });
  const rows = questions.map((row, index) => item(row.id, { priorityScore: index }));
  rows.push(item('q1', { errorCount: 99 }));
  rows.push(item('q12', { nextReviewAt: '2028-03-01T10:00:00.000Z' }));
  rows.push(item('q13', { status: 'frozen' }));
  const allDue = listDueReviewItems(rows, { ...context, now: NOW });
  const selected = selectReviewItems(rows, { ...context, now: NOW, limit: 10 });
  assert.equal(allDue.length, 14);
  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map((row) => row.questionId)).size, 10);
  assert.ok(selected.every((row) => row.status !== 'frozen' && new Date(row.nextReviewAt) <= NOW));
});

test('menos de dez itens vencidos produz sessão menor sem duplicação ou preenchimento futuro', () => {
  const questions = [question('q1'), question('q2')];
  const selected = selectReviewItems([
    item('q1'),
    item('q2', { nextReviewAt: '2028-03-05T10:00:00.000Z' }),
  ], { ...validationContext({ questions }), now: NOW, limit: 10 });
  assert.deepEqual(selected.map((row) => row.questionId), ['q1']);
});

test('sessão valida escopo, alinhamento item–questão, unicidade, tamanho e elegibilidade', () => {
  assert.equal(validateReviewSession(session(), { isQuestionEligible }).valid, true);
  assert.ok(validateReviewSession(session({ scopeKey: '' }), { isQuestionEligible }).errors.includes('SCOPE_KEY_REQUIRED'));
  assert.ok(validateReviewSession(session({ questions: [question('q2')] }), { isQuestionEligible }).errors.includes('ITEM_QUESTION_MISMATCH'));
  assert.ok(validateReviewSession(session({ questions: [question('q1', { situacao: 'arquivada' })] }), { isQuestionEligible }).errors.includes('QUESTION_INELIGIBLE'));
});

test('confirmação interrompida após a fila retoma subtópico e verticalizado sem duplicar', async () => {
  setActiveUserId('user-a');
  setActiveContestId('contest-a');
  const repository = memoryRepository({
    [STORES.reviewQueue]: [item()],
    [STORES.subtopics]: [subtopic()],
    [STORES.verticalized]: [{ id: 'v_s1', subtopic_id: 's1', review_count: 0 }],
  }, { failOnce: (store) => store === STORES.subtopics });
  await assert.rejects(
    answerReviewQuestion(session(), true, NOW, { repository }),
    /PERSISTENCE_INTERRUPTED/,
  );
  const retrySession = session();
  const retry = await answerReviewQuestion(retrySession, true, NOW, { repository });
  assert.equal(retry.applied, true);
  assert.equal(repository.rows[STORES.reviewQueue][0].reviewHistory.filter((entry) => entry.reason === 'review').length, 1);
  assert.equal(repository.rows[STORES.subtopics][0].review_history.length, 1);
  assert.equal(repository.rows[STORES.verticalized][0].review_count, 1);
  const completedRetry = await answerReviewQuestion(session(), true, NOW, { repository });
  assert.equal(completedRetry.applied, false);
  assert.equal(repository.rows[STORES.subtopics][0].review_history.length, 1);
  clearActiveUserId();
});

test('sessão do usuário ou concurso A é rejeitada no contexto B sem escrita', async () => {
  setActiveUserId('user-b');
  setActiveContestId('contest-b');
  const repository = memoryRepository({
    [STORES.reviewQueue]: [item()],
    [STORES.subtopics]: [subtopic()],
  });
  await assert.rejects(answerReviewQuestion(session(), true, NOW, { repository }), /REVIEW_CONTEXT_CHANGED/);
  assert.equal(repository.rows[STORES.reviewQueue][0].reviewHistory.length, 0);
  clearActiveUserId();
  clearActiveContestId();
});

test('sessão vinculada é rejeitada após logout sem qualquer escrita', async () => {
  clearActiveUserId();
  clearActiveContestId();
  const repository = memoryRepository({
    [STORES.reviewQueue]: [item()],
    [STORES.subtopics]: [subtopic()],
  });
  await assert.rejects(answerReviewQuestion(session(), true, NOW, { repository }), /REVIEW_CONTEXT_CHANGED/);
  assert.equal(repository.rows[STORES.reviewQueue][0].reviewHistory.length, 0);
});

test('IDs processados possuem limite seguro e mantêm os mais recentes', () => {
  const values = Array.from({ length: 400 }, (_, index) => `event-${index}`);
  const result = boundedProcessedIds(values, 'event-final');
  assert.equal(result.length, 250);
  assert.equal(result.at(-1), 'event-final');
  assert.equal(result.includes('event-0'), false);
});

test('migração preserva legado ambíguo e cria somente vínculo inequívoco', () => {
  const valid = migrateLegacyReviewItems([
    { ...subtopic(), review_question_ids: ['q1', 'missing'] },
  ], [question()], { contestId: 'contest-a', now: NOW, isQuestionEligible });
  assert.deepEqual(valid.map((row) => row.questionId), ['q1']);
  assert.equal(valid[0].source, 'migration');
});

test('UI separa seleção de confirmação, protege saída e não oferece recompensa ao abandonar', async () => {
  const [ui, app] = await Promise.all([
    readFile(new URL('../app/js/ui/review.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /id="review-confirm" disabled/);
  assert.match(ui, /fieldset class="review-answer-fieldset"/);
  assert.match(ui, /role="radio" aria-checked="false"/);
  assert.match(ui, /Encerrar esta revisão\?/);
  assert.match(ui, /nenhuma recompensa final da sessão será concedida/);
  assert.match(ui, /XP persistido/);
  assert.match(ui, /data-review-stay autofocus/);
  assert.match(app, /ctx\.requestReviewExit\?\.\(screen\)/);
});

test('abrir plano e selecionar alternativa não chamam persistência acadêmica', async () => {
  const ui = await readFile(new URL('../app/js/ui/review.js', import.meta.url), 'utf8');
  const selectionBlock = ui.match(/root\.querySelectorAll\('\.answer-btn'\)[\s\S]*?confirm\.addEventListener/)[0];
  assert.doesNotMatch(selectionBlock, /answerReviewQuestion|repository|put\(/);
  assert.match(ui, /confirm\.addEventListener\('click', \(\) => confirmAnswer/);
});
