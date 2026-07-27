# DETONA Course Provisioner

## Objetivo

O Course Provisioner cria concursos por dados e arquivos, sem editar o motor acadêmico. Ele orquestra somente operações administrativas protegidas já existentes no Supabase staging.

## Arquitetura

```text
bundle local
  → validação estrutural e hashes
  → leitura do estado remoto
  → relatório e journal local
  → autorização humana por --mode apply
  → admin-contests
  → admin-media + upload assinado
  → admin-editorial
  → verificação independente
```

Nenhuma operação faz SQL direto. O provisionador não conhece regras de XP, domínio, batalha, revisão, rotina ou progresso.

## Comandos

```powershell
npm run course:provision -- --bundle "C:\bundles\novo-curso" --environment staging --mode validate
npm run course:provision -- --bundle "C:\bundles\novo-curso" --environment staging --mode apply
npm run course:provision -- --bundle "C:\bundles\novo-curso" --environment staging --mode verify
```

Flags restritas:

- `--allow-replace-draft`: permite substituir somente currículo divergente ainda não usado por pacote publicado;
- `--publish-appearance`: publica a aparência durante o `apply`; sem a flag, permanece em rascunho.

Produção e ambientes diferentes de `staging` são bloqueados.

## Bundle v1

Consulte [o template reutilizável](../templates/course-bundle-v1/README.md).

O provisionador processa lotes de questões em ordem alfabética, valida IDs globalmente entre lotes e nunca aprova, publica ou gera snapshot automaticamente.

## Autenticação

O processo exige:

```text
DETONA_SUPABASE_URL
DETONA_SUPABASE_ANON_KEY
DETONA_ADMIN_ACCESS_TOKEN
```

Como alternativa ao token temporário, podem ser definidas apenas durante a sessão:

```text
DETONA_ADMIN_EMAIL
DETONA_ADMIN_PASSWORD
```

Nesse caso, o provisionador usa o endpoint oficial de autenticação do Supabase e mantém o token somente em memória. A Edge Function confirma que o perfil possui `role = developer`.

O Project Ref autorizado por padrão é `folnsdtmaiksjqqsohjx`. Outro host Supabase é rejeitado antes de qualquer chamada.

## Idempotência e recuperação

`operation_id` identifica um journal em:

```text
%USERPROFILE%\.detona-course-provisioner
```

O journal não contém credenciais. Ele registra etapas, IDs administrativos e efeitos concluídos.

Além do journal, a idempotência é conferida pelo estado remoto:

- metadados do concurso;
- árvore curricular;
- IDs e conteúdo das questões;
- hashes e seleção dos assets;
- versões e pacotes existentes.

Uma repetição exata retorna `COURSE_PROVISION_ALREADY_APPLIED`. Conteúdo diferente com o mesmo `operation_id`, ou divergência remota, retorna `COURSE_PROVISION_CONFLICT`.

Após falha parcial, o próximo `apply` relê o estado remoto, reaproveita partes idênticas e continua somente o que estiver ausente. Nada é apagado automaticamente.

## Segurança operacional

- não existe suporte a produção;
- não existe publicação de pacote;
- questões entram como `draft`;
- aparência fica `draft` por padrão;
- currículo publicado não é substituído;
- nenhum entitlement é criado;
- nenhum segredo é salvo ou impresso;
- o estado Git dos diretórios protegidos é comparado antes e depois da execução;
- erros remotos são reduzidos a códigos sanitizados.

## Resultados

Validação:

- `COURSE_PROVISION_VALID`;
- `COURSE_PROVISION_INVALID`.

Aplicação e verificação:

- `COURSE_PROVISION_READY`;
- `COURSE_PROVISION_ALREADY_APPLIED`;
- `COURSE_PROVISION_PARTIAL`;
- `COURSE_PROVISION_CONFLICT`;
- `COURSE_PROVISION_BLOCKED`.
