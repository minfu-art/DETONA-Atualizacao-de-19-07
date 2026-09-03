# Banco comentado PC PE — instruções de revisão e importação

Esta pasta contém a extração dos materiais fornecidos para o curso PC PE 2027. Todos os registros são rascunhos e permanecem bloqueados para publicação.

## Conteúdo

- `publication-ready-batches/`: quatro lotes tecnicamente completos, com 692 questões.
- `review/needs-review.json`: 350 questões que exigem correção ou classificação humana.
- `review/review-queue.csv`: fila compacta para revisão no Excel, com sugestão de mapa, confiança e páginas de origem.
- `coverage.json`: distribuição por subtópico do mapa do curso.
- `extraction-manifest.json`: rastreabilidade por PDF e página de origem.
- `audit-report.json`: resultado da auditoria estrutural automatizada.
- `../course-bundle/assets/question-references/`: 23 imagens, tabelas, gráficos e diagramas vinculados por `reference_image`.

## Formato Detona

Cada questão traz `contest_id`, `subtopic_id`, enunciado, alternativas, gabarito, comentário, fonte, formato e metadados de rastreabilidade. Textos-base usam `reference_text`; recursos visuais usam `reference_image`.

## Portões obrigatórios antes da publicação

1. Revisar conteúdo, atualidade normativa, gabarito e comentário.
2. Resolver os motivos listados em `metadata.review_reasons` para a fila de revisão.
3. Confirmar os direitos de uso do material de origem.
4. Copiar os recursos visuais para o diretório público definitivo e validar suas URLs.
5. Somente então alterar `editorial_review`, `publication_authorized` e promover pelo fluxo oficial da fábrica de questões.

Não importar diretamente a fila `review/` e não publicar nenhum lote enquanto `publication_authorized` estiver como `false`.
