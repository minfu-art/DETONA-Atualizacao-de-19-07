import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isQuestionEligible,
  normalizeQuestion,
  normalizeQuestionFormat,
} from '../app/js/core/questionSchema.js';

const publishedPcBaQuestion = {
  id: 'pcba_inv_dadm_08_01_q001',
  contest_id: 'pc_ba_2026',
  subtopic_id: 'pc_ba_2026_investigador_policia_civil_subtopic_direito_administrativo_8_1',
  discipline_id: 'nocoes_de_direito_administrativo',
  format: 'multiple_choice_a_e',
  statement: 'Assinale a alternativa correta.',
  options: [
    { label: 'A', text: 'Alternativa correta.' },
    { label: 'B', text: 'Alternativa incorreta.' },
    { label: 'C', text: 'Alternativa incorreta.' },
    { label: 'D', text: 'Alternativa incorreta.' },
    { label: 'E', text: 'Alternativa incorreta.' },
  ],
  correct_answer: 'A',
  explanation: 'A alternativa A está correta.',
};

test('reconhece o formato canônico A-E produzido pelo motor de cursos', () => {
  assert.equal(normalizeQuestionFormat('multiple_choice_a_e'), 'multipla_escolha');
  assert.equal(normalizeQuestionFormat('multiple_choice'), 'multipla_escolha');
  assert.equal(normalizeQuestionFormat('multipla_escolha'), 'multipla_escolha');
});

test('questão PC BA publicada em formato A-E permanece elegível no aplicativo', () => {
  assert.equal(isQuestionEligible(publishedPcBaQuestion), true);
  const normalized = normalizeQuestion(publishedPcBaQuestion, {
    concursoId: 'pc_ba_2026',
    topicoEditalId: publishedPcBaQuestion.subtopic_id,
    disciplina: publishedPcBaQuestion.discipline_id,
  });
  assert.equal(normalized.format, 'multipla_escolha');
  assert.equal(normalized.correct_answer, 'A');
  assert.equal(normalized.situacao, 'ativa');
  assert.equal(isQuestionEligible(normalized), true);
});
