# Sistema Inteligente de Revisão

## Resultado

O DETONA CONCURSOS agora possui uma fila adaptativa de revisão isolada por usuário e concurso. A revisão atualiza histórico, memória, agendamento e estatísticas, mas não concede XP, não altera LV e não modifica o domínio oficial dos subtópicos.

## A. Arquivos criados

- `app/js/core/reviewQueue.js`: regras puras de memória, agendamento, prioridade, migração e seleção.
- `app/js/services/reviewService.js`: persistência, integração com batalhas, sessões e painel.
- `app/js/ui/review.js`: sessão e resultado da revisão.
- `app/tests/review-queue.test.js`: cenários obrigatórios da revisão.
- `docs/SISTEMA-INTELIGENTE-REVISAO.md`: relatório desta etapa.

## B. Arquivos alterados

- `app/js/core/types.js`, `db.js`, `backupSchema.js`, `seed.js` e `battle.js`.
- `app/js/services/contestDataMigrationService.js` e `legacyDataMigrationService.js`.
- `app/js/ui/home.js`, `battleArena.js` e `app/js/app.js`.
- `app/css/design-system.css` e `app/sw.js`.
- Testes de backup e de contratos da interface.

## C. Regra de agendamento

Intervalos-base: primeiro erro em 1 dia; erro recorrente em 6 horas; acertos consecutivos em 3, 7, 15, 30 e 60 dias. A função pura reduz ou amplia o intervalo conforme dificuldade, domínio do subtópico, recorrência de erros e atraso desde a última interação. O limite mínimo é de 3 horas após erro e 1 dia após acerto.

Estados: erro ou instabilidade deixa a memória quente; primeiro acerto após erro muda para morna; do segundo ao quarto acerto fica fria; no quinto acerto consecutivo fica congelada. Um novo erro reaquece o item sem apagar seu histórico.

## D. Regra de prioridade

O score é determinístico. Itens vencidos recebem o maior peso, seguidos por recorrência de erros, baixo domínio, dificuldade, ausência de revisão após erro, proximidade do vencimento e erro recente. A sessão ordena por vencimento, score, quantidade de erros, menor domínio e maior tempo sem revisão.

## E. Migração aplicada

O IndexedDB passou à versão 3 e ganhou a coleção `reviewQueue`, com chave única por questão dentro do banco isolado do usuário e concurso. IDs antigos de revisão e erro são convertidos uma única vez, preservando datas disponíveis e contagens conhecidas. Itens migrados ficam quentes, com origem `migration`; histórico inexistente não é inventado. Backups anteriores continuam aceitos e a fila passou a integrar novos backups.

## F. Alterações de interface

- Opção de baixa confiança durante o desafio.
- Cartão compacto no painel com pendentes, vencidas, próxima revisão, subtópicos frágeis e memória em risco.
- Sessão própria com até 10 questões, explicação imediata e estado atual da memória.
- Resultado com revisadas, acertos, erros, memória fortalecida, transições, itens quentes e próxima revisão.
- Nenhuma informação de XP na revisão.

## G. Resultado dos testes

- 111 testes automatizados aprovados.
- 73 arquivos JavaScript validados sintaticamente.
- Todos os imports relativos verificados.
- Migração, seleção de 10, erro recorrente, progressão quente → morna → fria → congelada e reativação cobertos.
- Fluxo real validado no navegador: desafio, fila com 10 itens, painel, sessão com 10 questões e resultado; nenhum erro de console.
- Banco editorial mantido: 1.162 questões, 1.156 válidas e as mesmas 6 questões já sinalizadas para revisão editorial.

## H. Riscos restantes

- Dados antigos que guardavam apenas IDs não permitem reconstruir interações ou datas inexistentes; a migração preserva somente o que estava disponível.
- Dificuldade ausente usa o valor médio, sem inferência editorial.
- Os pesos de agendamento e prioridade são uma calibração inicial e podem ser ajustados futuramente com dados reais, mantendo as funções centrais testáveis.
