# Sistema de Domínio do Edital

## Resultado

O LV do DETONA CONCURSOS passa a representar exclusivamente o piso da média de
domínio de todos os subtópicos do edital. Responder questões não concede XP e
não altera diretamente o LV. Uma tentativa só afeta o LV quando melhora o melhor
resultado do subtópico.

## Regras implementadas

- cada desafio contém exatamente 10 questões válidas e únicas de um único
  subtópico;
- a seleção prioriza questões inéditas, respondidas há mais tempo, erradas,
  corretas antigas e, por último, questões recentes, sorteando os empates dentro
  de cada faixa para evitar conjuntos fixos;
- bancos maiores produzem maior variedade sem impor limite de questões;
- o resultado da tentativa varia de 0% a 100% em passos de 10%;
- resultados inferiores nunca reduzem o domínio já conquistado;
- estrelas são apenas representação visual em passos de meia estrela;
- a disciplina usa a média de todos os seus subtópicos, inclusive os ainda não
  realizados;
- o LV global usa a média de todos os subtópicos do edital, sem ponderação por
  disciplina e sem usar XP;
- erros entram automaticamente na lista de revisão e recebem feedback educativo
  com explicação imediata;
- a tela final informa resultado anterior, novo resultado, domínio preservado ou
  atualizado, estrelas, impacto na disciplina, impacto no LV, tentativas e itens
  adicionados à revisão.

## Histórico e compatibilidade

Cada subtópico mantém aliases em inglês e português para:

- melhor percentual, última tentativa, quantidade de tentativas e histórico;
- questões respondidas, acertadas, erradas e em revisão;
- data da última tentativa e data do melhor resultado;
- histórico por questão com contagens, último resultado e última data.

A migração é incremental e não cria nova store. Os registros existentes são
normalizados quando lidos ou atualizados. Percentuais e contagens confiáveis são
preservados; estrelas antigas não são usadas para inventar domínio. Dados
ambíguos continuam registrados em `mastery_migration_review`.

O schema editorial de questões evoluiu da versão 2 para a versão 3. A migração
preserva os campos atuais e acrescenta, de forma opcional:

- `porqueCorreta`;
- `porqueAlternativaA` a `porqueAlternativaE`;
- `pegadinhaDaBanca`;
- `dicaDeMemorizacao`;
- `resumo`;
- `referencias`.

Quando esses campos estão vazios, a interface usa somente `explicacao` ou
`explanation`, mantendo compatibilidade com todo o banco existente.

## Preparação para IA

`questionExplanationService.js` fornece um contrato de extensões registráveis.
Provedores futuros poderão enriquecer explicações, alternativas, dicas, resumos
e padrões de erro sem acoplar a UI a um fornecedor de IA. Nenhuma IA ou chamada
externa foi implementada nesta etapa.

## Arquivos novos

- `app/js/core/questionSelection.js`;
- `app/js/services/questionExplanationService.js`;
- `app/tests/question-selection.test.js`;
- `app/tests/question-explanation-service.test.js`;
- `docs/SISTEMA-DOMINIO-EDITAL.md`.

## Arquivos alterados nesta etapa

- `app/js/core/battle.js`;
- `app/js/core/mastery.js`;
- `app/js/core/questionSchema.js`;
- `app/js/core/questionImport.js`;
- `app/js/core/types.js`;
- `app/js/ui/battleArena.js`;
- `app/js/ui/components.js`;
- `app/js/ui/topicTree.js`;
- `app/js/ui/worldMap.js`;
- `app/css/design-system.css`;
- `app/sw.js`;
- testes legados de batalha, progressão, memória, componentes e estrutura.

## Validação

- suíte consolidada: 95 testes automatizados;
- 55 arquivos JavaScript validados sintaticamente;
- banco editorial preservado com 1.162 questões, sendo 1.156 utilizáveis e 6 em
  revisão editorial;
- fluxo real validado no navegador desde cadastro e onboarding até a conclusão
  de um desafio de 10 questões;
- erro confirmado em revisão automática e tela de resultado confirmada sem XP.

## Riscos restantes

- o histórico detalhado começa a ganhar precisão a partir desta versão; dados
  antigos sem datas ou IDs por tentativa não podem ser reconstruídos;
- campos enriquecidos permanecem vazios até curadoria editorial futura;
- o XP legado continua armazenado para compatibilidade e outras mecânicas, mas
  não é atualizado por desafios e não participa do cálculo do LV;
- as 6 questões já marcadas para revisão editorial permanecem inelegíveis até
  correção manual.
