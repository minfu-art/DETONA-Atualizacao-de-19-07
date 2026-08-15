# Learning Engine V2 — arquitetura proposta

## 1. Objetivo

Criar um motor genérico, orientado por dados, em que a PC BA Investigador seja a primeira configuração de curso, sem código especial para `pc_ba_2026`.

Separação central:

```text
DETONA LEARNING ENGINE
+ definição versionada do curso
+ mapa de conhecimentos versionado
+ banco editorial de questões versionado
+ estado/evidências do aluno
```

## 2. Versionamento obrigatório

Cada oferta deve declarar:

```text
offering_id
contest_id
position_id
learning_engine_version
knowledge_map_version
question_schema_version
```

Valores iniciais propostos:

- PC AL: `legacy_subtopic_v1`;
- PC BA Investigador: `knowledge_engine_v2`.

O nome pode mudar antes da implementação, mas a separação não pode ser removida.

## 3. Contexto acadêmico

O contexto mínimo de toda operação V2 será:

```text
user_id
offering_id
contest_id
position_id
learning_engine_version
```

`offering_id` deve ser a identidade operacional primária. `contest_id` e `position_id` permanecem explícitos para validação e auditoria.

Nenhuma função V2 deve consultar ou gravar estado aceitando apenas `user_id + contest_id`.

## 4. Dados imutáveis do curso

Artefatos publicados como snapshot e protegidos por hash:

- currículo canônico;
- fragment bindings;
- knowledge map;
- matriz de cobertura;
- versão de questões;
- configuração pedagógica do motor.

Entidades conceituais:

```text
course_offering
learning_content_version
knowledge_fragment
microknowledge
microknowledge_prerequisite
question_knowledge_target
```

`question_knowledge_target` deve guardar:

- um `primary_microknowledge_id` obrigatório;
- zero ou mais `secondary_microknowledge_id`;
- papel do vínculo;
- peso máximo permitido para evidência secundária.

## 5. Conteúdo elegível

Uma questão V2 só pode chegar ao aluno quando todos os gates passarem:

1. oferta ativa e entitlement válido;
2. snapshot publicado e hash válido;
3. questão aprovada e publicada;
4. microconhecimento aprovado para geração/entrega;
5. validação normativa e dinâmica compatível com a data do snapshot;
6. alvo primário pertencente à mesma oferta/posição;
7. explicação pedagógica mínima válida.

Falha em qualquer gate torna a questão inelegível. Não usar fallback que transforme pendência editorial em conteúdo definitivo.

## 6. Evidência do aluno

Cada resposta cria um evento imutável e idempotente:

```text
learning_evidence_event
  event_id
  user_id
  offering_id
  position_id
  attempt_id
  question_id
  microknowledge_id
  target_role: primary | secondary
  correct
  confidence
  difficulty
  pedagogical_role
  response_time_ms
  occurred_at
  content_version
```

O evento registra fatos. O domínio é uma projeção derivada e reconstruível.

## 7. Estado por microconhecimento

Projeção conceitual:

```text
user_microknowledge_state
  user_id
  offering_id
  microknowledge_id
  lifecycle_state
  evidence_count
  correct_count
  incorrect_count
  distinct_question_count
  current_mastery_score
  best_mastery_score
  current_retention_score
  last_exposed_at
  last_confirmed_at
  next_review_at
  recurring_error_count
  state_version
```

Estados de ciclo de vida:

```text
not_started → exposed → learning → mastered
                    ↘ weak
mastered → review_due → learning/mastered
```

Estado, domínio e retenção são conceitos relacionados, mas não equivalentes.

## 8. Cálculo de domínio

A primeira versão da fórmula será configurável e versionada. Ela deve comportar:

- quantidade de evidências;
- questões distintas;
- acertos e erros;
- dificuldade;
- papel pedagógico;
- intervalo entre exposições;
- retenção posterior;
- reincidência de erro;
- confiança;
- peso reduzido para alvo secundário.

Regras invariantes:

- uma única questão não concede domínio;
- repetição da mesma questão não equivale a diversidade;
- melhor domínio histórico não é apagado;
- retenção atual pode cair e exigir reconfirmação;
- toda transição registra versão da regra e evidências usadas.

## 9. Agregação explicável

O rollup deve seguir os bindings publicados:

```text
microknowledge
→ fragment
→ subtopic (ou topic nos dois casos penais documentados)
→ topic
→ discipline
→ position/offering
```

Cada percentual deve retornar também:

- versão do mapa;
- total de unidades elegíveis;
- unidades sem evidência;
- unidades em aprendizagem, fracas, vencidas e dominadas;
- lista das contribuições inferiores.

Não persistir percentuais independentes sem vínculo com a árvore.

## 10. Seleção de questões

Pipeline V2:

```text
resolver contexto e versão
→ aplicar eligibility gates
→ carregar estados e revisões
→ construir candidatos
→ pontuar necessidades pedagógicas
→ aplicar diversidade e repetição
→ selecionar
→ registrar decision log
```

Fatores de prioridade:

- revisão vencida;
- microconhecimento fraco;
- nunca exposto;
- cobertura insuficiente;
- erro recorrente;
- retenção não confirmada;
- dificuldade adequada;
- pré-requisitos;
- diversidade de pergunta e papel pedagógico;
- penalidade de repetição.

Toda decisão deve produzir `selection_reason_codes` e os componentes do score.

## 11. Explicação pedagógica

Contrato mínimo V2:

```text
correct_answer
core_explanation
rule_or_basis
reasoning_steps
wrong_option_analysis
detected_misconception
learning_takeaway
related_microknowledge_ids
references
editorial_status
normative_status
```

Campos podem variar por formato, mas `core_explanation`, fundamento e aprendizagem extraída não podem ser substituídos por “alternativa C”.

## 12. Componentes de software

Novos componentes, sem hardcode do curso:

- `LearningEngineRegistry`;
- `LegacySubtopicEngineAdapter`;
- `KnowledgeEngineV2`;
- `CourseOfferingContext`;
- `KnowledgeContentRepository`;
- `LearningEvidenceRepository`;
- `MicroknowledgeStateProjector`;
- `RetentionSchedulerV2`;
- `QuestionEligibilityPolicyV2`;
- `QuestionSelectionPolicyV2`;
- `KnowledgeRollupService`;
- `SelectionDecisionRepository`.

O app pergunta ao registry qual motor pertence à oferta. O legado continua chamando as funções atuais; o V2 usa os novos contratos.

## 13. Persistência aditiva

Não alterar semanticamente tabelas atuais. Planejar novas estruturas versionadas, por exemplo:

- `course_offerings`;
- `offering_entitlements`;
- `learning_content_versions`;
- `learning_microknowledges`;
- `question_knowledge_targets`;
- `learning_evidence_events`;
- `user_microknowledge_states`;
- `knowledge_review_schedule`;
- `learning_selection_decisions`.

RLS deve exigir `auth.uid() = user_id`; conteúdo publicado é lido por função protegida; escritas pedagógicas devem ser validadas no servidor ou sincronizadas por contrato idempotente.

## 14. Observabilidade e veracidade

Cada capacidade terá estado interno:

```text
designed | experimental | validated | production
```

Uma promessa pública só pode usar capacidade `validated` ou `production`, vinculada a testes e versão do motor. Logs não devem conter gabaritos antes da resposta, dados sensíveis ou conteúdo integral desnecessário.
