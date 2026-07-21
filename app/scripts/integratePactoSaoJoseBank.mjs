import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DISCIPLINE_ID = 'dh';
const TOPIC_ID = 'dh_6';
const SOURCE_FILE = 'detona_ineditas_pacto_sao_jose.json';

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const countBy = (items, field) => Object.fromEntries(
  [...Map.groupBy(items, (item) => item[field]).entries()].map(([key, values]) => [key, values.length]),
);

export async function integratePactoSaoJoseBank(options = {}) {
  const appRoot = path.resolve(options.appRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const sourcePath = path.resolve(options.sourcePath
    || path.join(appRoot, 'data', 'questions', 'curated', SOURCE_FILE));
  const indexPath = path.resolve(options.indexPath || path.join(appRoot, 'data', 'questions', 'index.json'));
  const reportPath = path.resolve(options.reportPath
    || path.join(appRoot, 'reports', 'pacto-sao-jose-question-bank-report.json'));
  const legacyPath = path.resolve(options.legacyPath || path.join(appRoot, 'js', 'data', 'questions_pc_al_lote.json'));

  const serialized = await fs.readFile(sourcePath, 'utf8');
  const questions = JSON.parse(serialized);
  const ids = new Set();
  const hashes = new Set();
  const statements = new Set();
  const errors = [];

  questions.forEach((question, index) => {
    const label = question.id || `#${index + 1}`;
    if (question.disciplinaId !== DISCIPLINE_ID) errors.push(`${label}: disciplina inválida`);
    if (question.topicoEditalId !== TOPIC_ID) errors.push(`${label}: tópico inválido`);
    if (question.tipo !== 'certo_errado') errors.push(`${label}: formato inválido`);
    if (!['C', 'E'].includes(question.respostaCorreta)) errors.push(`${label}: gabarito inválido`);
    if (question.banca !== 'CEBRASPE') errors.push(`${label}: banca inválida`);
    if (question.status !== 'revisada') errors.push(`${label}: status inválido`);
    if (String(question.enunciado || '').length < 40) errors.push(`${label}: enunciado curto`);
    if (String(question.explicacao || '').length < 40) errors.push(`${label}: explicação curta`);
    if (!question.metadata?.baseLegal) errors.push(`${label}: base legal ausente`);
    if (ids.has(question.id)) errors.push(`${label}: id duplicado`);
    if (hashes.has(question.metadata?.hashQuestao)) errors.push(`${label}: hash duplicado`);
    const statement = normalize(question.enunciado);
    if (statements.has(statement)) errors.push(`${label}: enunciado duplicado`);
    ids.add(question.id);
    hashes.add(question.metadata?.hashQuestao);
    statements.add(statement);
  });

  if (questions.length !== 25) errors.push(`quantidade inválida: ${questions.length}`);
  if (questions.filter((question) => question.respostaCorreta === 'C').length !== 13) errors.push('distribuição de itens certos inválida');
  if (questions.filter((question) => question.respostaCorreta === 'E').length !== 12) errors.push('distribuição de itens errados inválida');

  const legacy = JSON.parse(await fs.readFile(legacyPath, 'utf8'));
  const legacyStatements = new Set(legacy.map((question) => normalize(question.statement || question.enunciado)).filter(Boolean));
  const overlaps = questions.filter((question) => legacyStatements.has(normalize(question.enunciado))).map((question) => question.id);
  if (overlaps.length) errors.push(`enunciados já existentes: ${overlaps.join(', ')}`);
  if (errors.length) throw new Error(`Lote do Pacto de São José inválido:\n${errors.join('\n')}`);

  const currentIndex = JSON.parse(await fs.readFile(indexPath, 'utf8'));
  const entry = {
    id: DISCIPLINE_ID,
    arquivo: './data/questions/curated/detona_ineditas_pacto_sao_jose.json',
    quantidade: questions.length,
    porTipo: countBy(questions, 'tipo'),
    porBanca: countBy(questions, 'banca'),
    hash: createHash('sha256').update(serialized).digest('hex'),
    versao: 1,
  };
  const disciplinas = (currentIndex.disciplinas || []).filter((item) => item.id !== DISCIPLINE_ID);
  disciplinas.push(entry);
  const index = {
    ...currentIndex,
    geradoEm: new Date().toISOString(),
    disciplinas,
    quantidade: disciplinas.reduce((total, item) => total + Number(item.quantidade || 0), 0),
  };
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  const report = {
    geradoEm: new Date().toISOString(),
    arquivo: SOURCE_FILE,
    topicoEditalId: TOPIC_ID,
    questoesAdicionadas: questions.length,
    porGabarito: countBy(questions, 'respostaCorreta'),
    porDificuldade: countBy(questions, 'dificuldade'),
    referencias: [...new Set(questions.map((question) => question.metadata.baseLegal))],
    sobreposicoesComBancoAnterior: overlaps,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { questions, index, report, sourcePath, indexPath, reportPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()) {
  integratePactoSaoJoseBank().then(({ questions, sourcePath }) => {
    console.log(`Pacto de São José integrado: ${questions.length} questões.`);
    console.log(`Banco: ${sourcePath}`);
  }).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
