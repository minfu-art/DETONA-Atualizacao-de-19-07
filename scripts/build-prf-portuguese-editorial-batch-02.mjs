import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [base, curriculum, ingestion] = await Promise.all([
  readJson('production/portuguese-editorial-batch-01.v1.json'),
  readJson('course-bundle/curriculum.json'),
  readJson('sources/source-ingestion-report.v1.json'),
]);
const discipline = curriculum.roles[0].disciplines.find(({ name }) => name === 'Língua Portuguesa');
const subtopic = discipline.topics.flatMap(({ subtopics }) => subtopics)
  .find(({ name }) => name === 'Compreensão e interpretação de textos de gêneros variados');
const topic = discipline.topics.find(({ subtopics }) => subtopics.some(({ id }) => id === subtopic.id));
const selectedNodeIds = new Set([curriculum.roles[0].id, discipline.id, topic.id, subtopic.id]);
const source = ingestion.sources.find(({ source_id }) => source_id === 'prf_pdf_8871f98bc130');
const baseTrace = [
  ...base.curriculum.nodes[0].traces,
  { source_id: source.source_id, trace_status: 'available', page_number: 140, excerpt: 'Matriz agregada dos itens 21-40, páginas 140-155: padrões cognitivos sem cópia textual' },
];

const sourceMatrix = [
  [21,140,'PC-DF 2025','causalidade','preservar direção entre causa e efeito','inverter causa e consequência'],
  [22,141,'PC-DF 2025','extrapolação temática','limitar a conclusão ao problema efetivamente mencionado','inventar problema específico'],
  [23,142,'PC-DF 2025','ponto de vista','reconhecer posição simultaneamente favorável e cautelosa','converter ressalva em rejeição total'],
  [24,142,'PC-DF 2025','informação explícita','reconhecer capacidade apresentada como vantagem','apagar avaliação positiva'],
  [25,143,'PC-DF 2025','progressão textual','verificar se parágrafos posteriores desenvolvem afirmação anterior','ignorar relação entre anúncio e desenvolvimento'],
  [26,143,'PC-DF 2025','extrapolação','não transformar risco genérico em fenômeno específico','introduzir consequência não mencionada'],
  [27,144,'PC-DF 2025','modalização','preservar diferença entre possibilidade e certeza','suprimir verbo modal'],
  [28,145,'CAPES 2024','tese e argumento','identificar relevância social sustentada pelo texto','desconsiderar justificativa apresentada'],
  [29,146,'CAPES 2024','paráfrase segmentada','conferir correspondência de cada componente enumerado','omitir ou trocar componente'],
  [30,147,'CAPES 2024','conector aditivo','interpretar coexistência marcada por também','converter coexistência em substituição'],
  [31,148,'CAPES 2024','inferência explicativa','relacionar saber coletivo amplo e saber individual limitado','negar conclusão apoiada pelo contraste'],
  [32,148,'MPE-TO 2024','recorrência composta','confirmar várias informações em partes diferentes','julgar o item por apenas uma parte'],
  [33,150,'MPE-TO 2024','generalização espacial','não ampliar exemplos localizados para totalidade','acrescentar todos sem suporte'],
  [34,151,'MPE-TO 2024','escopo comparativo','preservar grupo explicitamente afetado','estender efeito ao grupo excluído'],
  [35,152,'MPE-TO 2024','comparação temporal','não comparar datas ausentes','confundir manifestação com conquista jurídica'],
  [36,153,'ANA 2024','condição necessária','preservar qual elemento condiciona o outro','inverter condição e resultado'],
  [37,154,'ANA 2024','comparação de fontes','identificar ampliação de alcance entre documentos','apagar diferença de perspectiva'],
  [38,154,'ANA 2024','tom discursivo','distinguir exposição de crítica','atribuir julgamento negativo não marcado'],
  [39,155,'ANA 2024','convergência','reconhecer ponto comum entre fontes','tratar convergência como oposição'],
  [40,155,'ANA 2024','inferência contextual','ligar cooperação, autonomia e participação','isolar conceitos relacionados'],
].map(([source_question_number,page,exam,skill,cognitive_operation,trap]) => ({
  source_question_number, page, exam, skill, cognitive_operation, trap,
  source_text_stored: false, source_statement_stored: false, commercial_copy_authorized: false,
}));

const microDefinitions = [
  ['causal', 'Preservação da direção causal'],
  ['scope', 'Controle do escopo da afirmação'],
  ['viewpoint', 'Reconstrução de ponto de vista equilibrado'],
  ['explicit', 'Localização e paráfrase de informação explícita'],
  ['progression', 'Reconhecimento da progressão entre parágrafos'],
  ['modal', 'Preservação de modalidade e grau de certeza'],
  ['argument', 'Identificação da função argumentativa'],
  ['additive', 'Interpretação de coexistência e adição'],
  ['comparison', 'Controle de comparação e grupos afetados'],
  ['condition', 'Preservação de condição, consequência e convergência'],
];
const microByKey = new Map(microDefinitions.map(([key, title], index) => [key, {
  id: `prf_d01_interpretacao_b02_mk_${String(index + 1).padStart(2, '0')}`,
  subtopic_id: subtopic.id, title, scope_origin: 'official', confidence: 0.97, traces: baseTrace,
}]));

const texts = {
  a: `Em 2024, a unidade implantou um painel que reúne alertas de manutenção, histórico de falhas e disponibilidade das viaturas. A ferramenta não consertou equipamentos por si mesma; ela permitiu que a chefia antecipasse prioridades. Como resultado dessa reorganização, o tempo médio de indisponibilidade caiu. O relatório recomenda ampliar o uso do painel, mas ressalta que registros incompletos podem produzir decisões inadequadas.`,
  b: `Programas de análise automática conseguem examinar milhares de imagens em poucos minutos e podem auxiliar a triagem de ocorrências. Essa velocidade é uma vantagem concreta. Ainda assim, os resultados dependem dos dados utilizados e devem ser conferidos por profissionais, sobretudo quando servem de base para decisões que afetam pessoas. Nos parágrafos seguintes do estudo, os autores detalham duas limitações: imagens de baixa qualidade aumentam falsos alertas, e situações excepcionais podem escapar aos padrões aprendidos. Por isso, os pesquisadores defendem o uso supervisionado da ferramenta, não seu abandono.`,
  c: `A convivência democrática exige mais que o direito de falar: exige disposição para justificar posições e examinar razões contrárias. A argumentação permite que divergências sejam tratadas pela linguagem, e não pela força. Isso não garante consenso, mas cria condições para decisões públicas mais transparentes e contestáveis.`,
  d: `Nunca houve tanto conhecimento disponível. Cada profissional, porém, domina apenas uma pequena parcela desse acervo. Por isso, vivemos em uma sociedade do conhecimento e também da especialização: sabemos mais coletivamente, ao mesmo tempo que dependemos mais do saber de outras pessoas. Estudar essa dependência envolve identificar quem detém determinada informação, quem precisa dela, como ela circula e quais efeitos surgem quando a comunicação falha.`,
  e: `Proteger as nascentes é condição para assegurar abastecimento regular às comunidades do vale. Um plano regional acrescenta que a água deve atender não apenas às necessidades humanas, mas também à manutenção dos demais seres vivos. Os dois princípios convergem ao reconhecer que práticas tradicionais de manejo ajudam a conservar o recurso. Nesse contexto, autonomia não significa isolamento: significa reduzir relações de sujeição por meio de cooperação que inclua as comunidades afetadas. O documento descreve essas relações em tom expositivo, sem acusar instituições específicas.`,
};

const specs = [
  ['a','causal','A queda no tempo de indisponibilidade favoreceu a criação do painel e levou a chefia a reorganizar as prioridades.','E','O item inverte a direção causal. Segundo o texto, o painel forneceu informações, a chefia reorganizou prioridades e essa reorganização teve como resultado a queda da indisponibilidade. O efeito não pode ser apresentado como causa de sua própria condição antecedente.'],
  ['a','scope','Ao advertir sobre registros incompletos, o texto afirma que o painel provocará necessariamente falhas mecânicas nas viaturas.','E','A ressalva diz que dados incompletos podem levar a decisões inadequadas. Ela não trata da criação de defeitos mecânicos nem apresenta consequência necessária. O item troca um risco decisório possível por um dano técnico certo e não mencionado.'],
  ['b','viewpoint','Os pesquisadores são contrários ao emprego de programas automáticos na triagem de ocorrências.','E','O texto reconhece expressamente a velocidade e a utilidade desses programas e conclui pela utilização supervisionada. Apontar limites e exigir conferência humana não equivale a rejeitar a ferramenta; a posição é favorável, porém cautelosa.'],
  ['b','explicit','A capacidade de examinar grande quantidade de imagens rapidamente é apresentada como vantagem da análise automática.','C','A informação é explícita nos dois primeiros períodos: o programa examina milhares de imagens em minutos, e o texto chama essa velocidade de vantagem concreta. O item preserva a capacidade, a avaliação e o contexto.'],
  ['b','progression','Os parágrafos finais desenvolvem a afirmação de que os resultados automáticos precisam ser conferidos por profissionais.','C','Depois de anunciar a necessidade de conferência, o texto apresenta duas razões: baixa qualidade pode elevar falsos alertas e exceções podem escapar ao padrão aprendido. Esses detalhes desenvolvem e justificam a cautela anunciada antes.'],
  ['b','scope','A possibilidade de falsos alertas permite concluir que o estudo prevê o uso desses programas para fabricar deliberadamente notícias falsas.','E','“Falso alerta” significa classificação técnica incorreta no contexto da triagem. O texto não menciona notícias, intenção de enganar ou divulgação pública. A conclusão usa uma associação externa à palavra “falso” e extrapola o campo temático.'],
  ['b','modal','A substituição de “podem auxiliar a triagem” por “auxiliam a triagem” preservaria integralmente o grau de certeza do primeiro período.','E','O auxiliar “podem” marca possibilidade ou capacidade, sem afirmar ocorrência em todos os casos. A forma “auxiliam” apresenta o auxílio como fato habitual ou efetivo. A retirada do modal aumenta o compromisso do enunciador e altera o sentido.'],
  ['c','argument','O texto defende a importância da argumentação para que divergências democráticas sejam processadas por razões, e não pela força.','C','Essa é a tese central. O segundo período fornece seu fundamento ao opor tratamento linguístico e uso da força; o último delimita o alcance, esclarecendo que argumentar favorece transparência, mas não garante consenso.'],
  ['d','explicit','Segundo o texto, estudar a dependência informacional envolve identificar detentores, destinatários, circulação e efeitos de falhas comunicativas.','C','O último período enumera exatamente quatro dimensões: quem detém, quem precisa, como a informação circula e quais efeitos decorrem da falha. O item realiza uma paráfrase segmentada sem omitir nem acrescentar componente.'],
  ['d','additive','O texto afirma que a sociedade da especialização substituiu a sociedade do conhecimento.','E','O advérbio “também” marca coexistência, e a construção “ao mesmo tempo” reforça a simultaneidade: há expansão do saber coletivo e especialização individual. O item transforma adição em substituição e elimina a tese do contraste.'],
  ['d','comparison','Infere-se que o aumento do conhecimento coletivo não torna cada indivíduo conhecedor de todo o acervo disponível.','C','A inferência é sustentada pela oposição entre “nunca houve tanto conhecimento” e “cada profissional domina apenas uma pequena parcela”. O texto separa o patrimônio coletivo da capacidade individual, portanto não autoriza igualá-los.'],
  ['d','explicit','O conhecimento coletivo aumentou, o domínio individual permanece parcial e a dependência do saber alheio se intensificou.','C','As três partes estão presentes e articuladas no texto. Em itens compostos, cada segmento precisa ser conferido: aumento coletivo, parcela individual limitada e maior dependência aparecem de forma compatível, sem contradição interna.'],
  ['c','scope','A argumentação eliminou o uso da força em todas as sociedades democráticas existentes.','E','O texto afirma que a argumentação permite tratar divergências pela linguagem e cria condições melhores para decisões. Não declara eliminação histórica da força, nem fala de todas as democracias. O item acrescenta totalidade e resultado absoluto.'],
  ['d','comparison','As falhas de circulação da informação prejudicam igualmente todos os profissionais, independentemente de quem detenha ou necessite do dado.','E','O texto propõe justamente identificar papéis e efeitos concretos, o que impede pressupor impacto idêntico para todos. “Quem detém” e “quem precisa” são grupos funcionalmente distintos; a igualdade de prejuízo não foi afirmada.'],
  ['d','scope','É possível concluir que a especialização começou somente depois que o conhecimento passou a circular por meios digitais.','E','O texto não apresenta marco inicial para a especialização nem menciona meios digitais. A disponibilidade atual de muito conhecimento não fornece, por si só, uma data de origem do fenômeno. O item cria comparação temporal sem dados.'],
  ['e','condition','O abastecimento regular é condição para que as nascentes sejam protegidas.','E','A relação foi invertida. O texto estabelece que proteger as nascentes é condição para assegurar o abastecimento. No esquema lógico, proteção é antecedente necessário apresentado; abastecimento regular é o resultado favorecido.'],
  ['e','comparison','O plano regional amplia a perspectiva ao incluir os demais seres vivos entre os beneficiários da água.','C','O primeiro período focaliza o abastecimento humano; o segundo introduz explicitamente “não apenas” as necessidades humanas, “mas também” a manutenção dos demais seres vivos. Há ampliação de alcance, e não simples repetição.'],
  ['e','viewpoint','Ao explicar o conceito de autonomia, o texto critica instituições específicas por manterem comunidades em situação de sujeição.','E','O texto define autonomia e descreve um caminho cooperativo, mas encerra afirmando que o tom é expositivo e que não há acusação a instituições específicas. Explicação conceitual não pode ser convertida em crítica dirigida sem marca avaliativa.'],
  ['e','condition','Os princípios mencionados convergem quanto ao valor das práticas tradicionais para a conservação da água.','C','A convergência é afirmada diretamente: ambos reconhecem que práticas tradicionais de manejo ajudam a conservar o recurso. O item preserva o ponto comum e não afirma identidade total entre os documentos.'],
  ['e','condition','A cooperação que inclui as comunidades afetadas é apresentada como meio de reduzir dependência, e não como renúncia à autonomia.','C','O último período redefine autonomia: ela não é isolamento, mas redução da sujeição por cooperação inclusiva. A inferência integra os conceitos do parágrafo e evita a falsa oposição entre participação coletiva e autonomia.'],
];

const questions = specs.map(([textKey,microKey,claim,answer,explanation], index) => ({
  id: `prf_port_editorial_b02_${String(index + 1).padStart(2, '0')}`,
  subtopic_id: subtopic.id, microknowledge_ids: [microByKey.get(microKey).id],
  statement: `TEXTO ${textKey.toUpperCase()}\n${texts[textKey]}\n\nJulgue o item: ${claim}`,
  options: [], correct_answer: answer, explanation,
  difficulty: index < 5 ? 'facil' : index < 13 ? 'media' : 'dificil',
  format: 'certo_errado', source: 'Autoral DETONA - Lote editorial PRF Português 02',
  is_trick: answer === 'E', traces: baseTrace,
}));

const payload = {
  ...base, operation_id: 'prf-2026-portugues-editorial-batch-02-v1',
  curriculum: { nodes: base.curriculum.nodes.filter(({ id }) => selectedNodeIds.has(id)) },
  microknowledges: [...microByKey.values()],
  edital_map: [{
    id: `map_${subtopic.id}_editorial_b02`, subtopic_id: subtopic.id,
    scope: 'Compreensão e interpretação: escopo, causalidade, modalização e relações entre partes',
    essential_concepts: microDefinitions.map(([,title]) => title),
    rules: ['Preservar escopo e direção lógica', 'Distinguir ressalva de rejeição', 'Conferir cada segmento da paráfrase'],
    exceptions: ['Sem extrapolar informação ausente'], applications: ['cinco textos autorais progressivos'],
    competencies: ['localizar', 'inferir', 'comparar', 'avaliar relações lógicas'], required_knowledge: [],
    microknowledge_ids: [...microByKey.values()].map(({ id }) => id), confidence: 0.97, traces: baseTrace,
  }],
  question_batches: [{ name: 'portugues-editorial-lote-02-interpretacao', questions }],
  metadata: {
    ...base.metadata, generated_at: new Date().toISOString(), editorial_status: 'batch_02_pending_human_review',
    coverage_status: 'incremental_editorial_batches_of_20', canonical_subtopics_covered: 1,
    microknowledge_count: microByKey.size, question_count: questions.length,
    editorial_source_matrix: 'sources/portuguese-aula13-editorial-matrix-batch-02.v1.json',
    publication_blocked: true, import_blocked: true,
  },
};

await mkdir(path.join(root, 'previews'), { recursive: true });
await writeFile(path.join(root, 'production', 'portuguese-editorial-batch-02.v1.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'sources', 'portuguese-aula13-editorial-matrix-batch-02.v1.json'), `${JSON.stringify({
  schema_version: 'detona_editorial_source_matrix_v1', source_id: source.source_id, source_file: source.file_name,
  source_pages: [140,155], source_question_range: [21,40], purpose: 'internal_pattern_analysis_for_authorial_question_creation',
  copyright_safety: { source_text_stored: false, source_statements_stored: false, source_answers_stored: false }, items: sourceMatrix,
}, null, 2)}\n`, 'utf8');

const preview = ['# Preview editorial - PRF Português - Lote 02','',
  '> Documento de revisão humana. Nada deste lote está importado ou publicado.','',
  `**Subtópico:** ${subtopic.name}  `,`**Questões:** ${questions.length}  `,
  `**Microconhecimentos:** ${microByKey.size}  `,'**Formato:** CEBRASPE - Certo ou Errado',''];
let seq = 0;
for (const textKey of Object.keys(texts)) {
  preview.push(`## Texto ${textKey.toUpperCase()}`,'',texts[textKey],'');
  for (const question of questions.filter(({ statement }) => statement.startsWith(`TEXTO ${textKey.toUpperCase()}\n`))) {
    const claim = question.statement.split('\n\nJulgue o item: ')[1];
    const micro = [...microByKey.values()].find(({ id }) => id === question.microknowledge_ids[0]);
    preview.push(`### Questão ${String(++seq).padStart(2,'0')}`,'',claim,'',
      `- **Gabarito:** ${question.correct_answer === 'C' ? 'CERTO' : 'ERRADO'}`,
      `- **Dificuldade:** ${question.difficulty}`,`- **Microconhecimento:** ${micro.title}`,'',
      `**Comentário didático:** ${question.explanation}`,'');
  }
}
await writeFile(path.join(root, 'previews', 'portuguese-editorial-batch-02.preview.md'), `${preview.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ batch: 2, matrix: '21-40', microknowledges: microByKey.size, questions: questions.length }, null, 2));
