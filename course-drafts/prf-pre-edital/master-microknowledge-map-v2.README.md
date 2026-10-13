# Mapa de microconhecimentos PRF v2 — rascunho editorial

O arquivo `master-microknowledge-map-v2.draft.json` cobre os 246 subtópicos das 14 disciplinas do currículo local PRF 2021. Ele preserva os 378 IDs de microconhecimento já presentes nos 38 lotes autorais de Português e propõe 676 novas unidades. Esses títulos novos são hipóteses editoriais para organizar a revisão; **não foram aprovados nem publicados**. O campo `publication_blocked` permanece `true`.

Cada unidade nova traz o ID do subtópico do edital que a originou. A referência ao edital comprova apenas o escopo amplo do subtópico, não a validade de cada título proposto. Em matérias normativas, `normative_reconciliation_required` exige checagem da redação vigente e de alterações antes de aprovar questão ou microconhecimento.

O ramo de Legislação de Trânsito liga as 39 resoluções do currículo local ao [índice oficial do CONTRAN](https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/resolucoes-contran), fotografado em `sources/contran-2026-10-13-official-index.v1.json`. A [retificação nº 2 do edital PRF 2021](https://cdn.cebraspe.org.br/concursos/prf_21/arquivos/ED_2_PRF_2021_RETIFICACAO.PDF) traz 34 dessas resoluções: retira 268, 292, 453, 619 e 723 e corrige os anos de 92 (1999) e 210 (2006). O mapa mantém os IDs e rótulos do currículo inicial para preservar vínculos existentes, mas sinaliza o escopo retificado em cada registro. Uma futura versão curricular poderá corrigir os rótulos e remover do escopo ativo os cinco itens sem perder a trilha histórica.

O índice atual assinala revogação em 31 dos 39 registros; para os demais, a ausência desse sinal no índice não prova vigência. Todos ainda requerem leitura do ato e do eventual sucessor antes de usar as propostas em questões atuais.

Regeneração, a partir da raiz do repositório:

```powershell
python scripts/reconcile-prf-contran-index.py
python scripts/build-prf-microknowledge-map-v2.py
```

Próximas etapas para publicação das questões do pendrive: revisar e aprovar os novos títulos, reconciliar normas, vincular cada questão individualmente a um microconhecimento específico, corrigir gabaritos e justificativas, verificar direitos de publicação e carregar lotes de até 20 com conferência após cada lote. O mapa de currículo completo não significa que as 6.674 questões do pendrive já estejam classificadas ou aptas a publicar.
