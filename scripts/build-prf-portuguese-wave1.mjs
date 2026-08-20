import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [pilot, curriculum, ingestion] = await Promise.all([
  readJson('production/portuguese-regency-crase-pilot.v1.json'),
  readJson('course-bundle/curriculum.json'),
  readJson('sources/source-ingestion-report.v1.json'),
]);
const discipline = curriculum.roles[0].disciplines.find(({ name }) => name === 'Língua Portuguesa');
const subtopicByName = new Map(discipline.topics.flatMap(({ subtopics }) => subtopics).map((item) => [item.name, item]));
const officialTrace = pilot.curriculum.nodes[0].traces;
const sourceByLesson = new Map(ingestion.sources.filter(({ canonical_discipline: name }) => name === 'Língua Portuguesa').map((source) => {
  const lesson = source.file_name.match(/aula-(\d{2})/)?.[1]; return [lesson, source];
}));
const trace = (lesson, page, excerpt) => [{ source_id: sourceByLesson.get(lesson).source_id, trace_status: 'available', page_number: page, excerpt }];
const teachingTraces = (lesson, page, excerpt) => [
  ...trace(lesson, page, excerpt),
  ...(lesson === '14' ? [{ source_id: 'mrpr_3ed_oficial', trace_status: 'available', page_number: page, excerpt }] : []),
];

// Uma âncora por subtópico ainda descoberto. É cobertura diagnóstica inicial, não decomposição final.
const anchors = [
  ['Compreensão e interpretação de textos de gêneros variados','13',113,'Distinguir informação explícita de inferência autorizada pelo texto',
    ['Compreender um texto inclui localizar informações expressas e relacioná-las para produzir inferências sustentadas.','Uma inferência pode ser considerada válida mesmo quando contradiz uma informação expressa no texto.','Toda interpretação é subjetiva e dispensa evidência textual.'],['C','E','E']],
  ['Tipos e gêneros textuais','13',4,'Reconhecer tipologia predominante e finalidade do gênero',
    ['A classificação tipológica considera os traços predominantes e a finalidade principal do texto.','Um manual de procedimentos tende a apresentar predominância injuntiva por orientar ações.','A presença de descrição em uma narrativa impede que o texto seja classificado como narrativo.'],['C','C','E']],
  ['Ortografia oficial','00',5,'Aplicar convenções ortográficas e de acentuação vigentes',
    ['A ortografia oficial reúne convenções de grafia, acentuação, hífen e emprego de letras.','As formas “ideia” e “heroico” devem receber acento agudo segundo a ortografia vigente.','A palavra “saúde” recebe acento porque o “u” tônico forma hiato nas condições previstas pela regra.'],['C','E','C']],
  ['Referenciação, substituição e repetição','11',4,'Identificar retomadas anafóricas e cadeias referenciais',
    ['Um pronome pode retomar elemento anterior e contribuir para a coesão referencial.','Em “A equipe publicou o relatório e o revisou”, o pronome “o” retoma “relatório”.','Toda repetição lexical constitui erro de coesão e deve ser eliminada.'],['C','C','E']],
  ['Conectores e sequenciação textual','11',4,'Reconhecer o valor semântico dos conectores',
    ['Conectores organizam relações como causa, consequência, oposição e concessão.','Em “Embora chovesse, a operação continuou”, “embora” introduz concessão.','A troca de “contudo” por “portanto” preserva necessariamente a relação argumentativa.'],['C','C','E']],
  ['Tempos e modos verbais','04',4,'Interpretar valores temporais e modais das formas verbais',
    ['O modo subjuntivo pode marcar hipótese, possibilidade ou desejo.','Em “Se houvesse recursos, ampliaríamos a operação”, as formas verbais constroem uma hipótese.','O modo indicativo expressa certeza absoluta em qualquer contexto.'],['C','C','E']],
  ['Classes de palavras','01',3,'Classificar palavras conforme funcionamento no contexto',
    ['A classe de uma palavra deve ser analisada também por seu funcionamento no enunciado.','Em “ela está meio cansada”, “meio” funciona como advérbio e permanece invariável.','Uma mesma forma lexical pertence sempre à mesma classe, independentemente do contexto.'],['C','C','E']],
  ['Coordenação','07',8,'Reconhecer orações coordenadas e relações semânticas',
    ['Orações coordenadas não exercem função sintática uma em relação à outra.','Em “A equipe chegou, mas não iniciou a fiscalização”, a segunda oração é coordenada adversativa.','Orações coordenadas são sempre desprovidas de relação semântica entre si.'],['C','C','E']],
  ['Subordinação','07',10,'Reconhecer funções substantivas, adjetivas e adverbiais',
    ['Uma oração subordinada exerce função sintática em relação a outra estrutura.','Em “Quando a chuva cessou, a pista foi liberada”, a oração inicial expressa circunstância temporal.','Toda oração subordinada precisa apresentar verbo em forma finita e conjunção expressa.'],['C','C','E']],
  ['Pontuação','08',3,'Empregar pontuação conforme estrutura sintática e sentido',
    ['A vírgula não deve separar, sem elemento intercalado, o sujeito de seu verbo.','Em “Os agentes da unidade, concluíram o relatório”, a vírgula está corretamente empregada.','A pontuação pode alterar relações de sentido e não se reduz à marcação de pausas respiratórias.'],['C','E','C']],
  ['Concordância verbal e nominal','09',3,'Estabelecer concordância com o núcleo pertinente',
    ['Na regra geral, o verbo concorda em número e pessoa com o núcleo do sujeito.','Em “Faltam documentos no processo”, o plural verbal está de acordo com o sujeito posposto.','A forma “houveram ocorrências” está correta quando “haver” significa existir.'],['C','C','E']],
  ['Colocação pronominal','03',28,'Aplicar próclise, ênclise e mesóclise conforme o contexto',
    ['Palavra negativa anterior ao verbo normalmente atrai o pronome átono.','A colocação em “A equipe não se omitiu” está adequada à norma-padrão.','Em registro formal, iniciar a oração com pronome átono em “Me informaram o resultado” é a única colocação possível.'],['C','C','E']],
  ['Significação das palavras','12',3,'Determinar sentido contextual, denotação e relações lexicais',
    ['O sentido de uma palavra pode variar conforme o contexto em que ela ocorre.','Na expressão “a notícia caiu como uma bomba”, “bomba” é empregada em sentido estritamente denotativo.','Sinônimos podem apresentar diferenças de uso e nem sempre são intercambiáveis em todos os contextos.'],['C','E','C']],
  ['Substituição de palavras ou trechos','11',21,'Avaliar substituições quanto a sentido, coesão e correção',
    ['Uma substituição válida deve preservar as relações relevantes de sentido e a correção gramatical.','A troca de “contudo” por “porém” pode preservar uma relação adversativa.','Palavras registradas como sinônimas podem ser trocadas livremente em qualquer contexto.'],['C','C','E']],
  ['Reorganização de orações e períodos','11',21,'Reordenar estruturas preservando vínculos sintáticos e referenciais',
    ['A reorganização de um período exige controle de concordância, referência e relações lógico-semânticas.','A passagem da voz ativa para a passiva pode preservar a informação central, desde que se façam os ajustes necessários.','O deslocamento de qualquer oração subordinada é neutro e nunca exige alteração de pontuação.'],['C','C','E']],
  ['Reescrita em diferentes gêneros e níveis de formalidade','11',21,'Adequar a reescrita ao gênero, ao destinatário e ao grau de formalidade',
    ['A reescrita deve considerar propósito comunicativo, destinatário e convenções do gênero.','Abreviações informais de conversa são sempre adequadas em comunicação administrativa formal.','Mudar o gênero textual envolve apenas substituir palavras, sem alterar organização ou finalidade.'],['C','E','E']],
  ['Aspectos gerais','14',16,'Reconhecer clareza, precisão, objetividade, concisão, coesão, impessoalidade e formalidade',
    ['Clareza e precisão integram os atributos da redação oficial.','Impessoalidade significa ocultar informações indispensáveis sobre o órgão responsável.','Concisão consiste em transmitir o necessário sem redundância, e não em eliminar conteúdo essencial.'],['C','E','C']],
  ['Finalidade dos expedientes','14',36,'Relacionar cada expediente oficial à sua finalidade comunicativa',
    ['A escolha do expediente deve considerar a finalidade e os participantes da comunicação.','Exposição de motivos e mensagem possuem finalidades institucionais idênticas e podem ser sempre intercambiadas.','A finalidade comunicativa ajuda a determinar o documento oficial adequado.'],['C','E','C']],
  ['Adequação da linguagem','14',16,'Empregar linguagem formal, clara, precisa e impessoal',
    ['A linguagem oficial deve ser compreensível, objetiva e adequada à situação institucional.','Formalidade autoriza o uso de construções obscuras sempre que o vocabulário seja técnico.','Precisão lexical reduz ambiguidades na comunicação oficial.'],['C','E','C']],
  ['Adequação do formato ao gênero','14',27,'Aplicar estrutura e formatação compatíveis com o documento oficial',
    ['Documentos oficiais devem observar a estrutura e os elementos previstos para seu gênero.','Assunto, endereçamento e identificação do signatário podem ser posicionados aleatoriamente sem afetar a padronização.','A padronização facilita identificação, tramitação e leitura dos expedientes.'],['C','E','C']],
];

let seq = 24;
const newMicro = anchors.map(([subtopic, lesson, page, title]) => ({
  id: `prf_d01_wave1_mk_${String(anchors.findIndex((item) => item[0] === subtopic) + 1).padStart(2, '0')}`,
  subtopic_id: subtopicByName.get(subtopic).id, title, scope_origin: 'official', confidence: 0.95,
  traces: [...officialTrace, ...teachingTraces(lesson, page, title)],
}));
const newQuestions = anchors.flatMap((entry, anchorIndex) => entry[4].map((statement, index) => ({
  id: `prf_port_wave1_${String(++seq).padStart(3, '0')}`, subtopic_id: subtopicByName.get(entry[0]).id,
  microknowledge_ids: [newMicro[anchorIndex].id], statement, options: [], correct_answer: entry[5][index],
  explanation: entry[5][index] === 'C'
    ? `Correto. O critério avaliado é: ${entry[3].toLowerCase()}. A afirmação o aplica sem extrapolar a regra.`
    : `Errado. O critério avaliado é: ${entry[3].toLowerCase()}. O item contém generalização ou relação incompatível com a análise contextual e a norma-padrão.`,
  difficulty: ['facil','media','dificil'][index], format: 'certo_errado',
  source: 'Autoral DETONA - cobertura diagnóstica PRF', is_trick: index === 2,
  traces: [...officialTrace, ...teachingTraces(entry[1], entry[2], entry[3])],
})));
const portugueseNodes = [
  { id: curriculum.roles[0].id, parent_id: null, type: 'role', title: curriculum.roles[0].name, description: '', order: 0, confidence: 1, traces: officialTrace },
  { id: discipline.id, parent_id: curriculum.roles[0].id, type: 'discipline', title: discipline.name, description: discipline.description, order: 0, confidence: 1, traces: officialTrace },
  ...discipline.topics.flatMap((topic) => [
    { id: topic.id, parent_id: discipline.id, type: 'topic', title: topic.name, description: '', order: topic.order, confidence: 1, traces: officialTrace },
    ...topic.subtopics.map((subtopic) => ({ id: subtopic.id, parent_id: topic.id, type: 'subtopic', title: subtopic.name, description: '', order: subtopic.order, confidence: 1, traces: officialTrace })),
  ]),
];
const allMicro = [...pilot.microknowledges, ...newMicro];
const mapBySubtopic = new Map(pilot.edital_map.map((item) => [item.subtopic_id, item]));
for (const micro of newMicro) mapBySubtopic.set(micro.subtopic_id, {
  id: `map_${micro.subtopic_id}`, subtopic_id: micro.subtopic_id, scope: micro.title,
  essential_concepts: [micro.title], rules: [], exceptions: [], applications: ['diagnóstico por questão'],
  competencies: ['reconhecer', 'aplicar', 'discriminar erro típico'], required_knowledge: [],
  microknowledge_ids: [micro.id], confidence: micro.confidence, traces: micro.traces,
});
const materialSources = [...new Set(anchors.map(([, lesson]) => lesson))].map((lesson) => sourceByLesson.get(lesson)).map((source) => ({
  id: source.source_id, source_type: 'complementary', category: 'material_curso', title: source.file_name,
  file_name: source.file_name, page_count: source.page_count, availability: 'reference_only', url: '', sha256: source.sha256,
}));
const sources = [...pilot.sources, ...materialSources.filter(({ id }) => !pilot.sources.some((item) => item.id === id)), {
  id: 'mrpr_3ed_oficial', source_type: 'complementary', category: 'manual', title: 'Manual de Redação da Presidência da República - 3ª edição',
  file_name: 'Manual_Redacao_Presidencia_3ed.pdf', page_count: 189, availability: 'external_reference',
  url: 'https://www.gov.br/cvm/pt-br/assuntos/noticias/anexos/2020/20201222_Manual_Redacao_Presidencia.pdf', sha256: '',
}];
const payload = {
  ...pilot, operation_id: 'prf-2026-portugues-wave1-v1', sources, curriculum: { nodes: portugueseNodes },
  microknowledges: allMicro, edital_map: [...mapBySubtopic.values()],
  question_batches: [{ name: 'portugues-cobertura-diagnostica-22-subtopicos-v1', questions: [...pilot.question_batches[0].questions, ...newQuestions] }],
  metadata: { ...pilot.metadata, generated_at: new Date().toISOString(), editorial_status: 'draft_for_human_review',
    coverage_status: 'initial_anchor_coverage_not_full_atomic_decomposition', canonical_subtopics_covered: 22,
    microknowledge_count: allMicro.length, question_count: 24 + newQuestions.length },
};
await writeFile(path.join(root, 'production', 'portuguese-22-subtopics-wave1.v1.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ subtopics: 22, microknowledges: allMicro.length, questions: payload.metadata.question_count }, null, 2));
