# P0.1 — Fundação segura

## Escopo

Esta entrega corrige a fundação local de segurança, estabilidade e CI. Não inclui deploy, migration remota, Mercado Pago, redesign, alteração das regras acadêmicas ou remoção de questões.

## Problemas corrigidos

- pré-cache do service worker apontava para dois arquivos inexistentes;
- `cache.addAll` fazia uma falha isolada abortar toda a instalação;
- alunos autenticados podiam escrever nos próprios entitlements via RLS;
- o perfil permitia atualização ampla, inclusive de `role` e `enabled_modules`;
- ambiente comercial podia cair silenciosamente para autenticação, compra e entitlement locais;
- checkout demonstrativo não tinha trava de ambiente;
- validação antiga cobria 842 itens, não o índice publicado de 6.480;
- 407 questões usavam aliases editoriais conhecidos que não eram resolvidos pelo carregador;
- 16 testes estavam desalinhados com o acervo/UI atuais;
- não havia CI, validação de assets, sintaxe ou verificação automatizada de segredos.

## Desenvolvimento local

`APP_ENV=development` permite, de forma explícita:

- autenticação local em IndexedDB;
- migração legada e papel developer local;
- checkout demonstrativo;
- entitlement local;
- overrides de nuvem no `localStorage`.

O console registra `DESENVOLVIMENTO LOCAL` para reduzir o risco de confusão. Esse modo não representa controle comercial.

## Staging e produção

Com `APP_ENV=staging` ou `APP_ENV=production`:

- Supabase e `CLOUD_MODE=hybrid` são obrigatórios;
- configuração ausente falha de forma segura;
- não existe fallback para autenticação local;
- migração local não promove usuário a developer;
- entitlements são lidos do Supabase;
- checkout demo é bloqueado;
- nenhum entitlement comercial é gravado pelo frontend;
- sem gateway real, a tentativa de compra falha sem simular sucesso.

O guard da Forja continua sendo apenas conveniência de UI. A autoridade real é a RLS: o navegador não pode escrever entitlement nem papel remoto. A Forja ainda não é um painel administrativo completo.

## Migration 002

Arquivo: `supabase/migrations/002_security_hardening.sql`.

Decisões:

- remove `entitlements_write_own`;
- mantém leitura do próprio entitlement;
- revoga `INSERT/UPDATE/DELETE` de `authenticated` em `contest_entitlements`;
- reserva privilégios completos ao `service_role`;
- remove insert de perfil pelo cliente (o trigger de Auth cria a linha);
- combina RLS de linha com `GRANT UPDATE (name, preferences)`;
- impede atualização de `role`, `enabled_modules`, email e auditoria pelo aluno;
- restringe chamada direta da função privilegiada do trigger.

Aplicação futura, após backup e em homologação:

1. confirmar que `001_detona_schema.sql` já foi aplicada;
2. executar `002_security_hardening.sql` pelo pipeline/CLI autenticado do proprietário;
3. testar com usuário aluno: SELECT próprio funciona; UPDATE de nome/preferências funciona; mutações de role/módulos/entitlement falham;
4. testar pelo backend com service role: concessão e revogação funcionam;
5. auditar logs e só então promover para produção.

Nunca use `service_role` no navegador ou na Vercel como variável exposta ao cliente.

## Configuração e Vercel

Variáveis públicas necessárias no build:

- `APP_ENV`;
- `CLOUD_MODE`;
- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_JS_URL` (opcional).

Na Vercel, cadastre valores separados para Preview (`staging`) e Production (`production`). Configure o Root Directory como `app` e execute `npm run build:env` antes de publicar os arquivos estáticos. O script gera `env.runtime.js`, força `hybrid` fora de desenvolvimento, falha se URL/chave anon estiverem ausentes e recusa qualquer `SUPABASE_SERVICE_ROLE_KEY` presente no ambiente de build.

A Vercel não injeta automaticamente variáveis em JavaScript estático: o passo `build:env` é obrigatório. Não foi configurado nem executado deploy nesta sprint.

## Comandos de validação

Na raiz:

```text
npm run check:secrets
npm run check:syntax
npm run test:root
npm test
```

Em `app/`:

```text
npm ci
npm test
npm run validate:published-questions
npm run validate:pwa
npm audit
```

## Testes antes falhos

Classificação e tratamento:

- 9 expectativas editoriais desatualizadas: contagens fixas e nomes/origens anteriores à consolidação; substituídas por invariantes de índice, integração e IDs;
- 6 expectativas visuais obsoletas: atualizadas para a navegação, mapa, Home, desempenho e revisão vigentes;
- 1 regressão real: emoji de sistema no seletor de estudo substituído pelo ícone semântico existente;
- problemas editoriais: reportados em `PUBLISHED_QUESTIONS_REPORT.md`, sem apagar ou reescrever questões.

## CI

`.github/workflows/ci.yml` roda em todo push e em pull request para `main`. Instala dependências com lockfile, verifica segredos, sintaxe, testes do app e da raiz, banco publicado, assets PWA e vulnerabilidades de severidade alta ou crítica. Não faz deploy.

## Ações manuais futuras

Supabase:

- criar/confirmar projeto de homologação;
- aplicar migrations 001 e 002 em ordem;
- executar testes reais de RLS com aluno e service role;
- configurar confirmação e recuperação de e-mail;
- criar backend privilegiado para entitlement e futuro webhook.

Vercel:

- confirmar projeto, branch e Root Directory;
- cadastrar variáveis por ambiente;
- configurar `npm run build:env`;
- validar Preview antes de produção;
- confirmar headers, domínio e rollback.

## Limitações restantes

- não há gateway real, webhook ou conciliação financeira;
- recuperação de senha ainda não está implementada;
- progresso acadêmico continua calculado no cliente;
- gabaritos continuam presentes no bundle público;
- a migration só recebeu validação estática local;
- 396 questões permanecem em revisão editorial;
- grupos de enunciados comparáveis ainda precisam de curadoria;
- não há observabilidade, suporte LGPD ou painel administrativo server-side.

## Rollback

Código: reverta o commit `fix: harden P0 foundation` em uma nova branch com `git revert <hash>` e valide as suítes. Não use reset destrutivo.

Banco, após aplicação futura: não restaure a policy insegura. Se houver incompatibilidade, mantenha a escrita de entitlements bloqueada e crie uma migration posterior que ajuste apenas as permissões necessárias. Para perfis, uma migration de rollback pode restaurar UPDATE somente nas colunas estritamente indispensáveis; nunca libere `role` ou `enabled_modules` ao aluno.

## Próxima etapa recomendada

Criar homologação Supabase, aplicar/testar as migrations e implementar recuperação de senha mais um endpoint server-side mínimo para concessão manual auditada de entitlement PC/AL. Somente depois integrar checkout e webhook reais.
