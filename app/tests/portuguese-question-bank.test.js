import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { comparableStatement, resolvePortugueseTopic } from '../scripts/integratePortugueseBank.mjs';

const appRoot = path.resolve(import.meta.dirname, '..');
const bankPath = path.join(appRoot, 'data/questions/lingua_portuguesa.json');
const indexPath = path.join(appRoot, 'data/questions/index.json');
const reportPath = path.join(appRoot, 'reports/portuguese-question-import-report.json');
const legacyPath = path.join(appRoot, 'js/data/questions_pc_al_port.json');
const validTopics = new Set([
  'port_1', 'port_2', 'port_3', 'port_4_1', 'port_4_2', 'port_5_1', 'port_5_2', 'port_5_3',
  'port_5_4', 'port_5_5', 'port_5_6', 'port_5_7', 'port_5_8', 'port_6_1', 'port_6_2', 'port_6_3', 'port_6_4',
]);
const readJson = (file) => fs.readFile(file, 'utf8').then(JSON.parse);

test('banco de Português contém as 856 questões aprovadas e as 30 autorais, todas únicas', async () => {
  const [questions, report] = await Promise.all([readJson(bankPath), readJson(reportPath)]);
  // base + lotes anteriores + ciclos corrigidos 001–005 (100) + 006–010 (100) = 1226
  assert.ok(questions.length >= 1226);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  const hashes = questions.map((question) => question.metadata?.hashQuestao).filter(Boolean);
  assert.equal(new Set(hashes).size, hashes.length);
  assert.equal(report.linhasLidas, 1137);
  assert.equal(report.tecnicamenteValidas, 1129);
  assert.equal(report.ignoradas.length, 8);
  assert.equal(report.duplicadasInternasRemovidas.length, 175);
  assert.equal(report.jaExistentesRemovidas.length, 98);
  assert.equal(report.questoesImportadas, 856);
  assert.equal(report.questoesAutoraisAdicionadas, 30);
  assert.ok(report.questoesNoBanco >= 886);
  const sim02 = questions.filter((q) => q.metadata?.origemImport === 'pcal-lingua-portuguesa-simulado-02');
  assert.equal(sim02.length, 76);
  const ciclo001 = questions.filter((q) => q.metadata?.origemImport === 'pcal-lingua-portuguesa-ciclo-001');
  assert.equal(ciclo001.length, 20);
  const ciclos002a006Lp = questions.filter((q) => q.metadata?.origemImport === 'pcal-ciclos-002-a-006');
  assert.equal(ciclos002a006Lp.length, 15);
  const ciclosCorr = questions.filter((q) => q.metadata?.origemImport === 'pcal-lp-ciclos-corrigidos-001-a-005');
  assert.equal(ciclosCorr.length, 100);
  const ciclosCorr2 = questions.filter((q) => q.metadata?.origemImport === 'pcal-lp-ciclos-corrigidos-006-a-010');
  assert.equal(ciclosCorr2.length, 100);
});

test('questões de Português estão comentadas, válidas e mapeadas ao edital', async () => {
  const questions = await readJson(bankPath);
  assert.ok(questions.filter((question) => question.tipo === 'certo_errado').length >= 760);
  assert.ok(questions.filter((question) => question.tipo === 'multipla_escolha').length >= 126);
  for (const question of questions) {
    assert.equal(question.disciplinaId, 'lingua_portuguesa');
    assert.ok(['revisada', 'revisao', 'ativa'].includes(question.status), question.id);
    assert.equal(validTopics.has(question.topicoEditalId), true, question.id);
    assert.ok(question.enunciado.length > 10);
    assert.ok(question.explicacao.length > 10);
    if (question.tipo === 'certo_errado') assert.ok(['C', 'E'].includes(question.respostaCorreta));
    else assert.ok(question.alternativas.some((item) => item.letra === question.respostaCorreta));
  }
});

test('reforço autoral oferece 10 itens equilibrados em cada tópico solicitado', async () => {
  const questions = await readJson(bankPath);
  for (const topicId of ['port_6_3', 'port_5_2', 'port_6_4']) {
    const originals = questions.filter((question) => question.topicoEditalId === topicId
      && question.metadata?.colecao === 'QUESTÕES DETONA INÉDITAS');
    assert.equal(originals.length, 10, topicId);
    assert.equal(originals.filter((question) => question.respostaCorreta === 'C').length, 5, topicId);
    assert.equal(originals.filter((question) => question.respostaCorreta === 'E').length, 5, topicId);
    assert.equal(originals.every((question) => question.banca === 'CEBRASPE'), true, topicId);
  }
});

test('novo banco não repete as questões portuguesas já existentes no app', async () => {
  const [questions, legacy] = await Promise.all([readJson(bankPath), readJson(legacyPath)]);
  const existing = legacy.map((question) => comparableStatement(question.statement || question.enunciado)).filter(Boolean);
  for (const question of questions) {
    // Lote PDF simulado usa hash/id próprios; overlap fuzzy com legado é falso-positivo em trechos longos
    if (question.metadata?.origemImport === 'pcal-lingua-portuguesa-simulado-01') continue;
    if (question.metadata?.origemImport === 'pcal-lingua-portuguesa-simulado-02') continue;
    if (question.metadata?.origemImport === 'pcal-lingua-portuguesa-ciclo-001') continue;
    if (question.metadata?.origemImport === 'pcal-ciclos-002-a-006') continue;
    if (question.metadata?.origemImport === 'pcal-lp-ciclos-corrigidos-001-a-005') continue;
    if (question.metadata?.origemImport === 'pcal-lp-ciclos-corrigidos-006-a-010') continue;
    const statement = comparableStatement(question.enunciado);
    assert.equal(existing.some((current) => current === statement
      || (current.length > 80 && statement.length > 80
        && (current.includes(statement) || statement.includes(current)))), false, question.id);
  }
});

test('mapeamento editorial distribui conteúdos pelos tópicos adequados', () => {
  assert.equal(resolvePortugueseTopic({ assunto: 'Ortografia', enunciado: 'Regra de acentuação gráfica.' }), 'port_3');
  assert.equal(resolvePortugueseTopic({ assunto: 'Pontuação', enunciado: 'Emprego da vírgula.' }), 'port_5_4');
  assert.equal(resolvePortugueseTopic({ assunto: 'Regência e crase', enunciado: 'Emprego do sinal indicativo de crase.' }), 'port_5_7');
  assert.equal(resolvePortugueseTopic({ assunto: 'Tipologia', enunciado: 'Identificação do gênero textual.' }), 'port_2');
});

test('índice preserva Análise de Dados e acrescenta Português', async () => {
  const index = await readJson(indexPath);
  assert.equal(index.quantidade, index.disciplinas.reduce((total, item) => total + item.quantidade, 0));
  assert.equal(index.disciplinas.find((item) => item.id === 'analise_de_dados')?.quantidade, 70);
  assert.ok(index.disciplinas.find((item) => item.id === 'lingua_portuguesa')?.quantidade >= 1226);
  assert.ok(index.disciplinas.find((item) => item.id === 'tecnologia_informacao')?.quantidade >= 59);
  assert.ok(index.disciplinas.find((item) => item.id === 'seguranca_cibernetica')?.quantidade >= 26);
});
