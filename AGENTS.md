# DETONA — instruções operacionais para Codex

## Escopo

Estas regras valem para todo o repositório. Quando a tarefa mencionar fábrica de questões, banco de questões, mapa do conhecimento, cobertura curricular, contratos de questões ou publicação de questões, use o fluxo da **DETONA Question Factory**.

## Princípios obrigatórios

1. A IA de geração e auditoria é o próprio Codex durante a sessão de desenvolvimento. Não adicionar chamadas de OpenAI API, Gemini, Anthropic, DeepSeek ou outro provedor apenas para gerar/auditar questões, salvo pedido explícito do proprietário.
2. O pacote canônico de cada curso fica em `course-packages/<slug-do-curso>/`.
3. O mapa do conhecimento vem antes da produção. Cada questão deve estar vinculada a um `subtopic_id` e a pelo menos um `microknowledge_id` válido.
4. Não alterar nem reutilizar IDs de questões já publicadas.
5. Não inventar página, excerto, fonte, lei, jurisprudência ou rastreabilidade. Se a rastreabilidade exata não estiver disponível e o contrato permitir `trace_status: "missing"`, declarar a ausência e justificar em `note`.
6. Quantidade é consequência da cobertura e da necessidade pedagógica, nunca uma meta arbitrária.
7. Publicação exige duas barreiras: validação determinística e auditoria semântica aprovada.
8. JSON é o formato canônico e auditável, mas o proprietário não deve precisar baixar e reenviar JSON manualmente.
9. Trabalhos grandes devem ser executados em lotes controlados, preservando histórico, IDs e cobertura acumulada.

## Regra central: amplitude antes de profundidade

A política padrão é `coverage_first`.

Na Fase 1, use o piso:

- microconhecimento simples: 1 questão;
- microconhecimento padrão: 2 questões;
- microconhecimento complexo: 3 questões.

Enquanto existirem grandes lacunas de cobertura, não aprofundar assuntos já bem cobertos apenas para aumentar quantidade. O planejador deve espalhar contratos pelos microconhecimentos deficitários antes de criar novas camadas no mesmo microconhecimento.

A sequência inicial é:

1. conceito;
2. aplicação;
3. exceção;
4. caso concreto;
5. diferenciação;
6. integração;
7. compreensão.

Depois que o piso estiver atendido, a Fase 2 pode aprofundar seletivamente. A expansão precisa de evidência: peso/recorrência da banca, exceções relevantes, necessidade de aplicação/casos concretos, integração entre regras, dificuldade estratégica, erro dos alunos, baixa confiança, atualização normativa ou outro sinal pedagógico explícito.

**Nunca restaurar uma meta cega alta de questões por microconhecimento sem nova calibração e justificativa.**

## Fluxo padrão

### 1. Diagnosticar

```bash
npm run qf:status -- --course <slug-do-curso>
```

Leia a política ativa, o déficit total e as prioridades antes de gerar qualquer lote.

### 2. Planejar contratos

```bash
npm run qf:plan -- --course <slug-do-curso> --limit <quantidade>
```

O comando cria contratos em `course-packages/<slug>/factory/contracts/`. Cada contrato define `question_id` determinístico, microconhecimento, dimensão cognitiva, dificuldade e objetivo.

### 3. Gerar com Codex

Leia somente o recorte necessário de:

- contrato recém-criado;
- `course.json`;
- `curriculum.json`;
- `edital-map.json`;
- `microknowledge.json`;
- `sources.json` e fontes relevantes;
- questões existentes do mesmo microconhecimento/subtópico para evitar repetição.

Crie o lote em `course-packages/<slug>/factory/staging/<nome-do-lote>.json` no contrato canônico:

```json
{
  "name": "nome-do-lote",
  "questions": [
    {
      "id": "question_id_do_contrato",
      "subtopic_id": "...",
      "microknowledge_ids": ["..."],
      "statement": "...",
      "options": [
        { "label": "A", "text": "..." },
        { "label": "B", "text": "..." },
        { "label": "C", "text": "..." },
        { "label": "D", "text": "..." },
        { "label": "E", "text": "..." }
      ],
      "correct_answer": "C",
      "explanation": "...",
      "difficulty": "media",
      "format": "multipla_escolha",
      "source": null,
      "is_trick": false,
      "traces": []
    }
  ]
}
```

Use exatamente os `question_id` fornecidos pelos contratos.

## Regras editoriais mínimas

Cada questão deve:

- avaliar de fato o microconhecimento contratado;
- possuir uma única resposta defensável como correta;
- ter distratores plausíveis e inequivocamente incorretos;
- evitar pistas gramaticais ou de tamanho que denunciem o gabarito;
- evitar pegadinhas artificiais;
- respeitar o estilo da banca quando declarado no curso;
- ensinar na explicação o raciocínio decisivo da resposta;
- não extrapolar escopo oficial sem fonte complementar válida;
- não copiar nem parafrasear semanticamente questão já existente.

## 4. Validar deterministicamente

```bash
npm run qf:validate -- --course <slug-do-curso> --batch <arquivo-do-lote>
```

Corrigir qualquer erro antes de avançar.

## 5. Auditoria semântica independente

```bash
npm run qf:qa-template -- --course <slug-do-curso> --batch <arquivo-do-lote>
```

Uma questão só recebe `verdict: "APPROVED"` quando todos forem `true`:

- `single_correct_answer`
- `explanation_consistent`
- `within_scope`
- `distractors_plausible`
- `not_semantic_duplicate`

O lote só recebe `status: "APPROVED"` depois que todas as questões forem auditadas. Corrigir e reauditar qualquer falha.

## 6. Promover sem publicar

Quando o pedido for incorporar ao pacote canônico sem enviar ao app:

```bash
npm run qf:promote -- --course <slug-do-curso> --batch <arquivo-do-lote> --audit <arquivo-de-auditoria>
```

## 7. Publicar no DETONA

Somente quando o proprietário pedir explicitamente publicação/envio ao DETONA:

```bash
npm run qf:publish -- --course <slug-do-curso> --batch <arquivo-do-lote> --audit <arquivo-de-auditoria>
```

O comando promove o lote, cria o patch incremental, atualiza o registro estático, versão, hash e contagem esperada. Não pedir upload manual do JSON.

Depois da publicação, executar os testes e validações do repositório e corrigir regressões.

## Comandos naturais do proprietário

Quando ele disser algo equivalente a:

> Continue a produção do PC BA Investigador. Gere 100 questões priorizando as lacunas do mapa, audite, corrija e publique no DETONA.

interprete como:

1. `qf:status`;
2. `qf:plan --limit 100`;
3. geração conforme contratos;
4. `qf:validate`;
5. auditoria semântica;
6. correções e reauditoria;
7. `qf:publish` porque houve pedido explícito de publicação;
8. testes;
9. relatório final com quantidade gerada, corrigida/rejeitada, publicada e evolução da cobertura.

Se o proprietário pedir apenas “gere”, “continue” ou “prepare” sem pedir publicação, não executar `qf:publish` automaticamente.

## Cursos novos

O publicador incremental pressupõe runtime/registro estático já publicado. Para curso totalmente novo, execute primeiro o provisionamento/publicação inicial existente; depois use a Question Factory nos lotes incrementais.
