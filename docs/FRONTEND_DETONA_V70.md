# Refatoração visual incremental — DETONA CONCURSOS

## 1. Mapa do front-end

### Entradas e navegação

- `app/index.html`: shell inicial, estilos globais, navegação móvel e entrada do módulo.
- `app/js/app.js`: inicialização, proteção de acesso, contexto da jornada e roteamento interno.
- `app/js/ui/appShell.js`: sidebar, topbar, títulos e estado ativo da navegação.
- `app/sw.js`: cache offline e atualização de versões visuais.

### Telas principais

| Área de produto | Rota preservada | Renderizador |
|---|---|---|
| Hoje | `home` | `app/js/ui/home.js` |
| Estudar | `map` | `app/js/ui/worldMap.js` e `topicTree.js` |
| Edital | `edital` | `app/js/ui/grimorio.js` |
| Plano | `expedition` | `app/js/ui/expedition.js` |
| Evolução | `performance` | `app/js/ui/performance.js` |
| Questões | `battle` | `app/js/ui/battleArena.js` |
| Revisão | `review` | `app/js/ui/review.js` |

Os identificadores de rota não serão renomeados nesta etapa. Eles participam do fluxo de acesso, restauração da Home e contexto do concurso.

### Componentes reutilizáveis existentes

- `app/js/ui/components.js`: progresso, métricas, badges, estados vazio/erro, feedback, painéis e skeleton.
- `app/js/ui/appShell.js`: cabeçalho de seção, painel de estatísticas, container e grid.
- `app/js/ui/icons.js`: biblioteca vetorial e mapa semântico de ícones.
- `app/js/ui/helpers.js`: escape de conteúdo, modal, toast, estrelas e formatação.
- `app/js/ui/heroAssets.js` e `enemyAssets.js`: resolução controlada de ilustrações.

### Estilos globais

- `app/css/main.css`: base histórica, layout do shell e estilos legados.
- `app/css/design-system.css`: tokens, componentes atuais e layouts das áreas redesenhadas.

`design-system.css` deve ser a camada de consolidação. A remoção de regras antigas de `main.css` só pode ocorrer após prova de não uso, pois a cascata atual ainda sustenta telas secundárias.

## 2. Diagnóstico

1. A navegação usa nomes diferentes entre desktop e mobile: Início/Mapa/Rotina/Desempenho versus Início/Estudar/Rotina/Desempenho.
2. Existem duas gerações de CSS. Classes como `.btn`, `.bottom-nav` e containers possuem regras em mais de um ponto, aumentando o risco de regressão por ordem.
3. O design system já possui bons tokens e componentes, mas algumas telas ainda usam estruturas específicas e estilos inline para valores dinâmicos.
4. Home Hoje, questões, edital, revisão, ícones e linguagem já foram redesenhados. Reescrevê-los destruiria trabalho válido sem ganho de produto.
5. Rotas legadas ainda existem por compatibilidade. O nome visual pode mudar; o identificador técnico deve permanecer estável.

## 3. Direção visual

**Personalidade:** precisão de painel tático, energia controlada e progresso acadêmico visível.

- Fundo escuro profundo para concentração.
- Plasma violeta para ação principal e identidade.
- Laranja para energia e constância.
- Ciano para dados e navegação acadêmica.
- Verde, amarelo e vermelho reservados a estados com significado.
- Ilustrações apenas em pontos de motivação; nunca competindo com enunciados, métricas ou ações.
- Um objetivo primário por tela; ações secundárias visualmente contidas.
- Gamificação sempre acompanhada do dado acadêmico que representa.

## 4. Contrato do design system

### Tokens

- Cores: `--ds-bg-*`, `--ds-surface-*`, `--ds-plasma-*`, `--ds-energy-*`, `--ds-data-*` e tokens de estado.
- Texto: `--ds-text-1`, `--ds-text-2`, `--ds-text-3`.
- Espaçamento: escala `--ds-space-1` a `--ds-space-12`.
- Forma: `--ds-radius-*`, `--ds-border*` e `--ds-shadow-*`.
- Movimento: `--ds-duration-*` e `--ds-ease`, sempre respeitando `prefers-reduced-motion`.

### Componentes oficiais

- Ação: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`.
- Superfície: `.ds-card`, `.ro-window` e painéis específicos somente quando a informação exigir.
- Métrica: `metricCard()` / `.ds-metric`.
- Progresso: `progressBar()` / `.ds-progress`.
- Estado: `statusBadge()`, `emptyState()`, `errorState()` e `feedbackMessage()`.
- Estrutura: `mountPageContainer()`, `sectionHeader()` e o shell responsivo.
- Ícone: `semanticIcon(categoria)`; emoji não é controle de interface.

## 5. Riscos e limites

- Não alterar IndexedDB, repositórios, migrações, backup ou schema.
- Não alterar fórmulas de XP, domínio, memória, prioridade de revisão ou progresso.
- Não renomear rotas internas durante a refatoração visual.
- Não remover CSS legado sem inventário de uso e teste visual das rotas.
- Versionar CSS, módulos e service worker a cada incremento para evitar telas antigas no cache offline.

## 6. Ordem incremental

1. Unificar nomes e estado ativo da navegação.
2. Confirmar a Home como centro de comando, sem adicionar novos blocos.
3. Verificar Questões, Edital e Revisão contra o contrato visual.
4. Confirmar iconografia semântica e linguagem de produto.
5. Executar testes de regressão e validação visual das cinco áreas principais.
