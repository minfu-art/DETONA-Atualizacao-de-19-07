# Relatório de validação do banco publicado

Snapshot validado em 21/07/2026 pelo comando `npm run validate:published-questions` em `app/`.

- índice: `app/data/questions/index.json`;
- arquivos de disciplina: 12;
- total declarado e carregado: 6.480;
- questões revisadas: 6.084;
- questões em revisão editorial: 396;
- IDs ausentes ou duplicados: 0;
- erros estruturais: 0;
- aliases editoriais legados resolvidos: 407 questões, distribuídas por 16 IDs de origem.

O mapeamento dos 16 IDs legados já existia no fluxo de importação e foi centralizado em `app/js/config/subtopicAliases.js`. O carregador de questões agora aplica o mesmo mapa em runtime. Nenhum texto, gabarito, status ou ID do banco foi modificado.

Observação editorial não bloqueante: o acervo consolidado de Português contém grupos de enunciados comparáveis provenientes de fontes diferentes. A presente sprint não apaga nem reescreve conteúdo; uma futura operação editorial deve revisar essas sobreposições antes de publicação comercial definitiva.
