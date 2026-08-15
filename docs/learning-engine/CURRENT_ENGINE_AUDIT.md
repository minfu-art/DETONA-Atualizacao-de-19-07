# CURRENT_ENGINE_AUDIT

## Escopo e conclusão

Auditoria somente-leitura do motor acadêmico existente, realizada antes de qualquer implementação do `knowledge_engine_v2`.

O motor atual é funcional e possui persistência, domínio por subtópico, seleção com prioridade, revisão espaçada, explicações enriquecidas e testes comportamentais. Porém, ele não possui `fragment_id`, `microknowledge_id`, estado do aluno por microconhecimento, vínculo primário/secundário de questões ou agregação baseada nos 2.545 microconhecimentos da PC BA.

Portanto, as capacidades atuais são uma base reaproveitável, mas não comprovam ainda as promessas completas do novo motor.

## 1. Como respostas são registradas hoje

1. `createBattleSession` cria uma sessão de exatamente 10 questões de um único subtópico.
2. `answerQuestion` mantém, em memória, `questionId`, resposta, acerto e confiança.
3. `finalizeBattle` valida integralmente a sessão e usa um journal idempotente para concluir etapas sem duplicação.
4. `applyOfficialMasteryAttempt` persiste no registro do subtópico:
   - histórico de tentativas;
   - IDs respondidos, corretos e incorretos;
   - histórico por questão;
   - confiança registrada na tentativa;
   - melhor resultado e última tentativa.
5. Erros, baixa confiança e queda de resultado podem criar/atualizar itens na fila de revisão.

Evidências principais:

- `app/js/core/battle.js`: `answerQuestion`, `finalizeBattle`.
- `app/js/core/mastery.js`: `applyOfficialMasteryAttempt`.
- `app/js/services/reviewService.js`: `recordBattleReviewEvents`.
- `test/battle-finalization.test.js`: validação, idempotência, retomada e isolamento das gravações.

Limite: não existe evento de evidência por microconhecimento. A resposta é associada à questão e ao subtópico.

## 2. Como domínio é calculado hoje

O domínio oficial atual é o melhor percentual obtido em uma batalha completa de 10 questões do subtópico:

- `masteryFromAttempt`: `acertos / 10 * 100`;
- `applyOfficialMasteryAttempt`: preserva o maior percentual histórico;
- resultados inferiores não reduzem o domínio;
- disciplina: média simples de todos os subtópicos da disciplina;
- global: média simples de todos os subtópicos;
- `level`: piso do domínio global.

A conclusão integral do edital é outra métrica. `recalculateEditalSSOT` considera um item completo somente quando teoria, revisão e combate estão ativos.

Evidências:

- `app/js/core/mastery.js`: `masteryFromAttempt`, `subtopicMastery`, `disciplineMastery`, `globalMastery`.
- `app/js/core/ssot.js`: `getMasterySpheres`, `recalculateEditalSSOT`.
- `test/battle-finalization.test.js`.
- `test/ssot-memory.test.js`.

Limites:

- não mede domínio por microconhecimento;
- não pondera dificuldade, diversidade ou retenção no valor oficial;
- uma única batalha de 10 questões pode estabelecer domínio máximo do subtópico;
- o domínio é monotônico e não representa retenção atual;
- a memória é exibida separadamente e não reduz o melhor domínio.

## 3. Como questões são selecionadas hoje

Dentro de um subtópico já escolhido, `selectIntelligentQuestions` usa cinco faixas:

1. questão nunca respondida;
2. respondida há 30 dias ou mais;
3. questão com erro registrado;
4. respondida há 7 dias ou mais;
5. questão recente.

Empates usam aleatoriedade e ID. A missão diária escolhe primeiro subtópicos com memória mais fria e menos estrelas. Existe ainda preferência de apresentação para uma questão inédita DETONA.

Evidências:

- `app/js/core/questionSelection.js`.
- `app/js/core/battle.js`: `createBattleSession`, `pickDailyQuestions`.

Conclusão: há adaptação real, mas limitada ao histórico da questão e a sinais agregados do subtópico. Não existe seleção por estado granular de microconhecimento, pré-requisito, cobertura planejada ou diversidade pedagógica.

## 4. Como a revisão é agendada hoje

A fila é por questão e por concurso. Uma questão entra por:

- resposta incorreta;
- baixa confiança;
- queda do resultado da tentativa em relação à anterior.

O código vigente usa intervalos civis de `1, 6, 15 e 30 dias`. Acertos consecutivos avançam os estados de memória; erro retorna a memória para quente. A prioridade considera vencimento, erros, domínio do subtópico, dificuldade, ausência de revisão e erro recente.

Evidências:

- `app/js/core/reviewQueue.js`: `REVIEW_INTERVAL_DAYS`, `calculateNextReviewAt`, `calculateReviewPriority`.
- `app/js/services/reviewService.js`: criação, resposta e finalização da revisão.
- `test/intelligent-review-hardening.test.js`.

Limites:

- agenda a questão, não o microconhecimento;
- o domínio usado na prioridade é o domínio agregado do subtópico;
- a revisão atualiza memória e histórico, mas não recalcula domínio oficial;
- não há comprovação de retenção por microconhecimento.

Alerta documental: `docs/SISTEMA-INTELIGENTE-REVISAO.md` descreve intervalos e comportamento diferentes do código vigente. Para esta auditoria, o código e os testes foram considerados autoritativos.

## 5. Como o progresso é representado hoje

O estado local usa IndexedDB com banco separado por `user_id + contest_id`. As coleções relevantes são:

- `player`;
- `disciplines`;
- `subtopics`;
- `verticalized`;
- `questions`;
- `reviewQueue`;
- `studySessions`;
- `meta`.

O adapter híbrido sincroniza `progress_records` no Supabase e mantém espelhos tipados para jogador, subtópico e revisão. As chaves remotas também usam `user_id + contest_id`.

Evidências:

- `app/js/core/db.js`: `contestDatabaseName`, stores e índices.
- `app/js/repositories/progressRepository.js`: escopo fixo por usuário e concurso.
- `app/js/supabase/progressCloud.js`.
- `supabase/migrations/001_detona_schema.sql`.
- `test/academic-isolation.test.js`.

Limite crítico para PC BA: `position_id` e `offering_id` não fazem parte do escopo atual. Investigador, Escrivão e Delegado não podem compartilhar o mesmo contexto `pc_ba_2026` sem uma nova camada de isolamento.

## 6. Partes que já atendem à metodologia proposta

- Sessões e finalizações validadas antes da escrita.
- Journals idempotentes para batalha e revisão.
- Histórico por questão com acertos, erros, datas e confiança.
- Seleção que não é puramente aleatória.
- Revisão temporal real, priorização determinística e histórico preservado.
- Separação entre melhor domínio histórico e temperatura de memória.
- Explicações com campos enriquecidos e apresentação estruturada.
- Pacotes de conteúdo imutáveis e snapshots editoriais publicados.
- Fluxo editorial com aprovação antes do snapshot publicado.
- Isolamento comprovado entre usuários e concursos.
- Repositórios e funções puras que podem servir como portas/adapters.

## 7. Partes que são aproximações

- “Ponto fraco” significa hoje subtópico com baixa acurácia, atraso ou memória fria; não microconhecimento fraco.
- “Adaptação” prioriza questões e subtópicos, mas não otimiza a evolução do mapa de microconhecimentos.
- “Domínio” é o melhor resultado de uma batalha de 10 questões por subtópico.
- “Cobertura do edital” combina teoria, uma revisão e estrelas, não cobertura/evidência dos microconhecimentos.
- “Questão ensina” possui suporte de UI e campos editoriais, mas a completude da explicação não é garantida em todo o acervo.
- “Retenção” existe como fila/memória da questão, separada do domínio oficial.

## 8. Capacidades que ainda não existem

- Registry de versão do motor por oferta/curso.
- Contexto acadêmico com `position_id`/`offering_id`.
- Carregamento runtime de fragmentos e microconhecimentos.
- Estado individual do aluno por microconhecimento.
- Eventos de evidência imutáveis e auditáveis.
- Questão com alvo primário e alvos secundários de microconhecimento.
- Eligibility gate que considere aprovação editorial e normativa do microconhecimento.
- Domínio e retenção calculados por evidências granulares.
- Agregação microconhecimento → fragmento → subtópico → tópico → disciplina → curso.
- Seletor que use cobertura, fragilidade, revisão, pré-requisitos e diversidade de microconhecimento.
- Registro auditável de por que cada questão foi selecionada.
- Entitlement e progresso isolados por cargo/oferta.

## 9. Mudanças necessárias

As mudanças devem ser aditivas e versionadas:

1. introduzir identidade de oferta/cargo e `learning_engine_version`;
2. publicar o knowledge map como snapshot imutável do curso;
3. criar contratos V2 para questão, evidência, estado e decisão de seleção;
4. criar persistência V2 separada da persistência legada;
5. criar um registry que direcione PC AL ao adapter legado e PC BA ao V2;
6. criar gates editoriais/normativos no servidor e no runtime;
7. criar projeções e rollups explicáveis;
8. criar testes de comportamento e isolamento antes de integrar a UI.

## 10. Pontos que poderiam afetar PC AL

Arquivos de maior risco se alterados diretamente:

- `app/js/app.js`;
- `app/js/core/seed.js`;
- `app/js/core/db.js` e `app/js/core/types.js`;
- `app/js/core/battle.js`;
- `app/js/core/mastery.js`;
- `app/js/core/ssot.js`;
- `app/js/core/questionSchema.js`;
- `app/js/core/reviewQueue.js`;
- `app/js/services/reviewService.js`;
- `app/js/repositories/progressRepository.js`;
- `app/js/contest/activeContest.js`;
- `app/js/contest/contestRuntime.js`;
- `supabase/functions/student-content/index.ts`;
- tabelas atuais de entitlement e progresso.

Estratégia obrigatória: não reinterpretar dados existentes. Criar contratos, repositórios, tabelas e serviços V2 paralelos e adicionar somente um ponto de roteamento por versão do motor.

## Resultado da auditoria

O motor legado é real, testado e útil, mas não implementa a engenharia por microconhecimento. A implementação V2 pode começar de forma aditiva após aprovação do plano, com `legacy_subtopic_v1` fixado para PC AL e `knowledge_engine_v2` reservado à oferta PC BA Investigador.
