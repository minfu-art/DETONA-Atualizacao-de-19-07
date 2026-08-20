# Planejamento do Mapa Mestre — PRF — Policial Rodoviário Federal

## Objetivo

Construir uma árvore pedagógica completa em que cada questão possa ser rastreada até a menor unidade de conhecimento que ela ensina ou avalia:

`disciplina → tópico canônico → subtópico canônico → fragmento pedagógico → microconhecimento → questão`

Microconhecimento é a menor unidade que faça sentido diagnosticar, ensinar, revisar e comprovar separadamente.

## Estado de partida

- concurso: `prf_2026`;
- cargo: `prf_2026_policial_rodoviario_federal`;
- baseline curricular: Edital nº 1 — PRF, de 18 de janeiro de 2021;
- 14 disciplinas;
- 91 tópicos;
- 246 subtópicos;
- novo edital ainda não publicado no portal oficial consultado em 20 de agosto de 2026;
- nenhum microconhecimento ou questão será publicado automaticamente.

## Fontes e autoridade

1. O edital oficial define o limite curricular da baseline.
2. A legislação oficial vigente detalha e atualiza conteúdos normativos.
3. As apostilas fornecidas detalham explicações, exemplos, exceções e padrões de cobrança.
4. Fontes oficiais na internet atualizam lei, jurisprudência, normas técnicas e fatos dinâmicos.
5. Materiais comerciais ou secundários nunca substituem a fonte oficial.

Cada vínculo deverá registrar fonte, localização, uso e estado de validação. Quando não houver página ou trecho verificável, a rastreabilidade ficará explicitamente pendente; nada será inventado.

## Contrato do microconhecimento

Cada unidade terá, no mínimo:

- `microknowledge_id` exclusivo da PRF;
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
- regra geral e entendimento jurisprudencial;
- dispositivo legal e aplicação em situação operacional.

Não separar sinônimos, paráfrases ou passos inseparáveis da mesma habilidade.

## Fases de produção

### Fase 1 — Fragmentação pedagógica

Converter os 246 subtópicos canônicos em fragmentos manejáveis, preservando os IDs do currículo. Estimativa: 411 a 644 fragmentos. É uma faixa de planejamento, não uma meta obrigatória.

### Fase 2 — Decomposição em microconhecimentos

Criar as unidades atômicas por fragmento. Estimativa inicial: 2.740 a 4.410 unidades. A contagem final será consequência do conteúdo, nunca uma quota.

### Fase 3 — Reconciliação normativa crítica

Antes de produzir questões, reconciliar o Código de Trânsito Brasileiro e todas as resoluções CONTRAN citadas em 2021 com a legislação vigente. Norma revogada, consolidada, substituída ou renumerada deverá manter rastreabilidade histórica, apontar a norma vigente e ficar bloqueada até validação.

### Fase 4 — Rastreabilidade

Vincular edital, apostila, legislação e fontes oficiais. Conteúdo normativo ou dinâmico ficará bloqueado até conferência oficial.

### Fase 5 — Validação editorial

Eliminar duplicações, sobreposições, lacunas e unidades amplas demais. Confirmar que cada microconhecimento é ensinável e avaliável isoladamente.

### Fase 6 — Cobertura do edital

Exigir:

- 246/246 subtópicos representados;
- 100% dos fragmentos com ao menos um microconhecimento;
- 0 microconhecimentos órfãos;
- 0 IDs duplicados;
- 0 alterações silenciosas nos IDs canônicos;
- relatório explícito de exceções, revogações e pendências.

### Fase 7 — Plano do banco inteligente

Somente depois da aprovação do mapa, planejar no mínimo três questões originais por microconhecimento:

1. reconhecimento ou conceito;
2. aplicação ou resolução;
3. discriminação, exceção ou pegadinha.

Com a faixa atual, o banco integral poderá exigir aproximadamente 8.220 a 13.230 questões. Essa projeção será recalculada após a validação do mapa.

## Ordem recomendada

1. Língua Portuguesa;
2. Raciocínio Lógico-Matemático;
3. Física;
4. Informática;
5. Direito Constitucional;
6. Direito Administrativo;
7. Direito Penal;
8. Direito Processual Penal;
9. Direitos Humanos;
10. Ética e Cidadania;
11. Geopolítica;
12. Língua Estrangeira;
13. Legislação Especial;
14. Legislação de Trânsito.

As primeiras disciplinas permitem validar o método com conteúdo relativamente estável. Legislação Especial e Legislação de Trânsito ficam para depois da reconciliação normativa.

## Reaproveitamento de outros cursos DETONA

Conceitos comuns podem ser usados como referência editorial, mas IDs de PC BA, PC PE ou PC AL não serão copiados. Todo microconhecimento PRF terá identidade própria e vínculo exclusivo com seu currículo. Questões existentes somente poderão ser associadas após equivalência de escopo e fonte, sem misturar progresso entre concursos.

## Critérios de autorização

Neste momento:

- planejamento do mapa: autorizado;
- geração do mapa completo: reiniciada em lotes editoriais de 20 questões após reprovação do lote mecânico;
- ingestão das 183 apostilas: concluída;
- geração editorial de questões: autorizada para conteúdo estável ou oficialmente reconciliado;
- Português: lote editorial 01 concluído, com 20 questões contextualizadas de compreensão e interpretação;
- importação no Supabase: bloqueada;
- publicação: bloqueada;
- entitlement: bloqueado;
- Mercado Pago: não envolvido.

O pacote cobre 13 das 14 disciplinas; Língua Estrangeira continua pendente. Legislação de Trânsito e demais conteúdos normativos permanecem condicionados à reconciliação oficial antes de qualquer lote definitivo.
