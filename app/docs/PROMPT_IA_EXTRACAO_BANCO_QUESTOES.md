# Prompt — IA extrai banco de questões (DETONA) a partir de PDF de apostila

Use o bloco abaixo (seção **PROMPT COPIÁVEL**) ao enviar o PDF (ou o texto extraído) para a IA.

---

## Objetivo

A IA deve ler **apenas a seção de EXERCÍCIOS COMENTADOS** da apostila e devolver um **JSON estruturado** no formato base do DETONA, já com:

- enunciado completo  
- alternativas (se houver)  
- gabarito  
- **comentário / explicação da resposta** (da apostila)  
- metadados (banca, ano, órgão, cargo, fonte)  
- `status_extracao = "REVISADA"`  

**Não extrair:** teoria da aula, mapas mentais, resumos, sumário, “Exercícios para Praticar” (sem comentário), listas sem gabarito.

---

## PROMPT COPIÁVEL

```text
Você é um extrator editorial especializado em bancas de concursos públicos (CEBRASPE/CESPE, FGV, FCC, VUNESP, etc.) e no formato de apostilas (padrão Estratégia Concursos e similares).

# MISSÃO
A partir do PDF/texto da apostila que enviei, extraia APENAS as questões da seção **EXERCÍCIOS COMENTADOS** (ou equivalente: “Questões Comentadas”, “Exercícios Resolvidos”, “Questões com comentários”).

Para cada questão, capture também a **explicação/comentário da resposta** que a apostila traz logo após o item (bloco COMENTÁRIOS / GABARITO / “Item correto/errado” / “Letra X”).

Entregue o resultado **já revisado editorialmente** no formato base do meu banco de questões DETONA (JSON abaixo), pronto para importação.

# O QUE EXTRAIR
Inclua somente se houver, na apostila, pelo menos:
1) enunciado da questão, e
2) gabarito explícito (Letra A–E, Certo/Errado, C/E, “Item correto/errado”), e
3) preferencialmente o comentário/explicação associado.

# O QUE NÃO EXTRAIR
- Conteúdo teórico da aula (antes da seção de exercícios comentados)
- “Exercícios para praticar” / listas sem gabarito / sem comentário
- Sumário, índice, capa, rodapé, propaganda, “www.”, numeração solta de página
- Mapas, tabelas puramente didáticas que não sejam a questão
- Duplicatas óbvias da mesma questão no mesmo arquivo (mantenha 1)

# TIPOS DE QUESTÃO
Classifique `tipo` assim:
- "certo_errado" → CESPE/CEBRASPE estilo “julgue o item”, gabarito C ou E (Certo/Errado)
- "multipla_escolha" → alternativas A–E (ou a–e / (A)–(E))

# NORMALIZAÇÃO OBRIGATÓRIA
1) `gabarito_normalizado`:
   - certo_errado: apenas "C" ou "E"
     (Certo/Correto/Verdadeiro/C → C | Errado/Incorreto/Falso/E → E)
   - multipla_escolha: apenas "A", "B", "C", "D" ou "E"
2) `banca`: use "CEBRASPE" quando a fonte disser CESPE ou CEBRASPE.
3) `fonte_questao`: monte no padrão:
   BANCA/ANO/ÓRGÃO/CARGO
   Ex.: "CEBRASPE/2019/CGE-CE/AUDITOR DE CONTROLE INTERNO"
4) `enunciado`: texto completo e limpo (sem “QUESTÃO 12.” no começo se for só numeração; mantenha textos de apoio, trechos e comandos “julgue o item”).
5) Alternativas: texto da alternativa SEM a letra prefixada (“A) ”). Se não houver alternativas (C/E), deixe strings vazias.
6) `comentario_integral_apostila`: copie/adapte com fidelidade o comentário da apostila que justifica o gabarito. Não invente doutrina que não esteja no material. Se o comentário citar “Item correto porque…”, preserve o raciocínio.
7) Se a apostila comentar alternativa por alternativa, preencha também comentario_A … comentario_E; senão deixe "".
8) `status_extracao`: SEMPRE "REVISADA" (já revisada para o banco).
9) `duplicada`: "NÃO" (a menos que você tenha certeza de duplicata interna; aí "SIM" e explique em observacoes_extracao).
10) Limpe hifenização de PDF (“ofa-\nensa” → “ofensa”), espaços quebrados e quebras excessivas.
11) Se houver imagem/tabela essencial e não recuperável em texto, marque em `imagem_tabela_diagrama_referenciada` = "SIM" e descreva em `observacoes_extracao`.

# METADADOS FIXOS DESTE BANCO (preencha todos os itens)
- concurso: "{{CONCURSO}}"          // ex: PC-AL 2026
- cargo: "{{CARGO}}"                // ex: Agente de Polícia
- disciplina: "{{DISCIPLINA}}"      // ex: Direito Penal
- aula: "{{AULA}}"                  // ex: 00
- arquivo_origem: "{{NOME_PDF}}"    // ex: curso-223697-aula-00.pdf
- assunto_aula: use o tema da seção/aula se estiver claro; senão "Exercícios Comentados"
- secao_material: "Exercícios Comentados"
- numero_apostila: número original da questão na apostila (1, 2, 3…)
- id_questao: "{{PREFIXO}}-{{AULA}}-{{NNNN}}"
  // ex: PCAL-DP-A00-0001  (4 dígitos, sequência na ordem da apostila)
- hash_questao: deixe "" (o sistema calcula) OU gere hash estável se souber

# CRITÉRIOS DE QUALIDADE (REVISÃO)
Antes de entregar, valide CADA item:
- enunciado não vazio (≥ 20 caracteres úteis)
- gabarito compatível com o tipo
- se multipla_escolha: pelo menos 2 alternativas preenchidas e o gabarito existe entre elas
- se certo_errado: alternativas A–E vazias; gabarito C ou E
- comentario_integral_apostila preferencialmente preenchido; se a apostila não trouxer comentário, use "Sem comentário na apostila." e coloque em observacoes_extracao: "comentario_ausente"
- não misture gabarito de uma questão com o comentário da seguinte
- não invente gabarito

Se um bloco estiver incompleto/ambíguo (gabarito cortado, alternativas faltando), NÃO force como REVISADA: coloque-o em `pendencias` (não em `questoes`).

# FORMATO DE SAÍDA (JSON ÚNICO — sem markdown, sem texto fora do JSON)
{
  "schemaVersion": 1,
  "geradoPor": "ia-extracao-apostila",
  "disciplina": "{{DISCIPLINA}}",
  "aula": "{{AULA}}",
  "arquivo_origem": "{{NOME_PDF}}",
  "secaoExtraida": "EXERCÍCIOS COMENTADOS",
  "statusPadrao": "REVISADA",
  "quantidadeQuestoes": 0,
  "quantidadePendencias": 0,
  "questoes": [
    {
      "id_questao": "PCAL-DP-A00-0001",
      "hash_questao": "",
      "concurso": "{{CONCURSO}}",
      "cargo": "{{CARGO}}",
      "disciplina": "{{DISCIPLINA}}",
      "assunto_aula": "Exercícios Comentados",
      "secao_material": "Exercícios Comentados",
      "aula": "{{AULA}}",
      "numero_apostila": 1,
      "banca": "CEBRASPE",
      "ano": 2019,
      "fonte_questao": "CEBRASPE/2019/ÓRGÃO/CARGO",
      "tipo": "certo_errado",
      "enunciado": "Texto completo do enunciado...",
      "alternativa_A": "",
      "alternativa_B": "",
      "alternativa_C": "",
      "alternativa_D": "",
      "alternativa_E": "",
      "gabarito_normalizado": "C",
      "gabarito_original": "CERTO",
      "imagem_tabela_diagrama_referenciada": "",
      "duplicada": "NÃO",
      "grupo_duplicata": "",
      "ids_duplicados": "",
      "status_extracao": "REVISADA",
      "observacoes_extracao": "",
      "arquivo_origem": "{{NOME_PDF}}",
      "comentario_integral_apostila": "Explicação completa copiada/adaptada da apostila...",
      "comentario_A": "",
      "comentario_B": "",
      "comentario_C": "",
      "comentario_D": "",
      "comentario_E": "",
      "pagina_pdf": null
    }
  ],
  "pendencias": [
    {
      "numero_apostila": 0,
      "motivo": "gabarito_ausente | alternativas_incompletas | enunciado_ilegivel | comentario_desalinhado",
      "trecho": "recorte curto do problema",
      "acao_recomendada": "revisar manualmente no PDF"
    }
  ]
}

# EXEMPLO MÍNIMO (referência de qualidade)

Questão CESPE certo/errado:
- tipo: "certo_errado"
- gabarito_normalizado: "E"
- comentario_integral_apostila: "Item errado, pois pelo princípio da reserva legal..."

Questão múltipla escolha:
- tipo: "multipla_escolha"
- alternativa_A ... alternativa_E preenchidas
- gabarito_normalizado: "A"
- comentario_integral_apostila: "O texto se refere ao princípio da legalidade..."

# ORDEM DE TRABALHO
1) Localize a seção EXERCÍCIOS COMENTADOS (ignore teoria e seção para praticar).
2) Segmente questão a questão (padrão comum: "1. (CESPE – 2019 – ...)" ).
3) Para cada uma: enunciado → alternativas → comentários → gabarito.
4) Normalize e valide.
5) Entregue SOMENTE o JSON final.

# DADOS DESTA EXTRAÇÃO (preencha antes de rodar)
CONCURSO = PC-AL 2026
CARGO = Agente de Polícia
DISCIPLINA = [PREENCHER]
AULA = [PREENCHER, ex: 00]
NOME_PDF = [PREENCHER]
PREFIXO = [PREENCHER, ex: PCAL-DP]

Agora processe o material anexado e devolva o JSON.
```

---

## Como usar na prática

### 1) Com a IA (Chat/Claude/Grok etc.)
1. Copie o **PROMPT COPIÁVEL**.  
2. Preencha `DISCIPLINA`, `AULA`, `NOME_PDF`, `PREFIXO`.  
3. Anexe o PDF **ou** cole o texto da seção de exercícios comentados.  
4. Peça o JSON de volta.  
5. Salve como arquivo, por exemplo:  
   `app/imports/entrada-exemplo/aula-00-direito-penal-ia.json`

### 2) Converter o JSON da IA → Excel DETONA

Na pasta `app`:

```bat
node scripts/criarBancoQuestoes.mjs --from=imports/entrada-exemplo/aula-00-direito-penal-ia.json --disciplina "Direito Penal" --status=REVISADA
```

### 3) Importar no app

```bat
node scripts/importQuestionBanks.mjs
```

### Alternativa automática (sem IA)
Se quiser só o parser local de PDF:

```bat
node scripts/extrairPdfApostila.mjs --pdf "caminho\aula.pdf" --disciplina "Direito Penal" --secao comentados --consolidar
```

Use a **IA** quando o PDF for escaneado, layout quebrado, ou quando quiser limpeza editorial mais forte dos comentários.

---

## Prompt curto (versão resumida)

Se a IA tiver pouco contexto, use esta versão:

```text
Extraia SOMENTE as questões da seção EXERCÍCIOS COMENTADOS deste PDF de apostila de concurso.

Para cada questão devolva JSON com:
id_questao, disciplina, aula, banca, ano, fonte_questao, tipo (certo_errado|multipla_escolha),
enunciado, alternativa_A..E, gabarito_normalizado (C/E ou A-E), gabarito_original,
comentario_integral_apostila (explicação da apostila), status_extracao="REVISADA",
concurso="PC-AL 2026", cargo="Agente de Polícia", arquivo_origem, numero_apostila.

Regras:
- Não extrair teoria nem "exercícios para praticar".
- Não inventar gabarito nem comentário.
- CEBRASPE para CESPE/CEBRASPE.
- Limpar texto de PDF.
- Itens incompletos vão em "pendencias", não em "questoes".
- Saída: apenas JSON { questoes: [...], pendencias: [...] }.

Disciplina: ___ | Aula: ___ | Prefixo ID: PCAL-__-A__
```

---

## Mapeamento → abas do Excel DETONA

| Campo JSON | Aba Excel |
|------------|-----------|
| id_questao, enunciado, alternativas, gabarito_*, status_extracao, banca, ano, fonte… | **QUESTOES** |
| id_questao, comentario_integral_apostila, comentario_A…E | **COMENTARIOS** |
| pendencias[] | **PENDENCIAS** |

`status_extracao = "REVISADA"` → entra no app na importação normal (`importQuestionBanks.mjs`).

---

## Prefixo sugerido por disciplina

| Disciplina | Prefixo |
|------------|---------|
| Direito Penal | PCAL-DP |
| Direito Constitucional | PCAL-DC |
| Língua Portuguesa | PCAL-LP |
| Direitos Humanos | PCAL-DH |
| Raciocínio Lógico | PCAL-RLM |
| Estatística | PCAL-EST |
| Contabilidade | PCAL-CT |
| Análise de Dados | PCAL-AD |
| TI / Crimes Cibernéticos | PCAL-TI |
| Estatutos Servidores AL | PCAL-ESA |

ID final: `PCAL-DP-A00-0001` (prefixo + A + aula + sequência).
