/**
 * DETONA CONCURSOS — Extração automática de PDF de apostila → Excel DETONA
 *
 * Uso:
 *   node scripts/extrairPdfApostila.mjs --pdf "C:\caminho\aula.pdf" --disciplina "Direito Penal"
 *   node scripts/extrairPdfApostila.mjs --pdf aula.pdf --disciplina "Direito Penal" --aula 00 --secao comentados
 *   node scripts/extrairPdfApostila.mjs --pdf aula.pdf --disciplina "Direito Penal" --paginas 38-59
 *   node scripts/extrairPdfApostila.mjs --dir "C:\CURSOS\D. Penal" --disciplina "Direito Penal"
 *
 * Opções:
 *   --pdf=PATH           Arquivo PDF da apostila
 *   --dir=PATH           Pasta com vários PDFs (processa todos)
 *   --disciplina=NOME    Disciplina do banco
 *   --aula=00            Número da aula (default: detecta do nome do arquivo)
 *   --secao=comentados   comentados | praticar | lista | auto | todas
 *   --paginas=INICIO-FIM Intervalo de páginas (1-based), ex: 38-59
 *   --out=PATH           Excel de saída
 *   --status=REVISADA    Status padrão (sobrescreve se item tiver gabarito)
 *   --prefixo=PCAL-DP    Prefixo dos IDs
 *   --concurso=... --cargo=... --banca=...
 *   --keep-sem-gabarito  Coloca questões sem gabarito em PENDENCIAS
 *   --salvar-texto       Salva TXT intermediário da extração
 *   --status-extraida    Marca todas como EXTRAIDA (revisão manual)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  joinPages,
  parseApostilaText,
  questionsToImportItems,
} from './lib/parseApostilaQuestoes.mjs';
import { criarBancoFromItems } from './criarBancoQuestoes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const PDF_EXTRACT_PY = path.join(__dirname, 'lib', 'pdfExtract.py');
const DEFAULT_IMPORTS = path.join(APP_ROOT, 'imports', 'questions');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    pdf: null,
    dir: null,
    disciplina: '',
    aula: '',
    secao: 'comentados',
    paginas: null,
    out: null,
    status: 'REVISADA',
    prefixo: '',
    concurso: 'PC-AL 2026',
    cargo: 'Agente de Polícia',
    banca: 'CEBRASPE',
    keepSemGabarito: false,
    salvarTexto: false,
    forcarExtraida: false,
    consolidar: false,
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
    if (arg === '--keep-sem-gabarito') options.keepSemGabarito = true;
    else if (arg === '--salvar-texto') options.salvarTexto = true;
    else if (arg === '--status-extraida') options.forcarExtraida = true;
    else if (arg === '--consolidar') options.consolidar = true;
    else if (arg === '--pdf' || arg.startsWith('--pdf=')) i = take(i, 'pdf');
    else if (arg === '--dir' || arg.startsWith('--dir=')) i = take(i, 'dir');
    else if (arg === '--disciplina' || arg.startsWith('--disciplina=')) i = take(i, 'disciplina');
    else if (arg === '--aula' || arg.startsWith('--aula=')) i = take(i, 'aula');
    else if (arg === '--secao' || arg.startsWith('--secao=')) i = take(i, 'secao', (v) => String(v).toLowerCase());
    else if (arg === '--paginas' || arg.startsWith('--paginas=')) i = take(i, 'paginas');
    else if (arg === '--out' || arg.startsWith('--out=')) i = take(i, 'out');
    else if (arg === '--status' || arg.startsWith('--status=')) i = take(i, 'status', (v) => String(v).toUpperCase());
    else if (arg === '--prefixo' || arg.startsWith('--prefixo=')) i = take(i, 'prefixo', (v) => String(v).toUpperCase());
    else if (arg === '--concurso' || arg.startsWith('--concurso=')) i = take(i, 'concurso');
    else if (arg === '--cargo' || arg.startsWith('--cargo=')) i = take(i, 'cargo');
    else if (arg === '--banca' || arg.startsWith('--banca=')) i = take(i, 'banca');
    else if (!arg.startsWith('--') && !options.pdf) options.pdf = arg;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return options;
}

function parsePaginas(spec) {
  if (!spec) return { start: null, end: null };
  const m = String(spec).match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (m) return { start: Number(m[1]), end: Number(m[2]) };
  if (/^\d+$/.test(String(spec))) return { start: Number(spec), end: Number(spec) };
  throw new Error(`Intervalo de páginas inválido: ${spec} (use 38-59)`);
}

function detectarAula(fileName) {
  const m = String(fileName).match(/aula[-_ ]?(\d{1,2}|extra)/i);
  if (!m) return '00';
  if (/extra/i.test(m[1])) return 'extra';
  return String(m[1]).padStart(2, '0');
}

function slug(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'geral';
}

function runPythonExtract(pdfPath, start, end) {
  return new Promise((resolve, reject) => {
    const args = ['-3.12', PDF_EXTRACT_PY, pdfPath];
    if (start != null) args.push(String(start));
    if (end != null) args.push(String(end));
    const child = spawn('py', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => reject(new Error(`Falha ao executar Python: ${err.message}. Instale Python 3.12 e pypdf.`)));
    child.on('close', (code) => {
      if (!stdout.trim()) {
        reject(new Error(stderr || `pdfExtract.py saiu sem saída (code ${code})`));
        return;
      }
      let data;
      try {
        data = JSON.parse(stdout);
      } catch {
        reject(new Error(`JSON inválido do extrator PDF: ${stdout.slice(0, 200)}`));
        return;
      }
      if (data.error) {
        reject(new Error(data.error + (stderr ? `\n${stderr}` : '')));
        return;
      }
      resolve(data);
    });
  });
}

async function listPdfs(dirPath) {
  const names = await fs.readdir(dirPath);
  return names
    .filter((n) => n.toLowerCase().endsWith('.pdf'))
    .filter((n) => !/mapa|resumo|sumario/i.test(n))
    .sort()
    .map((n) => path.join(dirPath, n));
}

function discPrefix(disciplina) {
  return slug(disciplina).split('_').map((p) => p[0]).join('').toUpperCase().slice(0, 4) || 'QST';
}

/** Extrai e parseia um PDF (sem gravar Excel). */
async function coletarDePdf(pdfPath, options) {
  const abs = path.resolve(pdfPath);
  const { start, end } = parsePaginas(options.paginas);
  console.log(`\n→ Extraindo texto: ${path.basename(abs)}${start ? ` (págs. ${start}-${end})` : ''}...`);
  const extracted = await runPythonExtract(abs, start, end);
  console.log(`  Páginas lidas: ${extracted.fromPage}-${extracted.toPage} de ${extracted.totalPages}`);

  const fullText = joinPages(extracted.pages);
  if (options.salvarTexto) {
    const txtPath = path.join(DEFAULT_IMPORTS, `${path.basename(abs, '.pdf')}.extract.txt`);
    await fs.mkdir(DEFAULT_IMPORTS, { recursive: true });
    await fs.writeFile(txtPath, fullText, 'utf8');
    console.log(`  Texto salvo: ${txtPath}`);
  }

  const parsed = parseApostilaText(fullText, {
    secao: options.secao,
    arquivo: extracted.name,
  });
  console.log(`  Seções no PDF: ${(parsed.secoesEncontradas || []).join(', ') || '(nenhuma marcador clássico)'}`);
  console.log(`  Seções usadas: ${parsed.secoesUsadas.map((s) => s.nome).join(', ')}`);
  console.log(`  Questões parseadas: ${parsed.questions.length} (avisos: ${parsed.warnings.length})`);

  const aula = options.aula || detectarAula(extracted.name);
  const disciplina = options.disciplina || 'Geral';
  const prefixo = options.prefixo || `PCAL-${discPrefix(disciplina)}-A${aula}`;

  let items = questionsToImportItems(parsed.questions, {
    disciplina,
    aula,
    prefixo,
    banca: options.banca,
    arquivo: extracted.name,
    assunto: parsed.secoesUsadas[0]?.label || 'Exercícios Comentados',
  });

  if (options.forcarExtraida) {
    items = items.map((item) => ({ ...item, __status: 'EXTRAIDA' }));
  } else if (options.status && options.status !== 'REVISADA') {
    items = items.map((item) => ({
      ...item,
      __status: item.gabarito ? options.status : (item.__status || 'EXTRAIDA'),
    }));
  }

  const pages = parsed.questions.map((q) => q.pagina_pdf).filter(Boolean);
  const paginaInicial = start || (pages.length ? Math.min(...pages) : extracted.fromPage);
  const paginaFinal = end || (pages.length ? Math.max(...pages) : extracted.toPage);

  const controle = {
    aula,
    arquivo_pdf: extracted.name,
    secao_extraida: parsed.secoesUsadas.map((s) => s.label || s.nome).join(' | ') || options.secao,
    pagina_inicial_pdf: paginaInicial,
    pagina_final_pdf: paginaFinal,
    questoes_extraidas: items.filter((i) => i.gabarito).length,
    regra_de_parada: 'Parser automático extrairPdfApostila.mjs',
  };

  return {
    pdf: abs,
    extracted,
    parsed,
    items,
    avisos: parsed.warnings,
    aula,
    prefixo,
    paginaInicial,
    paginaFinal,
    controle,
  };
}

async function extrairUmPdf(pdfPath, options) {
  const pack = await coletarDePdf(pdfPath, options);
  const disciplina = options.disciplina || 'Geral';
  const outDefault = path.join(
    DEFAULT_IMPORTS,
    `DETONA_BANCO_${slug(disciplina).toUpperCase()}_AULA_${pack.aula}_PDF.xlsx`,
  );

  const result = await criarBancoFromItems(pack.items, {
    disciplina,
    concurso: options.concurso,
    cargo: options.cargo,
    banca: options.banca,
    status: options.forcarExtraida ? 'EXTRAIDA' : options.status,
    prefixo: pack.prefixo,
    out: options.out || outDefault,
    keepSemGabarito: options.keepSemGabarito,
    sourceLabel: pack.extracted.name,
    aula: pack.aula,
    secaoExtraida: pack.parsed.secoesUsadas.map((s) => s.nome).join('+') || options.secao,
    paginaInicial: pack.paginaInicial,
    paginaFinal: pack.paginaFinal,
    regraParada: options.secao === 'comentados'
      ? 'Fim da seção EXERCÍCIOS COMENTADOS / início de EXERCÍCIOS PARA PRATICAR'
      : `Seção: ${options.secao}`,
    controle: [pack.controle],
  });

  const pdfReportPath = result.out.replace(/\.xlsx$/i, '-pdf-extract-report.json');
  await fs.writeFile(pdfReportPath, `${JSON.stringify({
    geradoEm: new Date().toISOString(),
    pdf: pack.pdf,
    totalPages: pack.extracted.totalPages,
    fromPage: pack.extracted.fromPage,
    toPage: pack.extracted.toPage,
    secao: options.secao,
    secoesEncontradas: pack.parsed.secoesEncontradas,
    secoesUsadas: pack.parsed.secoesUsadas,
    questoesParseadas: pack.parsed.questions.length,
    questoesNoExcel: result.questoes,
    pendencias: result.pendencias,
    avisos: pack.avisos.slice(0, 50),
    errosBanco: result.erros.slice(0, 50),
    excel: result.out,
  }, null, 2)}\n`, 'utf8');

  return { ...result, pdfReportPath, avisos: pack.avisos, pdf: pack.pdf, aula: pack.aula };
}

export async function extrairPdfApostila(options = {}) {
  await fs.mkdir(DEFAULT_IMPORTS, { recursive: true });

  const files = [];
  if (options.dir) {
    const dir = path.resolve(options.dir);
    files.push(...await listPdfs(dir));
    if (!files.length) throw new Error(`Nenhum PDF em: ${dir}`);
  } else if (options.pdf) {
    files.push(path.resolve(options.pdf));
  } else {
    throw new Error('Informe --pdf=arquivo.pdf ou --dir=pasta');
  }

  if (!options.disciplina) {
    console.warn('Aviso: --disciplina não informada; usando "Geral".');
    options.disciplina = 'Geral';
  }

  // Consolidado: um único Excel com todas as aulas
  if (options.consolidar || (files.length > 1 && options.out)) {
    const allItems = [];
    const allControle = [];
    const perFile = [];
    const allAvisos = [];
    const aulas = [];

    for (const file of files) {
      try {
        const pack = await coletarDePdf(file, { ...options, aula: '', prefixo: '', out: null });
        allItems.push(...pack.items);
        allControle.push(pack.controle);
        allAvisos.push(...pack.avisos.map((w) => ({ ...w, pdf: path.basename(file), aula: pack.aula })));
        aulas.push(pack.aula);
        perFile.push({
          pdf: pack.pdf,
          aula: pack.aula,
          parseadas: pack.parsed.questions.length,
          comGabarito: pack.items.filter((i) => i.gabarito).length,
          avisos: pack.avisos.length,
        });
        console.log(`  ✓ Aula ${pack.aula}: ${pack.items.filter((i) => i.gabarito).length} com gabarito / ${pack.parsed.questions.length} parseadas`);
      } catch (error) {
        perFile.push({ pdf: file, error: error.message || String(error) });
        console.error(`  ERRO em ${path.basename(file)}:`, error.message || error);
      }
    }

    if (!allItems.length) throw new Error('Nenhuma questão extraída de nenhum PDF.');

    const aulasSorted = [...new Set(aulas)].sort();
    const aulaLabel = aulasSorted.length > 1
      ? `${aulasSorted[0]}_A_${aulasSorted[aulasSorted.length - 1]}`
      : (aulasSorted[0] || '00');
    const outDefault = path.join(
      DEFAULT_IMPORTS,
      `DETONA_BANCO_${slug(options.disciplina).toUpperCase()}_AULAS_${aulaLabel}_PDF.xlsx`,
    );
    const prefixo = options.prefixo || `PCAL-${discPrefix(options.disciplina)}`;

    // IDs únicos globais: re-prefixa com aula já embutida nos items; garante unicidade
    const seenIds = new Set();
    allItems.forEach((item, index) => {
      if (!item.id) item.id = `${prefixo}-${String(index + 1).padStart(4, '0')}`;
      if (seenIds.has(item.id)) item.id = `${item.id}-d${index + 1}`;
      seenIds.add(item.id);
    });

    console.log(`\n→ Gravando banco consolidado (${allItems.length} itens, ${allControle.length} aulas)...`);
    const result = await criarBancoFromItems(allItems, {
      disciplina: options.disciplina,
      concurso: options.concurso,
      cargo: options.cargo,
      banca: options.banca,
      status: options.forcarExtraida ? 'EXTRAIDA' : options.status,
      prefixo,
      out: options.out || outDefault,
      keepSemGabarito: options.keepSemGabarito,
      sourceLabel: `${files.length} PDFs — ${options.disciplina}`,
      aula: aulaLabel,
      secaoExtraida: options.secao,
      paginaInicial: '',
      paginaFinal: '',
      regraParada: 'Extração consolidada multi-aula',
      controle: allControle,
    });

    const pdfReportPath = result.out.replace(/\.xlsx$/i, '-pdf-extract-report.json');
    await fs.writeFile(pdfReportPath, `${JSON.stringify({
      geradoEm: new Date().toISOString(),
      consolidado: true,
      disciplina: options.disciplina,
      arquivos: perFile,
      aulas: aulasSorted,
      totalItens: allItems.length,
      questoesNoExcel: result.questoes,
      pendencias: result.pendencias,
      avisos: allAvisos.slice(0, 100),
      errosBanco: result.erros.slice(0, 100),
      excel: result.out,
    }, null, 2)}\n`, 'utf8');

    return [{
      ...result,
      pdfReportPath,
      avisos: allAvisos,
      pdf: options.dir || files[0],
      consolidado: true,
      porArquivo: perFile,
    }];
  }

  const results = [];
  for (const file of files) {
    const opts = { ...options };
    if (files.length > 1) opts.out = null;
    try {
      results.push(await extrairUmPdf(file, opts));
    } catch (error) {
      results.push({ pdf: file, error: error.message || String(error) });
      console.error(`  ERRO em ${path.basename(file)}:`, error.message || error);
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  extrairPdfApostila(parseArgs())
    .then((results) => {
      console.log('\n========== RESUMO EXTRAÇÃO PDF ==========');
      let ok = 0;
      let fail = 0;
      for (const r of results) {
        if (r.error) {
          fail += 1;
          console.log(`✗ ${path.basename(r.pdf)} → ${r.error}`);
        } else {
          ok += 1;
          if (r.consolidado) {
            console.log('✓ BANCO CONSOLIDADO');
            console.log(`  Excel:     ${r.out}`);
            console.log(`  Questões:  ${r.questoes}`);
            if (r.pendencias) console.log(`  Pendências:${r.pendencias}`);
            if (r.porArquivo?.length) {
              console.log('  Por aula:');
              for (const f of r.porArquivo) {
                if (f.error) console.log(`    ✗ ${path.basename(f.pdf)}: ${f.error}`);
                else console.log(`    · Aula ${f.aula}: ${f.comGabarito} questões (${path.basename(f.pdf)})`);
              }
            }
            console.log(`  Relatório: ${r.pdfReportPath}`);
          } else {
            console.log(`✓ ${path.basename(r.pdf)}`);
            console.log(`  Excel:     ${r.out}`);
            console.log(`  Questões:  ${r.questoes}`);
            if (r.pendencias) console.log(`  Pendências:${r.pendencias}`);
            if (r.avisos?.length) console.log(`  Avisos:    ${r.avisos.length}`);
            console.log(`  Relatório: ${r.pdfReportPath}`);
          }
        }
      }
      console.log(`\nConcluído: ${ok} ok, ${fail} falha(s).`);
      console.log('\nPróximo passo (carregar no app):');
      console.log('  node scripts/importQuestionBanks.mjs');
      console.log('  (ou com rascunhos) node scripts/importQuestionBanks.mjs --include-extraida\n');
      if (fail && !ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error('Erro:', error.message || error);
      process.exitCode = 1;
    });
}
