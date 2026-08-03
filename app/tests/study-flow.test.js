import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildDisciplineTopics,
  createSingleSessionStarter,
  filterDisciplines,
  resolveDisciplinePresentation,
  resolveSubtopicPresentation,
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
  filterDisciplines([{ name: discipline.name, status: { key: 'completed' } }], { filter: 'completed' });
  assert.deepEqual(academic, before);
});

test('interface usa botões, accordion semântico, modal explícito e retorno à árvore', async () => {
  const [map, tree, css] = await Promise.all([
    readFile(new URL('../js/ui/worldMap.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/ui/topicTree.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/main.css', import.meta.url), 'utf8'),
  ]);
  assert.match(map, /<button[^>]+study-discipline-card/);
  assert.match(map, /data-theme|dataset\.theme = 'study'/);
  assert.doesNotMatch(map, /createBattleSession|progressCloud|supabase/i);
  assert.match(tree, /aria-expanded/);
  assert.match(tree, /aria-controls/);
  assert.match(tree, /Iniciar questões/);
  assert.match(tree, /createSingleSessionStarter/);
  assert.match(tree, /ctx\.returnToTree = discId/);
  assert.match(tree, /ctx\.studySubtopicId = sid/);
  assert.match(tree, /Questões ainda não disponíveis/);
  assert.doesNotMatch(tree, /style=/);
  const studyCss = css.slice(css.indexOf('Núcleo acadêmico v1'), css.indexOf('Administração segura de alunos'));
  assert.doesNotMatch(studyCss, /!important|font-size:\s*(?:[0-9]|1[01])px/);
  assert.match(studyCss, /min-height:var\(--ds-touch-target\)/);
  assert.match(studyCss, /max-width:390px/);
  assert.match(studyCss, /max-width:320px/);
});
