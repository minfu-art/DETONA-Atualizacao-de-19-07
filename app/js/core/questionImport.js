import { STORES, putMany, getAll, getMeta, setMeta, remove } from './db.js';
import {
  QUESTION_SCHEMA_VERSION,
  normalizeQuestion,
  normalizeComparableText,
  isDemoQuestion,
} from './questionSchema.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { questionService } from '../services/questionService.js';

export { isDemoQuestion };

export const IMPORT_SUBTOPIC_MAP = {
  lingua_portuguesa_encontros_vocalicos: 'port_3', lingua_portuguesa_regras_gerais_de_acentuacao: 'port_3',
  lingua_portuguesa_emprego_do_hifen: 'port_3', lingua_portuguesa_acentuacao_do_hiato: 'port_3',
  lingua_portuguesa_acentos_diferenciais: 'port_3', lingua_portuguesa_ortografia_oficial: 'port_3',
  lingua_portuguesa_siglas_e_abreviacoes: 'port_3', lingua_portuguesa_uso_de_letras_maiusculas_e_minusculas: 'port_3',
  lingua_portuguesa_conjuncao: 'port_4_1', lingua_portuguesa_pronomes: 'port_5_8',
  lingua_portuguesa_adverbio: 'port_5_1', lingua_portuguesa_adjetivo: 'port_5_1',
  lingua_portuguesa_substantivo: 'port_5_1', lingua_portuguesa_expressoes_com_substantivo_e_adjetivo: 'port_5_1',
  lingua_portuguesa_expressoes_problematicas: 'port_6_1', lingua_portuguesa_palavras_especiais: 'port_6_1',
  direitos_humanos_1: 'dh_1', direitos_humanos_6: 'dh_6', etica_servico_publico_1: 'etica_2',
  etica_servico_publico_5_1: 'etica_5', dir_constitucional_1: 'const_1', dir_constitucional_1_1: 'const_1',
  dir_constitucional_1_2: 'const_2', legislacao_alagoas_1: 'leg_al_1', legislacao_alagoas_2: 'leg_al_2',
  legislacao_alagoas_3: 'leg_al_3',
};

export function decodeHtml(value) {
  if (!value) return '';
  let text = String(value);
  text = text.replace(/&#(\d+);/g, (_, number) => String.fromCharCode(Number(number)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const entities = {
    '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&apos;': "'",
    '&aacute;': 'á', '&Aacute;': 'Á', '&eacute;': 'é', '&Eacute;': 'É', '&iacute;': 'í', '&Iacute;': 'Í',
    '&oacute;': 'ó', '&Oacute;': 'Ó', '&uacute;': 'ú', '&Uacute;': 'Ú', '&atilde;': 'ã', '&Atilde;': 'Ã',
    '&otilde;': 'õ', '&Otilde;': 'Õ', '&ccedil;': 'ç', '&Ccedil;': 'Ç', '&acirc;': 'â', '&Acirc;': 'Â',
    '&ecirc;': 'ê', '&Ecirc;': 'Ê', '&ocirc;': 'ô', '&Ocirc;': 'Ô', '&agrave;': 'à', '&Agrave;': 'À',
  };
  text = text.replace(/&[a-zA-Z]+;/g, (entity) => entities[entity] || entity);
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

export function buildQuestionContext(subtopics) {
  const validIds = new Set(subtopics.map((subtopic) => subtopic.id));
  const byNum = {}; const byId = {};
  subtopics.forEach((subtopic) => {
    byNum[subtopic.edital_numbering] = subtopic.id;
    byNum[subtopic.id] = subtopic.id;
    byNum[`${subtopic.discipline_id}_${subtopic.edital_numbering}`] = subtopic.id;
    byId[subtopic.id] = subtopic;
  });
  return { validIds, byNum, byId };
}

export function normalizeQuestionItem(item, validIds, byNum, index = 0, byId = {}) {
  if (!item) return { error: 'item vazio' };
  let sid = item.topicoEditalId || item.subtopic_id;
  if (IMPORT_SUBTOPIC_MAP[sid]) sid = IMPORT_SUBTOPIC_MAP[sid];
  if (!validIds.has(sid) && byNum[sid]) sid = byNum[sid];
  if (!validIds.has(sid) && item.edital_numbering && byNum[item.edital_numbering]) sid = byNum[item.edital_numbering];
  if (!validIds.has(sid) && item.discipline_id === 'lingua_portuguesa') sid = 'port_3';
  if (!validIds.has(sid)) return { error: `subtopic_id inválido: ${item.subtopic_id || item.topicoEditalId || index}` };

  const statement = decodeHtml(item.enunciado || item.statement || '');
  if (!statement) return { error: 'sem statement' };
  const rawOptions = Array.isArray(item.alternativas || item.options)
    ? (item.alternativas || item.options).map((option) => typeof option === 'string'
      ? decodeHtml(option)
      : { ...option, text: decodeHtml(option?.text || option?.label || option?.value || '') })
    : item.options;
  const subtopic = byId[sid];
  const enrichedExplanation = Object.fromEntries([
    'porqueCorreta', 'porqueAlternativaA', 'porqueAlternativaB', 'porqueAlternativaC', 'porqueAlternativaD',
    'porqueAlternativaE', 'pegadinhaDaBanca', 'dicaDeMemorizacao', 'resumo',
  ].map((key) => [key, decodeHtml(item[key] || '')]));
  const question = normalizeQuestion({
    ...item, ...enrichedExplanation, statement, options: rawOptions,
    explanation: decodeHtml(item.explicacao || item.explanation || item.resolucao || 'Sem resolução.') || 'Sem resolução.',
    is_user_created: item.is_user_created !== false && !String(item.id || '').startsWith('q_import_'),
  }, {
    topicoEditalId: sid, topicoEdital: item.topicoEdital || item.subtopic_name || subtopic?.name || '',
    disciplina: item.disciplina || item.discipline || item.discipline_id || subtopic?.discipline_id || '',
    concursoId: item.concursoId || 'pc_al_2026',
  });
  return { question };
}

export function normalizeQuestionCollection(items, subtopics) {
  const context = buildQuestionContext(subtopics);
  const questions = []; const errors = [];
  items.forEach((item, index) => {
    const result = normalizeQuestionItem(item, context.validIds, context.byNum, index, context.byId);
    if (result.error) errors.push(`#${index + 1}: ${result.error}`);
    else questions.push(result.question);
  });
  const groups = new Map();
  questions.forEach((question) => {
    const key = normalizeComparableText(question.statement);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(question);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const question of group) {
      question.situacao = 'revisao';
      question.metadata = { ...question.metadata, reviewReason: question.metadata?.reviewReason || 'enunciado duplicado; revisão manual necessária' };
    }
  }
  return { questions, errors };
}

export function parseImportPayload(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Conteúdo vazio');
  if (text.startsWith('[') || text.startsWith('{')) {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : (data.questions || data.items || [data]);
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV vazio');
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line); const item = {};
    headers.forEach((header, index) => { item[header] = columns[index]; });
    if (item.correct_answer === 'true') item.correct_answer = true;
    if (item.correct_answer === 'false') item.correct_answer = false;
    return item;
  });
}

function parseCsvLine(line) {
  const output = []; let current = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { output.push(current); current = ''; }
    else current += character;
  }
  output.push(current);
  return output.map((value) => value.trim());
}

export async function forgeQuestionsFromItems(items) {
  const subtopics = await getAll(STORES.subtopics);
  const { questions: forged, errors } = normalizeQuestionCollection(items, subtopics);
  const bySubtopic = {};
  forged.forEach((question) => { bySubtopic[question.subtopic_id] = (bySubtopic[question.subtopic_id] || 0) + 1; });
  for (let index = 0; index < forged.length; index += 80) await putMany(STORES.questions, forged.slice(index, index + 80));
  return { forged: forged.length, errors, bySubtopic, review: forged.filter((question) => question.situacao === 'revisao').length };
}

const QUESTION_PACKS = [
  { url: './data/questions/curated/detona_ineditas_analise_de_dados.json', meta: 'detona_ineditas_analise_dados_v1', label: 'QUESTÕES DETONA INÉDITAS — Análise de Dados' },
  { url: './data/questions/curated/detona_piloto_25_xlsx.json', meta: 'detona_piloto_25_xlsx_v1', label: 'QUESTÕES DETONA INÉDITAS — Piloto XLSX' },
  { url: './js/data/questions_pc_al_port.json', meta: 'import_pc_al_port_v1', label: 'Português' },
  { url: './js/data/questions_pc_al_lote.json', meta: 'import_pc_al_lote_v1', label: 'Lote Const/Ética/LegAL/DH' },
];

export async function ensureQuestionPack() {
  const results = []; let totalForged = 0;
  for (const pack of QUESTION_PACKS) {
    if (await getMeta(pack.meta)) { results.push({ pack: pack.label, already: true, forged: 0 }); continue; }
    try {
      const response = await fetch(pack.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = await response.json();
      if (!Array.isArray(items) || !items.length) throw new Error('pacote vazio');
      const result = await forgeQuestionsFromItems(items.map((question) => ({ ...question, is_user_created: false })));
      await setMeta(pack.meta, true); await setMeta(`${pack.meta}_count`, result.forged);
      totalForged += result.forged; results.push({ pack: pack.label, already: false, ...result });
    } catch (error) {
      console.warn(`Pacote ${pack.label} não carregado:`, error);
      results.push({ pack: pack.label, already: false, forged: 0, error: String(error.message || error) });
    }
  }
  try {
    const index = await questionRepository.carregarIndice();
    const signature = (index.disciplinas || []).map((item) => `${item.id}:${item.hash || item.versao}`).join('|');
    if ((await getMeta('generated_question_pack_signature')) !== signature) {
      const [generated, existing] = await Promise.all([
        questionService.listar({ mode: 'json' }), getAll(STORES.questions),
      ]);
      const existingIds = new Set(existing.map((question) => String(question.id)));
      const additions = generated.filter((question) => !existingIds.has(String(question.id)));
      for (let index = 0; index < additions.length; index += 80) await putMany(STORES.questions, additions.slice(index, index + 80));
      await setMeta('generated_question_pack_signature', signature);
      await setMeta('generated_question_pack_count', additions.length);
      totalForged += additions.length;
      results.push({ pack: 'Bancos XLSX validados', already: false, forged: additions.length, collisions: generated.length - additions.length });
    } else results.push({ pack: 'Bancos XLSX validados', already: true, forged: 0 });
  } catch (error) {
    console.warn('Bancos XLSX validados não carregados:', error);
    results.push({ pack: 'Bancos XLSX validados', already: false, forged: 0, error: String(error.message || error) });
  }
  return { packs: results, forged: totalForged };
}

export async function migrateStoredQuestions() {
  const currentVersion = Number(await getMeta('question_schema_version') || 0);
  if (currentVersion >= QUESTION_SCHEMA_VERSION) return { migrated: 0, already: true };
  const [items, subtopics] = await Promise.all([getAll(STORES.questions), getAll(STORES.subtopics)]);
  const { questions, errors } = normalizeQuestionCollection(items, subtopics);
  if (errors.length || questions.length !== items.length) throw new Error(`Migração bloqueada: ${errors.length} erro(s) estrutural(is).`);
  const groups = new Map();
  questions.forEach((question) => {
    const key = normalizeComparableText(question.statement);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(question);
  });
  const duplicates = [...groups.values()].filter((group) => group.length > 1).map((group) => group.map((question) => question.id));
  for (let index = 0; index < questions.length; index += 80) await putMany(STORES.questions, questions.slice(index, index + 80));
  await setMeta('question_schema_version', QUESTION_SCHEMA_VERSION);
  await setMeta('question_migration_report', {
    migratedAt: new Date().toISOString(), total: questions.length, duplicates,
    reviewIds: questions.filter((question) => question.situacao === 'revisao').map((question) => question.id),
  });
  return { migrated: questions.length, duplicates, already: false };
}

/**
 * Remove do IndexedDB todas as questões demo legadas (seed antigo).
 * Idempotente — seguro chamar a cada bootstrap.
 */
export async function removeDemoQuestions() {
  const already = await getMeta('demo_questions_purged_v1');
  const all = await getAll(STORES.questions);
  const demos = all.filter((question) => isDemoQuestion(question));
  if (!demos.length) {
    await setMeta('demo_questions', false);
    if (!already) await setMeta('demo_questions_purged_v1', true);
    return 0;
  }
  for (const question of demos) await remove(STORES.questions, question.id);
  await setMeta('demo_questions', false);
  await setMeta('demo_questions_purged_v1', {
    at: new Date().toISOString(),
    removed: demos.length,
    idsSample: demos.slice(0, 5).map((q) => q.id),
  });
  try {
    questionRepository.limparCache?.();
  } catch { /* ignore */ }
  return demos.length;
}
