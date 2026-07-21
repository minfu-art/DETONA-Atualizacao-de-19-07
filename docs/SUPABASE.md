# Supabase no DETONA CONCURSOS

Integração **fase 1**: autenticação na nuvem + sincronização de progresso, sem tirar o app do modo offline-first.

| Camada | Onde fica |
| --- | --- |
| Questões (catálogo) | JSON em `app/data/questions/` (Vercel) |
| Progresso offline | IndexedDB (SSOT de leitura) |
| Progresso na nuvem | Supabase `progress_records` + espelhos tipados |
| Auth local (padrão) | IndexedDB `DetonaConcursosAuthDB` |
| Auth nuvem | Supabase Auth + tabela `profiles` |

Por padrão **`CLOUD_MODE=off`**: nada muda para quem não configurar Supabase.

---

## 1. Criar o projeto Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** e execute o arquivo:

   `supabase/migrations/001_detona_schema.sql`

3. Em **Authentication → Providers**, deixe **Email** ativo.
4. (Opcional) Em **Authentication → Settings**, desative *Confirm email* durante testes locais.
5. Em **Settings → API**, copie:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`

Nunca use a **service_role** no frontend.

---

## 2. Ligar o app (modo hybrid)

Edite `app/js/config/env.js` (ou injete antes do bundle):

```html
<script>
  window.__DETONA_ENV__ = {
    SUPABASE_URL: 'https://xxxx.supabase.co',
    SUPABASE_ANON_KEY: 'eyJ...',
    CLOUD_MODE: 'hybrid'
  };
</script>
<script type="module" src="js/app.js?v=76"></script>
```

Ou, no console do navegador (dev):

```js
localStorage.setItem('detona.supabaseUrl', 'https://xxxx.supabase.co');
localStorage.setItem('detona.supabaseAnonKey', 'eyJ...');
localStorage.setItem('detona.cloudMode', 'hybrid');
location.reload();
```

### Variáveis

| Chave | Valores | Descrição |
| --- | --- | --- |
| `CLOUD_MODE` | `off` \| `hybrid` | Nuvem desligada ou auth+sync |
| `SUPABASE_URL` | URL | Projeto Supabase |
| `SUPABASE_ANON_KEY` | string | Chave pública (RLS) |

Arquivo de referência: `.env.example` na raiz do repositório.

---

## 3. O que a migração cria

### Tabelas principais

- **`profiles`** — perfil do aluno (`id` = `auth.users.id`)
- **`contest_entitlements`** — acesso a concursos (biblioteca)
- **`progress_records`** — SSOT na nuvem (coleção + chave + JSON), alinhado a `BACKUP_COLLECTIONS`
- Espelhos tipados (analytics): `players`, `subtopic_progress`, `daily_logs`, `review_queue`, `wellbeing_logs`, `routine_blocks`

### RLS

Todas as políticas filtram por `auth.uid() = user_id` (ou `id` em `profiles`). Um aluno só lê/escreve o próprio progresso.

### Trigger

`handle_new_user` cria linha em `profiles` ao registrar em `auth.users`.

---

## 4. Como o app se comporta

```
UI / services
    → ProgressRepository
        → hybrid adapter (se CLOUD_MODE=hybrid)
            → IndexedDB (sempre)
            → Supabase progress_records (online; outbox se offline)
    → CloudAwareAuthService
        → Supabase Auth (hybrid)
        → AuthService local (off)
```

1. **Login/cadastro** em hybrid usam e-mail/senha do Supabase.
2. Ao **abrir um concurso**, o app faz **pull** (merge last-write-wins) e drena a **outbox**.
3. Cada **put** local tenta **upsert** na nuvem; se offline, entra na outbox (`localStorage`).
4. Ao voltar **online**, `flushOutbox` reenvia.
5. Questões oficiais **não dependem** do Supabase nesta fase.

Debug no console:

```js
window.__DETONA.cloud.isEnabled()
window.__DETONA.authService.getAuthMode?.()
```

---

## 5. Migrar progresso local → nuvem

1. Use o app local normalmente (ou faça login cloud na mesma máquina após configurar).
2. Abra o concurso: o primeiro open sem `cloud_last_push_at` faz **push completo** do IndexedDB.
3. Em outro dispositivo: login com a mesma conta → pull restaura o progresso.

Se a confirmação de e-mail estiver ativa, o cadastro pode exigir clicar no link antes do login.

---

## 6. Vercel / deploy

O app é estático. Opções:

1. **Injetar** `window.__DETONA_ENV__` no `index.html` de produção (build step ou snippet no dashboard).
2. Commitar URL + **anon** key em `env.js` (aceitáveis no client; RLS protege os dados).
3. Manter `CLOUD_MODE=off` no deploy público até o projeto Supabase estar pronto.

Configure no Supabase **Authentication → URL Configuration**:

- Site URL: `https://seu-app.vercel.app`
- Redirect URLs: o mesmo domínio

---

## 7. Fases seguintes (não nesta entrega)

| Fase | Escopo |
| --- | --- |
| 2 | Catálogo de questões no Postgres + CDN/cache |
| 3 | Entitlements pagos (webhook Stripe/etc.) |
| 4 | Realtime / multi-device live |
| 5 | Painel admin com service role (servidor) |

---

## 8. Arquivos tocados

```
supabase/migrations/001_detona_schema.sql
app/js/config/env.js
app/js/config/cloudConfig.js
app/js/supabase/client.js
app/js/supabase/authAdapter.js
app/js/supabase/progressCloud.js
app/js/supabase/hybridProgressAdapter.js
app/js/supabase/syncService.js
app/js/supabase/collectionKeys.js
app/js/supabase/index.js
app/js/auth/cloudAuthService.js
app/js/repositories/progressRepository.js   # adapter hybrid opcional
app/js/services/appServices.js
app/js/app.js                               # sync ao abrir concurso
docs/SUPABASE.md
.env.example
```

---

## 9. Testes manuais rápidos

1. `CLOUD_MODE=off` → cadastro local, progresso só no IDB (regressão).
2. SQL da migração sem erros no projeto novo.
3. `CLOUD_MODE=hybrid` + credenciais → cadastro/login Supabase.
4. Batalha / meta diária online → linhas em `progress_records`.
5. DevTools offline → outbox cresce; online → drena.
6. Segundo browser / aba anônima → login → pull do progresso.
