import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd(), 'course-drafts/pc-pe-2026-agente');
const bundleRoot = path.join(root, 'course-bundle');
const contestId = 'pc_pe_2026';
const roleId = 'pc_pe_2026_agente_policia';

const slugify = (value, maxLength = 28) => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, maxLength);

const topic = (number, name, subtopics = []) => ({
  number,
  name,
  subtopics: subtopics.length ? subtopics : [name],
});

const disciplines = [
  {
    key: 'legislacao_estadual',
    name: 'Legislação Estadual',
    topics: [
      topic('1', 'Constituição do Estado de Pernambuco', ['Artigos 101 a 105-B']),
      topic('2', 'Lei Estadual nº 6.425/1972', ['Estatuto do Policial Civil de Pernambuco']),
      topic('3', 'Lei Estadual nº 6.123/1968', ['Estatuto dos Funcionários Públicos Civis do Estado de Pernambuco']),
      topic('4', 'Lei Complementar Estadual nº 137/2008', ['Carreira e remuneração dos policiais civis de Pernambuco']),
      topic('5', 'Lei Complementar Estadual nº 317/2015', ['Organização e regime jurídico da Polícia Civil de Pernambuco']),
    ],
  },
  {
    key: 'nocoes_direito_constitucional',
    name: 'Noções de Direito Constitucional',
    topics: [
      topic('1', 'Constituição da República Federativa do Brasil de 1988', ['Princípios fundamentais', 'Poder constituinte originário, derivado e decorrente']),
      topic('2', 'Aplicabilidade das normas constitucionais'),
      topic('3', 'Direitos e garantias fundamentais'),
      topic('4', 'Organização político-administrativa do Estado', ['Estado federal brasileiro', 'União, estados, Distrito Federal, municípios e territórios']),
      topic('5', 'Administração pública', ['Disposições gerais', 'Servidores públicos']),
      topic('6', 'Poder Executivo'),
      topic('7', 'Poder Legislativo'),
      topic('8', 'Poder Judiciário'),
      topic('9', 'Funções essenciais à Justiça e defesa do Estado', ['Ministério Público', 'Advocacia Pública', 'Defensoria Pública', 'Defesa do Estado e das instituições democráticas', 'Segurança pública na Constituição do Estado de Pernambuco']),
    ],
  },
  {
    key: 'nocoes_direito_administrativo',
    name: 'Noções de Direito Administrativo',
    topics: [
      topic('1', 'Estado, governo e administração pública'),
      topic('2', 'Direito administrativo'),
      topic('3', 'Ato administrativo'),
      topic('4', 'Poderes da administração pública', ['Poder hierárquico', 'Poder disciplinar', 'Poder regulamentar', 'Poder de polícia', 'Uso e abuso do poder']),
      topic('5', 'Regime jurídico-administrativo', ['Conceito', 'Princípios expressos e implícitos da administração pública']),
      topic('6', 'Responsabilidade civil do Estado'),
      topic('7', 'Serviços públicos'),
      topic('8', 'Organização administrativa', ['Centralização e descentralização', 'Concentração e desconcentração', 'Administração direta e indireta']),
      topic('9', 'Controle da administração pública', ['Controle administrativo', 'Controle judicial', 'Controle legislativo', 'Improbidade administrativa']),
      topic('10', 'Processo administrativo'),
      topic('11', 'Licitações e contratos administrativos'),
      topic('12', 'Agentes públicos', ['Legislação pertinente', 'Disposições constitucionais aplicáveis']),
      topic('13', 'Cargo, emprego e função pública'),
    ],
  },
  {
    key: 'nocoes_direito_penal',
    name: 'Noções de Direito Penal',
    topics: [
      topic('1', 'Princípios básicos do Direito Penal'),
      topic('2', 'Crime e contravenção penal'),
      topic('3', 'Aplicação da lei penal', ['Lei penal no tempo e no espaço', 'Tempo e lugar do crime', 'Lei penal excepcional, especial e temporária', 'Territorialidade e extraterritorialidade', 'Contagem de prazo', 'Irretroatividade da lei penal']),
      topic('4', 'Crimes contra a pessoa'),
      topic('5', 'Crimes contra o patrimônio'),
      topic('6', 'Crimes contra a dignidade sexual'),
      topic('7', 'Crimes contra a administração pública'),
      topic('8', 'Crimes hediondos', ['Lei nº 8.072/1990']),
      topic('9', 'Crimes resultantes de preconceito de raça ou de cor', ['Lei nº 7.716/1989']),
      topic('10', 'Crimes de abuso de autoridade', ['Lei nº 13.869/2019']),
      topic('11', 'Crimes de tortura', ['Lei nº 9.455/1997']),
      topic('12', 'Estatuto da Criança e do Adolescente', ['Lei nº 8.069/1990']),
      topic('13', 'Organizações criminosas', ['Lei nº 12.850/2013']),
      topic('14', 'Crimes de trânsito', ['Lei nº 9.503/1997']),
      topic('15', 'Violência doméstica e familiar contra a mulher', ['Lei nº 11.340/2006']),
      topic('16', 'Lei de Drogas', ['Lei nº 11.343/2006']),
      topic('17', 'Violência doméstica e familiar contra a criança e o adolescente', ['Lei nº 14.344/2022']),
      topic('18', 'Crimes ambientais', ['Lei nº 9.605/1998']),
      topic('19', 'Estatuto do Desarmamento', ['Lei nº 10.826/2003']),
      topic('20', 'Disposições constitucionais aplicáveis ao Direito Penal'),
    ],
  },
  {
    key: 'nocoes_direito_processual_penal',
    name: 'Noções de Direito Processual Penal',
    topics: [
      topic('1', 'Aplicação da lei processual penal', ['Lei processual no tempo', 'Lei processual no espaço', 'Lei processual em relação às pessoas', 'Disposições preliminares do Código de Processo Penal']),
      topic('2', 'Inquérito policial'),
      topic('3', 'Prova', ['Exame de corpo de delito e perícias em geral', 'Interrogatório do acusado', 'Confissão e declarações do ofendido', 'Testemunhas', 'Reconhecimento de pessoas e coisas', 'Acareação', 'Documentos e indícios', 'Busca e apreensão']),
      topic('4', 'Prisão e liberdade provisória'),
      topic('5', 'Medidas cautelares diversas da prisão'),
      topic('6', 'Prisão temporária', ['Lei nº 7.960/1989']),
      topic('7', 'Juizados Especiais Criminais', ['Lei nº 9.099/1995']),
      topic('8', 'Investigação criminal', ['Lei nº 12.830/2013']),
      topic('9', 'Disposições constitucionais aplicáveis ao Direito Processual Penal'),
    ],
  },
  {
    key: 'lingua_portuguesa',
    name: 'Língua Portuguesa',
    topics: [
      topic('1', 'Compreensão e interpretação de textos de gêneros variados'),
      topic('2', 'Tipos e gêneros textuais'),
      topic('3', 'Ortografia oficial'),
      topic('4', 'Mecanismos de coesão textual', ['Referenciação, substituição e repetição', 'Conectores e sequenciação textual', 'Emprego de tempos e modos verbais']),
      topic('5', 'Estrutura morfossintática do período', ['Classes de palavras', 'Coordenação entre orações e termos', 'Subordinação entre orações e termos', 'Pontuação', 'Concordância verbal e nominal', 'Regência verbal e nominal', 'Crase', 'Colocação dos pronomes átonos']),
      topic('6', 'Reescrita de frases e parágrafos', ['Significação das palavras', 'Substituição de palavras ou trechos', 'Reorganização de orações e períodos', 'Reescrita em diferentes gêneros e níveis de formalidade']),
      topic('7', 'Correspondência oficial', ['Aspectos gerais da redação oficial', 'Finalidade dos expedientes oficiais', 'Adequação da linguagem ao documento', 'Adequação do formato ao gênero']),
    ],
  },
  {
    key: 'informatica',
    name: 'Informática',
    topics: [
      topic('1', 'Sistema operacional Windows e aplicativos de escritório', ['Fundamentos e interface do Windows', 'Pastas e arquivos', 'Configurações básicas e Windows Explorer', 'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint']),
      topic('2', 'Redes de computadores e Internet', ['Internet e intranet', 'Grupos de discussão e redes sociais', 'Computação em nuvem', 'Navegadores', 'Deep Web e Dark Web', 'Correio eletrônico', 'Busca e pesquisa na Internet', 'Segurança da informação, malware, antivírus e criptografia', 'Backup e armazenamento em nuvem']),
    ],
  },
  {
    key: 'raciocinio_logico',
    name: 'Raciocínio Lógico',
    topics: [
      topic('1', 'Conjuntos numéricos', ['Números inteiros, racionais e reais']),
      topic('2', 'Sistema legal de medidas'),
      topic('3', 'Razões, proporções e porcentagens', ['Divisão proporcional', 'Regras de três simples e compostas', 'Porcentagens']),
      topic('4', 'Equações e inequações de primeiro e segundo graus'),
      topic('5', 'Sistemas lineares'),
      topic('6', 'Funções e gráficos'),
      topic('7', 'Princípios de contagem'),
      topic('8', 'Progressões aritméticas e geométricas'),
      topic('9', 'Estruturas lógicas'),
      topic('10', 'Lógica de argumentação', ['Analogias', 'Inferências', 'Deduções e conclusões']),
      topic('11', 'Lógica sentencial ou proposicional', ['Proposições simples e compostas', 'Tabelas-verdade', 'Equivalências', 'Leis de Morgan', 'Diagramas lógicos']),
      topic('12', 'Lógica de primeira ordem'),
      topic('13', 'Probabilidade'),
      topic('14', 'Operações com conjuntos'),
      topic('15', 'Problemas aritméticos, geométricos e matriciais'),
    ],
  },
  {
    key: 'contabilidade_geral',
    name: 'Contabilidade Geral',
    topics: [
      topic('1', 'Conceitos, objetivos e finalidades da contabilidade'),
      topic('2', 'Patrimônio', ['Componentes patrimoniais', 'Equação fundamental', 'Situação líquida', 'Representação gráfica']),
      topic('3', 'Atos e fatos administrativos', ['Fatos permutativos', 'Fatos modificativos', 'Fatos mistos']),
      topic('4', 'Contas', ['Conceitos', 'Débitos, créditos e saldos']),
      topic('5', 'Plano de contas', ['Conceito e elenco de contas', 'Função e funcionamento das contas']),
      topic('6', 'Escrituração', ['Lançamentos e elementos essenciais', 'Fórmulas de lançamentos', 'Livros de escrituração', 'Métodos e processos', 'Regime de competência e regime de caixa']),
      topic('7', 'Operações contábeis diversas', ['Juros, descontos e tributos', 'Aluguéis e variações monetária e cambial', 'Folha de pagamento', 'Compras, vendas e provisões', 'Depreciações e baixa de bens']),
      topic('8', 'Balancete de verificação', ['Conceitos, modelos e elaboração']),
      topic('9', 'Balanço patrimonial', ['Conceito, objetivo e composição']),
      topic('10', 'Demonstração do resultado do exercício', ['Conceito, objetivo e composição']),
      topic('11', 'Normas Brasileiras de Contabilidade'),
    ],
  },
  {
    key: 'estatistica',
    name: 'Estatística',
    topics: [
      topic('1', 'Estatística descritiva e análise exploratória de dados', ['Gráficos, diagramas e tabelas', 'Medidas de posição', 'Medidas de dispersão', 'Assimetria e curtose']),
      topic('2', 'Probabilidade', ['Definições básicas e axiomas', 'Probabilidade condicional', 'Independência']),
      topic('3', 'Técnicas de amostragem', ['Amostragem aleatória simples', 'Amostragem estratificada', 'Amostragem sistemática', 'Amostragem por conglomerados', 'Tamanho amostral']),
    ],
  },
  {
    key: 'atualidades',
    name: 'Atualidades',
    topics: [topic('1', 'Segurança pública na atualidade', ['Tópicos relevantes e atuais para a prova discursiva'])],
  },
];

function buildCurriculum() {
  return {
    schema_version: 1,
    contest_id: contestId,
    roles: [{
      id: roleId,
      name: 'Agente de Polícia',
      order: 0,
      disciplines: disciplines.map((discipline, disciplineIndex) => {
        const disciplineCode = `d${String(disciplineIndex + 1).padStart(2, '0')}`;
        return {
        id: `${roleId}_${disciplineCode}_${slugify(discipline.key, 18)}`,
        name: discipline.name,
        order: disciplineIndex,
        topics: discipline.topics.map((entry, topicIndex) => {
          const topicCode = `t${String(topicIndex + 1).padStart(2, '0')}`;
          const topicId = `${roleId}_${disciplineCode}_${topicCode}_${slugify(entry.name, 24)}`;
          return {
            id: topicId,
            name: `${entry.number}. ${entry.name}`,
            order: topicIndex,
            subtopics: entry.subtopics.map((name, subtopicIndex) => ({
              id: `${roleId}_${disciplineCode}_${topicCode}_s${String(subtopicIndex + 1).padStart(2, '0')}_${slugify(name, 18)}`,
              name,
              order: subtopicIndex,
            })),
          };
        }),
      }}),
    }],
  };
}

const curriculum = buildCurriculum();
const counts = {
  roles: curriculum.roles.length,
  disciplines: curriculum.roles.reduce((sum, role) => sum + role.disciplines.length, 0),
  topics: curriculum.roles.flatMap((role) => role.disciplines).reduce((sum, discipline) => sum + discipline.topics.length, 0),
  subtopics: curriculum.roles.flatMap((role) => role.disciplines).flatMap((discipline) => discipline.topics)
    .reduce((sum, entry) => sum + entry.subtopics.length, 0),
};

const contest = {
  schema_version: 1,
  operation_id: 'pc-pe-2026-agente-foundation-v1',
  contest: {
    id: contestId,
    code: 'PC PE',
    slug: 'pc-pe-2026-agente',
    name: 'PC PE — Agente de Polícia',
    role: 'Agente de Polícia',
    description: 'Preparação pré-edital para Agente da Polícia Civil de Pernambuco, inicialmente estruturada pelo edital oficial de 2023 e sujeita à reconciliação integral quando o novo edital for publicado.',
    content_status: 'preparing',
    sales_status: 'unavailable',
    price_cents: 0,
    currency: 'BRL',
    exam_date: null,
    color: '#13233f',
    accent: '#2dd4bf',
  },
};

const sources = {
  schema_version: 1,
  contest_id: contestId,
  baseline_status: 'pre_edital',
  sources: [
    {
      source_id: 'pc_pe_2023_edital_abertura',
      source_type: 'official_edital',
      title: 'Edital nº 1 — PCPE, de 21 de dezembro de 2023',
      publisher: 'SAD/PE, SDS/PE, PCPE e Cebraspe',
      url: 'https://cdn.cebraspe.org.br/concursos/PC_PE_23/arquivos/ED_1_2023_PC_PE_ABERTURA.PDF',
      location: 'Item 21.2, páginas 59 a 61 do PDF',
      used_for: 'Baseline do conteúdo programático de Agente de Polícia',
      authority: 'official',
    },
    {
      source_id: 'pc_pe_2026_autorizacao_reportada',
      source_type: 'official_announcement_report',
      title: 'Novo concurso PC PE autorizado com 1.315 vagas',
      publisher: 'Folha Dirigida / Qconcursos',
      url: 'https://folha.qconcursos.com/n/concurso-pc-pe-2026-autorizado',
      used_for: 'Registro do anúncio de 1.200 vagas para Agente, 70 para Escrivão e 45 para Delegado',
      authority: 'secondary_pending_primary_record',
    },
  ],
};

const audit = {
  schema_version: 1,
  contest_id: contestId,
  generated_at: new Date().toISOString(),
  status: 'foundation_ready_pre_edital',
  counts,
  canonical_ids: {
    contest_id: contestId,
    position_id: roleId,
    offering_id: 'pc_pe_2026_agente',
    convention: 'pc_pe_2026_ids_v1.0.0',
  },
  safeguards: {
    import_authorized: false,
    publication_authorized: false,
    entitlement_authorized: false,
    payment_changes_authorized: false,
  },
  pending: [
    'Reconciliar o currículo com o novo edital oficial quando publicado.',
    'Decompor subtópicos em microconhecimentos antes da geração do banco inteligente.',
    'Adicionar apostilas e registrar rastreabilidade por página.',
    'Validar banca, distribuição de questões, datas e regras do novo certame.',
  ],
};

await mkdir(path.join(bundleRoot, 'questions'), { recursive: true });
await mkdir(path.join(bundleRoot, 'assets'), { recursive: true });
await mkdir(path.join(root, 'sources'), { recursive: true });
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
await Promise.all([
  writeJson(path.join(bundleRoot, 'contest.json'), contest),
  writeJson(path.join(bundleRoot, 'curriculum.json'), curriculum),
  writeJson(path.join(root, 'sources', 'source-catalog.v1.json'), sources),
  writeJson(path.join(root, 'foundation-audit.v1.json'), audit),
  copyFile(
    path.resolve(process.cwd(), 'app/assets/hero/tiers-v2/female/stage-01.png'),
    path.join(bundleRoot, 'assets', 'battle-avatar.png'),
  ),
]);

console.log(JSON.stringify({ output: root, counts, status: audit.status }, null, 2));
