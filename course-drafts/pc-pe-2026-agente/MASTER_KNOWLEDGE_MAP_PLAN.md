# Planejamento do Mapa Mestre — PC PE — Agente de Polícia

## Objetivo

Construir uma árvore pedagógica completa em que cada questão possa ser rastreada até a menor unidade de conhecimento que ela ensina ou avalia:

`disciplina → tópico canônico → subtópico canônico → fragmento pedagógico → microconhecimento → questão`

Microconhecimento é a menor unidade que faça sentido diagnosticar, ensinar, revisar e comprovar separadamente.

## Estado de partida

- concurso: `pc_pe_2026`;
- cargo: `pc_pe_2026_agente_policia`;
- baseline: Edital nº 1 — PCPE, de 21 de dezembro de 2023;
- 11 disciplinas;
- 95 tópicos;
- 188 subtópicos;
- novo edital ainda não publicado;
- nenhum microconhecimento ou questão será publicado automaticamente.

## Fontes e autoridade

1. O edital oficial define o limite curricular.
2. A legislação oficial vigente detalha conteúdos normativos.
3. As apostilas fornecidas detalham explicações, exemplos, exceções e padrões de cobrança.
4. Fontes oficiais na internet atualizam lei, jurisprudência e fatos dinâmicos.
5. Materiais comerciais ou secundários nunca substituem a fonte oficial.

Cada vínculo deverá registrar fonte, localização, uso e estado de validação. Quando não houver página ou trecho verificável, a rastreabilidade ficará explicitamente pendente; nada será inventado.

## Contrato do microconhecimento

Cada unidade terá, no mínimo:

- `microknowledge_id` exclusivo do PC PE;
- `fragment_id`;
- `discipline_id`;
- `topic_id`;
- `subtopic_id`;
- nome atômico e objetivo;
- definição de escopo — o que inclui e o que não inclui;
- origem da decomposição;
- competências avaliáveis;
- dependências e conhecimentos relacionados;
- risco normativo ou dinâmico;
- estado de validação editorial e normativa;
- rastreabilidade das fontes;
- plano inicial de questões.

## Regra de atomicidade

Uma unidade só será aceita quando puder receber uma questão específica sem depender de testar simultaneamente outro conceito independente.

Separar quando houver:

- conceito e classificação;
- regra e exceção;
- requisito e efeito;
- hipótese e consequência;
- competência e procedimento;
- fórmula e interpretação;
- operação e erro típico;
- regra geral e entendimento jurisprudencial.

Não separar sinônimos, paráfrases ou passos inseparáveis da mesma habilidade.

## Fases de produção

### Fase 1 — Fragmentação pedagógica

Converter os 188 subtópicos canônicos em fragmentos manejáveis, preservando os IDs do currículo. Estimativa: 283 a 427 fragmentos. É uma faixa de planejamento, não uma meta obrigatória.

### Fase 2 — Decomposição em microconhecimentos

Criar as unidades atômicas por fragmento. Estimativa inicial: 1.800 a 2.800 unidades. A contagem final será consequência do conteúdo, nunca uma quota.

### Fase 3 — Rastreabilidade

Vincular edital, apostila, legislação e fontes oficiais. Conteúdo normativo ou dinâmico ficará bloqueado até conferência oficial.

### Fase 4 — Validação editorial

Eliminar duplicações, sobreposições, lacunas e unidades amplas demais. Confirmar que cada microconhecimento é ensinável e avaliável isoladamente.

### Fase 5 — Cobertura do edital

Exigir:

- 188/188 subtópicos representados;
- 100% dos fragmentos com ao menos um microconhecimento;
- 0 microconhecimentos órfãos;
- 0 IDs duplicados;
- 0 alterações silenciosas nos IDs canônicos;
- relatório explícito de exceções e pendências.

### Fase 6 — Plano do banco inteligente

Somente depois da aprovação do mapa, planejar no mínimo três questões originais por microconhecimento:

1. reconhecimento ou conceito;
2. aplicação ou resolução;
3. discriminação, exceção ou pegadinha.

Com a faixa atual, o banco integral poderá exigir aproximadamente 5.400 a 8.400 questões. Essa projeção será recalculada após a validação do mapa.

## Ordem recomendada

1. Língua Portuguesa;
2. Raciocínio Lógico;
3. Contabilidade Geral;
4. Estatística;
5. Noções de Direito Constitucional;
6. Noções de Direito Administrativo;
7. Noções de Direito Penal;
8. Noções de Direito Processual Penal;
9. Informática;
10. Legislação Estadual;
11. Atualidades.

As quatro primeiras permitem validar o método com conteúdo relativamente estável. Legislação Estadual e Atualidades ficam mais tarde por dependerem de atualização oficial e do novo edital.

## Reaproveitamento do PC BA

Conceitos comuns podem ser usados como referência editorial, mas os IDs do PC BA não serão copiados. Todo microconhecimento PC PE terá identidade própria e vínculo exclusivo com seu currículo. Questões existentes somente poderão ser associadas após equivalência de escopo e fonte, sem misturar progresso entre concursos.

## Critérios de autorização

Neste momento:

- planejamento do mapa: autorizado;
- geração do mapa completo: ainda não executada;
- geração de questões: bloqueada;
- importação no Supabase: bloqueada;
- publicação: bloqueada;
- entitlement: bloqueado;
- Mercado Pago: não envolvido.

O início da decomposição completa depende do conjunto de apostilas ou de autorização explícita para trabalhar apenas com fontes oficiais abertas.
