# DETONA Question Factory V1

A Question Factory transforma o mapa canônico de um curso em uma fila objetiva de produção de questões, com validação, auditoria semântica e publicação incremental no DETONA.

## Objetivo

O sistema não trabalha com a meta abstrata de “criar muitas questões”. Ele mede a cobertura de cada microconhecimento e produz contratos para reduzir lacunas reais do mapa.

```text
EDITAL / FONTES
      ↓
CURRÍCULO CANÔNICO
      ↓
MAPA DO EDITAL
      ↓
MICROCONHECIMENTOS
      ↓
COVERAGE ENGINE
      ↓
CONTRATOS DE QUESTÕES
      ↓
CODEX REDATOR
      ↓
VALIDAÇÃO DETERMINÍSTICA
      ↓
CODEX AUDITOR
      ↓
PROMOÇÃO / PUBLICAÇÃO
      ↓
DETONA
```

## Estratégia em duas fases

### Fase 1 — cobertura do edital

A política padrão é `coverage_first`. O objetivo é impedir que o banco fique muito profundo em alguns assuntos enquanto milhares de microconhecimentos continuam sem nenhuma questão.

Piso mínimo por complexidade:

- simples: **1** questão;
- padrão: **2** questões;
- complexo: **3** questões.

A complexidade é estimada a partir da densidade do `edital-map.json`, ponderando regras, exceções, aplicações, competências e conhecimentos requeridos.

A sequência cognitiva inicial é:

1. conceito;
2. aplicação;
3. exceção;
4. caso concreto;
5. diferenciação;
6. integração;
7. compreensão.

Como a Fase 1 trabalha com metas 1/2/3, um microconhecimento simples recebe primeiro uma questão conceitual; um padrão recebe conceito + aplicação; e um complexo recebe conceito + aplicação + exceção.

O planejador distribui primeiro um contrato por microconhecimento deficitário antes de criar o segundo contrato do mesmo microconhecimento. Assim, amplitude vem antes de profundidade.

### Fase 2 — profundidade orientada por evidência

Depois de atingir o piso de cobertura, o banco pode crescer seletivamente. A expansão não deve voltar a uma regra cega de “N questões por microconhecimento”. Deve ser justificada por sinais como:

- peso ou recorrência da banca;
- quantidade e importância de exceções;
- necessidade de casos concretos e integração entre regras;
- relevância estratégica da disciplina/subtópico;
- taxa de erro, confiança e desempenho real dos alunos;
- necessidade de itens de maior dificuldade;
- atualização normativa ou jurisprudencial.

## Calibração com o PC BA Investigador

A primeira proposta experimental usava metas 8/12/16. Rodada sobre o pacote real do PC BA Investigador, essa política exigiria **24.132 créditos de questão**, com **22.855 ainda faltantes**. O diagnóstico mostrou que esse volume vinha da multiplicação artificial da meta por 2.527 microconhecimentos, e não de uma necessidade pedagógica demonstrada.

A política foi recalibrada para 1/2/3.

Diagnóstico real da Fase 1 após a calibração:

- microconhecimentos: **2.527**;
- piso total requerido: **3.506 créditos de questão**;
- créditos já existentes: **519**;
- déficit atual: **2.987**;
- microconhecimentos já completos no piso: **414**;
- microconhecimentos ainda incompletos: **2.113**;
- cobertura de microconhecimentos completos: **16,38%**;
- cobertura ponderada por créditos de questão: **14,80%**.

Esses números medem o piso de cobertura do mapa, não a quantidade final definitiva do banco. A Fase 2 poderá ampliar seletivamente o conteúdo com base em evidência.

## O que é determinístico e o que usa Codex

### Determinístico

- leitura do pacote canônico;
- contagem de questões por microconhecimento;
- cálculo de cobertura e déficit;
- classificação inicial de complexidade;
- criação de IDs dos contratos e das questões;
- validação de schema e vínculos;
- bloqueio de IDs duplicados;
- bloqueio de enunciados textualmente duplicados após normalização;
- promoção do lote;
- criação do próximo patch estático;
- atualização do registro, versão, hash e contagem esperada.

### Codex

- interpretação editorial dos contratos;
- redação das questões, explicações e distratores;
- auditoria semântica;
- detecção crítica de ambiguidade e duplicidade conceitual;
- correção dos itens que falharem no QA.

A V1 não adiciona chamada de API de IA em runtime. A geração e a auditoria acontecem durante a sessão do Codex.

## Estrutura

```text
scripts/question-factory/
├── cli.mjs
├── core.mjs
├── publish.mjs
└── policies/
    └── default.json

course-packages/<curso>/
├── course.json
├── curriculum.json
├── edital-map.json
├── microknowledge.json
├── sources.json
├── questions/
└── factory/
    ├── contracts/
    ├── staging/
    └── qa/
```

## Comandos

### Diagnóstico

```bash
npm run qf:status -- --course pc-ba-2026-investigador
```

Retorna a política ativa, cobertura global e microconhecimentos prioritários.

### Planejamento

```bash
npm run qf:plan -- --course pc-ba-2026-investigador --limit 100
```

Cria contratos determinísticos para até 100 novas questões, priorizando lacunas de cobertura.

Uma política alternativa pode ser fornecida explicitamente:

```bash
npm run qf:plan -- --course pc-ba-2026-investigador --limit 100 --policy caminho/politica.json
```

### Validar lote gerado

```bash
npm run qf:validate -- \
  --course pc-ba-2026-investigador \
  --batch course-packages/pc-ba-2026-investigador/factory/staging/lote-001.json
```

### Criar template de auditoria

```bash
npm run qf:qa-template -- \
  --course pc-ba-2026-investigador \
  --batch course-packages/pc-ba-2026-investigador/factory/staging/lote-001.json
```

### Promover sem publicar

```bash
npm run qf:promote -- \
  --course pc-ba-2026-investigador \
  --batch course-packages/pc-ba-2026-investigador/factory/staging/lote-001.json \
  --audit course-packages/pc-ba-2026-investigador/factory/qa/lote-001.audit.json
```

### Publicar no DETONA

```bash
npm run qf:publish -- \
  --course pc-ba-2026-investigador \
  --batch course-packages/pc-ba-2026-investigador/factory/staging/lote-001.json \
  --audit course-packages/pc-ba-2026-investigador/factory/qa/lote-001.audit.json
```

A publicação incremental falha se um lote tentar reutilizar ID já existente no runtime ou nos patches publicados.

## Auditoria semântica obrigatória

Cada questão precisa ser aprovada nos cinco critérios:

```json
{
  "single_correct_answer": true,
  "explanation_consistent": true,
  "within_scope": true,
  "distractors_plausible": true,
  "not_semantic_duplicate": true
}
```

O lote só é promovido/publicado quando todas as questões e o próprio lote estiverem marcados como `APPROVED`.

## Segurança de publicação

Antes de criar um novo patch, o publicador:

1. lê o runtime-base;
2. lê todos os patches já publicados;
3. verifica duplicidade de IDs;
4. confere a contagem real com `expectedQuestionCount`;
5. recusa publicar se o estado anterior estiver inconsistente;
6. adiciona o novo patch;
7. incrementa a versão de dados;
8. atualiza `expectedQuestionCount` e `contentHash`.

## Limites da V1

- Duplicidade semântica continua sendo responsabilidade do QA do Codex; o algoritmo determinístico bloqueia duplicidade textual normalizada.
- A classificação de complexidade é uma heurística inicial e deve evoluir com dados reais.
- A Fase 2 ainda não possui um motor automático de ponderação por banca/desempenho; a expansão profunda deve ser explicitamente justificada.
- `qf:publish` pressupõe um curso já registrado no carregador de pacotes estáticos. Cursos novos ainda precisam do provisionamento/publicação inicial.
- A fábrica mede cobertura do banco; o Mastery Engine do aluno continua sendo uma camada separada de personalização.
