# DETONA Curriculum Schema v1

O currículo enviado à Action é uma lista plana de nós:

```json
{
  "schema_version": 1,
  "contest_id": "concurso_2027",
  "nodes": [
    {"source_id":"cargo","parent_source_id":null,"type":"role","name":"Cargo","description":null,"order_index":0},
    {"source_id":"disciplina","parent_source_id":"cargo","type":"discipline","name":"Disciplina","description":null,"order_index":0},
    {"source_id":"topico","parent_source_id":"disciplina","type":"topic","name":"Tópico","description":null,"order_index":0},
    {"source_id":"subtopico","parent_source_id":"topico","type":"subtopic","name":"Subtópico","description":null,"order_index":0}
  ]
}
```

Hierarquia obrigatória: `role → discipline → topic → subtopic`. IDs são únicos, pais devem existir e todos os nós pertencem ao mesmo `contest_id`. Limite: 10.000 nós.
