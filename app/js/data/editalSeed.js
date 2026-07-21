/**
 * Seed do Edital — PC/AL 2026 (Agente e Escrivão)
 * Formato predileto: Certo/Errado (CEBRASPE)
 * Data padrão da prova: 2026-12-06
 */

export const EXAM_META = {
  name: 'Polícia Civil do Estado de Alagoas (PC/AL)',
  cargo: 'Agente e Escrivão de Polícia',
  format: 'certo_errado',
  banca: 'CEBRASPE',
  default_exam_date: '2026-12-06',
};

/**
 * Blocos de alto nível do edital (apenas tópicos principais no dashboard)
 * short = rótulo curto nas caixas Home
 */
export const KNOWLEDGE_BLOCKS = {
  gerais: {
    id: 'gerais',
    title: 'Conhecimentos Gerais',
    disciplineIds: ['port', 'ti', 'ciber', 'rlm', 'dh', 'etica'],
    labels: {
      port: 'Português',
      ti: 'Informática',
      ciber: 'Seg. Cibernética',
      rlm: 'Raciocínio Lógico',
      dh: 'Direitos Humanos',
      etica: 'Atualidades & Ética',
    },
  },
  especificos: {
    id: 'especificos',
    title: 'Conhecimentos Específicos',
    disciplineIds: ['penal', 'proc', 'const', 'adm', 'leg_al', 'leg_esp', 'contab', 'fin', 'estat', 'dados'],
    labels: {
      penal: 'Dir. Penal',
      proc: 'Proc. Penal',
      const: 'Constitucional',
      adm: 'Administrativo',
      leg_al: 'Legislação AL',
      leg_esp: 'Leg. Penal Especial',
      contab: 'Contabilidade',
      fin: 'Crimes Financeiros',
      estat: 'Estatística',
      dados: 'Análise de Dados',
    },
  },
};

const ENEMY_POOL = [
  'Porin', 'Poring', 'Fabre', 'Chonchon', 'Lunatic', 'Rocker', 'Willow', 'Spore',
  'Thief Bug', 'Familiar', 'Zombie', 'Skeleton', 'Goblin', 'Orc Warrior', 'Orc Lady',
  'Mandragora', 'Elder Willow', 'Wolf', 'Hydra', 'Magnolia', 'Marina', 'Vadon',
  'Cornutus', 'Marse', 'Plankton', 'Pupa', 'Creamy', 'Horn', 'Argiope', 'Muka',
  'Giearth', 'Sandman', 'Hode', 'Anolian', 'Strouf', 'Marc', 'Obeaune', 'Phen',
  'Deviruchi', 'Dokebi', 'Sohee', 'Isis', 'Marduk', 'Verit', 'Requiem', 'Baphomet Jr',
  'Arc Angeling', 'Angeling', 'Ghostring', 'Mastering', 'Drake', 'Eddga', 'Osiris',
  'Baphomet', 'Doppelganger', 'Maya', 'Pharaoh', 'Thanatos', 'Valkyrie', 'Beelzebub',
];

function enemyFor(index, name) {
  const e = ENEMY_POOL[index % ENEMY_POOL.length];
  return {
    enemy_name: `${e} — ${name.split(' ').slice(0, 3).join(' ')}`,
    enemy_sprite: `enemy-${(index % 16) + 1}`,
  };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string} icon
 * @param {string} biome
 * @param {Array<[string, string]>} items [numbering, title]
 * @param {number} order
 */
function disc(id, name, icon, biome, items, order) {
  return { id, name, icon, biome, items, order };
}

/** Programática completa — folhas = subtópicos + verticalized items */
export const DISCIPLINE_DEFS = [
  disc('port', 'Língua Portuguesa', '📜', 'Floresta de Português', [
    ['1', 'Compreensão e interpretação de textos de gêneros variados'],
    ['2', 'Reconhecimento de tipos e gêneros textuais'],
    ['3', 'Domínio da ortografia oficial'],
    ['4.1', 'Coesão: referenciação, substituição, conectores e sequenciação'],
    ['4.2', 'Coesão: emprego de tempos e modos verbais'],
    ['5.1', 'Emprego das classes de palavras'],
    ['5.2', 'Relações de coordenação'],
    ['5.3', 'Relações de subordinação'],
    ['5.4', 'Emprego dos sinais de pontuação'],
    ['5.5', 'Concordância verbal e nominal'],
    ['5.6', 'Regência verbal e nominal'],
    ['5.7', 'Emprego de crase'],
    ['5.8', 'Colocação dos pronomes átonos'],
    ['6.1', 'Significação das palavras'],
    ['6.2', 'Substituição de palavras/trechos'],
    ['6.3', 'Reorganização estrutural de frases'],
    ['6.4', 'Reescrita em diferentes gêneros e formalidade'],
  ], 1),

  disc('ti', 'Tecnologia da Informação', '💻', 'Caverna de TI', [
    ['1', 'Noções de sistema operacional (Linux e Windows)'],
    ['2', 'Edição de textos, planilhas e apresentações (Office)'],
    ['3.1', 'Redes: conceitos, ferramentas, Internet e intranet'],
    ['3.2', 'Navegadores Edge e Chrome'],
    ['3.3', 'Correio eletrônico Outlook'],
    ['3.4', 'Sítios de busca e grupos de discussão'],
    ['3.5', 'Computação na nuvem / Cloud computing'],
    ['4', 'Organização e gerenciamento de arquivos e pastas'],
    ['5.1', 'Segurança da informação: procedimentos'],
    ['5.2', 'Vírus, worms e pragas virtuais'],
    ['5.3', 'Antivírus, firewall e anti-spyware'],
    ['5.4', 'Procedimentos de backup e cloud storage'],
    ['6.1', 'Banco de dados: organização e acesso'],
    ['6.2', 'SGBDs, SQL e modelos de dados'],
    ['6.3', 'Segurança, integridade e bancos distribuídos'],
    ['7', 'Lei nº 13.709/2018 (LGPD)'],
    ['8', 'Serviços públicos digitais'],
    ['9', 'Inteligência Artificial'],
    ['10', 'Linguagens de programação (Java, Python, Apex, C#)'],
  ], 2),

  disc('ciber', 'Segurança Cibernética', '🛡️', 'Torre Cibernética', [
    ['1', 'Fundamentos: Confidencialidade, Integridade, Disponibilidade'],
    ['2', 'Gestão de Riscos e Conformidade'],
    ['3', 'Segurança de Rede (Firewall, IDS/IPS, VPN, Segmentação)'],
    ['4', 'Criptografia: técnicas e ferramentas'],
    ['5', 'Segurança em Nuvem'],
    ['6', 'Gestão de Identidades (SSO, SAML, OAuth2, OIDC)'],
    ['7', 'Principais tipos de ataques e vulnerabilidades'],
    ['8', 'Controles e testes de segurança Web/Web Services'],
    ['9', 'Soluções de Segurança (SIEM, Proxy, IAM, PAM)'],
    ['10', 'Frameworks (MITRE, CIS Controls, NIST CSF)'],
    ['11', 'Tratamento de Incidentes Cibernéticos'],
    ['12', 'Assinatura e certificação digital'],
    ['13', 'Segurança em nuvens e contêineres'],
  ], 3),

  disc('rlm', 'Raciocínio Lógico-Matemático', '🔢', 'Labirinto Lógico', [
    ['1', 'Princípios de contagem e probabilidade'],
    ['2', 'Razões e proporções'],
    ['3', 'Regras de três simples'],
    ['4', 'Porcentagens'],
    ['5', 'Equações de 1º e de 2º graus'],
    ['6', 'Sequências, PA e PG'],
    ['7', 'Funções e gráficos'],
    ['8', 'Estruturas lógicas e lógica de argumentação'],
    ['9', 'Lógica sentencial/proposicional e tabelas-verdade'],
    ['10', 'Lógica de primeira ordem'],
    ['11', 'Operações com conjuntos'],
    ['12', 'Problemas aritméticos, geométricos e matriciais'],
  ], 4),

  disc('dh', 'Noções de Direitos Humanos', '⚖️', 'Templo dos Direitos', [
    ['1', 'Teoria geral dos direitos humanos'],
    ['2', 'Afirmação histórica dos direitos humanos'],
    ['3', 'Direitos humanos e responsabilidade do Estado'],
    ['4', 'Direitos humanos na Constituição Federal de 1988'],
    ['5', 'Política Nacional de Direitos Humanos'],
    ['6', 'Pacto de São José da Costa Rica (Dec. 678/1992)'],
  ], 5),

  disc('etica', 'Atualidades & Ética no Serviço Público', '🏛️', 'Praça da Cidadania', [
    ['1', 'Atualidades: tópicos relevantes e atuais'],
    ['2', 'Ética e moral, princípios e valores'],
    ['3', 'Ética e democracia: exercício da cidadania'],
    ['4', 'Ética e função pública / Setor público'],
    ['5', 'Lei estadual nº 6.754/2006 (Código de Ética AL)'],
  ], 6),

  disc('penal', 'Direito Penal', '🔪', 'Região do Código Penal', [
    ['1', 'Aplicação da lei penal (princípios, tempo, espaço)'],
    ['2', 'Crimes contra a pessoa'],
    ['3', 'Crimes contra o patrimônio'],
    ['4', 'Crimes contra a administração pública'],
    ['5', 'Disposições constitucionais aplicáveis ao direito penal'],
  ], 7),

  disc('proc', 'Direito Processual Penal', '📋', 'Delegacia do Inquérito', [
    ['1', 'Disposições preliminares do CPP'],
    ['2', 'Inquérito policial (conceito, titularidade, notitia criminis)'],
    ['3', 'Prisão e liberdade provisória'],
    ['4', 'Disposições constitucionais aplicáveis ao processo penal'],
    ['5', 'Lei nº 9.099/1995 (Juizados Especiais Criminais)'],
  ], 8),

  disc('const', 'Direito Constitucional', '📕', 'Capital Constitucional', [
    ['1', 'Direitos e Garantias Fundamentais (Art. 5º ao 17 CF/88)'],
    ['2', 'Da Segurança Pública (Art. 144 CF/88)'],
  ], 9),

  disc('adm', 'Direito Administrativo', '🏢', 'Fortaleza Administrativa', [
    ['1', 'Organização administrativa (direta/indireta)'],
    ['2', 'Ato administrativo (conceito, requisitos, atributos)'],
    ['3', 'Agente público (cargo, emprego e função)'],
    ['4', 'Poderes administrativos e abuso de poder'],
    ['5', 'Licitações (Nova Lei de Licitações)'],
    ['6', 'Controle da administração pública'],
    ['7', 'Responsabilidade civil do Estado'],
  ], 10),

  disc('leg_al', 'Legislação Institucional de Alagoas', '🦅', 'Terras de Alagoas', [
    ['1', 'Constituição do Estado de Alagoas'],
    ['2', 'Lei estadual nº 3.437/1975 (Estatuto da Polícia Civil AL)'],
    ['3', 'Lei estadual nº 5.247/1991 (RJU/AL)'],
    ['4', 'Lei nº 14.735/2023 (Lei Orgânica Nacional das PCs)'],
    ['5', 'Leis complementares estaduais (6.441, 6.276, 6.479, 4.590)'],
  ], 11),

  disc('leg_esp', 'Legislação Penal Especial', '💀', 'Covil das Leis Especiais', [
    ['1', 'Lei nº 11.343/2006 (Lei de Drogas)'],
    ['2', 'Lei nº 12.850/2013 (Crime Organizado)'],
    ['3', 'Lei nº 10.826/2003 (Estatuto do Desarmamento)'],
    ['4', 'Lei nº 8.072/1990 (Crimes Hediondos)'],
    ['5', 'Lei nº 9.455/1997 (Tortura)'],
    ['6', 'Lei nº 13.869/2019 (Abuso de Autoridade)'],
    ['7', 'Lei nº 9.613/1998 (Lavagem de Dinheiro)'],
    ['8', 'Lei nº 8.137/1990 (Crimes contra a Ordem Tributária)'],
    ['9', 'Lei nº 7.716/1989 (Crimes de Preconceito)'],
    ['10', 'Lei nº 9.605/1998 (Crimes Ambientais)'],
    ['11', 'Lei nº 14.133/2021 (Crimes em Licitações)'],
    ['12', 'Crimes no Estatuto da Pessoa com Deficiência e Idoso'],
    ['13', 'Convenção de Budapeste (Crime Cibernético)'],
    ['14', 'Crimes contra o Sistema Financeiro (Lei 7.492/1986)'],
  ], 12),

  disc('contab', 'Contabilidade Geral', '📒', 'Arquivo Contábil', [
    ['1', 'Conceitos, objetivos e finalidades'],
    ['2', 'Patrimônio (componentes, equação, situação líquida)'],
    ['3', 'Atos e fatos administrativos'],
    ['4', 'Contas (débito, crédito, saldos, plano de contas)'],
    ['5', 'Contabilização de operações e conciliações'],
    ['6', 'Balancete, BP e DRE'],
    ['7', 'Noções de finanças, orçamento e tributos'],
  ], 13),

  disc('fin', 'Análise Financeira & Crimes Tributários', '💰', 'Mercado Negro Financeiro', [
    ['1', 'Gestão e monitoramento de riscos financeiros'],
    ['2', 'Lavagem de dinheiro (Lei 9.613/1998)'],
    ['3', 'Crimes contra ordem tributária, previdência e mercado'],
    ['4', 'Análise investigativa: fluxos vs capacidade econômica'],
    ['5', 'Indícios de fraudes contábeis e ocultação de patrimônio'],
    ['6', 'Modus operandi: smurfing, laranjas e empresas fictícias'],
  ], 14),

  disc('estat', 'Estatística', '📈', 'Campo das Distribuições', [
    ['1', 'Estatística descritiva e análise exploratória'],
    ['2', 'Probabilidade e probabilidade condicional (Bayes)'],
    ['3', 'Variáveis aleatórias discretas e contínuas'],
    ['4', 'Distribuições (Uniforme, Bernoulli, Binomial, Normal)'],
    ['5', 'Medidas de tendência central e dispersão'],
    ['6', 'Correlação de Pearson, TCL e regra 3-Sigma'],
    ['7', 'Amostragem e tamanho amostral'],
    ['8', 'Inferência estatística e testes de hipóteses'],
    ['9', 'Regressão linear, ANOVA e resíduos'],
  ], 15),

  disc('dados', 'Análise de Dados (Data Science & AI)', '🤖', 'Laboratório de Dados', [
    ['1', 'Dados estruturados/não estruturados, ETL, XML/JSON/CSV'],
    ['2', 'Data Mining e metodologia CRISP-DM'],
    ['3', 'Processamento de Linguagem Natural (PLN/NLP)'],
    ['4', 'Machine Learning: modelos, over/underfitting'],
    ['5', 'Python para Análise de Dados'],
  ], 16),
];

/**
 * Gera entidades relacionais a partir das defs.
 */
export function buildSeedEntities() {
  const disciplines = [];
  const subtopics = [];
  const verticalized = [];
  let globalIdx = 0;

  for (const d of DISCIPLINE_DEFS) {
    disciplines.push({
      id: d.id,
      name: d.name,
      icon: d.icon,
      biome: d.biome,
      total_subtopics: d.items.length,
      completed_subtopics: 0,
      order: d.order,
    });

    d.items.forEach(([num, title], i) => {
      const sid = `${d.id}_${num.replace(/\./g, '_')}`;
      const en = enemyFor(globalIdx, title);
      subtopics.push({
        id: sid,
        discipline_id: d.id,
        name: title,
        edital_numbering: num,
        enemy_name: en.enemy_name,
        enemy_sprite: en.enemy_sprite,
        stars: 0,
        best_accuracy: 0,
        melhorPercentual: 0,
        best_correct_answers: null,
        melhorAcertos: null,
        best_total_questions: null,
        totalQuestoes: null,
        attempts_count: 0,
        tentativas: 0,
        first_attempt_at: null,
        primeiraTentativaEm: null,
        last_attempt_at: null,
        ultimaTentativaEm: null,
        best_result_at: null,
        melhorResultadoEm: null,
        best_attempt_question_ids: [],
        questoesDaMelhorTentativa: [],
        attempt_history: [],
        historicoTentativas: [],
        last_studied_at: null,
        memory_temperature: 'congelado',
      });
      verticalized.push({
        id: `v_${sid}`,
        subtopic_id: sid,
        edital_numbering: `${d.order}.${num}`,
        title,
        theory_status: 'nao_iniciado',
        review_count: 0,
        last_review_date: null,
        questions_done: false,
        accuracy: 0,
      });
      globalIdx += 1;
    });
  }

  return { disciplines, subtopics, verticalized };
}

export function defaultPlayer() {
  return {
    id: 'player_1',
    name: '',
    avatar_sprite: 'male',
    level: 0,
    mastery_pct: 0,
    xp_level: 1,
    xp: 0,
    xp_next_level: 100,
    exam_date: EXAM_META.default_exam_date,
    streak_days: 0,
    edital_completion_pct: 0,
    last_study_date: null,
    celebration_shown: false,
    onboarded: false,
    sound_enabled: true,
    total_stars: 0,
    endgame_mode: false,
    streak_embers: false,
    rescue_missions_pending: 0,
    _pending_celebration: false,
  };
}

export function defaultRoutines() {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day_of_week: day,
    enabled: day >= 1 && day <= 5,
    goal_type: 'questoes',
    goal_amount: day === 0 || day === 6 ? 10 : 30,
    focus_discipline_id: 'auto',
    start_time: '19:00',
    end_time: '21:00',
  }));
}

/** Hábitos de bem-estar pré-configurados (Seção 14.3) */
export function defaultWellbeingHabits() {
  return [
    {
      id: 'wb_agua',
      name: 'Água',
      icon: '💧',
      unit: 'copos',
      daily_target: 8,
      category: 'agua',
      enabled: true,
      input_type: 'count',
    },
    {
      id: 'wb_exercicio',
      name: 'Exercício',
      icon: '🏃',
      unit: 'min',
      daily_target: 30,
      category: 'exercicio',
      enabled: true,
      input_type: 'count',
    },
    {
      id: 'wb_alimentacao',
      name: 'Alimentação',
      icon: '🍎',
      unit: 'sessões',
      daily_target: 1,
      category: 'alimentacao',
      enabled: true,
      input_type: 'toggle',
    },
    {
      id: 'wb_meditacao',
      name: 'Meditação / Pausa',
      icon: '🧘',
      unit: 'min',
      daily_target: 10,
      category: 'meditacao',
      enabled: true,
      input_type: 'count',
    },
    {
      id: 'wb_sono',
      name: 'Sono',
      icon: '😴',
      unit: 'horas',
      daily_target: 7,
      category: 'sono',
      enabled: true,
      input_type: 'hours',
    },
  ];
}

/**
 * @deprecated Não usar no seed nem em batalhas.
 * Mantida apenas para testes de detecção `isDemoQuestion` / purge.
 * O banco real usa packs JSON e Forja — zero questões DEMO em produção.
 */
export function buildDemoQuestions(subtopics = []) {
  const questions = [];
  const byDisc = {};
  for (const s of subtopics) {
    byDisc[s.discipline_id] = byDisc[s.discipline_id] || [];
    byDisc[s.discipline_id].push(s);
  }
  for (const list of Object.values(byDisc)) {
    const targets = list.slice(0, 2);
    for (const sub of targets) {
      for (let i = 0; i < 10; i++) {
        const correct = i % 2 === 0;
        questions.push({
          id: `demo_${sub.id}_${i}`,
          subtopic_id: sub.id,
          format: 'certo_errado',
          statement: `[DEMO ${sub.edital_numbering}.${i + 1}] Sobre "${sub.name.slice(0, 60)}": a afirmação de que este conteúdo é essencial para a PC/AL está correta conforme a programática do edital.`,
          options: ['Certo', 'Errado'],
          correct_answer: correct,
          explanation: correct
            ? 'Item CERTO. Este tópico integra a programática oficial do concurso PC/AL (Cebraspe). Substitua por questões reais no banco de questões.'
            : 'Item ERRADO. A afirmação é demonstrativa. Cadastre questões reais com resolução completa no banco de questões.',
          is_user_created: false,
          is_demo: true,
          metadata: { demo: true },
          created_at: new Date().toISOString(),
        });
      }
    }
  }
  return questions;
}
