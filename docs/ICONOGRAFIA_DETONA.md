# Iconografia DETONA CONCURSOS

## Objetivo

Os ícones orientam ações e estados. Eles não substituem rótulos, não funcionam como decoração gratuita e não devem competir com o conteúdo de estudo.

## Linguagem visual

- Grade: `24 × 24` para o glifo, renderização padrão entre `14 px` e `36 px`.
- Traço: `1.75 px`, pontas e junções arredondadas.
- Cantos: arredondados e compactos, coerentes com os cartões do design system.
- Ícones de área: placa escura chanfrada, duotone e um único acento de cor.
- Ícones utilitários: sem placa, sem brilho e com o mesmo peso de traço.
- Movimento: somente resposta curta em `hover/active`; respeita `prefers-reduced-motion`.
- Cor não comunica estado sozinha: ícone sempre acompanha texto, número ou `aria-label`.
- Estrelas são reservadas à métrica de domínio. Não usar estrela como marcador genérico.
- Emojis de sistema não são permitidos em navegação, métricas, estados ou botões.

## Categorias oficiais

| Significado | Categoria semântica | Glifo oficial | Tom |
|---|---|---|---|
| Estudo | `study` | livro | dados/ciano |
| Revisão | `review` | setas circulares | dados/ciano |
| Progresso | `progress` | gráfico ascendente | dados/ciano |
| Plano | `plan` | prancheta | dados/ciano |
| Evolução | `evolution` | broto | sucesso/verde |
| Disciplina | `discipline` | camadas | dados/ciano |
| Meta | `goal` | alvo | atenção/vermelho |
| Fogo/constância | `fire` | chama | energia/laranja |
| Foco | `focus` | mira temporal | energia/laranja |
| Alerta | `alert` | triângulo | perigo/vermelho |
| Conquista | `achievement` | troféu | ouro |
| Prova | `exam` | bandeira | ouro |

O mapa fica centralizado em `SEMANTIC_ICONS`, no arquivo `app/js/ui/icons.js`. Telas devem chamar `semanticIcon(categoria)` em vez de escolher um desenho diretamente.

## Ícones utilitários

`plus`, `minus`, `chevronDown`, `chevronRight`, `check`, `circle` e `lock` são controles ou estados compactos. Eles não recebem placa nem brilho.

## Regras de aplicação

1. Navegação principal: um ícone e um rótulo; nunca emoji.
2. Botão principal: no máximo um ícone antes do texto.
3. Cartão de métrica: ícone apenas quando diferencia a categoria; números continuam sendo o foco.
4. Listas densas: usar ícones utilitários de `12–14 px`.
5. Estados positivos, atenção e perigo: combinar glifo, texto e cor.
6. Imagens de personagem, inimigo, brasão e emblema editorial são ilustrações, não ícones; permanecem como ativos raster aprovados.
7. Monogramas de concursos (`PC`, `PF`, `PRF`) são identificadores editoriais e não devem ser trocados por emojis.

## Inventário auditado

- Biblioteca central: navegação, Home, batalha, desempenho, revisão, Edital, rotina, perfil e bem-estar.
- Emojis substituídos: disciplina, teoria, revisão, combate, bloqueio, memória, calendário de prova, sequência, conquista e estados de conclusão.
- Símbolos textuais substituídos: abrir, fechar, expandir, recolher e bloquear.
- Fallback de inimigos: passou de emoji do sistema para o ícone vetorial `skull`.
- Estrelas mantidas exclusivamente para domínio de tópico e subtópico.

## Exemplo

```js
import { semanticIcon, icon } from './icons.js';

semanticIcon('review');
semanticIcon('goal', 'ico--inline');
icon('chevronRight', 'ico--control');
```
