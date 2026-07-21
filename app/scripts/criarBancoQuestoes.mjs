/**
 * DETONA CONCURSOS — Criador automático de banco de questões (Excel)
 *
 * Converte arquivos JSON / CSV / TXT no formato DETONA (abas QUESTOES + COMENTARIOS)
 * e salva em imports/questions/ para o pipeline importQuestionBanks.mjs.
 *
 * Uso:
 *   node scripts/criarBancoQuestoes.mjs --from caminho/arquivo.json
 *   node scripts/criarBancoQuestoes.mjs --from pasta/com/arquivos --disciplina "Língua Portuguesa"
 *   node scripts/criarBancoQuestoes.mjs --from questoes.txt --disciplina "Direito Penal" --banca CEBRASPE --status REVISADA
 *   node scripts/criarBancoQuestoes.mjs --template --disciplina "Estatística"
 *
 * Opções:
 *   --from=PATH          Arquivo ou pasta (JSON, CSV, TXT)
 *   --out=PATH           Excel de saída (default: imports/questions/DETONA_BANCO_*.xlsx)
 *   --disciplina=NOME    Disciplina (obrigatória se o arquivo não tiver)
 *   --concurso=NOME      Default: PC-AL 2026
 *   --cargo=NOME         Default: Agente de Polícia
 *   --banca=NOME         Default: CEBRASPE
 *   --ano=YYYY           Default: ano atual
 *   --status=STATUS      EXTRAIDA | REVISADA | REJEITADA (default: REVISADA)
 *   --prefixo=ID         Prefixo dos IDs (default: gerado da disciplina)
 *   --template           Gera planilha vazia modelo
 *   --append             Acrescenta em Excel DETONA existente
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_IMPORTS = path.join(APP_ROOT, 'imports', 'questions');

const QUESTOES_HEADERS = [
  'id_questao', 'hash_questao', 'concurso', 'cargo', 'disciplina', 'assunto_aula',
  'secao_material', 'aula', 'numero_apostila', 'banca', 'ano', 'fonte_questao', 'tipo',
  'enunciado', 'alternativa_A', 'alternativa_B', 'alternativa_C', 'alternativa_D', 'alternativa_E',
  'gabarito_normalizado', 'gabarito_original', 'imagem_tabela_diagrama_referenciada',
  'duplicada', 'grupo_duplicata', 'ids_duplicados', 'status_extracao', 'observacoes_extracao',
  'arquivo_origem',
];

const COMENTARIOS_HEADERS = [
  'id_questao', 'comentario_integral_apostila',
  'comentario_A', 'comentario_B', 'comentario_C', 'comentario_D', 'comentario_E',
];

const HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
};

const CELL_STYLE = {
  font: { name: 'Arial', size: 10 },
  alignment: { vertical: 'top', wrapText: true },
};

// ─── utils ───────────────────────────────────────────────────────────────────

function slug(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sem_disciplina';
}

function cellText(value) {
  if (value == null) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function hashQuestao(enunciado, gabarito = '') {
  const basis = `${cellText(enunciado).toLowerCase().replace(/\s+/g, ' ')}|${String(gabarito).toUpperCase()}`;
  return createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 16).toUpperCase();
}

function prefixoDisciplina(disciplina) {
  const s = slug(disciplina);
  const map = {
    lingua_portuguesa: 'LP', portugues: 'LP', direito_penal: 'DP', direito_constitucional: 'DC',
    direitos_humanos: 'DH', contabilidade: 'CT', contabilidade_geral: 'CT', estatistica: 'EST',
    raciocinio_logico_matematico: 'RLM', raciocinio_logico: 'RLM', analise_de_dados: 'AD',
    tecnologia_da_informacao: 'TI', tecnologia_informacao: 'TI',
    estatutos_dos_servidores_de_alagoas: 'ESA',
  };
  if (map[s]) return map[s];
  const parts = s.split('_').filter(Boolean);
  return (parts.map((p) => p[0]).join('').toUpperCase().slice(0, 4) || 'QST');
}

function normalizarGabarito(raw, tipo) {
  const g = String(raw ?? '').trim().toUpperCase();
  if (!g) return '';
  if (tipo === 'certo_errado') {
    if (/^(C|CERTO|CORRETO|TRUE|1|SIM)$/.test(g)) return 'C';
    if (/^(E|ERRADO|INCORRETO|FALSE|0|NAO|NÃO)$/.test(g)) return 'E';
  }
  const letter = g.match(/^([A-E])\b/)?.[1];
  return letter || g.slice(0, 1);
}

function detectarTipo(item) {
  const raw = slug(item.tipo || item.format || item.formato || '');
  if (raw.includes('multipla') || raw === 'me' || raw === 'objetiva') return 'multipla_escolha';
  if (raw.includes('certo') || raw === 'ce' || raw === 'v_f' || raw === 'vf') return 'certo_errado';

  const alts = extrairAlternativas(item);
  if (alts.filter(Boolean).length >= 2) return 'multipla_escolha';

  const gab = String(item.respostaCorreta ?? item.gabarito ?? item.correct_answer ?? item.gabarito_normalizado ?? '').trim();
  if (/^(true|false|c|e|certo|errado)$/i.test(gab)) return 'certo_errado';
  if (/^[A-E]$/i.test(gab) && alts.filter(Boolean).length === 0) return 'certo_errado';
  return alts.filter(Boolean).length >= 2 ? 'multipla_escolha' : 'certo_errado';
}

function extrairAlternativas(item) {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const fromCols = letters.map((L) => cellText(
    item[`alternativa_${L}`] ?? item[`alternativa_${L.toLowerCase()}`] ?? item[`alternativa${L}`] ?? item[L] ?? '',
  ));
  if (fromCols.some(Boolean)) return fromCols;

  const arr = item.alternativas ?? item.options ?? item.opcoes;
  if (!Array.isArray(arr)) return ['', '', '', '', ''];

  const mapped = ['', '', '', '', ''];
  arr.forEach((opt, i) => {
    if (i >= 5) return;
    if (typeof opt === 'string') {
      const m = opt.match(/^\s*([A-E])\s*[\)\].\-:]\s*(.*)$/is);
      if (m) {
        mapped[m[1].toUpperCase().charCodeAt(0) - 65] = cellText(m[2] || opt);
      } else {
        mapped[i] = cellText(opt);
      }
    } else if (opt && typeof opt === 'object') {
      const letter = String(opt.letra || opt.letter || opt.id || String.fromCharCode(65 + i)).toUpperCase();
      const text = cellText(opt.texto ?? opt.text ?? opt.label ?? opt.value ?? '');
      const idx = letter.charCodeAt(0) - 65;
      if (idx >= 0 && idx < 5) mapped[idx] = text.replace(/^[A-E]\s*[\)\].\-:]\s*/i, '');
      else mapped[i] = text;
    }
  });
  return mapped;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    from: null,
    out: null,
    disciplina: '',
    concurso: 'PC-AL 2026',
    cargo: 'Agente de Polícia',
    banca: 'CEBRASPE',
    ano: new Date().getFullYear(),
    status: 'REVISADA',
    prefixo: '',
    template: false,
    append: false,
  };
  const take = (i, key, transform = (v) => v) => {
    const arg = argv[i];
    if (arg.includes('=')) {
      options[key] = transform(arg.slice(arg.indexOf('=') + 1));
      return i;
    }
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      options[key] = transform(next);
      return i + 1;
    }
    throw new Error(`Faltou valor para ${arg}`);
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--template') options.template = true;
    else if (arg === '--append') options.append = true;
    else if (arg === '--from' || arg.startsWith('--from=')) i = take(i, 'from');
    else if (arg === '--out' || arg.startsWith('--out=')) i = take(i, 'out');
    else if (arg === '--disciplina' || arg.startsWith('--disciplina=')) i = take(i, 'disciplina');
    else if (arg === '--concurso' || arg.startsWith('--concurso=')) i = take(i, 'concurso');
    else if (arg === '--cargo' || arg.startsWith('--cargo=')) i = take(i, 'cargo');
    else if (arg === '--banca' || arg.startsWith('--banca=')) i = take(i, 'banca');
    else if (arg === '--ano' || arg.startsWith('--ano=')) i = take(i, 'ano', (v) => Number(v) || options.ano);
    else if (arg === '--status' || arg.startsWith('--status=')) i = take(i, 'status', (v) => String(v).toUpperCase());
    else if (arg === '--prefixo' || arg.startsWith('--prefixo=')) i = take(i, 'prefixo', (v) => String(v).toUpperCase());
    else if (!arg.startsWith('--') && !options.from) options.from = arg;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return options;
}

// ─── parsers ─────────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = parseCsvLine(lines[0], delim).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line, delim);
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
    return row;
  });
}

function parseCsvLine(line, delim = ',') {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { cur += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/**
 * Parser de texto livre no formato comum de concursos:
 *
 * 1. (Enunciado...)
 * A) alt
 * B) alt
 * Gabarito: C
 * Comentário: ...
 *
 * ou Certo/Errado:
 * 1. Enunciado.
 * Gabarito: Certo
 */
function parseTxt(text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = clean.split(/\n(?=\s*(?:\d+[\).\-:]|\(?\d+\)\s|QUEST[AÃ]O\s*\d+|Q\s*\d+\s*[\).\-:]))/i)
    .map((b) => b.trim()).filter(Boolean);

  // fallback: split by blank lines if few blocks
  const units = blocks.length >= 2 ? blocks : clean.split(/\n{2,}/).map((b) => b.trim()).filter((b) => b.length > 20);
  const questions = [];

  for (const unit of units) {
    const lines = unit.split('\n').map((l) => l.trimEnd());
    let enunciadoLines = [];
    const alts = { A: '', B: '', C: '', D: '', E: '' };
    let gabarito = '';
    let comentario = '';
    let mode = 'enunciado';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (mode === 'enunciado' && enunciadoLines.length) enunciadoLines.push('');
        continue;
      }

      const gabMatch = trimmed.match(/^(?:gabarito|resposta|resposta\s*correta|correta)\s*[:\-–]?\s*(.+)$/i);
      if (gabMatch) {
        gabarito = gabMatch[1].trim();
        mode = 'after_gab';
        continue;
      }

      const comMatch = trimmed.match(/^(?:coment[aá]rio|explica[cç][aã]o|resolu[cç][aã]o|justificativa)\s*[:\-–]?\s*(.*)$/i);
      if (comMatch) {
        comentario = comMatch[1] || '';
        mode = 'comentario';
        continue;
      }

      const altMatch = trimmed.match(/^([A-E])\s*[\)\].\-:]\s*(.*)$/i);
      if (altMatch && mode !== 'comentario') {
        alts[altMatch[1].toUpperCase()] = altMatch[2].trim();
        mode = 'alt';
        continue;
      }

      // continuação de alternativa
      if (mode === 'alt') {
        const last = ['A', 'B', 'C', 'D', 'E'].reverse().find((L) => alts[L]);
        if (last) { alts[last] += (alts[last] ? ' ' : '') + trimmed; continue; }
      }
      if (mode === 'comentario') {
        comentario += (comentario ? '\n' : '') + trimmed;
        continue;
      }

      // remove numeração / rótulo "QUESTÃO N" do enunciado
      if (/^(?:QUEST[AÃ]O\s*)?\d+\s*[\).\-:.]?\s*$/i.test(trimmed) || /^Q\s*\d+\s*[\).\-:.]?\s*$/i.test(trimmed)) {
        continue;
      }
      const enun = trimmed
        .replace(/^(?:QUEST[AÃ]O\s*)?\d+\s*[\).\-:]\s*/i, '')
        .replace(/^Q\s*\d+\s*[\).\-:]\s*/i, '');
      if (!enun) continue;
      enunciadoLines.push(enun);
      mode = 'enunciado';
    }

    const enunciado = enunciadoLines.join('\n').trim();
    if (!enunciado || enunciado.length < 10) continue;

    const hasAlts = Object.values(alts).some(Boolean);
    questions.push({
      enunciado,
      alternativa_A: alts.A,
      alternativa_B: alts.B,
      alternativa_C: alts.C,
      alternativa_D: alts.D,
      alternativa_E: alts.E,
      gabarito,
      explicacao: comentario,
      tipo: hasAlts ? 'multipla_escolha' : 'certo_errado',
    });
  }
  return questions;
}

function extractQuestionsFromJson(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.questions)) return data.questions;
  if (Array.isArray(data.questoes)) return data.questoes;
  if (Array.isArray(data.items)) return data.items;
  if (data && typeof data === 'object' && (data.enunciado || data.statement)) return [data];
  throw new Error('JSON não contém lista de questões (esperado: array, .questions, .questoes ou .items).');
}

async function loadSourceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = await fs.readFile(filePath, 'utf8');
  if (ext === '.json') return extractQuestionsFromJson(JSON.parse(raw));
  if (ext === '.csv') return parseCsv(raw);
  if (ext === '.txt' || ext === '.md') return parseTxt(raw);
  // try JSON then TXT
  try {
    return extractQuestionsFromJson(JSON.parse(raw));
  } catch {
    return parseTxt(raw);
  }
}

const SKIP_SOURCE_NAMES = /^(leia-?me|readme|changelog|license|historico|instruc|como-usar)/i;

async function collectSources(fromPath) {
  const stat = await fs.stat(fromPath);
  if (stat.isDirectory()) {
    const names = await fs.readdir(fromPath);
    const files = names
      .filter((n) => /\.(json|csv|txt|md)$/i.test(n))
      .filter((n) => !SKIP_SOURCE_NAMES.test(path.basename(n, path.extname(n))))
      .sort()
      .map((n) => path.join(fromPath, n));
    if (!files.length) throw new Error(`Nenhum JSON/CSV/TXT em: ${fromPath}`);
    const all = [];
    for (const file of files) {
      const items = await loadSourceFile(file);
      items.forEach((item) => {
        all.push({ ...item, __arquivo_origem: path.basename(file) });
      });
    }
    return all;
  }
  const items = await loadSourceFile(fromPath);
  return items.map((item) => ({ ...item, __arquivo_origem: path.basename(fromPath) }));
}

// ─── normalização → linha DETONA ─────────────────────────────────────────────

export function toDetonaRows(items, options) {
  const disciplina = options.disciplina || cellText(items[0]?.disciplina || items[0]?.disciplinaId || items[0]?.materia) || 'Geral';
  const prefixo = options.prefixo || `PCAL-${prefixoDisciplina(disciplina)}`;
  const usedIds = new Set();
  const questoes = [];
  const comentarios = [];
  const pendencias = [];
  const erros = [];

  items.forEach((item, index) => {
    const enunciado = cellText(item.enunciado ?? item.statement ?? item.texto ?? '');
    if (!enunciado) {
      erros.push({ index: index + 1, motivo: 'enunciado_vazio' });
      return;
    }

    const tipo = detectarTipo(item);
    const alts = extrairAlternativas(item);
    const gabRaw = item.respostaCorreta ?? item.gabarito_normalizado ?? item.gabarito ?? item.correct_answer ?? item.correct_option ?? item.answer ?? '';
    const gabarito = normalizarGabarito(gabRaw, tipo);
    const itemStatus = String(item.__status || item.status_extracao || options.status || 'REVISADA').toUpperCase();

    if (!gabarito) {
      if (options.keepSemGabarito) {
        const idTemp = cellText(item.id || item.id_questao) || `${prefixo}-P${String(index + 1).padStart(4, '0')}`;
        pendencias.push({
          id_questao: idTemp,
          aula: cellText(item.aula) || '00',
          secao_material: cellText(item.subtopico || item.assunto || ''),
          numero_apostila: item.numero_apostila ?? item.__numero ?? index + 1,
          banca: cellText(item.banca) || options.banca,
          fonte_questao: cellText(item.fonte || item.fonte_questao || ''),
          tipo,
          enunciado,
          gabarito_original: cellText(gabRaw),
          motivo_da_revisao: 'gabarito_ausente_na_extracao',
          acao_recomendada: 'Preencher gabarito manualmente e mover para QUESTOES',
        });
      }
      erros.push({ index: index + 1, motivo: 'gabarito_ausente', enunciado: enunciado.slice(0, 60) });
      return;
    }

    if (tipo === 'multipla_escolha') {
      const filled = alts.filter(Boolean).length;
      if (filled < 2) {
        erros.push({ index: index + 1, motivo: 'alternativas_insuficientes', enunciado: enunciado.slice(0, 60) });
        return;
      }
      if (!['A', 'B', 'C', 'D', 'E'].includes(gabarito) || !alts[gabarito.charCodeAt(0) - 65]) {
        erros.push({ index: index + 1, motivo: 'gabarito_incompativel', gabarito, enunciado: enunciado.slice(0, 60) });
        return;
      }
    } else if (!['C', 'E'].includes(gabarito)) {
      erros.push({ index: index + 1, motivo: 'gabarito_ce_invalido', gabarito, enunciado: enunciado.slice(0, 60) });
      return;
    }

    let id = cellText(item.id || item.id_questao || item.question_id);
    if (!id) id = `${prefixo}-${String(item.__numero || item.numero_apostila || index + 1).padStart(4, '0')}`;
    if (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);

    const disc = cellText(item.disciplina || item.disciplinaId || item.materia) || disciplina;
    const assunto = cellText(item.assunto || item.assunto_aula || item.subject || item.topico || item.topicoEdital || '');
    const secao = cellText(item.subtopico || item.secao_material || item.topicoEditalId || item.subtopic_id || assunto);
    const explicacao = cellText(
      item.explicacao || item.explanation || item.comentario_integral_apostila || item.resolucao || item.comentario || '',
    );

    questoes.push({
      id_questao: id,
      hash_questao: cellText(item.hashQuestao || item.hash_questao) || hashQuestao(enunciado, gabarito),
      concurso: cellText(item.concurso || item.concursoId) || options.concurso,
      cargo: cellText(item.cargo || item.cargoId) || options.cargo,
      disciplina: disc,
      assunto_aula: assunto,
      secao_material: secao,
      aula: cellText(item.aula) || '00',
      numero_apostila: item.numero_apostila ?? item.__numero ?? index + 1,
      banca: cellText(item.banca || item.board) || options.banca,
      ano: item.ano || item.year || options.ano,
      fonte_questao: cellText(item.fonte_questao || item.fonteProva || item.fonte || item.source) || path.basename(item.__arquivo_origem || 'importacao'),
      tipo,
      enunciado,
      alternativa_A: tipo === 'multipla_escolha' ? alts[0] : '',
      alternativa_B: tipo === 'multipla_escolha' ? alts[1] : '',
      alternativa_C: tipo === 'multipla_escolha' ? alts[2] : '',
      alternativa_D: tipo === 'multipla_escolha' ? alts[3] : '',
      alternativa_E: tipo === 'multipla_escolha' ? alts[4] : '',
      gabarito_normalizado: gabarito,
      gabarito_original: cellText(gabRaw),
      imagem_tabela_diagrama_referenciada: cellText(item.imagem || ''),
      duplicada: 'NÃO',
      grupo_duplicata: '',
      ids_duplicados: '',
      status_extracao: itemStatus,
      observacoes_extracao: cellText(item.observacoes || ''),
      arquivo_origem: cellText(item.__arquivo_origem || item.arquivo_origem || ''),
    });

    comentarios.push({
      id_questao: id,
      comentario_integral_apostila: explicacao || 'Sem resolução.',
      comentario_A: cellText(item.comentario_A || item.porqueAlternativaA || ''),
      comentario_B: cellText(item.comentario_B || item.porqueAlternativaB || ''),
      comentario_C: cellText(item.comentario_C || item.porqueAlternativaC || ''),
      comentario_D: cellText(item.comentario_D || item.porqueAlternativaD || ''),
      comentario_E: cellText(item.comentario_E || item.porqueAlternativaE || ''),
    });
  });

  return { questoes, comentarios, pendencias, erros, disciplina };
}

// ─── Excel ───────────────────────────────────────────────────────────────────

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = HEADER_STYLE.font;
    cell.fill = HEADER_STYLE.fill;
    cell.alignment = HEADER_STYLE.alignment;
  });
  row.height = 28;
}

function addSheetRows(sheet, headers, rows) {
  sheet.addRow(headers);
  styleHeader(sheet.getRow(1));
  for (const row of rows) {
    const values = headers.map((h) => row[h] ?? '');
    const excelRow = sheet.addRow(values);
    excelRow.eachCell((cell) => {
      cell.font = CELL_STYLE.font;
      cell.alignment = CELL_STYLE.alignment;
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
}

function setColWidths(sheet, widths) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

export async function createWorkbook({
  questoes, comentarios, pendencias = [], disciplina, options, sourceLabel, controle = null,
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DETONA CONCURSOS';
  wb.created = new Date();

  const resumo = wb.addWorksheet('RESUMO');
  resumo.addRow([`DETONA CONCURSOS - BANCO ${String(disciplina).toUpperCase()}`]);
  resumo.getRow(1).font = { bold: true, name: 'Arial', size: 14, color: { argb: 'FF1F4E79' } };
  resumo.addRow([]);
  resumo.addRow(['Indicador', 'Valor']);
  styleHeader(resumo.getRow(3));
  const stats = [
    ['Disciplina', disciplina],
    ['Questões', questoes.length],
    ['Pendências', pendencias.length],
    ['Múltipla escolha', questoes.filter((q) => q.tipo === 'multipla_escolha').length],
    ['Certo/Errado', questoes.filter((q) => q.tipo === 'certo_errado').length],
    ['Status padrão', options.status],
    ['Concurso', options.concurso],
    ['Cargo', options.cargo],
    ['Banca default', options.banca],
    ['Origem', sourceLabel],
    ['Gerado em', new Date().toISOString()],
  ];
  stats.forEach((row) => resumo.addRow(row));
  resumo.getColumn(1).width = 28;
  resumo.getColumn(2).width = 50;

  const qs = wb.addWorksheet('QUESTOES');
  addSheetRows(qs, QUESTOES_HEADERS, questoes);
  setColWidths(qs, [18, 16, 14, 18, 22, 28, 28, 8, 12, 12, 8, 36, 16, 50, 24, 24, 24, 24, 24, 12, 12, 12, 10, 12, 16, 12, 20, 20]);

  const cs = wb.addWorksheet('COMENTARIOS');
  addSheetRows(cs, COMENTARIOS_HEADERS, comentarios);
  setColWidths(cs, [18, 50, 24, 24, 24, 24, 24]);

  const pend = wb.addWorksheet('PENDENCIAS');
  addSheetRows(pend, [
    'id_questao', 'aula', 'secao_material', 'numero_apostila', 'banca', 'fonte_questao',
    'tipo', 'enunciado', 'gabarito_original', 'motivo_da_revisao', 'acao_recomendada',
  ], pendencias);
  setColWidths(pend, [18, 8, 24, 12, 12, 24, 14, 40, 12, 28, 24]);

  const dup = wb.addWorksheet('DUPLICATAS');
  addSheetRows(dup, [
    'grupo_duplicata', 'id_questao', 'aula', 'secao_material', 'numero_apostila',
    'banca', 'fonte_questao', 'enunciado', 'ids_duplicados', 'arquivo_origem',
  ], []);

  const ctrlRows = Array.isArray(controle) && controle.length ? controle : [{
    aula: options.aula || '00',
    arquivo_pdf: sourceLabel,
    secao_extraida: options.secaoExtraida || disciplina,
    pagina_inicial_pdf: options.paginaInicial || '',
    pagina_final_pdf: options.paginaFinal || '',
    questoes_extraidas: questoes.length,
    regra_de_parada: options.regraParada || 'Importação automática via criarBancoQuestoes.mjs',
  }];
  const ctrl = wb.addWorksheet('CONTROLE_EXTRACAO');
  addSheetRows(ctrl, [
    'aula', 'arquivo_pdf', 'secao_extraida', 'pagina_inicial_pdf', 'pagina_final_pdf',
    'questoes_extraidas', 'regra_de_parada',
  ], ctrlRows);

  const dic = wb.addWorksheet('DICIONARIO');
  addSheetRows(dic, ['Campo/Aba', 'Descrição'], [
    { 'Campo/Aba': 'QUESTOES', Descrição: 'Enunciados, alternativas, gabaritos e metadados de origem.' },
    { 'Campo/Aba': 'COMENTARIOS', Descrição: 'Comentários/explicações por questão e por alternativa.' },
    { 'Campo/Aba': 'status_extracao', Descrição: 'EXTRAIDA = rascunho; REVISADA = entra no app (importação); REJEITADA = ignorada.' },
    { 'Campo/Aba': 'tipo', Descrição: 'certo_errado ou multipla_escolha.' },
    { 'Campo/Aba': 'gabarito_normalizado', Descrição: 'C/E para certo_errado; A-E para multipla_escolha.' },
    { 'Campo/Aba': 'Como importar no app', Descrição: 'node scripts/importQuestionBanks.mjs --include-extraida' },
  ]);
  setColWidths(dic, [28, 80]);

  return wb;
}

/** Cria Excel DETONA a partir de array de itens (uso programático / PDF). */
export async function criarBancoFromItems(items, options = {}) {
  if (!items?.length) throw new Error('Nenhum item para gravar no banco.');
  const defaults = {
    concurso: 'PC-AL 2026',
    cargo: 'Agente de Polícia',
    banca: 'CEBRASPE',
    ano: new Date().getFullYear(),
    status: 'REVISADA',
    keepSemGabarito: false,
    ...options,
  };
  const { questoes, comentarios, pendencias, erros, disciplina } = toDetonaRows(items, defaults);
  if (!questoes.length) {
    const detail = erros.slice(0, 5).map((e) => JSON.stringify(e)).join('; ');
    throw new Error(`Nenhuma questão válida para Excel. Erros: ${detail}`);
  }
  const discSlug = slug(disciplina);
  const out = path.resolve(
    defaults.out || path.join(DEFAULT_IMPORTS, `DETONA_BANCO_${discSlug.toUpperCase()}_AUTO.xlsx`),
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  const wb = await createWorkbook({
    questoes,
    comentarios,
    pendencias,
    disciplina,
    options: defaults,
    sourceLabel: defaults.sourceLabel || 'itens',
    controle: defaults.controle || null,
  });
  await wb.xlsx.writeFile(out);
  const reportPath = out.replace(/\.xlsx$/i, '-import-report.json');
  const report = {
    geradoEm: new Date().toISOString(),
    saida: out,
    disciplina,
    questoesGravadas: questoes.length,
    pendencias: pendencias.length,
    erros,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { out, reportPath, questoes: questoes.length, pendencias: pendencias.length, erros, disciplina };
}

async function writeTemplate(outPath, options) {
  const sampleQ = {
    id_questao: `${options.prefixo || 'PCAL-EX'}-0001`,
    hash_questao: hashQuestao('Exemplo de enunciado. A Constituição Federal de 1988...'),
    concurso: options.concurso,
    cargo: options.cargo,
    disciplina: options.disciplina || 'Língua Portuguesa',
    assunto_aula: 'Ortografia',
    secao_material: 'Uso do hífen',
    aula: '00',
    numero_apostila: 1,
    banca: options.banca,
    ano: options.ano,
    fonte_questao: 'Exemplo interno DETONA',
    tipo: 'certo_errado',
    enunciado: 'Julgue o item: o uso do hífen é obrigatório em "anti-inflamatório".',
    alternativa_A: '', alternativa_B: '', alternativa_C: '', alternativa_D: '', alternativa_E: '',
    gabarito_normalizado: 'C',
    gabarito_original: 'Certo',
    imagem_tabela_diagrama_referenciada: '',
    duplicada: 'NÃO',
    grupo_duplicata: '',
    ids_duplicados: '',
    status_extracao: options.status,
    observacoes_extracao: 'Linha de exemplo — apague ou edite.',
    arquivo_origem: 'template',
  };
  const sampleC = {
    id_questao: sampleQ.id_questao,
    comentario_integral_apostila: 'Correto. "Anti-inflamatório" leva hífen por começar a segunda palavra com a mesma vogal.',
    comentario_A: '', comentario_B: '', comentario_C: '', comentario_D: '', comentario_E: '',
  };
  const wb = await createWorkbook({
    questoes: [sampleQ],
    comentarios: [sampleC],
    disciplina: options.disciplina || 'Modelo',
    options,
    sourceLabel: 'template',
  });
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

async function appendToExisting(outPath, questoes, comentarios) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outPath);
  const qs = wb.getWorksheet('QUESTOES');
  const cs = wb.getWorksheet('COMENTARIOS');
  if (!qs || !cs) throw new Error('Excel de destino não tem abas QUESTOES/COMENTARIOS.');

  const existingIds = new Set();
  qs.eachRow((row, n) => {
    if (n === 1) return;
    const id = cellText(row.getCell(1).value);
    if (id) existingIds.add(id);
  });

  let added = 0;
  for (const q of questoes) {
    if (existingIds.has(q.id_questao)) continue;
    qs.addRow(QUESTOES_HEADERS.map((h) => q[h] ?? ''));
    const c = comentarios.find((x) => x.id_questao === q.id_questao);
    if (c) cs.addRow(COMENTARIOS_HEADERS.map((h) => c[h] ?? ''));
    existingIds.add(q.id_questao);
    added += 1;
  }
  await wb.xlsx.writeFile(outPath);
  return added;
}

// ─── main ────────────────────────────────────────────────────────────────────

export async function criarBancoQuestoes(options = {}) {
  await fs.mkdir(DEFAULT_IMPORTS, { recursive: true });

  if (options.template) {
    const discSlug = slug(options.disciplina || 'modelo');
    const out = options.out || path.join(DEFAULT_IMPORTS, `DETONA_BANCO_${discSlug.toUpperCase()}_TEMPLATE.xlsx`);
    await writeTemplate(out, options);
    return { out, questoes: 1, erros: [], modo: 'template' };
  }

  if (!options.from) {
    throw new Error('Informe --from=arquivo.json|csv|txt ou pasta, ou use --template.');
  }

  const fromPath = path.resolve(options.from);
  const items = await collectSources(fromPath);
  if (!items.length) throw new Error('Nenhuma questão encontrada na origem.');

  // disciplina: CLI > campo do item > nome do arquivo
  if (!options.disciplina) {
    options.disciplina = cellText(items[0].disciplina || items[0].disciplinaId || items[0].materia)
      || path.basename(fromPath, path.extname(fromPath)).replace(/DETONA_BANCO_|_|-/gi, ' ').trim()
      || 'Geral';
  }

  const { questoes, comentarios, pendencias, erros, disciplina } = toDetonaRows(items, options);
  if (!questoes.length) {
    const detail = erros.slice(0, 5).map((e) => JSON.stringify(e)).join('; ');
    throw new Error(`Nenhuma questão válida. Erros: ${detail}`);
  }

  const discSlug = slug(disciplina);
  const out = path.resolve(
    options.out || path.join(DEFAULT_IMPORTS, `DETONA_BANCO_${discSlug.toUpperCase()}_AUTO.xlsx`),
  );

  if (options.append && await fs.access(out).then(() => true).catch(() => false)) {
    const added = await appendToExisting(out, questoes, comentarios);
    return { out, questoes: added, erros, modo: 'append', totalLidas: items.length };
  }

  const wb = await createWorkbook({
    questoes,
    comentarios,
    pendencias,
    disciplina,
    options,
    sourceLabel: path.basename(fromPath),
  });
  await fs.mkdir(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);

  // relatório JSON ao lado
  const reportPath = out.replace(/\.xlsx$/i, '-import-report.json');
  const report = {
    geradoEm: new Date().toISOString(),
    origem: fromPath,
    saida: out,
    disciplina,
    totalLidas: items.length,
    questoesGravadas: questoes.length,
    erros,
    status: options.status,
    proximosPassos: [
      'Revise a planilha (aba QUESTOES / COMENTARIOS).',
      'Garanta status_extracao = REVISADA para entrar no app.',
      'Rode: node scripts/importQuestionBanks.mjs',
      'Ou com rascunhos: node scripts/importQuestionBanks.mjs --include-extraida',
    ],
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return { out, reportPath, questoes: questoes.length, erros, modo: 'create', totalLidas: items.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  criarBancoQuestoes(parseArgs())
    .then((result) => {
      console.log('');
      console.log('=== DETONA — Banco de questões criado ===');
      console.log(`Modo:      ${result.modo}`);
      console.log(`Arquivo:   ${result.out}`);
      console.log(`Questões:  ${result.questoes}`);
      if (result.totalLidas != null) console.log(`Lidas:     ${result.totalLidas}`);
      if (result.erros?.length) {
        console.log(`Avisos:    ${result.erros.length} item(ns) ignorado(s)`);
        result.erros.slice(0, 8).forEach((e) => console.log(`  - #${e.index}: ${e.motivo}${e.enunciado ? ` (${e.enunciado}…)` : ''}`));
      }
      if (result.reportPath) console.log(`Relatório: ${result.reportPath}`);
      console.log('');
      console.log('Próximo passo — importar para o app:');
      console.log('  node scripts/importQuestionBanks.mjs');
      console.log('');
    })
    .catch((error) => {
      console.error('Erro:', error.message || error);
      process.exitCode = 1;
    });
}
