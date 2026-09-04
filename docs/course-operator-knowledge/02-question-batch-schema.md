# Question Batch Schema

Cada lote possui nome e de 1 a 1.000 questões:

```json
{
  "name": "lote_001",
  "questions": [{
    "id": "questao_001",
    "contest_id": "concurso_2027",
    "subtopic_id": "subtopico",
    "statement": "Enunciado.",
    "reference_text": "Texto-base opcional.",
    "reference_image": "assets/question-references/figura-opcional.webp",
    "options": ["Certo", "Errado"],
    "correct_answer": true,
    "explanation": "Explicação obrigatória.",
    "source": "fonte informada"
  }]
}
```

IDs não podem se repetir entre lotes. O subtópico deve existir no currículo do mesmo concurso. Questões entram somente como `draft`.

`reference_text` e `reference_image` são opcionais. Quando houver figura, gráfico,
tabela ou texto-base indispensável, preserve o conteúdo no lote. A imagem deve
usar caminho relativo local, sem protocolo, barra inicial ou `..`.
