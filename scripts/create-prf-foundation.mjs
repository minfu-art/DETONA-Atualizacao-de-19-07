import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd(), 'course-drafts/prf-pre-edital');
const bundleRoot = path.join(root, 'course-bundle');
const contestId = 'prf_2026';
const roleId = 'prf_2026_policial_rodoviario_federal';

const slugify = (value, maxLength = 24) => String(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, maxLength);
const topic = (number, name, subtopics = []) => ({ number, name, subtopics: subtopics.length ? subtopics : [name] });

const contranResolutions = [
  'Resolução CONTRAN nº 04/1998', 'Resolução CONTRAN nº 14/1998', 'Resolução CONTRAN nº 24/1998',
  'Resolução CONTRAN nº 36/1998', 'Resolução CONTRAN nº 92/1998, exceto anexos', 'Resolução CONTRAN nº 110/2000',
  'Resolução CONTRAN nº 160/2004', 'Resolução CONTRAN nº 210/2011', 'Resolução CONTRAN nº 211/2006',
  'Resolução CONTRAN nº 216/2006', 'Resolução CONTRAN nº 227/2007, exceto anexos', 'Resolução CONTRAN nº 253/2007',
  'Resolução CONTRAN nº 254/2007', 'Resolução CONTRAN nº 268/2008', 'Resolução CONTRAN nº 290/2008',
  'Resolução CONTRAN nº 292/2008', 'Resolução CONTRAN nº 349/2010', 'Resolução CONTRAN nº 360/2010',
  'Resolução CONTRAN nº 432/2013', 'Resolução CONTRAN nº 441/2013', 'Resolução CONTRAN nº 453/2013',
  'Resolução CONTRAN nº 471/2013', 'Resolução CONTRAN nº 508/2014', 'Resolução CONTRAN nº 520/2015',
  'Resolução CONTRAN nº 525/2015', 'Resolução CONTRAN nº 552/2015, exceto anexos', 'Resolução CONTRAN nº 561/2015, exceto fichas',
  'Resolução CONTRAN nº 619/2016', 'Resolução CONTRAN nº 667/2017, exceto anexos', 'Resolução CONTRAN nº 723/2018',
  'Resolução CONTRAN nº 735/2018', 'Resolução CONTRAN nº 740/2018', 'Resolução CONTRAN nº 780/2019',
  'Resolução CONTRAN nº 789/2020, Anexo I', 'Resolução CONTRAN nº 798/2020', 'Resolução CONTRAN nº 803/2020',
  'Resolução CONTRAN nº 806/2020', 'Resolução CONTRAN nº 809/2020', 'Resolução CONTRAN nº 810/2020',
];

const disciplines = [
  { key: 'portugues', name: 'Língua Portuguesa', block: 1, topics: [
    topic('1', 'Compreensão e interpretação de textos de gêneros variados'), topic('2', 'Tipos e gêneros textuais'),
    topic('3', 'Ortografia oficial'),
    topic('4', 'Mecanismos de coesão textual', ['Referenciação, substituição e repetição', 'Conectores e sequenciação textual', 'Tempos e modos verbais']),
    topic('5', 'Estrutura morfossintática do período', ['Classes de palavras', 'Coordenação', 'Subordinação', 'Pontuação', 'Concordância verbal e nominal', 'Regência verbal e nominal', 'Crase', 'Colocação pronominal']),
    topic('6', 'Reescrita de frases e parágrafos', ['Significação das palavras', 'Substituição de palavras ou trechos', 'Reorganização de orações e períodos', 'Reescrita em diferentes gêneros e níveis de formalidade']),
    topic('7', 'Correspondência oficial', ['Aspectos gerais', 'Finalidade dos expedientes', 'Adequação da linguagem', 'Adequação do formato ao gênero']),
  ]},
  { key: 'rlm', name: 'Raciocínio Lógico-Matemático', block: 1, topics: [
    topic('1', 'Modelagem por equações e sistemas', ['Equações do primeiro grau', 'Equações do segundo grau', 'Sistemas lineares']),
    topic('2', 'Funções', ['Análise gráfica', 'Função afim', 'Função quadrática', 'Função exponencial', 'Função logarítmica', 'Aplicações']),
    topic('3', 'Taxas de variação', ['Razão e proporção', 'Regra de três simples e composta']), topic('4', 'Porcentagem'),
    topic('5', 'Regularidades e padrões em sequências', ['Sequências numéricas', 'Progressão aritmética', 'Progressão geométrica']),
    topic('6', 'Contagem, probabilidade e estatística'),
    topic('7', 'Descrição e análise de dados', ['Leitura e interpretação de tabelas e gráficos', 'Médias e desvios']),
    topic('8', 'Teoria dos conjuntos'),
    topic('9', 'Representações de figuras planas e espaciais', ['Desenhos, mapas e plantas', 'Escalas', 'Figuras espaciais em diferentes posições', 'Projeções, planificações e cortes']),
    topic('10', 'Métrica', ['Áreas', 'Volumes', 'Estimativas', 'Aplicações']),
  ]},
  { key: 'informatica', name: 'Informática', block: 1, topics: [
    topic('1', 'Internet e intranet'),
    topic('2', 'Tecnologias e aplicativos de Internet', ['Navegação, correio, grupos, busca, redes sociais e colaboração', 'Sistema operacional Windows', 'Acesso remoto e transferência de arquivos', 'Áudio, vídeo e multimídia']),
    topic('3', 'Transformação digital', ['Internet das coisas', 'Big data', 'Inteligência artificial']),
    topic('4', 'Proteção e segurança', ['Vírus, worms, phishing e pragas virtuais', 'Antivírus, firewall, antispyware e VPN']),
    topic('5', 'Computação em nuvem'),
  ]},
  { key: 'fisica', name: 'Física', block: 1, topics: [
    topic('1', 'Cinemática escalar e vetorial'), topic('2', 'Movimento circular'), topic('3', 'Leis de Newton e aplicações'),
    topic('4', 'Trabalho'), topic('5', 'Potência'), topic('6', 'Energia cinética, potencial e atrito'),
    topic('7', 'Conservação e transformação de energia'), topic('8', 'Quantidade de movimento e impulso'), topic('9', 'Colisões'),
  ]},
  { key: 'etica', name: 'Ética e Cidadania', block: 1, topics: [
    topic('1', 'Ética e moral'), topic('2', 'Ética, princípios e valores'), topic('3', 'Ética e função pública', ['Integridade']),
    topic('4', 'Ética no setor público', ['Moralidade administrativa — art. 37 da Constituição', 'Deveres dos servidores — art. 116, IX, da Lei nº 8.112/1990', 'Decreto nº 9.203/2017 — governança pública', 'Decreto nº 1.171/1994 — Código de Ética', 'Decreto nº 6.029/2007 — Sistema de Gestão da Ética', 'Código de Conduta da Alta Administração Federal']),
    topic('5', 'Ética e democracia', ['Exercício da cidadania', 'Lei nº 12.527/2011 e Decreto nº 7.724/2012 — transparência e acesso à informação', 'Lei nº 12.813/2013 — conflito de interesses', 'Decreto nº 7.203/2010 — nepotismo']),
  ]},
  { key: 'geopolitica', name: 'Geopolítica', block: 1, topics: [
    topic('1', 'Brasil político: nação e território'), topic('2', 'Organização do Estado brasileiro'),
    topic('3', 'Divisão inter-regional do trabalho e da produção'), topic('4', 'Estrutura urbana e metrópoles'),
    topic('5', 'População e movimentos migratórios internos'), topic('6', 'Integração entre indústria, estrutura urbana e setor agrícola'),
    topic('7', 'Rede de transportes no Brasil'), topic('8', 'Internacionalização da economia brasileira'),
    topic('9', 'Geografia e gestão ambiental'), topic('10', 'Biomas, domínios e ecossistemas brasileiros'),
  ]},
  { key: 'lingua_estrangeira', name: 'Língua Estrangeira', block: 1, topics: [
    topic('I', 'Língua Inglesa', ['Compreensão de texto em inglês', 'Gramática relevante para compreensão semântica']),
    topic('II', 'Língua Espanhola', ['Compreensão de texto em espanhol', 'Gramática relevante para compreensão semântica']),
  ]},
  { key: 'transito', name: 'Legislação de Trânsito', block: 2, topics: [
    topic('1', 'Código de Trânsito Brasileiro', ['Lei nº 9.503/1997 e alterações', 'Lei nº 14.071/2020 — alterações do CTB']),
    topic('2', 'Lei nº 5.970/1973'), topic('3', 'Resoluções do CONTRAN', contranResolutions),
  ]},
  { key: 'administrativo', name: 'Direito Administrativo', block: 3, topics: [
    topic('1', 'Organização administrativa', ['Centralização, descentralização, concentração e desconcentração', 'Administração direta e indireta', 'Autarquias, fundações, empresas públicas e sociedades de economia mista']),
    topic('2', 'Ato administrativo', ['Conceito, requisitos, atributos, classificação e espécies']),
    topic('3', 'Agentes públicos', ['Lei nº 8.112/1990', 'Disposições constitucionais', 'Conceito e espécies', 'Cargo, emprego e função pública', 'Lei nº 9.654/1998 — carreira PRF', 'Lei nº 12.855/2013 — indenização de fronteira', 'Lei nº 13.712/2018 — indenização PRF', 'Decreto nº 8.282/2014 — carreira PRF']),
    topic('4', 'Poderes administrativos', ['Hierárquico, disciplinar, regulamentar e de polícia', 'Uso e abuso do poder']),
    topic('5', 'Licitação', ['Princípios', 'Dispensa e inexigibilidade', 'Modalidades', 'Tipos', 'Procedimento']),
    topic('6', 'Controle da Administração Pública', ['Controle administrativo', 'Controle judicial', 'Controle legislativo']),
    topic('7', 'Responsabilidade civil do Estado', ['Responsabilidade por ato comissivo', 'Responsabilidade por omissão', 'Requisitos', 'Causas excludentes e atenuantes']),
    topic('8', 'Regime jurídico-administrativo', ['Conceito', 'Princípios expressos e implícitos']),
  ]},
  { key: 'constitucional', name: 'Direito Constitucional', block: 3, topics: [
    topic('1', 'Poder constituinte', ['Fundamentos', 'Originário e derivado', 'Reforma e revisão', 'Limitações', 'Emendas à Constituição']),
    topic('2', 'Direitos e deveres fundamentais', ['Direitos individuais e coletivos', 'Vida, liberdade, igualdade, segurança e propriedade', 'Direitos sociais, nacionalidade, cidadania e direitos políticos', 'Garantias individuais', 'Garantias coletivas, sociais e políticas', 'Remédios constitucionais']),
    topic('3', 'Poder Executivo', ['Forma e sistema de governo', 'Chefias de Estado e de governo', 'Atribuições e responsabilidades do Presidente', 'Bens e competências da União — arts. 20 a 24']),
    topic('4', 'Defesa do Estado e instituições democráticas', ['Forças Armadas — art. 142', 'Segurança pública — art. 144', 'Organização da segurança pública', 'Atribuições constitucionais da PRF']),
    topic('5', 'Ordem social', ['Base e objetivos', 'Seguridade social', 'Meio ambiente', 'Família, criança, adolescente, idoso e povos indígenas']),
  ]},
  { key: 'penal', name: 'Direito Penal', block: 3, topics: [
    topic('1', 'Princípios básicos'),
    topic('2', 'Aplicação da lei penal', ['Lei penal no tempo', 'Tempo do crime', 'Conflito de leis no tempo', 'Lei penal no espaço', 'Lugar do crime', 'Territorialidade', 'Extraterritorialidade']),
    topic('3', 'Tipicidade', ['Crime doloso e culposo', 'Erro de tipo', 'Crime consumado e tentado', 'Crime impossível', 'Punibilidade e extinção']),
    topic('4', 'Ilicitude', ['Causas de exclusão', 'Excesso punível']),
    topic('5', 'Culpabilidade', ['Causas de exclusão', 'Imputabilidade', 'Erro de proibição']),
    topic('6', 'Crimes em espécie', ['Contra a pessoa', 'Contra o patrimônio', 'Contra a dignidade sexual', 'Contra a incolumidade pública', 'Contra a fé pública', 'Contra a Administração Pública']),
  ]},
  { key: 'processual_penal', name: 'Direito Processual Penal', block: 3, topics: [
    topic('1', 'Ação penal', ['Conceito', 'Características', 'Espécies', 'Condições']),
    topic('2', 'Termo Circunstanciado de Ocorrência', ['Lei nº 9.099/1995', 'Atos processuais: forma, lugar e tempo']),
    topic('3', 'Prova', ['Conceito, objeto e classificação', 'Preservação do local de crime', 'Requisitos e ônus', 'Provas ilícitas', 'Meios de prova', 'Busca e apreensão']),
    topic('4', 'Prisão', ['Conceito, formalidades, espécies e mandado', 'Prisão em flagrante']),
    topic('5', 'Identificação criminal', ['Art. 5º, LVIII, da Constituição e Lei nº 12.037/2009']),
    topic('6', 'Diligências investigatórias', ['Arts. 6º e 13 do Código de Processo Penal']),
  ]},
  { key: 'legislacao_especial', name: 'Legislação Especial', block: 3, topics: [
    topic('1', 'Documentos de identificação e identificação criminal', ['Lei nº 5.553/1968', 'Lei nº 12.037/2009']),
    topic('2', 'Estatuto da Criança e do Adolescente', ['Lei nº 8.069/1990']), topic('3', 'Crimes hediondos', ['Lei nº 8.072/1990']),
    topic('4', 'Competências e organização da PRF', ['Decreto nº 1.655/1995', 'Art. 47 do Decreto nº 9.662/2019']),
    topic('5', 'Juizados Especiais', ['Lei nº 9.099/1995']), topic('6', 'Tortura', ['Lei nº 9.455/1997']),
    topic('7', 'Crimes ambientais', ['Lei nº 9.605/1998 — capítulos III e V']), topic('8', 'Estatuto do Desarmamento', ['Lei nº 10.826/2003 — capítulo IV']),
    topic('9', 'Lei de Drogas', ['Lei nº 11.343/2006']), topic('10', 'Organizações criminosas', ['Lei nº 12.850/2013']),
    topic('11', 'Sistema Único de Segurança Pública', ['Lei nº 13.675/2018']), topic('12', 'Abuso de autoridade', ['Lei nº 13.869/2019']),
  ]},
  { key: 'direitos_humanos', name: 'Direitos Humanos', block: 3, topics: [
    topic('1', 'Direitos humanos na Constituição', ['Constituição e tratados internacionais de direitos humanos']),
    topic('2', 'Declaração Universal dos Direitos Humanos'), topic('3', 'Convenção Americana sobre Direitos Humanos', ['Decreto nº 678/1992']),
  ]},
];

function buildCurriculum() {
  return { schema_version: 1, contest_id: contestId, roles: [{
    id: roleId, name: 'Policial Rodoviário Federal', order: 0,
    disciplines: disciplines.map((discipline, disciplineIndex) => {
      const disciplineCode = `d${String(disciplineIndex + 1).padStart(2, '0')}`;
      return {
        id: `${roleId}_${disciplineCode}_${slugify(discipline.key, 14)}`,
        name: discipline.name, description: `Bloco ${discipline.block} do edital PRF 2021.`, order: disciplineIndex,
        topics: discipline.topics.map((entry, topicIndex) => {
          const topicCode = `t${String(topicIndex + 1).padStart(2, '0')}`;
          const topicId = `${roleId}_${disciplineCode}_${topicCode}_${slugify(entry.name, 17)}`;
          return { id: topicId, name: `${entry.number}. ${entry.name}`, order: topicIndex,
            subtopics: entry.subtopics.map((name, subtopicIndex) => ({
              id: `${roleId}_${disciplineCode}_${topicCode}_s${String(subtopicIndex + 1).padStart(2, '0')}_${slugify(name, 11)}`,
              name, order: subtopicIndex,
            })) };
        }),
      };
    }),
  }] };
}

const curriculum = buildCurriculum();
const role = curriculum.roles[0];
const counts = {
  roles: 1,
  disciplines: role.disciplines.length,
  topics: role.disciplines.flatMap(({ topics }) => topics).length,
  subtopics: role.disciplines.flatMap(({ topics }) => topics).flatMap(({ subtopics }) => subtopics).length,
};
const contest = { schema_version: 1, operation_id: 'prf-pre-edital-foundation-v1', contest: {
  id: contestId, code: 'PRF', slug: 'prf-pre-edital', name: 'PRF — Policial Rodoviário Federal',
  role: 'Policial Rodoviário Federal',
  description: 'Preparação pré-edital estruturada pelo edital oficial PRF 2021 e sujeita à reconciliação integral quando um novo edital for publicado.',
  content_status: 'preparing', sales_status: 'unavailable', price_cents: 0, currency: 'BRL', exam_date: null,
  color: '#1f4f3f', accent: '#f5c542',
} };
const sources = { schema_version: 1, contest_id: contestId, baseline_status: 'pre_edital', sources: [
  { source_id: 'prf_2021_edital_abertura', source_type: 'official_edital', title: 'Edital Concurso PRF nº 1, de 18 de janeiro de 2021', publisher: 'PRF e Cebraspe', url: 'https://cdn.cebraspe.org.br/concursos/PRF_21/arquivos/ED_1_PRF_2021_ABERTURA.PDF', location: 'Item 24.2, páginas 36 a 39', used_for: 'Baseline curricular', authority: 'official' },
  { source_id: 'prf_status_oficial', source_type: 'official_status', title: 'Portal oficial — Concurso PRF', publisher: 'Polícia Rodoviária Federal', url: 'https://www.gov.br/prf/pt-br/concurso-prf', used_for: 'Confirmação do concurso oficial vigente no portal', authority: 'official' },
] };
const audit = { schema_version: 1, contest_id: contestId, generated_at: new Date().toISOString(), status: 'foundation_ready_pre_edital', counts,
  canonical_ids: { contest_id: contestId, position_id: roleId, offering_id: 'prf_2026_policial', convention: 'prf_2026_ids_v1.0.0' },
  safeguards: { import_authorized: false, publication_authorized: false, entitlement_authorized: false, payment_changes_authorized: false },
  critical_reconciliation: ['Novo edital oficial', 'Código de Trânsito Brasileiro vigente', 'Resoluções CONTRAN consolidadas e vigentes', 'Legislação e jurisprudência atualizadas', 'Banca e distribuição das provas'] };

await mkdir(path.join(bundleRoot, 'questions'), { recursive: true });
await mkdir(path.join(bundleRoot, 'assets'), { recursive: true });
await mkdir(path.join(root, 'sources'), { recursive: true });
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
await Promise.all([
  writeJson(path.join(bundleRoot, 'contest.json'), contest), writeJson(path.join(bundleRoot, 'curriculum.json'), curriculum),
  writeJson(path.join(root, 'sources', 'source-catalog.v1.json'), sources), writeJson(path.join(root, 'foundation-audit.v1.json'), audit),
  copyFile(path.resolve('app/assets/hero/tiers-v2/male/stage-01.png'), path.join(bundleRoot, 'assets', 'battle-avatar.png')),
]);
console.log(JSON.stringify({ output: root, counts, status: audit.status }, null, 2));
