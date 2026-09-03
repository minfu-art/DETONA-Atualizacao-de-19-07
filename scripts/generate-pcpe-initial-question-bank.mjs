#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const draftRoot = path.resolve(scriptDir, '../course-drafts/pc-pe-2026-agente');
const bundleRoot = path.join(draftRoot, 'course-bundle');
const curriculumPath = path.join(bundleRoot, 'curriculum.json');
const outputPath = path.join(bundleRoot, 'questions', '001-pcpe-agente-banco-inicial-autoral.json');
const auditPath = path.join(draftRoot, 'question-bank-audit.v1.json');
const contestId = 'pc_pe_2026';
const source = 'DETONA — questão inédita autoral; revisão editorial e normativa pendente (2026-09-01)';

const q = (discipline, subtopic, correctAnswer, statement, explanation) => ({
  discipline,
  subtopic,
  correctAnswer,
  statement,
  explanation,
});

const specs = [
  // Noções de Direito Constitucional — 10
  q('Noções de Direito Constitucional', 'Princípios fundamentais', false,
    'A erradicação da pobreza e a redução das desigualdades sociais são fundamentos da República Federativa do Brasil.',
    'São objetivos fundamentais previstos no art. 3º da Constituição, e não fundamentos do art. 1º.'),
  q('Noções de Direito Constitucional', 'Poder constituinte originário, derivado e decorrente', true,
    'O poder constituinte derivado reformador é juridicamente limitado pelas regras e cláusulas estabelecidas pela própria Constituição.',
    'Ao contrário do poder originário, o poder de reforma é condicionado e limitado, inclusive pelas cláusulas pétreas.'),
  q('Noções de Direito Constitucional', 'Aplicabilidade das normas constitucionais', false,
    'Normas constitucionais de eficácia limitada produzem todos os seus efeitos essenciais desde a promulgação e jamais dependem de integração legislativa.',
    'Essas normas possuem aplicabilidade mediata e dependem de atuação normativa para a produção integral de seus efeitos.'),
  q('Noções de Direito Constitucional', 'Direitos e garantias fundamentais', true,
    'Durante o dia, a casa pode ser ingressada por determinação judicial, ainda que sem consentimento do morador.',
    'O art. 5º, XI, admite ingresso por mandado judicial durante o dia, além das hipóteses constitucionais de flagrante, desastre e socorro.'),
  q('Noções de Direito Constitucional', 'Estado federal brasileiro', false,
    'O direito de secessão permite que um estado-membro deixe a Federação mediante aprovação de sua assembleia legislativa.',
    'A Federação brasileira é indissolúvel, inexistindo direito de secessão para seus entes.'),
  q('Noções de Direito Constitucional', 'União, estados, Distrito Federal, municípios e territórios', true,
    'Os municípios integram a organização político-administrativa brasileira e possuem autonomia nos termos da Constituição.',
    'A Constituição reconhece União, estados, Distrito Federal e municípios como entes autônomos.'),
  q('Noções de Direito Constitucional', 'Disposições gerais', false,
    'O princípio da publicidade autoriza a divulgação irrestrita de qualquer dado pessoal mantido pela administração pública.',
    'A publicidade convive com a intimidade, a proteção de dados e as hipóteses constitucionais e legais de sigilo.'),
  q('Noções de Direito Constitucional', 'Servidores públicos', true,
    'A acumulação remunerada de cargos públicos é excepcional e, nas hipóteses constitucionais, depende de compatibilidade de horários.',
    'A regra é a vedação; as exceções do art. 37, XVI, exigem compatibilidade de horários.'),
  q('Noções de Direito Constitucional', 'Poder Executivo', false,
    'O Presidente da República pode ausentar-se do país por qualquer período sem autorização do Congresso Nacional.',
    'A ausência por mais de quinze dias depende de autorização do Congresso, sob pena de perda do cargo.'),
  q('Noções de Direito Constitucional', 'Defesa do Estado e das instituições democráticas', true,
    'Às polícias civis, dirigidas por delegados de carreira, incumbem as funções de polícia judiciária e a apuração de infrações penais, exceto as militares.',
    'A afirmação reproduz a competência constitucional básica das polícias civis no art. 144, § 4º.'),

  // Noções de Direito Administrativo — 10
  q('Noções de Direito Administrativo', 'Estado, governo e administração pública', true,
    'Em sentido subjetivo, administração pública designa os órgãos, agentes e entidades que exercem a função administrativa.',
    'O sentido subjetivo ou orgânico identifica quem exerce a atividade administrativa.'),
  q('Noções de Direito Administrativo', 'Ato administrativo', false,
    'A revogação retira um ato ilegal do mundo jurídico e produz, como regra, efeitos retroativos.',
    'A ilegalidade conduz à anulação. A revogação atinge ato válido por conveniência e oportunidade e, em regra, produz efeitos prospectivos.'),
  q('Noções de Direito Administrativo', 'Poder hierárquico', true,
    'O poder hierárquico permite distribuir e escalonar funções, fiscalizar subordinados e, nos limites legais, delegar ou avocar competências.',
    'Essas são manifestações típicas da hierarquia dentro da mesma estrutura administrativa.'),
  q('Noções de Direito Administrativo', 'Poder disciplinar', false,
    'O poder disciplinar alcança toda e qualquer pessoa, mesmo sem vínculo especial com a administração pública.',
    'Ele incide sobre agentes públicos e particulares sujeitos a vínculo específico; a coletividade em geral se submete ao poder de polícia.'),
  q('Noções de Direito Administrativo', 'Poder de polícia', true,
    'O poder de polícia condiciona direitos e atividades privadas em benefício do interesse coletivo, nos limites da lei.',
    'Sua finalidade é compatibilizar liberdades individuais com interesses públicos juridicamente protegidos.'),
  q('Noções de Direito Administrativo', 'Uso e abuso do poder', false,
    'O desvio de finalidade ocorre quando o agente atua fora dos limites de sua competência.',
    'Atuar fora da competência caracteriza excesso de poder; desvio de finalidade ocorre quando a competência é usada para fim diverso do previsto.'),
  q('Noções de Direito Administrativo', 'Responsabilidade civil do Estado', true,
    'A responsabilidade estatal por dano causado por agente público nessa qualidade é, em regra, objetiva, assegurado o regresso em caso de dolo ou culpa do agente.',
    'É o regime do art. 37, § 6º, da Constituição: responsabilidade objetiva do Estado e subjetiva no regresso contra o agente.'),
  q('Noções de Direito Administrativo', 'Concentração e desconcentração', false,
    'A desconcentração administrativa cria uma nova pessoa jurídica para receber a competência transferida.',
    'A desconcentração distribui competências dentro da mesma pessoa jurídica; a criação ou uso de outra pessoa relaciona-se à descentralização.'),
  q('Noções de Direito Administrativo', 'Controle judicial', true,
    'O Judiciário pode controlar a legalidade do ato administrativo, mas não deve substituir a administração na escolha legítima de conveniência e oportunidade.',
    'O mérito administrativo legítimo não é substituído pelo juiz, embora legalidade, finalidade e limites possam ser controlados.'),
  q('Noções de Direito Administrativo', 'Improbidade administrativa', false,
    'A mera culpa é suficiente para configurar qualquer modalidade de ato de improbidade administrativa.',
    'Após a reforma da Lei de Improbidade, exige-se dolo para a configuração dos atos tipificados.'),

  // Noções de Direito Penal — 12
  q('Noções de Direito Penal', 'Princípios básicos do Direito Penal', true,
    'O princípio da legalidade impede o uso de analogia para criar crime ou agravar pena contra o acusado.',
    'A analogia in malam partem viola a reserva legal; a integração favorável ao acusado pode ser admitida.'),
  q('Noções de Direito Penal', 'Crime e contravenção penal', false,
    'A tentativa de contravenção penal é punível sempre que a execução for iniciada e o resultado não ocorrer por circunstância alheia à vontade do agente.',
    'A Lei das Contravenções Penais estabelece que a tentativa de contravenção não é punível.'),
  q('Noções de Direito Penal', 'Lei penal no tempo e no espaço', true,
    'A lei penal posterior mais benéfica aplica-se a fatos anteriores, ainda que exista condenação transitada em julgado.',
    'A retroatividade da lei penal mais benéfica é garantia constitucional e alcança a execução da pena.'),
  q('Noções de Direito Penal', 'Tempo e lugar do crime', false,
    'Quanto ao tempo do crime, o Código Penal adotou a teoria do resultado.',
    'Foi adotada a teoria da atividade: considera-se praticado o crime no momento da ação ou omissão.'),
  q('Noções de Direito Penal', 'Lei penal excepcional, especial e temporária', true,
    'A lei penal temporária aplica-se ao fato praticado durante sua vigência mesmo depois de encerrado o período de duração.',
    'Trata-se de ultratividade prevista no art. 3º do Código Penal.'),
  q('Noções de Direito Penal', 'Territorialidade e extraterritorialidade', false,
    'O Código Penal brasileiro adota territorialidade absoluta e nunca admite a aplicação da lei estrangeira a fato praticado no Brasil.',
    'A territorialidade é temperada, pois tratados, convenções e regras de direito internacional podem produzir exceções.'),
  q('Noções de Direito Penal', 'Crimes contra o patrimônio', true,
    'No roubo, a subtração patrimonial é praticada mediante violência ou grave ameaça à pessoa, elemento que o distingue do furto.',
    'A violência ou grave ameaça integra o tipo básico do roubo, enquanto o furto não contém esse meio executivo.'),
  q('Noções de Direito Penal', 'Crimes contra a dignidade sexual', false,
    'O casamento entre autor e vítima impede, por si só, a configuração do crime de estupro.',
    'A relação conjugal não afasta a liberdade sexual nem impede a configuração do delito.'),
  q('Noções de Direito Penal', 'Crimes contra a administração pública', true,
    'O particular pode responder por crime funcional em concurso com funcionário público quando conhece a condição funcional do comparsa.',
    'A condição de funcionário público, embora pessoal, comunica-se ao particular quando constitui elementar do crime e é por ele conhecida.'),
  q('Noções de Direito Penal', 'Lei nº 13.869/2019', false,
    'Todo erro de interpretação da lei praticado por agente público configura automaticamente abuso de autoridade.',
    'A divergência interpretativa, por si só, não configura abuso; a lei também exige finalidade específica nos tipos correspondentes.'),
  q('Noções de Direito Penal', 'Lei nº 12.850/2013', true,
    'A organização criminosa pressupõe associação estruturalmente ordenada de quatro ou mais pessoas, com divisão de tarefas e objetivo de obter vantagem mediante infrações graves ou transnacionais.',
    'Esses elementos compõem o conceito legal de organização criminosa.'),
  q('Noções de Direito Penal', 'Lei nº 9.455/1997', false,
    'A condenação por crime de tortura é sempre afiançável e admite graça ou anistia.',
    'A tortura é crime inafiançável e insuscetível de graça ou anistia.'),

  // Noções de Direito Processual Penal — 12
  q('Noções de Direito Processual Penal', 'Lei processual no tempo', true,
    'A lei processual penal aplica-se desde logo, preservando-se a validade dos atos realizados sob a vigência da lei anterior.',
    'É a regra do tempus regit actum prevista no art. 2º do CPP.'),
  q('Noções de Direito Processual Penal', 'Lei processual no espaço', false,
    'O Código de Processo Penal brasileiro rege, sem qualquer ressalva, todos os processos criminais que tramitem no território nacional.',
    'O próprio CPP prevê ressalvas, como tratados, convenções, regras de prerrogativa e processos submetidos a legislação especial.'),
  q('Noções de Direito Processual Penal', 'Inquérito policial', true,
    'O inquérito policial é dispensável para a ação penal quando o titular já dispõe de elementos informativos suficientes.',
    'A ação penal pode ser proposta sem inquérito, desde que exista justa causa obtida por outros meios.'),
  q('Noções de Direito Processual Penal', 'Inquérito policial', false,
    'A autoridade policial pode arquivar o inquérito por decisão própria quando considerar inexistente o crime.',
    'A autoridade policial não pode arquivar autos de inquérito; o arquivamento segue o procedimento legal com atuação do Ministério Público.'),
  q('Noções de Direito Processual Penal', 'Exame de corpo de delito e perícias em geral', true,
    'Quando a infração deixa vestígios, é indispensável o exame de corpo de delito, direto ou indireto, e a confissão não o supre.',
    'A prova técnica é exigida pelo art. 158 do CPP nos delitos que deixam vestígios.'),
  q('Noções de Direito Processual Penal', 'Interrogatório do acusado', false,
    'O silêncio do acusado importa confissão e pode ser interpretado obrigatoriamente em prejuízo da defesa.',
    'O acusado possui direito ao silêncio, que não equivale a confissão nem pode ser usado contra a defesa.'),
  q('Noções de Direito Processual Penal', 'Busca e apreensão', true,
    'A busca domiciliar fundada em mandado judicial deve, como regra constitucional, ser cumprida durante o dia.',
    'Sem consentimento do morador, o mandado judicial autoriza ingresso domiciliar durante o dia.'),
  q('Noções de Direito Processual Penal', 'Prisão e liberdade provisória', false,
    'A prisão preventiva pode ser decretada pelo juiz de ofício durante a investigação policial.',
    'A decretação exige provocação legitimada; o juiz não pode decretá-la de ofício na investigação.'),
  q('Noções de Direito Processual Penal', 'Medidas cautelares diversas da prisão', true,
    'A escolha de medida cautelar deve observar necessidade e adequação às circunstâncias do fato e às condições pessoais do investigado ou acusado.',
    'Necessidade e adequação orientam a aplicação das cautelares pessoais previstas no CPP.'),
  q('Noções de Direito Processual Penal', 'Lei nº 7.960/1989', false,
    'A prisão temporária pode ser decretada diretamente pela autoridade policial, sem decisão judicial.',
    'Trata-se de prisão jurisdicional: a autoridade policial pode representar, mas a decretação compete ao juiz.'),
  q('Noções de Direito Processual Penal', 'Lei nº 9.099/1995', true,
    'Consideram-se infrações de menor potencial ofensivo, para fins da Lei nº 9.099/1995, as contravenções e os crimes cuja pena máxima não exceda dois anos, cumulada ou não com multa.',
    'Esse é o critério legal geral de menor potencial ofensivo.'),
  q('Noções de Direito Processual Penal', 'Lei nº 12.830/2013', false,
    'A investigação criminal conduzida pelo delegado de polícia não possui natureza jurídica e pode ser redistribuída sem qualquer fundamentação.',
    'A lei reconhece natureza jurídica, essencial e exclusiva de Estado e exige despacho fundamentado para a remoção nas hipóteses legais.'),

  // Língua Portuguesa — 12
  q('Língua Portuguesa', 'Crase', false,
    'Na frase “O agente começou à investigar o caso”, o acento grave foi empregado corretamente.',
    'Não ocorre crase antes de verbo; a forma correta é “começou a investigar”.'),
  q('Língua Portuguesa', 'Concordância verbal e nominal', true,
    'Na frase “Faltam duas páginas no relatório”, a forma verbal concorda corretamente com o sujeito posposto “duas páginas”.',
    'O verbo concorda no plural com o núcleo “páginas”, ainda que o sujeito venha depois.'),
  q('Língua Portuguesa', 'Regência verbal e nominal', false,
    'No sentido de ver, o verbo assistir é empregado corretamente em “Os agentes assistiram o depoimento”.',
    'Na norma-padrão, assistir com sentido de ver rege a preposição a: “assistiram ao depoimento”.'),
  q('Língua Portuguesa', 'Colocação dos pronomes átonos', true,
    'Em “Nunca se divulgaram os dados sigilosos”, a palavra negativa atrai corretamente o pronome para antes do verbo.',
    'Palavras de sentido negativo são fatores de próclise.'),
  q('Língua Portuguesa', 'Pontuação', false,
    'Na frase “Os investigadores, analisaram as imagens”, a vírgula é obrigatória por separar o sujeito do predicado.',
    'Não se separa por vírgula o sujeito simples de seu predicado nessa construção.'),
  q('Língua Portuguesa', 'Conectores e sequenciação textual', true,
    'A conjunção “embora” introduz normalmente uma relação concessiva.',
    'Ela apresenta uma circunstância que poderia contrariar o fato principal, mas não o impede.'),
  q('Língua Portuguesa', 'Ortografia oficial', false,
    'As palavras “exceção”, “privilégio” e “empecilho” estão grafadas, respectivamente, como “excessão”, “previlégio” e “impecilho” na ortografia oficial.',
    'As grafias corretas são exceção, privilégio e empecilho.'),
  q('Língua Portuguesa', 'Emprego de tempos e modos verbais', true,
    'Em “Se o perito examinasse o local, encontraria novos vestígios”, o imperfeito do subjuntivo expressa hipótese.',
    'A correlação examinasse/encontraria constrói uma condição hipotética.'),
  q('Língua Portuguesa', 'Classes de palavras', false,
    'Na expressão “investigação muito complexa”, a palavra “muito” é substantivo.',
    'Nesse contexto, “muito” intensifica o adjetivo “complexa” e funciona como advérbio.'),
  q('Língua Portuguesa', 'Referenciação, substituição e repetição', true,
    'Pronomes podem retomar elementos já mencionados e, com isso, contribuir para a coesão referencial do texto.',
    'A retomada pronominal evita repetições desnecessárias e conecta partes do texto.'),
  q('Língua Portuguesa', 'Aspectos gerais da redação oficial', false,
    'A redação oficial deve privilegiar marcas pessoais, linguagem emotiva e opiniões do redator.',
    'Impessoalidade, clareza, precisão, concisão e formalidade orientam a comunicação oficial.'),
  q('Língua Portuguesa', 'Significação das palavras', true,
    'A substituição de uma palavra por outra somente preserva o sentido quando se consideram o contexto e as relações semânticas do enunciado.',
    'Sinônimos raramente são intercambiáveis em todos os contextos; o valor contextual precisa ser verificado.'),

  // Informática — 10
  q('Informática', 'Pastas e arquivos', false,
    'No Windows, qualquer exclusão feita pela tecla Delete elimina o arquivo de modo definitivo, sem possibilidade de passagem pela Lixeira.',
    'Em situações comuns, Delete envia o item à Lixeira; exclusão definitiva depende do contexto ou de comando específico, como Shift+Delete.'),
  q('Informática', 'Configurações básicas e Windows Explorer', true,
    'Ocultar extensões conhecidas no Explorador de Arquivos altera apenas a exibição do nome, não o conteúdo do arquivo.',
    'A configuração visual não converte o formato nem modifica os bytes do arquivo.'),
  q('Informática', 'Microsoft Excel', false,
    'Ao copiar a fórmula “=$A$1+B1” uma coluna para a direita, todas as referências permanecem inalteradas.',
    'A referência $A$1 é absoluta, mas B1 é relativa e se torna C1.'),
  q('Informática', 'Microsoft Word', true,
    'O recurso Controlar Alterações registra edições para posterior revisão, sem significar que todas elas estejam automaticamente aceitas.',
    'As alterações ficam marcadas e podem ser aceitas ou rejeitadas pelo revisor.'),
  q('Informática', 'Internet e intranet', false,
    'Uma intranet precisa estar aberta ao público mundial para utilizar protocolos da família TCP/IP.',
    'Intranets usam tecnologias de rede e Internet em ambiente privado, com acesso restrito.'),
  q('Informática', 'Computação em nuvem', true,
    'Serviços em nuvem podem fornecer recursos computacionais sob demanda e ajustar capacidade conforme a necessidade.',
    'Elasticidade e provisionamento sob demanda são características usuais da computação em nuvem.'),
  q('Informática', 'Navegadores', false,
    'A presença de HTTPS garante que o site acessado seja legítimo, confiável e livre de conteúdo malicioso.',
    'HTTPS protege a comunicação e autentica o domínio conforme o certificado, mas não garante a honestidade do conteúdo.'),
  q('Informática', 'Segurança da informação, malware, antivírus e criptografia', true,
    'Phishing é uma técnica de engenharia social que tenta induzir a vítima a revelar dados ou executar uma ação insegura.',
    'A fraude explora confiança, urgência ou aparência de legitimidade para capturar informações ou instalar malware.'),
  q('Informática', 'Correio eletrônico', false,
    'O campo Cco revela a todos os destinatários os endereços inseridos nele.',
    'Cco significa cópia oculta; seus destinatários não são exibidos aos demais receptores.'),
  q('Informática', 'Backup e armazenamento em nuvem', true,
    'A estratégia 3-2-1 recomenda três cópias dos dados, em dois tipos de mídia, com uma cópia mantida fora do local principal.',
    'A distribuição reduz o risco de perda por falha única, desastre local ou incidente de segurança.'),

  // Raciocínio Lógico — 12
  q('Raciocínio Lógico', 'Tabelas-verdade', true,
    'A implicação “p implica q” é falsa somente quando p é verdadeira e q é falsa.',
    'Nos demais casos a implicação material é verdadeira.'),
  q('Raciocínio Lógico', 'Lógica de primeira ordem', false,
    'A negação de “Todo investigador é cuidadoso” é “Nenhum investigador é cuidadoso”.',
    'A negação correta é existencial: “Algum investigador não é cuidadoso”.'),
  q('Raciocínio Lógico', 'Leis de Morgan', true,
    'A negação de “p e q” é logicamente equivalente a “não p ou não q”.',
    'Essa é uma das leis de De Morgan.'),
  q('Raciocínio Lógico', 'Equivalências', false,
    'A proposição “se p, então q” é equivalente a “p e não q”.',
    '“p e não q” é a negação da implicação; uma equivalência da implicação é “não p ou q”.'),
  q('Raciocínio Lógico', 'Porcentagens', true,
    'Vinte e cinco por cento de 240 correspondem a 60.',
    'Como 25% = 1/4, basta dividir 240 por 4.'),
  q('Raciocínio Lógico', 'Porcentagens', false,
    'Aumentar um valor em 20% e depois reduzi-lo em 20% faz o valor retornar exatamente ao montante inicial.',
    'Os percentuais incidem sobre bases diferentes: 1,20 × 0,80 = 0,96, o que resulta em redução líquida de 4%.'),
  q('Raciocínio Lógico', 'Regras de três simples e compostas', true,
    'Mantida a produtividade, se quatro agentes realizam uma tarefa em seis horas, oito agentes realizam a mesma tarefa em três horas.',
    'Número de agentes e tempo são grandezas inversamente proporcionais.'),
  q('Raciocínio Lógico', 'Princípios de contagem', false,
    'Com três camisas e duas calças, só existem três combinações possíveis de uma camisa com uma calça.',
    'Pelo princípio multiplicativo, existem 3 × 2 = 6 combinações.'),
  q('Raciocínio Lógico', 'Probabilidade', true,
    'Em dois lançamentos independentes de uma moeda equilibrada, a probabilidade de ocorrer exatamente uma cara é igual a um meio.',
    'Os resultados favoráveis são cara-coroa e coroa-cara entre quatro resultados equiprováveis.'),
  q('Raciocínio Lógico', 'Progressões aritméticas e geométricas', false,
    'Na progressão aritmética 3, 7, 11, ..., o décimo termo é 35.',
    'A razão é 4 e a10 = 3 + 9 × 4 = 39.'),
  q('Raciocínio Lógico', 'Operações com conjuntos', true,
    'Para conjuntos finitos A e B, vale |A união B| = |A| + |B| − |A interseção B|.',
    'A interseção é subtraída para evitar que seus elementos sejam contados duas vezes.'),
  q('Raciocínio Lógico', 'Deduções e conclusões', false,
    'Das premissas “Todo agente é servidor” e “Algum servidor é estudante” conclui-se necessariamente que algum agente é estudante.',
    'O servidor estudante pode não pertencer ao conjunto dos agentes; a conclusão não decorre das premissas.'),

  // Contabilidade Geral — 11
  q('Contabilidade Geral', 'Componentes patrimoniais', true,
    'Ativos representam recursos controlados capazes de gerar benefícios econômicos, enquanto passivos representam obrigações presentes.',
    'A distinção expressa os elementos patrimoniais básicos conforme a estrutura conceitual contábil.'),
  q('Contabilidade Geral', 'Equação fundamental', false,
    'A equação fundamental do patrimônio é Ativo + Passivo = Patrimônio Líquido.',
    'A equação correta é Ativo = Passivo + Patrimônio Líquido.'),
  q('Contabilidade Geral', 'Situação líquida', true,
    'Quando o ativo é maior que o passivo exigível, a situação líquida patrimonial é positiva.',
    'A diferença A − P corresponde ao patrimônio líquido; sendo positiva, indica situação líquida positiva.'),
  q('Contabilidade Geral', 'Fatos permutativos', false,
    'A compra à vista de um veículo aumenta necessariamente o patrimônio líquido da entidade.',
    'Há troca entre elementos do ativo — caixa por veículo — sem alteração quantitativa do patrimônio líquido.'),
  q('Contabilidade Geral', 'Fatos mistos', true,
    'O pagamento de uma dívida com juros combina permuta patrimonial com despesa, caracterizando fato misto diminutivo.',
    'Há baixa de caixa e obrigação, além da redução do patrimônio líquido causada pelos juros.'),
  q('Contabilidade Geral', 'Débitos, créditos e saldos', false,
    'Nas contas do ativo, os aumentos são registrados a crédito e as diminuições a débito.',
    'Contas do ativo aumentam por débito e diminuem por crédito.'),
  q('Contabilidade Geral', 'Lançamentos e elementos essenciais', true,
    'Um lançamento contábil deve identificar contas debitadas e creditadas, valor e histórico ou informação equivalente do fato.',
    'Esses elementos permitem registrar e compreender o evento contábil.'),
  q('Contabilidade Geral', 'Livros de escrituração', false,
    'O Livro Razão organiza os registros exclusivamente em ordem cronológica, sem agrupá-los por conta.',
    'A ordem cronológica caracteriza o Diário; o Razão organiza os lançamentos por conta.'),
  q('Contabilidade Geral', 'Regime de competência e regime de caixa', true,
    'No regime de competência, receitas e despesas são reconhecidas no período em que ocorrem, independentemente do recebimento ou pagamento.',
    'O fato gerador econômico, e não apenas o fluxo financeiro, determina o período de reconhecimento.'),
  q('Contabilidade Geral', 'Conceitos, modelos e elaboração', false,
    'A igualdade entre débitos e créditos no balancete garante que não exista nenhum erro na escrituração.',
    'O balancete detecta certos desequilíbrios, mas não revela erros que preservem a igualdade, como omissões ou lançamentos em contas erradas.'),
  q('Contabilidade Geral', '9. Balanço patrimonial::Conceito, objetivo e composição', true,
    'O balanço patrimonial evidencia a posição patrimonial e financeira da entidade em determinada data.',
    'É uma demonstração estática composta, em linhas gerais, por ativo, passivo e patrimônio líquido.'),

  // Estatística — 11
  q('Estatística', 'Medidas de posição', false,
    'A média aritmética é sempre resistente a valores extremos e, por isso, nunca se altera de forma relevante diante de uma observação muito alta.',
    'A média é sensível a valores extremos; a mediana costuma ser mais robusta nesses casos.'),
  q('Estatística', 'Medidas de posição', true,
    'A mediana divide os dados ordenados em duas partes, ficando metade das observações de cada lado, ressalvadas repetições e a posição central.',
    'A definição depende da ordenação e da posição, não da soma dos valores.'),
  q('Estatística', 'Medidas de posição', false,
    'Toda distribuição possui exatamente uma moda.',
    'Uma distribuição pode ser amodal, unimodal ou multimodal.'),
  q('Estatística', 'Medidas de dispersão', true,
    'O desvio padrão é a raiz quadrada da variância e, portanto, é expresso na mesma unidade da variável.',
    'A raiz elimina a unidade ao quadrado presente na variância.'),
  q('Estatística', 'Medidas de dispersão', false,
    'O desvio padrão pode assumir valor negativo quando a maioria das observações está abaixo da média.',
    'Variância e desvio padrão são sempre não negativos.'),
  q('Estatística', 'Probabilidade condicional', true,
    'Se P(B) é positiva, então P(A dado B) = P(A interseção B) dividido por P(B).',
    'Essa é a definição de probabilidade condicional.'),
  q('Estatística', 'Independência', false,
    'Dois eventos independentes com probabilidades positivas são necessariamente mutuamente exclusivos.',
    'Eventos independentes podem ocorrer juntos; eventos mutuamente exclusivos positivos não são independentes.'),
  q('Estatística', 'Amostragem aleatória simples', true,
    'Na amostragem aleatória simples, cada amostra possível de determinado tamanho deve ter a mesma probabilidade de seleção.',
    'A equiprobabilidade das amostras é característica central do procedimento simples aleatório.'),
  q('Estatística', 'Amostragem estratificada', false,
    'Na amostragem estratificada, escolhe-se apenas um estrato e todos os demais são ignorados.',
    'A população é dividida em estratos e são selecionadas unidades dentro deles, segundo o plano amostral.'),
  q('Estatística', 'Amostragem sistemática', true,
    'A amostragem sistemática pode selecionar um início aleatório e, depois, unidades separadas por um intervalo fixo.',
    'O intervalo de seleção é aplicado após a definição do ponto inicial.'),
  q('Estatística', 'Amostragem por conglomerados', false,
    'A amostragem por conglomerados exige selecionar individualmente elementos dispersos de todos os grupos da população.',
    'Nesse método selecionam-se grupos naturais, ou conglomerados, e examinam-se todos ou parte dos elementos dos grupos escolhidos.'),
];

function curriculumIndex(curriculum) {
  const byKey = new Map();
  const disciplineBySubtopic = new Map();
  const ambiguousKeys = new Set();
  for (const role of curriculum.roles || []) {
    for (const discipline of role.disciplines || []) {
      for (const topic of discipline.topics || []) {
        for (const subtopic of topic.subtopics || []) {
          const key = `${discipline.name}::${subtopic.name}`;
          const qualifiedKey = `${discipline.name}::${topic.name}::${subtopic.name}`;
          byKey.set(qualifiedKey, subtopic.id);
          if (byKey.has(key)) {
            byKey.delete(key);
            ambiguousKeys.add(key);
          } else if (!ambiguousKeys.has(key)) {
            byKey.set(key, subtopic.id);
          }
          disciplineBySubtopic.set(subtopic.id, discipline.name);
        }
      }
    }
  }
  return { byKey, disciplineBySubtopic };
}

function comparable(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const curriculum = JSON.parse(await readFile(curriculumPath, 'utf8'));
if (curriculum.contest_id !== contestId) throw new Error('Currículo pertence a outro concurso.');
const { byKey, disciplineBySubtopic } = curriculumIndex(curriculum);
const statementKeys = new Set();

const questions = specs.map((spec, index) => {
  const key = `${spec.discipline}::${spec.subtopic}`;
  const subtopicId = byKey.get(key);
  if (!subtopicId) throw new Error(`Subtópico não encontrado: ${key}`);
  const statementKey = comparable(spec.statement);
  if (statementKeys.has(statementKey)) throw new Error(`Enunciado duplicado: ${spec.statement}`);
  statementKeys.add(statementKey);
  return {
    id: `pc_pe_2026_agente_autoral_${String(index + 1).padStart(4, '0')}`,
    contest_id: contestId,
    subtopic_id: subtopicId,
    statement: spec.statement,
    options: ['Certo', 'Errado'],
    correct_answer: spec.correctAnswer,
    explanation: spec.explanation,
    source,
    format: 'certo_errado',
    status: 'draft',
    editorial_review: 'pending',
  };
});

if (questions.length !== 100) throw new Error(`Quantidade inesperada: ${questions.length}; esperado: 100.`);
const trueCount = questions.filter(({ correct_answer: answer }) => answer === true).length;
const falseCount = questions.length - trueCount;
if (trueCount !== 50 || falseCount !== 50) throw new Error(`Gabarito desequilibrado: C=${trueCount}, E=${falseCount}.`);

const byDiscipline = {};
for (const question of questions) {
  const discipline = disciplineBySubtopic.get(question.subtopic_id);
  byDiscipline[discipline] = (byDiscipline[discipline] || 0) + 1;
}

const batch = {
  name: 'pcpe_agente_banco_inicial_autoral_001',
  status: 'draft',
  generated_at: '2026-09-01',
  publication_authorized: false,
  questions,
};
const audit = {
  schema_version: 'detona_question_bank_audit_v1',
  contest_id: contestId,
  generated_at: '2026-09-01',
  status: 'draft_editorial_review_required',
  totals: {
    questions: questions.length,
    correct_true: trueCount,
    correct_false: falseCount,
    unique_ids: new Set(questions.map(({ id }) => id)).size,
    unique_statements: statementKeys.size,
    covered_subtopics: new Set(questions.map(({ subtopic_id }) => subtopic_id)).size,
  },
  questions_by_discipline: byDiscipline,
  excluded_for_dynamic_risk: [
    'Legislação Estadual',
    'Atualidades',
  ],
  safeguards: {
    import_executed: false,
    publication_executed: false,
    entitlement_changed: false,
    requires_human_editorial_review: true,
    requires_normative_review_before_publication: true,
  },
};

await writeFile(outputPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outputPath, auditPath, ...audit.totals, byDiscipline }, null, 2)}\n`);
