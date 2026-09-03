#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const draftRoot = path.join(repositoryRoot, 'course-drafts', 'pc-pe-2027-agente');
const bundleRoot = path.join(draftRoot, 'course-bundle');
const curriculumPath = path.join(bundleRoot, 'curriculum.json');
const initialBankPath = path.join(bundleRoot, 'questions', '001-pcpe-agente-2027-banco-inicial-autoral.json');
const outputPath = path.join(bundleRoot, 'questions', '002-pcpe-agente-2027-reuso-banco-interno.json');
const auditPath = path.join(draftRoot, 'internal-question-reuse-audit.v1.json');
const contestId = 'pc_pe_2027';

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const exactField = (field, value) => (question) => normalize(question[field]) === normalize(value);
const includesText = (...terms) => (question) => {
  const haystack = normalize([
    question.assunto,
    question.subtopico,
    question.topicoEditalId,
    question.enunciado,
  ].join(' '));
  return terms.some((term) => haystack.includes(normalize(term)));
};
const all = (...predicates) => (question) => predicates.every((predicate) => predicate(question));
const any = (...predicates) => (question) => predicates.some((predicate) => predicate(question));

const rules = [
  {
    discipline: 'Noções de Direito Constitucional',
    target: 'Segurança pública na Constituição do Estado de Pernambuco',
    source: 'direito_constitucional',
    limit: 8,
    match: exactField('assunto', 'Segurança Pública'),
    note: 'Conteúdo constitucional geral de segurança pública; exige conferência final com a Constituição de Pernambuco.',
  },
  {
    discipline: 'Noções de Direito Penal',
    target: 'Irretroatividade da lei penal',
    source: 'direito_penal',
    limit: 2,
    match: all(exactField('assunto', 'Aplicação da Lei Penal'), includesText('retroativ', 'novatio legis')),
  },
  {
    discipline: 'Noções de Direito Penal',
    target: 'Crimes contra a pessoa',
    source: 'direito_penal',
    limit: 10,
    match: exactField('assunto', 'Crimes Contra a Pessoa'),
  },
  {
    discipline: 'Língua Portuguesa',
    target: 'Tipos e gêneros textuais',
    source: 'lingua_portuguesa',
    limit: 8,
    match: all(
      exactField('assunto', 'Tipologia, compreensão e interpretação de texto'),
      includesText('tipologia', 'genero textual', 'narrativ', 'descritiv', 'dissertativ'),
    ),
  },
  {
    discipline: 'Língua Portuguesa',
    target: 'Compreensão e interpretação de textos de gêneros variados',
    source: 'lingua_portuguesa',
    limit: 10,
    match: exactField('assunto', 'Tipologia, compreensão e interpretação de texto'),
  },
  {
    discipline: 'Língua Portuguesa',
    target: 'Coordenação entre orações e termos',
    source: 'lingua_portuguesa',
    limit: 10,
    match: all(
      any(exactField('topicoEditalId', 'port_5_2'), includesText('coordenacao', 'coordenada')),
      includesText('coorden', 'conjuncao coordenativa'),
    ),
  },
  {
    discipline: 'Língua Portuguesa',
    target: 'Subordinação entre orações e termos',
    source: 'lingua_portuguesa',
    limit: 10,
    match: includesText('subordin', 'oracao adjetiva', 'oracao substantiva', 'oracao adverbial'),
  },
  {
    discipline: 'Língua Portuguesa',
    target: 'Substituição de palavras ou trechos',
    source: 'lingua_portuguesa',
    limit: 8,
    match: includesText('substituicao de', 'substituido por', 'substituida por'),
  },
  {
    discipline: 'Língua Portuguesa',
    target: 'Reorganização de orações e períodos',
    source: 'lingua_portuguesa',
    limit: 10,
    match: exactField('subtopico', 'Reorganização estrutural de frases'),
  },
  {
    discipline: 'Língua Portuguesa',
    target: 'Reescrita em diferentes gêneros e níveis de formalidade',
    source: 'lingua_portuguesa',
    limit: 10,
    match: exactField('subtopico', 'Reescrita em diferentes gêneros e formalidade'),
  },
  {
    discipline: 'Informática',
    target: 'Fundamentos e interface do Windows',
    source: 'tecnologia_informacao',
    limit: 5,
    match: includesText('windows 10', 'sistema operacional windows', 'ambiente windows'),
  },
  {
    discipline: 'Informática',
    target: 'Grupos de discussão e redes sociais',
    source: 'tecnologia_informacao',
    limit: 3,
    match: exactField('assunto', 'Redes Sociais - Multibancas'),
  },
  {
    discipline: 'Informática',
    target: 'Deep Web e Dark Web',
    source: 'tecnologia_informacao',
    limit: 2,
    match: includesText('deep web', 'dark web'),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Divisão proporcional',
    source: 'raciocinio_logico_matematico',
    limit: 3,
    match: exactField('assunto', 'Razão e Proporção'),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Equações e inequações de primeiro e segundo graus',
    source: 'raciocinio_logico_matematico',
    limit: 8,
    match: any(
      exactField('assunto', 'Equações de Primeiro Grau'),
      exactField('assunto', 'Equações de Segundo Grau'),
      includesText('inequacoes'),
    ),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Funções e gráficos',
    source: 'raciocinio_logico_matematico',
    limit: 8,
    match: any(
      exactField('assunto', 'Introdução às Funções'),
      exactField('assunto', 'Função do 1° grau'),
      exactField('assunto', 'Função do Segundo Grau'),
      exactField('assunto', 'Gráfico da Função do 2º Grau'),
    ),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Estruturas lógicas',
    source: 'raciocinio_logico_matematico',
    limit: 8,
    match: exactField('assunto', 'Estrutura Básica e Classificação'),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Inferências',
    source: 'raciocinio_logico_matematico',
    limit: 8,
    match: exactField('assunto', 'Lógica de Argumentação - Argumentos Dedutivos'),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Proposições simples e compostas',
    source: 'raciocinio_logico_matematico',
    limit: 8,
    match: any(exactField('assunto', 'Proposições Simples'), exactField('assunto', 'Proposições Compostas')),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Diagramas lógicos',
    source: 'raciocinio_logico_matematico',
    limit: 8,
    match: exactField('assunto', 'Diagramas Lógicos'),
  },
  {
    discipline: 'Raciocínio Lógico',
    target: 'Problemas aritméticos, geométricos e matriciais',
    source: 'raciocinio_logico_matematico',
    limit: 8,
    match: any(
      exactField('assunto', 'Situações Problemas'),
      exactField('assunto', 'Operações Básicas'),
      exactField('assunto', 'Frações'),
    ),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Conceitos, objetivos e finalidades da contabilidade',
    source: 'contabilidade',
    limit: 8,
    match: exactField('assunto', 'Aspectos Introdutórios'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Fatos modificativos',
    source: 'contabilidade',
    limit: 4,
    match: includesText('fato modificativo', 'fatos modificativos'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Conceito e elenco de contas',
    source: 'contabilidade',
    limit: 6,
    match: includesText('plano de contas', 'elenco de contas'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Função e funcionamento das contas',
    source: 'contabilidade',
    limit: 6,
    match: includesText('natureza da conta', 'natureza das contas', 'saldo credor', 'saldo devedor'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Métodos e processos',
    source: 'contabilidade',
    limit: 6,
    match: includesText('partidas dobradas', 'metodo das partidas'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Juros, descontos e tributos',
    source: 'contabilidade',
    limit: 5,
    match: includesText('juros', 'desconto', 'tributo'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Aluguéis e variações monetária e cambial',
    source: 'contabilidade',
    limit: 5,
    match: includesText('aluguel', 'variacao monetaria', 'variacao cambial'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Folha de pagamento',
    source: 'contabilidade',
    limit: 4,
    match: includesText('folha de pagamento', 'salarios a pagar'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Compras, vendas e provisões',
    source: 'contabilidade',
    limit: 8,
    match: any(
      exactField('assunto', 'Operações Diversas'),
      exactField('assunto', 'Estoques'),
      exactField('assunto', 'Provisões, Passivos Contingentes e Ativos Contingentes'),
    ),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Depreciações e baixa de bens',
    source: 'contabilidade',
    limit: 8,
    match: exactField('assunto', 'Depreciação, Exaustão e Ativo Imobilizado'),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Conceito, objetivo e composição',
    topicIncludes: '10. Demonstração do resultado do exercício',
    source: 'contabilidade',
    limit: 8,
    match: any(exactField('assunto', 'Apuração do Resultado'), includesText('demonstracao do resultado', ' dre ')),
  },
  {
    discipline: 'Contabilidade Geral',
    target: 'Normas Brasileiras de Contabilidade',
    source: 'contabilidade',
    limit: 4,
    match: includesText('normas brasileiras de contabilidade'),
  },
  {
    discipline: 'Estatística',
    target: 'Gráficos, diagramas e tabelas',
    source: 'estatistica',
    limit: 3,
    match: exactField('assunto', 'Outros Gráficos e Representações'),
  },
  {
    discipline: 'Estatística',
    target: 'Assimetria e curtose',
    source: 'estatistica',
    limit: 4,
    match: any(exactField('assunto', 'Assimetria'), exactField('assunto', 'Curtose')),
  },
  {
    discipline: 'Estatística',
    target: 'Definições básicas e axiomas',
    source: 'estatistica',
    limit: 5,
    match: all(exactField('assunto', 'Conceitos Iniciais'), includesText('probabilidade', 'evento', 'espaco amostral')),
  },
  {
    discipline: 'Estatística',
    target: 'Tamanho amostral',
    source: 'estatistica',
    limit: 3,
    match: includesText('tamanho amostral', 'tamanho da amostra'),
  },
];

function curriculumIndex(curriculum) {
  const matches = [];
  for (const role of curriculum.roles || []) {
    for (const discipline of role.disciplines || []) {
      for (const topic of discipline.topics || []) {
        for (const subtopic of topic.subtopics || []) {
          matches.push({ discipline: discipline.name, topic: topic.name, subtopic: subtopic.name, id: subtopic.id });
        }
      }
    }
  }
  return matches;
}

function findTarget(index, rule) {
  const candidates = index.filter((entry) => (
    entry.discipline === rule.discipline
    && entry.subtopic === rule.target
    && (!rule.topicIncludes || entry.topic.includes(rule.topicIncludes))
  ));
  if (candidates.length !== 1) {
    throw new Error(`Destino ambíguo ou ausente (${candidates.length}): ${rule.discipline} :: ${rule.target}`);
  }
  return candidates[0];
}

function isReusable(question) {
  return question.status === 'revisada'
    && question.tipo === 'certo_errado'
    && ['C', 'E'].includes(question.respostaCorreta)
    && normalize(question.enunciado).length >= 20
    && normalize(question.explicacao).length >= 20;
}

const curriculum = JSON.parse(await readFile(curriculumPath, 'utf8'));
if (curriculum.contest_id !== contestId) throw new Error('Currículo pertence a outro concurso.');
const curriculumEntries = curriculumIndex(curriculum);
const validSubtopicIds = new Set(curriculumEntries.map(({ id }) => id));
const initialBank = JSON.parse(await readFile(initialBankPath, 'utf8'));
const initialStatements = new Set(initialBank.questions.map(({ statement }) => normalize(statement)));
const usedSourceIds = new Set();
const usedStatements = new Set(initialStatements);
const bankCache = new Map();
const selected = [];
const ruleAudit = [];

for (const rule of rules) {
  if (!bankCache.has(rule.source)) {
    const sourcePath = path.join(repositoryRoot, 'app', 'data', 'questions', `${rule.source}.json`);
    bankCache.set(rule.source, JSON.parse(await readFile(sourcePath, 'utf8')));
  }
  const target = findTarget(curriculumEntries, rule);
  const candidates = bankCache.get(rule.source)
    .filter(isReusable)
    .filter(rule.match)
    .filter((question) => !usedSourceIds.has(question.id))
    .filter((question) => !usedStatements.has(normalize(question.enunciado)))
    .slice(0, rule.limit);

  for (const question of candidates) {
    usedSourceIds.add(question.id);
    usedStatements.add(normalize(question.enunciado));
    selected.push({ question, target, rule });
  }

  ruleAudit.push({
    discipline: rule.discipline,
    target_subtopic: rule.target,
    target_subtopic_id: target.id,
    source_bank: `${rule.source}.json`,
    selected: candidates.length,
    limit: rule.limit,
    note: rule.note || null,
  });
}

const questions = selected.map(({ question, target, rule }, index) => ({
  id: `pc_pe_2027_agente_reuso_${String(index + 1).padStart(4, '0')}`,
  contest_id: contestId,
  subtopic_id: target.id,
  statement: question.enunciado.trim(),
  options: ['Certo', 'Errado'],
  correct_answer: question.respostaCorreta === 'C',
  explanation: question.explicacao.trim(),
  source: `Banco interno DETONA — ${question.fonteProva || question.banca || 'fonte preservada no cadastro original'}; item de origem ${question.id}`,
  format: 'certo_errado',
  status: 'draft',
  editorial_review: 'pending_pcpe_remap',
  provenance: {
    source_bank: `app/data/questions/${rule.source}.json`,
    source_question_id: question.id,
    source_status: question.status,
    source_board: question.banca || null,
    source_year: question.ano || null,
    source_exam: question.fonteProva || null,
    reuse_scope: 'internal_draft_only',
  },
}));

if (questions.length < 100) {
  throw new Error(`Reaproveitamento abaixo do mínimo de segurança: ${questions.length}; esperado pelo menos 100.`);
}
if (questions.some(({ subtopic_id: id }) => !validSubtopicIds.has(id))) {
  throw new Error('Há questão reaproveitada apontando para subtópico inexistente.');
}

const trueCount = questions.filter(({ correct_answer: answer }) => answer).length;
const falseCount = questions.length - trueCount;
const coveredByInitial = new Set(initialBank.questions.map(({ subtopic_id }) => subtopic_id));
const coveredByReuse = new Set(questions.map(({ subtopic_id }) => subtopic_id));
const combinedCoverage = new Set([...coveredByInitial, ...coveredByReuse]);
const pending = curriculumEntries.filter(({ id }) => !combinedCoverage.has(id));
const questionsByDiscipline = {};
for (const { target } of selected) {
  questionsByDiscipline[target.discipline] = (questionsByDiscipline[target.discipline] || 0) + 1;
}

const batch = {
  name: 'pcpe_agente_reuso_banco_interno_002',
  status: 'draft',
  generated_at: '2026-09-03',
  publication_authorized: false,
  questions,
};
const audit = {
  schema_version: 'detona_pcpe_internal_question_reuse_audit_v1',
  generated_at: '2026-09-03',
  contest_id: contestId,
  status: 'draft_editorial_remap_review_required',
  source_inventory: {
    total_internal_questions: 6480,
    eligible_sources_used: [...bankCache.keys()].map((name) => `app/data/questions/${name}.json`),
    selection_policy: 'Somente itens certo/errado com status revisada, gabarito e explicação válidos; seleção temática conservadora.',
  },
  totals: {
    reused_questions: questions.length,
    correct_true: trueCount,
    correct_false: falseCount,
    unique_source_questions: usedSourceIds.size,
    unique_statements: questions.length,
    subtopics_covered_by_reuse: coveredByReuse.size,
    subtopics_covered_combined: combinedCoverage.size,
    subtopics_pending_combined: pending.length,
    total_draft_questions_combined: initialBank.questions.length + questions.length,
  },
  questions_by_discipline: questionsByDiscipline,
  rules: ruleAudit,
  pending_subtopics: pending.map(({ discipline, topic, subtopic, id }) => ({
    discipline,
    topic,
    subtopic,
    subtopic_id: id,
  })),
  safeguards: {
    import_executed: false,
    publication_executed: false,
    sales_enabled: false,
    source_text_modified: false,
    requires_human_editorial_review: true,
    requires_pcpe_taxonomy_review: true,
    requires_normative_currency_review: true,
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outputPath, auditPath, ...audit.totals, questionsByDiscipline }, null, 2)}\n`);
