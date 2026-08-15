import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IDS = Object.freeze({
  discipline: 'pc_ba_2026_investigador_policia_civil_discipline_nocoes_de_direito_administrativo',
  topic: 'pc_ba_2026_investigador_policia_civil_topic_nocoes_de_direito_administrativo_8_regime_juridico_administrativo',
  subtopic: 'pc_ba_2026_investigador_policia_civil_subtopic_nocoes_de_direito_administrativo_8_1_conceito',
  concept: 'pc_ba_2026_inv_mk_aec3ec59036f06',
  elements: 'pc_ba_2026_inv_mk_de71cb2a46e005',
  distinctions: 'pc_ba_2026_inv_mk_338caadd9f1da1',
  application: 'pc_ba_2026_inv_mk_73d3a36f80c00d',
});

const labels = ['A', 'B', 'C', 'D', 'E'];
const materialSource = (pages, usedFor = 'Fundamento doutrinário e revisão técnica.') => ({
  source_id: 'pc_ba_2026_inv_dadm_aula_00',
  location: `páginas ${pages}`,
  used_for: usedFor,
});
const constitutionSource = (usedFor = 'Validação normativa do regime constitucional da Administração.') => ({
  source_id: 'br_constituicao_1988_compilada',
  location: 'art. 37, caput',
  used_for: usedFor,
  verified_at: '2026-08-15',
});

function question({
  sequence, primary, secondary = [], role, competence, reasoning, statement, command = 'Assinale a alternativa correta.',
  optionTexts, correct, difficulty, analyses, summary, correctAnalysis, trap, added, takeaway, sources,
}) {
  return {
    question_id: `pcba_inv_dadm_08_01_q${String(sequence).padStart(3, '0')}`,
    sequence,
    primary_microknowledge_id: primary,
    secondary_microknowledge_ids: secondary,
    pedagogical_role: role,
    competence,
    reasoning_type: reasoning,
    statement,
    command,
    options: labels.map((label, index) => ({ label, text: optionTexts[index] })),
    correct_option: correct,
    difficulty,
    explanation: {
      summary,
      correct_option_analysis: correctAnalysis,
      option_analysis: Object.fromEntries(labels.map((label, index) => [label, analyses[index]])),
      trap,
      added_knowledge: added,
      learning_takeaway: takeaway,
    },
    source_references: sources,
    status: 'rascunho_revisar',
  };
}

export function buildPilotBatch() {
  const questions = [
    question({
      sequence: 1, primary: IDS.concept, role: 'diagnostic', competence: 'conceituar', reasoning: 'recognition', difficulty: 'facil',
      statement: 'No estudo do Direito Administrativo, a expressão regime jurídico designa uma estrutura normativa aplicável a determinadas relações jurídicas.',
      optionTexts: [
        'Um conjunto de normas que disciplina relações jurídicas.',
        'Uma relação de atos administrativos sem efeitos externos.',
        'Um catálogo facultativo de recomendações aos agentes públicos.',
        'Uma lista exclusiva de sanções aplicáveis aos particulares.',
        'Um sistema formado apenas por precedentes judiciais vinculantes.'
      ], correct: 'A',
      analyses: [
        'Correta: regime jurídico é o conjunto de normas que disciplina relações jurídicas.',
        'Incorreta: o conceito não se limita a atos administrativos nem exclui efeitos externos.',
        'Incorreta: normas jurídicas não são simples recomendações facultativas.',
        'Incorreta: o regime também organiza direitos, deveres, poderes e restrições.',
        'Incorreta: a jurisprudência pode integrar a interpretação, mas não esgota o conceito.'
      ],
      summary: 'O conceito geral de regime jurídico parte de um conjunto de normas aplicáveis a relações jurídicas.',
      correctAnalysis: 'A alternativa A apresenta o núcleo conceitual sem reduzir o regime a uma única fonte ou função.',
      trap: 'Confundir regime jurídico com uma lista de atos, sanções ou precedentes.',
      added: 'O conteúdo concreto do regime varia conforme a relação e a disciplina normativa aplicável.',
      takeaway: 'Regime jurídico é uma estrutura normativa, não um ato isolado.',
      sources: [materialSource('5-6')],
    }),
    question({
      sequence: 2, primary: IDS.concept, role: 'teaching', competence: 'distinguir', reasoning: 'conceptual_understanding', difficulty: 'facil',
      statement: 'A doutrina diferencia regime de direito público e regime de direito privado pela posição dos sujeitos e pelos interesses protegidos.',
      optionTexts: [
        'O direito público sempre coloca todos os sujeitos em absoluta igualdade formal.',
        'O direito privado é caracterizado, em regra, pela horizontalidade entre as partes.',
        'O direito privado concede à Administração poderes unilaterais desconhecidos dos particulares.',
        'O direito público exclui deveres e restrições para o Estado.',
        'Os dois regimes são idênticos e a distinção não possui utilidade conceitual.'
      ], correct: 'B',
      analyses: [
        'Incorreta: o regime público pode produzir relações verticais em razão das prerrogativas estatais.',
        'Correta: nas relações privadas, a regra é a coordenação ou horizontalidade entre as partes.',
        'Incorreta: poderes unilaterais especiais são associados ao regime de direito público.',
        'Incorreta: o regime público combina prerrogativas com sujeições e controles.',
        'Incorreta: embora coexistam na prática, os regimes conservam diferenças conceituais relevantes.'
      ],
      summary: 'A horizontalidade é característica geral das relações privadas, enquanto o regime público admite verticalidade.',
      correctAnalysis: 'A alternativa B identifica corretamente a igualdade de posições como regra nas relações privadas.',
      trap: 'Trocar horizontalidade e verticalidade entre os regimes.',
      added: 'A presença da Administração não basta, sozinha, para definir qual regime predomina no caso.',
      takeaway: 'Direito privado tende à horizontalidade; direito público pode conferir posição de supremacia funcional.',
      sources: [materialSource('5-6')],
    }),
    question({
      sequence: 3, primary: IDS.concept, role: 'reinforcement', competence: 'conceituar', reasoning: 'recognition', difficulty: 'facil',
      statement: 'O regime jurídico-administrativo possui sentido mais específico do que o regime jurídico da Administração Pública.',
      optionTexts: [
        'Abrange somente as relações privadas mantidas por empresas estatais.',
        'Reúne regras eleitorais aplicáveis aos agentes políticos.',
        'Corresponde aos traços de direito público que conferem prerrogativas e impõem sujeições à Administração.',
        'Elimina a incidência dos princípios constitucionais administrativos.',
        'Autoriza o agente público a escolher livremente os fins da atuação estatal.'
      ], correct: 'C',
      analyses: [
        'Incorreta: o regime jurídico-administrativo não é sinônimo de regime privado das estatais.',
        'Incorreta: regras eleitorais não definem o conceito examinado.',
        'Correta: prerrogativas e sujeições especiais formam o núcleo do regime jurídico-administrativo.',
        'Incorreta: princípios constitucionais condicionam a atuação administrativa.',
        'Incorreta: a finalidade pública e a legalidade limitam a escolha do agente.'
      ],
      summary: 'O regime jurídico-administrativo é um regime de direito público marcado por poderes e restrições especiais.',
      correctAnalysis: 'A alternativa C expressa a bipolaridade entre prerrogativas e sujeições.',
      trap: 'Tratar a expressão como sinônimo de qualquer norma aplicável à Administração.',
      added: 'A expressão regime jurídico da Administração é mais ampla e pode abranger direito público e privado.',
      takeaway: 'Regime jurídico-administrativo é o recorte de direito público baseado em prerrogativas e sujeições.',
      sources: [materialSource('6-9')],
    }),
    question({
      sequence: 4, primary: IDS.concept, role: 'retention', competence: 'reconhecer', reasoning: 'recognition', difficulty: 'facil',
      statement: 'As prerrogativas administrativas existem para permitir que o Estado alcance finalidades definidas pelo ordenamento jurídico.',
      optionTexts: [
        'São vantagens pessoais concedidas ao agente público.',
        'São imunidades absolutas contra o controle judicial.',
        'São dispensas gerais do dever de motivar os atos.',
        'São poderes instrumentais orientados à realização do interesse público.',
        'São faculdades destinadas a aumentar o patrimônio particular do gestor.'
      ], correct: 'D',
      analyses: [
        'Incorreta: a prerrogativa pertence à função administrativa, não à pessoa do agente.',
        'Incorreta: a Administração continua submetida a controle e limites jurídicos.',
        'Incorreta: a motivação pode ser exigida e não é afastada genericamente.',
        'Correta: os poderes especiais são instrumentos para cumprir finalidades públicas.',
        'Incorreta: o benefício privado do gestor é incompatível com a finalidade pública.'
      ],
      summary: 'Prerrogativas são poderes funcionais, vinculados ao alcance de finalidades públicas.',
      correctAnalysis: 'A alternativa D conecta corretamente o poder especial à sua natureza instrumental.',
      trap: 'Personalizar a prerrogativa como privilégio do ocupante do cargo.',
      added: 'O desvio da finalidade pode tornar ilegítimo o uso de uma competência administrativa.',
      takeaway: 'A prerrogativa serve à coletividade e não ao agente.',
      sources: [materialSource('7-8')],
    }),
    question({
      sequence: 5, primary: IDS.concept, role: 'diagnostic', competence: 'reconhecer', reasoning: 'conceptual_understanding', difficulty: 'facil',
      statement: 'A indisponibilidade do interesse público limita a atuação administrativa porque o gestor não é titular dos bens e interesses que administra.',
      optionTexts: [
        'Permite renúncia livre a direitos públicos sempre que houver conveniência pessoal.',
        'Transforma todo bem estatal em bem livremente alienável.',
        'Afasta a necessidade de licitação e de concurso público.',
        'Concede autonomia privada plena ao agente público.',
        'Impõe sujeições para proteger interesses pertencentes à coletividade.'
      ], correct: 'E',
      analyses: [
        'Incorreta: interesses públicos não podem ser renunciados por conveniência pessoal.',
        'Incorreta: a alienação de bens públicos está sujeita a requisitos e limites.',
        'Incorreta: licitação e concurso são exemplos de sujeições administrativas.',
        'Incorreta: o agente atua segundo competência e finalidade legal, não por autonomia privada plena.',
        'Correta: a indisponibilidade protege aquilo que pertence à coletividade.'
      ],
      summary: 'A Administração gere interesses alheios e, por isso, sofre restrições especiais.',
      correctAnalysis: 'A alternativa E associa corretamente indisponibilidade, coletividade e sujeição administrativa.',
      trap: 'Interpretar indisponibilidade como poder de disposição ampliado.',
      added: 'A legalidade administrativa é uma manifestação importante das sujeições do regime.',
      takeaway: 'O gestor administra interesses da sociedade; não pode tratá-los como patrimônio próprio.',
      sources: [materialSource('7-9')],
    }),
    question({
      sequence: 6, primary: IDS.elements, role: 'teaching', competence: 'identificar elementos', reasoning: 'recognition', difficulty: 'facil',
      statement: 'A estrutura clássica do regime jurídico-administrativo é explicada por dois polos complementares.',
      optionTexts: [
        'Prerrogativas e sujeições.',
        'Receitas e despesas.',
        'Jurisdição e legislação.',
        'Capacidade civil e capacidade eleitoral.',
        'Prescrição e coisa julgada.'
      ], correct: 'A',
      analyses: [
        'Correta: poderes especiais e restrições especiais formam os dois polos do regime.',
        'Incorreta: receitas e despesas pertencem à gestão financeira, não ao conceito solicitado.',
        'Incorreta: jurisdição e legislação não compõem essa bipolaridade.',
        'Incorreta: capacidades civil e eleitoral tratam de outros ramos jurídicos.',
        'Incorreta: prescrição e coisa julgada não definem os polos do regime.'
      ],
      summary: 'O regime equilibra poderes funcionais e limitações impostas à Administração.',
      correctAnalysis: 'A alternativa A nomeia os dois elementos estruturantes reconhecidos pela doutrina.',
      trap: 'Escolher pares jurídicos conhecidos, mas estranhos ao conceito pedido.',
      added: 'As prerrogativas não anulam as sujeições; ambas coexistem no exercício da função.',
      takeaway: 'Poder e limite são inseparáveis no regime jurídico-administrativo.',
      sources: [materialSource('7-9')],
    }),
    question({
      sequence: 7, primary: IDS.elements, secondary: [IDS.concept], role: 'discrimination', competence: 'distinguir', reasoning: 'discrimination', difficulty: 'intermediaria',
      statement: 'Considere as expressões regime jurídico da Administração e regime jurídico-administrativo. Elas não possuem extensão idêntica.',
      optionTexts: [
        'A primeira se limita ao direito público; a segunda inclui apenas o direito privado.',
        'A primeira abrange regimes público e privado; a segunda enfatiza o regime de direito público administrativo.',
        'Ambas designam exclusivamente normas de contratação de servidores.',
        'A segunda é mais ampla porque inclui toda relação privada da Administração.',
        'A primeira é categoria processual; a segunda, categoria penal.'
      ], correct: 'B',
      analyses: [
        'Incorreta: a relação entre as expressões foi invertida.',
        'Correta: regime da Administração é amplo; regime jurídico-administrativo identifica traços publicísticos.',
        'Incorreta: as expressões não se restringem à gestão de pessoal.',
        'Incorreta: o regime jurídico-administrativo é mais específico, não mais amplo.',
        'Incorreta: a distinção pertence ao Direito Administrativo.'
      ],
      summary: 'A expressão ampla alcança diferentes regimes; a específica destaca prerrogativas e sujeições publicísticas.',
      correctAnalysis: 'A alternativa B preserva a diferença de extensão entre os dois conceitos.',
      trap: 'Inverter qual expressão é mais ampla.',
      added: 'A Administração pode usar formas privadas sem se desligar completamente de deveres públicos.',
      takeaway: 'Regime da Administração é gênero amplo; regime jurídico-administrativo é recorte publicístico.',
      sources: [materialSource('6-9')],
    }),
    question({
      sequence: 8, primary: IDS.elements, role: 'reinforcement', competence: 'classificar', reasoning: 'conceptual_understanding', difficulty: 'intermediaria',
      statement: 'Em um contrato administrativo, a possibilidade legal de alteração unilateral pela Administração exemplifica elemento do regime jurídico-administrativo.',
      optionTexts: [
        'Sujeição decorrente da horizontalidade privada.',
        'Renúncia ao interesse público.',
        'Prerrogativa administrativa condicionada pela lei e pela finalidade pública.',
        'Direito pessoal do gestor do contrato.',
        'Imunidade contra recomposição do equilíbrio contratual.'
      ], correct: 'C',
      analyses: [
        'Incorreta: alteração unilateral expressa verticalidade, não horizontalidade.',
        'Incorreta: o exercício regular da competência busca realizar a finalidade pública.',
        'Correta: trata-se de poder especial, mas juridicamente condicionado.',
        'Incorreta: a competência pertence à Administração, não ao gestor em caráter pessoal.',
        'Incorreta: prerrogativa não significa afastamento de todos os direitos do contratado.'
      ],
      summary: 'A alteração unilateral é exemplo de prerrogativa, desde que exercida nos limites legais.',
      correctAnalysis: 'A alternativa C classifica o instituto e preserva seus limites.',
      trap: 'Tratar prerrogativa como poder pessoal e ilimitado.',
      added: 'O mesmo regime que concede poderes também impõe deveres de finalidade, legalidade e controle.',
      takeaway: 'Prerrogativa é poder funcional condicionado, nunca arbitrariedade.',
      sources: [materialSource('5-8')],
    }),
    question({
      sequence: 9, primary: IDS.elements, role: 'teaching', competence: 'classificar', reasoning: 'application', difficulty: 'intermediaria',
      statement: 'Uma autoridade pretende vender, sem observar requisitos legais, prédio público utilizado por uma escola. A limitação à conduta decorre do regime jurídico-administrativo.',
      optionTexts: [
        'Da autonomia da vontade do agente.',
        'Da liberdade contratual irrestrita do Estado.',
        'Da supremacia patrimonial pessoal do gestor.',
        'Da sujeição ligada à indisponibilidade do interesse público.',
        'Da inexistência de finalidade pública para bens estatais.'
      ], correct: 'D',
      analyses: [
        'Incorreta: o agente público não atua com a mesma autonomia privada do proprietário.',
        'Incorreta: a liberdade estatal é juridicamente limitada.',
        'Incorreta: o gestor não é proprietário do patrimônio público.',
        'Correta: a destinação coletiva impõe requisitos e impede disposição pessoal do bem.',
        'Incorreta: o uso escolar evidencia finalidade pública relevante.'
      ],
      summary: 'A indisponibilidade impede que o gestor trate o patrimônio público como bem particular.',
      correctAnalysis: 'A alternativa D identifica a sujeição que protege o interesse coletivo.',
      trap: 'Aplicar autonomia privada a um bem afetado a serviço público.',
      added: 'A inobservância das sujeições pode produzir invalidade do ato e responsabilização.',
      takeaway: 'Bens e interesses públicos são administrados, não apropriados pelo gestor.',
      sources: [materialSource('5-8')],
    }),
    question({
      sequence: 10, primary: IDS.elements, role: 'retention', competence: 'relacionar', reasoning: 'conceptual_understanding', difficulty: 'intermediaria',
      statement: 'A doutrina relaciona as prerrogativas e sujeições do regime jurídico-administrativo a princípios estruturantes.',
      optionTexts: [
        'Publicidade e continuidade, exclusivamente.',
        'Eficiência e especialidade, exclusivamente.',
        'Moralidade e autotutela, sem relação com interesse público.',
        'Legalidade penal e liberdade contratual.',
        'Supremacia do interesse público e indisponibilidade do interesse público.'
      ], correct: 'E',
      analyses: [
        'Incorreta: esses princípios são relevantes, mas não formam o par estrutural clássico pedido.',
        'Incorreta: eficiência e especialidade não substituem o par indicado pela doutrina clássica.',
        'Incorreta: moralidade e autotutela não afastam o fundamento no interesse público.',
        'Incorreta: liberdade contratual privada não explica as sujeições administrativas.',
        'Correta: supremacia fundamenta prerrogativas e indisponibilidade fundamenta restrições.'
      ],
      summary: 'A construção clássica conecta supremacia a poderes e indisponibilidade a limites.',
      correctAnalysis: 'A alternativa E apresenta o par de princípios associado aos dois polos do regime.',
      trap: 'Escolher princípios administrativos verdadeiros, mas que não respondem à relação estrutural perguntada.',
      added: 'Parte da doutrina usa a legalidade para evidenciar o polo das sujeições, sem eliminar a ideia de indisponibilidade.',
      takeaway: 'Supremacia explica poderes; indisponibilidade explica limites.',
      sources: [materialSource('7-9')],
    }),
    question({
      sequence: 11, primary: IDS.distinctions, role: 'discrimination', competence: 'distinguir regimes', reasoning: 'discrimination', difficulty: 'intermediaria',
      statement: 'Uma empresa pública exploradora de atividade econômica celebra contrato de financiamento com cliente e, simultaneamente, realiza concurso para admitir empregados.',
      optionTexts: [
        'A situação demonstra coexistência de regras privadas e públicas na mesma entidade.',
        'A realização de concurso converte todos os contratos da empresa em contratos administrativos.',
        'O contrato privado elimina qualquer dever público da empresa.',
        'Empresas públicas jamais se submetem a regras de direito privado.',
        'A personalidade privada da entidade torna inconstitucional o concurso.'
      ], correct: 'A',
      analyses: [
        'Correta: o exemplo mostra predomínio privado em uma relação e incidência pública em outra.',
        'Incorreta: um dever público específico não altera automaticamente a natureza de todas as relações.',
        'Incorreta: entidades privadas da Administração continuam sujeitas a deveres públicos.',
        'Incorreta: empresas estatais podem atuar sob regime predominantemente privado.',
        'Incorreta: a exigência de concurso é compatível com a submissão a controles públicos.'
      ],
      summary: 'Regimes público e privado podem coexistir, com predomínio variável conforme a relação.',
      correctAnalysis: 'A alternativa A evita a falsa escolha de um regime único e absoluto para toda a entidade.',
      trap: 'Generalizar a natureza de uma relação para todas as atividades da entidade.',
      added: 'Mesmo modelos privatísticos da Administração recebem incidência de regras públicas.',
      takeaway: 'A natureza da entidade não resolve, isoladamente, o regime de cada relação.',
      sources: [materialSource('6-7')],
    }),
    question({
      sequence: 12, primary: IDS.distinctions, role: 'teaching', competence: 'identificar limites', reasoning: 'exception_handling', difficulty: 'intermediaria',
      statement: 'A Administração utiliza instrumento tipicamente privado para contratar seguro de veículo oficial. Quanto ao regime aplicável, a solução correta exige nuance.',
      optionTexts: [
        'O direito privado afasta toda norma de direito público.',
        'Pode haver predomínio de regras privadas, sem submissão integral e isolada ao direito privado.',
        'O contrato é nulo porque a Administração não pode usar formas privadas.',
        'A mera presença estatal cria poderes ilimitados sobre a seguradora.',
        'O agente pode contratar sem competência ou finalidade, pois a forma é privada.'
      ], correct: 'B',
      analyses: [
        'Incorreta: deveres públicos permanecem incidentes sobre a Administração.',
        'Correta: o modelo pode ser privado, mas não rompe todos os vínculos publicísticos.',
        'Incorreta: a Administração pode utilizar institutos de direito privado quando admitidos.',
        'Incorreta: a presença do Estado não cria poderes sem base jurídica.',
        'Incorreta: competência e finalidade continuam obrigatórias.'
      ],
      summary: 'O uso de forma privada não significa submissão absoluta e exclusiva ao direito privado.',
      correctAnalysis: 'A alternativa B reconhece o predomínio privado e a permanência de condicionamentos públicos.',
      trap: 'Adotar uma visão de tudo ou nada entre os dois regimes.',
      added: 'A Constituição e as leis definem a incidência e a intensidade de cada regime.',
      takeaway: 'Predomínio privado não equivale a ausência total de direito público.',
      sources: [materialSource('6-7')],
    }),
    question({
      sequence: 13, primary: IDS.distinctions, role: 'reinforcement', competence: 'identificar efeitos', reasoning: 'application', difficulty: 'intermediaria',
      statement: 'Em relação contratual exclusivamente privada, uma parte pretende alterar unilateralmente obrigação essencial sem concordância da outra e sem previsão jurídica.',
      optionTexts: [
        'A alteração é válida por força da supremacia do interesse público.',
        'A alteração é prerrogativa ordinária de qualquer contratante privado.',
        'A horizontalidade privada impede reconhecer, como regra, poder unilateral equivalente ao administrativo.',
        'A outra parte deve aceitar porque todo contrato possui natureza vertical.',
        'O caso comprova que regimes público e privado são idênticos.'
      ], correct: 'C',
      analyses: [
        'Incorreta: não há atuação administrativa nem fundamento publicístico no caso.',
        'Incorreta: contratantes privados não possuem, em regra, poder unilateral geral.',
        'Correta: a coordenação entre particulares exige acordo ou fundamento contratual/legal válido.',
        'Incorreta: contratos privados são, em regra, horizontais.',
        'Incorreta: o contraste evidencia diferenças entre os regimes.'
      ],
      summary: 'A horizontalidade privada contrasta com prerrogativas unilaterais atribuídas legalmente à Administração.',
      correctAnalysis: 'A alternativa C aplica a distinção estrutural ao caso apresentado.',
      trap: 'Transportar prerrogativa administrativa para uma relação entre particulares.',
      added: 'A verticalidade administrativa depende de fundamento jurídico e de finalidade pública.',
      takeaway: 'Poder unilateral especial não é característica geral das relações privadas.',
      sources: [materialSource('5-6')],
    }),
    question({
      sequence: 14, primary: IDS.distinctions, role: 'diagnostic', competence: 'avaliar limites', reasoning: 'exception_handling', difficulty: 'intermediaria',
      statement: 'A supremacia do interesse público integra a explicação clássica do regime jurídico-administrativo, mas não autoriza qualquer conduta estatal.',
      optionTexts: [
        'Autoriza o agente a afastar a lei sempre que alegar conveniência.',
        'Elimina direitos fundamentais quando houver interesse arrecadatório.',
        'Transforma toda vontade do governante em interesse público.',
        'Fundamenta prerrogativas voltadas a fins públicos, exercidas dentro de competência e limites jurídicos.',
        'Impede controle judicial sobre atos administrativos.'
      ], correct: 'D',
      analyses: [
        'Incorreta: a supremacia não afasta legalidade e competência.',
        'Incorreta: o regime também protege direitos fundamentais.',
        'Incorreta: interesse público não se confunde com vontade pessoal do governante.',
        'Correta: poderes especiais são instrumentais e juridicamente condicionados.',
        'Incorreta: atos administrativos permanecem sujeitos a controle.'
      ],
      summary: 'Supremacia fundamenta poderes funcionais, não um cheque em branco para a autoridade.',
      correctAnalysis: 'A alternativa D combina finalidade, competência e limites, evitando leitura autoritária do princípio.',
      trap: 'Confundir interesse público com preferência do agente ou do governo.',
      added: 'As sujeições contrabalançam as prerrogativas e preservam direitos e patrimônio público.',
      takeaway: 'Supremacia é instrumento finalístico e controlável.',
      sources: [materialSource('7-9')],
    }),
    question({
      sequence: 15, primary: IDS.distinctions, role: 'retention', competence: 'distinguir sujeitos', reasoning: 'conceptual_understanding', difficulty: 'intermediaria',
      statement: 'A indisponibilidade do interesse público decorre da posição institucional da Administração perante a coletividade.',
      optionTexts: [
        'O Estado é proprietário absoluto de todo interesse social.',
        'O agente recebe titularidade pessoal dos bens sob sua gestão.',
        'A coletividade perde a titularidade quando um gestor toma posse.',
        'A autoridade pode renunciar a competências obrigatórias sem autorização.',
        'A Administração exerce função de gestão e proteção de interesses que não lhe pertencem livremente.'
      ], correct: 'E',
      analyses: [
        'Incorreta: o interesse público pertence à coletividade, não ao Estado como proprietário privado.',
        'Incorreta: a investidura não transfere propriedade ao agente.',
        'Incorreta: a titularidade coletiva não desaparece com a mudança de gestor.',
        'Incorreta: competências-dever não são livremente renunciáveis.',
        'Correta: a função administrativa implica gestão vinculada de interesses alheios.'
      ],
      summary: 'A indisponibilidade nasce da ausência de propriedade privada do gestor sobre o interesse administrado.',
      correctAnalysis: 'A alternativa E traduz a natureza funcional e vinculada da atuação administrativa.',
      trap: 'Atribuir ao Estado ou ao agente a mesma liberdade do proprietário privado.',
      added: 'A competência administrativa pode assumir natureza de poder-dever quando a lei exige atuação.',
      takeaway: 'Administrar não é dispor livremente; é agir em nome da coletividade.',
      sources: [materialSource('7-9')],
    }),
    question({
      sequence: 16, primary: IDS.application, secondary: [IDS.elements], role: 'integration', competence: 'aplicar em caso', reasoning: 'case_analysis', difficulty: 'intermediaria',
      statement: 'Para contratar fornecimento comum, gestor escolhe empresa de amigo sem procedimento competitivo e sem hipótese legal de contratação direta.',
      optionTexts: [
        'A conduta viola sujeições do regime, pois a escolha administrativa depende de competência, finalidade e procedimento legal.',
        'A amizade substitui a necessidade de fundamento legal.',
        'A supremacia permite escolher qualquer contratado sem controle.',
        'A liberdade contratual privada aplica-se integralmente ao gestor.',
        'A indisponibilidade do interesse público autoriza preferência pessoal.'
      ], correct: 'A',
      analyses: [
        'Correta: a escolha pessoal sem base legal afronta as restrições que protegem o interesse coletivo.',
        'Incorreta: relação pessoal não cria competência nem hipótese de contratação direta.',
        'Incorreta: supremacia não elimina procedimentos e controles.',
        'Incorreta: o gestor não contrata como particular usando patrimônio próprio.',
        'Incorreta: indisponibilidade restringe preferências pessoais.'
      ],
      summary: 'A contratação pública evidencia como sujeições limitam a liberdade decisória do gestor.',
      correctAnalysis: 'A alternativa A aplica corretamente o conceito ao caso e identifica o desvio pessoal.',
      trap: 'Usar supremacia como justificativa para afastar a legalidade.',
      added: 'A licitação é um exemplo de sujeição administrativa; exceções dependem de previsão legal.',
      takeaway: 'A Administração não possui liberdade privada para escolher parceiros com recursos coletivos.',
      sources: [materialSource('5-9'), constitutionSource()],
    }),
    question({
      sequence: 17, primary: IDS.application, secondary: [IDS.distinctions], role: 'discrimination', competence: 'resolver caso concreto', reasoning: 'case_analysis', difficulty: 'dificil',
      statement: 'Banco público explorador de atividade econômica invoca sua personalidade de direito privado para negar todo dever de concurso, controle e impessoalidade.',
      optionTexts: [
        'A tese é correta, pois personalidade privada exclui qualquer norma pública.',
        'A tese é incorreta: o predomínio privado em certas relações convive com deveres públicos incidentes sobre a entidade.',
        'A tese é correta apenas porque atividade econômica equivale a serviço sem interesse coletivo.',
        'A tese é incorreta porque todas as relações do banco são necessariamente administrativas.',
        'A tese é correta se aprovada internamente pela diretoria.'
      ], correct: 'B',
      analyses: [
        'Incorreta: entidades estatais privadas permanecem sujeitas a condicionamentos públicos.',
        'Correta: a coexistência de regimes impede tanto a imunidade pública quanto a publicização absoluta.',
        'Incorreta: a natureza econômica não elimina deveres constitucionais aplicáveis.',
        'Incorreta: algumas relações podem seguir regime predominantemente privado.',
        'Incorreta: deliberação interna não afasta normas superiores.'
      ],
      summary: 'Empresas estatais de direito privado não vivem sob regime exclusivamente privado.',
      correctAnalysis: 'A alternativa B resolve a tensão sem absolutizar nenhum dos regimes.',
      trap: 'Escolher entre privatização total e publicização total das relações.',
      added: 'O regime aplicável deve ser identificado por relação e por norma, não apenas pelo rótulo da entidade.',
      takeaway: 'Personalidade privada da estatal não significa ausência de controles públicos.',
      sources: [materialSource('6-7'), constitutionSource()],
    }),
    question({
      sequence: 18, primary: IDS.application, secondary: [IDS.elements], role: 'teaching', competence: 'avaliar validade', reasoning: 'exception_handling', difficulty: 'dificil',
      statement: 'Autoridade possui competência legal para requisitar bem em situação prevista, mas usa o poder para favorecer empreendimento particular de familiar.',
      optionTexts: [
        'O ato é válido porque toda prerrogativa é discricionária e sem finalidade vinculada.',
        'O ato é válido porque a competência formal torna irrelevante o objetivo real.',
        'O ato é inválido somente se o bem pertencer a outro ente público.',
        'O uso da prerrogativa é ilegítimo por desvio da finalidade pública, apesar da existência abstrata da competência.',
        'O parentesco converte o interesse particular em interesse público.'
      ], correct: 'D',
      analyses: [
        'Incorreta: prerrogativas são poderes finalísticos e controláveis.',
        'Incorreta: competência não sana desvio de finalidade.',
        'Incorreta: o problema central é o uso do poder para fim privado.',
        'Correta: a finalidade integra os limites jurídicos do exercício da prerrogativa.',
        'Incorreta: interesse familiar permanece particular.'
      ],
      summary: 'A existência de uma prerrogativa não legitima seu uso para finalidade estranha à lei.',
      correctAnalysis: 'A alternativa D distingue competência abstrata de exercício concreto legítimo.',
      trap: 'Supor que possuir o poder basta para validar qualquer uso dele.',
      added: 'Poder administrativo é instrumento; seu uso desviado pode produzir nulidade e responsabilização.',
      takeaway: 'Prerrogativa sem finalidade pública converte-se em abuso, não em atuação legítima.',
      sources: [materialSource('7-9')],
    }),
    question({
      sequence: 19, primary: IDS.application, secondary: [IDS.distinctions], role: 'integration', competence: 'integrar conceitos', reasoning: 'case_analysis', difficulty: 'dificil',
      statement: 'Município celebra seguro de frota por instrumento privado. Depois, o prefeito afirma que a forma privada o libera de competência, finalidade e controle.',
      optionTexts: [
        'A afirmação é correta porque contratos privados anulam princípios administrativos.',
        'A afirmação é correta se o valor do contrato for reduzido.',
        'A afirmação é correta porque o prefeito atua como proprietário do patrimônio municipal.',
        'A afirmação é incorreta apenas se a seguradora for empresa estatal.',
        'A afirmação é incorreta: a forma privada pode predominar, mas não elimina condicionamentos públicos da atuação municipal.'
      ], correct: 'E',
      analyses: [
        'Incorreta: princípios e competências não são anulados pela forma contratual.',
        'Incorreta: o valor não cria liberdade pessoal do gestor.',
        'Incorreta: o prefeito não é proprietário privado dos bens municipais.',
        'Incorreta: a identidade da seguradora não é o ponto decisivo do enunciado.',
        'Correta: regimes podem coexistir e deveres públicos permanecem aplicáveis.'
      ],
      summary: 'O uso de instrumento privado não descaracteriza a função administrativa do contratante público.',
      correctAnalysis: 'A alternativa E reconhece a incidência combinada dos regimes no caso concreto.',
      trap: 'Confundir forma privada com liberdade privada integral do agente.',
      added: 'Competência, finalidade, impessoalidade e controle acompanham a atuação administrativa mesmo em modelos privados.',
      takeaway: 'A Administração pode contratar sob forma privada, mas nunca deixa de ser Administração.',
      sources: [materialSource('6-7'), constitutionSource()],
    }),
    question({
      sequence: 20, primary: IDS.application, secondary: [IDS.concept, IDS.elements, IDS.distinctions], role: 'integration', competence: 'sintetizar e aplicar', reasoning: 'case_analysis', difficulty: 'dificil',
      statement: 'Em operação administrativa, a lei autoriza medida coercitiva para proteger a coletividade e exige motivação, proporcionalidade e respeito a direitos. A autoridade adota a medida e documenta seus fundamentos.',
      optionTexts: [
        'A exigência de proporcionalidade converte a atuação em relação exclusivamente privada.',
        'A exigência de motivação elimina a prerrogativa coercitiva.',
        'O caso demonstra a coexistência de prerrogativa e sujeição no mesmo ato administrativo.',
        'A medida somente seria administrativa se não houvesse qualquer controle.',
        'O caso pertence exclusivamente ao regime privado por conter dever de documentação.'
      ], correct: 'C',
      analyses: [
        'Incorreta: proporcionalidade é limite jurídico compatível com o exercício da função pública.',
        'Incorreta: sujeição não destrói o poder; disciplina seu exercício.',
        'Correta: o poder coercitivo e os deveres de justificativa e limite operam conjuntamente.',
        'Incorreta: controle é compatível e necessário à atuação administrativa.',
        'Incorreta: documentação e motivação evidenciam condicionamentos públicos.'
      ],
      summary: 'O regime jurídico-administrativo combina poder para agir e limites sobre como agir.',
      correctAnalysis: 'A alternativa C sintetiza a bipolaridade do regime em uma única situação concreta.',
      trap: 'Imaginar que prerrogativa e sujeição são mutuamente excludentes.',
      added: 'A legitimidade da atuação depende tanto da existência do poder quanto do atendimento aos limites de seu exercício.',
      takeaway: 'No regime administrativo, poder e controle coexistem para realizar e proteger o interesse público.',
      sources: [materialSource('7-9'), constitutionSource()],
    }),
  ];

  return {
    schema_version: 'detona_question_batch_v2',
    batch_id: 'pcba_inv_dadm_08_01_lote_001',
    contest_id: 'pc_ba_2026',
    position_id: 'pc_ba_2026_investigador_policia_civil',
    discipline_id: IDS.discipline,
    topic_id: IDS.topic,
    canonical_scope: 'subtopic',
    curriculum_node_id: IDS.subtopic,
    subtopic_id: IDS.subtopic,
    exam_board: 'instituto_aocp',
    question_type: 'multiple_choice',
    status: 'rascunho_revisar',
    question_count: 20,
    source_catalog_version: '2.0.0-draft.1',
    questions,
    validation: {
      reviewed: false,
      blocking_errors: ['Revisão editorial humana pendente antes de qualquer importação ou publicação.'],
      warnings: [],
      duplicate_check: 'passed',
      schema_check: 'passed',
      source_check: 'passed',
      microknowledge_check: 'passed',
    },
  };
}

export async function generatePilotBatch(outputPath) {
  const destination = path.resolve(outputPath);
  await mkdir(path.dirname(destination), { recursive: true });
  const batch = buildPilotBatch();
  await writeFile(destination, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  return batch;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [outputPath] = process.argv.slice(2);
  if (!outputPath) throw new Error('Informe o arquivo de saída.');
  const batch = await generatePilotBatch(outputPath);
  process.stdout.write(`${JSON.stringify({ batch_id: batch.batch_id, question_count: batch.question_count, status: batch.status })}\n`);
}
