import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQuestionCollection, isQuestionEligible, normalizeAnswer, normalizeQuestion, sanitizeSensitiveText, stableQuestionId } from '../js/core/questionSchema.js';

const legacy = { id: 'q_legacy_1', subtopic_id: 'port_3', format: 'multipla_escolha', statement: 'Enunciado de teste', options: ['A) Um', 'B) Dois'], correct_answer: 'B', explanation: 'Explicação' };

test('normaliza schema antigo preservando aliases e ID', () => {
  const question = normalizeQuestion(legacy, { disciplina: 'lingua_portuguesa' });
  assert.equal(question.id, legacy.id);
  assert.equal(question.enunciado, legacy.statement);
  assert.deepEqual(question.alternativas, legacy.options);
  assert.equal(question.respostaCorreta, 'B');
  assert.equal(question.statement, question.enunciado);
  assert.equal(question.subtopic_id, 'port_3');
  assert.equal(question.version, 3);
  assert.ok(isQuestionEligible(question));
});

test('ID determinístico é estável para item sem ID', () => {
  assert.equal(stableQuestionId(legacy), stableQuestionId({ ...legacy }));
  assert.match(stableQuestionId(legacy), /^q_auto_[0-9a-f]{8}$/);
});

test('valida alternativas e gabarito pertencente às opções', () => {
  assert.deepEqual(normalizeAnswer('B', 'multipla_escolha', legacy.options), { value: 'B', valid: true });
  assert.equal(normalizeAnswer('E', 'multipla_escolha', legacy.options).valid, false);
  assert.equal(normalizeAnswer('Dois', 'multipla_escolha', legacy.options).value, 'B');
  assert.equal(normalizeAnswer(0, 'multipla_escolha', legacy.options).value, 'A');
  assert.equal(normalizeAnswer(1, 'multipla_escolha', legacy.options).valid, false);
});

test('preserva letra e texto das alternativas no formato editorial em português', () => {
  const question = normalizeQuestion({
    ...legacy,
    id: 'q_opcoes_pt_br',
    options: undefined,
    alternativas: [
      { letra: 'A', texto: 'Primeira alternativa' },
      { letra: 'B', texto: 'Segunda alternativa' },
    ],
    correct_answer: undefined,
    respostaCorreta: 'B',
  });
  assert.deepEqual(question.options, ['A) Primeira alternativa', 'B) Segunda alternativa']);
  assert.equal(question.correct_answer, 'B');
  assert.ok(isQuestionEligible(question));
});

test('gabarito incompatível entra em revisão e não é elegível', () => {
  const question = normalizeQuestion({ ...legacy, id: 'outro', correct_answer: 'E' });
  assert.equal(question.situacao, 'revisao');
  assert.equal(isQuestionEligible(question), false);
});

test('detecta IDs e enunciados duplicados', () => {
  const first = normalizeQuestion(legacy);
  const report = analyzeQuestionCollection([first, { ...first }]);
  assert.equal(report.duplicateIds.length, 1);
  assert.equal(report.duplicateStatements, 1);
});

test('sanitiza identificador pessoal e parâmetros de rastreamento', () => {
  const input = 'https://exemplo.test/prova?utm_source=x&uid=123&publico=ok 09880248457 - thallysson gabriel';
  const result = sanitizeSensitiveText(input);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.value, /09880248457|thallysson|utm_source|uid=/i);
  assert.match(result.value, /exemplo\.test\/prova/);
  assert.match(result.value, /publico=ok/);
});

test('campos enriquecidos são opcionais e preservam a explicação atual', () => {
  const fallback = normalizeQuestion(legacy);
  assert.equal(fallback.explanation, legacy.explanation);
  assert.equal(fallback.porqueCorreta, '');
  assert.deepEqual(fallback.referencias, []);

  const enriched = normalizeQuestion({
    ...legacy,
    porqueCorreta: 'A alternativa B reproduz a regra.',
    porqueAlternativaA: 'A alternativa A confunde os conceitos.',
    pegadinhaDaBanca: 'Troca do requisito principal.',
    dicaDeMemorizacao: 'Associe B ao conceito-base.',
    resumo: 'Regra central em uma frase.',
    referencias: ['Lei 1, art. 2º'],
  });
  assert.equal(enriched.porqueCorreta, 'A alternativa B reproduz a regra.');
  assert.equal(enriched.porqueAlternativaA, 'A alternativa A confunde os conceitos.');
  assert.deepEqual(enriched.referencias, ['Lei 1, art. 2º']);
});
