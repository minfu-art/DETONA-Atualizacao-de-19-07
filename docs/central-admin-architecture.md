# Painel Central DETONA — arquitetura

## Diagnóstico anterior

O módulo administrativo era uma aba de `ui/forge.js`, renderizada pelo shell acadêmico.
Antes da autorização de `developer`, `app.js` exigia `activeContestId` e consultava
entitlement. Isso tornava a conta developer uma conta de aluno privilegiada e
inicializava banco local, seed, sincronização e player sem necessidade.

Acoplamentos removidos na fundação:

- item `forge` no menu da jornada;
- acesso administrativo condicionado a `activeContestId`;
- mensagens e acessos dentro da Forja;
- atalho editorial em `topicTree`;
- HUD de XP, nível e sequência para developer.

## Arquitetura-alvo

```text
Supabase Auth + profiles.role
├── student → index.html → biblioteca → entitlement → jornada acadêmica
└── developer → admin.html → AdminContext → serviços administrativos
                                      ├── admin-access (Edge Function)
                                      ├── announcements (RLS)
                                      └── módulos administrativos versionados
```

`activeContestId` permanece exclusivo do aluno. `adminSelectedContestId` é
mantido por `AdminContext` em `sessionStorage`, serve apenas como filtro e nunca
representa matrícula. A autorização não confia nesse valor: a role é lida do
profile remoto materializado pela sessão Supabase.

O Painel Central não importa nem utiliza `progressRepository`, não abre IndexedDB
acadêmico, não cria player, não executa onboarding e não sincroniza progresso.

## Compatibilidade

O catálogo estático continua sendo a fonte do aplicativo do aluno. Serviços
administrativos novos recebem `contestId` explicitamente e usam fallback
somente-leitura até que as migrations e Edge Functions sejam revisadas e
publicadas em uma fase operacional separada.
