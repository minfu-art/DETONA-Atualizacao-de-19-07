# Plano incremental — Learning Engine V2

Este plano não autoriza implementação, migration remota, importação, deploy ou publicação.

## Fase 0 — congelar contratos legados

Entregas:

- caracterização formal de `legacy_subtopic_v1`;
- registry de versões somente em memória;
- fixtures que provem que PC AL resolve sempre para o adapter legado;
- decisão de identidade de `offering_id`.

Gate: nenhuma alteração observável na PC AL.

## Fase 1 — contratos puros V2

Criar módulos novos para:

- contexto da oferta;
- schema do knowledge map;
- schema da questão V2;
- eligibility policy;
- evento de evidência;
- estado do microconhecimento;
- códigos de motivo de seleção.

Sem banco e sem UI.

Testes:

- rejeição de IDs cruzados;
- rejeição de conteúdo pendente;
- alvo primário obrigatório;
- secundários deduplicados e pertencentes à mesma oferta;
- duas exceções penais aceitas com `subtopic_id: null`.

## Fase 2 — matriz de cobertura

Produzir o artefato editorial:

```text
microknowledge_id
→ objetivo de aprendizagem
→ competências
→ papéis de questão necessários
→ dificuldade planejada
→ quantidade/diversidade mínima
→ contrato de explicação
→ critérios de domínio
→ validações pendentes
```

Ainda sem gerar questões.

Gate: 2.545/2.545 microconhecimentos cobertos e pendências preservadas.

## Fase 3 — motor puro de evidência e domínio

Implementar funções determinísticas, sem persistência:

- aplicar evidência;
- projetar estado;
- separar melhor domínio e retenção atual;
- calcular próxima revisão;
- produzir rollups explicáveis.

Testes comportamentais obrigatórios:

- uma questão não domina um microconhecimento;
- repetição da mesma questão não simula diversidade;
- erros recorrentes reduzem estado atual;
- retenção vencida não apaga melhor domínio;
- secundário pesa menos que primário;
- ordem/retry de eventos idempotentes produz o mesmo estado.

## Fase 4 — seletor puro e auditável

Implementar candidatos, score, diversidade e decision log.

Testes:

- fraco recebe prioridade sobre dominado, quando elegível;
- review_due recebe prioridade temporal;
- nunca visto recebe cobertura controlada;
- pré-requisito bloqueia conteúdo avançado;
- repetição excessiva é penalizada;
- mesma entrada + seed produz decisão reproduzível;
- nenhum candidato pendente passa pelo gate.

## Fase 5 — persistência local experimental

Criar store/repositório V2 separado, sem converter stores existentes.

Possíveis novos arquivos:

- `app/js/learning-engine/engineRegistry.js`;
- `app/js/learning-engine/v2/contracts.js`;
- `app/js/learning-engine/v2/evidence.js`;
- `app/js/learning-engine/v2/masteryProjector.js`;
- `app/js/learning-engine/v2/retention.js`;
- `app/js/learning-engine/v2/selection.js`;
- `app/js/learning-engine/v2/rollup.js`;
- `app/js/repositories/learningV2Repository.js`;
- testes correspondentes.

Gate: PC BA funciona em modo experimental local; PC AL não grava nas stores V2.

## Fase 6 — persistência remota em staging

Somente após autorização separada:

- migrations aditivas;
- RLS e grants;
- operações idempotentes;
- isolamento por offering;
- auditoria de seleção e evidência;
- reconciliação local/nuvem.

Arquivos/tabelas previstos:

- nova migration V2;
- função protegida de conteúdo/estado V2;
- `course_offerings`;
- `offering_entitlements`;
- `learning_content_versions`;
- `learning_evidence_events`;
- `user_microknowledge_states`;
- `knowledge_review_schedule`;
- `learning_selection_decisions`.

Gate: testes RLS, concorrência, retry e isolamento Investigador/Escrivão/Delegado.

## Fase 7 — integração controlada da PC BA

- pacote PC BA declara `knowledge_engine_v2`;
- bootstrap consome mapa e matriz publicados;
- controller V2 cria sessão e feedback;
- UI apresenta apenas métricas explicáveis;
- feature flag restrita ao ambiente aprovado.

Gate: teste ponta a ponta sem entitlement real e sem publicação.

## Fase 8 — validação pedagógica

- validar fórmula com cenários simulados;
- revisar pesos e limiares;
- verificar falsos positivos de domínio;
- verificar excesso de repetição;
- auditar explicações e fontes;
- registrar versão da regra validada.

Somente depois desta fase uma capacidade pode sustentar promessa pública definitiva.

## Riscos gerais

- fórmula parecer precisa sem evidência suficiente;
- conteúdo normativo desatualizado entrar no pool;
- colisão de cargo por escopo apenas de concurso;
- crescimento excessivo dos logs de evidência;
- seleção criar ciclo e reduzir diversidade;
- rollup mascarar microconhecimentos sem evidência;
- diferença entre decisão local e remota;
- documentação divergir do código;
- mudança acidental da semântica da PC AL.

## Estratégias de mitigação

- contratos e testes antes de persistência;
- snapshots imutáveis e versionados;
- eventos idempotentes;
- projeções reconstruíveis;
- decisão de seleção auditável;
- gates editoriais/normativos duplos;
- adapters separados por engine;
- feature flag por oferta;
- PC AL como regressão bloqueante.

## Arquivos existentes que poderão precisar de integração futura

- `app/js/app.js`;
- `app/js/contest/contestRuntime.js`;
- `app/js/services/contestContentService.js`;
- `app/js/core/seed.js`;
- `app/js/core/types.js` e `app/js/core/db.js` apenas para adições compatíveis;
- `app/js/ui/battleArena.js` ou novo controller V2;
- `supabase/functions/student-content/index.ts`;
- migrations novas, nunca reescrita das antigas.

## Testes mínimos antes de produção

1. ponto fraco por microconhecimento;
2. adaptação determinística;
3. retenção e reconfirmação;
4. rollup explicável;
5. conteúdo pendente bloqueado;
6. questão sem alvo bloqueada;
7. retry idempotente;
8. concorrência entre dispositivos;
9. isolamento entre cargos;
10. isolamento entre usuários;
11. rollback de snapshot;
12. regressão integral da PC AL;
13. checkout e entitlement legado intactos;
14. nenhuma afirmação pública habilitada antes do status validado.

## Estado

Auditoria e arquitetura estão prontas para decisão. A implementação só deve iniciar com autorização explícita de uma fase por vez.
