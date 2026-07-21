/**
 * Organiza e importa questões de todos os acervos para data/questions,
 * garantindo topicoEditalId/subtopic_id por subtópico do edital.
 *
 * Uso:
 *   node scripts/organizarEImportarBancos.mjs
 *   node scripts/organizarEImportarBancos.mjs --dry-run
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(APP_ROOT, 'data', 'questions');
const OUT_BY_TOPIC = path.join(APP_ROOT, 'data', 'questions', 'por-subtopico');
const REPORT_PATH = path.join(APP_ROOT, 'reports', 'organizacao-importacao-completa.json');

/**
 * Ordem importa: primeiro o banco já organizado por subtópico (fonte da verdade),
 * depois ciclos/ready/curated/legado — só entram se não forem duplicata.
 * Não reler data/questions “flat” de clones (vira duplicata sem topico).
 */
const EXTERNAL_SOURCES = [
  path.resolve(APP_ROOT, '../../ATUALIZACOES-DE-VISUAL/atualizacao-20-07/banco-organizado/por-subtopico'),
  path.resolve(APP_ROOT, '../../ATUALIZACOES-DE-VISUAL/atualizacao-20-07/ciclos-ready'),
  path.resolve(APP_ROOT, 'imports/questions'),
  path.resolve(APP_ROOT, 'data/questions/curated'),
  path.resolve(APP_ROOT, 'js/data'),
  path.resolve(APP_ROOT, 'data/questoes_pc_al_importadas.json'),
  path.resolve(APP_ROOT, 'data/questoes_pc_al_lote_original.json'),
];

const DISCIPLINE_MAP = Object.freeze({
  analise_de_dados: 'dados',
  contabilidade: 'contab',
  contabilidade_geral: 'contab',
  direito_penal: 'penal',
  dir_penal: 'penal',
  direito_constitucional: 'const',
  dir_constitucional: 'const',
  constitucional: 'const',
  direitos_humanos: 'dh',
  dir_humanos: 'dh',
  lingua_portuguesa: 'port',
  portugues: 'port',
  raciocinio_logico_matematico: 'rlm',
  raciocinio_logico: 'rlm',
  tecnologia_da_informacao_crimes_ciberneticos: 'ti',
  tecnologia_informacao: 'ti',
  tecnologia_da_informacao: 'ti',
  seguranca_cibernetica: 'ciber',
  legislacao_estadual_estatutos_de_alagoas: 'leg_al',
  estatutos_dos_servidores_de_alagoas: 'leg_al',
  legislacao_alagoas: 'leg_al',
  legislacao_al: 'leg_al',
  estatistica: 'estat',
  etica: 'etica',
  etica_servico_publico: 'etica',
  atualidades_etica: 'etica',
  dados: 'dados',
  contab: 'contab',
  penal: 'penal',
  const: 'const',
  dh: 'dh',
  port: 'port',
  rlm: 'rlm',
  ti: 'ti',
  ciber: 'ciber',
  leg_al: 'leg_al',
  estat: 'estat',
  adm: 'adm',
  proc: 'proc',
  leg_esp: 'leg_esp',
  fin: 'fin',
  geral: 'geral',
});

const FILE_BY_SHORT = Object.freeze({
  dados: 'analise_de_dados',
  contab: 'contabilidade',
  penal: 'direito_penal',
  const: 'direito_constitucional',
  dh: 'direitos_humanos',
  port: 'lingua_portuguesa',
  rlm: 'raciocinio_logico_matematico',
  ti: 'tecnologia_informacao',
  ciber: 'seguranca_cibernetica',
  leg_al: 'legislacao_estadual_estatutos_de_alagoas',
  estat: 'estatistica',
  etica: 'etica',
  adm: 'administrativo',
  proc: 'processual_penal',
  leg_esp: 'legislacao_penal_especial',
  fin: 'crimes_financeiros',
  geral: 'geral',
});

/** Mapa de assunto/subtopico textual → id edital (heurísticas + import map) */
const TEXT_TOPIC_HINTS = [
  [/ortograf|acentua|h[ií]fen|encontros?\s*voc[aá]lic|hiato|s[ií]gla/i, 'port_3'],
  [/coes[aã]o|conectiv|referenc|substitui[cç]/i, 'port_4_1'],
  [/tempos?\s*e\s*modos?\s*verb/i, 'port_4_2'],
  [/classes?\s*de\s*palavra|substantiv|adjetiv|adv[eé]rb|pronome(?!s?\s*[aá]ton)/i, 'port_5_1'],
  [/coordena[cç]/i, 'port_5_2'],
  [/subordina[cç]/i, 'port_5_3'],
  [/pontua[cç]/i, 'port_5_4'],
  [/concord[aâ]ncia/i, 'port_5_5'],
  [/reg[eê]ncia/i, 'port_5_6'],
  [/crase/i, 'port_5_7'],
  [/pronomes?\s*[aá]ton|colo[cç][aã]o\s*pronom/i, 'port_5_8'],
  [/significa[cç][aã]o|sin[oô]nim|antonim/i, 'port_6_1'],
  [/substitui[cç][aã]o\s*de\s*palavra/i, 'port_6_2'],
  [/reorganiza[cç]/i, 'port_6_3'],
  [/reescrita|g[eê]nero\s*textual|formalidade/i, 'port_6_4'],
  [/interpreta[cç][aã]o|compreens[aã]o\s*de\s*texto|g[eê]neros?\s*variados/i, 'port_1'],
  [/tipos?\s*e\s*g[eê]neros?\s*textuais/i, 'port_2'],
  [/linux|windows|sistema\s*operacional/i, 'ti_1'],
  [/office|planilha|apresenta[cç]|word|excel|powerpoint/i, 'ti_2'],
  [/rede|internet|intranet/i, 'ti_3_1'],
  [/navegador|chrome|edge/i, 'ti_3_2'],
  [/outlook|correio\s*eletr/i, 'ti_3_3'],
  [/busca|grupo\s*de\s*discuss/i, 'ti_3_4'],
  [/nuvem|cloud/i, 'ti_3_5'],
  [/arquivo|pasta|gerenciamento\s*de\s*arquivo/i, 'ti_4'],
  [/v[ií]rus|worm|praga/i, 'ti_5_2'],
  [/antiv[ií]rus|firewall|spyware/i, 'ti_5_3'],
  [/backup/i, 'ti_5_4'],
  [/lgpd|13\.?709/i, 'ti_7'],
  [/intelig[eê]ncia\s*artificial|\bia\b/i, 'ti_9'],
  [/python|java|programa[cç]/i, 'ti_10'],
  [/banco\s*de\s*dados|sgbd|sql/i, 'ti_6_1'],
  [/confidencialidade|integridade|disponibilidade|cia\b/i, 'ciber_1'],
  [/criptograf/i, 'ciber_4'],
  [/firewall|ids|ips|vpn|segmenta/i, 'ciber_3'],
  [/pacto\s*de\s*s[aã]o\s*jos[eé]|direitos?\s*humanos/i, 'dh_6'],
  [/constitui[cç][aã]o|art\.?\s*5|garantias?\s*fundament/i, 'const_1'],
  [/seguran[cç]a\s*p[uú]blica|art\.?\s*144/i, 'const_2'],
  [/c[oó]digo\s*penal|lei\s*penal|aplica[cç][aã]o\s*da\s*lei\s*penal/i, 'penal_1'],
  [/crimes?\s*contra\s*a\s*pessoa/i, 'penal_2'],
  [/crimes?\s*contra\s*o\s*patrim[oô]nio/i, 'penal_3'],
  [/administra[cç][aã]o\s*p[uú]blica|funcionalismo/i, 'penal_4'],
  [/estatuto.*alagoas|lei\s*estadual|rj u|pol[ií]cia\s*civil\s*al/i, 'leg_al_2'],
  [/probabilidade|contagem|combinat/i, 'rlm_1'],
  [/raz[oõ]es?\s*e\s*propor/i, 'rlm_2'],
  [/regra\s*de\s*tr[eê]s/i, 'rlm_3'],
  [/porcentagem|percentual/i, 'rlm_4'],
  [/equa[cç]/i, 'rlm_5'],
  [/progress[aã]o|p\.?a\.?|p\.?g\.?/i, 'rlm_6'],
  [/l[oó]gica\s*proposicional|tabela.?verdade|conectivos?\s*l[oó]gic/i, 'rlm_9'],
  [/machine\s*learning|overfitting/i, 'dados_4'],
  [/crisp|data\s*mining|minera[cç]/i, 'dados_2'],
  [/pln|nlp|linguagem\s*natural/i, 'dados_3'],
  [/python.*dado|pandas|numpy/i, 'dados_5'],
  [/estruturado|n[aã]o\s*estruturado|etl|json|xml|csv/i, 'dados_1'],
];

function slug(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function statementHash(text) {
  return createHash('sha1').update(String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex');
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkJsonFiles(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'reports', '_parcial'].includes(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        // ignora relatórios/index
        if (/report|relatorio|index|inventario|estado/i.test(entry.name) && !/ready|ciclo|quest|banco|inedit|piloto/i.test(entry.name)) {
          if (!/ready|ciclo_0|pcal-|detona_|questoes|questions/i.test(entry.name)) continue;
        }
        if (/import-report|pdf-extract-report|relatorio-|estado-ciclos|inventario_/i.test(entry.name)) continue;
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

function extractQuestions(payload, sourceFile) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.questions)) return payload.questions;
  if (Array.isArray(payload.questoes)) return payload.questoes;
  if (Array.isArray(payload.items)) return payload.items;
  // arquivo single-question raro
  if (payload.enunciado || payload.statement) return [payload];
  return [];
}

function shortDiscipline(raw) {
  const key = slug(raw);
  if (DISCIPLINE_MAP[key]) return DISCIPLINE_MAP[key];
  // port_3 → port
  const m = String(raw || '').match(/^(port|ti|ciber|rlm|dh|etica|penal|proc|const|adm|leg_al|leg_esp|contab|fin|estat|dados)(?:_|$)/i);
  if (m) return m[1].toLowerCase();
  return key || 'geral';
}

function guessTopicFromText(q, shortDisc) {
  const blob = [q.assunto, q.subtopico, q.topicoEdital, q.microtopico, q.enunciado, q.statement]
    .filter(Boolean)
    .join(' \n ');
  for (const [re, id] of TEXT_TOPIC_HINTS) {
    if (re.test(blob) && id.startsWith(`${shortDisc}_`)) return id;
  }
  for (const [re, id] of TEXT_TOPIC_HINTS) {
    if (re.test(blob)) return id;
  }
  return `${shortDisc}_1`;
}

function normalizeIncoming(raw, sourceLabel) {
  if (!raw || typeof raw !== 'object') return null;
  const enunciado = String(raw.enunciado || raw.statement || '').trim();
  if (!enunciado) return null;

  let topico = String(raw.topicoEditalId || raw.subtopic_id || raw.mappedTopicoEditalId || '').trim();
  let discShort = shortDiscipline(raw.disciplinaId || raw.disciplina || raw.discipline_id || '');
  if (topico && /^[a-z]+_\d/.test(topico)) {
    discShort = shortDiscipline(topico.split('_')[0]);
  }
  if (!discShort || discShort === 'geral' || discShort === 'sem_disciplina') {
    discShort = shortDiscipline(raw.disciplinaId || raw.metadata?.disciplinaCurta || '');
  }
  if (!topico) {
    topico = guessTopicFromText(raw, discShort || 'port');
    discShort = shortDiscipline(topico.split('_')[0]);
  }

  // se topico de outra disciplina, realinha short
  const topShort = topico.split('_')[0];
  if (DISCIPLINE_MAP[topShort] || FILE_BY_SHORT[topShort]) {
    discShort = DISCIPLINE_MAP[topShort] || topShort;
  }

  const tipoRaw = slug(raw.tipo || raw.format || '');
  const tipo = tipoRaw.includes('multipla') || tipoRaw.includes('multipla_escolha')
    ? 'multipla_escolha'
    : 'certo_errado';

  let alternativas = Array.isArray(raw.alternativas) ? raw.alternativas : [];
  if (!alternativas.length && Array.isArray(raw.options)) {
    alternativas = raw.options.map((opt, i) => {
      if (typeof opt === 'string') {
        const letter = String.fromCharCode(65 + i);
        return { letra: letter, texto: opt };
      }
      return {
        letra: opt.letra || opt.label || String.fromCharCode(65 + i),
        texto: opt.texto || opt.text || '',
        comentario: opt.comentario || '',
      };
    }).filter((a) => a.texto);
  }

  let resposta = raw.respostaCorreta ?? raw.correct_answer ?? raw.gabarito ?? '';
  if (typeof resposta === 'boolean') resposta = resposta ? 'C' : 'E';
  resposta = String(resposta).trim().toUpperCase()
    .replace(/^(CERTO|CORRETO|TRUE|V)$/, 'C')
    .replace(/^(ERRADO|FALSE|F)$/, 'E');

  if (tipo === 'multipla_escolha' && !alternativas.length) return null;
  if (tipo === 'certo_errado' && !['C', 'E'].includes(resposta)) {
    // tenta inferir de correct_answer bool-like já tratado
    return null;
  }
  if (tipo === 'multipla_escolha') {
    const letters = new Set(alternativas.map((a) => String(a.letra || '').toUpperCase()));
    if (!letters.has(resposta)) {
      // se resposta for índice
      const idx = Number(resposta);
      if (Number.isInteger(idx) && alternativas[idx]) resposta = String(alternativas[idx].letra).toUpperCase();
      else return null;
    }
  }

  const id = String(raw.id || `auto_${statementHash(enunciado).slice(0, 12)}`);
  // Normaliza aliases de arquivo de disciplina (dir_constitucional → direito_constitucional)
  let discFile = FILE_BY_SHORT[discShort] || raw.disciplinaId || discShort;
  const discFileShort = shortDiscipline(discFile);
  if (FILE_BY_SHORT[discFileShort]) discFile = FILE_BY_SHORT[discFileShort];
  // ciber fica separado; ti crimes e ti geral no edital compartilham ti_* mas se topico for ciber_* → ciber
  if (String(topico).startsWith('ciber_')) discFile = 'seguranca_cibernetica';
  if (String(topico).startsWith('ti_') && discFile === 'seguranca_cibernetica') discFile = 'tecnologia_informacao';
  if (String(topico).startsWith('const_')) discFile = 'direito_constitucional';
  if (String(topico).startsWith('leg_al_')) discFile = 'legislacao_estadual_estatutos_de_alagoas';
  if (String(topico).startsWith('etica_')) discFile = 'etica';
  if (String(topico).startsWith('contab_')) discFile = 'contabilidade';
  if (String(topico).startsWith('estat_')) discFile = 'estatistica';
  if (String(topico).startsWith('rlm_')) discFile = 'raciocinio_logico_matematico';
  if (String(topico).startsWith('penal_')) discFile = 'direito_penal';
  if (String(topico).startsWith('dh_')) discFile = 'direitos_humanos';
  if (String(topico).startsWith('port_')) discFile = 'lingua_portuguesa';
  if (String(topico).startsWith('dados_')) discFile = 'analise_de_dados';

  return {
    id,
    concursoId: raw.concursoId || 'pc_al_2026',
    cargoId: raw.cargoId || 'agente_policia',
    disciplinaId: discFile,
    topicoEditalId: topico,
    subtopic_id: topico,
    assunto: raw.assunto || '',
    subtopico: raw.subtopico || raw.topicoEdital || '',
    microtopico: raw.microtopico || '',
    banca: raw.banca || '',
    ano: raw.ano ?? null,
    fonteProva: raw.fonteProva || raw.fonte || '',
    tipo,
    enunciado,
    contextoCompartilhado: raw.contextoCompartilhado || raw.contexto || '',
    alternativas: tipo === 'certo_errado' ? [] : alternativas.map((a) => ({
      letra: String(a.letra || '').toUpperCase(),
      texto: String(a.texto || ''),
      comentario: a.comentario || '',
    })),
    respostaCorreta: resposta,
    explicacao: String(raw.explicacao || raw.explanation || 'Sem resolução.'),
    status: raw.status === 'revisao' ? 'revisao' : 'revisada',
    versao: Number(raw.versao) || 1,
    dificuldade: raw.dificuldade || '',
    pegadinhaDaBanca: raw.pegadinhaDaBanca || '',
    metadata: {
      ...(raw.metadata || {}),
      organizadoEm: new Date().toISOString(),
      origemImport: sourceLabel,
      disciplinaCurta: discShort,
    },
  };
}

function topicQuality(q) {
  const topic = String(q?.topicoEditalId || '');
  if (!topic || topic === 'sem_topico' || topic.endsWith('_1') && !q?.metadata?.origemImport?.includes('banco-organizado')) {
    // tópico vazio pior; *_1 genérico médio; organizado alto
  }
  let score = 0;
  if (topic && topic !== 'sem_topico') score += 10;
  score += Math.min(5, topic.split('_').filter(Boolean).length);
  if (String(q?.metadata?.origemImport || '').includes('banco-organizado')) score += 20;
  if (String(q?.metadata?.origemImport || '').includes('ciclos-ready')) score += 8;
  if (String(q?.metadata?.origemImport || '').includes('curated')) score += 12;
  if (q?.explicacao && q.explicacao.length > 40) score += 2;
  return score;
}

async function loadAllSources(report) {
  const byId = new Map();
  const byHash = new Map();

  for (const source of EXTERNAL_SOURCES) {
    const isFile = source.toLowerCase().endsWith('.json');
    if (!(await exists(source))) {
      report.fontesAusentes.push(source);
      continue;
    }
    report.fontesLidas.push(source);
    const files = isFile ? [source] : await walkJsonFiles(source);
    for (const file of files) {
      if (file.startsWith(OUT_BY_TOPIC)) continue;
      if (file.startsWith(OUT_DIR) && !file.includes(`${path.sep}curated${path.sep}`)) continue;
      if (path.basename(file) === 'index.json') continue;
      let payload;
      try {
        payload = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch {
        report.arquivosInvalidos.push(file);
        continue;
      }
      const list = extractQuestions(payload, file);
      report.arquivosProcessados += 1;
      report.linhasLidas += list.length;
      const label = path.relative(path.resolve(APP_ROOT, '../..'), file);
      for (const raw of list) {
        const q = normalizeIncoming(raw, label);
        if (!q) {
          report.ignoradas.push({ id: raw?.id || null, motivo: 'invalida_ou_sem_enunciado', fonte: label });
          continue;
        }
        const hash = statementHash(q.enunciado);
        if (byId.has(q.id)) {
          report.duplicadasId += 1;
          const prev = byId.get(q.id);
          if (topicQuality(q) > topicQuality(prev)) {
            byId.set(q.id, q);
            byHash.set(hash, q.id);
          }
          continue;
        }
        if (byHash.has(hash)) {
          report.duplicadasHash += 1;
          const prevId = byHash.get(hash);
          const prev = byId.get(prevId);
          if (prev && topicQuality(q) > topicQuality(prev)) {
            byId.delete(prevId);
            byId.set(q.id, q);
            byHash.set(hash, q.id);
          }
          continue;
        }
        byId.set(q.id, q);
        byHash.set(hash, q.id);
      }
    }
  }
  return [...byId.values()];
}

async function writeOutputs(questions, dryRun, report) {
  const byDisc = new Map();
  const byTopic = new Map();
  for (const q of questions) {
    const disc = q.disciplinaId || 'outros';
    if (!byDisc.has(disc)) byDisc.set(disc, []);
    byDisc.get(disc).push(q);
    const topic = q.topicoEditalId || 'sem_topico';
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(q);
  }

  report.porDisciplina = {};
  report.porTopico = {};
  for (const [disc, list] of byDisc) {
    report.porDisciplina[disc] = list.length;
  }
  for (const [topic, list] of byTopic) {
    report.porTopico[topic] = list.length;
  }

  if (dryRun) return;

  await fs.mkdir(OUT_DIR, { recursive: true });
  // remove JSONs flat antigos (mantém curated/)
  for (const name of await fs.readdir(OUT_DIR)) {
    const full = path.join(OUT_DIR, name);
    const st = await fs.stat(full);
    if (st.isFile() && name.endsWith('.json')) await fs.unlink(full);
    if (st.isDirectory() && name === 'por-subtopico') {
      await fs.rm(full, { recursive: true, force: true });
    }
  }
  await fs.mkdir(OUT_BY_TOPIC, { recursive: true });

  const disciplinas = [];
  for (const [disc, list] of [...byDisc.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const file = `${disc}.json`;
    const target = path.join(OUT_DIR, file);
    const serialized = `${JSON.stringify(list, null, 2)}\n`;
    await fs.writeFile(target, serialized, 'utf8');

    // por subtópico
    const topicGroups = Map.groupBy(list, (q) => q.topicoEditalId || 'sem_topico');
    const discTopicDir = path.join(OUT_BY_TOPIC, disc);
    await fs.mkdir(discTopicDir, { recursive: true });
    for (const [topic, tList] of topicGroups) {
      await fs.writeFile(
        path.join(discTopicDir, `${topic}.json`),
        `${JSON.stringify({ topicoEditalId: topic, disciplinaId: disc, quantidade: tList.length, questions: tList }, null, 2)}\n`,
        'utf8',
      );
    }

    const byTipo = Object.fromEntries([...Map.groupBy(list, (q) => q.tipo || '')].map(([k, v]) => [k, v.length]));
    const byBanca = Object.fromEntries([...Map.groupBy(list, (q) => q.banca || '—')].map(([k, v]) => [k, v.length]));
    disciplinas.push({
      id: disc,
      arquivo: `./data/questions/${file}`,
      quantidade: list.length,
      porTipo: byTipo,
      porBanca: byBanca,
      hash: createHash('sha256').update(serialized).digest('hex'),
      versao: 1,
    });
  }

  const index = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    disciplinas,
    quantidade: questions.length,
    porSubtopicoDir: './data/questions/por-subtopico',
  };
  await fs.writeFile(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  report.disciplinasGeradas = disciplinas.map((d) => d.id);
  report.arquivosJsonCriados = disciplinas.length + 1;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const report = {
    geradoEm: new Date().toISOString(),
    dryRun,
    fontesLidas: [],
    fontesAusentes: [],
    arquivosProcessados: 0,
    linhasLidas: 0,
    arquivosInvalidos: [],
    duplicadasId: 0,
    duplicadasHash: 0,
    ignoradas: [],
    totalFinal: 0,
    porDisciplina: {},
    porTopico: {},
    disciplinasGeradas: [],
    arquivosJsonCriados: 0,
  };

  const questions = await loadAllSources(report);
  report.totalFinal = questions.length;
  await writeOutputs(questions, dryRun, report);

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    total: report.totalFinal,
    disciplinas: report.porDisciplina,
    topicos: Object.keys(report.porTopico).length,
    fontes: report.fontesLidas.length,
    ausentes: report.fontesAusentes.length,
    report: REPORT_PATH,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err.stack || err);
    process.exitCode = 1;
  });
}
