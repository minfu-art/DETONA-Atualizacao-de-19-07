import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const bankPath = path.join(appRoot, 'data/questions/curated/detona_ineditas_pacto_sao_jose.json');
const indexPath = path.join(appRoot, 'data/questions/index.json');
const reportPath = path.join(appRoot, 'reports/pacto-sao-jose-question-bank-report.json');
const readJson = (file) => fs.readFile(file, 'utf8').then(JSON.parse);

test('Pacto de São José recebe 25 questões autorais equilibradas', async () => {
  const questions = await readJson(bankPath);
  assert.equal(questions.length, 25);
  assert.equal(new Set(questions.map((question) => question.id)).size, 25);
  assert.equal(new Set(questions.map((question) => question.metadata.hashQuestao)).size, 25);
  assert.equal(questions.filter((question) => question.respostaCorreta === 'C').length, 13);
  assert.equal(questions.filter((question) => question.respostaCorreta === 'E').length, 12);
});

test('questões do Pacto estão comentadas, revisadas e vinculadas à base legal', async () => {
  const questions = await readJson(bankPath);
  for (const question of questions) {
    assert.equal(question.disciplinaId, 'dh');
    assert.equal(question.topicoEditalId, 'dh_6');
    assert.equal(question.tipo, 'certo_errado');
    assert.equal(question.banca, 'CEBRASPE');
    assert.equal(question.status, 'revisada');
    assert.ok(question.enunciado.length >= 40);
    assert.ok(question.explicacao.length >= 40);
    assert.ok(question.metadata.baseLegal.length >= 8);
  }
});

test('índice e relatório registram o novo banco de Direitos Humanos', async () => {
  const [index, report] = await Promise.all([readJson(indexPath), readJson(reportPath)]);
  assert.equal(index.quantidade, index.disciplinas.reduce((total, item) => total + item.quantidade, 0));
  assert.equal(index.disciplinas.find((item) => item.id === 'dh')?.quantidade, 25);
  assert.equal(report.questoesAdicionadas, 25);
  assert.deepEqual(report.porGabarito, { C: 13, E: 12 });
  assert.deepEqual(report.sobreposicoesComBancoAnterior, []);
});
