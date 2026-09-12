import { buildPortugueseEditorialBatch } from './prf-portuguese-editorial-batch-lib.mjs';

const result = await buildPortugueseEditorialBatch({
  batch: 7, slug: 'b07', sourceId: 'prf_pdf_8871f98bc130', pages: [213,228], range: [121,140],
  subtopic: 'Compreensão e interpretação de textos de gêneros variados',
  scope: 'Precisão factual, pressupostos, comparação, argumentação e distinção conceitual',
  rules: ['Controlar quantificadores e condições', 'Inferir pertencimento sem ampliar o conjunto', 'Integrar parágrafos na tese', 'Distinguir conceitos próximos pelo núcleo funcional'],
  matrix: [
    [121,213,'SEFAZ-RS 2018','precisão factual','localizar informação com sujeito, tempo e quantidade corretos','trocar até por duração obrigatória'],
    [122,214,'SEFAZ-RS 2018','inclusão de classe','inferir pertencimento por aplicação de descrição geral','atribuir classificação apenas por conhecimento externo'],
    [123,214,'SEFAZ-RS 2018','pressuposto comparativo','inferir existência de grupo com valor menor','ler mais alto sem base de comparação'],
    [124,215,'SEFAZ-RS 2018','condição necessária','identificar requisito expresso e distinguir documentos auxiliares','confundir meio de pagamento com condição'],
    [125,215,'SEFAZ-RS 2018','definição lexical','converter inalienável em impossibilidade de transferência','confundir limite excepcional com perda de titularidade'],
    [126,216,'SEFAZ-RS 2018','caracterização central','reconhecer representatividade como traço do modelo','selecionar propriedade negada'],
    [127,217,'SEFAZ-RS 2018','comparação por traço comum','identificar propósito compartilhado entre modelos distintos','igualar mecanismos históricos diferentes'],
    [128,218,'TCE-MG 2018','tese propositiva','inferir necessidade de ampla divulgação','defender concentração em especialistas'],
    [129,219,'TCE-MG 2018','condição argumentativa','associar difusão a debate e rigor','opor ciência a dimensões públicas'],
    [130,219,'TCE-MG 2018','fundamentação lexical','ligar coragem a confronto de ideias não convencionais','buscar justificativa em tema distante'],
    [131,220,'TCE-MG 2018','concessão parentética','interpretar ressalva sobre acesso desigual','atribuir incapacidade aos excluídos'],
    [132,220,'TCE-MG 2018','escopo temático','selecionar qual campo produz conhecimento específico','estender efeito a conceitos associados'],
    [133,221,'CAGE-RS 2018','metáfora temática','interpretar ausência de barreiras como aproximação','converter imagem em ação geopolítica literal'],
    [134,222,'CAGE-RS 2018','gênero memorialístico','inferir relato subjetivo de experiência anunciada','inventar suporte visual não mencionado'],
    [135,223,'CAGE-RS 2018','exemplo lexical','reconhecer enumeração como prova de influência linguística','tratar ilustração como estereótipo social'],
    [136,224,'CAGE-RS 2018','posição do autor','deduzir reforma desejada a partir de crítica e proposta','confundir redução de regressividade com redução uniforme'],
    [137,225,'CAGE-RS 2018','relação sistêmica','vincular modelo distributivo a desenvolvimento','declarar independência entre variáveis relacionadas'],
    [138,226,'CAGE-RS 2018','proporção inversa','inferir que aumento de justiça reduz desigualdade','trocar relação inversa por direta'],
    [139,227,'CAGE-RS 2018','localização da tese','identificar parágrafo em que proposta se torna explícita','confundir contextualização com defesa'],
    [140,228,'ABIN 2018','distinção conceitual','separar produção analítica de proteção contra ameaças','fundir ramos por pertencerem à mesma atividade'],
  ],
  microDefinitions: [
    ['precision','Precisão factual e quantificadores'],['inclusion','Inclusão de classe e pressuposto'],
    ['condition','Condição necessária e definição'],['comparison','Caracterização e comparação'],
    ['thesis','Tese propositiva e condição argumentativa'],['concession','Fundamentação e concessão'],
    ['scope','Escopo temático'],['metaphor','Metáfora, memória e exemplo lexical'],
    ['stance','Posição autoral e localização da tese'],['systems','Relação sistêmica e distinção conceitual'],
  ],
  texts: {
    a: `Em 1920, moradores entregavam parte da produção ao armazém comunitário e podiam prestar até três dias de serviço por mês. Registros posteriores classificam esse arranjo como economia de subsistência organizada: nele, terra e trabalho eram os principais recursos. As contribuições cobradas dos comerciantes de fora eram maiores que as dos residentes. Para renovar a licença de venda, era indispensável quitar a contribuição anual; o aviso de cobrança apenas informava valores e prazos. O regulamento chamava esse direito de intransferível, embora admitisse restrições temporárias após processo regular.`,
    b: `O conselho atual é representativo: os bairros elegem delegados para deliberar em seu nome. O conselho antigo, embora reunisse cidadãos diretamente, excluía grande parte dos moradores. Os dois modelos nasceram em épocas distintas e usam mecanismos diferentes, mas compartilham a intenção de limitar decisões arbitrárias. A participação é considerada um direito de todos, ainda que seu exercício possa obedecer a requisitos legais específicos.`,
    c: `Concentrar conhecimento ambiental em poucos especialistas é insuficiente. Para que a sociedade reconheça riscos e participe das decisões, os resultados devem circular em escolas, rádios comunitárias e plataformas digitais. Essa difusão exige linguagem clara, mas não abandono do rigor; também depende do debate entre hipóteses concorrentes. Defender uma explicação não convencional requer coragem para submetê-la à crítica. O conhecimento é acessível a quem o estuda — embora barreiras econômicas tenham afastado muitos desse percurso. É a pesquisa científica que esclarece a origem dos fenômenos descritos; comunicação e participação ampliam seu alcance, mas não substituem a investigação.`,
    d: `Estas anotações ficariam incompletas se eu omitisse as viagens feitas com minha irmã. Quero oferecer retratos verbais dos lugares e das pessoas, filtrados pela memória, sem ordem cronológica rígida. Chamo o capítulo de “estradas sem muros” porque viajar, para mim, aproxima experiências e enfraquece separações imaginárias; não proponho demolir fronteiras físicas. Em outra passagem, palavras de origem indígena — nomes de rios, plantas e utensílios — ilustram marcas deixadas por línguas antigas no português atual.`,
    e: `O sistema de taxas municipais pesa proporcionalmente mais sobre os pequenos negócios, que comprometem parcela maior de sua receita com cobranças incidentes sobre o consumo.

Esse desenho reduz a capacidade de investimento dos estabelecimentos menores e amplia a distância em relação às empresas de grande porte.

Uma alternativa seria transferir parte da cobrança sobre o consumo para patrimônios elevados, distribuindo o encargo segundo a capacidade econômica.

Segundo o estudo, uma distribuição mais equilibrada estimula a atividade; quanto maior a justiça fiscal, menor tende a ser a desigualdade.

Diante desse diagnóstico, o autor sustenta expressamente que o sistema precisa ser reformado para reduzir sua regressividade.

Em outro relatório, análise estratégica transforma dados em cenários para decisões; proteção estratégica resguarda informações e estruturas contra ameaças. Ambas pertencem à segurança institucional, mas não têm o mesmo escopo.`,
  },
  specs: [
    ['a','precision','Todos os moradores eram obrigados a prestar exatamente três dias de serviço por mês.','E','“Podiam prestar até três dias” fixa um limite máximo e nem sequer torna a prestação universalmente obrigatória. O item troca possibilidade por obrigação e transforma teto variável em duração exata.'],
    ['a','inclusion','A descrição geral das economias de subsistência organizadas é aplicada ao arranjo dos moradores de 1920.','C','O texto primeiro classifica o arranjo e depois explica que, “nele”, terra e trabalho eram recursos centrais. O pronome retoma o sistema mencionado e confirma sua inclusão na classe descrita.'],
    ['a','inclusion','Se as contribuições dos comerciantes externos eram maiores, pressupõe-se que os residentes também contribuíam, porém em valor inferior.','C','O comparativo “maiores que” exige dois termos: a cobrança dos externos e a dos residentes. A segunda pode não ter valor numérico informado, mas sua existência e inferioridade são necessárias à comparação.'],
    ['a','condition','Receber o aviso de cobrança era a condição indispensável para renovar a licença.','E','O aviso apenas comunicava dados e auxiliava o pagamento. A condição necessária era quitar a contribuição anual. Confundir o documento informativo com o requisito troca o meio operacional pela obrigação principal.'],
    ['a','condition','O caráter intransferível do direito impede sua venda ou cessão, mas não exclui toda restrição temporária prevista em processo regular.','C','Intransferibilidade trata da passagem do direito a outra pessoa; restrição de exercício é questão distinta. O texto admite limitações temporárias sem afirmar que o titular perdeu ou alienou o direito.'],
    ['b','comparison','A eleição de delegados pelos bairros caracteriza a representatividade do conselho atual.','C','Os moradores não deliberam todos diretamente: escolhem representantes para agir em seu nome. Esse mecanismo é a pista central de representatividade e distingue o conselho atual do modelo antigo descrito.'],
    ['b','comparison','Os conselhos antigo e atual são idênticos porque ambos procuram conter decisões arbitrárias.','E','Compartilhar um propósito não elimina diferenças de composição, época e mecanismo. O antigo exercia participação direta e excludente; o atual usa delegados eleitos. O item confunde semelhança parcial com identidade.'],
    ['b','scope','Ao afirmar que a participação é direito de todos, o texto declara inválido qualquer requisito legal para seu exercício.','E','A oração concessiva admite explicitamente requisitos específicos. Universalidade do direito e regulamentação do exercício podem coexistir; o item transforma o princípio geral em ausência absoluta de condições.'],
    ['c','thesis','O texto defende que o conhecimento ambiental permaneça sob controle de um grupo pequeno de especialistas.','E','A frase inicial rejeita a concentração como insuficiente, e a sequência propõe circulação por diferentes meios. A tese é democratizar o acesso sem abandonar rigor, exatamente o oposto da exclusividade sugerida.'],
    ['c','thesis','A divulgação ampla deve combinar clareza de linguagem, rigor e confronto entre hipóteses.','C','Esses três elementos aparecem de forma complementar: linguagem acessível permite circulação, rigor preserva qualidade e debate testa explicações concorrentes. A tese não sacrifica um componente em favor dos demais.'],
    ['c','concession','A coragem associada à pesquisa decorre, no texto, da disposição para expor ideias não convencionais à crítica.','C','A relação está na sequência entre explicação não convencional e submissão ao debate. Coragem não é apresentada como atributo físico, mas como disposição intelectual diante de oposição e avaliação pública.'],
    ['c','concession','A ressalva entre travessões culpa os indivíduos afastados por não se dedicarem ao estudo.','E','A concessão reconhece que o conhecimento pode ser aprendido, mas registra barreiras econômicas que impediram o acesso de muitos. Ela aponta exclusão estrutural, não incapacidade ou falta de empenho pessoal.'],
    ['c','scope','Pesquisa científica, comunicação e participação são apresentadas como fontes equivalentes da explicação sobre a origem dos fenômenos.','E','O texto atribui à pesquisa a produção da explicação. Comunicação e participação ampliam circulação e uso social, mas são expressamente distinguidas da investigação; associação não significa equivalência funcional.'],
    ['d','metaphor','O narrador anuncia relatos subjetivos de viagens realizadas com a irmã, organizados sem cronologia rigorosa.','C','“Filtrados pela memória” marca subjetividade, e a passagem declara tanto a companhia da irmã quanto a ausência de ordem rígida. A conclusão combina pistas do gênero memorialístico sem acrescentar suporte inexistente.'],
    ['d','metaphor','A expressão “estradas sem muros” representa o desejo de diminuir separações entre experiências e pessoas.','C','O narrador fornece sua própria chave interpretativa: viajar aproxima experiências e enfraquece divisões imaginárias. A metáfora articula abertura e encontro, não uma intervenção material sobre fronteiras.'],
    ['d','scope','A enumeração de nomes de rios, plantas e utensílios serve para ilustrar a permanência de línguas antigas no vocabulário atual.','C','Os exemplos pertencem a campos diferentes, mas cumprem a mesma função argumentativa: tornar visível uma herança lexical. O texto não pretende descrever hábitos completos nem construir estereótipos sociais.'],
    ['e','stance','A proposta do autor é tornar o sistema menos regressivo, e não simplesmente reduzir toda cobrança na mesma proporção.','C','A crítica incide na distribuição do peso: pequenos negócios pagam proporcionalmente mais. Transferir parte da incidência para patrimônios elevados altera essa distribuição, sem equivaler a corte uniforme de todas as taxas.'],
    ['e','systems','O texto relaciona equilíbrio tributário, atividade econômica e redução da desigualdade, estabelecendo relação inversa entre justiça fiscal e desigualdade.','C','A argumentação forma um sistema de efeitos: melhor distribuição estimula a economia e, quanto maior a justiça, menor a desigualdade. “Inversa” descreve a direção entre as duas últimas grandezas.'],
    ['e','stance','No primeiro relatório, a defesa explícita da reforma aparece no quinto parágrafo; os quatro anteriores constroem o diagnóstico e seus efeitos.','C','Os quatro primeiros parágrafos apresentam peso desigual, consequência, alternativa e relação esperada. O quinto transforma essa preparação em proposta explícita. Localizar a tese exige separar fundamentação e proposição.'],
    ['e','systems','Como pertencem à segurança institucional, análise estratégica e proteção estratégica possuem o mesmo objeto e executam a mesma função.','E','O pertencimento a uma atividade comum não funde seus ramos. A análise transforma dados em cenários para decidir; a proteção resguarda ativos contra ameaças. Objetivos e operações permanecem distintos.'],
  ],
});

console.log(JSON.stringify(result, null, 2));
