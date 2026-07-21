import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HEADER_ALIASES = Object.freeze({
  id: ['id_questao', 'id', 'question_id'], hash: ['hash_questao', 'hash'],
  concurso: ['concurso', 'concurso_id'], cargo: ['cargo', 'cargos', 'cargo_id'],
  disciplina: ['disciplina', 'materia'], assunto: ['assunto_aula', 'assunto'],
  subtopico: ['secao_material', 'secao_banca', 'subtopico'], fonte: ['fonte_questao', 'fonte_prova', 'fonte'],
  gabarito: ['gabarito_normalizado', 'gabarito'], status: ['status_extracao', 'status_revisao', 'status'],
  enunciado: ['enunciado_completo', 'enunciado'], tipo: ['tipo', 'formato'], banca: ['banca', 'banca_informada'], ano: ['ano'],
  explicacao: ['comentario_integral_apostila', 'explicacao_original_apostila', 'explicacao'],
  contexto: ['contexto_compartilhado', 'contexto'],
});

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const cleanHeader = (value) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const slug = (value) => cleanHeader(value) || 'sem_disciplina';
const cellText = (value) => value == null ? '' : String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
const xmlDecode = (value) => String(value ?? '').replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&([a-z]+);/gi, (match, name) => XML_ENTITIES[name] ?? match);

function zipEntries(buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65558); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('XLSX inválido: diretório ZIP não encontrado.');
  const count = buffer.readUInt16LE(eocd + 10); let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('XLSX inválido: entrada ZIP corrompida.');
    const method = buffer.readUInt16LE(cursor + 10); const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28); const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32); const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replace(/\\/g, '/');
    const localNameLength = buffer.readUInt16LE(localOffset + 26); const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength; const compressed = buffer.subarray(start, start + size);
    entries.set(name, method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function columnIndex(reference) {
  const letters = String(reference).match(/[A-Z]+/i)?.[0] || 'A';
  return [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function textNodes(xml) {
  return [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => xmlDecode(match[1])).join('');
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of String(xml).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const match of rowMatch[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = match[1]; const body = match[2] || ''; const reference = attrs.match(/\br="([^"]+)"/)?.[1] || 'A1';
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]; const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = sharedStrings[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textNodes(body);
      else if (type === 'b') value = raw === '1';
      else if (type === 'str') value = xmlDecode(raw ?? '');
      else if (body.includes('<f')) value = raw == null ? `=${xmlDecode(body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1] || '')}` : xmlDecode(raw);
      else if (raw != null) value = Number.isFinite(Number(raw)) && raw !== '' ? Number(raw) : xmlDecode(raw);
      row[columnIndex(reference)] = value;
    }
    rows.push(row);
  }
  return rows;
}

export async function readXlsx(filePath) {
  const entries = zipEntries(await fs.readFile(filePath));
  const shared = entries.get('xl/sharedStrings.xml') ? [...entries.get('xl/sharedStrings.xml').toString('utf8').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => textNodes(match[1])) : [];
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const rels = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const targets = new Map([...rels.matchAll(/<Relationship\s([^>]+?)\/?>(?:<\/Relationship>)?/g)].map((match) => {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1]; const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
    return [id, target?.replace(/^\/?xl\//, '')];
  }));
  const sheets = {};
  for (const match of workbook.matchAll(/<sheet\s([^>]+?)\/?>(?:<\/sheet>)?/g)) {
    const name = xmlDecode(match[1].match(/\bname="([^"]+)"/)?.[1] || ''); const relId = match[1].match(/\br:id="([^"]+)"/)?.[1];
    const target = targets.get(relId); const data = target && entries.get(`xl/${target}`);
    if (name && data) sheets[name] = parseSheet(data.toString('utf8'), shared);
  }
  return sheets;
}

export function rowsToObjects(rows = []) {
  const headers = (rows[0] || []).map(cleanHeader);
  return rows.slice(1).filter((row) => row.some((value) => value !== '' && value != null)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]]).filter(([header]) => header)));
}

export function aliased(row, field) {
  for (const alias of HEADER_ALIASES[field] || [field]) if (row[cleanHeader(alias)] != null && row[cleanHeader(alias)] !== '') return row[cleanHeader(alias)];
  return '';
}

export function discoverWorkbooks(directory) {
  return fs.readdir(directory).then((names) => names.filter((name) => name.toLowerCase().endsWith('.xlsx')).sort().map((name) => path.join(directory, name)));
}

function canonicalDiscipline(value) {
  const key = slug(value);
  const aliases = { analise_de_dados: 'analise_de_dados', contabilidade: 'contabilidade', contabilidade_geral: 'contabilidade',
    tecnologia_da_informacao_crimes_ciberneticos: 'tecnologia_da_informacao_crimes_ciberneticos',
    estatutos_dos_servidores_de_alagoas: 'estatutos_dos_servidores_de_alagoas' };
  return aliases[key] || key;
}

export function validateQuestion(question) {
  const errors = [];
  if (!question.enunciado) errors.push('enunciado_vazio');
  if (question.tipo === 'certo_errado') {
    if (!['C', 'E'].includes(question.respostaCorreta)) errors.push('gabarito_invalido');
    if (question.alternativas.length) errors.push('alternativas_invalidas');
  } else if (question.tipo === 'multipla_escolha') {
    if (question.alternativas.length < 2 || question.alternativas.some((item) => !item.letra || !item.texto)) errors.push('alternativas_invalidas');
    if (!question.alternativas.some((item) => item.letra === question.respostaCorreta)) errors.push('gabarito_invalido');
    const texts = question.alternativas.map((item) => slug(item.texto));
    if (new Set(texts).size !== texts.length) errors.push('alternativas_duplicadas');
  } else errors.push('tipo_invalido');
  return errors;
}

const STATUS_REVISAR = new Set([
  'REVISAR', 'A_REVISAR', 'EM_REVISAO', 'PENDENTE', 'PENDENTE_REVISAO', 'REVISAO', 'PARA_REVISAR',
]);

export function isEditoriallyAllowed({ status, id, pendingIds = new Set(), production = false, includeExtraida = false }) {
  const normalized = slug(status).toUpperCase();
  if (pendingIds.has(String(id))) return { allowed: false, reason: 'pendencia' };
  if (normalized === 'REJEITADA' || normalized === 'REJEITADO') return { allowed: false, reason: 'rejeitada' };
  if (normalized === 'REVISADA') return { allowed: true };
  // "a revisar" entra no app como rascunho editorial (fora de production estrita)
  if (!production && STATUS_REVISAR.has(normalized)) return { allowed: true };
  if (!production && includeExtraida && (normalized === 'EXTRAIDA' || STATUS_REVISAR.has(normalized))) {
    return { allowed: true };
  }
  return { allowed: false, reason: `status_${normalized || 'vazio'}` };
}

export function editorialStatusToApp(status) {
  const normalized = slug(status).toUpperCase();
  if (normalized === 'REVISADA') return 'revisada';
  if (STATUS_REVISAR.has(normalized) || normalized === 'EXTRAIDA') return 'revisao';
  return 'revisada';
}

export function findDuplicateGroups(questions = []) {
  const ids = new Map(); const hashes = new Map();
  for (const question of questions) {
    if (!ids.has(question.id)) ids.set(question.id, []); ids.get(question.id).push(question);
    if (question.hashQuestao) { if (!hashes.has(question.hashQuestao)) hashes.set(question.hashQuestao, []); hashes.get(question.hashQuestao).push(question.id); }
  }
  return {
    ids: [...ids].filter(([, group]) => group.length > 1).map(([id, group]) => ({ id, ocorrencias: group.length })),
    hashes: [...hashes].filter(([, group]) => group.length > 1).map(([hash, group]) => ({ hash, ids: group })),
  };
}

export function buildQuestion(row, comment = {}) {
  const typeValue = slug(aliased(row, 'tipo'));
  const tipo = typeValue.includes('multipla') ? 'multipla_escolha' : 'certo_errado';
  const alternatives = tipo === 'multipla_escolha' ? ['A', 'B', 'C', 'D', 'E'].map((letter) => ({
    letra: letter, texto: cellText(row[`alternativa_${letter.toLowerCase()}`] ?? row[`alternativa_${letter}`]),
    comentario: cellText(comment[`comentario_${letter.toLowerCase()}`] ?? comment[`comentario_${letter}`]),
  })).filter((item) => item.texto) : [];
  const disciplinaId = canonicalDiscipline(aliased(row, 'disciplina'));
  const statusExcel = aliased(row, 'status');
  return {
    id: cellText(aliased(row, 'id')), concursoId: 'pc_al_2026', cargoId: 'agente_policia', disciplinaId,
    assunto: cellText(aliased(row, 'assunto')), subtopico: cellText(aliased(row, 'subtopico')),
    banca: cellText(aliased(row, 'banca')), ano: Number(aliased(row, 'ano')) || null, fonteProva: cellText(aliased(row, 'fonte')),
    tipo, enunciado: cellText(aliased(row, 'enunciado')), contextoCompartilhado: cellText(aliased(row, 'contexto')),
    alternativas: alternatives, respostaCorreta: cellText(aliased(row, 'gabarito')).toUpperCase().replace(/^(CERTO|CORRETO)$/, 'C').replace(/^ERRADO$/, 'E'),
    explicacao: cellText(aliased(comment, 'explicacao')), status: editorialStatusToApp(statusExcel), versao: 1,
    hashQuestao: cellText(aliased(row, 'hash')),
  };
}

function emptyReport(files) {
  return { geradoEm: new Date().toISOString(), arquivosEncontrados: files.map((file) => path.basename(file)), arquivosProcessados: [], linhasLidas: 0,
    questoesImportadas: 0, questoesIgnoradas: [], questoesPendentes: [], questoesRejeitadas: [], idsDuplicados: [], hashesDuplicados: [],
    gabaritosInvalidos: [], questoesSemEnunciado: [], questoesSemComentario: [], alternativasInvalidas: [], disciplinasGeradas: [], arquivosJsonCriados: [],
    questoesAutoraisIncluidas: 0, pacotesAutorais: [] };
}

async function loadCuratedQuestions(appRoot) {
  const directory = path.join(appRoot, 'data/questions/curated');
  let files = [];
  try { files = (await fs.readdir(directory)).filter((name) => name.toLowerCase().endsWith('.json')).sort(); } catch { return { files: [], questions: [] }; }
  const questions = [];
  for (const filename of files) {
    const payload = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'));
    if (!Array.isArray(payload)) throw new Error(`Pacote autoral inválido: ${filename}.`);
    for (const question of payload) {
      const errors = validateQuestion(question);
      if (errors.length) throw new Error(`Questão autoral ${question.id || 'sem_id'} inválida: ${errors.join(',')}.`);
      questions.push(structuredClone(question));
    }
  }
  return { files, questions };
}

export async function importQuestionBanks(options = {}) {
  const appRoot = path.resolve(options.appRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const inputDir = path.resolve(options.inputDir || path.join(appRoot, 'imports/questions'));
  const outputDir = path.resolve(options.outputDir || path.join(appRoot, 'data/questions'));
  const reportPath = path.resolve(options.reportPath || path.join(appRoot, 'reports/question-import-report.json'));
  const files = await discoverWorkbooks(inputDir); const report = emptyReport(files); const candidates = [];
  for (const file of files) {
    const sheets = await readXlsx(file); if (!sheets.QUESTOES) continue;
    const questionRows = rowsToObjects(sheets.QUESTOES); const commentRows = rowsToObjects(sheets.COMENTARIOS || []);
    const pendingRows = rowsToObjects(sheets.PENDENCIAS || []); const comments = new Map(commentRows.map((row) => [cellText(aliased(row, 'id')), row]));
    const pending = new Set(pendingRows.map((row) => cellText(aliased(row, 'id'))).filter(Boolean));
    report.arquivosProcessados.push(path.basename(file)); report.linhasLidas += questionRows.length;
    for (const row of questionRows) {
      const id = cellText(aliased(row, 'id')); const status = slug(aliased(row, 'status')).toUpperCase();
      if (!id) { report.questoesIgnoradas.push({ arquivo: path.basename(file), motivo: 'sem_id' }); continue; }
      const editorial = isEditoriallyAllowed({ status, id, pendingIds: pending, production: options.production, includeExtraida: options.includeExtraida });
      if (!editorial.allowed) {
        if (editorial.reason === 'pendencia') report.questoesPendentes.push(id);
        if (editorial.reason === 'rejeitada') report.questoesRejeitadas.push(id);
        report.questoesIgnoradas.push({ id, motivo: editorial.reason }); continue;
      }
      const question = buildQuestion(row, comments.get(id));
      if (options.discipline && question.disciplinaId !== canonicalDiscipline(options.discipline)) continue;
      candidates.push(question);
    }
  }
  const duplicates = findDuplicateGroups(candidates);
  report.idsDuplicados = duplicates.ids; report.hashesDuplicados = duplicates.hashes;
  const seen = new Set(); const valid = [];
  for (const question of candidates) {
    if (seen.has(question.id)) { report.questoesIgnoradas.push({ id: question.id, motivo: 'id_duplicado_reportado' }); continue; }
    seen.add(question.id); const errors = validateQuestion(question);
    if (errors.includes('enunciado_vazio')) report.questoesSemEnunciado.push(question.id);
    if (errors.includes('gabarito_invalido')) report.gabaritosInvalidos.push(question.id);
    if (errors.some((error) => error.startsWith('alternativas_'))) report.alternativasInvalidas.push({ id: question.id, erros: errors });
    if (!question.explicacao) report.questoesSemComentario.push(question.id);
    if (errors.length) { report.questoesIgnoradas.push({ id: question.id, motivo: errors.join(',') }); continue; }
    valid.push(question);
  }
  const limited = Number.isFinite(options.limit) ? valid.slice(0, Math.max(0, options.limit)) : valid;
  const defaultOutputDir = path.resolve(path.join(appRoot, 'data/questions'));
  const includeCurated = options.includeCurated ?? outputDir === defaultOutputDir;
  const curated = includeCurated ? await loadCuratedQuestions(appRoot) : { files: [], questions: [] };
  const merged = new Map(limited.map((question) => [String(question.id), question]));
  for (const question of curated.questions) {
    if (merged.has(String(question.id))) throw new Error(`ID autoral duplicado: ${question.id}.`);
    merged.set(String(question.id), question);
  }
  const selected = [...merged.values()];
  report.questoesAutoraisIncluidas = curated.questions.length;
  report.pacotesAutorais = curated.files;
  const groups = Map.groupBy(selected, (question) => question.disciplinaId); await fs.mkdir(outputDir, { recursive: true });
  const disciplinas = [];
  for (const [id, questions] of groups) {
    const clean = questions.map(({ hashQuestao, ...question }) => question); const filename = `${id}.json`; const target = path.join(outputDir, filename);
    const serialized = `${JSON.stringify(clean, null, 2)}\n`; await fs.writeFile(target, serialized, 'utf8');
    const by = (field) => Object.fromEntries([...Map.groupBy(clean, (item) => String(item[field] ?? '')).entries()].map(([key, items]) => [key, items.length]));
    disciplinas.push({ id, arquivo: `./data/questions/${filename}`, quantidade: clean.length, porTipo: by('tipo'), porBanca: by('banca'),
      hash: createHash('sha256').update(serialized).digest('hex'), versao: 1 });
    report.arquivosJsonCriados.push(target);
  }
  const index = { versao: 1, geradoEm: new Date().toISOString(), disciplinas, quantidade: selected.length };
  const indexPath = path.join(outputDir, 'index.json'); await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  report.questoesImportadas = selected.length; report.disciplinasGeradas = disciplinas.map((item) => item.id); report.arquivosJsonCriados.push(indexPath);
  await fs.mkdir(path.dirname(reportPath), { recursive: true }); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { index, report, questions: selected, indexPath, reportPath };
}

export function parseArgs(args = process.argv.slice(2)) {
  const options = { production: false, includeExtraida: false };
  for (const arg of args) {
    if (arg === '--production') options.production = true;
    else if (arg === '--include-extraida') options.includeExtraida = true;
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
    else if (arg.startsWith('--discipline=')) options.discipline = arg.slice(13);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (options.production) options.includeExtraida = false;
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  importQuestionBanks(parseArgs()).then(({ report, indexPath, reportPath }) => {
    console.log(`Importação concluída: ${report.questoesImportadas} questão(ões).`);
    console.log(`Índice: ${indexPath}`); console.log(`Relatório: ${reportPath}`);
  }).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
