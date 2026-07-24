import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  aliased, buildQuestion, discoverWorkbooks, findDuplicateGroups, importQuestionBanks,
  isEditoriallyAllowed, parseArgs, readXlsx, rowsToObjects, validateQuestion,
} from '../scripts/importQuestionBanks.mjs';
import { createQuestionRepository } from '../js/repositories/questionRepository.js';
import { createQuestionService, normalizarQuestao } from '../js/services/questionService.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const inputDir = path.join(appRoot, 'imports/questions');
const analysisFile = path.join(inputDir, 'DETONA_BANCO_ANALISE_DE_DADOS_AULAS_00_A_10.xlsx');
const tempRoot = path.join(os.tmpdir(), `detona-question-import-${process.pid}`);
let workbook; let imported;

before(async () => {
  workbook = await readXlsx(analysisFile);
  imported = await importQuestionBanks({
    appRoot, inputDir, outputDir: path.join(tempRoot, 'data/questions'),
    reportPath: path.join(tempRoot, 'reports/report.json'), discipline: 'analise_de_dados', limit: 20, includeExtraida: true,
  });
});

after(async () => { await fs.rm(tempRoot, { recursive: true, force: true }); });

test('descobre automaticamente todos os arquivos XLSX', async () => {
  const files = await discoverWorkbooks(inputDir);
  assert.ok(files.length > 0); assert.ok(files.every((file) => file.endsWith('.xlsx')));
});

test('lê a aba QUESTOES', () => { assert.equal(workbook.QUESTOES[0][0], 'id_questao'); assert.equal(workbook.QUESTOES.length, 801); });
test('lê a aba COMENTARIOS', () => { assert.equal(workbook.COMENTARIOS[0][0], 'id_questao'); assert.equal(workbook.COMENTARIOS.length, 801); });

test('relaciona comentário pelo id_questao', () => {
  const rows = rowsToObjects(workbook.QUESTOES); const comments = rowsToObjects(workbook.COMENTARIOS);
  const byId = new Map(comments.map((row) => [aliased(row, 'id'), row]));
  const question = buildQuestion(rows[0], byId.get(aliased(rows[0], 'id')));
  assert.equal(question.id, 'PCAL-AD-00-S01-001'); assert.match(question.explicacao, /Dados estruturados/);
});

test('aliases aceitam cabeçalhos equivalentes', () => {
  assert.equal(aliased({ assunto: 'A' }, 'assunto'), 'A');
  assert.equal(aliased({ secao_banca: 'B' }, 'subtopico'), 'B');
  assert.equal(aliased({ gabarito: 'C' }, 'gabarito'), 'C');
  assert.equal(aliased({ banca_informada: 'CEBRASPE' }, 'banca'), 'CEBRASPE');
  assert.equal(aliased({ explicacao_original_apostila: 'D' }, 'explicacao'), 'D');
});

test('exclui REJEITADA e REJEITADO', () => {
  assert.equal(isEditoriallyAllowed({ id: '1', status: 'REJEITADA' }).allowed, false);
  assert.equal(isEditoriallyAllowed({ id: '2', status: 'REJEITADO' }).allowed, false);
});

test('bloqueia IDs presentes em PENDENCIAS', () => {
  assert.deepEqual(isEditoriallyAllowed({ id: 'q1', status: 'REVISADA', pendingIds: new Set(['q1']) }), { allowed: false, reason: 'pendencia' });
});

test('modo de desenvolvimento permite EXTRAIDA somente com flag', () => {
  assert.equal(isEditoriallyAllowed({ id: '1', status: 'EXTRAIDA', includeExtraida: true }).allowed, true);
  assert.equal(isEditoriallyAllowed({ id: '1', status: 'EXTRAIDA' }).allowed, false);
});

test('produção aceita somente REVISADA', () => {
  assert.equal(isEditoriallyAllowed({ id: '1', status: 'REVISADA', production: true }).allowed, true);
  assert.equal(isEditoriallyAllowed({ id: '2', status: 'EXTRAIDA', production: true, includeExtraida: true }).allowed, false);
});

test('detecta ID duplicado', () => { assert.deepEqual(findDuplicateGroups([{ id: 'q' }, { id: 'q' }]).ids, [{ id: 'q', ocorrencias: 2 }]); });
test('detecta hash duplicado', () => { assert.deepEqual(findDuplicateGroups([{ id: '1', hashQuestao: 'h' }, { id: '2', hashQuestao: 'h' }]).hashes[0].ids, ['1', '2']); });

test('rejeita enunciado vazio', () => {
  assert.ok(validateQuestion({ tipo: 'certo_errado', enunciado: '', respostaCorreta: 'C', alternativas: [] }).includes('enunciado_vazio'));
});

test('rejeita gabarito C/E inválido', () => {
  assert.ok(validateQuestion({ tipo: 'certo_errado', enunciado: 'x', respostaCorreta: 'A', alternativas: [] }).includes('gabarito_invalido'));
});

test('certo/errado exige alternativas vazias', () => {
  assert.ok(validateQuestion({ tipo: 'certo_errado', enunciado: 'x', respostaCorreta: 'C', alternativas: [{ letra: 'A', texto: 'x' }] }).includes('alternativas_invalidas'));
});

test('rejeita alternativa correta inexistente', () => {
  const errors = validateQuestion({ tipo: 'multipla_escolha', enunciado: 'x', respostaCorreta: 'C', alternativas: [{ letra: 'A', texto: 'a' }, { letra: 'B', texto: 'b' }] });
  assert.ok(errors.includes('gabarito_invalido'));
});

test('rejeita textos de alternativas duplicados', () => {
  const errors = validateQuestion({ tipo: 'multipla_escolha', enunciado: 'x', respostaCorreta: 'A', alternativas: [{ letra: 'A', texto: 'igual' }, { letra: 'B', texto: 'igual' }] });
  assert.ok(errors.includes('alternativas_duplicadas'));
});

test('preserva comentário separado por alternativa', () => {
  const question = buildQuestion({ id_questao: 'q', disciplina: 'X', tipo: 'multipla_escolha', enunciado: 'x', alternativa_a: 'a', alternativa_b: 'b', gabarito: 'A' }, { comentario_a: 'comentário A' });
  assert.equal(question.alternativas[0].comentario, 'comentário A');
});

test('preserva código e quebras de linha como texto', () => {
  const code = 'for x in dados:\n    print(x)\n<item>{"a": 1}</item>';
  const question = buildQuestion({ id_questao: 'q', disciplina: 'X', tipo: 'certo_errado', enunciado: code, gabarito: 'C' }, {});
  assert.equal(question.enunciado, code);
});

test('gera index.json com contagens e hash', async () => {
  const index = JSON.parse(await fs.readFile(imported.indexPath, 'utf8'));
  assert.equal(index.quantidade, 20); assert.equal(index.disciplinas[0].quantidade, 20); assert.match(index.disciplinas[0].hash, /^[a-f0-9]{64}$/);
});

test('gera relatório de importação auditável', async () => {
  const report = JSON.parse(await fs.readFile(imported.reportPath, 'utf8'));
  const discovered = await discoverWorkbooks(inputDir);
  assert.equal(report.questoesImportadas, 20); assert.equal(report.arquivosProcessados.length, discovered.length); assert.ok(report.linhasLidas > 5000);
});

test('amostra contém 20 questões revisadas, comentadas e sem pendência', () => {
  assert.equal(imported.questions.length, 20);
  assert.ok(imported.questions.every((question) => question.status === 'revisada' && question.explicacao));
  assert.ok(imported.questions.every((question) => !imported.report.questoesPendentes.includes(question.id)));
});

test('argumentos mantêm produção restrita', () => {
  assert.deepEqual(parseArgs(['--production']), { production: true, includeExtraida: false });
  assert.deepEqual(parseArgs(['--limit=20', '--discipline=analise_de_dados', '--include-extraida']), { production: false, includeExtraida: true, limit: 20, discipline: 'analise_de_dados' });
});

function fakeRepository(mode = 'hybrid') {
  const legacy = [{ id: 'legacy', disciplina: 'dados', assunto: 'Antigo' }, { id: 'same', source: 'legacy' }, { id: 'stored-json', questionSource: 'json' }];
  const json = [{ id: 'json', disciplinaId: 'analise_de_dados', assunto: 'Novo' }, { id: 'same', source: 'json' }];
  const index = { disciplinas: [{ id: 'analise_de_dados', arquivo: './data/questions/analise_de_dados.json' }] };
  const fetchImpl = async (url) => ({ ok: true, json: async () => url.endsWith('index.json') ? index : json });
  return createQuestionRepository({ fetchImpl, legacyLoader: async () => legacy, modeLoader: () => mode });
}

test('questionRepository carrega índice e disciplina', async () => {
  const repository = fakeRepository('json'); assert.equal((await repository.carregarIndice()).disciplinas.length, 1);
  assert.equal((await repository.carregarDisciplina('analise_de_dados')).length, 2);
});

test('questionRepository filtra disciplina e assunto', async () => {
  const repository = fakeRepository('json'); assert.equal((await repository.filtrarPorDisciplina('analise_de_dados')).length, 1);
  assert.equal((await repository.filtrarPorAssunto('Novo')).length, 1);
});

test('seleção aleatória sem repetição respeita IDs excluídos', async () => {
  const result = await fakeRepository('hybrid').selecionarSemRepeticao(10, {}, ['legacy']);
  assert.equal(new Set(result.map((item) => item.id)).size, result.length); assert.ok(!result.some((item) => item.id === 'legacy'));
});

test('modo legacy retorna somente questões antigas', async () => { assert.deepEqual((await fakeRepository('legacy').listar()).map((item) => item.id), ['legacy', 'same']); });
test('modo json retorna somente questões novas', async () => { assert.deepEqual((await fakeRepository('json').listar()).map((item) => item.id), ['json', 'same']); });

test('modo hybrid preserva antigas e impede ID repetido', async () => {
  const result = await fakeRepository('hybrid').listar(); assert.deepEqual(result.map((item) => item.id), ['legacy', 'same', 'json']);
  assert.equal(result.find((item) => item.id === 'same').source, 'legacy');
});

test('questionService normaliza sem mutar a origem', () => {
  const source = imported.questions[0]; const snapshot = structuredClone(source); const normalized = normalizarQuestao(source);
  assert.deepEqual(source, snapshot); assert.equal(normalized.subtopic_id, 'dados_1'); assert.equal(normalized.disciplina, 'dados');
});

test('questionService valida resposta e retorna explicação', async () => {
  const source = imported.questions[0];
  const service = createQuestionService({ listar: async () => [source], buscarPorId: async () => source });
  assert.equal(service.validarResposta(source, source.respostaCorreta), true);
  assert.equal(service.obterExplicacao(source).explicacao, source.explicacao);
});

test('conteúdo JSON não armazena progresso ou gamificação', () => {
  const forbidden = ['respostaAluno', 'acerto', 'confianca', 'tempoResposta', 'filaRevisao', 'xp', 'nivel', 'estrelas', 'dominio', 'combo', 'historico'];
  assert.ok(imported.questions.every((question) => forbidden.every((field) => !(field in question))));
});
