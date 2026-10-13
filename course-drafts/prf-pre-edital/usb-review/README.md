# Preparação das questões PRF do pendrive

Em 13/10/2026, as 16 planilhas do pendrive continham 6.674 questões. A preparação é local e não alterou o pendrive nem o aplicativo.

## Correlação de gabaritos

[`usb-answer-corrections.json`](usb-answer-corrections.json) registra 11 casos em que a alternativa gravada como gabarito é diferente da letra que o comentário vinculado declara expressamente correta. O campo `corrected` foi aplicado à fila de revisão. A questão `PRF-LTC-A01-8460-0039` teve também conferência com o [art. 47 do CTB](https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm). As outras dez ainda exigem conferência normativa atual. Nenhuma das 11 está aprovada para publicação.

## Lotes

[`usb-review-batches.json`](usb-review-batches.json) distribui os 6.674 IDs em 343 grupos por disciplina, com no máximo 20 por grupo: 328 grupos de 20 e 15 grupos menores. São filas de revisão, não pacotes de importação. Cada grupo tem bloqueio explícito para mapeamento ao microconhecimento, revisão editorial/normativa e definição do direito de uso ou reescrita autoral dos comentários extraídos de apostilas.

Todos os grupos têm uma **disciplina canônica candidata**. As 24 questões de “Carreira PRF” foram marcadas como candidatas a Direito Administrativo, mas exigem confirmação individual porque podem envolver Direito Constitucional ou Legislação Especial. Nenhuma questão recebeu subtópico ou microconhecimento por inferência automática.

[`microknowledge-link-candidates.v1.json`](microknowledge-link-candidates.v1.json) cruza os 6.674 IDs do pendrive com o rascunho do novo mapa e apresenta até três sugestões de microconhecimento por questão. Usa somente enunciado e, em múltipla escolha, a alternativa indicada como correta após as 11 correções propostas. Há 832 itens com maior sobreposição de palavras, 5.511 com sinal fraco ou ambíguo e 331 sem sinal lexical. Uma amostra mostrou que até a primeira categoria contém vínculos errados. Por isso **todos** os campos `assigned_microknowledge_id` seguem nulos: o arquivo serve para priorizar revisão individual, não para importação ou publicação.

O manifesto também sinaliza 130 enunciados que mencionam figura, gráfico, tabela ou equivalente sem anexo registrado na planilha, 25 marcadores `Resposta: .` truncados, oito enunciados que revelam a própria resposta e os 11 conflitos de gabarito já conhecidos. Esses são sinais para inspeção no PDF de origem, não contagens finais de questões irrecuperáveis.

[`authorial-batch-readiness.json`](authorial-batch-readiness.json) verifica os 38 lotes autorais existentes. Todos têm exatamente 20 itens, um microconhecimento definido por questão, gabarito C/E e enunciado/comentário preenchidos. O lote 1 foi publicado no staging; os lotes 2–37 estavam em rascunho e o lote 38 apenas local na última conferência. A verificação técnica não substitui a revisão humana de cada lote.

## Abrangência curricular

[`canonical-subtopic-coverage.json`](canonical-subtopic-coverage.json) contém os 246 subtópicos oficiais do currículo local e sua contagem de questões autorais. Apenas 10 subtópicos, todos em Língua Portuguesa, têm questões autorais vinculadas. Os 38 lotes somam 760 questões e 378 microconhecimentos distintos. Destes, 93 têm ao menos três questões e 285 ainda têm uma ou duas. O restante dos 236 subtópicos não tem questão autoral vinculada. Não existe no pacote local um catálogo aprovado de microconhecimentos para todos os 246 subtópicos; por isso não é possível afirmar cobertura de **todos** os microconhecimentos do curso com os arquivos atuais. As questões do pendrive não contêm IDs de microconhecimento e não foram contabilizadas como cobertura.

## Critério para passagem à publicação

Um lote só passa da fila de revisão quando cada questão tem um ID canônico de microconhecimento, formato e gabarito conferidos, comentário autoral ou direito de uso confirmado, fonte normativa atual quando aplicável, revisão humana e preview legível. Os grupos menores que 20 precisam ser completados com questões autorais da mesma unidade temática antes de formar um lote editorial de 20.

Para regenerar os manifestos sem editar as planilhas de origem:

```powershell
& 'C:\Users\wwwmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' '.\scripts\prepare-prf-usb-review.py' --source 'E:\DETONA_PRF_EXTRACAO_2026-09-30\dados' --output '.\course-drafts\prf-pre-edital\usb-review'
```
