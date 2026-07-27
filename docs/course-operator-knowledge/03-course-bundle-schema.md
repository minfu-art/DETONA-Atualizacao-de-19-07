# Course Bundle Schema v1

O bundle contém exatamente:

- `schema_version: 1`;
- `operation_id` único;
- `contest`;
- `curriculum`;
- `question_batches`;
- `assets`.

Estados seguros obrigatórios para criação:

```json
{
  "content_status": "preparing",
  "sales_status": "unavailable",
  "price_cents": 0,
  "currency": "BRL",
  "exam_date": null
}
```

`battle_avatar` é obrigatório. `success`, `error`, `attention` e `cover` são opcionais. Assets usam PNG/WebP e `content_base64`.
