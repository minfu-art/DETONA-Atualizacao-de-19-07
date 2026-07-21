import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isQuestionEligible, normalizeQuestion } from '../js/core/questionSchema.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const curatedPath = path.join(appRoot, 'data/questions/curated/detona_ineditas_analise_de_dados.json');
const pilotPath = path.join(appRoot, 'data/questions/curated/detona_piloto_25_xlsx.json');
const mergedPath = path.join(appRoot, 'data/questions/analise_de_dados.json');
const indexPath = path.join(appRoot, 'data/questions/index.json');
const expectedTopics = ['dados_1', 'dados_2', 'dados_3', 'dados_4', 'dados_5'];

const readJson = (file) => fs.readFile(file, 'utf8').then(JSON.parse);

test('coleção DETONA possui cinco questões inéditas em cada subtópico de Análise de Dados', async () => {
  const questions = await readJson(curatedPath);
  assert.equal(questions.length, 25);
  assert.equal(new Set(questions.map((question) => question.id)).size, 25);
  for (const topicId of expectedTopics) {
    assert.equal(questions.filter((question) => question.topicoEditalId === topicId).length, 5);
  }
});

test('questões DETONA são autorais, comentadas e elegíveis no formato CEBRASPE', async () => {
  const questions = await readJson(curatedPath);
  const forbidden = ['xp', 'nivel', 'estrelas', 'dominio', 'combo', 'respostaAluno', 'filaRevisao'];
  for (const question of questions) {
    assert.equal(question.fonte, 'QUESTÃO DETONA INÉDITA');
    assert.equal(question.banca, 'CEBRASPE');
    assert.equal(question.tipo, 'certo_errado');
    assert.ok(['C', 'E'].includes(question.respostaCorreta));
    assert.ok(question.enunciado.length > 40);
    assert.ok(question.explicacao.length > 40);
    assert.equal(question.metadata.autoral, true);
    assert.ok(isQuestionEligible(normalizeQuestion(question, {
      disciplina: 'dados', topicoEditalId: question.topicoEditalId, topicoEdital: question.subtopico,
    })));
    for (const field of forbidden) assert.equal(Object.hasOwn(question, field), false);
  }
});

test('planilha piloto acrescenta 25 questões inéditas, comentadas e sem colisões', async () => {
  const [pilot, original] = await Promise.all([readJson(pilotPath), readJson(curatedPath)]);
  const originalIds = new Set(original.map((question) => question.id));
  const originalStatements = new Set(original.map((question) => question.enunciado));
  assert.equal(pilot.length, 25);
  assert.equal(new Set(pilot.map((question) => question.id)).size, 25);
  assert.equal(new Set(pilot.map((question) => question.enunciado)).size, 25);
  assert.equal(pilot.filter((question) => question.respostaCorreta === 'C').length, 15);
  assert.equal(pilot.filter((question) => question.respostaCorreta === 'E').length, 10);
  for (const question of pilot) {
    assert.equal(originalIds.has(question.id), false);
    assert.equal(originalStatements.has(question.enunciado), false);
    assert.equal(question.topicoEditalId, 'dados_1');
    assert.equal(question.banca, 'CEBRASPE');
    assert.equal(question.tipo, 'certo_errado');
    assert.equal(question.fonte, 'QUESTÃO DETONA INÉDITA');
    assert.equal(question.metadata.autoral, true);
    assert.equal(question.metadata.statusOriginal, 'RASCUNHO_REVISAR');
    assert.ok(question.explicacao.length > 40);
    assert.ok(isQuestionEligible(normalizeQuestion(question, {
      disciplina: 'dados', topicoEditalId: question.topicoEditalId, topicoEdital: question.subtopico,
    })));
  }
});

test('pacote autoral está integrado ao banco e ao índice do jogo', async () => {
  const [curated, pilot, merged, index] = await Promise.all([
    readJson(curatedPath), readJson(pilotPath), readJson(mergedPath), readJson(indexPath),
  ]);
  const curatedIds = new Set([...curated, ...pilot].map((question) => question.id));
  assert.equal(merged.filter((question) => curatedIds.has(question.id)).length, 50);
  assert.equal(merged.length, 70);
  assert.equal(index.quantidade, index.disciplinas.reduce((total, item) => total + item.quantidade, 0));
  assert.equal(index.disciplinas.find((item) => item.id === 'analise_de_dados')?.quantidade, 70);
});
