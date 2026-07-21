import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  aliased,
  buildQuestion,
  isEditoriallyAllowed,
  readXlsx,
  rowsToObjects,
  validateQuestion,
} from './importQuestionBanks.mjs';

const SOURCE_FILE = 'DETONA_BANCO_LINGUA_PORTUGUESA_AULAS_00_A_11.xlsx';
const CURATED_FILE = 'detona_ineditas_portugues_reforco.json';
const PORTUGUESE_DISCIPLINE = 'lingua_portuguesa';

const cleanText = (value) => String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
const fold = (value) => cleanText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export function comparableStatement(value) {
  return fold(value)
    .replace(/^\s*\d+[.)-]?\s*/, '')
    .replace(/^\([^)]{0,120}\)\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesAny(value, pattern) {
  return pattern.test(value);
}

export function resolvePortugueseTopic(question) {
  const detail = fold(`${question.subtopico || ''} ${question.enunciado || ''}`);
  const subject = fold(question.assunto || '');

  if (matchesAny(detail, /tipologia|tipo textual|genero textual/)) return 'port_2';
  if (matchesAny(detail, /interpretacao|compreensao de texto/)) return 'port_1';
  if (matchesAny(detail, /ortografi|acentua|hifen|grafia|maiuscul|minuscul|sigla|abreviac/)) return 'port_3';
  if (matchesAny(detail, /pontuacao|virgula|ponto e virgula|dois-pontos|travessao/)) return 'port_5_4';
  if (matchesAny(detail, /concordancia/)) return 'port_5_5';
  if (matchesAny(detail, /crase|sinal indicativo/)) return 'port_5_7';
  if (matchesAny(detail, /regencia|transitiv|complemento nominal/)) return 'port_5_6';
  if (matchesAny(detail, /colocacao pronominal|pronome atono|proclise|mesoclise|enclise/)) return 'port_5_8';
  if (matchesAny(detail, /coordenac|coordenad|conjuncoes coordenativas/)) return 'port_5_2';
  if (matchesAny(detail, /subordinac|subordinad/)) return 'port_5_3';
  if (matchesAny(detail, /tempo verbal|modo verbal|voz verbal|vozes verbais/)) return 'port_4_2';
  if (matchesAny(detail, /substituic/)) return 'port_6_2';
  if (matchesAny(detail, /reorganizac|reestruturacao sintatica/)) return 'port_6_3';
  if (matchesAny(detail, /reescrita|parafrase|formalidade/)) return 'port_6_4';
  if (matchesAny(detail, /semantica|sentido|signific|sinonim|antonim|polissem|ambiguidade/)) return 'port_6_1';
  if (matchesAny(detail, /coesao|conectiv|referenci|sequenciacao|conjuncoes/)) return 'port_4_1';
  if (matchesAny(detail, /classes de palavras|substantiv|adjetiv|adverb|artigo|numeral|interjeic|preposic|pronome/)) return 'port_5_1';

  if (subject === 'ortografia') return 'port_3';
  if (subject.includes('classes de palavras')) return 'port_5_1';
  if (subject.includes('conectivos')) return 'port_4_1';
  if (subject.includes('tempos, modos e vozes verbais')) return 'port_4_2';
  if (subject.startsWith('sintaxe:')) return 'port_5_3';
  if (subject === 'pontuacao') return 'port_5_4';
  if (subject.startsWith('concordancia')) return 'port_5_5';
  if (subject.startsWith('regencia')) return 'port_5_6';
  if (subject.startsWith('semantica')) return 'port_6_1';
  if (subject.startsWith('tipologia')) return 'port_1';
  return 'port_1';
}

function overlapsExisting(statement, existingStatements) {
  const comparable = comparableStatement(statement);
  if (!comparable) return false;
  return existingStatements.some((existing) => existing === comparable
    || (existing.length > 80 && comparable.length > 80
      && (existing.includes(comparable) || comparable.includes(existing))));
}

function countBy(items, getter) {
  return Object.fromEntries([...Map.groupBy(items, getter).entries()]
    .map(([key, values]) => [String(key || '(vazio)'), values.length])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')));
}

export async function integratePortugueseBank(options = {}) {
  const appRoot = path.resolve(options.appRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const sourcePath = path.resolve(options.sourcePath || path.join(appRoot, 'imports', 'questions', SOURCE_FILE));
  const outputPath = path.resolve(options.outputPath || path.join(appRoot, 'data', 'questions', `${PORTUGUESE_DISCIPLINE}.json`));
  const indexPath = path.resolve(options.indexPath || path.join(appRoot, 'data', 'questions', 'index.json'));
  const reportPath = path.resolve(options.reportPath || path.join(appRoot, 'reports', 'portuguese-question-import-report.json'));
  const legacyPath = path.resolve(options.legacyPath || path.join(appRoot, 'js', 'data', 'questions_pc_al_port.json'));
  const curatedPath = path.resolve(options.curatedPath || path.join(appRoot, 'data', 'questions', 'curated', CURATED_FILE));

  const sheets = await readXlsx(sourcePath);
  const questionRows = rowsToObjects(sheets.QUESTOES || []);
  const commentRows = rowsToObjects(sheets.COMENTARIOS || []);
  const pendingRows = rowsToObjects(sheets.PENDENCIAS || []);
  const comments = new Map(commentRows.map((row) => [cleanText(aliased(row, 'id')), row]));
  const pendingIds = new Set(pendingRows.map((row) => cleanText(aliased(row, 'id'))).filter(Boolean));

  const valid = [];
  const ignored = [];
  for (const row of questionRows) {
    const id = cleanText(aliased(row, 'id'));
    const editorial = isEditoriallyAllowed({
      status: aliased(row, 'status'), id, pendingIds, production: true,
    });
    if (!editorial.allowed) { ignored.push({ id, reason: editorial.reason }); continue; }
    const question = buildQuestion(row, comments.get(id));
    const errors = validateQuestion(question);
    if (!question.explicacao) errors.push('comentario_vazio');
    if (errors.length) { ignored.push({ id, reason: errors.join(',') }); continue; }
    valid.push({ question, row });
  }

  const seenHashes = new Set();
  const uniqueInternal = [];
  const internalDuplicates = [];
  for (const item of valid) {
    const hash = item.question.hashQuestao || comparableStatement(item.question.enunciado);
    if (seenHashes.has(hash)) { internalDuplicates.push(item.question.id); continue; }
    seenHashes.add(hash);
    uniqueInternal.push(item);
  }

  const legacyPayload = JSON.parse(await fs.readFile(legacyPath, 'utf8'));
  const existingStatements = legacyPayload
    .map((question) => comparableStatement(question.statement || question.enunciado))
    .filter(Boolean);
  const legacyOverlaps = [];
  const selected = [];
  for (const { question, row } of uniqueInternal) {
    if (overlapsExisting(question.enunciado, existingStatements)) {
      legacyOverlaps.push(question.id);
      continue;
    }
    const topicoEditalId = resolvePortugueseTopic(question);
    const { hashQuestao, ...cleanQuestion } = question;
    selected.push({
      ...cleanQuestion,
      topicoEditalId,
      banca: cleanQuestion.banca || 'Não informada',
      fonte: 'Banco editorial XLSX',
      dificuldade: cleanText(row.dificuldade),
      metadata: {
        origemArquivo: SOURCE_FILE,
        aula: cleanText(row.aula).padStart(2, '0'),
        hashQuestao,
        revisado: true,
      },
    });
  }

  const curated = JSON.parse(await fs.readFile(curatedPath, 'utf8'));
  for (const question of curated) {
    if (question.disciplinaId !== PORTUGUESE_DISCIPLINE
      || question.tipo !== 'certo_errado'
      || !['C', 'E'].includes(question.respostaCorreta)
      || !question.topicoEditalId
      || cleanText(question.enunciado).length <= 10
      || cleanText(question.explicacao).length <= 10) {
      throw new Error(`Questão autoral inválida: ${question.id || '(sem id)'}`);
    }
  }
  const combined = [...selected, ...curated];
  const uniqueIds = new Set(combined.map((question) => question.id));
  const uniqueHashes = new Set(combined.map((question) => question.metadata?.hashQuestao));
  const existingStatementsSet = new Set(selected.map((question) => comparableStatement(question.enunciado)));
  const curatedStatements = curated.map((question) => comparableStatement(question.enunciado));
  if (uniqueIds.size !== combined.length
    || uniqueHashes.size !== combined.length
    || new Set(curatedStatements).size !== curated.length
    || curatedStatements.some((statement) => existingStatementsSet.has(statement))) {
    throw new Error('As questões autorais contêm identificadores, hashes ou enunciados duplicados.');
  }

  const serialized = `${JSON.stringify(combined, null, 2)}\n`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized, 'utf8');

  let currentIndex = { versao: 1, disciplinas: [] };
  try { currentIndex = JSON.parse(await fs.readFile(indexPath, 'utf8')); } catch { /* first index */ }
  const entry = {
    id: PORTUGUESE_DISCIPLINE,
    arquivo: `./data/questions/${PORTUGUESE_DISCIPLINE}.json`,
    quantidade: combined.length,
    porTipo: countBy(combined, (question) => question.tipo),
    porBanca: countBy(combined, (question) => question.banca),
    hash: createHash('sha256').update(serialized).digest('hex'),
    versao: 1,
  };
  const disciplinas = (currentIndex.disciplinas || []).filter((item) => item.id !== PORTUGUESE_DISCIPLINE);
  disciplinas.push(entry);
  const index = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    disciplinas,
    quantidade: disciplinas.reduce((total, item) => total + Number(item.quantidade || 0), 0),
  };
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  const report = {
    geradoEm: new Date().toISOString(),
    arquivo: SOURCE_FILE,
    linhasLidas: questionRows.length,
    tecnicamenteValidas: valid.length,
    ignoradas: ignored,
    duplicadasInternasRemovidas: internalDuplicates,
    jaExistentesRemovidas: legacyOverlaps,
    questoesImportadas: selected.length,
    questoesAutoraisAdicionadas: curated.length,
    questoesNoBanco: combined.length,
    porTopico: countBy(combined, (question) => question.topicoEditalId),
    porTipo: countBy(combined, (question) => question.tipo),
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { questions: combined, index, report, outputPath, indexPath, reportPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()) {
  integratePortugueseBank().then(({ report, outputPath }) => {
    console.log(`Integração de Português concluída: ${report.questoesNoBanco} questões no banco.`);
    console.log(`Banco: ${outputPath}`);
  }).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
