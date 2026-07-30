# Fundação Visual DETONA v1

Esta fundação consolida a linguagem visual sem reconstruir as páginas existentes. A fonte executável de verdade é `app/css/design-system.css`; este documento registra contratos, decisões e a estratégia de migração.

## Arquitetura

1. **Tokens (`--ds-*`)**: cor, tipografia, espaçamento, raio, borda, sombra, largura, movimento, camadas e alvos de toque.
2. **Primitivos (`.ds-*`)**: superfícies, botões, campos, escolhas, badges, barras, estados, loading e modal.
3. **Componentes**: cabeçalho de seção, cards de métrica/ação, mentor e page container.
4. **Temas (`data-theme`)**: Today, Study, Battle, Plan, Performance, Habits, Ranked, Profile e Library alteram apenas variáveis sem duplicar componentes.

O prefixo `--ds-*` foi preservado porque já era o sistema consolidado do projeto. Criar um segundo conjunto `--dt-*` geraria duas fontes de verdade.

## Contratos principais

- Tipografia: `--ds-type-display`, `--ds-type-page`, `--ds-type-section`, `--ds-type-card`, `--ds-type-body`, `--ds-type-body-secondary`, `--ds-type-label` e `--ds-type-micro`.
- Texto operacional novo começa em 12 px; conteúdo importante no mobile usa 14 px ou mais.
- Espaçamento usa a escala de 4 a 48 px (`--ds-space-*`).
- Raios usam `xs`, `sm`, `md`, `lg`, `xl` e `pill`.
- O alvo mínimo de interação é `--ds-touch-target: 44px`.
- Superfícies: `primary`, `secondary`, `data`, `action`, `mentor`, `empty`, `warning` e `critical`. Use `ds-surface--padded` quando o componente não possuir padding próprio.
- Botões novos usam `.ds-button` com variantes `primary`, `secondary`, `ghost`, `danger`, `icon` e `link`, além dos tamanhos `sm`, `md` e `lg`.
- Campos novos usam `.ds-field`; checkbox e radio usam `.ds-choice`.
- O modal oficial é aberto por `openModal()`, aceita `default`, `confirm`, `form`, `critical`, `alert` e `editor`, bloqueia o scroll do fundo, prende e devolve o foco e fecha com Escape.
- Empty, loading e error states são produzidos por `emptyState()`, `skeleton()`, `loadingState()` e `errorState()`.

## Largura e rolagem

- `compact` (`560px`): login e formulários focados.
- `standard` (`960px`): revisão, edital, perfil e operações.
- `wide` (`1280px`): Home, Plano, Desempenho, Hábitos e Biblioteca.
- `immersive` (`1600px`): Arena, mapa e experiências especiais.

`.ds-page` e `.page-container` usam o scroll principal do aplicativo. `.ds-scroll-region` só deve ser aplicado quando uma região interna realmente precisa rolar (modal, tabela extensa ou painel funcional). A exceção legada de Desempenho permanece documentada e não foi reconstruída nesta fase.

## Mentores

`.ds-mentor` define portrait, identidade, papel, título, mensagem, contexto e ação. As variáveis locais são:

- `--ds-mentor-accent`;
- `--ds-mentor-accent-strong`;
- `--ds-mentor-glow`;
- `--ds-mentor-border`;
- `--ds-mentor-background`;
- `--ds-mentor-portrait-position`.

As variantes iniciais são Orion, Evi e Kaely, com modos `compact`, `direct` e `neutral`. Kiro só deve ser adicionado quando existir produto e arte aprovados.

## Acessibilidade

- foco visível global;
- mínimo de 44 px para controles;
- modal com foco inicial, ciclo de Tab, Escape, restauração do foco e scroll lock;
- `aria-busy` no loading;
- estados não dependem somente de cor;
- `prefers-reduced-motion` preservado;
- layouts fluidos para zoom de 200% e mobile.

## Estratégia de convivência com o legado

| Classificação | Exemplos | Regra |
| --- | --- | --- |
| Fundação oficial | `--ds-*`, `.ds-surface`, `.ds-button`, `.ds-field`, `.ds-modal`, `.ds-page`, `.ds-mentor` | usar em código novo |
| Módulo moderno | Revisão, cards recentes da Home e Hábitos | migrar por componente, com regressão visual |
| Legado compatível | `.btn`, `.btn-primary`, `.btn-ghost`, `.ro-window`, `.dash-card`, `.section-header`, `.page-container` | manter com adaptador seguro |
| Legado a migrar | JRPG de mapa/Arena, SaaS antigo, modais especializados, exceção de scroll de Desempenho | migrar em fases próprias |
| Código morto confirmado | somente após busca, teste e comparação visual | remover em commit isolado |

Critérios para remover uma regra antiga:

1. nenhum uso restante em HTML/JS;
2. teste estrutural e visual cobrindo o substituto;
3. comparação nos sete viewports oficiais;
4. ausência de regressão no PWA;
5. remoção pequena e rastreável.

## Aplicação nesta fase

A fundação foi ligada ao shell por `data-theme`, ao page container e ao section header. A validação visual inicial foi limitada a Revisão, à seção neutra de revisões na Home e à análise de Hábitos. Mapa, Arena, Perfil, Plano e Biblioteca não foram redesenhados.

Ocorrências tipográficas legadas abaixo de 11 px permanecem principalmente em HUDs, badges, métricas compactas e módulos JRPG. Elas devem ser tratadas por componente, não por substituição global.
