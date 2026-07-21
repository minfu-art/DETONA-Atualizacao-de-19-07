# Fase 5 — UX, interface e gamificação visual

## Objetivo

Unificar o DETONA CONCURSOS como plataforma educacional gamificada madura,
responsiva e acessível, reforçando progresso, constância, domínio e estratégia
sem alterar regras de XP, nível, memória, edital, batalha ou isolamento SaaS.

## Escopo

Foram tratados autenticação, biblioteca, shell, Home, questões/batalha, jornada,
edital, rotina, perfil, feedbacks, estados vazios, loading, acessibilidade,
responsividade, movimento e pacote PWA. Supabase, backend, IA e pagamentos reais
permanecem fora do escopo.

## Diagnóstico inicial

A fase 4 iniciou com 42 testes aprovados, 13 rotas e nenhuma tela ligada
diretamente ao IndexedDB. A interface, porém, combinava três linguagens visuais,
3.173 linhas de CSS, 216 usos de cores literais, breakpoints sobrepostos,
componentes repetidos e lacunas de foco, modal, toast e tipos de botão.

## Design system

`css/design-system.css` concentra:

- superfícies escuras em três níveis;
- plasma roxo, energia laranja, dados ciano, sucesso verde e erro rosa/vermelho;
- três níveis de texto e bordas com contraste previsível;
- escala de espaço, raios, sombras, elevação e largura de conteúdo;
- duração e easing de movimento;
- foco visível, contraste reforçado e redução de movimento;
- breakpoints para celular pequeno, celular/tablet, notebook e desktop;
- safe areas, orientação paisagem e alvos mínimos de 44px.

O CSS anterior foi preservado para compatibilidade e a nova camada normaliza os
componentes sem reescrever telas funcionais.

## Componentes

`ui/components.js` oferece componentes puros e testáveis:

- barra de progresso com ARIA;
- cartão de métrica;
- badge de estado com texto e indicador;
- estado vazio;
- skeleton loading;
- feedback de resposta voltado a retroaprendizado;
- detecção de movimento reduzido.

Botões, campos, cartões, chips, navegação, modal e toast são normalizados pelo
design system. A biblioteca reutiliza progresso, badge e estado vazio.

## Decisões

- preservar HTML e regras existentes e aplicar evolução incremental;
- manter PC/AL como único conteúdo pronto;
- mostrar PF e PRF como adquiríveis, porém em preparação;
- agregar resumo de progresso por `ContestSummaryService`, fora da UI;
- retornar à biblioteca pelo shell e pela Home;
- substituir linguagem agressiva por orientação madura e estratégica;
- manter feedback proporcional e reservar celebração forte a marcos reais.

## Compatibilidade

As fronteiras `AuthService`, `EntitlementRepository`, `CheckoutService`,
`LibraryService`, `ProgressRepository` e `activeContest` foram preservadas.
Não houve migration destrutiva, mudança de fórmula ou acesso direto ao IndexedDB
pelas telas. Kafra ganhou funções puras testáveis sem alterar seu formato.

## Acessibilidade

- foco global visível;
- modal com `role=dialog`, `aria-modal`, Escape, trap e restauração de foco;
- toast como região viva;
- erros de autenticação associados aos campos;
- mostrar/ocultar senha com nome acessível;
- botões com tipo explícito;
- progressos com valor textual e ARIA;
- canvas com alternativa textual;
- estados não transmitidos apenas por cor;
- suporte a teclado, zoom, contraste aumentado e movimento reduzido.

## Responsividade

No mobile, cards viram coluna, alternativas ocupam a largura, a navegação
respeita safe area, o dashboard reduz densidade e modais viram painéis inferiores.
Em tablet e desktop, grids próprios, sidebar agrupada e largura máxima evitam o
simples esticamento da experiência móvel. Paisagem curta recebe composição
específica na autenticação.

## Animações

Transições usam durações de 140, 220 e 420 ms. Skeleton e loading são curtos,
feedbacks não bloqueiam interação e `prefers-reduced-motion` reduz todas as
animações e rolagens suaves. Nenhuma biblioteca foi adicionada.

## Testes

A baseline foi 42/42. A entrega final possui 53/53 testes aprovados. Foram
adicionados testes para componentes, estados essenciais, movimento reduzido,
catálogo, troca de contexto, fronteiras arquiteturais, proteção de rotas e
round-trip Kafra. Também foram validados 59 arquivos JavaScript, 88 recursos do
service worker por existência e HTTP 200, o manifesto, os ícones e a ausência de
imports diretos de IndexedDB na UI.

## Limitações

- a inicialização do navegador integrado falhou no ambiente desta execução; por
  isso, a inspeção visual e de teclado em navegador real permanece pendente e
  não foi substituída por uma ferramenta externa;
- PF e PRF ainda não possuem pacotes editoriais;
- gráficos continuam em canvas e usam alternativa textual resumida;
- a camada CSS legada permanece para compatibilidade e pode ser reduzida em uma
  fase futura após testes visuais de todos os estados.

## Próximos passos

1. criar pacotes editoriais próprios para PF e PRF;
2. adicionar testes DOM/E2E permanentes no pipeline;
3. consolidar gradualmente o CSS legado no design system;
4. testar com leitores de tela reais e dispositivos de baixo desempenho;
5. integrar identidade e entitlements remotos mantendo os contratos atuais.

## Validação posterior — 15/07/2026

- fluxos de cadastro, biblioteca, onboarding, Home, mapa, questões e batalha
  diária validados no navegador integrado;
- corrigida a abertura da batalha diária, que consultava o IndexedDB sem uma
  chave de subtópico antes de selecionar as questões do dia;
- cache do PWA atualizado para distribuir a correção;
- suíte consolidada com 85/85 testes aprovados;
- banco validado com 1.162 questões, sendo 1.156 utilizáveis e 6 mantidas em
  revisão editorial.
