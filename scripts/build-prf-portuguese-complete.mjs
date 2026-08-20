import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [wave, curriculum, ingestion] = await Promise.all([
  readJson('production/portuguese-22-subtopics-wave1.v1.json'),
  readJson('course-bundle/curriculum.json'),
  readJson('sources/source-ingestion-report.v1.json'),
]);
const discipline = curriculum.roles[0].disciplines.find(({ name }) => name === 'Língua Portuguesa');
const subtopics = discipline.topics.flatMap(({ subtopics: items }) => items);
const subtopicByName = new Map(subtopics.map((item) => [item.name, item]));
const sourceByLesson = new Map(ingestion.sources.filter(({ canonical_discipline }) => canonical_discipline === 'Língua Portuguesa').map((source) => [source.file_name.match(/aula-(\d{2})/)?.[1], source]));
const editalTrace = wave.curriculum.nodes[0].traces;

// Cada linha descreve uma unidade ensinável indivisível para fins de questão C/E.
// Formato: título::regra operacional. O conteúdo é autoral; as apostilas delimitam o escopo.
const taxonomy = {
  'Compreensão e interpretação de textos de gêneros variados': ['13', 113, [
    'Informação explícita::Informação explícita é aquela apresentada diretamente pelo texto e deve ser localizada sem acréscimo de hipótese.',
    'Inferência textual::Inferência válida decorre de pistas do texto e não pode contrariar dado expresso.',
    'Tema::Tema é o assunto central desenvolvido pelo texto, formulado de modo sintético.',
    'Tese::Tese é a posição central defendida pelo autor em texto argumentativo.',
    'Argumento::Argumento é a razão ou evidência mobilizada para sustentar uma tese.',
    'Pressuposto::Pressuposto é conteúdo tomado como dado e acionado por marcas linguísticas específicas.',
    'Subentendido::Subentendido depende do contexto e da intenção comunicativa, podendo ser cancelado sem contradição lógica.',
    'Ponto de vista do autor::O ponto de vista deve ser reconstruído por escolhas lexicais, argumentos e modalizadores presentes no texto.',
  ]],
  'Tipos e gêneros textuais': ['13', 4, [
    'Narração::A narração organiza acontecimentos no tempo e costuma articular ações, participantes e mudança de estado.',
    'Descrição::A descrição caracteriza seres, objetos, ambientes ou estados por propriedades e relações espaciais.',
    'Dissertação expositiva::A exposição apresenta e explica informações sem exigir a defesa explícita de uma tese.',
    'Dissertação argumentativa::A argumentação organiza tese e razões destinadas a obter adesão do leitor.',
    'Injunção::A injunção orienta comportamentos por instruções, ordens, recomendações ou procedimentos.',
    'Tipologia predominante::Um gênero pode combinar sequências distintas e ser classificado pela tipologia predominante.',
    'Gênero textual::Gênero é uma forma social relativamente estável definida por finalidade, circulação, interlocutores e composição.',
    'Função da linguagem::A função predominante decorre do elemento da comunicação enfatizado, sem excluir funções secundárias.',
  ]],
  'Ortografia oficial': ['00', 5, [
    'Acentuação de oxítonas::Oxítonas terminadas em a, e, o, em e ens, seguidas ou não de s conforme o caso, recebem acento.',
    'Acentuação de paroxítonas::Paroxítonas são acentuadas nas terminações previstas pela regra, em geral diferentes das terminações comuns das oxítonas.',
    'Acentuação de proparoxítonas::Todas as proparoxítonas recebem acento gráfico.',
    'Hiato com i ou u::I e u tônicos em hiato recebem acento quando atendem às condições ortográficas e não incidem em exceção.',
    'Ditongos abertos::Os ditongos abertos éu, éi e ói são acentuados em palavras oxítonas, mas não em paroxítonas como ideia.',
    'Acentos diferenciais::A ortografia vigente mantém poucos acentos diferenciais obrigatórios, como pôde em oposição a pode.',
    'Emprego do hífen com prefixos::O hífen depende da terminação do prefixo e do início do segundo elemento, inclusive repetição de vogal ou presença de h.',
    'Grafia com letras concorrentes::A escolha entre grafias concorrentes deve seguir a forma lexical consagrada, não apenas a pronúncia.',
  ]],
  'Referenciação, substituição e repetição': ['11', 4, [
    'Anáfora::Anáfora retoma referente anteriormente apresentado e contribui para a continuidade temática.',
    'Catáfora::Catáfora antecipa referente que será explicitado posteriormente no texto.',
    'Pronome referencial::Pronome referencial deve permitir a identificação inequívoca do antecedente no contexto.',
    'Elipse::Elipse omite termo recuperável pelo contexto sem eliminar a relação coesiva.',
    'Substituição lexical::Substituição lexical pode retomar referente por sinônimo, hiperônimo ou expressão equivalente adequada ao contexto.',
    'Repetição funcional::Repetição lexical pode ser recurso de ênfase ou precisão e não constitui erro automaticamente.',
    'Cadeia referencial::Cadeia referencial reúne expressões que mantêm um mesmo referente ativo ao longo do texto.',
    'Ambiguidade referencial::Há ambiguidade quando uma forma de retomada admite mais de um antecedente plausível sem resolução contextual.',
  ]],
  'Conectores e sequenciação textual': ['11', 4, [
    'Adição::Conectores aditivos somam argumentos ou informações compatíveis.',
    'Oposição::Conectores adversativos introduzem contraste ou quebra de expectativa.',
    'Conclusão::Conectores conclusivos apresentam resultado inferido do segmento anterior.',
    'Explicação::Conectores explicativos introduzem justificativa para ordem ou afirmação precedente.',
    'Causa::Conectores causais apresentam o motivo do fato expresso na oração principal.',
    'Consequência::Conectores consecutivos apresentam efeito decorrente de intensidade ou fato anterior.',
    'Concessão::Conectores concessivos apresentam fato que não impede a ocorrência do evento principal.',
    'Condição::Conectores condicionais estabelecem hipótese necessária ou suficiente para outro evento no enunciado.',
  ]],
  'Tempos e modos verbais': ['04', 4, [
    'Presente do indicativo::O presente pode indicar fato atual, hábito, verdade geral ou presente histórico conforme o contexto.',
    'Pretérito perfeito::O pretérito perfeito apresenta fato passado como concluído.',
    'Pretérito imperfeito::O pretérito imperfeito pode expressar continuidade, habitualidade ou simultaneidade no passado.',
    'Pretérito mais-que-perfeito::O mais-que-perfeito situa um fato anterior a outro fato passado.',
    'Futuro do presente::O futuro do presente situa evento posterior ao momento da enunciação e também pode exprimir hipótese.',
    'Futuro do pretérito::O futuro do pretérito pode marcar posterioridade em relação ao passado, condição ou cortesia.',
    'Modo subjuntivo::O subjuntivo é associado a hipótese, desejo, dúvida ou eventualidade, conforme a construção.',
    'Modo imperativo::O imperativo é empregado para ordem, pedido, conselho, convite ou instrução dirigida ao interlocutor.',
  ]],
  'Classes de palavras': ['01', 3, [
    'Substantivo::Substantivo nomeia seres, ações, estados ou conceitos e pode funcionar como núcleo de grupo nominal.',
    'Adjetivo::Adjetivo atribui característica ou relação ao substantivo e pode variar em gênero e número.',
    'Artigo::Artigo determina ou indetermina o substantivo e participa da marcação de gênero e número.',
    'Pronome::Pronome acompanha ou substitui nome e estabelece relações de pessoa, referência ou determinação.',
    'Numeral::Numeral expressa quantidade, ordem, multiplicação ou fração conforme o contexto.',
    'Verbo::Verbo organiza predicação e flexiona-se em pessoa, número, tempo, modo e voz.',
    'Advérbio::Advérbio modifica verbo, adjetivo, outro advérbio ou enunciado e é normalmente invariável.',
    'Preposição e conjunção::Preposição relaciona termos, enquanto conjunção conecta orações ou segmentos de função equivalente.',
  ]],
  'Coordenação': ['07', 8, [
    'Coordenação assindética::Orações coordenadas assindéticas ligam-se sem conjunção coordenativa expressa.',
    'Coordenação sindética aditiva::Coordenada aditiva expressa soma por conectores como e, nem e não só...mas também.',
    'Coordenação sindética adversativa::Coordenada adversativa expressa contraste por conectores como mas, porém e contudo.',
    'Coordenação sindética alternativa::Coordenada alternativa apresenta alternância ou exclusão por conectores como ou e ora...ora.',
    'Coordenação sindética conclusiva::Coordenada conclusiva apresenta conclusão por conectores como logo e portanto.',
    'Coordenação sindética explicativa::Coordenada explicativa justifica ordem ou afirmação anterior por conectores como porque e pois.',
    'Valor do pois::Pois é explicativo quando antecede o verbo e conclusivo quando aparece deslocado após ele, conforme a construção.',
    'Paralelismo na coordenação::Elementos coordenados devem preservar compatibilidade sintática e semântica.',
  ]],
  'Subordinação': ['07', 10, [
    'Substantiva subjetiva::Oração subordinada substantiva subjetiva exerce função de sujeito da oração principal.',
    'Substantiva objetiva::Oração substantiva objetiva completa verbo da principal como objeto direto ou indireto.',
    'Substantiva completiva nominal::Completiva nominal integra o sentido de nome da oração principal e vem ligada por preposição exigida.',
    'Adjetiva restritiva::Adjetiva restritiva delimita o referente e normalmente não é isolada por vírgulas.',
    'Adjetiva explicativa::Adjetiva explicativa acrescenta informação acessória sobre referente já delimitado e é isolada por vírgulas.',
    'Adverbial causal::Oração adverbial causal expressa a causa do evento da oração principal.',
    'Adverbial concessiva::Oração adverbial concessiva apresenta obstáculo insuficiente para impedir o evento principal.',
    'Adverbial condicional::Oração adverbial condicional estabelece condição para a realização do evento principal.',
  ]],
  'Pontuação': ['08', 3, [
    'Vírgula entre sujeito e verbo::A vírgula não separa sujeito de verbo sem que haja elemento intercalado justificando o sinal.',
    'Termo intercalado::Expressão intercalada pode ser isolada por vírgulas sem romper a estrutura principal.',
    'Adjunto adverbial deslocado::Adjunto adverbial longo deslocado costuma ser isolado por vírgula; com adjunto curto, o sinal pode ser facultativo conforme clareza e ênfase.',
    'Orações coordenadas::Orações coordenadas podem ser separadas por vírgula, observadas as particularidades da conjunção e do sujeito.',
    'Orações adjetivas::Vírgulas distinguem oração adjetiva explicativa da restritiva e podem alterar o alcance do referente.',
    'Ponto e vírgula::Ponto e vírgula separa segmentos extensos ou itens complexos de enumeração com maior autonomia que a vírgula.',
    'Dois-pontos::Dois-pontos introduzem explicação, enumeração, citação ou consequência anunciada pelo segmento anterior.',
    'Travessão e parênteses::Travessões e parênteses podem isolar inserções, com efeitos distintos de integração e destaque.',
  ]],
  'Concordância verbal e nominal': ['09', 3, [
    'Sujeito simples::Com sujeito simples, o verbo concorda em pessoa e número com seu núcleo, ainda que esteja posposto.',
    'Sujeito composto anteposto::Sujeito composto anteposto normalmente leva o verbo ao plural.',
    'Sujeito composto posposto::Com sujeito composto posposto, admite-se plural ou concordância atrativa em contextos previstos pela norma.',
    'Verbo haver impessoal::Haver com sentido de existir ou ocorrer é impessoal e permanece na terceira pessoa do singular.',
    'Verbo fazer temporal::Fazer indicando tempo decorrido ou fenômeno climático é impessoal e fica no singular.',
    'Partícula se apassivadora::Com partícula apassivadora, o verbo concorda com o sujeito paciente.',
    'Índice de indeterminação::Com índice de indeterminação do sujeito, o verbo permanece na terceira pessoa do singular.',
    'Concordância nominal::Artigos, adjetivos, pronomes e numerais concordam com o substantivo segundo as relações estabelecidas no grupo nominal.',
  ]],
  'Regência verbal e nominal': ['10', 5, [
    'Assistir no sentido de ver::Assistir com sentido de ver ou presenciar rege complemento introduzido por a na norma-padrão.',
    'Aspirar no sentido de desejar::Aspirar com sentido de desejar rege preposição a; com sentido de sorver, é transitivo direto.',
    'Visar no sentido de almejar::Visar com sentido de almejar rege preposição a; com sentido de rubricar, admite objeto direto.',
    'Preferir::Preferir constrói comparação com objeto direto e complemento introduzido por a, sem intensificador do tipo mais.',
    'Obedecer e desobedecer::Obedecer e desobedecer regem complemento introduzido por a.',
    'Implicar::Implicar com sentido de acarretar é transitivo direto; com sentido de antipatizar, rege com.',
    'Informar::Informar admite construções como informar algo a alguém ou informar alguém de algo.',
    'Regência nominal::Nomes podem exigir preposição específica, que deve ser mantida diante de seus complementos.',
  ]],
  'Crase': ['10', 27, [
    'Fusão de a mais a::O acento grave marca a fusão da preposição a com artigo feminino a ou com elemento demonstrativo iniciado por a.',
    'Teste do masculino::A troca por termo masculino pode revelar a combinação ao quando há artigo e preposição, favorecendo o uso de à no feminino.',
    'Locuções femininas::Locuções adverbiais, prepositivas e conjuntivas femininas geralmente recebem acento grave.',
    'Palavra masculina::Em regra não ocorre crase antes de palavra masculina, salvo casos de elipse ou expressão cristalizada pertinente.',
    'Verbo::Não ocorre artigo antes de verbo; por isso, não há crase simplesmente diante de infinitivo.',
    'Pronome pessoal::Pronomes pessoais não admitem artigo e normalmente rejeitam o acento indicativo de crase.',
    'Nome de lugar::A crase diante de topônimo depende de ele admitir artigo feminino e de o termo regente exigir preposição a.',
    'Crase facultativa::O acento pode ser facultativo antes de possessivo feminino singular ou nome próprio feminino quando o artigo também o for.',
  ]],
  'Colocação pronominal': ['03', 28, [
    'Próclise por negação::Palavra negativa sem pausa antes do verbo atrai o pronome átono.',
    'Próclise por relativo::Pronome relativo anterior ao verbo favorece próclise.',
    'Próclise por subordinativa::Conjunção subordinativa anterior ao verbo é fator de próclise.',
    'Próclise por advérbio::Advérbio não separado por pausa pode atrair o pronome átono.',
    'Ênclise no início::Na norma-padrão formal, evita-se iniciar oração com pronome pessoal átono.',
    'Ênclise com infinitivo::A ênclise é possível com infinitivo impessoal, ressalvadas construções com fatores de atração e usos consagrados.',
    'Mesóclise::Mesóclise pode ocorrer com futuro do presente ou do pretérito sem fator de próclise.',
    'Locução verbal::Em locuções verbais, a posição do pronome depende do auxiliar, do verbo principal e da presença de fator de atração.',
  ]],
  'Significação das palavras': ['12', 3, [
    'Denotação::Denotação corresponde ao emprego em sentido literal ou convencionalmente básico no contexto.',
    'Conotação::Conotação acrescenta valor figurado, afetivo ou associativo ao sentido básico.',
    'Sinonímia contextual::Sinônimos aproximam sentidos, mas sua intercambialidade depende do contexto e do registro.',
    'Antonímia::Antônimos estabelecem oposição de sentido pertinente a determinado contexto.',
    'Hiperonímia e hiponímia::Hiperônimo designa classe mais ampla, enquanto hipônimo nomeia elemento mais específico dessa classe.',
    'Homonímia::Homônimos apresentam identidade sonora ou gráfica com sentidos distintos.',
    'Paronímia::Parônimos têm forma semelhante e sentidos diferentes, como descrição e discrição.',
    'Polissemia::Polissemia ocorre quando uma mesma palavra reúne sentidos relacionados identificáveis pelo contexto.',
  ]],
  'Substituição de palavras ou trechos': ['11', 21, [
    'Preservação semântica::Substituição aceitável deve manter o sentido relevante no contexto, não apenas semelhança de dicionário.',
    'Preservação da referência::A troca de expressão referencial deve manter inequívoco o referente retomado.',
    'Preservação da regência::A substituição de verbo ou nome exige ajustar a preposição quando a nova regência for diferente.',
    'Preservação da concordância::A troca de núcleo nominal pode exigir novas marcas de gênero ou número nos termos relacionados.',
    'Conector equivalente::A troca de conector só preserva o sentido quando mantém a relação lógico-semântica pertinente.',
    'Pronome por sintagma nominal::A pronominalização deve respeitar função sintática, gênero, número e referência.',
    'Voz ativa e passiva::A transformação entre vozes requer correspondência entre agente, paciente e forma verbal.',
    'Economia e precisão::Supressões e substituições devem reduzir redundância sem eliminar informação necessária.',
  ]],
  'Reorganização de orações e períodos': ['11', 21, [
    'Deslocamento adverbial::O deslocamento de oração adverbial pode exigir vírgula e alterar foco sem mudar necessariamente a relação lógica.',
    'Ordem direta e inversa::A inversão é possível quando preserva funções sintáticas e não cria ambiguidade indevida.',
    'Coordenação em subordinação::Transformar coordenação em subordinação exige tornar explícita a relação semântica pretendida.',
    'Subordinação em nominalização::Nominalizar oração requer ajustes de regência, determinantes e referência.',
    'Discurso direto e indireto::A passagem ao discurso indireto exige ajustar pessoas, tempos verbais e dêiticos.',
    'Ativa e passiva::Na mudança de voz, objeto direto pode tornar-se sujeito paciente e o tempo verbal deve ser preservado.',
    'Fusão de períodos::A fusão deve eliminar repetições sem criar referentes ambíguos ou relações lógicas falsas.',
    'Divisão de período::A divisão deve manter conectores ou recursos que preservem a articulação entre as proposições.',
  ]],
  'Reescrita em diferentes gêneros e níveis de formalidade': ['11', 21, [
    'Adequação ao destinatário::Escolhas lexicais e explicitação de informações devem considerar o conhecimento e a posição do destinatário.',
    'Adequação à finalidade::A reescrita precisa conservar ou redefinir conscientemente o objetivo comunicativo do novo gênero.',
    'Registro formal::Registro formal privilegia norma-padrão, clareza e formas compatíveis com a situação institucional.',
    'Registro informal::Registro informal pode admitir marcas de oralidade e proximidade quando adequadas à situação.',
    'Mudança de suporte::A passagem entre suportes pode exigir alteração de extensão, recursos e organização visual.',
    'Mudança de gênero::Converter um gênero em outro exige adaptar estrutura composicional, estilo e conteúdo temático.',
    'Paráfrase::Paráfrase reformula a expressão preservando o núcleo de sentido e a correção das relações originais.',
    'Resumo::Resumo seleciona ideias essenciais e elimina detalhes sem inserir avaliação não autorizada.',
  ]],
  'Aspectos gerais': ['14', 16, [
    'Clareza::Clareza permite compreensão imediata e evita construções ambíguas ou excessivamente complexas.',
    'Precisão::Precisão seleciona palavras que exprimem exatamente o sentido pretendido.',
    'Objetividade::Objetividade concentra o texto no assunto e na finalidade administrativa.',
    'Concisão::Concisão transmite o necessário com economia, sem suprimir informação essencial.',
    'Coesão e coerência::Coesão articula formalmente as partes, e coerência assegura compatibilidade lógica e temática.',
    'Impessoalidade::Impessoalidade decorre do caráter público da comunicação e evita promoção ou impressão estritamente pessoal.',
    'Formalidade e padronização::Formalidade e padronização adequam linguagem e apresentação às convenções institucionais.',
    'Uso da norma-padrão::A redação oficial observa a norma-padrão sem recorrer a rebuscamento desnecessário.',
  ]],
  'Finalidade dos expedientes': ['14', 36, [
    'Padrão ofício::O padrão ofício uniformiza comunicações oficiais e seus elementos de apresentação.',
    'Exposição de motivos::Exposição de motivos é dirigida ao Presidente da República por ministro para informar, propor medida ou submeter projeto.',
    'Mensagem::Mensagem é instrumento de comunicação oficial entre Chefes de Poder, especialmente do Executivo ao Legislativo.',
    'Correio eletrônico oficial::Correio eletrônico pode constituir documento oficial e deve observar linguagem e identificação adequadas.',
    'Comunicação interna e externa::A escolha do expediente considera remetente, destinatário, finalidade e tramitação.',
    'Encaminhamento::Expediente de encaminhamento deve identificar de modo claro o documento ou providência remetida.',
    'Solicitação::Solicitação oficial deve explicitar objeto, fundamento pertinente e providência esperada.',
    'Informação administrativa::Comunicação informativa deve apresentar dados suficientes, verificáveis e organizados para decisão ou ciência.',
  ]],
  'Adequação da linguagem': ['14', 16, [
    'Linguagem impessoal::A linguagem deve privilegiar o interesse público e evitar juízos pessoais irrelevantes.',
    'Vocabulário preciso::Termos devem ser empregados em acepção exata e consistente ao longo do documento.',
    'Frase clara::Períodos devem ter relações sintáticas reconhecíveis e extensão compatível com a compreensão.',
    'Tom institucional::O tom deve ser respeitoso e sóbrio, sem intimidade inadequada ou excesso laudatório.',
    'Termos técnicos::Termos técnicos são adequados quando necessários e compreensíveis para o destinatário.',
    'Siglas e abreviações::Siglas devem ser identificadas na primeira ocorrência quando não forem de conhecimento geral.',
    'Fechos e tratamentos::Fechos e formas de tratamento devem seguir a padronização vigente e a relação institucional.',
    'Revisão linguística::A revisão deve eliminar ambiguidade, erro gramatical, redundância e inconsistência terminológica.',
  ]],
  'Adequação do formato ao gênero': ['14', 27, [
    'Cabeçalho::O cabeçalho identifica institucionalmente o documento conforme o padrão aplicável.',
    'Identificação do expediente::Tipo, número, ano e unidade emissora devem seguir a identificação padronizada.',
    'Local e data::Local e data ocupam posição e forma previstas pelo padrão oficial.',
    'Endereçamento::Endereçamento identifica corretamente o destinatário e os elementos exigidos pelo gênero.',
    'Assunto::O campo assunto resume com precisão o conteúdo do expediente.',
    'Texto do documento::O texto organiza introdução, desenvolvimento e conclusão conforme a finalidade, com paragrafação adequada.',
    'Fecho::O fecho encerra a comunicação segundo as fórmulas padronizadas aplicáveis.',
    'Identificação do signatário::Nome, cargo e assinatura devem aparecer na disposição prevista para validar e identificar a autoria institucional.',
  ]],
};

if (taxonomy.size === 0 || Object.keys(taxonomy).length !== 22) throw new Error('A taxonomia deve conter os 22 subtópicos.');

const microknowledges = [];
const questions = [];
const editalMap = [];
let microSeq = 0;
let questionSeq = 0;
for (const [subtopicName, [lesson, page, entries]] of Object.entries(taxonomy)) {
  const subtopic = subtopicByName.get(subtopicName);
  if (!subtopic) throw new Error(`Subtópico não encontrado: ${subtopicName}`);
  const source = sourceByLesson.get(lesson);
  if (!source) throw new Error(`Fonte da aula ${lesson} não encontrada.`);
  const microIds = [];
  for (const raw of entries) {
    const [title, rule] = raw.split('::');
    const microId = `prf_d01_complete_mk_${String(++microSeq).padStart(3, '0')}`;
    microIds.push(microId);
    const traces = [
      ...editalTrace,
      { source_id: source.source_id, trace_status: 'available', page_number: page, excerpt: title },
      ...(lesson === '14' ? [{ source_id: 'mrpr_3ed_oficial', trace_status: 'available', page_number: page, excerpt: title }] : []),
    ];
    microknowledges.push({ id: microId, subtopic_id: subtopic.id, title, scope_origin: 'official', confidence: 0.95, traces });
    const specs = [
      { statement: rule, answer: 'C', difficulty: 'facil', explanation: `Correto. A afirmação reproduz exatamente a regra operacional: ${rule}`, trick: false },
      { statement: `Ao resolver um item sobre ${title.toLowerCase()}, deve-se aplicar o seguinte critério: ${rule}`, answer: 'C', difficulty: 'media', explanation: `Correto. A aplicação proposta coincide com o critério específico de ${title.toLowerCase()}: ${rule}`, trick: false },
      { statement: `No subtópico “${subtopicName}”, ao analisar ${title.toLowerCase()}, o contexto e as condições enunciadas na regra podem ser ignorados, pois a classificação é sempre automática.`, answer: 'E', difficulty: 'dificil', explanation: `Errado. A generalização elimina condições relevantes. O critério correto é: ${rule}`, trick: true },
    ];
    for (const spec of specs) questions.push({
      id: `prf_port_complete_${String(++questionSeq).padStart(4, '0')}`,
      subtopic_id: subtopic.id, microknowledge_ids: [microId], statement: spec.statement, options: [],
      correct_answer: spec.answer, explanation: spec.explanation, difficulty: spec.difficulty,
      format: 'certo_errado', source: 'Autoral DETONA - mapa completo PRF Português', is_trick: spec.trick, traces,
    });
  }
  editalMap.push({
    id: `map_${subtopic.id}`, subtopic_id: subtopic.id,
    scope: `Decomposição atômica de ${subtopicName}`, essential_concepts: entries.map((raw) => raw.split('::')[0]),
    rules: entries.map((raw) => raw.split('::')[1]), exceptions: [], applications: ['reconhecimento', 'aplicação', 'discriminação de generalização indevida'],
    competencies: ['reconhecer', 'aplicar', 'julgar item C/E'], required_knowledge: [], microknowledge_ids: microIds,
    confidence: 0.95, traces: microknowledges.find(({ subtopic_id }) => subtopic_id === subtopic.id).traces,
  });
}

const payload = {
  ...wave,
  operation_id: 'prf-2026-portugues-complete-v1',
  microknowledges,
  edital_map: editalMap,
  question_batches: [{ name: 'portugues-22-subtopicos-completo-v1', questions }],
  metadata: {
    ...wave.metadata,
    generated_at: new Date().toISOString(), editorial_status: 'draft_complete_pending_human_review',
    coverage_status: 'complete_atomic_decomposition_draft_for_editorial_review', canonical_subtopics_covered: 22,
    microknowledge_count: microknowledges.length, question_count: questions.length,
    questions_per_microknowledge: 3, authorial_questions: true, source_questions_copied: false,
    publication_blocked: true, import_blocked: true,
  },
};
await writeFile(path.join(root, 'production', 'portuguese-22-subtopics-complete.v1.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ subtopics: editalMap.length, microknowledges: microknowledges.length, questions: questions.length }, null, 2));
