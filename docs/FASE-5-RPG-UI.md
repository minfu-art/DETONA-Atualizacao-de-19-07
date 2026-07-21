# Fase 5 — RPG UI

## Escopo desta entrega

Evolução incremental da interface do DETONA CONCURSOS para uma linguagem de
RPG anime moderno, preservando autenticação local, sessões, biblioteca,
entitlements, isolamento, regras acadêmicas, banco de questões, rotina, Kafra e
PWA. Os mockups `DETONA_UI_CONCEITO_01.png` e
`DETONA_UI_CONCEITO_02.png` foram usados como direção visual, nunca como telas
estáticas.

Esta implementação foi aplicada na cópia ativa:

`C:\Users\wwwmi\Downloads\detona-concursos-work-develop\detona-concursos-work-develop`

A origem `.phase5-work` informada na especificação não estava presente. A pasta
`.phase5-rpg-ui-work` já existia no OneDrive com uma entrega anterior e foi
mantida intacta para evitar sobrescrita destrutiva.

## Diagnóstico inicial

- 248 testes encontrados: 241 aprovados e 7 falhas preexistentes;
- falhas restritas a expectativas editoriais do banco/importador de questões;
- 92 arquivos JavaScript com sintaxe válida;
- 126 recursos de precache existentes;
- smoke test HTTP funcional;
- design system incremental e shell responsivo já presentes;
- autenticação, biblioteca, PC/AL, PF/PRF em preparação, rotina, edital,
  batalha, perfil, revisão, Kafra e isolamento já implementados;
- o item “Estatísticas” do shell apontava incorretamente para a tela de edital;
- nenhuma tela acessava IndexedDB diretamente.

## Mapeamento entre referências e telas reais

| Referência | Implementação real | Dados preservados |
| --- | --- | --- |
| Login | `ui/auth.js` | `AuthService`, sessão e cadastro local |
| Biblioteca | `ui/library.js` | `LibraryService`, entitlement, catálogo e resumo |
| Home | `ui/home.js` | nível, XP, sequência, edital, rotina e revisão |
| Batalha | `ui/battleArena.js` | sessão, respostas, explicação e domínio |
| Edital/Jornada | `ui/grimorio.js` e `ui/topicTree.js` | disciplinas, subtópicos, estrelas, memória e revisão |
| Rotina | `ui/expedition.js` | calendário, blocos, duração, sequência e métricas |
| Perfil | `ui/profile.js` | avatar, nível, XP, cartas reais, preferências e Kafra |
| Estatísticas | `ui/statistics.js` | progresso, histórico, revisões e domínio por disciplina |

## Plano executado

1. aliases de tokens, componentes-base e shell;
2. integração visual de personagem em autenticação e biblioteca;
3. refinamento semântico da batalha;
4. tela própria de desempenho derivada de dados reais;
5. responsividade, acessibilidade, cache PWA, testes e documentação.

## Decisões visuais

- fundo azul-marinho quase preto e superfícies elevadas discretas;
- plasma roxo como identidade principal;
- laranja para energia e ação; ciano para conhecimento e dados;
- dourado para nível e domínio especial; verde para sucesso;
- vermelho reservado a erro/perigo;
- personagens existentes integrados por composição responsiva;
- brilhos locais e linhas de energia, sem partículas contínuas;
- densidade desktop própria e navegação inferior em mobile;
- movimento reduzido respeitado por `prefers-reduced-motion`.

## Design system

`app/css/design-system.css` centraliza os aliases solicitados:

- `--detona-bg-deep`, `--detona-bg-surface`, `--detona-bg-elevated`;
- `--detona-purple`, `--detona-purple-bright`, `--detona-orange`;
- `--detona-cyan`, `--detona-gold`, `--detona-green`, `--detona-red`;
- tokens de texto, borda, glow, raio, sombra e transição.

Os tokens existentes `--ds-*` continuam como base para evitar regressão nas
telas legadas.

## Componentes criados ou consolidados

- `appCard` / AppCard;
- `gamePanel` / GamePanel;
- `progressBar` e `xpBar`;
- `levelBadge`, `statusBadge` e `masteryBadge`;
- `metricCard` / `statCard`;
- `actionCard`;
- `characterPanel` e `enemyPanel`;
- `energyDivider`;
- `emptyState`, `skeleton` e `errorState`;
- feedback de resposta;
- cabeçalho, painel de estatísticas, modal, toast e navegação já existentes.

## Telas alteradas

### Autenticação

Recebeu composição de energia roxa/laranja, personagem de conhecimento, halo e
mensagem de produto. Formulário, mostrar senha, cadastro/login, instalação PWA,
labels e mensagens de erro foram preservados.

### Biblioteca

Recebeu um painel-guia responsivo com o personagem existente. PC/AL continua
funcional; PF e PRF permanecem em preparação, sem conteúdo ou progresso de
PC/AL. Entitlements e checkout demonstrativo continuam inalterados.

### Home

O dashboard existente já possuía nível, XP, sequência, rotina, edital, revisão,
personagem e ações rápidas. A ação “Desempenho” agora abre a tela estatística
correta.

### Questões/Batalha

As barras foram descritas como resistência e foco visuais da sessão. Foi
incluído objetivo textual acessível. Nenhuma regra de resposta, domínio, XP,
combo ou revisão foi alterada.

### Edital, rotina e perfil

O edital de três níveis e seus dados foram preservados. A rotina recebeu a
mensagem “Pequenas ações constroem grandes conquistas.” Perfil, avatar,
preferências, conquistas existentes e Kafra foram mantidos.

### Estatísticas

Criada uma tela própria que calcula, sem persistir novo estado:

- taxa de acerto;
- respostas, acertos e erros registrados;
- revisões e fila inteligente;
- progresso geral do edital;
- desempenho por disciplina;
- ponto forte e próximo foco;
- evolução recente por tentativas;
- resistência restante do Monstro Edital como metáfora visual.

## Funcionalidades não inventadas

- ranking público;
- moedas, loja ou pagamentos reais;
- chat ou inteligência artificial;
- HP persistente;
- conquistas não registradas pelo app;
- novas fórmulas de XP, nível, estrelas, domínio, memória ou sequência;
- conteúdo de PC/AL para PF ou PRF.

## Arquivos criados

- `app/js/ui/statistics.js`;
- `docs/FASE-5-RPG-UI.md`.

## Arquivos modificados

- `app/js/app.js`;
- `app/js/ui/auth.js`;
- `app/js/ui/library.js`;
- `app/js/ui/components.js`;
- `app/js/ui/battleArena.js`;
- `app/js/ui/expedition.js`;
- `app/css/design-system.css`;
- `app/sw.js`;
- `test/ui-components.test.js`;
- `test/ui-structure.test.js`.

## Assets utilizados

- personagens em `app/assets/hero/tiers/`;
- inimigos em `app/assets/enemies/`;
- arena em `app/assets/battle/arena-bg.jpg`;
- badge de nível e ícones existentes.

Nenhum mockup foi incorporado ao produto e nenhuma imagem foi convertida em
base64.

## Assets pendentes

- logo final em variações horizontal e compacta;
- personagem final de energia/ação com direitos aprovados;
- Monstro Edital editorial definitivo;
- identidades próprias autorizadas para PC/AL, PF e PRF.

## Testes adicionados

- semântica dos componentes RPG reutilizáveis;
- presença dos tokens centralizados;
- integração de arte sem uso dos mockups;
- rota própria de estatísticas;
- leitura exclusiva de stores reais pela tela estatística;
- garantia de ausência de ranking, moeda, checkout ou XP na estatística.

## Resultado final automatizado

- 251 testes: 244 aprovados e as mesmas 7 falhas editoriais da baseline;
- zero regressões novas na interface, arquitetura, isolamento ou regras;
- 93 arquivos JavaScript com sintaxe válida;
- 127 recursos de precache, zero ausentes;
- HTTP 200 para app, HTML, manifesto, service worker e nova tela;
- cache atualizado para `detona-v53-rpg-ui`.

As sete falhas existentes não foram ocultadas nem “corrigidas” alterando o
banco: cinco envolvem contagens/mapeamento do banco de Português e Análise de
Dados; duas envolvem a presença de 13 planilhas quando os testes esperam 12.

## PWA

- manifesto e service worker preservados;
- nova tela incluída no precache;
- todos os caminhos do precache existem;
- cache versionado para impedir que a UI anterior esconda a entrega atual;
- smoke HTTP concluído com status 200.

## Mobile e desktop

Há regras específicas para celulares pequenos, celulares, tablets e desktop:

- formulário em uma coluna e arte ocultada no mobile;
- biblioteca em uma coluna com guia reduzido;
- estatísticas em uma ou duas colunas conforme a largura;
- Monstro Edital ocultado em 320 px para priorizar dados;
- navegação inferior com safe area;
- sidebar e conteúdo central próprios no desktop;
- foco visível, alvos mínimos de 44 px e movimento reduzido.

## Limitações e riscos remanescentes

- o controle do navegador integrado não estava disponível nesta execução;
  portanto, o gate visual interativo nos dez viewports e os fluxos manuais
  completos permanecem pendentes e não foram substituídos por testes;
- instalação/reabertura offline deve ser confirmada em navegador real;
- as sete falhas editoriais preexistentes precisam de auditoria separada do
  banco, sem mistura com a entrega de UI;
- os assets atuais devem passar por revisão final de direitos e direção de arte.

## Próximos passos

1. auditar separadamente índice, banco de Português e as 13 planilhas;
2. abrir cadastro, login, biblioteca, PC/AL, batalha, edital, rotina, perfil e
   estatísticas nos dez viewports especificados;
3. validar instalação, atualização e reabertura offline;
4. testar zoom de 200%, teclado e leitor de tela;
5. aprovar ou substituir os assets editoriais pendentes;
6. somente depois promover esta cópia como nova base estável.

---

# Atualização — Dashboard de Desempenho (17/07/2026)

## Escopo e rota

A área analítica principal do concurso ativo passou a usar a rota interna
`performance`. A rota antiga `grimorio` foi mantida somente como alias de
compatibilidade e também entrega o novo painel. A tela exige sessão e concurso
ativos pelas mesmas proteções do restante do aplicativo.

A navegação principal agora apresenta, no celular, exatamente cinco destinos:
Início, Estudar, Edital, Rotina e Desempenho. No desktop, Desempenho substituiu
Perfil na sidebar. O Perfil não foi removido: permanece acessível pelo avatar do
cabeçalho, pelo botão "Meu perfil" da sidebar e pelas ações de conta. Logout,
biblioteca e preferências foram preservados.

## Componentes e comportamento

O arquivo `app/js/ui/performance.js` consolida os componentes de apresentação
seguindo o padrão funcional da base atual:

- cabeçalho compacto e filtro de período;
- progresso geral do edital;
- Monstro Edital com resistência visual igual a `100 - progresso`;
- indicadores gerais;
- lista e ordenação de disciplinas;
- distribuição de tempo em gráfico CSS com legenda textual;
- evolução recente em SVG acessível;
- fila e estados de memória das revisões;
- resumo textual da jornada;
- estados vazios sem valores simulados.

Não foi criado HP persistente, nova moeda, XP, conquista ou regra oficial de
domínio. O Monstro Edital é somente uma representação visual do percentual real
já existente.

## Serviço de agregação e fontes dos dados

O novo `app/js/services/performanceService.js` separa leitura/agregação da
renderização. A interface não acessa IndexedDB diretamente. Todas as leituras
passam por `ProgressRepository`, que exige o contexto ativo `userId + contestId`.

| Informação | Fonte real |
| --- | --- |
| Progresso do edital | `player.edital_completion_pct` |
| Tópicos concluídos/restantes | `verticalized.theory_status` |
| Questões, acertos e erros | `subtopics.question_history` e `attempt_history`, com fallback legado |
| Desempenho por disciplina | disciplinas + subtópicos do concurso ativo |
| Tempo total e por disciplina | `routineBlocks`; fallback total em `studySessions`/`routineDailyStates` |
| Revisões | `verticalized.review_count` e `reviewQueue` |
| Memória | `reviewQueue.memoryState` |
| Evolução recente | tentativas datadas dos subtópicos |
| Concurso e aluno | contexto ativo do repositório e registro `player` |

Os filtros disponíveis são 7, 30 e 90 dias e todo o histórico. Quando não
há granularidade real por disciplina ou histórico suficiente, o painel informa
a indisponibilidade e não inventa distribuições nem linhas de evolução.

## Arquivos criados nesta atualização

- `app/js/services/performanceService.js`;
- `app/js/ui/performance.js`;
- `test/performance-service.test.js`;
- `scripts/visual-qa-performance.mjs`;
- `docs/qa-performance/resultado.json` e quatro capturas de homologação;
- `docs/referencias-visuais/DETONA_DESEMPENHO_REFERENCIA.png`.

## Arquivos modificados nesta atualização

- `app/index.html`;
- `app/js/app.js`;
- `app/js/ui/appShell.js`;
- `app/js/ui/home.js`;
- `app/css/design-system.css`;
- `app/sw.js`;
- `test/ui-structure.test.js`;
- `docs/FASE-5-RPG-UI.md`.

## Testes e homologação visual

Foram adicionados sete testes focados em agregação real, estado vazio,
filtragem temporal, isolamento por usuário e concurso, ordenação, navegação,
Perfil/logout e ausência de economia fictícia. O conjunto focado terminou com
29 de 29 testes aprovados.

A suíte completa final executou 258 testes: 251 aprovados e as mesmas sete
falhas editoriais registradas antes da alteração. Portanto, os sete novos testes
foram incorporados sem regressão na quantidade de falhas. A validação crítica
final de serviço, rota, navegação e estrutura terminou com 21 de 21 aprovações;
77 arquivos JavaScript/MJS foram verificados com zero erro de sintaxe.

A tela foi aberta em uma conta descartável e conferida visualmente no Chrome
local isolado. Foram validados 320x568, 360x800, 375x812, 390x844, 430x932,
768x1024, 1024x768, 1280x720, 1366x768, 1600x900, 1920x1080 e paisagem
844x390. Também foram testados zoom 100%, 125%, 150% e 200%. Em todos os casos,
`scrollWidth <= clientWidth`, sem rolagem horizontal. A rolagem vertical real do
painel foi confirmada no celular e desktop, com navegação fixa e acesso ao
resumo final.

As capturas de topo e final estão em `docs/qa-performance/`. O fluxo também
confirmou concurso exibido, resistência do Monstro em 28% para edital em 72%,
quatro filtros de período e retorno ao Perfil pelo avatar.

## PWA

O cache foi atualizado para `detona-v56-rpg-icons-female-alpha`. O serviço e a
nova tela foram incluídos no precache; o caminho antigo da tela estatística foi
removido do precache. IndexedDB e sua estrutura foram preservados sem migração.
O lote final possui 139 recursos únicos e zero caminhos ausentes. Duplicatas de
ícones que impediam a instalação atômica do cache foram removidas e o módulo de
calendário transitivamente importado foi incluído. O service worker chegou ao
estado `ready` e a aplicação reinicializou offline na Biblioteca com o runtime
ativo. Em seguida, o concurso PC/AL, o onboarding descartável, a Home e a tela
Desempenho foram abertos sem rede. Todos os bancos JSON referenciados pelo índice,
a tela e o serviço de Desempenho estão no precache.

## Limitações e próximos passos

- Os dados por período dependem de registros que possuam data; registros legados
  sem data entram somente nos totais compatíveis.
- A distribuição por disciplina depende de blocos de rotina com `subjectId`;
  sem isso, somente o total real pode ser apresentado.
- As sete falhas editoriais anteriores do banco de questões/XLSX continuam
  separadas desta entrega e devem ser auditadas sem alterar contagens para
  satisfazer testes.
- Antes da publicação, executar a auditoria editorial pendente e uma última
  instalação/reabertura offline no ambiente de produção escolhido.

## Correção visual — ícones RPG e avatares femininos (18/07/2026)

A família de 26 ícones RPG que havia ficado somente na cópia de Downloads foi
integrada a `app/js/ui/icons.js`. Os símbolos agora usam placa escura chanfrada,
gradientes plasma/energia/ciano/dourado/verde/vermelho, brilho controlado e IDs
únicos para evitar colisão de gradientes no DOM. A prancha de conferência está
em `docs/ICONES-RPG-PREVIEW.svg` e `docs/ICONES-RPG-PREVIEW.png`.

Os dez PNGs em `app/assets/hero/tiers/female/` foram substituídos pelas versões
recortadas já aprovadas na cópia anterior. A validação confirmou canal alfa
variando de 0 a 255 e alfa zero nos quatro cantos de todas as imagens. Nenhum
personagem foi redesenhado nesta correção; somente as versões com transparência
real foram incorporadas ao projeto ativo.

Foram adicionados quatro testes de cobertura, estrutura, IDs e compatibilidade
dos ícones. A validação direcionada terminou com 26 de 26 testes aprovados.
