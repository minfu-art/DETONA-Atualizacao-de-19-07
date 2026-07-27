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
    "options": ["Certo", "Errado"],
    "correct_answer": true,
    "explanation": "Explicação obrigatória.",
    "source": "fonte informada"
  }]
}
```

IDs não podem se repetir entre lotes. O subtópico deve existir no currículo do mesmo concurso. Questões entram somente como `draft`.
