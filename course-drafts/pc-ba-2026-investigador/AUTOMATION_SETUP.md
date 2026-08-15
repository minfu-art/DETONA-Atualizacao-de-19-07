# PC BA 2026 — Investigador — Geração cíclica do banco

Branch editorial dedicada: `content/pc-ba-2026-question-bank`.

Objetivo: gerar lotes incrementais de exatamente 10 questões, preservando o motor DETONA e o currículo canônico.

## Arquivos de entrada esperados

Antes da geração automática, esta branch deve conter os artefatos editoriais já produzidos localmente para PC BA Investigador, especialmente:

- `knowledge-map.bound.v2.json`
- `knowledge-coverage-matrix.v1.json`
- `knowledge-review-queue.json`
- arquivos de validação normativa/dinâmica aprovados quando aplicáveis
- currículo canônico e bindings necessários

## Arquivos do banco

A automação deve manter:

- banco cumulativo de questões;
- estado/cursor de geração;
- cobertura por microconhecimento;
- histórico imutável de lotes;
- relatório de cada ciclo.

## Regras

- 10 questões por ciclo;
- não apagar questões anteriores;
- IDs globais e `batch_id` sequenciais;
- toda questão permanece `draft` até QA editorial;
- não alterar PC AL;
- não publicar;
- não importar no Supabase;
- não alterar Mercado Pago/entitlements;
- não fazer deploy;
- não alterar IDs canônicos;
- conteúdo normativo/dinâmico somente com fonte validada;
- se os artefatos obrigatórios não estiverem disponíveis, parar com `BLOCKED:REQUIRED_INPUTS_MISSING` sem gerar conteúdo.

Base histórica da branch: `fix/p0-foundation` em `4951e9dc3451b9cd8ac5a53bfd81301e110ec164`.