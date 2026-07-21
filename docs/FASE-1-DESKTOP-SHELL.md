# Fase 1 — Desktop Shell

## Objetivo

Esta fase adiciona uma infraestrutura visual responsiva ao DETONA CONCURSOS sem migrar a interface para React, alterar regras de negócio ou substituir a experiência móvel existente.

## Escopo implementado

- shell global com menu lateral e cabeçalho superior;
- menu compacto para tablet e completo para desktop;
- navegação inferior preservada em celulares;
- componentes visuais reutilizáveis em JavaScript puro;
- demonstração do layout desktop nas telas Início, Perfil e Grimório;
- foco visível, navegação por teclado e nomes acessíveis nos controles de navegação;
- proteção contra rolagem horizontal acidental;
- cache PWA atualizado para incluir o módulo do shell.

Nenhuma regra de XP, nível, memória, batalha, SSOT, IndexedDB, Kafra ou banco de questões foi modificada.

## Componentes reutilizáveis

O módulo `app/js/ui/appShell.js` fornece:

- `initAppShell`: monta sidebar e topbar e conecta a navegação existente;
- `updateAppShell`: sincroniza tela ativa e resumo do jogador;
- `mountPageContainer`: envolve o conteúdo de uma página sem alterar seus eventos;
- `sectionHeader`: cabeçalho padronizado de seção;
- `statsPanel`: painel resumido de indicadores;
- `desktopGrid`: grade reutilizável de duas ou três colunas.

## Breakpoints

| Faixa | Comportamento |
| --- | --- |
| menor que 768 px | fluxo móvel original e navegação inferior |
| 768 a 1023 px | sidebar compacta de 80 px, topbar e conteúdo adaptável |
| 1024 a 1439 px | sidebar completa de 240 px e área útil ampliada |
| 1440 px ou mais | sidebar de 264 px e conteúdo interno de até 1500 px |

As telas de onboarding e celebração continuam em modo imersivo, sem sidebar ou topbar.

## Navegação desktop

O menu contém Início, Mapa, Batalha, Grimório, Edital, Rotina, Bem-estar e Perfil. A entrada Edital usa a visualização atual do Grimório nesta fase, evitando introduzir uma tela ou regra nova.

## Telas demonstrativas

- **Início:** page container e grades existentes ampliadas para uso em desktop.
- **Perfil:** cabeçalho, painel de indicadores e cartões organizados em duas colunas.
- **Grimório:** cabeçalho, indicadores de conclusão e lista preservada.

As demais rotas são renderizadas normalmente dentro da área central do shell, mantendo seu layout anterior.

## Acessibilidade

- botões das navegações móvel e desktop possuem `aria-label`;
- sidebar informa a página corrente com `aria-current`;
- o conteúdo principal recebe foco após a navegação;
- controles interativos apresentam foco visível;
- todos os itens do shell são alcançáveis por teclado.

## Validação

Antes da entrega devem ser executados:

1. `npm.cmd test`;
2. validação de sintaxe dos arquivos JavaScript modificados;
3. inspeção responsiva em 390 px, 768 px, 1024 px e 1440 px;
4. verificação de ausência de rolagem horizontal.

## Trabalho futuro (fora desta fase)

- otimizar individualmente Mapa, Batalha, Forja/Questões, Rotina e Bem-estar para desktop;
- decidir uma experiência própria para a entrada Edital;
- adicionar controle manual para recolher a sidebar;
- revisar densidade e hierarquia dos cartões internos em telas largas;
- criar testes de interface e acessibilidade em navegador.
