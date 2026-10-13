import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('course-drafts/prf-pre-edital');
const output = path.join(root, 'production', 'portuguese-regency-crase-pilot.v1.json');

const ids = {
  role: 'prf_2026_policial_rodoviario_federal',
  discipline: 'prf_2026_policial_rodoviario_federal_d01_portugues',
  topic: 'prf_2026_policial_rodoviario_federal_d01_t05_estrutura_morfoss',
  regency: 'prf_2026_policial_rodoviario_federal_d01_t05_s06_regencia_ve',
  crasis: 'prf_2026_policial_rodoviario_federal_d01_t05_s07_crase',
};

const officialTrace = [{
  source_id: 'prf_2021_edital_abertura', trace_status: 'available', page_number: 36,
  excerpt: 'Regência verbal e nominal; emprego do sinal indicativo de crase.',
}];

const materialSourceId = 'prf_pdf_bf5410c46bd3';
const materialTrace = (pageNumber, excerpt) => [{
  source_id: materialSourceId, trace_status: 'available', page_number: pageNumber, excerpt,
}];

const microknowledgeDefinitions = [
  {
    id: 'prf_d01_t05_s06_mk01_relacao_regente_regido', subtopicId: ids.regency,
    title: 'Relação entre termo regente, termo regido e complemento', page: 3,
    excerpt: 'Regência descreve a relação de dependência entre termos regentes e regidos.',
    questions: [
      ['conceito', 'A regência estuda relações de dependência em que um termo exige ou orienta a forma de seu complemento.', 'C', 'O termo regente determina a relação sintática e, quando necessário, a preposição que introduz o termo regido.'],
      ['aplicacao', 'Na oração “O servidor confia no procedimento”, o segmento “no procedimento” exerce a função de objeto direto do verbo “confiar”.', 'E', 'O verbo “confiar”, nessa acepção, rege a preposição “em”; por isso, “no procedimento” é objeto indireto.'],
      ['pegadinha', 'Todo complemento introduzido por preposição deve ser classificado como objeto indireto.', 'E', 'A preposição também pode introduzir complemento nominal e outros termos; objeto indireto é complemento de verbo transitivo indireto.'],
    ],
  },
  {
    id: 'prf_d01_t05_s06_mk02_transitividade_e_preposicao', subtopicId: ids.regency,
    title: 'Transitividade verbal e exigência de preposição', page: 5,
    excerpt: 'Verbos transitivos indiretos exigem complemento preposicionado.',
    questions: [
      ['conceito', 'Um verbo transitivo indireto liga-se a seu complemento por meio de preposição exigida por sua regência.', 'C', 'A preposição integra o padrão de complementação do verbo transitivo indireto.'],
      ['aplicacao', 'Em “A equipe assistiu ao treinamento”, o emprego da preposição “a” está de acordo com a regência do verbo “assistir” no sentido de ver.', 'C', 'No sentido de presenciar ou ver, “assistir” é transitivo indireto e rege a preposição “a”.'],
      ['pegadinha', 'A construção “O candidato prefere estabilidade do que aventura” atende à norma-padrão de regência do verbo “preferir”.', 'E', 'Na comparação, a norma-padrão recomenda “preferir X a Y”: “prefere estabilidade a aventura”.'],
    ],
  },
  {
    id: 'prf_d01_t05_s06_mk03_sentido_altera_regencia', subtopicId: ids.regency,
    title: 'Alteração da regência conforme o sentido do verbo', page: 41,
    excerpt: 'A transitividade de um verbo pode variar conforme a construção e o sentido.',
    questions: [
      ['conceito', 'A classificação de um verbo quanto à transitividade pode mudar quando muda o sentido assumido no contexto.', 'C', 'A regência não é atributo imutável da forma verbal; depende da acepção e da construção em que o verbo aparece.'],
      ['aplicacao', 'Nas construções “pensou no problema” e “pensou uma solução”, o verbo “pensar” apresenta exatamente a mesma transitividade.', 'E', 'Na primeira construção há complemento preposicionado; na segunda, complemento sem preposição. A transitividade varia.'],
      ['pegadinha', 'Se um verbo aparece como intransitivo em determinada frase, ele necessariamente será intransitivo em qualquer outro contexto.', 'E', 'Diversos verbos admitem mais de uma regência e transitividade conforme a acepção empregada.'],
    ],
  },
  {
    id: 'prf_d01_t05_s06_mk04_pronome_relativo_preposicionado', subtopicId: ids.regency,
    title: 'Preposição antes de pronome relativo determinada pela regência', page: 5,
    excerpt: 'A regência do termo interno à oração determina a preposição do pronome relativo.',
    questions: [
      ['conceito', 'A preposição que antecede um pronome relativo deve ser definida pela regência do verbo ou do nome com que o relativo se relaciona.', 'C', 'O pronome relativo retoma o antecedente, mas sua função na oração subordinada determina a preposição necessária.'],
      ['aplicacao', 'A redação “A norma a que me referi foi alterada” está adequada quanto à regência e ao emprego do pronome relativo.', 'C', 'Quem se refere, refere-se a algo; por isso, a preposição “a” deve anteceder o relativo “que”.'],
      ['pegadinha', 'Na frase “Este é o cargo que o servidor aspirava”, a ausência de preposição antes de “que” está correta quando “aspirar” significa desejar.', 'E', 'No sentido de desejar, “aspirar” rege a preposição “a”: “o cargo a que o servidor aspirava”.'],
    ],
  },
  {
    id: 'prf_d01_t05_s06_mk05_regencia_nominal', subtopicId: ids.regency,
    title: 'Regência nominal e complemento preposicionado', page: 22,
    excerpt: 'Substantivos, adjetivos e advérbios podem exigir complementos preposicionados.',
    questions: [
      ['conceito', 'A regência nominal examina a relação entre nomes e os complementos preposicionados exigidos por eles.', 'C', 'Substantivos, adjetivos e advérbios podem atuar como termos regentes e selecionar preposições.'],
      ['aplicacao', 'Em “A medida é favorável aos usuários”, a preposição empregada está compatível com a regência do adjetivo “favorável”.', 'C', 'O adjetivo “favorável” rege a preposição “a”, combinada com o artigo plural em “aos”.'],
      ['pegadinha', 'A construção “O agente está apto de exercer a função” é a única forma admitida pela norma-padrão para complementar o adjetivo “apto”.', 'E', 'O adjetivo “apto” admite, entre outras construções consagradas, “apto a” e “apto para”; a afirmação de exclusividade é incorreta.'],
    ],
  },
  {
    id: 'prf_d01_t05_s07_mk01_fusao_preposicao_artigo', subtopicId: ids.crasis,
    title: 'Crase como fusão da preposição a com artigo feminino a ou as', page: 27,
    excerpt: 'O acento grave sinaliza a fusão da preposição a com artigo feminino a ou as.',
    questions: [
      ['conceito', 'Para que ocorra crase antes de um substantivo feminino, devem coexistir a preposição “a” e o artigo feminino “a” ou “as”.', 'C', 'A crase resulta da fusão dos dois elementos; a presença de apenas um deles não autoriza o acento grave.'],
      ['aplicacao', 'Na frase “O policial dirigiu-se à unidade operacional”, o acento grave pode ser justificado pela regência de “dirigir-se” e pelo artigo de “a unidade”.', 'C', 'O verbo exige a preposição “a”, e o substantivo feminino determinado admite artigo “a”: a + a = à.'],
      ['pegadinha', 'A redação “O relatório foi entregue à uma chefia regional” está correta porque toda palavra feminina admite crase.', 'E', 'Antes do artigo indefinido “uma” não ocorre a fusão a + a; além disso, gênero feminino, isoladamente, não determina crase.'],
    ],
  },
  {
    id: 'prf_d01_t05_s07_mk02_crase_demonstrativos', subtopicId: ids.crasis,
    title: 'Crase diante de aquele, aquela, aqueles, aquelas e aquilo', page: 27,
    excerpt: 'A preposição a pode fundir-se com o a inicial de pronomes demonstrativos.',
    questions: [
      ['conceito', 'Quando um termo exige a preposição “a”, pode ocorrer crase diante de “aquele”, “aquela”, “aqueles”, “aquelas” e “aquilo”.', 'C', 'A preposição funde-se com a vogal inicial do demonstrativo, produzindo “àquele”, “àquela”, “àqueles”, “àquelas” ou “àquilo”.'],
      ['aplicacao', 'Em “A comissão referiu-se àquele procedimento”, o acento grave está de acordo com a regência do verbo e com a forma do demonstrativo.', 'C', 'Quem se refere, refere-se a algo; a preposição “a” funde-se com “aquele”.'],
      ['pegadinha', 'A forma “O candidato visava aquele cargo” está plenamente adequada quando “visar” significa almejar, não havendo possibilidade de crase.', 'E', 'Na norma-padrão, “visar”, no sentido de almejar, rege “a”; diante de “aquele”, forma-se “visava àquele cargo”.'],
    ],
  },
  {
    id: 'prf_d01_t05_s07_mk03_pronome_pessoal_e_tratamento', subtopicId: ids.crasis,
    title: 'Ausência de crase antes de pronome pessoal e contraste com formas de tratamento que admitem artigo', page: 62,
    excerpt: 'Pronome pessoal não admite artigo; certas formas de tratamento podem admitir artigo.',
    questions: [
      ['conceito', 'Em regra, não se emprega acento grave antes de pronome pessoal, pois esse pronome não é antecedido de artigo.', 'C', 'Pode existir a preposição “a”, mas falta o artigo feminino necessário à fusão que caracteriza a crase.'],
      ['aplicacao', 'Na frase “A chefia entregou a ela o documento”, a ausência de acento grave em “a ela” está correta.', 'C', 'O pronome pessoal “ela” não admite artigo; há somente a preposição “a”.'],
      ['pegadinha', 'Na redação formal, toda forma de tratamento impede crase, razão pela qual apenas “dirigiu-se a senhora” pode estar correta.', 'E', 'Formas como “senhora” podem admitir artigo. Se o termo regente exige “a”, é possível “dirigiu-se à senhora”.'],
    ],
  },
];

const microknowledges = microknowledgeDefinitions.map((item) => ({
  id: item.id,
  subtopic_id: item.subtopicId,
  title: item.title,
  scope_origin: 'official',
  confidence: 0.98,
  traces: [...officialTrace, ...materialTrace(item.page, item.excerpt)],
}));

let sequence = 0;
const questions = microknowledgeDefinitions.flatMap((item) => item.questions.map(([mode, statement, answer, explanation]) => {
  sequence += 1;
  return {
    id: `prf_port_pilot_${String(sequence).padStart(3, '0')}`,
    subtopic_id: item.subtopicId,
    microknowledge_ids: [item.id],
    statement,
    options: [],
    correct_answer: answer,
    explanation,
    difficulty: mode === 'conceito' ? 'facil' : mode === 'aplicacao' ? 'media' : 'dificil',
    format: 'certo_errado',
    source: 'Autoral DETONA - baseada no escopo oficial e em referência didática rastreada',
    is_trick: mode === 'pegadinha',
    traces: [...officialTrace, ...materialTrace(item.page, item.excerpt)],
  };
}));

const packagePayload = {
  schema_version: 1,
  operation_id: 'prf-2026-portugues-regencia-crase-pilot-v1',
  course: {
    contest_id: 'prf_2026',
    position_id: ids.role,
    offering_id: 'prf_2026_policial',
    code: 'PRF',
    slug: 'prf-2026-policial-rodoviario-federal',
    name: 'PRF - Policial Rodoviário Federal',
    organization: 'Polícia Rodoviária Federal',
    position: 'Policial Rodoviário Federal',
    board: 'CEBRASPE (baseline 2021)',
    year: '2026',
    exam_date: null,
    exam_format: 'Pré-edital; baseline CEBRASPE 2021',
    description: 'Lote-piloto editorial para ensino do Mapa Mestre por questões autorais.',
  },
  sources: [
    {
      id: 'prf_2021_edital_abertura', source_type: 'official_edital', category: 'edital',
      title: 'Edital Concurso PRF nº 1, de 18 de janeiro de 2021', file_name: 'ED_1_PRF_2021_ABERTURA.PDF',
      page_count: null, availability: 'uploaded_pdf',
      url: 'https://cdn.cebraspe.org.br/concursos/PRF_21/arquivos/ED_1_PRF_2021_ABERTURA.PDF', sha256: '',
    },
    {
      id: materialSourceId, source_type: 'complementary', category: 'material_curso',
      title: 'PRF Português - Aula 10 - Regência e Crase',
      file_name: 'curso-240229-aula-10-somente-em-video-b24e-completo.pdf', page_count: 107,
      availability: 'reference_only', url: '',
      sha256: '5f022489b5f00e2b5f1f981618e00866700231a7bb287c9ad7c6e8acbd1cd09b',
    },
  ],
  curriculum: { nodes: [
    { id: ids.role, parent_id: null, type: 'role', title: 'Policial Rodoviário Federal', description: '', order: 0, confidence: 1, traces: officialTrace },
    { id: ids.discipline, parent_id: ids.role, type: 'discipline', title: 'Língua Portuguesa', description: 'Bloco 1 da baseline PRF 2021.', order: 0, confidence: 1, traces: officialTrace },
    { id: ids.topic, parent_id: ids.discipline, type: 'topic', title: 'Estrutura morfossintática do período', description: '', order: 4, confidence: 1, traces: officialTrace },
    { id: ids.regency, parent_id: ids.topic, type: 'subtopic', title: 'Regência verbal e nominal', description: '', order: 5, confidence: 1, traces: officialTrace },
    { id: ids.crasis, parent_id: ids.topic, type: 'subtopic', title: 'Crase', description: '', order: 6, confidence: 1, traces: officialTrace },
  ] },
  microknowledges,
  edital_map: [
    {
      id: `map_${ids.regency}`, subtopic_id: ids.regency,
      scope: 'Regência verbal e nominal em relações de complementação e na norma-padrão.',
      essential_concepts: ['termo regente e regido', 'transitividade', 'preposição', 'regência nominal'],
      rules: ['A regência depende da acepção e da função sintática.', 'A preposição do relativo deriva da regência interna.'],
      exceptions: ['Mudanças de sentido podem alterar transitividade e preposição.'],
      applications: ['análise sintática', 'reescrita', 'correção gramatical'],
      competencies: ['identificar o termo regente', 'selecionar preposição', 'avaliar reescritas'],
      required_knowledge: ['classes de palavras', 'complementos verbais', 'orações adjetivas'],
      microknowledge_ids: microknowledges.filter((item) => item.subtopic_id === ids.regency).map(({ id }) => id),
      confidence: 0.98, traces: [...officialTrace, ...materialTrace(2, 'O índice separa teoria e questões de regência verbal e nominal.')],
    },
    {
      id: `map_${ids.crasis}`, subtopic_id: ids.crasis,
      scope: 'Emprego do sinal indicativo de crase conforme regência, artigo e pronomes.',
      essential_concepts: ['preposição a', 'artigo feminino', 'fusão', 'pronomes demonstrativos'],
      rules: ['A crase exige a coexistência dos elementos que se fundem.'],
      exceptions: ['Pronome pessoal não admite artigo.', 'Algumas formas de tratamento admitem artigo.'],
      applications: ['correção gramatical', 'reescrita', 'justificativa do acento grave'],
      competencies: ['testar regência', 'testar artigo', 'distinguir proibição e possibilidade'],
      required_knowledge: ['regência', 'artigo', 'pronomes'],
      microknowledge_ids: microknowledges.filter((item) => item.subtopic_id === ids.crasis).map(({ id }) => id),
      confidence: 0.98, traces: [...officialTrace, ...materialTrace(27, 'A teoria apresenta a formação e os testes de crase.')],
    },
  ],
  question_batches: [{ name: 'portugues-regencia-crase-piloto-v1', questions }],
  metadata: {
    producer: 'ChatGPT/Codex - DETONA CONCURSOS',
    generated_at: new Date().toISOString(),
    editorial_status: 'draft_for_human_review',
    publication_blocked: true,
    import_blocked: true,
    source_questions_copied: false,
    authorial_questions: true,
    microknowledge_count: microknowledges.length,
    question_count: questions.length,
    required_questions_per_microknowledge: 3,
  },
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(packagePayload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, microknowledges: microknowledges.length, questions: questions.length }, null, 2));
