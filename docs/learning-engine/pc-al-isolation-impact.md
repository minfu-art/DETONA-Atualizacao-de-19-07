# Impacto e isolamento da PC AL

## Decisão

PC AL permanece em `legacy_subtopic_v1`. Nenhum registro histórico será convertido em estado de microconhecimento e nenhuma fórmula atual será reinterpretada.

## Baseline que deve permanecer invariável

- Login e restauração de sessão.
- Biblioteca e entitlement existente por concurso.
- Catálogo PC AL com 137 subtópicos e 6.480 questões.
- URLs e entrada comercial.
- Checkout, webhook e concessão de acesso atuais.
- Banco local separado por usuário e concurso.
- Histórico, estrelas, domínio, XP, revisão e progresso já gravados.
- Seleção de 10 questões e fluxo da batalha.
- Pacote estático/legado e fallback permitido para PC AL.

## Risco estrutural identificado

Hoje o contexto é `user_id + contest_id`:

- IndexedDB: `DetonaConcursosDB__user__<user>__contest__<contest>`;
- `progress_records`: chave por usuário, concurso, coleção e registro;
- entitlement: único por usuário e concurso;
- pacote publicado: único por concurso;
- active context: somente `activeContestId`.

Isso é suficiente para PC AL, mas não para três cargos dentro de `pc_ba_2026`. Alterar essas chaves existentes seria destrutivo e arriscaria a PC AL.

## Estratégia de isolamento

1. Manter as chaves e tabelas legadas intocadas.
2. Criar `course_offering` para identificar cargo e versão do motor.
3. Criar entitlement V2 por `offering_id`, sem converter automaticamente `contest_entitlements`.
4. Criar repositório V2 com escopo `user_id + offering_id`.
5. Manter o `ProgressRepository` atual como adapter legado.
6. Fazer o registry escolher o motor antes de criar qualquer sessão acadêmica.
7. Não carregar microconhecimentos no IndexedDB legado da PC AL.
8. Não executar rollup V2 sobre registros históricos da PC AL.

## Arquivos que não devem receber lógica V2 diretamente

- `app/js/core/mastery.js`;
- `app/js/core/ssot.js`;
- `app/js/core/questionSelection.js`;
- `app/js/core/reviewQueue.js`.

Esses arquivos constituem o comportamento legado. O V2 deve viver em módulos novos, compartilhando apenas utilidades neutras.

## Pontos mínimos de integração futura

- `app/js/app.js`: resolver contexto da oferta e engine.
- `app/js/contest/contestRuntime.js`: guardar contexto versionado, sem remover compatibilidade.
- `app/js/services/contestContentService.js`: validar campos de oferta/posição/engine no pacote.
- `app/js/core/seed.js`: encaminhar pacote V2 ao bootstrap V2; manter o caminho atual intacto.
- UI de estudo/batalha: escolher controller legado ou V2.

Cada ponto deve possuir teste explícito confirmando que PC AL continua percorrendo o caminho antigo.

## Matriz de risco

| Risco | Consequência | Mitigação obrigatória |
| --- | --- | --- |
| Alterar chave do IndexedDB atual | Perda/aparente desaparecimento do progresso | Repositório V2 separado; nenhuma renomeação |
| Acrescentar `position_id` às PKs existentes | Conflito de migration e duplicação | Novas tabelas V2 |
| Trocar fórmula de domínio global | Mudança retroativa da PC AL | Adapter legado congelado |
| Normalizar questões PC AL para schema V2 | Questões deixam de ser elegíveis ou mudam significado | Schema registry por versão |
| Reutilizar entitlement por concurso para cargos | Acesso indevido a outro cargo | Entitlement V2 por offering |
| Carregar PC BA pelo `buildDynamicSeedEntities` atual | Fragmentos/microconhecimentos são descartados | Bootstrap V2 próprio |
| Usar `isQuestionEligible` atual no V2 | Conteúdo pendente pode passar pelo gate local | Policy V2 estrita |
| Misturar reviewQueue legado e V2 | Revisão cruzada e perda de contexto | Agenda V2 por microconhecimento/oferta |

## Regressões obrigatórias

- Toda a suíte atual deve permanecer verde.
- PC AL continua com 137 subtópicos e 6.480 questões.
- Login, biblioteca, checkout, webhook e entitlement continuam inalterados.
- Sessão PC AL continua usando 10 questões de um subtópico.
- Melhor domínio monotônico da PC AL continua igual.
- Revisão legada continua por questão e concurso.
- Nenhum registro PC AL ganha `microknowledge_id` automaticamente.
- Ativar PC BA não altera DB, cache, pacote ou contexto ativo da PC AL.
- Domínio de Investigador não aparece em Escrivão ou Delegado.

## Gate de segurança

Nenhuma fase V2 pode avançar se exigir mudança sem compatibilidade no contrato atual da PC AL. Nesse caso, a fase deve ser redesenhada com adapter ou nova estrutura.
