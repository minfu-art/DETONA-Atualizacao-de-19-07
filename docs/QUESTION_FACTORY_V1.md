# DETONA Question Factory V1

A Question Factory transforma o mapa canônico de um curso em uma fila objetiva de produção de questões, com validação e publicação incremental no DETONA.

## Objetivo

O sistema não trabalha com a meta abstrata de “criar muitas questões”. Ele mede a cobertura de cada microconhecimento e produz contratos para reduzir as lacunas até a política de cobertura definida.

Fluxo:

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
PROMOÇÃO
      ↓
PATCH PUBLICADO
      ↓
DETONA
```

## O que é determinístico e o que usa Codex

### Determinístico

- leitura do pacote canônico;
- contagem de questões por microconhecimento;
- cálculo de cobertura e déficit;
- criação de IDs dos contratos e das questões;
- validação de schema e vínculos;
- bloqueio de IDs duplicados;
- bloqueio de enunciados exatamente duplicados após normalização;
- promoção do lote;
- criação do próximo patch estático;
- atualização do registro, versão, hash e contagem esperada.

### Codex

- interpretação editorial dos contratos;
- redação das questões;
- redação das explicações e distratores;
- auditoria semântica;
- detecção crítica de ambiguidade e duplicidade conceitual;
- correção das questões que falharem no QA.

A V1 não precisa chamar uma API de IA em runtime. A geração e a auditoria acontecem durante a sessão do Codex.

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

## Política de cobertura inicial

A política padrão usa três classes de complexidade:

- simples: 8 questões por microconhecimento;
- padrão: 12 questões por microconhecimento;
- complexo: 16 questões por microconhecimento.

A complexidade é estimada a partir da densidade do `edital-map.json`, ponderando regras, exceções, aplicações, competências e conhecimentos requeridos.

Esses números são uma política inicial, não uma verdade pedagógica imutável. A política fica fora do código em `scripts/question-factory/policies/default.json` e pode ser calibrada por banca, disciplina ou dados reais de desempenho em versões futuras.

A sequência cognitiva padrão distribui contratos entre:

1. conceito;
2. compreensão;
3. aplicação;
4. aplicação;
5. diferenciação;
6. caso concreto;
7. exceção;
8. integração.

A dificuldade também é distribuída para impedir que um microconhecimento seja coberto apenas por perguntas triviais.

## Comandos

### Diagnóstico

```bash
npm run qf:status -- --course pc-ba-2026-investigador
```

Retorna cobertura global e os microconhecimentos prioritários.

### Planejamento

```bash
npm run qf:plan -- --course pc-ba-2026-investigador --limit 100
```

Cria contratos determinísticos para as próximas 100 questões.

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

A publicação incremental é idempotente em relação aos IDs já existentes: se um lote tentar publicar uma questão cujo ID já esteja no runtime ou nos patches existentes, o processo falha em vez de duplicá-la.

## Auditoria semântica obrigatória

A validação estrutural não consegue decidir sozinha se uma alternativa é juridicamente defensável ou se duas questões são semanticamente equivalentes. Por isso, a publicação exige um segundo artefato de QA.

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
4. confere se a contagem real coincide com `expectedQuestionCount`;
5. recusa publicar se o estado anterior estiver inconsistente;
6. adiciona o novo patch;
7. incrementa a versão de dados;
8. atualiza `expectedQuestionCount` e `contentHash`.

Assim, falhas silenciosas ou publicação duplicada são bloqueadas.

## Limites da V1

- O algoritmo determinístico bloqueia duplicidade textual exata; duplicidade semântica é responsabilidade do QA do Codex.
- A política padrão é global. Políticas específicas por banca/disciplina ficam para evolução posterior.
- O `qf:publish` pressupõe um curso já registrado no carregador de pacotes estáticos. Cursos novos ainda precisam do provisionamento/publicação inicial do projeto.
- A V1 mede cobertura do banco, não garante aprovação individual do aluno. O Mastery Engine poderá usar desempenho real do aluno posteriormente para escolher questões e revisões.
