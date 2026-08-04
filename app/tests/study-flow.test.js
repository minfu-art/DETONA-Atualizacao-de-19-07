import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildDisciplineTopics,
  buildQuestionAvailabilityBySubtopic,
  createSingleSessionStarter,
  eligibleReviewItems,
  filterDisciplines,
  resolveQuestionBankState,
  resolveDisciplinePresentation,
  resolveStudyContinuation,
  resolveSubtopicPresentation,
  studySessionErrorMessage,
} from '../js/ui/studyPresentation.js';

const discipline = { id: 'port', name: 'Língua Portuguesa', order: 1 };
const subtopics = [
  { id: 'port_1', discipline_id: 'port', name: 'Texto', edital_numbering: '1.1', attempts_count: 0, best_accuracy: 0, stars: 0 },
  { id: 'port_2', discipline_id: 'port', name: 'Gramática', edital_numbering: '1.2', attempts_count: 2, best_accuracy: 70, stars: 2 },
];
const curriculum = [
  { id: 'd-uuid', source_id: 'port', type: 'discipline', order_index: 0 },
  { id: 't-uuid', source_id: 'port_texto', parent_id: 'd-uuid', type: 'topic', name: 'Compreensão textual', order_index: 0 },
  { id: 's2-uuid', source_id: 'port_2', parent_id: 't-uuid', type: 'subtopic', name: 'Gramática', order_index: 1 },
  { id: 's1-uuid', source_id: 'port_1', parent_id: 't-uuid', type: 'subtopic', name: 'Texto', order_index: 0 },
  { id: 'empty-uuid', source_id: 'port_empty', parent_id: 'd-uuid', type: 'topic', name: 'Tópico futuro', order_index: 1 },
];

function question(id, subtopicId, extra = {}) {
  return {
    id,
    subtopic_id: subtopicId,
    statement: `Enunciado ${id}`,
    format: 'certo_errado',
    correct_answer: true,
    status: 'revisada',
    ...extra,
  };
}

function continuationNode(subtopic, unlocked, topicId = 'topic') {
  return { subtopic, subtopicId: subtopic.id, unlocked, topicId };
}

test('preserva hierarquia disciplina, tópico e subtópico com IDs e ordem canônica', () => {
  const before = structuredClone({ discipline, subtopics, curriculum });
  const topics = buildDisciplineTopics(discipline, subtopics, curriculum);
  assert.deepEqual(topics.map(({ id }) => id), ['port_texto', 'port_empty']);
  assert.deepEqual(topics[0].subtopics.map(({ id }) => id), ['port_1', 'port_2']);
  assert.equal(topics[1].subtopics.length, 0);
  assert.deepEqual({ discipline, subtopics, curriculum }, before);
});

test('legado plano recebe um agrupamento neutro sem promover ou reordenar subtópicos', () => {
  const topics = buildDisciplineTopics(discipline, [...subtopics].reverse(), []);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].synthetic, true);
  assert.deepEqual(topics[0].subtopics.map(({ id }) => id), ['port_1', 'port_2']);
});

test('disciplina sem conteúdo e filtros preservam a coleção original', () => {
  const empty = resolveDisciplinePresentation(discipline, []);
  assert.equal(empty.subtopicCount, 0);
  assert.equal(empty.status.key, 'not-started');
  const cards = [
    { name: 'Português', status: { key: 'in-progress' } },
    { name: 'Informática', status: { key: 'not-started' } },
  ];
  assert.deepEqual(filterDisciplines(cards, { filter: 'in-progress' }), [cards[0]]);
  assert.deepEqual(filterDisciplines(cards, { search: 'formá' }), [cards[1]]);
  assert.equal(cards.length, 2);
});

test('camada de apresentação cobre estados sem alterar o registro acadêmico', () => {
  const fixture = { ...subtopics[1], memory_temperature: 'frio', review_question_ids: ['q1'] };
  const before = structuredClone(fixture);
  const attention = resolveSubtopicPresentation(fixture, 20, { count: 1, unlocked: true });
  assert.equal(attention.label, 'Precisa de atenção');
  assert.equal(attention.actionLabel, 'Continuar');
  assert.equal(attention.reviewCount, 1);
  const unavailable = resolveSubtopicPresentation(subtopics[0], 0, { unlocked: true });
  assert.equal(unavailable.actionLabel, 'Ver disponibilidade');
  assert.match(unavailable.description, /preparação/);
  const locked = resolveSubtopicPresentation(subtopics[0], 20, { unlocked: false });
  assert.equal(locked.disabled, true);
  assert.match(locked.reason, /requisito acadêmico/);
  assert.deepEqual(fixture, before);
});

test('abrir e cancelar preparação não cria sessão; confirmação dupla cria exatamente uma', async () => {
  let calls = 0;
  const start = createSingleSessionStarter(async (id) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { id: `battle:${id}` };
  });
  assert.equal(calls, 0);
  const [first, second] = await Promise.all([start('port_1'), start('port_1')]);
  assert.equal(calls, 1);
  assert.equal(first.id, second.id);
});

test('falha ao criar sessão libera uma nova tentativa sem duplicar chamadas concorrentes', async () => {
  let calls = 0;
  const start = createSingleSessionStarter(async (id) => {
    calls += 1;
    if (calls === 1) throw new Error('falha simulada');
    return { id: `battle:${id}` };
  });
  await assert.rejects(start('port_1'), /falha simulada/);
  assert.deepEqual(await start('port_1'), { id: 'battle:port_1' });
  assert.equal(calls, 2);
});

test('preparação não expõe códigos internos e preserva mensagens acadêmicas úteis', () => {
  assert.equal(
    studySessionErrorMessage(new Error('AUTH_REQUIRED')),
    'Não foi possível preparar a sessão. Tente novamente.',
  );
  assert.equal(
    studySessionErrorMessage(new Error('Este subtópico precisa de 10 questões disponíveis; hoje possui 4.')),
    'Este subtópico precisa de 10 questões disponíveis; hoje possui 4.',
  );
});

test('continuação prioriza contexto desbloqueado e ignora contexto bloqueado', () => {
  const rows = [
    { id: 'a', attempts_count: 1, last_attempt_at: '2026-07-01T10:00:00Z' },
    { id: 'b', attempts_count: 2, last_studied_at: '2026-07-03T10:00:00Z' },
  ];
  const nodes = [continuationNode(rows[0], true, 't-a'), continuationNode(rows[1], true, 't-b')];
  assert.deepEqual(resolveStudyContinuation({ subtopics: rows, nodes, currentSubtopicId: 'a' }), {
    subtopicId: 'a', topicId: 't-a', mode: 'resume', actionLabel: 'Retomar último subtópico',
    lastActivity: '2026-07-01T10:00:00Z',
  });
  nodes[0].unlocked = false;
  assert.equal(resolveStudyContinuation({ subtopics: rows, nodes, currentSubtopicId: 'a' }).subtopicId, 'b');
});

test('continuação usa atividade mais recente e fallbacks apenas desbloqueados', () => {
  const studied = [
    { id: 'a', attempts_count: 1, ultimaTentativaEm: '2026-07-02T10:00:00Z' },
    { id: 'b', attempts_count: 1, last_studied_at: '2026-07-04T10:00:00Z' },
  ];
  assert.equal(resolveStudyContinuation({
    subtopics: studied,
    nodes: studied.map((item, index) => continuationNode(item, true, `t-${index}`)),
  }).subtopicId, 'b');

  const pending = [{ id: 'locked', attempts_count: 0 }, { id: 'next', attempts_count: 0 }];
  const pendingResult = resolveStudyContinuation({
    subtopics: pending,
    nodes: [continuationNode(pending[0], false), continuationNode(pending[1], true, 't-next')],
  });
  assert.equal(pendingResult.subtopicId, 'next');
  assert.equal(pendingResult.actionLabel, 'Começar próximo subtópico');

  const attempted = [{ id: 'first', attempts_count: 2 }, { id: 'second', attempts_count: 1 }];
  assert.equal(resolveStudyContinuation({
    subtopics: attempted,
    nodes: [continuationNode(attempted[0], false), continuationNode(attempted[1], true)],
  }).subtopicId, 'second');
  assert.equal(resolveStudyContinuation({
    subtopics: attempted,
    nodes: attempted.map((item) => continuationNode(item, false)),
  }), null);
});

test('disponibilidade cruza somente IDs elegíveis e preserva os históricos legados', () => {
  const rows = [{
    id: 'a',
    answered_question_ids: ['q1', 'q1', 'removida', 'invalida'],
    questoesRespondidas: ['q2', 'outro-subtopico'],
  }, { id: 'b', answered_question_ids: [] }];
  const questions = [
    question('q1', 'a'), question('q1', 'a'), question('q2', 'a'), question('q3', 'a'),
    question('invalida', 'a', { status: 'arquivada' }), question('outro-subtopico', 'b'),
  ];
  const before = structuredClone({ rows, questions });
  const result = buildQuestionAvailabilityBySubtopic({ questions, subtopics: rows });
  assert.deepEqual(result.a.eligibleIds, ['q1', 'q2', 'q3']);
  assert.deepEqual(result.a.answeredEligibleIds, ['q1', 'q2']);
  assert.deepEqual(result.a.unseenEligibleIds, ['q3']);
  assert.equal(result.a.total, 3);
  assert.equal(result.a.answeredTotal, 2);
  assert.equal(result.a.unseenTotal, 1);
  assert.equal(result.a.answeredTotal + result.a.unseenTotal, result.a.total);
  assert.deepEqual({ rows, questions }, before);
});

test('revisão conta somente erro com questão elegível do mesmo subtópico', () => {
  const questions = [question('ok', 'a'), question('other', 'b'), question('archived', 'a', { status: 'arquivada' })];
  const queue = [
    { subtopicId: 'a', questionId: 'ok', status: 'pending' },
    { subtopicId: 'a', questionId: 'ok', status: 'frozen' },
    { subtopicId: 'a', status: 'pending' },
    { subtopicId: 'a', questionId: 'removed', status: 'pending' },
    { subtopicId: 'a', questionId: 'archived', status: 'pending' },
    { subtopicId: 'a', questionId: 'other', status: 'pending' },
    { subtopicId: 'b', questionId: 'other', status: 'pending' },
  ];
  assert.deepEqual(eligibleReviewItems({ reviewQueue: queue, questions, subtopicId: 'a' }), [queue[0]]);
});

test('estado do banco distingue zero, insuficiente e pronto no limite oficial', () => {
  assert.equal(resolveQuestionBankState(0, 10).key, 'empty');
  assert.equal(resolveQuestionBankState(1, 10).key, 'insufficient');
  assert.match(resolveQuestionBankState(9, 10).description, /9 questões elegíveis/);
  assert.equal(resolveQuestionBankState(10, 10).key, 'ready');
  assert.equal(resolveQuestionBankState(11, 10).ready, true);
});

test('ações de apresentação preservam snapshot acadêmico completo', () => {
  const academic = {
    player: { xp: 420, level: 17, mastery_pct: 33, edital_completion_pct: 21 },
    subtopic: {
      ...subtopics[1], stars: 3, best_accuracy: 80, attempts_count: 4,
      attempt_history: [{ battleId: 'battle-1' }], review_question_ids: ['q-1'],
    },
    reviewQueue: [{ questionId: 'q-1', status: 'pending' }],
    questionIds: ['q-1', 'q-2'],
    curriculumIds: ['port', 'port_texto', 'port_1', 'port_2'],
  };
  const before = structuredClone(academic);
  resolveSubtopicPresentation(academic.subtopic, academic.questionIds.length, { count: 1, unlocked: true });
  resolveDisciplinePresentation(discipline, [academic.subtopic]);
  buildDisciplineTopics(discipline, [academic.subtopic], curriculum);
  buildQuestionAvailabilityBySubtopic({ questions: [question('q-1', academic.subtopic.id)], subtopics: [academic.subtopic] });
  eligibleReviewItems({ reviewQueue: academic.reviewQueue, questions: [question('q-1', academic.subtopic.id)], subtopicId: academic.subtopic.id });
  resolveStudyContinuation({ subtopics: [academic.subtopic], nodes: [continuationNode(academic.subtopic, true)] });
  filterDisciplines([{ name: discipline.name, status: { key: 'completed' } }], { filter: 'completed' });
  assert.deepEqual(academic, before);
});

test('interface usa botões, accordion semântico, modal explícito e retorno à árvore', async () => {
  const [map, tree, presentation, css] = await Promise.all([
    readFile(new URL('../js/ui/worldMap.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/ui/topicTree.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/ui/studyPresentation.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/main.css', import.meta.url), 'utf8'),
  ]);
  assert.match(map, /<button[^>]+study-discipline-card/);
  assert.match(map, /data-theme|dataset\.theme = 'study'/);
  assert.doesNotMatch(map, /createBattleSession|progressCloud|supabase/i);
  assert.match(tree, /aria-expanded/);
  assert.match(tree, /aria-controls/);
  assert.match(tree, /Iniciar questões/);
  assert.match(tree, /createSingleSessionStarter/);
  assert.match(tree, /buildQuestionAvailabilityBySubtopic/);
  assert.match(tree, /eligibleReviewItems/);
  assert.match(tree, /studySessionErrorMessage\(sessionError\)/);
  assert.match(tree, /ctx\.returnToTree = discId/);
  assert.match(tree, /ctx\.studySubtopicId = sid/);
  assert.match(presentation, /Questões ainda não disponíveis/);
  assert.match(presentation, /Banco ainda insuficiente para uma sessão/);
  assert.match(tree, /id="study-unavailable-close">Fechar/);
  assert.match(tree, /id="study-unavailable-other">Escolher outro subtópico/);
  assert.match(tree, /ctx\.studyTopicId = topicId/);
  assert.match(tree, /ctx\.studySubtopicId = sid/);
  assert.match(tree, /querySelector\('\[data-study-subtopic\]'\)\?\.focus\(\)/);
  const continueHandler = tree.slice(tree.indexOf("$('#study-continue'"), tree.indexOf('paintTopics();', tree.indexOf("$('#study-continue'")) + 20);
  assert.doesNotMatch(continueHandler, /createBattleSession|openPreparation|navigate\('battle'\)/);
  for (const source of [map, tree]) assert.match(source, /Domínio médio/);
  assert.match(tree, /de domínio médio/);
  assert.match(tree, /Melhor acerto/);
  assert.doesNotMatch(map, /Taxa de acerto geral/);
  assert.doesNotMatch(tree, /% concluído/);
  assert.doesNotMatch(tree, /style=/);
  const studyCss = css.slice(css.indexOf('Núcleo acadêmico v1'), css.indexOf('Administração segura de alunos'));
  assert.doesNotMatch(studyCss, /!important|font-size:\s*(?:[0-9]|1[01])px/);
  assert.match(studyCss, /min-height:var\(--ds-touch-target\)/);
  assert.match(studyCss, /max-width:390px/);
  assert.match(studyCss, /max-width:320px/);
});
