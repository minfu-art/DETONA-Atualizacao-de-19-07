# DETONA — instruções operacionais para Codex

## Escopo

Estas regras valem para todo o repositório. Quando a tarefa mencionar fábrica de questões, banco de questões, mapa do conhecimento, cobertura curricular, contratos de questões ou publicação de questões, use o fluxo da **DETONA Question Factory** abaixo.

## Princípios obrigatórios

1. A IA de geração e auditoria é o próprio Codex durante a sessão de desenvolvimento. Não adicionar chamadas de OpenAI API, Gemini, Anthropic, DeepSeek ou outro provedor apenas para gerar/auditar questões, salvo pedido explícito do proprietário.
2. O pacote canônico de cada curso fica em `course-packages/<slug-do-curso>/`.
3. O mapa do conhecimento vem antes da produção de questões. Nunca gerar um banco massivo sem vincular cada questão a `subtopic_id` e a pelo menos um `microknowledge_id` válido.
4. Não alterar nem reutilizar IDs de questões já publicadas.
5. Não inventar página, excerto, fonte, lei, jurisprudência ou rastreabilidade. Quando a fonte canônica existente admitir `trace_status: "missing"`, declarar a ausência e justificar em `note`; nunca fabricar evidência.
6. O objetivo da fábrica é reduzir lacunas de cobertura. Priorizar microconhecimentos com menor cobertura segundo a política configurada.
7. Quantidade de questões é consequência do mapa e da política de cobertura, não uma meta arbitrária.
8. Publicação exige duas barreiras: validação determinística e auditoria semântica aprovada.
9. JSON continua sendo o formato canônico e de auditoria, mas o proprietário não deve precisar fazer upload manual para o DETONA.
10. Trabalhos grandes devem ser executados em lotes controlados, preservando histórico, IDs e cobertura acumulada.

## Fluxo padrão da Question Factory

### 1. Ver estado do curso

```bash
npm run qf:status -- --course <slug-do-curso>
```

Leia as prioridades e as lacunas antes de planejar qualquer lote.

### 2. Planejar contratos

```bash
npm run qf:plan -- --course <slug-do-curso> --limit <quantidade>
```

O comando cria contratos em `course-packages/<slug>/factory/contracts/`. Cada contrato define um `question_id` determinístico, microconhecimento, dimensão cognitiva, dificuldade e objetivo.

### 3. Gerar o lote com Codex

Leia:

- o arquivo de contratos recém-criado;
- `course.json`;
- `curriculum.json` apenas no recorte necessário;
- `edital-map.json` apenas no recorte necessário;
- `microknowledge.json` apenas no recorte necessário;
- `sources.json` e as fontes relevantes;
- questões existentes próximas do mesmo microconhecimento para evitar repetição.

Crie o lote em `course-packages/<slug>/factory/staging/<nome-do-lote>.json` no contrato canônico já usado pelo DETONA:

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

Use exatamente os `question_id` fornecidos pelos contratos. Não criar IDs improvisados.

## Regras editoriais mínimas

Cada questão deve:

- avaliar o microconhecimento contratado, não apenas mencionar o assunto;
- possuir uma única resposta defensável como correta;
- ter distratores plausíveis, mas inequivocamente incorretos;
- evitar pistas gramaticais, tamanho desproporcional ou repetição de palavras que denunciem o gabarito;
- evitar negativas desnecessárias e pegadinhas artificiais;
- respeitar o estilo da banca quando o curso declarar uma banca;
- conter explicação suficiente para ensinar por que a correta está correta e por que o raciocínio decisivo exclui as demais;
- não extrapolar o escopo oficial sem marcação/fonte complementar válida;
- não copiar questão existente nem produzir paráfrase semanticamente equivalente.

## 4. Validação determinística

```bash
npm run qf:validate -- --course <slug-do-curso> --batch <arquivo-do-lote>
```

Se falhar, corrigir antes de continuar.

## 5. Auditoria semântica independente

Crie o template:

```bash
npm run qf:qa-template -- --course <slug-do-curso> --batch <arquivo-do-lote>
```

Audite cada questão novamente, de forma crítica, preenchendo o arquivo de QA. Uma questão só recebe `verdict: "APPROVED"` quando todos os seguintes campos forem `true`:

- `single_correct_answer`
- `explanation_consistent`
- `within_scope`
- `distractors_plausible`
- `not_semantic_duplicate`

Depois de revisar todas as questões, marque o lote como `status: "APPROVED"`. Se uma questão falhar, corrija-a e reaudite antes de aprovar o lote.

## 6. Promover sem publicar

Quando o pedido for produzir e incorporar ao pacote canônico, mas **não** publicar no app:

```bash
npm run qf:promote -- --course <slug-do-curso> --batch <arquivo-do-lote> --audit <arquivo-de-auditoria>
```

## 7. Publicar diretamente no DETONA

Somente quando o proprietário pedir explicitamente para publicar/enviar ao DETONA:

```bash
npm run qf:publish -- --course <slug-do-curso> --batch <arquivo-do-lote> --audit <arquivo-de-auditoria>
```

O comando promove o lote, cria o próximo patch incremental em `app/data/course-factory/published/`, registra o patch no carregador estático do curso, atualiza versão, hash e contagem esperada. Não pedir ao proprietário para baixar e reenviar JSON manualmente.

Após publicar, execute:

```bash
npm test
npm run check:syntax
```

Corrija regressões antes de encerrar a tarefa.

## Comandos naturais do proprietário

Quando ele disser algo equivalente a:

> Continue a produção do PC BA Investigador. Gere 100 questões priorizando as lacunas do mapa, audite, corrija e publique no DETONA.

interprete como:

1. `qf:status`;
2. `qf:plan` com o limite solicitado;
3. geração do lote pelos contratos;
4. `qf:validate`;
5. auditoria semântica independente;
6. correções necessárias;
7. `qf:publish`;
8. testes e relatório final com quantidade produzida, rejeitada/corrigida, publicada e evolução da cobertura.

## Cursos novos

O publicador incremental pressupõe que o curso já possua runtime/registro estático publicado. Para um curso totalmente novo, execute primeiro o provisionamento/publicação inicial existente no projeto; depois use a Question Factory para os lotes incrementais.
