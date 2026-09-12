import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [wave, curriculum, ingestion] = await Promise.all([
  readJson('production/portuguese-22-subtopics-wave1.v1.json'),
  readJson('course-bundle/curriculum.json'),
  readJson('sources/source-ingestion-report.v1.json'),
]);
const discipline = curriculum.roles[0].disciplines.find(({ name }) => name === 'Língua Portuguesa');
const subtopic = discipline.topics.flatMap(({ subtopics }) => subtopics)
  .find(({ name }) => name === 'Compreensão e interpretação de textos de gêneros variados');
const topic = discipline.topics.find(({ subtopics }) => subtopics.some(({ id }) => id === subtopic.id));
const selectedNodeIds = new Set([curriculum.roles[0].id, discipline.id, topic.id, subtopic.id]);
const source = ingestion.sources.find(({ source_id }) => source_id === 'prf_pdf_8871f98bc130');
const traces = [
  ...wave.curriculum.nodes[0].traces,
  { source_id: source.source_id, trace_status: 'available', page_number: 113, excerpt: 'Interpretação e compreensão: recorrência, inferência, pressuposto e extrapolação' },
];

const microDefinitions = [
  ['explicit', 'Localização de informação explícita'],
  ['inference', 'Inferência autorizada por pistas textuais'],
  ['extrapolation', 'Identificação de extrapolação'],
  ['theme', 'Identificação do tema'],
  ['thesis', 'Identificação da tese'],
  ['argument', 'Reconhecimento da função do argumento'],
  ['presupposition', 'Recuperação de pressuposto linguístico'],
  ['viewpoint', 'Reconstrução do ponto de vista do autor'],
];
const microByKey = new Map(microDefinitions.map(([key, title], index) => [key, {
  id: `prf_d01_interpretacao_mk_${String(index + 1).padStart(2, '0')}`,
  subtopic_id: subtopic.id, title, scope_origin: 'official', confidence: 0.97, traces,
}]));

const texts = {
  a: `Após a instalação de iluminação em um trecho urbano da rodovia, o número de colisões noturnas caiu 18% em seis meses. O relatório técnico, porém, adverte que o período também teve menos chuvas e menor circulação de veículos pesados. Para os analistas, a iluminação contribuiu para a melhora, mas os dados não permitem atribuir a redução a uma única causa.`,
  b: `Quando Helena voltou a fiscalizar o posto, ainda encontrou três balanças sem calibração. Duas haviam sido reparadas na semana anterior, mas a terceira continuava interditada. Ela registrou a pendência e solicitou nova vistoria antes da retomada completa das operações.`,
  c: `Fiscalizações remotas podem ampliar a triagem de veículos, mas não substituem integralmente a presença do agente. Câmeras e sensores identificam padrões suspeitos com rapidez; já a abordagem presencial permite avaliar circunstâncias que os sistemas não captam. A estratégia mais eficiente, portanto, combina tecnologia e decisão humana.`,
  d: `— A equipe da barreira ficará sem cones refletivos para o turno da noite — avisou Rui.\n— O almoxarifado fecha em dez minutos — respondeu Lúcia, enquanto pegava a chave do veículo.`,
  e: `Sistemas capazes de prever pontos de congestionamento ajudam a distribuir equipes e reduzir o tempo de resposta. Essa capacidade, contudo, não transforma previsões em certezas: acidentes, obras emergenciais e mudanças climáticas podem alterar o fluxo em poucos minutos. Usar dados com responsabilidade exige combinar modelos estatísticos, atualização constante e julgamento profissional.`,
};

// Matriz extraída dos itens 1-20 (p. 128-140), sem transcrever texto ou enunciado protegido.
const sourceMatrix = [
  [1,128,'INOVERSASUL 2025','referenciação','identificar o antecedente de expressão resumitiva','trocar o referente'],
  [2,128,'INOVERSASUL 2025','modalização','avaliar o efeito categórico de advérbio absoluto','ignorar a força do modalizador'],
  [3,129,'TRF-6 2025','inferência global','integrar partes em uma conclusão sistêmica','ler elementos de forma isolada'],
  [4,130,'TRF-6 2025','escopo quantitativo','preservar a entidade à qual um percentual se aplica','atribuir o percentual a outra relação'],
  [5,130,'TRF-6 2025','generalização','distinguir descrição local de propriedade exclusiva','converter ocorrência em particularidade'],
  [6,130,'TRF-6 2025','inferência temporal','calcular limite temporal a partir de marco e intervalo','ignorar o valor de menos de'],
  [7,131,'TRF-6 2025','relação causal','distinguir redução de tempo/custo de redução de estoque','trocar a variável afetada'],
  [8,132,'TRF-6 2025','pressuposto lexical','recuperar relação marcada por expressão inclusiva','não perceber a inclusão pressuposta'],
  [9,132,'TRF-6 2025','intensidade semântica','comparar possibilidade, risco e impedimento','elevar risco a impossibilidade'],
  [10,133,'TRF-6 2025','extrapolação avaliativa','separar recomendação de acusação','inferir negligência sem pista'],
  [11,133,'TRF-6 2025','comparação implícita','interpretar marca de suscetibilidade particular','não recuperar o termo de comparação'],
  [12,134,'TRF-6 2025','modalização epistêmica','distinguir hipótese de informação categórica','converter possibilidade em fato'],
  [13,134,'TRF-6 2025','recorrência por paráfrase','preservar especificidade e restrição de acesso','desfigurar condição explícita'],
  [14,135,'TRF-6 2025','recorte temporal','distinguir início do fenômeno de início do corpus analisado','converter desde em origem histórica'],
  [15,136,'TRF-6 2025','tema e propósito','não atribuir detalhamento ausente ao texto','ampliar o conteúdo efetivamente desenvolvido'],
  [16,136,'TRF-6 2025','reescrita de definição','preservar alternativas e condições de uma definição','reduzir definição disjuntiva a uma só hipótese'],
  [17,138,'PC-DF 2025','extrapolação causal','rejeitar consequência institucional não mencionada','inventar impacto sobre acordos'],
  [18,139,'PC-DF 2025','mudança de perspectiva','reconstruir contraste entre passado e presente','congelar o ponto de vista inicial'],
  [19,139,'PC-DF 2025','paráfrase inferencial','relacionar aproximação institucional e cooperação','negar consequência sustentada'],
  [20,139,'PC-DF 2025','polaridade avaliativa','preservar avaliação negativa expressa no contexto','trocar temor por avaliação positiva'],
].map(([source_question_number,page,exam,skill,cognitive_operation,trap]) => ({
  source_question_number, page, exam, skill, cognitive_operation, trap,
  source_text_stored: false, source_statement_stored: false, commercial_copy_authorized: false,
}));

const specs = [
  ['a','explicit','O texto informa expressamente que as colisões noturnas diminuíram 18% nos seis meses observados.','C','A informação aparece de modo direto no primeiro período. O item apenas a parafraseia, conservando percentual, tipo de ocorrência e intervalo temporal; por isso, não exige inferência.'],
  ['a','inference','Infere-se do texto que a iluminação foi considerada um dos fatores possivelmente associados à redução das colisões.','C','A conclusão é autorizada pela afirmação de que a iluminação “contribuiu para a melhora”. O texto admite participação da medida, embora rejeite tratá-la como causa exclusiva. Inferir participação não equivale a provar causalidade única.'],
  ['a','extrapolation','Os dados apresentados comprovam que a instalação da iluminação foi responsável por toda a redução das colisões.','E','O item extrapola. O relatório menciona menos chuvas e menor circulação de veículos pesados e declara que não é possível atribuir a redução a uma única causa. “Contribuiu” foi indevidamente convertido em “foi responsável por toda”.'],
  ['a','argument','A referência à menor quantidade de chuvas e à circulação reduzida de veículos pesados funciona como ressalva à explicação causal baseada apenas na iluminação.','C','Esses dados não são detalhes soltos: cumprem função argumentativa. Eles apresentam variáveis concorrentes e sustentam a cautela da conclusão, impedindo que correlação temporal seja tomada automaticamente como causalidade exclusiva.'],
  ['b','presupposition','O emprego de “voltou a fiscalizar” permite pressupor que Helena já havia realizado essa atividade anteriormente.','C','O verbo “voltar”, seguido de infinitivo, marca retomada. Para alguém voltar a fiscalizar, a atividade precisa ter ocorrido antes e ter sido interrompida. Trata-se de pressuposto acionado linguisticamente, não de opinião livre do leitor.'],
  ['b','explicit','Segundo o texto, as três balanças encontradas por Helena permaneciam sem reparo.','E','O texto distingue calibração, reparo e interdição. Ele afirma que duas balanças haviam sido reparadas e que a terceira continuava interditada. O item apaga essa oposição e atribui às três a condição de não reparadas.'],
  ['b','inference','A solicitação de nova vistoria indica que Helena não considerou suficiente o estado encontrado para a retomada completa das operações.','C','A inferência liga duas pistas: havia uma balança ainda interditada e Helena pediu vistoria “antes da retomada completa”. Logo, a retomada dependia de providência adicional; o item não inventa qual seria o resultado da vistoria.'],
  ['b','extrapolation','É correto concluir que a equipe anterior ignorou deliberadamente os problemas de calibração.','E','Nada no texto informa intenção, autoria da falha ou conduta deliberada da equipe anterior. A existência de equipamentos sem calibração autoriza reconhecer uma pendência, mas atribuir negligência consciente ultrapassa as pistas disponíveis.'],
  ['c','thesis','A ideia central defendida é que o uso combinado de tecnologia e atuação humana tende a ser mais eficiente que a substituição integral dos agentes por sistemas remotos.','C','A tese está condensada na conclusão introduzida por “portanto”. Os períodos anteriores preparam essa posição ao atribuírem capacidades diferentes e complementares aos sensores e à abordagem presencial.'],
  ['c','argument','A rapidez dos sensores e a capacidade humana de avaliar circunstâncias não captadas pelas máquinas são apresentadas como argumentos complementares.','C','Cada recurso recebe uma vantagem específica. Essa divisão de competências sustenta a tese da combinação: a tecnologia amplia a triagem, enquanto o agente interpreta aspectos que escapam ao sistema.'],
  ['c','viewpoint','O autor rejeita completamente o emprego de câmeras e sensores em fiscalizações.','E','O ponto de vista é favorável ao uso da tecnologia, desde que ela não seja tratada como substituta integral da presença humana. O texto reconhece expressamente que câmeras e sensores identificam padrões suspeitos com rapidez.'],
  ['c','explicit','O texto afirma que a abordagem presencial permite avaliar circunstâncias que os sistemas não captam.','C','A proposição reproduz informação explícita do segundo período, sem ampliar seu alcance. Note que o texto diz que existem circunstâncias não captadas; ele não afirma que sistemas sejam incapazes de captar qualquer circunstância.'],
  ['d','inference','A resposta de Lúcia sugere que ela percebeu urgência em buscar os cones antes do fechamento do almoxarifado.','C','A fala informa o prazo curto, e a ação simultânea de pegar a chave do veículo mostra reação prática ao aviso. Juntas, essas pistas autorizam inferir urgência, embora o texto não declare literalmente “Lúcia irá buscar os cones”.'],
  ['d','explicit','Rui declara de forma direta que o almoxarifado fecharia em dez minutos.','E','Essa informação é expressa por Lúcia, não por Rui. A proposição até recupera corretamente o conteúdo, mas troca o responsável pela fala. Em questões de recorrência, também é necessário preservar quem disse ou fez cada coisa.'],
  ['d','presupposition','A expressão “turno da noite” pressupõe necessariamente que Rui já havia trabalhado em todos os turnos anteriores daquele dia.','E','“Turno da noite” identifica um período operacional, mas não contém marca linguística que imponha a participação prévia de Rui em outros turnos. O item transforma uma possibilidade contextual em pressuposto necessário.'],
  ['d','viewpoint','A atitude de Lúcia revela que ela tratou o problema como demanda operacional imediata, e não como simples informação sem consequência prática.','C','O ponto de vista da personagem é inferido pela combinação entre fala e gesto: ela destaca que restam dez minutos e pega a chave. A ação funciona como evidência de que o aviso exigia providência rápida.'],
  ['e','theme','O texto trata do uso responsável de previsões de tráfego no planejamento operacional.','C','Esse enunciado sintetiza o assunto recorrente dos três períodos: utilidade dos sistemas preditivos, limites das previsões e condições para empregá-las com responsabilidade. Tema é mais amplo que um exemplo isolado e mais neutro que a tese.'],
  ['e','thesis','O autor sustenta que previsões de tráfego só devem ser utilizadas quando forem capazes de eliminar toda incerteza operacional.','E','A tese é justamente que previsão não é certeza e deve ser combinada com atualização e julgamento profissional. Exigir eliminação total da incerteza contradiz o texto e tornaria inútil a contribuição que o primeiro período reconhece.'],
  ['e','argument','A menção a acidentes, obras emergenciais e mudanças climáticas exemplifica fatores que limitam a estabilidade das previsões.','C','A enumeração concretiza a ressalva introduzida por “contudo”. Esses eventos podem alterar o fluxo rapidamente e, assim, fundamentam a necessidade de atualização constante e de julgamento profissional.'],
  ['e','extrapolation','Como modelos estatísticos podem falhar, o texto conclui que decisões operacionais devem desconsiderar previsões de congestionamento.','E','O raciocínio do texto não é de rejeição, mas de uso responsável. Ele reconhece que previsões ajudam a distribuir equipes e recomenda combiná-las com atualização e julgamento. Limitação de uma ferramenta não significa inutilidade.'],
];

const questions = specs.map(([textKey, microKey, claim, answer, explanation], index) => ({
  id: `prf_port_editorial_b01_${String(index + 1).padStart(2, '0')}`,
  subtopic_id: subtopic.id,
  microknowledge_ids: [microByKey.get(microKey).id],
  statement: `TEXTO ${textKey.toUpperCase()}\n${texts[textKey]}\n\nJulgue o item: ${claim}`,
  options: [], correct_answer: answer, explanation,
  difficulty: index < 6 ? 'facil' : index < 14 ? 'media' : 'dificil',
  format: 'certo_errado', source: 'Autoral DETONA - Lote editorial PRF Português 01',
  is_trick: answer === 'E', traces: [...traces, {
    source_id: source.source_id, trace_status: 'available', page_number: 128,
    excerpt: 'Matriz agregada dos itens 1-20, páginas 128-140: operações cognitivas e armadilhas usadas como referência, sem cópia textual',
  }],
}));

const payload = {
  ...wave,
  operation_id: 'prf-2026-portugues-editorial-batch-01-v1',
  curriculum: { nodes: wave.curriculum.nodes.filter(({ id }) => selectedNodeIds.has(id)) },
  microknowledges: [...microByKey.values()],
  edital_map: [{
    id: `map_${subtopic.id}_editorial_b01`, subtopic_id: subtopic.id,
    scope: 'Compreensão e interpretação: recorrência, inferência e arquitetura argumentativa',
    essential_concepts: microDefinitions.map(([, title]) => title),
    rules: ['Preservar dados explícitos', 'Inferir somente a partir de pistas', 'Distinguir tema, tese e argumento'],
    exceptions: ['Inferência não autoriza extrapolação'], applications: ['cinco textos autorais progressivos'],
    competencies: ['localizar', 'inferir', 'sintetizar', 'avaliar argumento'], required_knowledge: [],
    microknowledge_ids: [...microByKey.values()].map(({ id }) => id), confidence: 0.97, traces,
  }],
  question_batches: [{ name: 'portugues-editorial-lote-01-interpretacao', questions }],
  metadata: {
    ...wave.metadata, generated_at: new Date().toISOString(), editorial_status: 'batch_01_pending_human_review',
    coverage_status: 'incremental_editorial_batches_of_20', canonical_subtopics_covered: 1,
    microknowledge_count: microByKey.size, question_count: questions.length,
    authorial_questions: true, source_questions_copied: false,
    editorial_source_matrix: 'sources/portuguese-aula13-editorial-matrix-batch-01.v1.json',
    publication_blocked: true, import_blocked: true,
    quality_contract: ['texto-base autoral', 'decisão interpretativa real', 'distrator plausível', 'comentário que ensina o critério'],
  },
};

await writeFile(path.join(root, 'production', 'portuguese-editorial-batch-01.v1.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'sources', 'portuguese-aula13-editorial-matrix-batch-01.v1.json'), `${JSON.stringify({
  schema_version: 'detona_editorial_source_matrix_v1', source_id: source.source_id,
  source_file: source.file_name, source_pages: [128, 140], source_question_range: [1, 20],
  purpose: 'internal_pattern_analysis_for_authorial_question_creation',
  copyright_safety: { source_text_stored: false, source_statements_stored: false, source_answers_stored: false },
  items: sourceMatrix,
}, null, 2)}\n`, 'utf8');
const previewLines = [
  '# Preview editorial - PRF Português - Lote 01',
  '',
  '> Documento de revisão humana. Nada deste lote está importado ou publicado.',
  '',
  `**Subtópico:** ${subtopic.name}  `,
  `**Questões:** ${questions.length}  `,
  `**Microconhecimentos:** ${microByKey.size}  `,
  '**Formato:** CEBRASPE - Certo ou Errado',
  '',
];
let previewQuestion = 0;
for (const textKey of Object.keys(texts)) {
  previewLines.push(`## Texto ${textKey.toUpperCase()}`, '', texts[textKey], '');
  for (const question of questions.filter(({ statement }) => statement.startsWith(`TEXTO ${textKey.toUpperCase()}\n`))) {
    previewQuestion += 1;
    const claim = question.statement.split('\n\nJulgue o item: ')[1];
    const micro = [...microByKey.values()].find(({ id }) => id === question.microknowledge_ids[0]);
    previewLines.push(
      `### Questão ${String(previewQuestion).padStart(2, '0')}`,
      '',
      claim,
      '',
      `- **Gabarito:** ${question.correct_answer === 'C' ? 'CERTO' : 'ERRADO'}`,
      `- **Dificuldade:** ${question.difficulty}`,
      `- **Microconhecimento:** ${micro.title}`,
      '',
      `**Comentário didático:** ${question.explanation}`,
      '',
    );
  }
}
await mkdir(path.join(root, 'previews'), { recursive: true });
await writeFile(path.join(root, 'previews', 'portuguese-editorial-batch-01.preview.md'), `${previewLines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ batch: 1, subtopic: subtopic.name, microknowledges: microByKey.size, questions: questions.length }, null, 2));
