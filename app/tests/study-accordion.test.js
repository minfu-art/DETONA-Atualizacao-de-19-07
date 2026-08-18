import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearStudyAccordion,
  consumeStudyReturn,
  rememberStudyReturn,
  toggleStudyTopic,
} from '../js/ui/studyAccordionState.js';

test('nova entrada em ESTUDAR começa com todos os tópicos fechados', () => {
  const context = { studyTopicId: 'topic-a', studySubtopicId: 'sub-a', studyReturnContext: null };
  assert.equal(consumeStudyReturn(context, { contestId: 'pc_al', disciplineId: 'contabilidade' }), null);
  assert.equal(context.studyReturnContext, null);
});

test('accordion mantém no máximo um tópico aberto e permite fechar o atual', () => {
  let expanded = null;
  expanded = toggleStudyTopic(expanded, 'topic-a');
  assert.equal(expanded, 'topic-a');
  expanded = toggleStudyTopic(expanded, 'topic-b');
  assert.equal(expanded, 'topic-b');
  expanded = toggleStudyTopic(expanded, 'topic-b');
  assert.equal(expanded, null);
});

test('retorno da sessão preserva uma única vez somente tópico e subtópico de origem', () => {
  const context = {};
  rememberStudyReturn(context, {
    contestId: 'pc_al', disciplineId: 'contabilidade', topicId: 'balancete', subtopicId: 'balancete-1',
  });
  assert.deepEqual(consumeStudyReturn(context, { contestId: 'pc_al', disciplineId: 'contabilidade' }), {
    topicId: 'balancete', subtopicId: 'balancete-1',
  });
  assert.equal(consumeStudyReturn(context, { contestId: 'pc_al', disciplineId: 'contabilidade' }), null);
});

test('troca de disciplina rejeita e consome contexto anterior', () => {
  const context = {};
  rememberStudyReturn(context, {
    contestId: 'pc_al', disciplineId: 'contabilidade', topicId: 'balancete', subtopicId: 'balancete-1',
  });
  assert.equal(consumeStudyReturn(context, { contestId: 'pc_al', disciplineId: 'portugues' }), null);
  assert.equal(context.studyReturnContext, null);
});

test('troca de curso rejeita e consome contexto anterior', () => {
  const context = {};
  rememberStudyReturn(context, {
    contestId: 'pc_al', disciplineId: 'portugues', topicId: 'sintaxe', subtopicId: 'sintaxe-1',
  });
  assert.equal(consumeStudyReturn(context, { contestId: 'pc_ba_2026', disciplineId: 'portugues' }), null);
  assert.equal(context.studyReturnContext, null);
});

test('limpeza do accordion não altera nenhum dado acadêmico', () => {
  const context = {
    studyTopicId: 'topic-a', studySubtopicId: 'sub-a', studyReturnContext: { topicId: 'topic-a' },
    player: { mastery_pct: 71 }, questions: 6480, stars: 4,
  };
  clearStudyAccordion(context);
  assert.deepEqual(context, {
    studyTopicId: null, studySubtopicId: null, studyReturnContext: null,
    player: { mastery_pct: 71 }, questions: 6480, stars: 4,
  });
});
